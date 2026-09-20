/**
 * Test endpoint staf alur cetak: pengingat periode berakhir + bukti tayang.
 *
 * Kontrak rapuh yang dikunci:
 *  - pengingat adalah query TURUNAN (tanpa cron), hanya media ber-pajak, dan
 *    `end_date` bertipe TEXT dijaga regex sebelum di-cast ::date;
 *  - bukti tayang dua kanal: `proof_kind` link/upload; unggahan fail-closed
 *    503 tanpa kredensial Drive dan memakai bucket rate limit sendiri.
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
  uploadToDrive: vi.fn(async () => ({ id: 'drive-proof-1', webViewLink: 'https://drive.google.com/file/d/proof-1/view' })),
  safeFileName: vi.fn((n) => `${n}.jpg`),
  extOf: vi.fn(() => 'jpg'),
}));
vi.mock('../../server/src/auth.js', () => ({
  requireRole: () => (req, _res, next) => { req.auth = { user: { id: 'u1', display_name: 'Admin Satu' } }; next(); },
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
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);
const mockedRead = vi.mocked(readMultipartFile);
const mockedUpload = vi.mocked(uploadToDrive);
const mockedRateLimit = vi.mocked(enforceRateLimit);

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
  await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockedUpload.mockResolvedValue({ id: 'drive-proof-1', webViewLink: 'https://drive.google.com/file/d/proof-1/view' });
});

describe('GET /admin/submissions/reminders', () => {
  beforeEach(() => {
    mockedQuery.mockResolvedValue({
      rows: [
        { id: 's1', submission_number: 'MP-1', days_left: -2, end_date: '2026-09-18', ppn_amount: 53900 },
        { id: 's2', submission_number: 'MP-2', days_left: 3, end_date: '2026-09-23', ppn_amount: 53900 },
        { id: 's3', submission_number: 'MP-3', days_left: 10, end_date: '2026-09-30', ppn_amount: 53900 },
      ],
    });
  });

  it('mengembalikan ringkasan overdue/due_soon + items', async () => {
    const res = await call('/submissions/reminders', 'get');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.days).toBe(14);      // REMINDER_DAYS (cermin FE)
    expect(res.body.data.overdue).toBe(1);
    expect(res.body.data.due_soon).toBe(2);
    expect(res.body.data.items).toHaveLength(3);
  });

  it('hanya menyertakan media ber-pajak dan status sudah_dipasang', async () => {
    await call('/submissions/reminders', 'get');
    const sql = String(mockedQuery.mock.calls[0][0]);
    expect(sql).toContain("s.status = 'sudah_dipasang'");
    expect(sql).toMatch(/ppn_amount > 0 OR s\.ppn_included = false/);
  });

  it('menjaga end_date teks dengan regex sebelum cast ::date', async () => {
    await call('/submissions/reminders', 'get');
    const sql = String(mockedQuery.mock.calls[0][0]);
    // Tanpa penjaga ini, satu nilai cacat menggagalkan seluruh query.
    // Nilai string SQL memuat satu backslash: ~ '^\d{4}-\d{2}-\d{2}$'
    expect(sql).toContain('^\\d{4}-\\d{2}-\\d{2}$');
    expect(sql).toContain('::date');
  });

  it('days dari query dibatasi 1..365', async () => {
    await call('/submissions/reminders', 'get', { query: { days: '9999' } });
    expect(mockedQuery.mock.calls[0][1][0]).toBe(365);
    mockedQuery.mockClear();
    mockedQuery.mockResolvedValue({ rows: [] });
    await call('/submissions/reminders', 'get', { query: { days: '0' } });
    expect(mockedQuery.mock.calls[0][1][0]).toBe(14);
  });
});

describe('POST /admin/submissions/:id/installation — proof_kind', () => {
  it('proof_kind tidak dikenal → 400', async () => {
    const res = await call('/submissions/:id/installation', 'post', {
      params: { id: 's1' },
      body: { media_location: 'Atrium 1', proof_kind: 'aneh' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Jenis bukti pemasangan harus link atau upload');
  });

  it('proof_kind disimpan pada baris pemasangan', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'disetujui' }] });
      }
      if (text.includes('SELECT id FROM promo_installations')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/installation', 'post', {
      params: { id: 's1' },
      body: { media_location: 'Atrium 1', proof_kind: 'upload' },
    });
    expect(res.statusCode).toBe(200);
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_installations'));
    expect(insert[1]).toContain('upload');
  });

  it('tanpa proof_kind → default link (perilaku lama utuh)', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'disetujui' }] });
      }
      if (text.includes('SELECT id FROM promo_installations')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/installation', 'post', {
      params: { id: 's1' },
      body: { media_location: 'Atrium 1' },
    });
    expect(res.statusCode).toBe(200);
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_installations'));
    expect(insert[1]).toContain('link');
  });
});

describe('POST /admin/submissions/:id/installation/proof', () => {
  it('mengunggah berkas ke Drive dan menyimpan metadatanya', async () => {
    mockedRead.mockResolvedValue({
      chunks: [Buffer.from('x')], head: Buffer.from([0xff, 0xd8, 0xff]),
      length: 3, originalName: 'bukti.jpg', contentType: 'image/jpeg',
    });
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'sudah_dipasang' }] });
      }
      if (text.includes('SELECT id FROM promo_installations')) return Promise.resolve({ rows: [{ id: 'i1' }] });
      return Promise.resolve({ rows: [] });
    });

    const res = await call('/submissions/:id/installation/proof', 'post', { params: { id: 's1' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.proof_file_id).toBe('drive-proof-1');
    expect(mockedUpload).toHaveBeenCalled();

    const update = mockedQuery.mock.calls.find((c) => String(c[0]).includes("proof_kind = 'upload'"));
    expect(update).toBeDefined();
    expect(update[1]).toContain('drive-proof-1');
  });

  it('rate limit memakai bucket sendiri (bukan drive-upload publik)', async () => {
    mockedRead.mockResolvedValue({
      chunks: [Buffer.from('x')], head: Buffer.from([0xff, 0xd8, 0xff]),
      length: 3, originalName: 'bukti.jpg', contentType: 'image/jpeg',
    });
    mockedQuery.mockResolvedValue({ rows: [{ id: 's1', status: 'sudah_dipasang' }] });
    await call('/submissions/:id/installation/proof', 'post', { params: { id: 's1' } });
    expect(mockedRateLimit.mock.calls[0][2]).toBe('admin-proof');
  });

  it('status belum boleh dipasang → 400 tanpa menyentuh Drive', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'menunggu_review' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/installation/proof', 'post', { params: { id: 's1' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Bukti tayang hanya dapat diunggah/);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('pengajuan tidak ada → 404', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const res = await call('/submissions/:id/installation/proof', 'post', { params: { id: 'hilang' } });
    expect(res.statusCode).toBe(404);
  });
});
