/**
 * Routes promo - publik, mount di /api/v1/promo.
 *
 *   GET  /promo/media-types                    - katalog aktif (tanpa rate limit)
 *   GET  /promo/tenants?q=                     - cari tenant MID aktif (q >= 2 char)
 *   POST /promo/submit                        - kirim pengajuan (10 / 60 mnt / IP)
 *   GET  /promo/submissions/mine?fingerprint= - riwayat per perangkat (60 / 15 mnt / IP)
 *   GET  /promo/submissions/track?number=     - lacak via nomor pengajuan (60 / 15 mnt / IP + captcha)
 *   GET  /promo/submissions/status/:token     - status pengajuan via token (FR-019)
 *   POST /promo/submissions/:id/revision      - unggah ulang materi (Perlu Revisi)
 *
 * Envelope: GET → { success: true, data: ... }; POST → flat { success, id, ... }.
 * Server mengembalikan row snake_case; mapping camelCase hanya di FE.
 *
 * Alur status mengikuti server/src/lib/statusFlow.js; nomor pengajuan + token
 * dibuat server/src/lib/identifiers.js.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { enforceRateLimit, clientIp } from '../lib/rateLimit.js';
import { checkInstallationDate, toIsoDate } from '../lib/leadTime.js';
import { getDriveFile, MAX_UPLOAD_BYTES } from '../drive.js';
import { generateSubmissionNumber, generateStatusToken, generateBatchNumber } from '../lib/identifiers.js';
import { INITIAL_STATUS } from '../lib/statusFlow.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { PPN_RATE, hitungHarga, cekDurasiMinimal } from '../lib/pricing.js';

const router = Router();

// Helpers.
const MID_API_KEY = process.env.MID_API_KEY || '';
const MID_API_URL = 'https://apiloyalty.metropolitanland.com/getAllTenants';

/** Fail-closed bila kunci MID tidak dikonfigurasi. */
function midConfigured() {
  return Boolean(MID_API_KEY);
}

/** Fetch tenant aktif dari API loyalitas MID - tanpa PIC (pola app lama). */
async function fetchMidActiveTenants() {
  const resp = await fetch(MID_API_URL, {
    headers: { 'mid-api-key': MID_API_KEY },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) {
    const err = new Error(`MID upstream ${resp.status}`);
    err.code = 'UPSTREAM';
    throw err;
  }
  const json = await resp.json();
  const list = Array.isArray(json.data) ? json.data : [];
  return list
    .filter((t) => String(t.TENANT_STATUS ?? '').toLowerCase() === 'active')
    .map((t) => ({
      id: String(t.TENANT_ID ?? ''),
      name: String(t.TENANT_NAME ?? '').trim(),
      floor: String(t.TENANT_FLOOR ?? '').trim(),
      lot: String(t.TENANT_LOT ?? '').trim(),
      category: String(t.TENANT_CATEGORY ?? '').trim(),
    }))
    .filter((t) => t.id && t.name);
}

function sanitize(val, maxLen = 1000) {
  if (typeof val !== 'string') return '';
  return val.replace(/\0/g, '').trim().slice(0, maxLen);
}

const PHONE_RE = /^[+0-9][0-9\s-]{7,19}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Tautan materi (Google Drive/Dropbox/WeTransfer/dll) - http(s) saja. */
const LINK_RE = /^https?:\/\/[^\s]+$/i;

/** Kolom publik pengajuan - sengaja tanpa fingerprint/IP (metadata internal). */
const SUBMISSION_PUBLIC_COLUMNS = `
  id, submission_number, media_type_slug, tenant_name, unit_number,
  material_title, material_description, campaign_name, material_type, media_target,
  air_start_date, air_end_date, installation_date, notes,
  status, review_notes, status_changed_at, created_at, updated_at,
  source_type, file_url, file_name, link_url,
  applicant_type, submission_date, batch_id,
  price_amount::float8 AS price_amount, price_unit, ppn_included,
  ppn_rate::float8 AS ppn_rate, quantity, duration_days,
  subtotal::float8 AS subtotal, ppn_amount::float8 AS ppn_amount,
  total_amount::float8 AS total_amount`;

/**
 * Kolom publik yang dikualifikasi alias tabel.
 *
 * `SUBMISSION_PUBLIC_COLUMNS` sengaja dibiarkan TANPA alias karena dipakai
 * jalur publik satu-tabel (`/submissions/status/:token`, `/submissions/track`,
 * `/batches/status/:token`). Begitu `promo_submissions` di-join dengan
 * `promo_submission_batches`, sebelas nama kolom ada di KEDUA tabel (`id`,
 * `tenant_id`, `unit_number`, `pic_name`, `pic_phone`, `submission_date`,
 * `notes`, `device_fingerprint`, `ip_address`, `user_agent`, `created_at`,
 * `updated_at`, `applicant_type`), sehingga Postgres menolak query dengan
 * 42702 "column reference is ambiguous". Kualifikasi dibangun di sini supaya
 * konstanta bersama itu tidak ikut berubah dan jalur lain tetap utuh.
 *
 * Semua entri konstanta berbentuk `kolom` atau `ekspresi AS alias`; keduanya
 * sah diberi prefiks alias (`s.price_amount::float8 AS price_amount`).
 */
function qualifyColumns(alias, columns) {
  return columns
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `${alias}.${c}`)
    .join(', ');
}

/** Kolom publik untuk jalur ber-join (`s` = promo_submissions). */
const SUBMISSION_PUBLIC_COLUMNS_S = qualifyColumns('s', SUBMISSION_PUBLIC_COLUMNS);

/** Nomor pengajuan yang dilacak tenant - normalisasi ke bentuk kanonis. */
const SUBMISSION_NUMBER_RE = /^MP-\d{6}-[0-9A-Z]{6}$/;

/** Normalisasi input nomor pengajuan (huruf besar, tanpa spasi) untuk dibandingkan. */
function normalizeSubmissionNumber(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase().slice(0, 32);
}

