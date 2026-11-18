/**
 * Kontrak aset shell service worker.
 *
 * Aturan #2 di `public/sw.js`: "Naikkan CACHE_VERSION setiap rilis yang
 * mengubah aset shell: cache lama disapu di event `activate`."
 *
 * Kelas bug yang dicegah (pernah terjadi di commit 077de87): ikon PWA diganti
 * tetapi CACHE_VERSION tidak dinaikkan, sehingga pengguna yang sudah punya SW
 * lama terus disajikan ikon lama dari cache tanpa batas. Test ini mem-pin
 * (CACHE_VERSION, hash isi aset shell) sebagai pasangan: mengubah salah satu
 * tanpa memperbarui pin akan gagal, memaksa pengembang menghadapi keputusan
 * versi cache.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const PINNED_VERSION = 'v16';
// sha256 dari "<asset>:<sha256 isi>\n..." untuk semua SHELL_ASSETS kecuali '/'.
const PINNED_HASH = 'b5082c1b6d44b135cb91bbe5b3a215c2a6842d545d283a67a632a507449af976';

const root = process.cwd();
const swSource = readFileSync(resolve(root, 'public/sw.js'), 'utf8');

function readVersion(src) {
  const m = src.match(/const CACHE_VERSION = '([^']+)'/);
  if (!m) throw new Error('CACHE_VERSION tidak ditemukan di public/sw.js');
  return m[1];
}

function readShellAssets(src) {
  const block = src.match(/const SHELL_ASSETS = \[([\s\S]*?)\]/);
  if (!block) throw new Error('SHELL_ASSETS tidak ditemukan di public/sw.js');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function shellHash(assets) {
  const lines = assets
    .filter((a) => a !== '/')
    .map((a) => {
      const file = resolve(root, 'public', a.replace(/^\//, ''));
      const body = existsSync(file) ? readFileSync(file) : Buffer.from('MISSING');
      return `${a}:${createHash('sha256').update(body).digest('hex')}`;
    });
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

describe('service worker - aset shell', () => {
  it('CACHE_VERSION cocok dengan pin', () => {
    expect(
      readVersion(swSource),
      'CACHE_VERSION berubah. Perbarui PINNED_VERSION di test ini sekaligus.',
    ).toBe(PINNED_VERSION);
  });

  it('isi aset shell cocok dengan pin (wajib naikkan CACHE_VERSION bila berubah)', () => {
    const assets = readShellAssets(swSource);
    expect(assets.length, 'SHELL_ASSETS tidak boleh kosong').toBeGreaterThan(0);
    expect(
      shellHash(assets),
      'Aset shell berubah. WAJIB naikkan CACHE_VERSION di public/sw.js lalu ' +
        'perbarui PINNED_VERSION + PINNED_HASH di test ini, agar cache lama disapu.',
    ).toBe(PINNED_HASH);
  });
});
