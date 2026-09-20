/**
 * Invarian katalog media: 14 slug seed, 13 aktif (vertical-banner nonaktif),
 * sort_order unik 1..14, dan katalog publik hanya menyajikan media aktif.
 *
 * Latar: skrip verifikasi produksi (`scripts/verify-*.mjs`) mengasumsikan
 * "13 kartu" di landing. Angka itu hanya benar bila tepat satu media
 * nonaktif — invarian yang belum pernah dikunci test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Bagian 1: invarian data seed ────────────────────────────────
const seedQueries = [];

vi.mock('pg', () => {
  class Pool {
    constructor() {}
    query(sql, params) {
      seedQueries.push({ sql: String(sql), params });
      const text = String(sql);
      if (text.includes('INSERT INTO promo_media_types')) {
        return Promise.resolve({ rows: [{ id: 'x', is_insert: false }] });
      }
      if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 14 }] });
      return Promise.resolve({ rows: [] });
    }
    end() { return Promise.resolve(); }
  }
  return { default: { Pool } };
});

function seedUpserts() {
  return seedQueries.filter((q) => q.sql.includes('INSERT INTO promo_media_types'));
}

describe('invarian seed katalog', () => {
  beforeEach(() => {
    seedQueries.length = 0;
    process.env.DATABASE_URL = 'postgres://stub/db';
    vi.resetModules();
  });

  it('berisi tepat 14 slug unik', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    const slugs = seedUpserts().map((q) => q.params[0]);
    expect(slugs.length).toBe(14);
    expect(new Set(slugs).size).toBe(14);
  });

  // Urutan parameter INSERT seed (lihat seed-media-types.mjs):
  // 0 slug, 1 category, 2 name, 3 size_spec, 4 material_spec, 5 accepted_formats,
  // 6 price_note, 7 location_note, 8 rules, 9 image_path, 10 is_active,
  // 11 sort_order, 12 = flag --reset-gambar.
  it('sort_order unik dan berurutan 1..14', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    const orders = seedUpserts().map((q) => Number(q.params[11])).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it('tepat satu media nonaktif, yaitu vertical-banner', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    const nonaktif = seedUpserts().filter((q) => q.params[10] === false);
    expect(nonaktif.length).toBe(1);
    expect(nonaktif[0].params[0]).toBe('vertical-banner');
  });

  it('13 media aktif → konsisten dengan asersi "13 kartu" di skrip verifikasi', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    const aktif = seedUpserts().filter((q) => q.params[10] !== false);
    expect(aktif.length).toBe(13);
  });

  // Indeks parameter (lihat seed-media-types.mjs): array index 12 = $13
  // (flag --reset-gambar); parameter baru mulai index 13 → 13 media_channel,
  // 14 price_amount, 15 price_unit, 16 ppn_included.
  it('kanal cetak tepat tiga media: spanduk, big-banner, umbul-umbul', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    const cetak = seedUpserts()
      .filter((q) => q.params[13] === 'cetak')
      .map((q) => q.params[0])
      .sort();
    expect(cetak).toEqual(['big-banner', 'spanduk', 'umbul-umbul']);
    // Sisanya digital — tidak ada kanal lain.
    const kanal = new Set(seedUpserts().map((q) => q.params[13]));
    expect([...kanal].sort()).toEqual(['cetak', 'digital']);
  });

  it('tiga media cetak berharga harian numerik > 0', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    const cetak = seedUpserts().filter((q) => q.params[13] === 'cetak');
    const harga = Object.fromEntries(cetak.map((q) => [q.params[0], Number(q.params[14])]));
    expect(harga).toEqual({ spanduk: 70000, 'big-banner': 160000, 'umbul-umbul': 288000 });
    // Satuan mengikuti deck: umbul-umbul dihitung per hari untuk 16 tiang.
    const unit = Object.fromEntries(cetak.map((q) => [q.params[0], q.params[15]]));
    expect(unit).toEqual({ spanduk: 'hari', 'big-banner': 'hari', 'umbul-umbul': 'hari/16 tiang' });
    for (const q of cetak) expect(Number(q.params[14])).toBeGreaterThan(0);
  });

  it('ppn_included diturunkan dari teks rules, bukan ditulis manual', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    for (const q of seedUpserts()) {
      const rules = String(q.params[8] || '');
      const diharapkan = /harga sudah termasuk ppn/i.test(rules);
      expect(q.params[16], `${q.params[0]} ppn_included`).toBe(diharapkan);
    }
    // Media cetak semuanya "Harga belum termasuk PPN." → false.
    const cetak = seedUpserts().filter((q) => q.params[13] === 'cetak');
    for (const q of cetak) expect(q.params[16]).toBe(false);
  });
});

// ── Bagian 2: handler katalog publik memfilter is_active ────────
vi.mock('../../server/src/db.js', () => ({
  db: { query: vi.fn(), ready: true, verify: vi.fn(), end: vi.fn() },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/drive.js', () => ({
  getDriveFile: vi.fn(),
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  driveReady: true,
}));
vi.mock('../../server/src/lib/rateLimit.js', () => ({
  enforceRateLimit: vi.fn(() => true),
  clientIp: vi.fn(() => '203.0.113.10'),
}));

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';

const mockedQuery = vi.mocked(db.query);

function getHandler(path, method) {
  const layer = promoRouter.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`handler ${method.toUpperCase()} ${path} tidak ditemukan`);
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

describe('GET /promo/media-types — hanya media aktif', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('SQL menyaring is_active = true dan mengurutkan sort_order', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const handler = getHandler('/media-types', 'get');
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() { return this; } };
    await handler({ method: 'GET', headers: {}, socket: {} }, res, () => {});

    const sql = String(mockedQuery.mock.calls[0][0]);
    expect(sql).toMatch(/WHERE is_active = true/);
    expect(sql).toMatch(/ORDER BY sort_order/);
  });

  it('meneruskan hanya baris aktif yang dikembalikan DB', async () => {
    const aktif = [
      { slug: 'spanduk', category: 'outdoor', name: 'Spanduk', sort_order: 1 },
      { slug: 'videotron', category: 'indoor', name: 'Videotron', sort_order: 10 },
    ];
    mockedQuery.mockResolvedValue({ rows: aktif });
    const handler = getHandler('/media-types', 'get');
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() { return this; } };
    await handler({ method: 'GET', headers: {}, socket: {} }, res, () => {});

    expect(res.body.success).toBe(true);
    expect(res.body.data.map((m) => m.slug)).toEqual(['spanduk', 'videotron']);
    expect(res.body.data.some((m) => m.slug === 'vertical-banner')).toBe(false);
  });

  // Regresi seam: wizard cetak memfilter `media_channel === 'cetak'` dan
  // menghitung PPN dari `price_amount`/`ppn_included`. Bila kolom ini tidak
  // ikut di-SELECT, form menampilkan 0 media dan PPN selalu 0 di produksi —
  // mock FE tidak menangkapnya karena fixture sudah memuat kolom tersebut.
  it('SELECT memuat media_channel + kolom harga numerik (seam wizard cetak)', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const handler = getHandler('/media-types', 'get');
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() { return this; } };
    await handler({ method: 'GET', headers: {}, socket: {} }, res, () => {});

    const sql = String(mockedQuery.mock.calls[0][0]);
    for (const kolom of ['media_channel', 'price_amount', 'price_unit', 'ppn_included']) {
      expect(sql, `${kolom} wajib ada di SELECT katalog publik`).toContain(kolom);
    }
    // Tanpa parameter channel, tidak ada nilai yang di-bind (perilaku lama).
    expect(mockedQuery.mock.calls[0][1]).toEqual([]);
  });

  it('?channel=cetak menyaring lewat parameter terikat, bukan interpolasi', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ slug: 'spanduk', media_channel: 'cetak' }] });
    const handler = getHandler('/media-types', 'get');
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() { return this; } };
    await handler({ method: 'GET', headers: {}, socket: {}, query: { channel: 'cetak' } }, res, () => {});

    const [sql, values] = mockedQuery.mock.calls[0];
    expect(String(sql)).toContain('media_channel = $1');
    expect(values).toEqual(['cetak']);
    expect(res.body.data.map((m) => m.slug)).toEqual(['spanduk']);
  });

  it('?channel=digital diterima; kanal tak dikenal → 400 tanpa menyentuh DB', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const handler = getHandler('/media-types', 'get');
    const mkRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() { return this; } });

    const resOk = mkRes();
    await handler({ method: 'GET', headers: {}, socket: {}, query: { channel: 'digital' } }, resOk, () => {});
    expect(resOk.statusCode).toBe(200);
    expect(mockedQuery.mock.calls[0][1]).toEqual(['digital']);

    mockedQuery.mockClear();
    const resBad = mkRes();
    await handler({ method: 'GET', headers: {}, socket: {}, query: { channel: "'; DROP TABLE users; --" } }, resBad, () => {});
    expect(resBad.statusCode).toBe(400);
    expect(resBad.body.error).toMatch(/Kanal media tidak dikenal/);
    // Nilai tak sah tidak pernah sampai ke DB.
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('respons meneruskan media_channel & harga dari DB apa adanya', async () => {
    mockedQuery.mockResolvedValue({
      rows: [{
        slug: 'spanduk', category: 'outdoor', name: 'Spanduk', size_spec: '0.9 M x 6.0 M',
        material_spec: 'Flexi 280gr', accepted_formats: 'JPEG,PNG,PDF',
        price_note: 'Rp. 70.000,-/hari', location_note: '', rules: '', image_path: '',
        sort_order: 1, media_channel: 'cetak', price_amount: 70000,
        price_unit: 'hari', ppn_included: false,
      }],
    });
    const handler = getHandler('/media-types', 'get');
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() { return this; } };
    await handler({ method: 'GET', headers: {}, socket: {}, query: { channel: 'cetak' } }, res, () => {});

    const row = res.body.data[0];
    expect(row.media_channel).toBe('cetak');
    expect(row.price_amount).toBe(70000);
    expect(row.ppn_included).toBe(false);
    // Yang dibaca wizard: filter kanal + dasar perhitungan PPN tersedia.
    expect(row.media_channel === 'cetak').toBe(true);
  });
});
