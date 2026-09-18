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
});
