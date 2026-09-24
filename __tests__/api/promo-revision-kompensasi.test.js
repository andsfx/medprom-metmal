/**
 * Test kompensasi alur revisi (#4).
 *
 * Kontrak rapuh yang dikunci: alur revisi melakukan tiga tulis berurutan TANPA
 * transaksi (`db` tidak menyediakan `connect()`). Urutannya dibuat dapat
 * dikompensasi: versi materi + riwayat lebih dulu, UPDATE status terakhir. Bila
 * langkah gagal, baris yang telanjur masuk DIHAPUS sehingga status
 * 'perlu_revisi' tetap utuh dan tenant dapat mengirim ulang - bukan
 * meninggalkan keadaan setengah jadi.
 *
 * Handler sungguhan, pola mock sama dengan `__tests__/api/promo-status.test.js`.
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
    end() { return this; },
  };
}

async function call(path, method, { body, params } = {}) {
  const handler = getHandler(path, method);
  const req = {
    method: method.toUpperCase(), body, params, query: {},
    headers: { 'user-agent': 'vitest' }, socket: {},
  };
  const res = createMockResponse();
  await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
  return res;
}

const BODY = {
  link_url: 'https://drive.google.com/file/d/new/view',
  device_fingerprint: 'fp123',
  notes: 'Sudah diperbaiki',
};

const SUBMISSION = {
  id: 'sub-1', status_token: 'tok-abc', status: 'perlu_revisi',
  device_fingerprint: 'fp123', source_type: 'link', pic_name: 'Andi',
};

/** Semua SQL yang dikirim ke driver. */
function semuaSql() {
  return mockedQuery.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockReturnValue(true);
});

describe('POST /promo/submissions/:id/revision - kompensasi kegagalan sebagian', () => {
  it('riwayat gagal -> baris versi yang telanjur masuk DIHAPUS, status tidak diubah', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_submissions WHERE id = $1')) {
        return Promise.resolve({ rows: [SUBMISSION] });
      }
      if (text.includes('COALESCE(MAX(version)')) return Promise.resolve({ rows: [{ v: 1 }] });
      if (text.includes('INSERT INTO promo_submission_files')) {
        return Promise.resolve({ rows: [{ id: 'f-new' }] });
      }
      if (text.includes('INSERT INTO promo_submission_history')) {
        return Promise.reject(new Error('riwayat gagal ditulis'));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await call('/submissions/:id/revision', 'post', { params: { id: 'sub-1' }, body: BODY });
    expect(res.statusCode).toBe(500);

    const sql = semuaSql();
    // Baris versi dikompensasi (dihapus).
    const hapusVersi = mockedQuery.mock.calls.find((c) => String(c[0]).includes('DELETE FROM promo_submission_files'));
    expect(hapusVersi).toBeDefined();
    expect(hapusVersi[1]).toContain('f-new');
    // UPDATE status TIDAK pernah dijalankan (langkah terakhir, tidak tercapai).
    expect(sql.some((s) => s.includes('UPDATE promo_submissions'))).toBe(false);
  });

  it('sukses -> versi, riwayat, lalu UPDATE status (urutan dapat dikompensasi)', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_submissions WHERE id = $1')) {
        return Promise.resolve({ rows: [SUBMISSION] });
      }
      if (text.includes('COALESCE(MAX(version)')) return Promise.resolve({ rows: [{ v: 1 }] });
      if (text.includes('INSERT INTO promo_submission_files')) return Promise.resolve({ rows: [{ id: 'f-new' }] });
      if (text.includes('INSERT INTO promo_submission_history')) return Promise.resolve({ rows: [{ id: 'h-new' }] });
      return Promise.resolve({ rows: [] });
    });

    const res = await call('/submissions/:id/revision', 'post', { params: { id: 'sub-1' }, body: BODY });
    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe(2);

    const sql = semuaSql();
    const idxFile = sql.findIndex((s) => s.includes('INSERT INTO promo_submission_files'));
    const idxHist = sql.findIndex((s) => s.includes('INSERT INTO promo_submission_history'));
    const idxUpdate = sql.findIndex((s) => s.includes('UPDATE promo_submissions'));
    expect(idxFile).toBeGreaterThan(-1);
    expect(idxHist).toBeGreaterThan(idxFile);
    expect(idxUpdate).toBeGreaterThan(idxHist);
    // Tidak ada kompensasi saat sukses.
    expect(sql.some((s) => s.includes('DELETE FROM promo_submission_files'))).toBe(false);
  });
});
