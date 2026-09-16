/**
 * Test API staf: penegakan transisi status (FR-032..FR-037), pencatatan
 * pemasangan (FR-040..FR-044), dan ringkasan jumlah per status (FR-025).
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
import { deleteDriveFileOrThrow } from '../../server/src/drive.js';

const mockedQuery = vi.mocked(db.query);

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader() { return this; },
    end() { return this; },
    send(data) { this.body = data; return this; },
  };
}

function getHandler(path, method) {
  const layer = adminRouter.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`handler ${method.toUpperCase()} ${path} tidak ditemukan`);
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

async function call(path, method, { body, params, query } = {}) {
  const handler = getHandler(path, method);
  const req = {
    method: 'GET',
    body,
    params,
    query,
    headers: {},
    socket: {},
    // requireRole sudah dilewati (handler dipanggil langsung) — sediakan sesi.
    auth: { user: { id: 'admin-1', display_name: 'Admin Satu', role: 'admin' } },
  };
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /admin/submissions/:id/status — transisi', () => {
  it('menunggu_review → disetujui diterima', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'menunggu_review' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await call('/submissions/:id/status', 'post', {
      params: { id: 's1' },
      body: { status: 'disetujui', review_notes: 'Materi sesuai ketentuan' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('disetujui');
    expect(mockedQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO promo_submission_history'))).toBe(true);
  });

  it('menunggu_review → sudah_dipasang ditolak (lompat status)', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'menunggu_review' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/status', 'post', {
      params: { id: 's1' },
      body: { status: 'sudah_dipasang', review_notes: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/tidak dapat berpindah/);
  });

  it('minta revisi tanpa komentar → 400 (FR-035)', async () => {
    const res = await call('/submissions/:id/status', 'post', {
      params: { id: 's1' },
      body: { status: 'perlu_revisi', review_notes: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Komentar wajib/);
  });

  it('menolak tanpa alasan → 400 (FR-036)', async () => {
    const res = await call('/submissions/:id/status', 'post', {
      params: { id: 's1' },
      body: { status: 'ditolak', review_notes: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Alasan wajib/);
  });

  it('status tidak dikenal → 400', async () => {
    const res = await call('/submissions/:id/status', 'post', {
      params: { id: 's1' },
      body: { status: 'pending', review_notes: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Status tidak dikenal');
  });

  it('pengajuan tidak ada → 404', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const res = await call('/submissions/:id/status', 'post', {
      params: { id: 'hilang' },
      body: { status: 'disetujui', review_notes: 'ok' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /admin/submissions/:id/installation', () => {
  it('materi Disetujui → catatan pemasangan + status Sudah Dipasang', async () => {
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
      body: { media_location: 'Atrium 1', start_date: '2026-10-01', end_date: '2026-10-31', notes: 'Pemasangan pagi' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('sudah_dipasang');
    expect(mockedQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO promo_installations'))).toBe(true);
    const statusUpdate = mockedQuery.mock.calls.find((c) => String(c[0]).includes("SET status = 'sudah_dipasang'"));
    expect(statusUpdate).toBeDefined();
  });

  it('materi masih Menunggu Review → 400 (FR-040)', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'menunggu_review' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/installation', 'post', {
      params: { id: 's1' },
      body: { media_location: 'Atrium 1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Disetujui/);
  });

  it('tanpa media/lokasi → 400 (FR-041)', async () => {
    const res = await call('/submissions/:id/installation', 'post', {
      params: { id: 's1' },
      body: { media_location: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/lokasi pemasangan wajib/i);
  });

  it('tanggal berakhir sebelum mulai → 400', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, status FROM promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 's1', status: 'disetujui' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/installation', 'post', {
      params: { id: 's1' },
      body: { media_location: 'Atrium 1', start_date: '2026-10-31', end_date: '2026-10-01' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /admin/submissions/summary', () => {
  it('mengembalikan jumlah per status + total (FR-025)', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        { status: 'menunggu_review', n: 3 },
        { status: 'disetujui', n: 2 },
        { status: 'sudah_dipasang', n: 1 },
      ],
    });
    const res = await call('/submissions/summary', 'get', {});
    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(6);
    expect(res.body.data.counts.menunggu_review).toBe(3);
    expect(res.body.data.counts.disetujui).toBe(2);
    // Status yang belum ada tetap muncul dengan nilai 0.
    expect(res.body.data.counts.perlu_revisi).toBe(0);
    expect(res.body.data.counts.selesai).toBe(0);
  });
});

describe('GET /admin/submissions — filter & pencarian', () => {
  it('mencari nomor pengajuan/tenant/judul materi (FR-026)', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions', 'get', { query: { q: 'MP-260916' } });
    expect(res.statusCode).toBe(200);
    const selectSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('FROM promo_submissions s'));
    expect(selectSql).toMatch(/submission_number ILIKE/);
    expect(selectSql).toMatch(/tenant_name ILIKE/);
    expect(selectSql).toMatch(/material_title ILIKE/);
  });

  it('filter rentang tanggal + tenant diteruskan ke SQL', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions', 'get', {
      query: { date_from: '2026-09-01', date_to: '2026-09-30', tenant: 'Melawai' },
    });
    expect(res.statusCode).toBe(200);
    const selectSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('FROM promo_submissions s'));
    // Urutan placeholder mengikuti urutan filter: tenant, date_from, date_to.
    expect(selectSql).toMatch(/tenant_name ILIKE \$1/);
    expect(selectSql).toMatch(/created_at >= \$2::date/);
    expect(selectSql).toMatch(/created_at < \(\$3::date \+ interval '1 day'\)/);
  });

  it('tanggal tidak valid diabaikan, bukan membuat query gagal', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions', 'get', { query: { date_from: 'kemarin' } });
    expect(res.statusCode).toBe(200);
    const selectSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('FROM promo_submissions s'));
    expect(selectSql).not.toMatch(/created_at >=/);
  });
});

describe('POST /admin/submissions/:id/delete', () => {
  it('tautan — hapus tanpa menyentuh Drive (FR-045)', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, source_type, drive_file_id')) {
        return Promise.resolve({ rows: [{ id: 's1', source_type: 'link', drive_file_id: null }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/delete', 'post', { params: { id: 's1' } });
    expect(res.statusCode).toBe(200);
    expect(deleteDriveFileOrThrow).not.toHaveBeenCalled();
  });

  it('legacy R2 (upload tanpa drive_file_id) — hapus tanpa error Drive', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, source_type, drive_file_id')) {
        return Promise.resolve({ rows: [{ id: 's2', source_type: 'upload', drive_file_id: '' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/delete', 'post', { params: { id: 's2' } });
    expect(res.statusCode).toBe(200);
    expect(deleteDriveFileOrThrow).not.toHaveBeenCalled();
  });

  it('unggah dengan drive_file_id — hapus Drive dulu, lalu hapus row', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, source_type, drive_file_id')) {
        return Promise.resolve({ rows: [{ id: 's3', source_type: 'upload', drive_file_id: 'drv_abc' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/delete', 'post', { params: { id: 's3' } });
    expect(res.statusCode).toBe(200);
    expect(deleteDriveFileOrThrow).toHaveBeenCalledWith('drv_abc');
  });
});
