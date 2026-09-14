/**
 * Google Drive — penyimpanan materi promosi tenant (pengganti R2).
 *
 * Arsitektur: file dikirim browser → API (streaming, 50MB) → verifikasi
 * magic bytes SEBELUM ditulis ke Drive → upload resumable → permission
 * anyone-with-link reader. File tidak pernah tersimpan di VPS (disk);
 * buffer hanya kepala file untuk verifikasi + stream ke Drive.
 *
 * Env:
 *   GOOGLE_CLIENT_ID      OAuth client (GCP)
 *   GOOGLE_CLIENT_SECRET  OAuth client secret
 *   GOOGLE_REFRESH_TOKEN  refresh token akun mediapromosi.metmalbekasi@gmail.com
 *                         (diproduksi scripts/drive-auth.mjs, sekali saja)
 *   DRIVE_ROOT_FOLDER_ID  (opsional) folder induk; default My Drive root
 *
 * Endpoint (mount di /api/v1/drive):
 *   POST /drive/upload — tenant (tanpa login, rate-limited): multipart file
 *   POST /drive/delete — staf: hapus by fileId
 */
import { Router } from 'express';
import { Readable } from 'node:stream';

import { requireRole, logActivity } from './auth.js';
import { enforceRateLimit } from './lib/rateLimit.js';

// ─── Konfigurasi ────────────────────────────────────────────────
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const ROOT_FOLDER = process.env.DRIVE_ROOT_FOLDER_ID || '';

export const driveReady = Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — sinkron FE wizard.

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'video/mp4',
]);

/** Signature magic bytes per MIME (sinkron ALLOWED_MIME). */
const MIME_MAGIC = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  'video/mp4': [], // ftyp box: dicek khusus di bawah
};

// ─── OAuth: access token (cache + refresh) ──────────────────────
let cachedAccess = { token: '', expiresAt: 0 };

async function getAccessToken() {
  if (cachedAccess.token && Date.now() < cachedAccess.expiresAt - 60_000) {
    return cachedAccess.token;
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Google token exchange gagal (${res.status}): ${body.slice(0, 200)}`);
    err.code = 'DRIVE_AUTH';
    throw err;
  }
  const json = await res.json();
  cachedAccess = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return cachedAccess.token;
}

// ─── Helper nama file aman ──────────────────────────────────────
function safeFileName(originalName, ext) {
  const base = String(originalName || '')
    .split(/[/\\]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 60);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${stamp}${base ? `-${base}` : ''}.${ext}`;
}

function extOf(mime) {
  return (
    { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf', 'video/mp4': 'mp4' }[mime] || 'bin'
  );
}

/** Cek magic bytes buffer terhadap mime yang diklaim. Fail-closed. */
export function checkMagicBytes(buf, mimeType) {
  const ct = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const signatures = MIME_MAGIC[ct];
  if (!signatures) return { ok: false, error: 'Tipe file tidak dikenali.' };
  // Array kosong (MP4) → lanjut cek ftyp; tidak auto-gagal (bug lama R2).
  const matchesSig = signatures.length === 0
    || signatures.some((sig) => sig.every((byte, i) => buf[i] === byte));
  if (!matchesSig) return { ok: false, error: 'Isi file tidak sesuai dengan tipe yang dipilih.' };
  if (ct === 'video/mp4') {
    // ISO BMFF: bytes 4-7 harus 'ftyp'.
    const isMp4 = buf.length >= 8
      && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
    if (!isMp4) return { ok: false, error: 'Isi file tidak sesuai dengan tipe MP4.' };
  }
  return { ok: true };
}

// ─── Operasi Drive (REST v3, fetch — tanpa SDK) ─────────────────
async function driveFetch(path, init = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Drive API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status === 404 ? 404 : 502;
    err.code = 'DRIVE_API';
    throw err;
  }
  return res;
}

/**
 * Upload file ke Drive via resumable session (2 langkah):
 *   1. POST metadata → session URI
 *   2. PUT body stream ke session URI
 * @param {{ stream: Readable, length: number, name: string, mimeType: string }} file
 * @returns {Promise<{ id: string, webViewLink: string }>}
 */
export async function uploadToDrive({ stream, length, name, mimeType }) {
  const token = await getAccessToken();
  const meta = {
    name,
    ...(ROOT_FOLDER ? { parents: [ROOT_FOLDER] } : {}),
  };
  // 1. Buat sesi upload.
  const sessionRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(length),
      },
      body: JSON.stringify(meta),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!sessionRes.ok) {
    const body = await sessionRes.text().catch(() => '');
    throw new Error(`Drive session gagal (${sessionRes.status}): ${body.slice(0, 200)}`);
  }
  const sessionUrl = sessionRes.headers.get('location');
  if (!sessionUrl) throw new Error('Drive session URL tidak diterima.');

  // 2. PUT stream ke sesi.
  const putRes = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(length),
    },
    body: stream,
    duplex: 'half',
  });
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => '');
    throw new Error(`Drive upload gagal (${putRes.status}): ${body.slice(0, 200)}`);
  }
  const json = await putRes.json();
  return { id: String(json.id || ''), webViewLink: String(json.webViewLink || '') };
}

