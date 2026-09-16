/**
 * Routes promo — publik, mount di /api/v1/promo.
 *
 *   GET  /promo/media-types                    — katalog aktif (tanpa rate limit)
 *   GET  /promo/tenants?q=                     — cari tenant MID aktif (q >= 2 char)
 *   POST /promo/submit                        — kirim pengajuan (10 / 60 mnt / IP)
 *   GET  /promo/submissions/mine?fingerprint= — riwayat per perangkat
 *   GET  /promo/submissions/status/:token     — status pengajuan via token (FR-019)
 *   POST /promo/submissions/:id/revision      — unggah ulang materi (Perlu Revisi)
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
import { generateSubmissionNumber, generateStatusToken } from '../lib/identifiers.js';
import { INITIAL_STATUS } from '../lib/statusFlow.js';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────
const MID_API_KEY = process.env.MID_API_KEY || '';
const MID_API_URL = 'https://apiloyalty.metropolitanland.com/getAllTenants';

/** Fail-closed bila kunci MID tidak dikonfigurasi. */
function midConfigured() {
  return Boolean(MID_API_KEY);
}

/** Fetch tenant aktif dari API loyalitas MID — tanpa PIC (pola app lama). */
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
/** Tautan materi (Google Drive/Dropbox/WeTransfer/dll) — http(s) saja. */
const LINK_RE = /^https?:\/\/[^\s]+$/i;

/** Kolom publik pengajuan — sengaja tanpa fingerprint/IP (metadata internal). */
const SUBMISSION_PUBLIC_COLUMNS = `
  id, submission_number, media_type_slug, tenant_name, unit_number,
  material_title, material_description, campaign_name, material_type, media_target,
  air_start_date, air_end_date, installation_date, notes,
  status, review_notes, status_changed_at, created_at, updated_at,
  source_type, file_url, file_name, link_url`;

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

// ─── GET /promo/media-types — katalog aktif ─────────────────────
router.get('/media-types', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT slug, category, name, size_spec, material_spec, accepted_formats,
              price_note, location_note, rules, sort_order
       FROM promo_media_types
       WHERE is_active = true
       ORDER BY sort_order, name`,
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /promo/tenants — pencarian tenant MID ───────────────────
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

// ─── POST /promo/submit — publik ────────────────────────────────
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
  if (!tenantName) errors.push('Nama gerai wajib diisi');
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

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    // Media type harus ada & aktif.
    const { rows: mtRows } = await db.query(
      'SELECT slug, accepted_formats, rules FROM promo_media_types WHERE slug = $1 AND is_active = true LIMIT 1',
      [mediaTypeSlug],
    );
    if (!mtRows[0]) {
      return res.status(400).json({ success: false, error: 'Jenis media promosi tidak dikenal atau tidak aktif.' });
    }

    // Lead time: materi harus diterima N hari sebelum pasang (aturan per media
    // diturunkan dari teks `rules` — kalender atau hari kerja, lihat lib/leadTime.js).
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

// ─── GET /promo/submissions/mine — riwayat per perangkat ─────────
// Token status ikut dikirim karena akses endpoint ini sudah digerbangi
// fingerprint perangkat: tanpa token, tenant yang kehilangan tautan status
// tidak punya jalan ke form revisi meski pengajuannya ada di riwayat ini.
router.get('/submissions/mine', async (req, res, next) => {
  const fingerprint = String(req.query?.fingerprint || '').trim();
  if (!fingerprint) {
    return res.status(400).json({ success: false, error: 'Fingerprint perangkat wajib diisi.' });
  }
  try {
    const { rows } = await db.query(
      `SELECT ${SUBMISSION_PUBLIC_COLUMNS}, status_token
       FROM promo_submissions
       WHERE device_fingerprint = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [fingerprint],
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /promo/submissions/status/:token — halaman status PIC ───
// Token status adalah satu-satunya kredensial tenant (FR-018..FR-022); rate limit
// ketat agar token tidak bisa di-brute force.
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
    // Pesan seragam untuk token salah — jangan bocorkan token mana yang ada.
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan. Periksa kembali tautan status Anda.' });
    }

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
                proof_url, installed_by, installed_by_id, created_at, updated_at
         FROM promo_installations WHERE submission_id = $1 LIMIT 1`,
        [submission.id],
      ),
    ]);

    return res.json({
      success: true,
      data: {
        submission,
        history: historyRes.rows,
        files: filesRes.rows,
        installation: installRes.rows[0] || null,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /promo/submissions/:id/revision — unggah ulang materi ──
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

export default router;
