/**
 * Test penyimpanan gambar katalog (server/src/media.js).
 *
 * Fokus: hal-hal yang kalau salah jadi lubang keamanan atau kehilangan data —
 * validasi magic bytes, nama berkas yang tidak bisa keluar dari MEDIA_DIR,
 * dan pengenalan foto bawaan deck vs foto unggahan staf.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let media;
let DIR;

beforeAll(async () => {
  DIR = await mkdtemp(join(tmpdir(), 'medprom-media-'));
  // vi.stubEnv (bukan process.env langsung) agar MEDIA_DIR dikembalikan
  // setelah berkas ini selesai — suite ini berjalan sejajar dengan berkas
  // test lain, dan env yang bocor merusak mereka.
  vi.stubEnv('MEDIA_DIR', DIR);
  media = await import('../../server/src/media.js');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(DIR, { recursive: true, force: true });
});

describe('checkImageMagic — fail-closed', () => {
  it('menerima JPEG, PNG, dan WebP yang sah', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const webp = Buffer.concat([
      Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'),
    ]);
    expect(media.checkImageMagic(jpeg, 'image/jpeg').ok).toBe(true);
    expect(media.checkImageMagic(png, 'image/png').ok).toBe(true);
    expect(media.checkImageMagic(webp, 'image/webp').ok).toBe(true);
  });

  it('menolak tipe di luar daftar', () => {
    const r = media.checkImageMagic(Buffer.from('GIF89a'), 'image/gif');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JPEG, PNG, atau WebP/);
  });

  it('menolak isi yang tidak cocok dengan tipe yang diklaim', () => {
    const pngDiklaimJpeg = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(media.checkImageMagic(pngDiklaimJpeg, 'image/jpeg').ok).toBe(false);
  });

  it('menolak RIFF yang bukan WEBP (mis. WAV)', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
    const r = media.checkImageMagic(wav, 'image/webp');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/bukan WebP/);
  });
});

describe('mediaFileName — nama tidak bisa keluar dari MEDIA_DIR', () => {
  it('membersihkan slug berbahaya menjadi nama aman', () => {
    const nama = media.mediaFileName('../../etc/passwd', 'image/png');
    expect(nama).not.toContain('/');
    expect(nama).not.toContain('..');
    expect(nama).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}\.png$/);
  });

  it('memberi sufiks acak sehingga dua unggahan tidak bertabrakan', () => {
    const a = media.mediaFileName('spanduk', 'image/jpeg');
    const b = media.mediaFileName('spanduk', 'image/jpeg');
    expect(a).not.toBe(b);
  });

  it('slug kosong tetap menghasilkan nama yang sah', () => {
    expect(media.mediaFileName('', 'image/webp')).toMatch(/^media-[0-9a-f]{8}\.webp$/);
  });
});

describe('namaBerkasUnggahan — hanya mengenali foto milik penyimpanan ini', () => {
  it('mengenali URL gambar unggahan', () => {
    expect(media.namaBerkasUnggahan('/api/v1/media/spanduk-ab12cd34.webp')).toBe('spanduk-ab12cd34.webp');
  });

  it('TIDAK menganggap foto bawaan deck sebagai milik penyimpanan ini', () => {
    // Penting: kalau salah dikenali, mengganti foto bawaan akan mencoba
    // menghapus berkas yang disajikan Vercel.
    expect(media.namaBerkasUnggahan('/media/spanduk.webp')).toBeNull();
    expect(media.namaBerkasUnggahan('')).toBeNull();
    expect(media.namaBerkasUnggahan('https://contoh.test/a.webp')).toBeNull();
  });
});

describe('simpanGambar / hapusGambar', () => {
  it('menulis lalu menghapus berkas, dan hapus ulang tidak melempar', async () => {
    const nama = media.mediaFileName('spanduk', 'image/png');
    const isi = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await media.simpanGambar(nama, isi);

    expect(await readdir(DIR)).toContain(nama);
    expect(Buffer.compare(await readFile(join(DIR, nama)), isi)).toBe(0);

    await media.hapusGambar(nama);
    expect(await readdir(DIR)).not.toContain(nama);
    // Menghapus yang sudah tidak ada bukan error.
    await expect(media.hapusGambar(nama)).resolves.toBeUndefined();
  });

  it('hapusGambar mengabaikan jalur relatif yang mencoba keluar direktori', async () => {
    // basename() dipakai, jadi '../rahasia' menjadi 'rahasia' di dalam DIR.
    await expect(media.hapusGambar('../../rahasia.txt')).resolves.toBeUndefined();
  });
});
