/**
 * Test GET /promo/submissions/mine — kolom batch pada riwayat per perangkat.
 *
 * Kontrak rapuh yang dikunci:
 *  - riwayat memuat `batch_number` + `batch_token` lewat LEFT JOIN ke
 *    `promo_submission_batches`, supaya tenant yang mengirim beberapa media
 *    dalam satu kali kirim bisa kembali ke `/batch/<batch_token>` setelah
 *    meninggalkan layar sukses wizard;
 *  - kolom batch diambil SATU PER SATU, bukan `b.*`: tabel batch bertabrakan
 *    nama dengan `promo_submissions` pada 13 kolom, sehingga `b.*` akan
 *    menimpa nilai pengajuan pada kunci JSON yang sama;
 *  - `SELECT` memakai alias `s` untuk `promo_submissions` (tanpa itu `id` dan
 *    `created_at` menjadi ambigu begitu di-join, Postgres 42702);
 *  - gerbang fingerprint + urutan tetap: `WHERE s.device_fingerprint = $1`
 *    dan `ORDER BY s.created_at DESC`;
 *  - token batch TIDAK bocor ke jalur publik lain (`/submissions/status/:token`,
 *    `/submissions/track`, `/batches/status/:token`).
 *
 * Handler dijalankan SUNGGUHAN lewat `router.stack` (pola
 * `promo-submit.test.js` / `promo-batch.test.js`), tanpa supertest.
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

/** SQL terakhir yang dikirim handler `/mine` (satu-satunya query-nya). */
function mineSql() {
  const call = mockedQuery.mock.calls.at(-1);
  return String(call?.[0] || '');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockedQuery.mockResolvedValue({ rows: [] });
});

describe('GET /promo/submissions/mine — kolom batch', () => {
  it('mengambil batch_number & batch_token lewat LEFT JOIN ke tabel batch', async () => {
    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    expect(res.statusCode).toBe(200);

    const sql = mineSql();
    expect(sql).toContain('LEFT JOIN promo_submission_batches b ON b.id = s.batch_id');
    expect(sql).toContain('b.batch_number');
    expect(sql).toContain('b.batch_token');
  });

  it('tidak memakai b.* (13 kolom bertabrakan dengan promo_submissions)', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    expect(mineSql()).not.toMatch(/\bb\.\*/);
  });

  it('SELECT memakai alias s sehingga id/created_at tidak ambigu', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    const sql = mineSql();

    // Klaim inti: setiap kolom publik dikualifikasi alias `s.`
    expect(sql).toContain('FROM promo_submissions s');
    expect(sql).toContain('s.id,');
    expect(sql).toContain('s.created_at');
    expect(sql).toContain('s.batch_id');
    // Tanpa kualifikasi, Postgres menolak join ini dengan 42702.
    expect(sql).not.toMatch(/SELECT\s+id,/);
    expect(sql).not.toMatch(/,\s*created_at,/);
  });

  it('gerbang fingerprint dan urutan tetap dikualifikasi alias', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    const sql = mineSql();

    expect(sql).toContain('WHERE s.device_fingerprint = $1');
    expect(sql).toContain('ORDER BY s.created_at DESC');
    expect(sql).toContain('LIMIT 50');
    expect(mockedQuery.mock.calls.at(-1)?.[1]).toEqual(['fp123']);
  });

  it('meneruskan batch_number & batch_token pada baris respons', async () => {
    mockedQuery.mockResolvedValue({
      rows: [{
        id: 'sub-1', submission_number: 'MP-260920-A7K2QX', status_token: 'tok-1',
        batch_id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1',
      }],
    });

    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });

    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].batch_number).toBe('MPB-260920-ABC234');
    expect(res.body.data[0].batch_token).toBe('btok-1');
  });

  it('menghitung jumlah item batch di server lewat subquery atas SELURUH baris batch', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    const sql = mineSql();

    // Kolom turunan dikirim per baris, bukan diserahkan ke hitungan klien.
    expect(sql).toContain('AS batch_item_count');
    // Dihitung dari seluruh baris batch ini (korelasi ke batch_id baris luar).
    expect(sql).toMatch(
      /SELECT count\(\*\)::int FROM promo_submissions x WHERE x\.batch_id = s\.batch_id/,
    );
  });

  it('hitungan item batch tidak terkena LIMIT 50 daftar pengajuan', async () => {
    await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    const sql = mineSql();

    // LIMIT 50 hanya membatasi daftar pengajuan per perangkat.
    expect(sql).toContain('LIMIT 50');
    // Subquery hitungan TIDAK boleh punya LIMIT sendiri; kalau ada, batch yang
    // sebagian barisnya terpotong akan undercount.
    const subquery = sql.slice(sql.indexOf('SELECT count(*)'), sql.indexOf('FROM promo_submissions s'));
    expect(subquery.length).toBeGreaterThan(0);
    expect(subquery).not.toMatch(/LIMIT/i);
  });

  it('meneruskan batch_item_count dari server apa adanya pada baris respons', async () => {
    // Server mengirim 7 meski klien hanya memuat 2 baris batch ini: label harus
    // memakai angka server, bukan jumlah baris yang termuat.
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: 'sub-1', submission_number: 'MP-260920-A7K2QX', status_token: 'tok-1',
          batch_id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1',
          batch_item_count: 7,
        },
        {
          id: 'sub-2', submission_number: 'MP-260920-B7K2QX', status_token: 'tok-2',
          batch_id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1',
          batch_item_count: 7,
        },
      ],
    });

    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].batch_item_count).toBe(7);
    expect(res.body.data[1].batch_item_count).toBe(7);
  });

  it('jalur publik lain tidak ikut membawa token batch', async () => {
    // Jalur satu-tabel tetap memakai SUBMISSION_PUBLIC_COLUMNS apa adanya.
    await call('/submissions/track', 'get', { query: { number: 'MP-260920-A7K2QX' } });
    const trackSql = String(mockedQuery.mock.calls.at(-1)?.[0] || '');
    expect(trackSql).not.toContain('batch_token');
    expect(trackSql).not.toContain('promo_submission_batches');
  });
});