/**
 * Muat satu pengajuan beserta riwayat, versi materi, dan pemasangan.
 *
 * Dipakai bersama oleh halaman status ber-token dan pelacakan via nomor
 * pengajuan supaya kedua jalur publik menampilkan bentuk yang identik.
 *
 * @returns {Promise<object|null>} null bila pengajuan tidak ada.
 */
async function loadSubmissionDetail(submission) {
  const [historyRes, filesRes, installRes] = await Promise.all([
    db.query(
      `SELECT id, submission_id, from_status, to_status, comment, actor_type,
              actor_name, actor_id, created_at
       FROM promo_submission_history WHERE submission_id = $1
       ORDER BY created_at ASC`,
      [submission.id],
    ),
    db.query(
      `SELECT id, submission_id, version, source_type, file_url, file_name,
              mime_type, file_size_bytes, link_url, drive_file_id, uploaded_by,
              notes, created_at
       FROM promo_submission_files WHERE submission_id = $1
       ORDER BY version DESC`,
      [submission.id],
    ),
    db.query(
      `SELECT id, submission_id, media_location, start_date, end_date, notes,
              proof_url, proof_kind, proof_file_id, proof_file_url, proof_file_name,
              proof_mime, proof_size_bytes, proof_uploaded_by, proof_uploaded_at,
              installed_by, installed_by_id, created_at, updated_at
       FROM promo_installations WHERE submission_id = $1 LIMIT 1`,
      [submission.id],
    ),
  ]);

  return {
    submission,
    history: historyRes.rows,
    files: filesRes.rows,
    installation: installRes.rows[0] || null,
  };
}

/** Pesan seragam untuk pengajuan tak ditemukan - jangan bocorkan mana yang ada. */
const NOT_FOUND_MESSAGE =
  'Pengajuan tidak ditemukan. Periksa kembali nomor atau tautan status Anda.';

/**
 * Verifikasi materi dari klien (FR-008..FR-015) dan tentukan mode sumbernya.
 *
 * Server TIDAK memercayai klaim klien pada mode unggah: nama/MIME/ukuran
 * diambil dari metadata Drive. Mode tautan hanya menerima URL http(s).
 *
 * @returns {{ok: true, material: object} | {ok: false, status: number, error?: string, errors?: string[]}}
 */
async function resolveMaterial({ linkUrl, driveFileId, fileName, mimeType }) {
  const sourceType = linkUrl && !driveFileId ? 'link' : 'upload';

  if (sourceType === 'link') {
    if (!LINK_RE.test(linkUrl)) {
      return { ok: false, status: 400, errors: ['Tautan materi harus berupa URL http/https yang valid'] };
    }
    return {
      ok: true,
      material: {
        sourceType: 'link', linkUrl, driveFileId: '',
        fileUrl: '', fileName, mimeType, size: 0,
      },
    };
  }

  if (!driveFileId) {
    return { ok: false, status: 400, errors: ['drive_file_id wajib diisi'] };
  }

  // Anti klaim duplikat: satu objek Drive = satu pengajuan.
  const { rows: dupeRows } = await db.query(
    'SELECT id FROM promo_submissions WHERE drive_file_id = $1 LIMIT 1',
    [driveFileId],
  );
  if (dupeRows[0]) {
    return { ok: false, status: 400, error: 'File sudah dipakai pengajuan lain.' };
  }

  const file = await getDriveFile(driveFileId);
  if (!file.ok) return { ok: false, status: 400, error: file.error };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, status: 400, error: 'File melebihi 50MB' };

  return {
    ok: true,
    material: {
      sourceType: 'upload', linkUrl: '', driveFileId,
      fileUrl: file.webViewLink, fileName: file.name,
      mimeType: file.mimeType, size: file.size,
    },
  };
}

