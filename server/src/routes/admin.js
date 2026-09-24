/**
 * Routes admin - mount di /api/v1/admin (semua requireRole).
 *
 *   GET  /admin/submissions?status=&media_type=&page=   - daftar paginasi (read roles)
 *   POST /admin/submissions/:id/status                  - review status (staff)
 *   POST /admin/submissions/:id/delete                  - hapus + bersihkan Drive (staff)
 *   GET  /admin/media-types                             - semua katalog (read roles)
 *   POST /admin/media-types                              - create (staff)
 *   POST /admin/media-types/:id                          - update (staff)
 *   POST /admin/media-types/:id/delete                   - delete (staff)
 *   GET  /admin/export                                   - CSV UTF-8 BOM (read roles)
 *   GET  /admin/users                                    - user mgmt (superadmin)
 *   POST /admin/users                                    - create (superadmin)
 *   POST /admin/users/:id                                - update (superadmin)
 *   POST /admin/users/:id/delete                         - delete (superadmin)
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Readable } from 'node:stream';

import { db } from '../db.js';
import { requireRole, logActivity, READ_ROLES, STAFF_ROLES } from '../auth.js';
import { deleteDriveFileOrThrow } from '../drive.js';
import { readMultipartFile } from '../drive.js';
import {
  driveReady, ALLOWED_MIME, MAX_UPLOAD_BYTES, checkMagicBytes,
  uploadToDrive, safeFileName, extOf,
} from '../drive.js';
import {
  ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES, checkImageMagic, mediaFileName,
  simpanGambar, hapusGambar, namaBerkasUnggahan, urlGambar,
} from '../media.js';
import { SUBMISSION_STATUSES, canTransition, isInstallableStatus } from '../lib/statusFlow.js';
import { REMINDER_DAYS } from '../lib/pricing.js';
import { enforceRateLimit } from '../lib/rateLimit.js';

const router = Router();

// Helpers.
function sanitize(val, maxLen = 1000) {
  if (typeof val !== 'string') return '';
  return val.replace(/\0/g, '').trim().slice(0, maxLen);
}

/**
 * Prefix netralisasi formula spreadsheet (CSV injection).
 *
 * Excel/Sheets mengeksekusi sel yang dimulai `=`, `+`, `-`, atau `@` sebagai
 * rumus, dan TAB/CR bisa memecah sel. Nilai kiriman tenant (nama campaign,
 * judul materi, catatan) dan nomor telepon `+62...` masuk ke CSV ini, jadi
 * sel berawalan salah satu karakter itu diberi awalan `'` - di Excel tanda
 * itu disembunyikan (teks tampil utuh), sedangkan pembaca CSV lain melihatnya
 * sebagai penanda teks, bukan rumus.
 */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (CSV_FORMULA_PREFIX.test(str)) str = `'${str}`;
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const STATUSES = SUBMISSION_STATUSES;
const SLUG_RE = /^[a-z0-9-]+$/;
const CATEGORIES = ['outdoor', 'indoor', 'social'];
/** Kanal katalog - cermin CHECK `promo_media_types_channel_chk` di schema. */
const MEDIA_CHANNELS = ['cetak', 'digital'];

/**
 * Harga numerik dari input staf: angka >= 0, dibulatkan 2 desimal seperti
 * NUMERIC(14,2). Nilai tak masuk akal (NaN/negatif) → 0 (media gratis).
 */
function parseHarga(val) {
  const n = Number.parseFloat(String(val));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// SUBMISSIONS.

// GET /admin/submissions.
// Filter: status, media_type, tenant, rentang tanggal, plus pencarian bebas
// (nomor pengajuan / tenant / judul materi) - FR-026, FR-027.
function buildSubmissionFilters(query) {
  const status = String(query?.status || '').trim();
  const mediaType = String(query?.media_type || '').trim();
  const tenant = String(query?.tenant || '').trim();
  const dateFrom = String(query?.date_from || '').trim();
  const dateTo = String(query?.date_to || '').trim();
  const search = sanitize(query?.q || '', 100);

  const where = [];
  const values = [];
  if (status && STATUSES.includes(status)) {
    values.push(status);
    where.push(`s.status = $${values.length}`);
  }
  if (mediaType) {
    values.push(mediaType);
    where.push(`s.media_type_slug = $${values.length}`);
  }
  if (tenant) {
    values.push(`%${tenant}%`);
    where.push(`s.tenant_name ILIKE $${values.length}`);
  }
  if (DATE_RE.test(dateFrom)) {
    values.push(dateFrom);
    where.push(`s.created_at >= $${values.length}::date`);
  }
  if (DATE_RE.test(dateTo)) {
    values.push(dateTo);
    // `dateTo` inklusif sampai akhir hari.
    where.push(`s.created_at < ($${values.length}::date + interval '1 day')`);
  }
  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    where.push(`(s.submission_number ILIKE ${p} OR s.tenant_name ILIKE ${p} OR s.material_title ILIKE ${p})`);
  }
  return { whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', values };
}

router.get('/submissions', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query?.page || '1'), 10) || 1);
    const perPage = 20;
    const { whereSql, values } = buildSubmissionFilters(req.query);

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM promo_submissions s ${whereSql}`,
      values,
    );
    const total = countRows[0]?.n || 0;

    values.push(perPage);
    values.push((page - 1) * perPage);
    const { rows } = await db.query(
      `SELECT s.*, u.display_name AS reviewed_by_name, b.batch_number
       FROM promo_submissions s
       LEFT JOIN users u ON u.id = s.reviewed_by
       LEFT JOIN promo_submission_batches b ON b.id = s.batch_id
       ${whereSql}
       ORDER BY s.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    return res.json({
      success: true,
      data: rows,
      total,
      page,
      per_page: perPage,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    });
  } catch (err) {
    return next(err);
  }
});

