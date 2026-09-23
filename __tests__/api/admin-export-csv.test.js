/**
 * Test ekspor CSV staf (GET /admin/export).
 *
 * Handler asli dijalankan dengan `db`/`auth` di-mock. Yang dikunci:
 *  - BOM UTF-8 di awal + CRLF antar baris (Excel membaca dengan benar);
 *  - netralisasi formula spreadsheet (CSV injection) pada nilai kiriman tenant
 *    dan nomor telepon `+62...`;
 *  - akses ekspor (memuat PII) tercatat lewat logActivity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/src/db.js', () => ({
  db: { query: vi.fn(), ready: true, verify: vi.fn(), end: vi.fn() },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/drive.js', () => ({
  deleteDriveFileOrThrow: vi.fn(),
  getDriveFile: vi.fn(),
}));
vi.mock('../../server/src/auth.js', () => ({
  requireRole: () => (req, _res, next) => {
    req.auth = { user: { id: 'admin-1', display_name: 'Admin Satu', role: 'admin' } };
    next();
  },
  logActivity: vi.fn(),
  READ_ROLES: ['superadmin', 'admin', 'tenant_relation'],
  STAFF_ROLES: ['superadmin', 'admin'],
}));

import adminRouter from '../../server/src/routes/admin.js';
import { db } from '../../server/src/db.js';
import { logActivity } from '../../server/src/auth.js';

const mockedQuery = vi.mocked(db.query);
const mockedLog = vi.mocked(logActivity);

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
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; },
    setHeader(key, value) { this.headers[key] = value; return this; },
  };
}

async function callExport() {
  const handler = getHandler('/export', 'get');
  const req = {
    method: 'GET',
    headers: {},
    socket: {},
    auth: { user: { id: 'admin-1', display_name: 'Admin Satu', role: 'admin' } },
  };
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

const ROW = {
  submission_number: 'MP-260916-ABC234',
  created_at: '2026-09-16T01:00:00Z',
  tenant_name: 'Optik Melawai',
  tenant_id: 'T001',
  unit_number: 'L1-05',
  pic_name: 'Andi',
  pic_phone: '+6281234567890',
  media_type_slug: 'spanduk',
  campaign_name: 'Promo Akhir Tahun',
  material_title: '=CMD|calc!A1',
  installation_date: '',
  status: 'menunggu_review',
  review_notes: '',
  notes: '',
  source_type: 'link',
  file_name: '',
  file_url: '',
  link_url: 'https://drive.google.com/file/d/xyz/view',
  ip_address: '203.0.113.5',
};

beforeEach(() => { vi.clearAllMocks(); });

describe('GET /admin/export — CSV', () => {
  it('diawali BOM UTF-8 dan memakai CRLF', async () => {
    mockedQuery.mockResolvedValue({ rows: [ROW] });
    const res = await callExport();
    expect(res.body.startsWith('\uFEFF')).toBe(true);
    expect(res.body).toContain('\r\n');
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
  });

  it('menetralkan formula spreadsheet pada nilai kiriman tenant', async () => {
    mockedQuery.mockResolvedValue({ rows: [ROW] });
    const res = await callExport();
    // Sel berawalan '=' diberi awalan ' (tanda teks) sehingga Excel tidak
    // mengeksekusinya sebagai rumus.
    expect(res.body).toContain(`'=CMD|calc!A1`);
    expect(res.body).not.toContain(',=CMD|calc!A1,');
  });

  it('menetralkan nomor telepon berawalan + agar tidak jadi rumus', async () => {
    mockedQuery.mockResolvedValue({ rows: [ROW] });
    const res = await callExport();
    expect(res.body).toContain(`'+6281234567890`);
  });

  it('mencatat akses ekspor (memuat PII) lewat logActivity', async () => {
    mockedQuery.mockResolvedValue({ rows: [ROW] });
    await callExport();
    expect(mockedLog).toHaveBeenCalledTimes(1);
    const [user, action, resourceType] = mockedLog.mock.calls[0];
    expect(user.id).toBe('admin-1');
    expect(action).toBe('export_submissions');
    expect(resourceType).toBe('promo_submission');
  });

  it('nilai biasa tidak diubah dan header tetap utuh', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ ...ROW, pic_phone: '081234567890', material_title: 'Spanduk Diskon' }] });
    const res = await callExport();
    const [header, firstRow] = String(res.body).replace(/^\uFEFF/, '').split('\r\n');
    expect(header).toContain('Nomor Pengajuan');
    expect(firstRow).toContain('Spanduk Diskon');
    expect(firstRow).toContain('081234567890');
    expect(firstRow).not.toContain(`'081234567890`);
  });

  it('memuat kolom alur cetak: jenis pemohon, batch, dan pajak', async () => {
    mockedQuery.mockResolvedValue({
      rows: [{
        ...ROW,
        applicant_type: 'non_tenant',
        submission_date: '2026-09-20',
        batch_number: 'MPB-260920-ABC234',
        subtotal: 490000, ppn_amount: 53900, total_amount: 543900,
      }],
    });
    const res = await callExport();
    const [header, firstRow] = String(res.body).replace(/^\uFEFF/, '').split('\r\n');
    for (const kolom of ['Jenis Pemohon', 'Tanggal Pengajuan', 'Nomor Batch', 'Subtotal', 'PPN', 'Total']) {
      expect(header).toContain(kolom);
    }
    expect(firstRow).toContain('Non-tenant');
    expect(firstRow).toContain('MPB-260920-ABC234');
    expect(firstRow).toContain('543900');
  });

  it('header memakai istilah "Nama Tenant", bukan "Nama Gerai"', async () => {
    mockedQuery.mockResolvedValue({ rows: [ROW] });
    const res = await callExport();
    const header = String(res.body).replace(/^\uFEFF/, '').split('\r\n')[0];
    expect(header).toContain('Nama Tenant');
    expect(header).not.toContain('Nama Gerai');
  });

  it('source_type "none" tampil sebagai "Menyusul", bukan "Unggah"', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ ...ROW, source_type: 'none' }] });
    const res = await callExport();
    const firstRow = String(res.body).replace(/^\uFEFF/, '').split('\r\n')[1];
    expect(firstRow).toContain('Menyusul');
  });
});
