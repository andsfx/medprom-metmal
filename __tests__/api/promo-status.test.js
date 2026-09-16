/**
 * Test endpoint publik baru: halaman status via token (FR-019..FR-022) dan
 * kirim revisi materi (FR-015, FR-021, AC 11.3).
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
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);

function createMockRequest({ body = {}, params = {}, query = {} } = {}) {
  return { method: 'GET', body, params, query, headers: { 'user-agent': 'vitest' }, socket: {} };
}

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

async function call(path, method, { body, params, query } = {}) {
  const handler = getHandler(path, method);
  const req = createMockRequest({ body, params, query });
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockReturnValue(true);
});

const SUBMISSION_ROW = {
  id: 'sub-1',
  submission_number: 'MP-260916-ABC234',
  status_token: 'tok-abc',
  status: 'perlu_revisi',
  device_fingerprint: 'fp123',
  media_type_slug: 'spanduk',
  tenant_name: 'Optik Melawai',
  unit_number: 'L1-05',
};

describe('GET /promo/submissions/status/:token', () => {
  it('token valid → submission + riwayat + versi file + pemasangan', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_submissions WHERE status_token')) {
        return Promise.resolve({ rows: [SUBMISSION_ROW] });
      }
      if (text.includes('FROM promo_submission_history')) {
        return Promise.resolve({ rows: [{ id: 'h1', to_status: 'menunggu_review' }] });
      }
      if (text.includes('FROM promo_submission_files')) {
        return Promise.resolve({ rows: [{ id: 'f1', version: 1 }] });
      }
      if (text.includes('FROM promo_installations')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const res = await call('/submissions/status/:token', 'get', { params: { token: 'tok-abc' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.submission.id).toBe('sub-1');
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.files).toHaveLength(1);
    expect(res.body.data.installation).toBeNull();
    // Data internal tidak boleh ikut di-SELECT pada halaman status publik.
    const selectSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('FROM promo_submissions WHERE status_token'));
    expect(selectSql).not.toMatch(/device_fingerprint/);
    expect(selectSql).not.toMatch(/ip_address/);
  });

  it('token tidak dikenal → 404 dengan pesan seragam', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const res = await call('/submissions/status/:token', 'get', { params: { token: 'salah' } });
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/tidak ditemukan/i);
  });
});

describe('POST /promo/submissions/:id/revision', () => {
  const REVISION_BODY = {
    link_url: 'https://drive.google.com/file/d/new/view',
    device_fingerprint: 'fp123',
    notes: 'Sudah diperbaiki',
  };

  it('status Perlu Revisi → versi baru + status kembali Menunggu Review', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, status, status_token, device_fingerprint')) {
        return Promise.resolve({ rows: [SUBMISSION_ROW] });
      }
      if (text.includes('COALESCE(MAX(version)')) return Promise.resolve({ rows: [{ v: 1 }] });
      return Promise.resolve({ rows: [] });
    });

    const res = await call('/submissions/:id/revision', 'post', {
      params: { id: 'sub-1' },
      body: REVISION_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.status).toBe('menunggu_review');

    // Versi baru dicatat, versi lama tetap ada (tidak ada DELETE).
    const insertFile = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submission_files'));
    expect(insertFile).toBeDefined();
    expect(insertFile[1][1]).toBe(2);              // version
    expect(insertFile[1][7]).toBe('https://drive.google.com/file/d/new/view'); // link_url
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('DELETE FROM promo_submission_files'))).toBe(true);
  });

  it('status bukan Perlu Revisi → 400', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, status, status_token, device_fingerprint')) {
        return Promise.resolve({ rows: [{ ...SUBMISSION_ROW, status: 'disetujui' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/revision', 'post', {
      params: { id: 'sub-1' },
      body: REVISION_BODY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Perlu Revisi/);
  });

  it('fingerprint perangkat berbeda → 404 (bukan milik perangkat ini)', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, status, status_token, device_fingerprint')) {
        return Promise.resolve({ rows: [{ ...SUBMISSION_ROW, device_fingerprint: 'lain' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/revision', 'post', {
      params: { id: 'sub-1' },
      body: REVISION_BODY,
    });
    expect(res.statusCode).toBe(404);
  });

  it('tautan revisi tidak valid → 400 tanpa menulis versi', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, status, status_token, device_fingerprint')) {
        return Promise.resolve({ rows: [SUBMISSION_ROW] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submissions/:id/revision', 'post', {
      params: { id: 'sub-1' },
      body: { ...REVISION_BODY, link_url: 'javascript:alert(1)' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_submission_files'))).toBe(true);
  });
});
