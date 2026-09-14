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

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────
function sanitize(val, maxLen = 1000) {
  if (typeof val !== 'string') return '';
  return val.replace(/\0/g, '').trim().slice(0, maxLen);
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const STATUSES = ['pending', 'approved', 'rejected', 'installed'];
const SLUG_RE = /^[a-z0-9-]+$/;
const CATEGORIES = ['outdoor', 'indoor', 'social'];

// ══════════ SUBMISSIONS ══════════

// ─── GET /admin/submissions ─────────────────────────────────────
router.get('/submissions', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const status = String(req.query?.status || '').trim();
    const mediaType = String(req.query?.media_type || '').trim();
    const page = Math.max(1, parseInt(String(req.query?.page || '1'), 10) || 1);
    const perPage = 20;

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
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

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

// ─── POST /admin/submissions/:id/status ─────────────────────────
router.post('/submissions/:id/status', requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const id = String(req.params?.id || '').trim();
    const status = String(req.body?.status || '').trim();
    const reviewNotes = sanitize(req.body?.review_notes || '', 2000);

    if (!id) return res.status(400).json({ success: false, error: 'ID pengajuan wajib diisi' });
    if (!STATUSES.includes(status) || status === 'pending') {
      return res.status(400).json({ success: false, error: 'Status harus approved, rejected, atau installed' });
    }

    const { rows } = await db.query(
      `UPDATE promo_submissions
       SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
       WHERE id = $4
       RETURNING id`,
      [status, reviewNotes, req.auth.user.id, id],
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Pengajuan tidak ditemukan' });

    logActivity(req.auth.user, 'update_submission_status', 'promo_submission', id, { status }, req);
    return res.json({ success: true });
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

    // Pengajuan bertautan tidak menyimpan file di Drive kami — tak ada yang dihapus.
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
         price_note, location_note, rules, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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

// ══════════ EXPORT CSV ══════════

// ─── GET /admin/export ──────────────────────────────────────────
router.get('/export', requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.created_at, s.tenant_name, s.tenant_id, s.pic_name, s.pic_phone,
              s.media_type_slug, s.installation_date, s.status, s.review_notes,
              s.notes, s.source_type, s.file_name, s.file_url, s.link_url, s.ip_address
       FROM promo_submissions s
       ORDER BY s.created_at DESC`,
    );

    const header = [
      'Tanggal', 'Nama Gerai', 'Tenant ID', 'Nama PIC', 'Telepon PIC', 'Jenis Media',
      'Tanggal Pasang', 'Status', 'Catatan Review', 'Catatan Tenant', 'Sumber',
      'Nama File', 'URL File', 'URL Tautan', 'IP',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.created_at ? new Date(r.created_at).toISOString() : '',
        r.tenant_name, r.tenant_id, r.pic_name, r.pic_phone, r.media_type_slug,
        r.installation_date, r.status, r.review_notes, r.notes,
        r.source_type === 'link' ? 'Tautan' : 'Unggah',
        r.file_name, r.file_url, r.link_url, r.ip_address,
      ].map(csvEscape).join(','));
    }

    // BOM UTF-8 agar Excel membaca dengan benar.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pengajuan-media-promosi.csv"');
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
