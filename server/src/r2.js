/**
 * R2 (Cloudflare) — penyimpanan materi promosi tenant.
 * Pola schedule-event-v2/server/src/r2.js dengan perubahan:
 *   - prefix tunggal 'promo/' (dipaksa server; klien tidak bisa pilih folder)
 *   - MIME: JPEG/PNG/PDF/MP4 (videotron + parapet butuh MP4)
 *   - endpoint publik POST /r2/presign-public (tenant tanpa login, rate-limited)
 *
 *   POST /api/v1/r2/presign-public — presigned PUT (klien upload langsung ke R2)
 *   POST /api/v1/r2/delete        — hapus object (staff)
 */
import { Router } from 'express';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { requireRole, logActivity } from './auth.js';
import { enforceRateLimit } from './lib/rateLimit.js';

// ─── R2 client ───────────────────────────────────────────────────
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';

export const r2Ready = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'medprom-media';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'video/mp4',
]);

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
};

const ALLOWED_PREFIXES = ['promo/'];

/** Cap ukuran file (sinkron FE wizard MAX_FILE_BYTES = 50MB). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function validateContentType(contentType) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(ct)) {
    return { ok: false, error: 'Content type tidak diizinkan. Gunakan JPEG, PNG, PDF, atau MP4.' };
  }
  return { ok: true, contentType: ct, ext: MIME_EXT[ct] };
}

function buildSafeObjectKey({ originalName, contentType }) {
  const mime = validateContentType(contentType);
  if (!mime.ok) return mime;

  const prefix = 'promo/';
  const base = String(originalName || '')
    .split(/[/\\]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 40);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const key = `${prefix}${stamp}${base ? `-${base}` : ''}.${mime.ext}`;

  return { ok: true, key, contentType: mime.contentType };
}

/** Ubah public URL R2 → object key (kosong bila URL di luar R2_PUBLIC_URL). */
function publicUrlToKey(url) {
  if (!R2_PUBLIC_URL || !url) return '';
  const str = String(url);
  if (!str.startsWith(`${R2_PUBLIC_URL}/`)) return '';
  return str.slice(R2_PUBLIC_URL.length + 1);
}

/** Validasi key R2 yang sudah ada (prefix allowlist + anti-traversal). */
function validateExistingKey(fileName) {
  const key = String(fileName || '').replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (!key || key.includes('..') || key.includes('\0')) {
    return { ok: false, error: 'Nama file tidak valid' };
  }
  const allowed = ALLOWED_PREFIXES.some((p) => key === p || key.startsWith(p));
  if (!allowed) return { ok: false, error: 'Folder tidak diizinkan' };
  return { ok: true, key };
}

/** Hapus object R2 best-effort (tidak melempar; warn + log). */
export async function deleteR2File(url) {
  const key = publicUrlToKey(url);
  if (!key) return;
  try {
    await R2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.warn('[deleteR2File] gagal (best-effort):', key, err.message);
  }
}

/** Hapus object R2 yang MELEMPAR saat gagal — alur butuh kepastian. */
export async function deleteR2FileOrThrow(url) {
  const key = publicUrlToKey(url);
  if (!key) throw new Error('File URL tidak valid');
  await R2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

/**
 * Signature magic-bytes per MIME yang diizinkan (sinkron ALLOWED_MIME).
 * Verifikasi isi file, bukan hanya Content-Type yang diklaim.
 * Fail-closed: tipe tak dikenal / isi tidak cocok → tolak.
 */
const MIME_MAGIC = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  'video/mp4': [], // ftyp box: dicek khusus di bawah
};

/** Verifikasi magic bytes object R2 dari public URL. */
export async function verifyMimeMagicBytes(url, mimeType) {
  const key = publicUrlToKey(url);
  if (!key || !R2_PUBLIC_URL) return { ok: false, error: 'File URL tidak valid' };
  const ct = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const signatures = MIME_MAGIC[ct];
  if (!signatures) return { ok: false, error: 'Tipe file tidak dikenali.' };
  const obj = await R2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, Range: 'bytes=0-31' }));
  const buf = Buffer.from(await obj.Body.transformToByteArray());
  const matchesSig = signatures.some((sig) => sig.every((byte, i) => buf[i] === byte));
  if (!matchesSig) return { ok: false, error: 'Isi file tidak sesuai dengan tipe yang dipilih.' };
  if (ct === 'video/mp4') {
    // ISO BMFF: bytes 4-7 harus 'ftyp'.
    const isMp4 = buf.length >= 8 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
    if (!isMp4) return { ok: false, error: 'Isi file tidak sesuai dengan tipe MP4.' };
  }
  return { ok: true };
}

/**
 * HEAD object R2 dari public URL — verifikasi keberadaan + ContentLength
 * (ContentLength TIDAK ditandatangani saat presign → dicek post-upload).
 * @returns {{ ok: true, contentLength: number } | { ok: false, notFound?: boolean, error: string }}
 */
export async function headR2File(url) {
  const key = publicUrlToKey(url);
  if (!key || !R2_PUBLIC_URL) return { ok: false, error: 'File URL tidak valid' };
  try {
    const head = await R2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return { ok: true, contentLength: Number(head.ContentLength || 0) };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404) {
      return { ok: false, notFound: true, error: 'File tidak ditemukan di storage. Silakan unggah ulang.' };
    }
    console.error('[headR2File] HEAD R2 failed:', key, err.message);
    return { ok: false, error: 'Gagal memeriksa file di storage' };
  }
}

// ─── Router ─────────────────────────────────────────────────────
const router = Router();

/** 503 bersih bila R2 belum dikonfigurasi. */
router.use((_req, res, next) => {
  if (!r2Ready) {
    return res.status(503).json({ success: false, error: 'Layanan upload sedang tidak tersedia.' });
  }
  next();
});

// ─── POST /r2/presign-public — tenant (tanpa login) ─────────────
router.post('/presign-public', async (req, res, next) => {
  try {
    // 20 presign / 15 mnt / IP (wizard maks ~4 file per pengajuan).
    if (!enforceRateLimit(req, res, 'presign-public', 20, 15 * 60 * 1000)) return;

    const { originalName, contentType } = req.body || {};

    const safe = buildSafeObjectKey({
      originalName,
      contentType,
    });
    if (!safe.ok) return res.status(400).json({ success: false, error: safe.error });

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: safe.key,
      ContentType: safe.contentType,
    });

    const uploadUrl = await getSignedUrl(R2, command, { expiresIn: 300 });
    const url = `${R2_PUBLIC_URL}/${safe.key}`;

    res.json({ success: true, uploadUrl, publicUrl: url, fileName: safe.key });
  } catch (error) {
    console.error('R2 presign-public error:', error);
    next(error);
  }
});

// ─── POST /r2/delete — staff ─────────────────────────────────────
router.post('/delete', requireRole(['superadmin', 'admin']), async (req, res, next) => {
  try {
    const { fileName } = req.body || {};
    const safe = validateExistingKey(fileName);
    if (!safe.ok) return res.status(400).json({ success: false, error: safe.error });

    await R2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: safe.key }));
    logActivity(req.auth?.user || null, 'delete_r2_file', 'r2', safe.key, null, req);
    res.json({ success: true });
  } catch (error) {
    console.error('R2 delete error:', error);
    next(error);
  }
});

export default router;
export { R2_BUCKET, R2_PUBLIC_URL };
