/**
 * Test lokasi pemasangan pada unggah bukti tayang (F1).
 *
 * Kontrak rapuh yang dikunci:
 *  - `readMultipartFile` (`server/src/drive.js`) SENGAJA mengabaikan field
 *    non-file, sehingga `req.body.media_location` tidak pernah terisi;
 *  - karena itu handler WAJIB mengambil lokasi dari `media_target` pengajuan
 *    (query `SELECT media_target FROM promo_submissions ...`), bukan dari
 *    `req.body`;
 *  - fallback literal 'Belum ditentukan' hanya jaring terakhir bila
 *    `media_target` kosong.
 *
 * Handler sungguhan (bukan unit terpisah), pola mock sama dengan
 * `__tests__/api/admin-cetak.test.js`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/src/db.js', () => ({
  db: { query: vi.fn(), ready: true, verify: vi.fn(), end: vi.fn() },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/drive.js', () => ({
  deleteDriveFileOrThrow: vi.fn(),
  getDriveFile: vi.fn(),
  readMultipartFile: vi.fn(),
  driveReady: true,
  ALLOWED_MIME: new Set(['image/jpeg', 'image/png', 'application/pdf', 'video/mp4']),
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  checkMagicBytes: vi.fn(() => ({ ok: true })),
  uploadToDrive: vi.fn(async () => ({
    id: 'drive-proof-1',
    webViewLink: 'https://drive.google.com/file/d/proof-1/view',
  })),
  safeFileName: vi.fn((n) => `${n}.jpg`),
  extOf: vi.fn(() => 'jpg'),
}));
vi.mock('../../server/src/auth.js', () => ({
  requireRole: () => (req, _res, next) => {
    req.auth = { user: { id: 'u1', display_name: 'Admin Satu' } };
    next();
  },
  logActivity: vi.fn(),
  READ_ROLES: ['superadmin', 'admin', 'tenant_relation'],
  STAFF_ROLES: ['superadmin', 'admin'],
}));
vi.mock('../../server/src/lib/rateLimit.js', () => ({
  enforceRateLimit: vi.fn(() => true),
  clientIp: vi.fn(() => '203.0.113.10'),
}));

import adminRouter from '../../server/src/routes/admin.js';
import { db } from '../../server/src/db.js';
import { readMultipartFile, uploadToDrive } from '../../server/src/drive.js';

const mockedQuery = vi.mocked(db.query);
const mockedRead = vi.mocked(readMultipartFile);
const mockedUpload = vi.mocked(uploadToDrive);

const MEDIA_TARGET = 'Sisi Pintu Tol Bekasi Barat';

function getHandler(path, method) {
  const layer = adminRouter.stack.find(
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
    auth: { user: { id: 'u1', display_name: 'Admin Satu' } },
  };
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

/** Panggilan INSERT baris pemasangan (baris ringkas bukti). */
function findInstallInsert() {
  return mockedQuery.mock.calls.find(
    (c) => String(c[0]).includes('INSERT INTO promo_installations'),
  );
}

/** Mock query: pengajuan sudah_dipasang + TANPA baris promo_installations. */
function mockSudahDipasangTanpaInstallasi(mediaTarget) {
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('FROM promo_submissions')) {
      return Promise.resolve({
        rows: [{ id: 's1', status: 'sudah_dipasang', media_target: mediaTarget }],
      });
    }
    if (text.includes('FROM promo_installations')) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRead.mockResolvedValue({
    chunks: [Buffer.from('x')], head: Buffer.from([0xff, 0xd8, 0xff]),
    length: 3, originalName: 'bukti.jpg', contentType: 'image/jpeg',
  });
  mockedUpload.mockResolvedValue({
    id: 'drive-proof-1',
    webViewLink: 'https://drive.google.com/file/d/proof-1/view',
  });
});

describe('POST /admin/submissions/:id/installation/proof - lokasi dari pengajuan', () => {
  it('membaca media_target pengajuan (sumber lokasi, bukan req.body)', async () => {
    mockSudahDipasangTanpaInstallasi(MEDIA_TARGET);
    await call('/submissions/:id/installation/proof', 'post', { params: { id: 's1' } });
    const locSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('FROM promo_submissions') && sql.includes('media_target'));
    expect(locSql).toBeDefined();
  });

  it('menulis media_target pengajuan, BUKAN literal Belum ditentukan', async () => {
    mockSudahDipasangTanpaInstallasi(MEDIA_TARGET);
    const res = await call('/submissions/:id/installation/proof', 'post', { params: { id: 's1' } });
    expect(res.statusCode).toBe(200);

    const insert = findInstallInsert();
    expect(insert).toBeDefined();
    // $2 = media_location.
    expect(insert[1][1]).toBe(MEDIA_TARGET);
    expect(insert[1]).not.toContain('Belum ditentukan');
  });

  it('mengabaikan media_location dari req.body (root cause: parser buang field non-file)', async () => {
    // Bahkan bila klien mengirim field ini, nilainya tidak boleh dipakai;
    // `readMultipartFile` memang tidak pernah mengisinya.
    mockSudahDipasangTanpaInstallasi(MEDIA_TARGET);
    await call('/submissions/:id/installation/proof', 'post', {
      params: { id: 's1' },
      body: { media_location: 'Dari Body' },
    });
    const insert = findInstallInsert();
    expect(insert[1][1]).toBe(MEDIA_TARGET);
    expect(insert[1][1]).not.toBe('Dari Body');
  });

  it('media_target kosong → fallback Belum ditentukan (jaring terakhir)', async () => {
    mockSudahDipasangTanpaInstallasi('');
    const res = await call('/submissions/:id/installation/proof', 'post', { params: { id: 's1' } });
    expect(res.statusCode).toBe(200);

    const insert = findInstallInsert();
    expect(insert).toBeDefined();
    expect(insert[1][1]).toBe('Belum ditentukan');
  });
});
