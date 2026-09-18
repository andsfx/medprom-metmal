/**
 * Gerbang anti-abus endpoint publik:
 *  - POST /promo/submit mewajibkan device_fingerprint (tanpa itu, batas
 *    5 pengajuan / 24 jam per perangkat bisa dilewati dengan mengosongkannya);
 *  - GET /promo/submissions/mine dibatasi laju karena responsnya memuat
 *    status_token rahasia.
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

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';
import { getDriveFile } from '../../server/src/drive.js';
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);
const mockedDrive = vi.mocked(getDriveFile);
const mockedRateLimit = vi.mocked(enforceRateLimit);

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

const BASE = {
  media_type_slug: 'spanduk',
  tenant_name: 'Optik Melawai',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  campaign_name: 'Promo',
  material_title: 'Spanduk Promo',
  material_description: 'Keterangan.',
  material_type: 'Promosi',
  media_target: 'Pintu Tol',
  terms_accepted: true,
  link_url: 'https://drive.google.com/file/d/xyz/view',
  device_fingerprint: 'fp123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockedDrive.mockResolvedValue({ ok: true, id: 'file-1', name: 'x.jpg', mimeType: 'image/jpeg', size: 1024, webViewLink: 'https://drive.google.com/file/d/file-1/view' });
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('FROM promo_media_types')) return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PDF', rules: '' }] });
    if (text.includes('INSERT INTO promo_submissions')) return Promise.resolve({ rows: [{ id: 'uuid-1', submission_number: 'MP-260916-ABC234', status_token: 'tok-1', created_at: '2026-09-16T00:00:00Z' }] });
    if (text.includes('FROM promo_submissions WHERE drive_file_id')) return Promise.resolve({ rows: [] });
    if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
    return Promise.resolve({ rows: [] });
  });
});

async function call(path, method, { body, params, query } = {}) {
  const handler = getHandler(path, method);
  const req = { method: method.toUpperCase(), body, params, query, headers: { 'user-agent': 'vitest' }, socket: {} };
  const res = createMockResponse();
  await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
  return res;
}

describe('POST /promo/submit — fingerprint wajib', () => {
  it('tanpa device_fingerprint → 400 dan tidak sampai INSERT', async () => {
    const { device_fingerprint, ...tanpaFp } = BASE;
    const res = await call('/submit', 'post', { body: tanpaFp });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Fingerprint perangkat wajib diisi');
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_submissions'))).toBe(true);
  });

  it('dengan device_fingerprint → diterima (201)', async () => {
    const res = await call('/submit', 'post', { body: BASE });
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /promo/submissions/mine — rate limit', () => {
  it('memakai bucket promo-mine dan meneruskan 429 saat kuota habis', async () => {
    mockedRateLimit.mockImplementation((_req, res) => {
      res.status(429).json({ success: false, error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
      return false;
    });

    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });

    expect(mockedRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedRateLimit.mock.calls[0][2]).toBe('promo-mine');
    expect(res.statusCode).toBe(429);
    // Dibatasi sebelum menyentuh DB.
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('tanpa fingerprint → 400', async () => {
    const res = await call('/submissions/mine', 'get', { query: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Fingerprint perangkat wajib diisi/);
  });

  it('dengan fingerprint → mengembalikan baris riwayat', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ id: 's1', submission_number: 'MP-1', status_token: 'tok' }] });
    const res = await call('/submissions/mine', 'get', { query: { fingerprint: 'fp123' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