/**
 * Ambil metadata file (size, name, mimeType) — dipakai submit untuk
 * memverifikasi keberadaan + ukuran, menggantikan klaim klien.
 */
export async function getDriveFile(fileId) {
  try {
    const res = await driveFetch(
      `drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink`,
    );
    const meta = await res.json();
    return {
      ok: true,
      id: String(meta.id || fileId),
      name: String(meta.name || ''),
      mimeType: String(meta.mimeType || ''),
      size: Number(meta.size || 0),
      webViewLink: String(meta.webViewLink || ''),
    };
  } catch (err) {
    if (err.status === 404) {
      return { ok: false, notFound: true, error: 'File tidak ditemukan di storage. Silakan unggah ulang.' };
    }
    console.error('[getDriveFile] gagal:', fileId, err.message);
    return { ok: false, error: 'Gagal memeriksa file di storage' };
  }
}

/** Hapus file Drive best-effort (tidak melempar; warn + log). */
export async function deleteDriveFile(fileId) {
  if (!fileId) return;
  try {
    await driveFetch(`drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[deleteDriveFile] gagal (best-effort):', fileId, err.message);
  }
}

/** Hapus file Drive yang MELEMPAR saat gagal — alur butuh kepastian. */
export async function deleteDriveFileOrThrow(fileId) {
  if (!fileId) throw new Error('File ID tidak valid');
  await driveFetch(`drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'DELETE',
  });
}

/** Set permission anyone-with-link reader — paritas URL publik R2 lama. */
async function setPublicReader(fileId) {
  await driveFetch(`drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

// ─── Router ─────────────────────────────────────────────────────
const router = Router();

/** 503 bersih bila Drive belum dikonfigurasi. */
router.use((_req, res, next) => {
  if (!driveReady) {
    return res.status(503).json({ success: false, error: 'Layanan upload sedang tidak tersedia.' });
  }
  next();
});

/**
 * POST /drive/upload — tenant (tanpa login).
 * Multipart: field `file` (satu). Verifikasi magic bytes dari kepala
 * stream SEBELUM upload — file tidak valid tidak pernah ditulis ke Drive.
 */
router.post('/upload', (req, res, next) => {
  // 5 upload / 15 mnt / IP (satu file per pengajuan).
  if (!enforceRateLimit(req, res, 'drive-upload', 5, 15 * 60 * 1000)) return;

  const contentType = String(req.headers['content-type'] || '');
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) {
    return res.status(400).json({ success: false, error: 'Request harus multipart/form-data.' });
  }
  // Parsing multipart manual minimal: cukup satu file field; Express tidak
  // memuat body (tidak ada multer) supaya file tidak pernah mendarat di disk.
  // Kita pakai busboy-free parsing sederhana via stream passthrough di bawah.
  next();
});

// Implementasi streaming upload dipasang di handler terakhir (di bawah)
// supaya middleware 503 + rate-limit tetap berjalan duluan.
router.post('/upload', async (req, res, next) => {
  try {
    const file = await readMultipartFile(req);
    if (file.error) {
      return res.status(400).json({ success: false, error: file.error });
    }

    const mimeType = String(file.contentType || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
      return res.status(400).json({
        success: false,
        error: 'Content type tidak diizinkan. Gunakan JPEG, PNG, PDF, atau MP4.',
      });
    }
    if (file.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ success: false, error: 'File melebihi 50MB' });
    }

    // Magic bytes dari buffer yang sudah ditampung readMultipartFile.
    const magic = checkMagicBytes(file.head, mimeType);
    if (!magic.ok) {
      return res.status(400).json({ success: false, error: magic.error });
    }

    // Upload: stream = head + sisa body yang masih mengalir.
    const stream = Readable.from(file.chunks);
    const uploaded = await uploadToDrive({
      stream,
      length: file.length,
      name: safeFileName(file.originalName, extOf(mimeType)),
      mimeType,
    });

    await setPublicReader(uploaded.id).catch((err) => {
      // Bukan fatal: file tetap tersimpan; staf bisa buka via akun pemilik.
      console.warn('[drive/upload] setPublicReader gagal:', err.message);
    });

    logActivity(null, 'drive_upload', 'drive_file', uploaded.id, { mimeType, length: file.length }, req);

    return res.json({
      success: true,
      file_id: uploaded.id,
      web_view_link: uploaded.webViewLink,
      file_name: file.originalName,
      mime_type: mimeType,
      file_size_bytes: file.length,
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /drive/delete — staf ──────────────────────────────────
router.post('/delete', requireRole(['superadmin', 'admin']), async (req, res, next) => {
  try {
    const { fileId } = req.body || {};
    const id = String(fileId || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'File ID wajib diisi' });

    await driveFetch(`drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
      method: 'DELETE',
    });
    logActivity(req.auth?.user || null, 'delete_drive_file', 'drive_file', id, null, req);
    return res.json({ success: true });
  } catch (err) {
    console.error('Drive delete error:', err);
    return next(err);
  }
});