// GET /admin/submissions/summary - jumlah per status (FR-025).
router.get('/submissions/summary', requireRole(READ_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT status, COUNT(*)::int AS n FROM promo_submissions GROUP BY status',
    );
    const counts = {};
    for (const s of SUBMISSION_STATUSES) counts[s] = 0;
    let total = 0;
    for (const row of rows) {
      counts[row.status] = row.n;
      total += row.n;
    }
    return res.json({ success: true, data: { total, counts } });
  } catch (err) {
    return next(err);
  }
});

// GET /admin/submissions/reminders - periode berakhir (turunan).
// Notifikasi dashboard TURUNAN DATA (bukan cron/worker): menghitung materi
// yang periodenya berakhir dalam N hari. Cakupannya DUA kategori: yang sudah
// tercatat terpasang, dan yang belum (Disetujui / Siap Dipasang) supaya
// pengajuan yang periodenya habis tanpa pernah dicatat pemasangannya tidak
// luput dari perhatian. Hanya media ber-pajak yang disertakan, ditandai
// `ppn_rate > 0` (BUKAN `ppn_amount > 0`: PPN yang membulat nol tidak boleh
// menghilangkan baris dari pengingat). `end_date` bertipe TEXT, jadi WAJIB
// dijaga regex sebelum di-cast - satu nilai cacat akan menggagalkan seluruh
// query.
router.get('/submissions/reminders', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    // `days` yang tak sah DITOLAK, tidak diam-diam menjadi default: `0` adalah
    // nilai falsy, sehingga pola `parseInt(...) || REMINDER_DAYS` yang lama
    // mengubah `days=0` menjadi 14 tanpa memberi tahu pemanggil.
    let days = REMINDER_DAYS;
    const rawDays = req.query?.days;
    if (rawDays !== undefined && String(rawDays).trim() !== '') {
      const parsed = Number(String(rawDays).trim());
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
        return res.status(400).json({
          success: false,
          error: 'Parameter days harus bilangan bulat 1 sampai 365.',
        });
      }
      days = parsed;
    }

    const { rows } = await db.query(
      `SELECT s.id, s.submission_number, s.tenant_name, s.pic_phone, s.applicant_type,
              s.media_type_slug, s.status, s.air_end_date,
              COALESCE(NULLIF(i.end_date, ''), NULLIF(s.air_end_date, '')) AS end_date,
              (CASE WHEN COALESCE(NULLIF(i.end_date, ''), NULLIF(s.air_end_date, ''))
                         ~ '^\\d{4}-\\d{2}-\\d{2}$'
                    THEN COALESCE(NULLIF(i.end_date, ''), s.air_end_date)::date
               END - CURRENT_DATE) AS days_left,
              CASE WHEN s.status = 'sudah_dipasang' THEN 'terpasang' ELSE 'belum_terpasang' END AS category,
              s.ppn_amount::float8 AS ppn_amount,
              s.total_amount::float8 AS total_amount
         FROM promo_submissions s
         LEFT JOIN promo_installations i ON i.submission_id = s.id
        WHERE s.status IN ('sudah_dipasang','disetujui','siap_dipasang')
          -- HANYA pengajuan yang benar-benar ber-PPN. Jangan menurunkan
          -- "kena pajak" dari kolom ppn_included: kolom itu ber-DEFAULT
          -- false, sehingga klausa OR ppn_included = false selalu benar dan
          -- menarik SETIAP baris warisan (media digital/gratis) ke pengingat.
          -- Deck pun tidak seragam soal PPN. Penanda yang dipakai adalah
          -- TARIF pajak yang benar-benar terpasang (s.ppn_rate > 0), bukan
          -- hasil pembulatannya, supaya PPN yang membulat nol tetap ikut.
          AND s.ppn_rate > 0
          AND (CASE WHEN COALESCE(NULLIF(i.end_date, ''), NULLIF(s.air_end_date, ''))
                         ~ '^\\d{4}-\\d{2}-\\d{2}$'
                    THEN COALESCE(NULLIF(i.end_date, ''), s.air_end_date)::date
               END - CURRENT_DATE) <= $1
        ORDER BY days_left NULLS LAST
        LIMIT 200`,
      [days],
    );

    const overdue = rows.filter((r) => r.days_left !== null && r.days_left < 0).length;
    const dueSoon = rows.filter((r) => r.days_left !== null && r.days_left >= 0).length;
    const belumTerpasang = rows.filter((r) => r.category === 'belum_terpasang').length;
    return res.json({
      success: true,
      data: { days, overdue, due_soon: dueSoon, belum_terpasang: belumTerpasang, items: rows },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /admin/submissions/:id - detail lengkap (FR-028..FR-030).
router.get('/submissions/:id', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });

    const { rows } = await db.query(
      `SELECT s.*, u.display_name AS reviewed_by_name, b.batch_number
       FROM promo_submissions s
       LEFT JOIN users u ON u.id = s.reviewed_by
       LEFT JOIN promo_submission_batches b ON b.id = s.batch_id
       WHERE s.id = $1 LIMIT 1`,
      [id],
    );
    const submission = rows[0] || null;
    if (!submission) return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan' });

    const [historyRes, filesRes, installRes] = await Promise.all([
      db.query(
        `SELECT id, submission_id, from_status, to_status, comment, actor_type,
                actor_name, actor_id, created_at
         FROM promo_submission_history WHERE submission_id = $1
         ORDER BY created_at ASC`,
        [id],
      ),
      db.query(
        `SELECT id, submission_id, version, source_type, file_url, file_name,
                mime_type, file_size_bytes, link_url, drive_file_id, uploaded_by,
                notes, created_at
         FROM promo_submission_files WHERE submission_id = $1
         ORDER BY version DESC`,
        [id],
      ),
      db.query(
        `SELECT id, submission_id, media_location, start_date, end_date, notes,
                proof_url, proof_kind, proof_file_id, proof_file_url, proof_file_name,
                proof_mime, proof_size_bytes, proof_uploaded_by, proof_uploaded_at,
                installed_by, installed_by_id, created_at, updated_at
         FROM promo_installations WHERE submission_id = $1 LIMIT 1`,
        [id],
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

// POST /admin/submissions/:id/status.
// FR-032..FR-037: transisi divalidasi terhadap alur status; komentar wajib saat
// meminta revisi, alasan wajib saat menolak; nama admin + waktu tercatat.
router.post('/submissions/:id/status', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    const status = String(req.body?.status || '').trim();
    const reviewNotes = sanitize(req.body?.review_notes || '', 2000);

    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status tidak dikenal' });
    }
    if (status === 'perlu_revisi' && !reviewNotes) {
      return res.status(400).json({ success: false, error: 'Komentar wajib diisi ketika meminta revisi' });
    }
    if (status === 'ditolak' && !reviewNotes) {
      return res.status(400).json({ success: false, error: 'Alasan wajib diisi ketika menolak materi' });
    }

    const { rows: existingRows } = await db.query(
      'SELECT id, status FROM promo_submissions WHERE id = $1 LIMIT 1',
      [id],
    );
    const existing = existingRows[0] || null;
    if (!existing) return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan' });

    // Transisi harus sesuai alur status PRD §8 (FR-039: materi disetujui tidak
    // dapat diedit tanpa alur baru).
    if (existing.status !== status && !canTransition(existing.status, status)) {
      return res.status(400).json({
        success: false,
        error: `Status tidak dapat berpindah dari ${existing.status} ke ${status}.`,
      });
    }

    await db.query(
      `UPDATE promo_submissions
       SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now(),
           status_changed_at = now(), updated_at = now()
       WHERE id = $4`,
      [status, reviewNotes, req.auth.user.id, id],
    );

    if (existing.status !== status) {
      await db.query(
        `INSERT INTO promo_submission_history
          (submission_id, from_status, to_status, comment, actor_type, actor_name, actor_id)
         VALUES ($1,$2,$3,$4,'admin',$5,$6)`,
        [id, existing.status, status, reviewNotes, req.auth.user.display_name, req.auth.user.id],
      );
    }

    logActivity(req.auth.user, 'update_submission_status', 'promo_submission', id, { from: existing.status, status }, req);
    return res.json({ success: true, status });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/submissions/:id/installation.
// FR-040..FR-046: pemasangan hanya untuk materi Disetujui/Siap Dipasang, wajib
// menentukan media/lokasi; status menjadi Sudah Dipasang.
router.post('/submissions/:id/installation', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    const d = req.body || {};
    const mediaLocation = sanitize(d.media_location || '', 200);
    const startDate = sanitize(d.start_date || '', 10);
    const endDate = sanitize(d.end_date || '', 10);
    const notes = sanitize(d.notes || '', 1000);
    const proofUrl = sanitize(d.proof_url || '', 500);
    const proofKind = sanitize(d.proof_kind || 'link', 20);

    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });
    if (!mediaLocation) return res.status(400).json({ success: false, error: 'Media atau lokasi pemasangan wajib diisi' });
    if (!['link', 'upload'].includes(proofKind)) {
      return res.status(400).json({ success: false, error: 'Jenis bukti pemasangan harus link atau upload' });
    }
    if (startDate && !DATE_RE.test(startDate)) {
      return res.status(400).json({ success: false, error: 'Tanggal mulai harus format YYYY-MM-DD' });
    }
    if (endDate && !DATE_RE.test(endDate)) {
      return res.status(400).json({ success: false, error: 'Tanggal berakhir harus format YYYY-MM-DD' });
    }
    if (startDate && endDate && endDate < startDate) {
      return res.status(400).json({ success: false, error: 'Tanggal berakhir sebelum tanggal mulai' });
    }
    if (proofUrl && !/^https?:\/\/[^\s]+$/i.test(proofUrl)) {
      return res.status(400).json({ success: false, error: 'Tautan bukti pemasangan harus URL http/https' });
    }

    const { rows } = await db.query(
      'SELECT id, status FROM promo_submissions WHERE id = $1 LIMIT 1',
      [id],
    );
    const existing = rows[0] || null;
    if (!existing) return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan' });
    if (!isInstallableStatus(existing.status)) {
      return res.status(400).json({
        success: false,
        error: 'Pemasangan hanya dapat dicatat untuk materi berstatus Disetujui atau Siap Dipasang.',
      });
    }

    const { rows: installRows } = await db.query(
      'SELECT id FROM promo_installations WHERE submission_id = $1 LIMIT 1',
      [id],
    );
    if (installRows[0]) {
      await db.query(
        `UPDATE promo_installations
         SET media_location = $1, start_date = $2, end_date = $3, notes = $4,
             proof_url = $5, proof_kind = $6, installed_by = $7, installed_by_id = $8,
             updated_at = now()
         WHERE submission_id = $9`,
        [mediaLocation, startDate, endDate, notes, proofUrl, proofKind, req.auth.user.display_name, req.auth.user.id, id],
      );
    } else {
      await db.query(
        `INSERT INTO promo_installations
          (submission_id, media_location, start_date, end_date, notes, proof_url,
           proof_kind, installed_by, installed_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, mediaLocation, startDate, endDate, notes, proofUrl, proofKind, req.auth.user.display_name, req.auth.user.id],
      );
    }

    // Status akhir pemasangan: Sudah Dipasang (AC 11.4). Siap Dipasang → Sudah
    // Dipasang sah menurut alur; Disetujui → Sudah Dipasang diizinkan FR-040.
    if (existing.status !== 'sudah_dipasang') {
      await db.query(
        `UPDATE promo_submissions
         SET status = 'sudah_dipasang', status_changed_at = now(), updated_at = now()
         WHERE id = $1`,
        [id],
      );
      await db.query(
        `INSERT INTO promo_submission_history
          (submission_id, from_status, to_status, comment, actor_type, actor_name, actor_id)
         VALUES ($1,$2,'sudah_dipasang',$3,'admin',$4,$5)`,
        [id, existing.status, `Dipasang di ${mediaLocation}`, req.auth.user.display_name, req.auth.user.id],
      );
    }

    logActivity(req.auth.user, 'record_installation', 'promo_submission', id, { mediaLocation }, req);
    return res.json({ success: true, status: 'sudah_dipasang' });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/submissions/:id/installation/proof - unggah bukti.
// Kanal kedua bukti tayang (selain tautan). Berkas disimpan ke Google Drive
// yang sama dengan materi, memakai helper drive.js yang sudah ada - BUKAN
// MEDIA_DIR (batasnya 4MB dan penyajiannya publik + cache selamanya).
// Fail-closed: tanpa kredensial Drive → 503 (pola middleware drive.js).
router.post('/submissions/:id/installation/proof', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });

    if (!driveReady) {
      return res.status(503).json({ success: false, error: 'Layanan unggah bukti sedang tidak tersedia.' });
    }
    // Bucket terpisah dari kanal unggah publik (drive-upload, 5/15 mnt).
    if (!enforceRateLimit(req, res, 'admin-proof', 20, 15 * 60 * 1000)) return;

    const { rows } = await db.query(
      'SELECT id, status FROM promo_submissions WHERE id = $1 LIMIT 1',
      [id],
    );
    const existing = rows[0] || null;
    if (!existing) return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan' });
    // Lokasi pemasangan diambil dari `media_target` pengajuan - BUKAN dari
    // `req.body`: `readMultipartFile` (drive.js) sengaja mengabaikan field
    // non-file, jadi `req.body.media_location` tidak pernah terisi. Query
    // terpisah (bukan memperluas SELECT di atas) supaya bentuk SELECT di atas
    // yang dikunci test lama tetap utuh; hasilnya sama.
    const { rows: locRows } = await db.query(
      'SELECT media_target FROM promo_submissions WHERE id = $1 LIMIT 1',
      [id],
    );
    existing.media_target = locRows[0]?.media_target || '';
    if (!isInstallableStatus(existing.status) && existing.status !== 'sudah_dipasang') {
      return res.status(400).json({
        success: false,
        error: 'Bukti tayang hanya dapat diunggah untuk materi Disetujui, Siap Dipasang, atau Sudah Dipasang.',
      });
    }

    const file = await readMultipartFile(req);
    if (file.error) return res.status(400).json({ success: false, error: file.error });

    const mime = String(file.contentType || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return res.status(400).json({
        success: false,
        error: 'Format bukti harus JPEG, PNG, PDF, atau MP4.',
      });
    }
    if (file.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ success: false, error: 'Berkas bukti melebihi 50MB' });
    }
    const magic = checkMagicBytes(file.head, mime);
    if (!magic.ok) return res.status(400).json({ success: false, error: magic.error });

    const uploaded = await uploadToDrive({
      stream: Readable.from(file.chunks),
      length: file.length,
      name: safeFileName(`bukti-${file.originalName || 'pemasangan'}`, extOf(mime)),
      mimeType: mime,
    });

    const { rows: installRows } = await db.query(
      'SELECT id FROM promo_installations WHERE submission_id = $1 LIMIT 1',
      [id],
    );
    if (installRows[0]) {
      await db.query(
        `UPDATE promo_installations
            SET proof_kind = 'upload', proof_file_id = $1, proof_file_url = $2,
                proof_file_name = $3, proof_mime = $4, proof_size_bytes = $5,
                proof_uploaded_by = $6, proof_uploaded_at = now(), updated_at = now()
          WHERE submission_id = $7`,
        [uploaded.id, uploaded.webViewLink, sanitize(file.originalName || '', 200), mime,
          file.length, req.auth.user.display_name, id],
      );
    } else {
      // Belum ada baris pemasangan - buat baris ringkas dengan lokasi dari
      // `media_target` pengajuan agar bukti tidak menggantung tanpa induk.
      await db.query(
        `INSERT INTO promo_installations
          (submission_id, media_location, proof_kind, proof_file_id, proof_file_url,
           proof_file_name, proof_mime, proof_size_bytes, proof_uploaded_by,
           proof_uploaded_at, installed_by, installed_by_id)
         VALUES ($1, $2, 'upload', $3, $4, $5, $6, $7, $8, now(), $9, $10)`,
        [id, sanitize(existing.media_target || '', 200) || 'Belum ditentukan',
          uploaded.id, uploaded.webViewLink, sanitize(file.originalName || '', 200), mime,
          file.length, req.auth.user.display_name, req.auth.user.display_name, req.auth.user.id],
      );
    }

    logActivity(req.auth.user, 'upload_installation_proof', 'promo_submission', id,
      { mime, bytes: file.length, drive_file_id: uploaded.id }, req);
    return res.json({ success: true, proof_file_id: uploaded.id, proof_file_url: uploaded.webViewLink });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/submissions/:id/delete.
router.post('/submissions/:id/delete', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });

    const { rows } = await db.query(
      'SELECT id, source_type, drive_file_id FROM promo_submissions WHERE id = $1 LIMIT 1',
      [id],
    );
    const existing = rows[0] || null;
    if (!existing) return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan' });

    // Pengajuan bertautan atau legacy R2 (tanpa drive_file_id) - tak ada yang dihapus dari Drive.
    if (existing.source_type !== 'link' && existing.drive_file_id) {
      // Hapus Drive DULU dengan kepastian (throw) - gagal → row tetap, retry aman.
      try {
        await deleteDriveFileOrThrow(existing.drive_file_id);
      } catch (delErr) {
        console.error('[admin/deleteSubmission] Drive delete failed:', existing.drive_file_id, delErr.message);
        return res.status(400).json({ success: false, error: 'Gagal menghapus file dari storage. Coba lagi.' });
      }
    }

    await db.query('DELETE FROM promo_submissions WHERE id = $1', [id]);
    logActivity(req.auth.user, 'delete_submission', 'promo_submission', id, null, req);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// MEDIA TYPES (katalog).

// GET /admin/media-types.
router.get('/media-types', requireRole(READ_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM promo_media_types ORDER BY sort_order, name',
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/media-types - create.
router.post('/media-types', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const d = req.body || {};
    const slug = sanitize(d.slug || '', 60);
    const name = sanitize(d.name || '', 100);
    const category = sanitize(d.category || '', 20);
    const mediaChannel = sanitize(d.media_channel || 'digital', 20);

    if (!slug || !SLUG_RE.test(slug)) {
      return res.status(400).json({ success: false, error: 'Slug wajib huruf kecil/angka/tanda hubung' });
    }
    if (!name) return res.status(400).json({ success: false, error: 'Nama wajib diisi' });
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Kategori harus outdoor, indoor, atau social' });
    }
    if (!MEDIA_CHANNELS.includes(mediaChannel)) {
      return res.status(400).json({ success: false, error: 'Kanal media harus cetak atau digital' });
    }

    const { rows: dupe } = await db.query(
      'SELECT id FROM promo_media_types WHERE slug = $1 LIMIT 1',
      [slug],
    );
    if (dupe[0]) return res.status(400).json({ success: false, error: 'Slug sudah dipakai' });

    const { rows } = await db.query(
      `INSERT INTO promo_media_types
        (slug, category, name, size_spec, material_spec, accepted_formats,
         price_note, location_note, rules, image_path, is_active, sort_order,
         media_channel, price_amount, price_unit, ppn_included)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        slug,
        category,
        name,
        sanitize(d.size_spec || '', 200),
        sanitize(d.material_spec || '', 200),
        sanitize(d.accepted_formats || '', 60),
        sanitize(d.price_note || '', 200),
        sanitize(d.location_note || '', 300),
        sanitize(d.rules || '', 5000),
        sanitize(d.image_path || '', 200),
        d.is_active === false ? false : true,
        parseInt(String(d.sort_order ?? '0'), 10) || 0,
        mediaChannel,
        parseHarga(d.price_amount),
        sanitize(d.price_unit || '', 60),
        d.ppn_included === true,
      ],
    );
    const id = rows[0]?.id || '';
    logActivity(req.auth.user, 'create_media_type', 'promo_media_type', id, { slug, mediaChannel }, req);
    return res.json({ success: true, id });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/media-types/:id - update.
router.post('/media-types/:id', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    const d = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'ID media wajib diisi' });

    const { rows: existingRows } = await db.query(
      'SELECT id, slug FROM promo_media_types WHERE id = $1 LIMIT 1',
      [id],
    );
    if (!existingRows[0]) return res.status(404).json({ success: false, error: 'Media tidak ditemukan' });

    const slug = sanitize(d.slug || '', 60);
    if (slug && slug !== existingRows[0].slug) {
      if (!SLUG_RE.test(slug)) {
        return res.status(400).json({ success: false, error: 'Slug wajib huruf kecil/angka/tanda hubung' });
      }
      const { rows: dupe } = await db.query(
        'SELECT id FROM promo_media_types WHERE slug = $1 AND id != $2 LIMIT 1',
        [slug, id],
      );
      if (dupe[0]) return res.status(400).json({ success: false, error: 'Slug sudah dipakai' });
    }

    const category = sanitize(d.category || '', 20);
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Kategori harus outdoor, indoor, atau social' });
    }

    // Kolom teks: bedakan "tidak dikirim" dari "dikirim kosong".
    //
    // Sebelumnya setiap nilai kosong di-skip (`if (!value) continue`), sehingga
    // mengosongkan field teks - termasuk `rules` (Ketentuan) yang tampil sebagai
    // deskripsi media - tidak pernah tersimpan: nilai lama diam-diam bertahan dan
    // pengguna mengira sudah tersimpan. Kini kunci yang HADIR di body (walau
    // bernilai '') ikut ditulis; kunci yang absen tidak disentuh sama sekali.
    //
    // `slug`/`category` tetap hanya diproses bila tidak kosong (perilaku lama):
    // mengosongkan keduanya akan melanggar NOT NULL/CHECK. `image_path` dikelola
    // endpoint foto sendiri, jadi tidak ikut di sini.
    const sets = [];
    const values = [];

    const fields = { slug, category };
    if (d.name !== undefined) {
      const name = sanitize(d.name, 100);
      if (!name) return res.status(400).json({ success: false, error: 'Nama wajib diisi' });
      fields.name = name;
    }
    const KOLOM_TEKS = [
      ['size_spec', 200], ['material_spec', 200], ['accepted_formats', 60],
      ['price_note', 200], ['location_note', 300], ['rules', 5000],
    ];
    for (const [key, maxLen] of KOLOM_TEKS) {
      if (d[key] !== undefined) fields[key] = sanitize(d[key], maxLen);
    }

    // Kanal katalog: hanya bila dikirim, dan wajib salah satu nilai sah.
    if (d.media_channel !== undefined) {
      const mediaChannel = sanitize(d.media_channel, 20);
      if (!MEDIA_CHANNELS.includes(mediaChannel)) {
        return res.status(400).json({ success: false, error: 'Kanal media harus cetak atau digital' });
      }
      fields.media_channel = mediaChannel;
    }

    // Harga numerik + PPN: hanya bila dikirim. `price_amount` 0 SAH (media
    // gratis), jadi jangan disamakan dengan "kosong" - pola kunci-hadir.
    if (d.price_amount !== undefined) fields.price_amount = parseHarga(d.price_amount);
    if (d.price_unit !== undefined) fields.price_unit = sanitize(d.price_unit, 60);
    if (d.ppn_included !== undefined) fields.ppn_included = d.ppn_included === true;

    for (const [key, value] of Object.entries(fields)) {
      // `slug`/`category` hanya bila tidak kosong; kolom lain boleh kosong/0.
      if (value === '' && (key === 'slug' || key === 'category')) continue;
      values.push(value);
      sets.push(`${key} = $${values.length}`);
    }
    if (d.is_active !== undefined) {
      values.push(d.is_active === true);
      sets.push(`is_active = $${values.length}`);
    }
    if (d.sort_order !== undefined) {
      values.push(parseInt(String(d.sort_order), 10) || 0);
      sets.push(`sort_order = $${values.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'Tidak ada perubahan' });

    sets.push('updated_at = now()');
    values.push(id);
    await db.query(`UPDATE promo_media_types SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

    logActivity(req.auth.user, 'update_media_type', 'promo_media_type', id, { fields: sets.map((s) => s.split(' ')[0]) }, req);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/media-types/:id/delete.
router.post('/media-types/:id/delete', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID media wajib diisi' });

    const { rows } = await db.query(
      'SELECT id, slug FROM promo_media_types WHERE id = $1 LIMIT 1',
      [id],
    );
    const existing = rows[0] || null;
    if (!existing) return res.status(404).json({ success: false, error: 'Media tidak ditemukan' });

    // Tolak bila masih dipakai pengajuan (slug = snapshot historis).
    const { rows: usedRows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM promo_submissions WHERE media_type_slug = $1',
      [existing.slug],
    );
    if ((usedRows[0]?.n || 0) > 0) {
      return res.status(400).json({ success: false, error: 'Media type masih dipakai pengajuan. Nonaktifkan saja.' });
    }

    await db.query('DELETE FROM promo_media_types WHERE id = $1', [id]);
    logActivity(req.auth.user, 'delete_media_type', 'promo_media_type', id, { slug: existing.slug }, req);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/media-types/:id/image - ganti foto katalog.
// Multipart, satu field `file`. Berkas disimpan di volume MEDIA_DIR, BUKAN di
// repo (repo read-only di produksi). Foto lama dihapus setelah yang baru
// berhasil disimpan, supaya tidak ada berkas yatim bila unggahan gagal.
router.post('/media-types/:id/image', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID media wajib diisi' });

    const { rows } = await db.query(
      'SELECT id, slug, image_path FROM promo_media_types WHERE id = $1 LIMIT 1',
      [id],
    );
    const existing = rows[0] || null;
    if (!existing) return res.status(404).json({ success: false, error: 'Media tidak ditemukan' });

    const file = await readMultipartFile(req);
    if (file.error) return res.status(400).json({ success: false, error: file.error });

    const mime = String(file.contentType || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME.includes(mime)) {
      return res.status(400).json({ success: false, error: 'Format gambar harus JPEG, PNG, atau WebP.' });
    }
    if (file.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ success: false, error: 'Gambar melebihi 4MB. Kompres dahulu.' });
    }
    const magic = checkImageMagic(file.head, mime);
    if (!magic.ok) return res.status(400).json({ success: false, error: magic.error });

    const nama = mediaFileName(existing.slug, mime);
    await simpanGambar(nama, Buffer.concat(file.chunks, file.length));
    const imagePath = urlGambar(nama);

    await db.query('UPDATE promo_media_types SET image_path = $1, updated_at = now() WHERE id = $2', [imagePath, id]);

    // Foto lama dihapus setelah DB menunjuk ke yang baru.
    const lama = namaBerkasUnggahan(existing.image_path);
    if (lama && lama !== nama) await hapusGambar(lama).catch(() => {});

    logActivity(req.auth.user, 'update_media_image', 'promo_media_type', id,
      { slug: existing.slug, mime, bytes: file.length }, req);
    return res.json({ success: true, image_path: imagePath });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/media-types/:id/image/delete - hapus foto.
// Menghapus foto berarti katalog menampilkan kartu tanpa gambar; tidak ada
// pengembalian otomatis ke foto bawaan deck (seed sengaja tidak menimpa
// image_path). Jalankan seed dengan `--reset-gambar` bila ingin kembali.
router.post('/media-types/:id/image/delete', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID media wajib diisi' });

    const { rows } = await db.query(
      'SELECT id, slug, image_path FROM promo_media_types WHERE id = $1 LIMIT 1',
      [id],
    );
    const existing = rows[0] || null;
    if (!existing) return res.status(404).json({ success: false, error: 'Media tidak ditemukan' });

    const nama = namaBerkasUnggahan(existing.image_path);
    if (nama) await hapusGambar(nama);

    await db.query("UPDATE promo_media_types SET image_path = '', updated_at = now() WHERE id = $1", [id]);
    logActivity(req.auth.user, 'delete_media_image', 'promo_media_type', id, { slug: existing.slug }, req);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// EXPORT CSV.

// GET /admin/export.
router.get('/export', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.submission_number, s.created_at, s.tenant_name, s.tenant_id,
              s.unit_number, s.pic_name, s.pic_phone, s.media_type_slug,
              s.campaign_name, s.material_title, s.installation_date, s.status,
              s.review_notes, s.notes, s.source_type, s.file_name, s.file_url,
              s.link_url, s.ip_address,
              s.applicant_type, s.submission_date, b.batch_number,
              s.subtotal, s.ppn_amount, s.total_amount
       FROM promo_submissions s
       LEFT JOIN promo_submission_batches b ON b.id = s.batch_id
       ORDER BY s.created_at DESC`,
    );

    const header = [
      'Nomor Pengajuan', 'Tanggal', 'Nama Tenant', 'Tenant ID', 'Nomor Unit',
      'Nama PIC', 'Telepon PIC', 'Jenis Media', 'Nama Campaign', 'Judul Materi',
      'Tanggal Pasang', 'Status', 'Catatan Review', 'Catatan Tenant', 'Sumber',
      'Nama File', 'URL File', 'URL Tautan', 'IP',
      'Jenis Pemohon', 'Tanggal Pengajuan', 'Nomor Batch',
      'Subtotal', 'PPN', 'Total',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.submission_number,
        r.created_at ? new Date(r.created_at).toISOString() : '',
        r.tenant_name, r.tenant_id, r.unit_number, r.pic_name, r.pic_phone,
        r.media_type_slug, r.campaign_name, r.material_title,
        r.installation_date, r.status, r.review_notes, r.notes,
        r.source_type === 'link' ? 'Tautan' : r.source_type === 'none' ? 'Menyusul' : 'Unggah',
        r.file_name, r.file_url, r.link_url, r.ip_address,
        r.applicant_type === 'non_tenant' ? 'Non-tenant' : 'Tenant',
        r.submission_date, r.batch_number,
        r.subtotal, r.ppn_amount, r.total_amount,
      ].map(csvEscape).join(','));
    }

    // BOM UTF-8 agar Excel membaca dengan benar.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pengajuan-media-promosi.csv"');
    // Ekspor memuat PII (telepon, IP) - catat siapa mengunduhnya.
    logActivity(req.auth.user, 'export_submissions', 'promo_submission', '',
      { count: rows.length }, req);
    return res.send(`\uFEFF${lines.join('\r\n')}`);
  } catch (err) {
    return next(err);
  }
});

// USERS (superadmin).

const USER_ROLES = ['superadmin', 'admin', 'tenant_relation'];

// GET /admin/users.
router.get('/users', requireRole(['superadmin']), async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, display_name, role, is_active, last_login_at, created_at FROM users ORDER BY created_at',
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/users - create.
router.post('/users', requireRole(['superadmin']), async (req, res, next) => {
  try {
    const d = req.body || {};
    const email = sanitize(d.email || '', 254).toLowerCase();
    const displayName = sanitize(d.display_name || '', 100);
    const role = sanitize(d.role || '', 30);
    const password = String(d.password || '');

    if (!email) return res.status(400).json({ success: false, error: 'Email wajib diisi' });
    if (!displayName) return res.status(400).json({ success: false, error: 'Nama wajib diisi' });
    if (!USER_ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Role tidak valid' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password minimal 8 karakter' });

    const { rows: dupe } = await db.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (dupe[0]) return res.status(400).json({ success: false, error: 'Email sudah terdaftar' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, display_name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [email, displayName, role, hash],
    );
    logActivity(req.auth.user, 'create_user', 'user', rows[0]?.id || '', { email, role }, req);
    return res.json({ success: true, id: rows[0]?.id || '' });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/users/:id - update.
router.post('/users/:id', requireRole(['superadmin']), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    const d = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'ID user wajib diisi' });

    const { rows: existingRows } = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [id]);
    if (!existingRows[0]) return res.status(404).json({ success: false, error: 'User tidak ditemukan' });

    const sets = [];
    const values = [];
    const displayName = sanitize(d.display_name || '', 100);
    if (displayName) {
      values.push(displayName);
      sets.push(`display_name = $${values.length}`);
    }
    const role = sanitize(d.role || '', 30);
    if (role) {
      if (!USER_ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Role tidak valid' });
      values.push(role);
      sets.push(`role = $${values.length}`);
    }
    if (d.is_active !== undefined) {
      values.push(d.is_active === true);
      sets.push(`is_active = $${values.length}`);
    }
    if (d.password) {
      const password = String(d.password);
      if (password.length < 8) return res.status(400).json({ success: false, error: 'Password minimal 8 karakter' });
      values.push(await bcrypt.hash(password, 10));
      sets.push(`password_hash = $${values.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'Tidak ada perubahan' });

    sets.push('updated_at = now()');
    values.push(id);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

    logActivity(req.auth.user, 'update_user', 'user', id, { fields: sets.map((s) => s.split(' ')[0]) }, req);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/users/:id/delete.
router.post('/users/:id/delete', requireRole(['superadmin']), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID user wajib diisi' });
    if (id === req.auth.user.id) {
      return res.status(400).json({ success: false, error: 'Tidak bisa menghapus akun sendiri' });
    }

    const { rows } = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'User tidak ditemukan' });

    logActivity(req.auth.user, 'delete_user', 'user', id, null, req);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
