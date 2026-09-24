/**
 * Test GET /promo/submissions/mine - paginasi ADITIF (`?offset=`) + `total`.
 *
 * Kontrak rapuh yang dikunci:
 *  - `?offset=<n>` diteruskan ke query sebagai `OFFSET <n>` sehingga tenant
 *    dengan lebih dari satu halaman pengajuan bisa memuat sisanya;
 *  - TANPA `offset`, bentuk query dan parameter tetap sama seperti sebelum
 *    paginasi (`LIMIT 50 OFFSET 0`, parameter `$1` = fingerprint saja) supaya
 *    pemanggil lama dan test lama tidak berubah;
 *  - `offset` cacat (negatif, bukan angka, kosong) mundur ke 0, dan nilainya
 *    TIDAK PERNAH masuk sebagai parameter bind (ditulis sebagai literal angka
 *    yang sudah dipaksa integer);
 *  - respons memuat `total` = jumlah SELURUH pengajuan perangkat itu, supaya
 *    klien tahu apakah masih ada sisa tanpa menebak dari panjang halaman;
 *  - query hitungan dijalankan SEBELUM query daftar: test lama membaca
 *    `mock.calls.at(-1)` sebagai SQL daftar (`promo-mine-batch.test.js`), jadi
 *    urutan ini adalah bagian dari kontrak;
 *  - batas `LIMIT` server sama dengan cermin FE `MY_SUBMISSIONS_PAGE_SIZE`
 *    (`src/constants/promo.ts`) yang dipakai heuristik tombol "Muat lagi".
 *
 * Handler dijalankan SUNGGUHAN lewat `router.stack` (pola
 * `promo-mine-batch.test.js`), tanpa supertest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('../../server/src/lib/turnstile.js', () => ({
  verifyTurnstile: vi.fn(async () => ({ ok: true })),
}));

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';
import { MY_SUBMISSIONS_PAGE_SIZE } from '../../src/constants/promo';

const mockedQuery = vi.mocked(db.query);
const mockedRateLimit = vi.mocked(enforceRateLimit);

function getHandler(path, method) {
  const layer = promoRouter.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`handler ${method.toUpperCase()} ${path} tidak ditemukan`);
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader() { return this; },
  };
}

async function call(path, method, { body = {}, params = {}, query = {} } = {}) {
  const handler = getHandler(path, method);
  const req = {
    method: method.toUpperCase(), body, params, query,
    headers: { 'user-agent': 'vitest' }, socket: {},
  };
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

/** SQL query daftar (panggilan terakhir handler `/mine`). */
function listSql() {
  return String(mockedQuery.mock.calls.at(-1)?.[0] || '');
}

/** Parameter bind query daftar. */
function listParams() {
  return mockedQuery.mock.calls.at(-1)?.[1];
}

function semuaSql() {
  return mockedQuery.mock.calls.map((c) => String(c[0] || ''));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockedQuery.mockResolvedValue({ rows: [] });
});

describe('GET /promo/submissions/mine - paginasi aditif', () => {
  it('tanpa offset → bentuk query dan parameter sama seperti sebelum paginasi', async () => {
    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });

    expect(res.statusCode).toBe(200);
    expect(listSql()).toContain('LIMIT 50');
    expect(listSql()).toContain('OFFSET 0');
    // Parameter tetap hanya fingerprint: OFFSET ditulis sebagai literal angka.
    expect(listParams()).toEqual(['fp123']);
    expect(listSql()).toContain('ORDER BY s.created_at DESC');
  });

  it('?offset=50 diteruskan ke query sebagai OFFSET 50', async () => {
    const res = await call('/submissions/mine', 'get', {
      query: { fingerprint: 'fp123', offset: '50' },
    });

    expect(res.statusCode).toBe(200);
    expect(listSql()).toContain('OFFSET 50');
    expect(listSql()).toContain('LIMIT 50');
    expect(listParams()).toEqual(['fp123']);
  });

  it('offset cacat (negatif / bukan angka / kosong) mundur ke 0', async () => {
    for (const cacat of ['-10', 'abc', '', ' ']) {
      mockedQuery.mockClear();
      await call('/submissions/mine', 'get', {
        query: { fingerprint: 'fp123', offset: cacat },
      });
      expect(listSql()).toContain('OFFSET 0');
    }
  });

  it('respons memuat total seluruh pengajuan perangkat', async () => {
    mockedQuery.mockImplementation(async (sql) => {
      if (/count\(\*\)::int AS n/.test(String(sql))) return { rows: [{ n: 120 }] };
      return { rows: [{ id: 'sub-1', submission_number: 'MP-260920-A7K2QX' }] };
    });

    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(120);
    expect(res.body.data).toHaveLength(1);
  });

  it('total 0 bila DB tidak mengembalikan baris hitungan', async () => {
    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });

    expect(res.body.total).toBe(0);
  });

  it('query hitungan total dijalankan sebelum query daftar', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    const sqls = semuaSql();

    const iHitung = sqls.findIndex((s) => /count\(\*\)::int AS n/.test(s));
    const iDaftar = sqls.findIndex((s) => s.includes('LEFT JOIN promo_submission_batches b'));

    expect(iHitung).toBeGreaterThanOrEqual(0);
    expect(iDaftar).toBeGreaterThan(iHitung);
    // Test lama membaca panggilan terakhir sebagai SQL daftar.
    expect(iDaftar).toBe(sqls.length - 1);
  });

  it('query hitungan memakai fingerprint yang sama dan tidak terpotong LIMIT', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    const hitung = semuaSql().find((s) => /count\(\*\)::int AS n/.test(s)) || '';

    expect(hitung).toContain('FROM promo_submissions WHERE device_fingerprint = $1');
    expect(hitung).not.toMatch(/LIMIT/i);
    const callHitung = mockedQuery.mock.calls.find((c) => /count\(\*\)::int AS n/.test(String(c[0])));
    expect(callHitung?.[1]).toEqual(['fp123']);
  });

  it('batas LIMIT server sama dengan cermin FE MY_SUBMISSIONS_PAGE_SIZE', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    expect(listSql()).toContain(`LIMIT ${MY_SUBMISSIONS_PAGE_SIZE}`);
  });
});
