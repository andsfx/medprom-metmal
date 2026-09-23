// @vitest-environment node
/**
 * Test regresi URUTAN RUTE Express: `GET /admin/submissions/reminders` harus
 * dilayani handler pengingat, bukan tertutup oleh `GET /admin/submissions/:id`.
 *
 * Berbeda dari `admin-cetak.test.js` yang memanggil handler LANGSUNG dari
 * `adminRouter.stack` (sehingga pencocokan rute Express tidak pernah
 * dieksekusi), test ini memasang router ke aplikasi Express sungguhan dan
 * menembaknya lewat HTTP nyata. Inilah satu-satunya cara menangkap bug
 * "rute tertutup rute lain": Express 4 mencocokkan rute BERURUTAN, jadi
 * `/submissions/reminders` yang didaftarkan SETELAH `/submissions/:id` akan
 * ditangkap sebagai `:id = 'reminders'`.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';

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

const mockedQuery = vi.mocked(db.query);

const UUID_VALID = '11111111-1111-4111-8111-111111111111';

// Penanda SQL: query pengingat memuat `AS ppn_amount`; query detail memuat
// `WHERE s.id = $1`. Keduanya harus dibedakan supaya test tahu handler mana
// yang benar-benar melayani permintaan.
const REMINDER_SQL_MARK = 'AS ppn_amount';
const DETAIL_SQL_MARK = 'WHERE s.id = $1';

const REMINDER_ROWS = [
  { id: 's1', submission_number: 'MP-1', days_left: -2, end_date: '2026-09-18', ppn_amount: 53900 },
  { id: 's2', submission_number: 'MP-2', days_left: 3, end_date: '2026-09-23', ppn_amount: 53900 },
];
const DETAIL_ROW = { id: UUID_VALID, submission_number: 'MP-DETAIL', status: 'sudah_dipasang' };

function detailQueryCalled() {
  return mockedQuery.mock.calls.some((c) => String(c[0]).includes(DETAIL_SQL_MARK));
}

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use('/admin', adminRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ success: false, error: err.message });
  });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes(REMINDER_SQL_MARK)) return Promise.resolve({ rows: REMINDER_ROWS });
    if (text.includes(DETAIL_SQL_MARK)) return Promise.resolve({ rows: [DETAIL_ROW] });
    return Promise.resolve({ rows: [] });
  });
});

describe('urutan rute admin: reminders vs :id', () => {
  it('GET /admin/submissions/reminders → 200 payload pengingat (bukan payload detail)', async () => {
    const res = await fetch(`${baseUrl}/admin/submissions/reminders`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Bentuk payload pengingat.
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.days).toBe(14);
    expect(body.data.overdue).toBe(1);
    expect(body.data.due_soon).toBe(1);
    // BUKAN payload detail.
    expect(body.data.submission).toBeUndefined();
  });

  it('GET /admin/submissions/reminders TIDAK memanggil query detail', async () => {
    await fetch(`${baseUrl}/admin/submissions/reminders`);
    expect(detailQueryCalled()).toBe(false);
  });

  it('GET /admin/submissions/<uuid-valid> tetap melayani payload detail', async () => {
    const res = await fetch(`${baseUrl}/admin/submissions/${UUID_VALID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.submission).toMatchObject({ id: UUID_VALID });
    expect(detailQueryCalled()).toBe(true);
  });
});
