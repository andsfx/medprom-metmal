/**
 * Routes promo — publik, mount di /api/v1/promo.
 *
 *   GET  /promo/media-types               — katalog aktif (tanpa rate limit)
 *   GET  /promo/tenants?q=                — cari tenant MID aktif (q >= 2 char)
 *   POST /promo/submit                   — kirim pengajuan (10 / 60 mnt / IP)
 *   GET  /promo/submissions/mine?fingerprint= — riwayat per perangkat
 *
 * Envelope: GET → { success: true, data: ... }; POST → flat { success, id, ... }.
 * Server mengembalikan row snake_case; mapping camelCase hanya di FE.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { enforceRateLimit, clientIp } from '../lib/rateLimit.js';
import { checkInstallationDate, toIsoDate } from '../lib/leadTime.js';
import { getDriveFile, MAX_UPLOAD_BYTES } from '../drive.js';

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
    const tenants = list
      .filter((t) => t.name.toLowerCase().includes(q))
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
  const picName = sanitize(body.pic_name || '', 100);
  const picPhone = sanitize(body.pic_phone || '', 20);
  const installationDate = sanitize(body.installation_date || '', 10);
  const notes = sanitize(body.notes || '', 1000);
  const driveFileId = sanitize(body.drive_file_id || '', 128);
  const fileName = sanitize(body.file_name || '', 200);
  const mimeType = sanitize(body.mime_type || '', 100);
  const fileSizeBytes = Number(body.file_size_bytes || 0);
  const fingerprint = sanitize(body.device_fingerprint || '', 100);
  const linkUrl = sanitize(body.link_url || '', 500);
  // Mode sumber: unggah file ke Drive kami, atau kirim tautan (Drive/Dropbox/dll).
  const sourceType = linkUrl && !driveFileId ? 'link' : 'upload';

  if (!mediaTypeSlug) errors.push('media_type_slug wajib diisi');
  if (!tenantName) errors.push('Nama gerai wajib diisi');
  if (!picName) errors.push('Nama PIC wajib diisi');
  if (!picPhone) errors.push('Nomor telepon PIC wajib diisi');
  else if (!PHONE_RE.test(picPhone)) errors.push('Format nomor telepon tidak valid');
  if (installationDate && !DATE_RE.test(installationDate)) errors.push('installation_date harus format YYYY-MM-DD');

  if (sourceType === 'link') {
    if (!LINK_RE.test(linkUrl)) errors.push('Tautan materi harus berupa URL http/https yang valid');
  } else {
    if (!driveFileId) errors.push('drive_file_id wajib diisi');
  }

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

    // Jalur unggah: file harus ada di Drive kami, ukuran dicek dari metadata
    // (bukan klaim klien), dan tidak boleh sudah dipakai pengajuan lain.
    let verifiedSize = 0;
    let verifiedMime = '';
    let verifiedName = '';
    let verifiedLink = '';
    if (sourceType === 'upload') {
      // Anti klaim duplikat: satu objek Drive = satu pengajuan.
      const { rows: dupeRows } = await db.query(
        'SELECT id FROM promo_submissions WHERE drive_file_id = $1 LIMIT 1',
        [driveFileId],
      );
      if (dupeRows[0]) {
        return res.status(400).json({ success: false, error: 'File sudah dipakai pengajuan lain.' });
      }

      const file = await getDriveFile(driveFileId);
      if (!file.ok) {
        return res.status(400).json({ success: false, error: file.error });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ success: false, error: 'File melebihi 50MB' });
      }
      verifiedSize = file.size;
      verifiedMime = file.mimeType;
      verifiedName = file.name;
      verifiedLink = file.webViewLink;
    }

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

    const { rows } = await db.query(
      `INSERT INTO promo_submissions
        (media_type_slug, tenant_id, tenant_name, pic_name, pic_phone,
         installation_date, notes, source_type, file_url, file_name, mime_type,
         link_url, file_size_bytes, drive_file_id, status, device_fingerprint, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16,$17)
       RETURNING id, created_at`,
      [
        mediaTypeSlug,
        tenantId,
        tenantName,
        picName,
        picPhone,
        installationDate,
        notes,
        sourceType,
        sourceType === 'upload' ? verifiedLink : '',
        sourceType === 'upload' ? verifiedName : fileName,
        sourceType === 'upload' ? verifiedMime : mimeType,
        sourceType === 'link' ? linkUrl : '',
        sourceType === 'upload' ? verifiedSize : 0,
        sourceType === 'upload' ? driveFileId : '',
        fingerprint,
        clientIp(req),
        sanitize(req.headers['user-agent'] || '', 500),
      ],
    );
    const row = rows[0] || null;
    return res.status(201).json({ success: true, id: row?.id || '', created_at: row?.created_at || null });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /promo/submissions/mine — riwayat per perangkat ─────────
router.get('/submissions/mine', async (req, res, next) => {
  const fingerprint = String(req.query?.fingerprint || '').trim();
  if (!fingerprint) {
    return res.status(400).json({ success: false, error: 'Fingerprint perangkat wajib diisi.' });
  }
  try {
    const { rows } = await db.query(
      `SELECT id, media_type_slug, status, review_notes, created_at,
              source_type, file_url, file_name, link_url
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

export default router;