/** Tulis satu baris versi materi; `version` = nomor versi baris ini. */
async function insertFileVersion(client, submissionId, material, { version, uploadedBy, notes }) {
  await client.query(
    `INSERT INTO promo_submission_files
      (submission_id, version, source_type, file_url, file_name, mime_type,
       file_size_bytes, link_url, drive_file_id, uploaded_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      submissionId, version, material.sourceType, material.fileUrl, material.fileName,
      material.mimeType, material.size, material.linkUrl, material.driveFileId,
      uploadedBy, notes,
    ],
  );
}

/** Catat satu transisi status ke riwayat. */
async function insertHistory(client, { submissionId, fromStatus, toStatus, comment, actorType, actorName, actorId }) {
  await client.query(
    `INSERT INTO promo_submission_history
      (submission_id, from_status, to_status, comment, actor_type, actor_name, actor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [submissionId, fromStatus, toStatus, comment, actorType, actorName, actorId || null],
  );
}

// GET /promo/media-types - katalog aktif.
// `?channel=cetak|digital` bersifat ADITIF: tanpa parameter perilakunya persis
// seperti sebelumnya (landing tidak berubah); dengan parameter, katalog
// disaring per kanal. Nilai divalidasi terhadap daftar (bukan interpolasi).
const MEDIA_CHANNELS = ['cetak', 'digital'];

router.get('/media-types', async (req, res, next) => {
  try {
    const channel = sanitize(req.query?.channel || '', 20);
    const where = ['is_active = true'];
    const values = [];
    if (channel) {
      if (!MEDIA_CHANNELS.includes(channel)) {
        return res.status(400).json({ success: false, error: 'Kanal media tidak dikenal.' });
      }
      values.push(channel);
      where.push(`media_channel = $${values.length}`);
    }

    const { rows } = await db.query(
      `SELECT slug, category, name, size_spec, material_spec, accepted_formats,
              price_note, location_note, rules, image_path, sort_order,
              media_channel, price_amount::float8 AS price_amount,
              price_unit, ppn_included
       FROM promo_media_types
       WHERE ${where.join(' AND ')}
       ORDER BY sort_order, name`,
      values,
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
});

// GET /promo/tenants - pencarian tenant MID.
router.get('/tenants', async (req, res, next) => {
  const q = String(req.query?.q || '').trim().toLowerCase();
  if (q.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Query pencarian minimal 2 karakter',
      data: [],
    });
  }
  // 30 pencarian / 15 mnt / IP.
  if (!enforceRateLimit(req, res, 'mid-search', 30, 15 * 60 * 1000)) return;
  if (!midConfigured()) {
    return res.status(500).json({ success: false, error: 'Konfigurasi server tidak lengkap' });
  }

  try {
    const list = await fetchMidActiveTenants();
    // Cocokkan nama ATAU nomor unit/lot (FR-004).
    const tenants = list
      .filter((t) => t.name.toLowerCase().includes(q) || String(t.lot).toLowerCase().includes(q))
      .slice(0, 50);
    return res.json({ success: true, data: tenants });
  } catch (err) {
    console.error('[promo/tenants]', err);
    if (err?.code === 'UPSTREAM') return res.status(502).json({ success: false, error: 'Gagal mengambil data tenant' });
    return res.status(500).json({ success: false, error: 'Gagal mengambil data tenant' });
  }
});

// POST /promo/submit - publik.
router.post('/submit', async (req, res, next) => {
  // 10 pengajuan / 60 mnt / IP.
  if (!enforceRateLimit(req, res, 'promo-submit', 10, 60 * 60 * 1000)) return;

  const body = req.body || {};
  const errors = [];

  const mediaTypeSlug = sanitize(body.media_type_slug || '', 60);
  const tenantId = sanitize(body.tenant_id || '', 100);
  const tenantName = sanitize(body.tenant_name || '', 100);
  const unitNumber = sanitize(body.unit_number || '', 50);
  const picName = sanitize(body.pic_name || '', 100);
  const picPhone = sanitize(body.pic_phone || '', 20);
  const campaignName = sanitize(body.campaign_name || '', 150);
  const materialTitle = sanitize(body.material_title || '', 200);
  const materialDescription = sanitize(body.material_description || '', 2000);
  const materialType = sanitize(body.material_type || '', 60);
  const mediaTarget = sanitize(body.media_target || '', 200);
  const airStartDate = sanitize(body.air_start_date || '', 10);
  const airEndDate = sanitize(body.air_end_date || '', 10);
  const installationDate = sanitize(body.installation_date || '', 10);
  const termsAccepted = body.terms_accepted === true;
  const notes = sanitize(body.notes || '', 1000);
  const driveFileId = sanitize(body.drive_file_id || '', 128);
  const fileName = sanitize(body.file_name || '', 200);
  const mimeType = sanitize(body.mime_type || '', 100);
  const fingerprint = sanitize(body.device_fingerprint || '', 100);
  const linkUrl = sanitize(body.link_url || '', 500);

  if (!mediaTypeSlug) errors.push('media_type_slug wajib diisi');
  if (!tenantName) errors.push('Nama tenant wajib diisi');
  if (!picName) errors.push('Nama PIC wajib diisi');
  if (!picPhone) errors.push('Nomor telepon PIC wajib diisi');
  else if (!PHONE_RE.test(picPhone)) errors.push('Format nomor telepon tidak valid');
  if (!campaignName) errors.push('Nama campaign wajib diisi');
  if (!materialTitle) errors.push('Judul materi wajib diisi');
  if (!materialDescription) errors.push('Deskripsi materi wajib diisi');
  if (!materialType) errors.push('Jenis materi wajib diisi');
  if (!mediaTarget) errors.push('Media atau lokasi pemasangan wajib diisi');
  if (installationDate && !DATE_RE.test(installationDate)) errors.push('installation_date harus format YYYY-MM-DD');
  if (airStartDate && !DATE_RE.test(airStartDate)) errors.push('air_start_date harus format YYYY-MM-DD');
  if (airEndDate && !DATE_RE.test(airEndDate)) errors.push('air_end_date harus format YYYY-MM-DD');
  if (airStartDate && airEndDate && airEndDate < airStartDate) errors.push('Periode tayang berakhir sebelum tanggal mulai');
  if (!termsAccepted) errors.push('Persetujuan ketentuan wajib dicentang');
  // Wajib: tanpa ini klien cukup mengosongkan fingerprint untuk melewati batas
  // 5 pengajuan / 24 jam per perangkat di bawah. Sama dengan syarat revisi.
  if (!fingerprint) errors.push('Fingerprint perangkat wajib diisi');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    // Media type harus ada & aktif.
    const { rows: mtRows } = await db.query(
      'SELECT slug, accepted_formats, rules, media_channel FROM promo_media_types WHERE slug = $1 AND is_active = true LIMIT 1',
      [mediaTypeSlug],
    );
    if (!mtRows[0]) {
      return res.status(400).json({ success: false, error: 'Jenis media promosi tidak dikenal atau tidak aktif.' });
    }

    // Cermin penegakan di `loadCetakMedia` (POST /promo/submit-batch): endpoint
    // ini melayani kanal DIGITAL saja. Media berkanal 'cetak' (spanduk,
    // big-banner, umbul-umbul) tidak meminta berkas materi di formnya, jadi
    // tenant yang tersasar ke sini akan diminta mengunggah materi yang
    // seharusnya menyusul lewat revisi.
    //
    // Fail-safe: tolak HANYA bila kanalnya PERSIS 'cetak'. Baris katalog
    // warisan yang tidak mengisi `media_channel` (kosong/undefined) tetap
    // diterima, sama seperti sebelum penegakan ini ada.
    if (mtRows[0].media_channel === 'cetak') {
      return res.status(400).json({
        success: false,
        error: 'Media ini diajukan lewat form Media Promosi Cetak (/ajukan-cetak) karena materinya menyusul lewat revisi. Silakan lanjutkan pengajuan Anda di sana.',
      });
    }

    // Lead time: materi harus diterima N hari sebelum pasang (aturan per media
    // diturunkan dari teks `rules` - kalender atau hari kerja, lihat lib/leadTime.js).
    const leadCheck = checkInstallationDate(
      installationDate, mtRows[0].rules || '', toIsoDate(),
    );
    if (!leadCheck.ok) {
      return res.status(400).json({ success: false, errors: [leadCheck.message] });
    }

    const materialResult = await resolveMaterial({ linkUrl, driveFileId, fileName, mimeType });
    if (!materialResult.ok) {
      return res.status(materialResult.status).json({
        success: false,
        ...(materialResult.errors ? { errors: materialResult.errors } : { error: materialResult.error }),
      });
    }
    const material = materialResult.material;

    // Anti-spam per perangkat: maks 5 pengajuan / 24 jam.
    if (fingerprint) {
      const { rows: fpRows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM promo_submissions
         WHERE device_fingerprint = $1 AND created_at > now() - interval '24 hours'`,
        [fingerprint],
      );
      if ((fpRows[0]?.n || 0) >= 5) {
        return res.status(429).json({ success: false, error: 'Terlalu banyak pengajuan dari perangkat ini. Coba lagi besok.' });
      }
    }

    // Nomor + token dibuat acak; unique index menegakkan keunikan, bentrok → ulang.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const submissionNumber = generateSubmissionNumber();
      const statusToken = generateStatusToken();
      try {
        const { rows } = await db.query(
          `INSERT INTO promo_submissions
            (submission_number, status_token, media_type_slug, tenant_id, tenant_name,
             unit_number, pic_name, pic_phone, campaign_name, material_title,
             material_description, material_type, media_target, air_start_date,
             air_end_date, installation_date, terms_accepted, notes, source_type,
             file_url, file_name, mime_type, link_url, file_size_bytes, drive_file_id,
             status, status_changed_at, device_fingerprint, ip_address, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                   $20,$21,$22,$23,$24,$25,$26, now(), $27,$28,$29)
           RETURNING id, submission_number, status_token, created_at`,
          [
            submissionNumber, statusToken, mediaTypeSlug, tenantId, tenantName,
            unitNumber, picName, picPhone, campaignName, materialTitle,
            materialDescription, materialType, mediaTarget, airStartDate,
            airEndDate, installationDate, termsAccepted, notes, material.sourceType,
            material.fileUrl, material.fileName, material.mimeType, material.linkUrl,
            material.size, material.driveFileId, INITIAL_STATUS, fingerprint,
            clientIp(req), sanitize(req.headers['user-agent'] || '', 500),
          ],
        );
        const row = rows[0];

        // Versi 1 materi + baris riwayat pembuka (status awal).
        await insertFileVersion(db, row.id, material, { version: 1, uploadedBy: 'tenant', notes: '' });
        await insertHistory(db, {
          submissionId: row.id,
          fromStatus: '',
          toStatus: INITIAL_STATUS,
          comment: 'Pengajuan dikirim tenant',
          actorType: 'tenant',
          actorName: picName,
        });

        return res.status(201).json({
          success: true,
          id: row.id,
          submission_number: row.submission_number,
          status_token: row.status_token,
          status: INITIAL_STATUS,
          created_at: row.created_at,
        });
      } catch (err) {
        // 23505 = unique_violation (nomor/token bentrok) → coba nomor baru.
        if (err?.code === '23505' && attempt < 4) continue;
        throw err;
      }
    }
    return res.status(500).json({ success: false, error: 'Gagal membuat nomor pengajuan. Coba lagi.' });
  } catch (err) {
    return next(err);
  }
});

// GET /promo/submissions/mine - riwayat per perangkat.
//
// Token status ikut dikirim karena akses endpoint ini sudah digerbangi
// fingerprint perangkat: tanpa token, tenant yang kehilangan tautan status
// tidak punya jalan ke form revisi meski pengajuannya ada di riwayat ini.
//
// `batch_number` + `batch_token` menyusul dengan alasan yang SAMA PERSIS, dan
// berada di batas kepercayaan yang sama: satu batch ditulis oleh SATU
// perangkat dalam satu kali kirim (`POST /promo/submit-batch` mengisi
// `device_fingerprint` batch dari body yang sama dengan seluruh item fan-out),
// jadi setiap baris yang cocok dengan `device_fingerprint = $1` di sini pasti
// berasal dari batch yang dikirim perangkat itu sendiri. Tanpa keduanya,
// tenant yang mengirim 5 media dalam satu batch hanya melihat 5 kartu terpisah
// dan tidak punya jalan kembali ke `/batch/<batch_token>` setelah meninggalkan
// layar sukses wizard. Keduanya SENGAJA hanya ada di endpoint ini: jalur publik
// lain (`/submissions/status/:token`, `/submissions/track`,
// `/batches/status/:token`) tetap memakai `SUBMISSION_PUBLIC_COLUMNS` apa
// adanya dan tidak pernah memuat token batch.
router.get('/submissions/mine', async (req, res, next) => {
  // Respons memuat status_token rahasia; batasi laju agar tidak bisa dipakai
  // menebak fingerprint perangkat lain (60 / 15 mnt / IP, sama dengan status).
  if (!enforceRateLimit(req, res, 'promo-mine', 60, 15 * 60 * 1000)) return;

  const fingerprint = String(req.query?.fingerprint || '').trim();
  if (!fingerprint) {
    return res.status(400).json({ success: false, error: 'Fingerprint perangkat wajib diisi.' });
  }
  // Paginasi ADITIF: `?offset=<n>` memuat halaman berikutnya. Tanpa `offset`
  // nilainya 0, jadi bentuk query dan parameter TETAP SAMA seperti sebelum
  // paginasi ada (pemanggil lama dan test lama tidak berubah). Nilai cacat
  // (negatif/bukan angka) mundur ke 0, dan karena sudah dipaksa integer ia
  // ditulis sebagai literal angka, bukan parameter bind.
  const offset = Math.max(0, parseInt(String(req.query?.offset ?? '0'), 10) || 0);
  try {
    // `total` = jumlah SELURUH pengajuan perangkat ini, sehingga klien tahu
    // apakah masih ada sisa tanpa menebak dari panjang halaman. Dijalankan
    // SEBELUM query daftar supaya SQL daftar tetap menjadi panggilan terakhir
    // (kontrak yang dibaca `__tests__/api/promo-mine-batch.test.js`).
    const { rows: countRows } = await db.query(
      `SELECT count(*)::int AS n FROM promo_submissions WHERE device_fingerprint = $1`,
      [fingerprint],
    );
    const total = countRows[0]?.n || 0;

    // Kolom batch diambil SATU PER SATU, tidak lewat `b.*`: tabel batch
    // bertabrakan nama dengan `promo_submissions` pada 13 kolom (id, tenant_id,
    // unit_number, pic_name, pic_phone, submission_date, notes,
    // device_fingerprint, ip_address, user_agent, created_at, updated_at,
    // applicant_type), sehingga `b.*` akan menimpa nilai pengajuan dengan nilai
    // batch pada kunci JSON yang sama. Alias `s` wajib: tanpa itu `created_at`
    // dan `id` di `SUBMISSION_PUBLIC_COLUMNS` menjadi ambigu begitu di-join.
    // `batch_item_count` = jumlah SELURUH baris batch, dihitung di server lewat
    // subquery yang TIDAK ikut dibatasi `LIMIT`/`OFFSET`: keduanya memotong
    // daftar pengajuan per perangkat, bukan isi batch, sehingga tenant dengan
    // lebih dari 50 pengajuan tetap melihat angka yang benar (klien dulu
    // menghitung dari baris yang termuat saja, jadi bisa kurang dari kenyataan).
    const { rows } = await db.query(
      `SELECT ${SUBMISSION_PUBLIC_COLUMNS_S}, s.status_token,
              b.batch_number, b.batch_token,
              (SELECT count(*)::int FROM promo_submissions x WHERE x.batch_id = s.batch_id)
                AS batch_item_count
       FROM promo_submissions s
       LEFT JOIN promo_submission_batches b ON b.id = s.batch_id
       WHERE s.device_fingerprint = $1
       ORDER BY s.created_at DESC
       LIMIT 50 OFFSET ${offset}`,
      [fingerprint],
    );
    // `total` + `offset` dikirim di samping `data` (envelope paginasi yang sama
    // dengan `/admin/submissions`: `{ success, data, total, ... }`).
    return res.json({ success: true, data: rows, total, offset });
  } catch (err) {
    return next(err);
  }
});

// GET /promo/submissions/track?number= - lacak via nomor pengajuan.
// Jalur kedua bagi tenant tanpa tautan: cukup masukkan nomor `MP-YYMMDD-XXXXXX`
// yang tercetak di layar sukses. Nomor memang bukan rahasia (dibacakan ke PIC),
// jadi gerbangnya bukan kerahasiaan melainkan captcha Cloudflare Turnstile +
// rate limit, agar endpoint tidak bisa dipakai memanen data massal.
router.get('/submissions/track', async (req, res, next) => {
  if (!enforceRateLimit(req, res, 'status-lookup', 60, 15 * 60 * 1000)) return;

  const number = normalizeSubmissionNumber(req.query?.number);
  if (!number) {
    return res.status(400).json({ success: false, error: 'Nomor pengajuan wajib diisi.' });
  }
  if (!SUBMISSION_NUMBER_RE.test(number)) {
    return res.status(400).json({
      success: false,
      error: 'Format nomor pengajuan tidak valid. Contoh: MP-260918-A7K2QX.',
    });
  }

  try {
    // Captcha diverifikasi setelah format nomor lolos (panggilan Siteverify
    // tidak terbuang untuk input cacat) dan sebelum DB disentuh. `action`
    // dikunci ke 'track' agar token dari widget permukaan lain tak bisa dipakai
    // ulang di sini.
    const captcha = await verifyTurnstile(req.query?.captcha, {
      remoteip: clientIp(req),
      action: 'track',
    });
    if (!captcha.ok) {
      return res.status(captcha.status || 400).json({ success: false, error: captcha.error });
    }

    const { rows } = await db.query(
      `SELECT ${SUBMISSION_PUBLIC_COLUMNS}
       FROM promo_submissions WHERE submission_number = $1 LIMIT 1`,
      [number],
    );
    const submission = rows[0] || null;
    if (!submission) {
      return res.status(404).json({ success: false, error: NOT_FOUND_MESSAGE });
    }

    return res.json({ success: true, data: await loadSubmissionDetail(submission) });
  } catch (err) {
    return next(err);
  }
});

// GET /promo/submissions/status/:token - halaman status PIC.
// Token status adalah kredensial tautan (FR-018..FR-022); rate limit ketat agar
// token tidak bisa di-brute force.
router.get('/submissions/status/:token', async (req, res, next) => {
  if (!enforceRateLimit(req, res, 'status-lookup', 60, 15 * 60 * 1000)) return;

  const token = sanitize(req.params?.token || '', 100);
  if (!token) return res.status(400).json({ success: false, error: 'Token status wajib diisi.' });

  try {
    const { rows } = await db.query(
      `SELECT ${SUBMISSION_PUBLIC_COLUMNS}
       FROM promo_submissions WHERE status_token = $1 LIMIT 1`,
      [token],
    );
    const submission = rows[0] || null;
    // Pesan seragam untuk token salah - jangan bocorkan token mana yang ada.
    if (!submission) {
      return res.status(404).json({ success: false, error: NOT_FOUND_MESSAGE });
    }

    return res.json({ success: true, data: await loadSubmissionDetail(submission) });
  } catch (err) {
    return next(err);
  }
});

// POST /promo/submissions/:id/revision - unggah ulang materi.
// FR-015/FR-021 + AC 11.3: hanya saat status Perlu Revisi; versi baru disimpan
// sebagai versi terbaru, versi lama tetap ada untuk admin; status kembali ke
// Menunggu Review.
router.post('/submissions/:id/revision', async (req, res, next) => {
  if (!enforceRateLimit(req, res, 'promo-revision', 10, 60 * 60 * 1000)) return;

  const id = sanitize(req.params?.id || '', 100);
  const body = req.body || {};
  const fingerprint = sanitize(body.device_fingerprint || '', 100);
  const linkUrl = sanitize(body.link_url || '', 500);
  const driveFileId = sanitize(body.drive_file_id || '', 128);
  const fileName = sanitize(body.file_name || '', 200);
  const mimeType = sanitize(body.mime_type || '', 100);
  const revisionNotes = sanitize(body.notes || '', 1000);

  if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });
  if (!fingerprint) return res.status(400).json({ success: false, error: 'Fingerprint perangkat wajib diisi.' });

  try {
    // Kepemilikan ditegakkan lewat fingerprint perangkat pengirim (AC 11.3).
    const { rows } = await db.query(
      `SELECT id, status, status_token, device_fingerprint, source_type
       FROM promo_submissions WHERE id = $1 LIMIT 1`,
      [id],
    );
    const submission = rows[0] || null;
    if (!submission) return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan.' });
    if (submission.device_fingerprint !== fingerprint) {
      return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan.' });
    }
    if (submission.status !== 'perlu_revisi') {
      return res.status(400).json({
        success: false,
        error: 'Revisi hanya dapat dikirim ketika status materi Perlu Revisi.',
      });
    }

    const materialResult = await resolveMaterial({ linkUrl, driveFileId, fileName, mimeType });
    if (!materialResult.ok) {
      return res.status(materialResult.status).json({
        success: false,
        ...(materialResult.errors ? { errors: materialResult.errors } : { error: materialResult.error }),
      });
    }
    const material = materialResult.material;

    const { rows: verRows } = await db.query(
      'SELECT COALESCE(MAX(version), 0)::int AS v FROM promo_submission_files WHERE submission_id = $1',
      [id],
    );
    const nextVersion = (verRows[0]?.v || 0) + 1;

    await db.query(
      `UPDATE promo_submissions
       SET source_type = $1, file_url = $2, file_name = $3, mime_type = $4,
           link_url = $5, file_size_bytes = $6, drive_file_id = $7,
           status = $8, status_changed_at = now(), updated_at = now()
       WHERE id = $9`,
      [
        material.sourceType, material.fileUrl, material.fileName, material.mimeType,
        material.linkUrl, material.size, material.driveFileId,
        INITIAL_STATUS, id,
      ],
    );
    await insertFileVersion(db, id, material, { version: nextVersion, uploadedBy: 'tenant', notes: revisionNotes });
    await insertHistory(db, {
      submissionId: id,
      fromStatus: 'perlu_revisi',
      toStatus: INITIAL_STATUS,
      comment: revisionNotes || 'Materi revisi dikirim tenant',
      actorType: 'tenant',
      actorName: '',
    });

    return res.json({
      success: true,
      id,
      version: nextVersion,
      status: INITIAL_STATUS,
      status_token: submission.status_token,
    });
  } catch (err) {
    return next(err);
  }
});

// BATCH CETAK (multi-media dalam satu kirim).
//
// Satu kirim form cetak = satu baris `promo_submission_batches` + N baris
// `promo_submissions` (fan-out). Tiap baris tetap SINGLE-MEDIA seperti alur
// lama, sehingga alur status, pemasangan, revisi, dan pengingat tidak perlu
// diubah. `source_type` = 'none' karena form cetak tidak meminta berkas materi
// (materi menyusul lewat alur revisi); baris versi materi hanya ditulis bila
// tenant benar-benar melampirkan tautan/berkas.

/** Batas jumlah media dalam satu batch (keputusan sementara; lihat dokumen). */
const MAX_BATCH_ITEMS = 10;

/** Format nomor batch - dipakai endpoint pelacakan. */
const BATCH_NUMBER_RE = /^MPB-\d{6}-[0-9A-Z]{6}$/;

/** Ambil media aktif berkanal cetak untuk slug-slug terpilih (satu query). */
async function loadCetakMedia(slugs) {
  if (slugs.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT slug, name, rules, price_amount::float8 AS price_amount, price_unit, ppn_included
       FROM promo_media_types
      WHERE slug = ANY($1::text[]) AND is_active = true AND media_channel = 'cetak'`,
    [slugs],
  );
  return new Map(rows.map((r) => [r.slug, r]));
}

// POST /promo/submit-batch - publik (media cetak).
router.post('/submit-batch', async (req, res, next) => {
  // Bucket SAMA dengan /submit: satu perangkat tidak bisa memutar dua endpoint
  // untuk menggandakan kuota.
  if (!enforceRateLimit(req, res, 'promo-submit', 10, 60 * 60 * 1000)) return;

  const body = req.body || {};
  const errors = [];

  const applicantType = sanitize(body.applicant_type || '', 20);
  const tenantId = sanitize(body.tenant_id || '', 100);
  const tenantName = sanitize(body.tenant_name || '', 100);
  const unitNumber = sanitize(body.unit_number || '', 50);
  const picName = sanitize(body.pic_name || '', 100);
  const picPhone = sanitize(body.pic_phone || '', 20);
  const submissionDate = sanitize(body.submission_date || '', 10);
  const notes = sanitize(body.notes || '', 1000);
  const fingerprint = sanitize(body.device_fingerprint || '', 100);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!['tenant', 'non_tenant'].includes(applicantType)) {
    errors.push('Jenis pemohon wajib dipilih: tenant atau non-tenant');
  }
  if (!tenantName) errors.push(applicantType === 'non_tenant' ? 'Nama non tenant wajib diisi' : 'Nama tenant wajib diisi');
  if (!picName) errors.push('Nama pemohon wajib diisi');
  if (!picPhone) errors.push('Nomor telepon wajib diisi');
  else if (!PHONE_RE.test(picPhone)) errors.push('Format nomor telepon tidak valid');
  if (submissionDate && !DATE_RE.test(submissionDate)) errors.push('Tanggal pengajuan harus format YYYY-MM-DD');
  if (!fingerprint) errors.push('Fingerprint perangkat wajib diisi');
  if (items.length === 0) errors.push('Pilih minimal satu media promosi');
  if (items.length > MAX_BATCH_ITEMS) errors.push(`Maksimal ${MAX_BATCH_ITEMS} media dalam satu pengajuan`);

  const normalized = items.map((raw) => ({
    media_type_slug: sanitize(raw?.media_type_slug || '', 60),
    media_target: sanitize(raw?.media_target || '', 200),
    installation_date: sanitize(raw?.installation_date || '', 10),
    air_start_date: sanitize(raw?.air_start_date || '', 10),
    air_end_date: sanitize(raw?.air_end_date || '', 10),
    quantity: Math.max(1, Math.trunc(Number(raw?.quantity) || 1)),
    link_url: sanitize(raw?.link_url || '', 500),
    drive_file_id: sanitize(raw?.drive_file_id || '', 128),
    file_name: sanitize(raw?.file_name || '', 200),
    mime_type: sanitize(raw?.mime_type || '', 100),
  }));

  for (const [i, it] of normalized.entries()) {
    const label = `Media ke-${i + 1}`;
    if (!it.media_type_slug) errors.push(`${label}: jenis media wajib diisi`);
    if (!it.media_target) errors.push(`${label}: lokasi pemasangan wajib diisi`);
    for (const [key, val] of [['installation_date', it.installation_date], ['air_start_date', it.air_start_date], ['air_end_date', it.air_end_date]]) {
      if (val && !DATE_RE.test(val)) errors.push(`${label}: ${key} harus format YYYY-MM-DD`);
    }
    if (it.air_start_date && it.air_end_date && it.air_end_date < it.air_start_date) {
      errors.push(`${label}: periode pemasangan berakhir sebelum tanggal mulai`);
    }
    const dur = cekDurasiMinimal(it.air_start_date, it.air_end_date);
    if (!dur.ok) errors.push(`${label}: ${dur.message}`);
  }

  if (errors.length > 0) return res.status(400).json({ success: false, errors });

  try {
    const slugs = [...new Set(normalized.map((it) => it.media_type_slug))];
    const mediaBySlug = await loadCetakMedia(slugs);

    for (const [i, it] of normalized.entries()) {
      const media = mediaBySlug.get(it.media_type_slug);
      if (!media) {
        return res.status(400).json({
          success: false,
          error: `Media ke-${i + 1}: jenis media promosi cetak tidak dikenal atau tidak aktif.`,
        });
      }
      // Lead time dihitung ulang dari teks `rules` di DB (bukan klaim klien).
      const leadCheck = checkInstallationDate(it.installation_date, media.rules || '', toIsoDate());
      if (!leadCheck.ok) {
        return res.status(400).json({ success: false, errors: [`Media ke-${i + 1}: ${leadCheck.message}`] });
      }
    }

    // Anti-spam per perangkat: maks 5 BATCH / 24 jam (bukan 5 baris - fan-out
    // tidak boleh menghabiskan kuota dalam sekali kirim).
    const { rows: fpRows } = await db.query(
      `SELECT COUNT(DISTINCT COALESCE(batch_id::text, id::text))::int AS n
         FROM promo_submissions
        WHERE device_fingerprint = $1 AND created_at > now() - interval '24 hours'`,
      [fingerprint],
    );
    if ((fpRows[0]?.n || 0) >= 5) {
      return res.status(429).json({ success: false, error: 'Terlalu banyak pengajuan dari perangkat ini. Coba lagi besok.' });
    }

    // Hitung harga + durasi per item (server, bukan klien).
    const dihitung = normalized.map((it) => {
      const media = mediaBySlug.get(it.media_type_slug);
      const dur = cekDurasiMinimal(it.air_start_date, it.air_end_date);
      const harga = hitungHarga({
        priceAmount: media.price_amount,
        ppnIncluded: media.ppn_included,
        quantity: it.quantity,
        durationDays: dur.durationDays,
        rate: PPN_RATE,
      });
      return { ...it, media, durationDays: dur.durationDays, harga };
    });

    // Batch dibuat lebih dulu agar batch_id diketahui item; dibatalkan
    // (kompensasi) bila penulisan item gagal.
    const batchNumber = generateBatchNumber();
    const batchToken = generateStatusToken();
    const { rows: batchRows } = await db.query(
      `INSERT INTO promo_submission_batches
        (batch_number, batch_token, applicant_type, applicant_name, tenant_id,
         unit_number, pic_name, pic_phone, submission_date, notes,
         device_fingerprint, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, batch_number, batch_token, created_at`,
      [
        batchNumber, batchToken, applicantType, tenantName, tenantId,
        unitNumber, picName, picPhone, submissionDate, notes,
        fingerprint, clientIp(req), sanitize(req.headers['user-agent'] || '', 500),
      ],
    );
    const batch = batchRows[0];

    // Nomor + token per item (acak; unique index menegakkan keunikan).
    const itemRows = dihitung.map((it) => ({
      ...it,
      submissionNumber: generateSubmissionNumber(),
      statusToken: generateStatusToken(),
    }));

    // Satu INSERT multi-VALUES: atomik per statement tanpa transaksi eksplisit
    // (`db` tidak menyediakan connect()). Bila gagal → hapus batch (kompensasi).
    //
    // `status_changed_at` diletakkan paling akhir sebagai ekspresi literal
    // `now()` (tanpa parameter), sehingga daftar nilai tetap 1:1 dengan kolom
    // ber-parameter dan tidak ada placeholder yang perlu dibuang.
    const kolom = [
      'submission_number', 'status_token', 'media_type_slug', 'tenant_id',
      'tenant_name', 'unit_number', 'pic_name', 'pic_phone', 'media_target',
      'air_start_date', 'air_end_date', 'installation_date', 'terms_accepted',
      'notes', 'source_type', 'link_url', 'status',
      'device_fingerprint', 'ip_address', 'user_agent', 'applicant_type',
      'submission_date', 'batch_id', 'price_amount', 'price_unit', 'ppn_included',
      'ppn_rate', 'quantity', 'duration_days', 'subtotal', 'ppn_amount', 'total_amount',
    ];
    const values = [];
    const tuples = [];
    itemRows.forEach((it) => {
      const row = [
        it.submissionNumber, it.statusToken, it.media_type_slug, tenantId,
        tenantName, unitNumber, picName, picPhone, it.media_target,
        it.air_start_date, it.air_end_date, it.installation_date, true,
        notes, 'none', it.link_url, INITIAL_STATUS,
        fingerprint, clientIp(req), sanitize(req.headers['user-agent'] || '', 500),
        applicantType, submissionDate, batch.id, it.media.price_amount,
        it.media.price_unit, it.media.ppn_included, PPN_RATE, it.quantity,
        it.durationDays, it.harga.subtotal, it.harga.ppnAmount, it.harga.totalAmount,
      ];
      const placeholders = row.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      placeholders.push('now()');
      tuples.push(`(${placeholders.join(',')})`);
    });

    let inserted;
    try {
      const { rows } = await db.query(
        `INSERT INTO promo_submissions (${kolom.join(', ')}, status_changed_at)
         VALUES ${tuples.join(', ')}
         RETURNING id, submission_number, status_token, media_type_slug, status, created_at`,
        values,
      );
      inserted = rows;
    } catch (insErr) {
      await db.query('DELETE FROM promo_submission_batches WHERE id = $1', [batch.id]).catch(() => {});
      throw insErr;
    }

    // Riwayat pembuka per item + versi materi hanya bila ada lampiran.
    for (const [i, row] of inserted.entries()) {
      const it = itemRows[i];
      await insertHistory(db, {
        submissionId: row.id,
        fromStatus: '',
        toStatus: INITIAL_STATUS,
        comment: `Pengajuan cetak dikirim ${applicantType === 'non_tenant' ? 'non-tenant' : 'tenant'}`,
        actorType: 'tenant',
        actorName: picName,
      });
      if (it.link_url || it.drive_file_id) {
        const materialResult = await resolveMaterial({
          linkUrl: it.link_url, driveFileId: it.drive_file_id,
          fileName: it.file_name, mimeType: it.mime_type,
        });
        if (!materialResult.ok) {
          return res.status(materialResult.status).json({
            success: false,
            ...(materialResult.errors ? { errors: materialResult.errors } : { error: materialResult.error }),
          });
        }
        const material = materialResult.material;
        await db.query(
          `UPDATE promo_submissions
              SET source_type = $1, file_url = $2, file_name = $3, mime_type = $4,
                  link_url = $5, file_size_bytes = $6, drive_file_id = $7, updated_at = now()
            WHERE id = $8`,
          [material.sourceType, material.fileUrl, material.fileName, material.mimeType,
            material.linkUrl, material.size, material.driveFileId, row.id],
        );
        await insertFileVersion(db, row.id, material, { version: 1, uploadedBy: 'tenant', notes: '' });
      }
    }

    return res.status(201).json({
      success: true,
      batch_id: batch.id,
      batch_number: batch.batch_number,
      batch_token: batch.batch_token,
      applicant_type: applicantType,
      created_at: batch.created_at,
      items: inserted.map((row, i) => ({
        id: row.id,
        submission_number: row.submission_number,
        status_token: row.status_token,
        media_type_slug: row.media_type_slug,
        status: row.status,
        subtotal: itemRows[i].harga.subtotal,
        ppn_amount: itemRows[i].harga.ppnAmount,
        total_amount: itemRows[i].harga.totalAmount,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

/** Muat satu batch + seluruh submission-nya (bentuk publik). */
async function loadBatchDetail(batch, submissions) {
  const detail = await Promise.all(
    submissions.map((s) => loadSubmissionDetail(s)),
  );
  return { batch, items: detail };
}

// GET /promo/batches/status/:token - publik.
router.get('/batches/status/:token', async (req, res, next) => {
  if (!enforceRateLimit(req, res, 'status-lookup', 60, 15 * 60 * 1000)) return;

  const token = sanitize(req.params?.token || '', 100);
  if (!token) return res.status(400).json({ success: false, error: 'Token batch wajib diisi.' });

  try {
    const { rows } = await db.query(
      `SELECT id, batch_number, batch_token, applicant_type, applicant_name,
              unit_number, submission_date, notes, created_at
         FROM promo_submission_batches WHERE batch_token = $1 LIMIT 1`,
      [token],
    );
    const batch = rows[0] || null;
    if (!batch) return res.status(404).json({ success: false, error: NOT_FOUND_MESSAGE });

    const { rows: subs } = await db.query(
      `SELECT ${SUBMISSION_PUBLIC_COLUMNS}
         FROM promo_submissions WHERE batch_id = $1 ORDER BY created_at ASC`,
      [batch.id],
    );
    return res.json({ success: true, data: await loadBatchDetail(batch, subs) });
  } catch (err) {
    return next(err);
  }
});

// GET /promo/batches/track?number= - publik (captcha).
router.get('/batches/track', async (req, res, next) => {
  if (!enforceRateLimit(req, res, 'status-lookup', 60, 15 * 60 * 1000)) return;

  const number = normalizeSubmissionNumber(req.query?.number);
  if (!number) return res.status(400).json({ success: false, error: 'Nomor pengajuan wajib diisi.' });
  if (!BATCH_NUMBER_RE.test(number)) {
    return res.status(400).json({
      success: false,
      error: 'Format nomor batch tidak valid. Contoh: MPB-260920-A7K2QX.',
    });
  }

  try {
    const captcha = await verifyTurnstile(req.query?.captcha, {
      remoteip: clientIp(req),
      action: 'track-batch',
    });
    if (!captcha.ok) {
      return res.status(captcha.status || 400).json({ success: false, error: captcha.error });
    }

    const { rows } = await db.query(
      `SELECT id, batch_number, batch_token, applicant_type, applicant_name,
              unit_number, submission_date, notes, created_at
         FROM promo_submission_batches WHERE batch_number = $1 LIMIT 1`,
      [number],
    );
    const batch = rows[0] || null;
    if (!batch) return res.status(404).json({ success: false, error: NOT_FOUND_MESSAGE });

    const { rows: subs } = await db.query(
      `SELECT ${SUBMISSION_PUBLIC_COLUMNS}
         FROM promo_submissions WHERE batch_id = $1 ORDER BY created_at ASC`,
      [batch.id],
    );
    return res.json({ success: true, data: await loadBatchDetail(batch, subs) });
  } catch (err) {
    return next(err);
  }
});

export default router;
