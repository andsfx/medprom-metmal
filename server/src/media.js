/**
 * media.js — penyimpanan gambar katalog media promosi.
 *
 * Katalog dari deck sudah memuat foto contoh (public/media/*.webp, disajikan
 * Vercel). Modul ini menambahkan jalur GANTI: staf dapat mengunggah foto baru
 * dari dashboard, dan foto itu disimpan di volume Docker (`MEDIA_DIR`), bukan
 * di repo — repo di-bind-mount read-only di produksi.
 *
 * Konsekuensi yang disengaja: seed TIDAK menimpa `image_path` lagi (lihat
 * seed-media-types.mjs), supaya foto hasil unggahan staf tidak dikembalikan
 * ke foto bawaan deck setiap kali seed dijalankan.
 *
 * Keamanan:
 *  - Nama berkas diturunkan dari slug (bukan dari nama kiriman klien) +
 *    nama acak, sehingga tidak ada path traversal dan tidak ada tabrakan.
 *  - Isi berkas diverifikasi magic bytes SEBELUM ditulis.
 *  - Penyajian hanya dari dalam MEDIA_DIR; nama berkas divalidasi pola ketat.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createReadStream } from 'node:fs';

/** Direktori penyimpanan — volume Docker di produksi. */
export const MEDIA_DIR = process.env.MEDIA_DIR || '/data/media';

/** Batas ukuran gambar katalog (foto contoh, bukan materi cetak). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB

const IMAGE_MAGIC = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  // WebP = 'RIFF' .... 'WEBP' (bytes 0-3 dan 8-11).
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};

export const ALLOWED_IMAGE_MIME = Object.keys(IMAGE_MAGIC);

const EXT_OF = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Cek magic bytes gambar. Fail-closed. */
export function checkImageMagic(head, mimeType) {
  const ct = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const sigs = IMAGE_MAGIC[ct];
  if (!sigs) {
    return { ok: false, error: 'Format gambar harus JPEG, PNG, atau WebP.' };
  }
  const cocok = sigs.some((sig) => sig.every((b, i) => head[i] === b));
  if (!cocok) {
    return { ok: false, error: 'Isi berkas tidak sesuai dengan format gambarnya.' };
  }
  // WebP: bytes 8-11 wajib 'WEBP' (RIFF juga dipakai WAV/AVI).
  if (ct === 'image/webp') {
    const tag = head.subarray(8, 12).toString('latin1');
    if (tag !== 'WEBP') {
      return { ok: false, error: 'Isi berkas bukan WebP yang sah.' };
    }
  }
  return { ok: true };
}

/** Nama berkas aman: slug + sufiks acak + ekstensi dari mime. */
export function mediaFileName(slug, mimeType) {
  const bersih = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'media';
  const acak = randomBytes(4).toString('hex');
  return `${bersih}-${acak}.${EXT_OF[mimeType] || 'bin'}`;
}

/** Tulis gambar ke MEDIA_DIR; kembalikan nama berkasnya. */
export async function simpanGambar(namaBerkas, buffer) {
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(join(MEDIA_DIR, namaBerkas), buffer);
  return namaBerkas;
}

/** Hapus gambar bila ada; tidak melempar bila berkas sudah tidak ada. */
export async function hapusGambar(namaBerkas) {
  const nama = basename(String(namaBerkas || ''));
  if (!nama) return;
  try {
    await unlink(join(MEDIA_DIR, nama));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Ambil nama berkas dari `image_path` bila berkas itu milik penyimpanan ini.
 * Foto bawaan deck ('/media/x.webp') BUKAN milik penyimpanan ini → null,
 * sehingga mengganti foto bawaan tidak mencoba menghapus berkas Vercel.
 */
export function namaBerkasUnggahan(imagePath) {
  const p = String(imagePath || '');
  const m = p.match(/^\/api\/v1\/media\/([A-Za-z0-9._-]+)$/);
  return m ? m[1] : null;
}

/** URL publik untuk sebuah nama berkas. */
export function urlGambar(namaBerkas) {
  return `/api/v1/media/${namaBerkas}`;
}

/**
 * Kirim satu gambar. Dipakai router GET /api/v1/media/:nama.
 * Nama divalidasi pola ketat supaya tidak ada path traversal.
 */
export async function kirimGambar(nama, res) {
  const aman = String(nama || '');
  if (!/^[A-Za-z0-9._-]+$/.test(aman) || aman.includes('..')) {
    res.status(400).json({ success: false, error: 'Nama berkas tidak sah' });
    return;
  }
  const tipe = aman.endsWith('.png') ? 'image/png'
    : aman.endsWith('.jpg') || aman.endsWith('.jpeg') ? 'image/jpeg'
      : aman.endsWith('.webp') ? 'image/webp' : '';
  if (!tipe) {
    res.status(400).json({ success: false, error: 'Jenis berkas tidak didukung' });
    return;
  }
  const stream = createReadStream(join(MEDIA_DIR, aman));
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ success: false, error: 'Gambar tidak ditemukan' });
  });
  res.setHeader('Content-Type', tipe);
  // Nama berkas mengandung sufiks acak → isinya tidak pernah berubah.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  stream.pipe(res);
}
