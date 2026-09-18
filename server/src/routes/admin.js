/**
 * Routes admin — mount di /api/v1/admin (semua requireRole).
 *
 *   GET  /admin/submissions?status=&media_type=&page=   — daftar paginasi (read roles)
 *   POST /admin/submissions/:id/status                  — review status (staff)
 *   POST /admin/submissions/:id/delete                  — hapus + bersihkan Drive (staff)
 *   GET  /admin/media-types                             — semua katalog (read roles)
 *   POST /admin/media-types                              — create (staff)
 *   POST /admin/media-types/:id                          — update (staff)
 *   POST /admin/media-types/:id/delete                   — delete (staff)
 *   GET  /admin/export                                   — CSV UTF-8 BOM (read roles)
 *   GET  /admin/users                                    — user mgmt (superadmin)
 *   POST /admin/users                                    — create (superadmin)
 *   POST /admin/users/:id                                — update (superadmin)
 *   POST /admin/users/:id/delete                         — delete (superadmin)
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { db } from '../db.js';
import { requireRole, logActivity, READ_ROLES, STAFF_ROLES } from '../auth.js';
import { deleteDriveFileOrThrow } from '../drive.js';
import { readMultipartFile } from '../drive.js';
import {
  ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES, checkImageMagic, mediaFileName,
  simpanGambar, hapusGambar, namaBerkasUnggahan, urlGambar,
} from '../media.js';
import { SUBMISSION_STATUSES, canTransition, isInstallableStatus } from '../lib/statusFlow.js';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────
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
 * sel berawalan salah satu karakter itu diberi awalan `'` — di Excel tanda
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ══════════ SUBMISSIONS ══════════

// ─── GET /admin/submissions ─────────────────────────────────────
// Filter: status, media_type, tenant, rentang tanggal, plus pencarian bebas
// (nomor pengajuan / tenant / judul materi) — FR-026, FR-027.
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
    where.push(`status = $${values.length}`);
  }
  if (mediaType) {
    values.push(mediaType);
    where.push(`media_type_slug = $${values.length}`);
  }
  if (tenant) {
    values.push(`%${tenant}%`);
    where.push(`tenant_name ILIKE $${values.length}`);
  }
  if (DATE_RE.test(dateFrom)) {
    values.push(dateFrom);
    where.push(`created_at >= $${values.length}::date`);
  }
  if (DATE_RE.test(dateTo)) {
    values.push(dateTo);
    // `dateTo` inklusif sampai akhir hari.
    where.push(`created_at < ($${values.length}::date + interval '1 day')`);
  }
  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    where.push(`(submission_number ILIKE ${p} OR tenant_name ILIKE ${p} OR material_title ILIKE ${p})`);
  }
  return { whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', values };
}

router.get('/submissions', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query?.page || '1'), 10) || 1);
    const perPage = 20;
    const { whereSql, values } = buildSubmissionFilters(req.query);

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM promo_submissions ${whereSql}`,
      values,
    );
    const total = countRows[0]?.n || 0;

    values.push(perPage);
    values.push((page - 1) * perPage);
    const { rows } = await db.query(
      `SELECT s.*, u.display_name AS reviewed_by_name
       FROM promo_submissions s
       LEFT JOIN users u ON u.id = s.reviewed_by
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

// ─── GET /admin/submissions/summary — jumlah per status (FR-025) ─
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

// ─── GET /admin/submissions/:id — detail lengkap (FR-028..FR-030) ─
router.get('/submissions/:id', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });

    const { rows } = await db.query(
      `SELECT s.*, u.display_name AS reviewed_by_name
       FROM promo_submissions s
       LEFT JOIN users u ON u.id = s.reviewed_by
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
                proof_url, installed_by, installed_by_id, created_at, updated_at
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

// ─── POST /admin/submissions/:id/status ─────────────────────────
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

// ─── POST /admin/submissions/:id/installation ───────────────────
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

    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });
    if (!mediaLocation) return res.status(400).json({ success: false, error: 'Media atau lokasi pemasangan wajib diisi' });
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
             proof_url = $5, installed_by = $6, installed_by_id = $7, updated_at = now()
         WHERE submission_id = $8`,
        [mediaLocation, startDate, endDate, notes, proofUrl, req.auth.user.display_name, req.auth.user.id, id],
      );
    } else {
      await db.query(
        `INSERT INTO promo_installations
          (submission_id, media_location, start_date, end_date, notes, proof_url, installed_by, installed_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, mediaLocation, startDate, endDate, notes, proofUrl, req.auth.user.display_name, req.auth.user.id],
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

// ─── POST /admin/submissions/:id/delete ─────────────────────────
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

    // Pengajuan bertautan atau legacy R2 (tanpa drive_file_id) — tak ada yang dihapus dari Drive.
    if (existing.source_type !== 'link' && existing.drive_file_id) {
      // Hapus Drive DULU dengan kepastian (throw) — gagal → row tetap, retry aman.
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

// ══════════ MEDIA TYPES (katalog) ══════════

// ─── GET /admin/media-types ────────────────────────────────────
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

// ─── POST /admin/media-types — create ───────────────────────────
router.post('/media-types', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const d = req.body || {};
    const slug = sanitize(d.slug || '', 60);
    const name = sanitize(d.name || '', 100);
    const category = sanitize(d.category || '', 20);

    if (!slug || !SLUG_RE.test(slug)) {
      return res.status(400).json({ success: false, error: 'Slug wajib huruf kecil/angka/tanda hubung' });
    }
    if (!name) return res.status(400).json({ success: false, error: 'Nama wajib diisi' });
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Kategori harus outdoor, indoor, atau social' });
    }

    const { rows: dupe } = await db.query(
      'SELECT id FROM promo_media_types WHERE slug = $1 LIMIT 1',
      [slug],
    );
    if (dupe[0]) return res.status(400).json({ success: false, error: 'Slug sudah dipakai' });

    const { rows } = await db.query(
      `INSERT INTO promo_media_types
        (slug, category, name, size_spec, material_spec, accepted_formats,
         price_note, location_note, rules, image_path, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      ],
    );
    const id = rows[0]?.id || '';
    logActivity(req.auth.user, 'create_media_type', 'promo_media_type', id, { slug }, req);
    return res.json({ success: true, id });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /admin/media-types/:id — update ───────────────────────
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

    const sets = [];
    const values = [];
    const fields = {
      slug,
      category,
      name: sanitize(d.name || '', 100),
      size_spec: sanitize(d.size_spec || '', 200),
      material_spec: sanitize(d.material_spec || '', 200),
      accepted_formats: sanitize(d.accepted_formats || '', 60),
      price_note: sanitize(d.price_note || '', 200),
      location_note: sanitize(d.location_note || '', 300),
      rules: sanitize(d.rules || '', 5000),
      image_path: sanitize(d.image_path || '', 200),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (!value) continue;
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

// ─── POST /admin/media-types/:id/delete ─────────────────────────
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

// ─── POST /admin/media-types/:id/image — ganti foto katalog ─────
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

// ─── POST /admin/media-types/:id/image/delete — hapus foto ──────
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

// ══════════ EXPORT CSV ══════════

// ─── GET /admin/export ──────────────────────────────────────────
router.get('/export', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.submission_number, s.created_at, s.tenant_name, s.tenant_id,
              s.unit_number, s.pic_name, s.pic_phone, s.media_type_slug,
              s.campaign_name, s.material_title, s.installation_date, s.status,
              s.review_notes, s.notes, s.source_type, s.file_name, s.file_url,
              s.link_url, s.ip_address
       FROM promo_submissions s
       ORDER BY s.created_at DESC`,
    );

    const header = [
      'Nomor Pengajuan', 'Tanggal', 'Nama Gerai', 'Tenant ID', 'Nomor Unit',
      'Nama PIC', 'Telepon PIC', 'Jenis Media', 'Nama Campaign', 'Judul Materi',
      'Tanggal Pasang', 'Status', 'Catatan Review', 'Catatan Tenant', 'Sumber',
      'Nama File', 'URL File', 'URL Tautan', 'IP',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.submission_number,
        r.created_at ? new Date(r.created_at).toISOString() : '',
        r.tenant_name, r.tenant_id, r.unit_number, r.pic_name, r.pic_phone,
        r.media_type_slug, r.campaign_name, r.material_title,
        r.installation_date, r.status, r.review_notes, r.notes,
        r.source_type === 'link' ? 'Tautan' : 'Unggah',
        r.file_name, r.file_url, r.link_url, r.ip_address,
      ].map(csvEscape).join(','));
    }

    // BOM UTF-8 agar Excel membaca dengan benar.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pengajuan-media-promosi.csv"');
    // Ekspor memuat PII (telepon, IP) — catat siapa mengunduhnya.
    logActivity(req.auth.user, 'export_submissions', 'promo_submission', '',
      { count: rows.length }, req);
    return res.send(`\uFEFF${lines.join('\r\n')}`);
  } catch (err) {
    return next(err);
  }
});

// ══════════ USERS (superadmin) ══════════

const USER_ROLES = ['superadmin', 'admin', 'tenant_relation'];

// ─── GET /admin/users ───────────────────────────────────────────
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

// ─── POST /admin/users — create ─────────────────────────────────
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

// ─── POST /admin/users/:id — update ─────────────────────────────
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

// ─── POST /admin/users/:id/delete ───────────────────────────────
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
