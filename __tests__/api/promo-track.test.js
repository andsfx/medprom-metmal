/**
 * Test endpoint pelacakan publik: GET /promo/submissions/track?number=
 *
 * Dua kontrak yang dikunci: (1) bentuk respons identik dengan halaman status
 * ber-token — termasuk tidak pernah membocorkan kolom internal seperti
 * fingerprint/IP; (2) gerbang captcha Cloudflare Turnstile dijalankan SEBELUM
 * data apa pun dibaca, dan kegagalannya tidak pernah menembus ke DB.
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
  turnstileConfigured: vi.fn(() => true),
}));

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';
import { verifyTurnstile } from '../../server/src/lib/turnstile.js';

const mockedQuery = vi.mocked(db.query);
const mockedRateLimit = vi.mocked(enforceRateLimit);
const mockedVerify = vi.mocked(verifyTurnstile);

const SUBMISSION_ROW = {
  id: 'sub-1',
  submission_number: 'MP-260918-A7K2QX',
  media_type_slug: 'spanduk',
  tenant_name: 'Optik Melawai',
  unit_number: 'L1-05',
  status: 'menunggu_review',
};

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
}

function getHandler(path, method) {
  const layer = promoRouter.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`handler ${method.toUpperCase()} ${path} tidak ditemukan`);
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

async function call(query) {
  const handler = getHandler('/submissions/track', 'get');
  const req = { method: 'GET', body: {}, params: {}, query, headers: { 'user-agent': 'vitest' }, socket: {} };
  const res = createMockResponse();
  await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
  return res;
}

/** Mock DB untuk pengajuan yang ada: SELECT utama + 3 query detail. */
function mockFound() {
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('WHERE submission_number')) return Promise.resolve({ rows: [SUBMISSION_ROW] });
    if (text.includes('FROM promo_submission_history')) return Promise.resolve({ rows: [{ id: 'h1', to_status: 'menunggu_review' }] });
    if (text.includes('FROM promo_submission_files')) return Promise.resolve({ rows: [{ id: 'f1', version: 1 }] });
    if (text.includes('FROM promo_installations')) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockedVerify.mockResolvedValue({ ok: true });
});

describe('GET /promo/submissions/track', () => {
  it('nomor valid + captcha lolos → submission + riwayat + versi + pemasangan', async () => {
    mockFound();

    const res = await call({ number: 'MP-260918-A7K2QX', captcha: 'tok-1' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.submission.id).toBe('sub-1');
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.files).toHaveLength(1);
    expect(res.body.data.installation).toBeNull();

    // Kolom internal tidak boleh ikut di-SELECT pada endpoint publik.
    const selectSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('WHERE submission_number'));
    expect(selectSql).not.toMatch(/device_fingerprint/);
    expect(selectSql).not.toMatch(/ip_address/);
  });

  it('nomor huruf kecil/spasi dinormalisasi sebelum query', async () => {
    mockFound();
    await call({ number: ' mp-260918-a7k2qx ', captcha: 'tok-1' });

    const selectCall = mockedQuery.mock.calls.find((c) => String(c[0]).includes('WHERE submission_number'));
    expect(selectCall[1]).toEqual(['MP-260918-A7K2QX']);
  });

  it('memakai bucket rate limit status-lookup (60 / 15 mnt)', async () => {
    mockFound();
    await call({ number: 'MP-260918-A7K2QX', captcha: 'tok-1' });

    expect(mockedRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedRateLimit.mock.calls[0][2]).toBe('status-lookup');
  });

  it('nomor kosong → 400 tanpa captcha/DB', async () => {
    const res = await call({});
    expect(res.statusCode).toBe(400);
    expect(mockedVerify).not.toHaveBeenCalled();
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('format nomor salah → 400 tanpa memanggil Siteverify', async () => {
    const res = await call({ number: 'MP-XXX', captcha: 'tok-1' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/format nomor pengajuan tidak valid/i);
    // Format dicek lebih dulu: jangan buang panggilan Siteverify untuk input cacat.
    expect(mockedVerify).not.toHaveBeenCalled();
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('captcha gagal → 400 dan DB tidak tersentuh', async () => {
    mockedVerify.mockResolvedValue({ ok: false, error: 'Verifikasi captcha gagal. Muat ulang halaman lalu coba lagi.' });

    const res = await call({ number: 'MP-260918-A7K2QX', captcha: '' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/captcha gagal/i);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('Siteverify tak terjangkau → 503 fail-closed, DB tidak tersentuh', async () => {
    mockedVerify.mockResolvedValue({ ok: false, status: 503, error: 'Layanan verifikasi captcha sedang tidak tersedia.' });

    const res = await call({ number: 'MP-260918-A7K2QX', captcha: 'tok-1' });

    expect(res.statusCode).toBe(503);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('nomor tidak ditemukan → 404 dengan pesan seragam', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });

    const res = await call({ number: 'MP-260918-ZZZZZZ', captcha: 'tok-1' });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/tidak ditemukan/i);
  });

  it('meneruskan IP pengunjung dan action "track" ke verifikasi captcha', async () => {
    mockFound();
    await call({ number: 'MP-260918-A7K2QX', captcha: 'tok-1' });

    expect(mockedVerify).toHaveBeenCalledWith('tok-1', {
      remoteip: '203.0.113.10',
      action: 'track',
    });
  });
});
