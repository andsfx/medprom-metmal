/**
 * Test GET /promo/summary — ringkasan beranda tenant per perangkat.
 *
 * Kontrak rapuh yang dikunci:
 *  - gerbang fingerprint SAMA dengan `/submissions/mine`: 400 tanpa
 *    fingerprint, rate limit 60/15 mnt per IP;
 *  - ringkasan status dihitung SATU GROUP BY (bukan delapan COUNT), semua
 *    angka konsisten satu sama lain;
 *  - blok "perlu tindakan" hanya memuat status menunggu review/perlu revisi
 *    (LIMIT 1, terbaru dulu) dan membawa status_token (batas kepercayaan
 *    fingerprint — sama seperti `/mine`);
 *  - blok "periode hampir berakhir" hanya status aktif
 *    (disetujui/siap/terpasang) dengan `air_end_date` belum lewat
 *    (>= CURRENT_DATE), terdekat dulu, LIMIT 6.
 *
 * Handler dijalankan SUNGGUHAN lewat `router.stack` (pola promo-mine-batch),
 * tanpa supertest.
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

async function call(path, method, { query = {} } = {}) {
  const handler = getHandler(path, method);
  const req = {
    method: method.toUpperCase(), body: {}, params: {}, query,
    headers: { 'user-agent': 'vitest' }, socket: {},
  };
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

/** SQL per permintaan, berurutan (status → tindakan → periode). */
function sqlPerCall() {
  return mockedQuery.mock.calls.map((c) => String(c[0] || ''));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  // Urutan pemanggilan db.query di handler: GROUP BY status, needing action,
  // expiring. Query ketiga dipanggil terakhir; tiap query diberi hasil kosong
  // dan test mengisi yang dibutuhkan.
  mockedQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
});

describe('GET /promo/summary — ringkasan beranda', () => {
  it('tanpa fingerprint → 400, DB tidak disentuh', async () => {
    const res = await call('/summary', 'get', { query: {} });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('fingerprint kosong (spasi) → 400', async () => {
    const res = await call('/summary', 'get', { query: { fingerprint: '   ' } });

    expect(res.statusCode).toBe(400);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('status dihitung SATU GROUP BY dan angka dijumlah ke total', async () => {
    mockedQuery.mockReset();
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ status: 'menunggu_review', n: 2 }, { status: 'selesai', n: 12 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await call('/summary', 'get', { query: { fingerprint: 'fp1' } });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(14);
    expect(res.body.data.by_status).toEqual({ menunggu_review: 2, selesai: 12 });
    // GROUP BY, bukan delapan COUNT terpisah.
    expect(sqlPerCall()[0]).toMatch(/GROUP BY status/i);
    expect(sqlPerCall().filter((s) => /count\(\*\)/i.test(s))).toHaveLength(1);
  });

  it('perlu tindakan hanya status menunggu review / perlu revisi, LIMIT 1 terbaru', async () => {
    const res = await call('/summary', 'get', { query: { fingerprint: 'fp1' } });

    expect(res.statusCode).toBe(200);
    const sql = sqlPerCall()[1];
    expect(sql).toContain("status = ANY($2::text[])");
    expect(sql).toMatch(/LIMIT 1/i);
    expect(sql).toMatch(/ORDER BY created_at DESC/i);
    // $2 harus diisi daftar dua status aksi (bukan status aktif).
    const bindAction = mockedQuery.mock.calls[1][1];
    expect(bindAction[0]).toBe('fp1');
    expect(bindAction[1]).toEqual(['menunggu_review', 'perlu_revisi']);
  });

  it('periode hampir berakhir: status aktif + air_end_date (TEXT) dibanding leksikografis', async () => {
    const res = await call('/summary', 'get', { query: { fingerprint: 'fp1' } });

    expect(res.statusCode).toBe(200);
    const sql = sqlPerCall()[2];
    // air_end_date bertipe TEXT: perbandingan leksikografis terhadap
    // to_char(CURRENT_DATE), bukan cast date (melempar operator error).
    expect(sql).toContain("air_end_date <> ''");
    expect(sql).toContain("air_end_date >= to_char(CURRENT_DATE, 'YYYY-MM-DD')");
    expect(sql).not.toMatch(/>=\s*CURRENT_DATE/i);
    expect(sql).toMatch(/ORDER BY air_end_date ASC/i);
    expect(sql).toMatch(/LIMIT 6/i);
    const bind = mockedQuery.mock.calls[2][1];
    expect(bind[1]).toEqual(['disetujui', 'siap_dipasang', 'sudah_dipasang']);
  });

  it('merespons bentuk { success, data: { by_status, total, needing_action, expiring_soon } }', async () => {
    mockedQuery.mockReset();
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ status: 'perlu_revisi', n: 1 }] })
      .mockResolvedValueOnce({
        rows: [{
          submission_number: 'MP-261116-ABC234', status_token: 'tok-1',
          status: 'perlu_revisi', media_type_slug: 'sticker-eskalator',
          material_title: 'Sticker Eskalator', review_notes: 'Ukuran belum sesuai.',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          submission_number: 'MP-261101-ABC234', status_token: 'tok-2',
          status: 'disetujui', media_type_slug: 'spanduk',
          material_title: 'Spanduk', air_end_date: '2026-11-20',
        }],
      });

    const res = await call('/summary', 'get', { query: { fingerprint: 'fp1' } });

    expect(res.body.data).toEqual({
      by_status: { perlu_revisi: 1 },
      total: 1,
      needing_action: {
        submission_number: 'MP-261116-ABC234', status_token: 'tok-1',
        status: 'perlu_revisi', media_type_slug: 'sticker-eskalator',
        material_title: 'Sticker Eskalator', review_notes: 'Ukuran belum sesuai.',
      },
      expiring_soon: [{
        submission_number: 'MP-261101-ABC234', status_token: 'tok-2',
        status: 'disetujui', media_type_slug: 'spanduk',
        material_title: 'Spanduk', air_end_date: '2026-11-20',
      }],
    });
  });

  it('memakai rate limit per IP (60 / 15 mnt)', async () => {
    await call('/summary', 'get', { query: { fingerprint: 'fp1' } });

    expect(mockedRateLimit).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'promo-summary', 60, 15 * 60 * 1000,
    );
  });
});