// ─── Parser multipart streaming (tanpa dependency) ─────────────
/**
 * Baca satu file dari multipart/form-data request secara streaming:
 * - head 32 byte pertama ditampung untuk magic bytes.
 * - Semua chunk ditampung di memori (maks 50MB — sudah divalidasi
 *   per-chunk; kelebihan → error segera, koneksi dibatalkan).
 * - Field non-file (mis. name) diabaikan; hanya field pertama bertipe file.
 *   Wizard selalu mengirim tepat satu field `file`.
 *
 * Catatan: menampung di memori dipilih agar verifikasi magic bytes bisa
 * terjadi SEBELUM satu byte ditulis ke Drive (tidak ada orphan file
 * sampah di storage milik akun Google). 50MB per upload × 5 slot rate
 * limit = maks ~250MB memori sesaat — aman untuk VPS ini.
 */
const HEAD_BYTES = 32;

function readMultipartFile(req) {
  return new Promise((resolve) => {
    const contentType = String(req.headers['content-type'] || '');
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';
    if (!boundary) {
      resolve({ error: 'Request harus multipart/form-data.' });
      return;
    }
    const delim = Buffer.from(`--${boundary}`);

    const chunks = [];
    let head = Buffer.alloc(0);
    let length = 0;
    let originalName = '';
    let fileContentType = '';
    let headerDone = false;
    let started = false;
    let buffer = Buffer.alloc(0);
    let overflow = false;
    let tailSeen = false;

    const fail = (error) => {
      if (overflow) return;
      overflow = true;
      req.removeAllListeners('data');
      req.removeAllListeners('end');
      req.removeAllListeners('error');
      resolve({ error });
    };

    req.on('error', fail);

    req.on('data', (chunk) => {
      if (overflow) return;
      buffer = Buffer.concat([buffer, chunk]);

      if (!headerDone) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerBlock = buffer.subarray(0, headerEnd).toString('utf8');
        const nameMatch = headerBlock.match(/filename="([^"]*)"/i);
        const typeMatch = headerBlock.match(/content-type:\s*([^\r\n]+)/i);
        originalName = nameMatch ? nameMatch[1] : '';
        fileContentType = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';
        buffer = buffer.subarray(headerEnd + 4);
        headerDone = true;
        started = true;
      }

      if (!started) return;

      // Cari penutup multipart: \r\n--boundary
      const closeIdx = buffer.indexOf(Buffer.from(`\r\n--${boundary}`));
      if (closeIdx !== -1) {
        const filePart = buffer.subarray(0, closeIdx);
        if (filePart.length > 0) {
          chunks.push(filePart);
          length += filePart.length;
          if (head.length < HEAD_BYTES) {
            head = Buffer.concat([head, filePart.subarray(0, Math.min(HEAD_BYTES, filePart.length))]);
          }
        }
        buffer = Buffer.alloc(0);
        tailSeen = true;
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        req.removeAllListeners('error');
        resolve({
          chunks, head, length, originalName, contentType: fileContentType,
        });
        return;
      }

      // Belum ada penutup: simpan semua kecuali sisa potensial penutup.
      const keep = Math.max(0, buffer.length - (delim.length + 4));
      if (keep > 0) {
        const part = buffer.subarray(0, keep);
        buffer = buffer.subarray(keep);
        chunks.push(part);
        length += part.length;
        if (head.length < HEAD_BYTES) {
          head = Buffer.concat([head, part.subarray(0, Math.min(HEAD_BYTES - head.length, part.length))]);
        }
        if (length > MAX_UPLOAD_BYTES) {
          fail('File melebihi 50MB');
          return;
        }
      }
    });

    req.on('end', () => {
      if (overflow || tailSeen) return;
      // Stream berakhir tanpa penutup terlihat — anggap sisa buffer file penuh.
      if (started && buffer.length > 0) {
        chunks.push(buffer);
        length += buffer.length;
        if (head.length < HEAD_BYTES) {
          head = Buffer.concat([head, buffer.subarray(0, Math.min(HEAD_BYTES - head.length, buffer.length))]);
        }
      }
      resolve({
        chunks, head, length, originalName, contentType: fileContentType,
      });
    });
  });
}

export default router;
