/**
 * Test fitur bukti pembayaran pajak media cetak.
 *
 * Kontrak rapuh yang dikunci:
 *  - saklar on/off disimpan di server (tabel `app_settings`) dan dibaca tiap
 *    permintaan, bukan flag build-time;
 *  - endpoint publik HANYA membocorkan boolean, bukan data internal;
 *  - `POST /promo/submit-batch` menyimpan bukti pajak HANYA bila fitur menyala;
 *    saat mati, field pajak dari klien DIABAIKAN (bukan sekadar tidak tampil);
 *  - unggah staf menolak saat fitur mati (409) dan untuk pengajuan tanpa PPN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/src/db.js', () => ({
  db: { query: vi.fn(), ready: true, verify: vi.fn(), end: vi.fn() },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/drive.js', () => ({
  getDriveFile: vi.fn(),
  deleteDriveFileOrThrow: vi.fn(),
  readMultipartFile: vi.fn(),
  driveReady: true,
  ALLOWED_MIME: new Set(['image/jpeg', 'image/png', 'application/pdf', 'video/mp4']),
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  checkMagicBytes: vi.fn(() => ({ ok: true })),
  uploadToDrive: vi.fn(async () => ({ id: 'drive-tax-1', webViewLink: 'https://drive.google.com/file/d/tax-1/view' })),
  safeFileName: vi.fn((n) => `${n}.png`),
  extOf: vi.fn(() => 'png'),
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
vi.mock('../../server/src/lib/turnstile.js', () => ({
  verifyTurnstile: vi.fn(async () => ({ ok: true })),
}));

import promoRouter from '../../server/src/routes/promo.js';
import adminRouter from '../../server/src/routes/admin.js';
import { db } from '../../server/src/db.js';
import { readMultipartFile, uploadToDrive, deleteDriveFileOrThrow } from '../../server/src/drive.js';
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);
const mockedRead = vi.mocked(readMultipartFile);
const mockedUpload = vi.mocked(uploadToDrive);
const mockedDeleteDrive = vi.mocked(deleteDriveFileOrThrow);
const mockedRateLimit = vi.mocked(enforceRateLimit);

/** Nilai saklar yang "tersimpan" - stateful supaya POST lalu GET konsisten. */
let taxValue = 'false';

function getHandler(router, path, method) {
  const layer = router.stack.find(
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

async function call(router, path, method, { body = {}, params = {}, query = {} } = {}) {
  const handler = getHandler(router, path, method);
  const req = {
    method: method.toUpperCase(), body, params, query,
    headers: { 'user-agent': 'vitest' }, socket: {},
    auth: { user: { id: 'u1', display_name: 'Admin Satu' } },
  };
  const res = createMockResponse();
  await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
  return res;
}

function mediaCetak(slug, over = {}) {
  return {
    slug, name: slug,
    rules: 'Minimal sewa pemasangan media promosi outdoor yakni 1 minggu (7 hari).',
    media_channel: 'cetak', price_amount: 70000, price_unit: 'hari',
    ppn_included: false, ...over,
  };
}

const ITEM = {
  media_type_slug: 'spanduk',
  media_target: 'Sisi Pintu Tol Bekasi Barat',
  air_start_date: '2026-10-01',
  air_end_date: '2026-10-07',
  installation_date: '2026-10-01',
};

const BASE = {
  applicant_type: 'tenant', tenant_name: 'Optik Melawai', unit_number: 'L1-05',
  pic_name: 'Andi', pic_phone: '081234567890', submission_date: '2026-09-20',
  notes: '', terms_accepted: true, device_fingerprint: 'fp-pajak-1',
  items: [ITEM],
};

/** Mock DB: app_settings stateful + alur batch + cek pajak pengajuan. */
function mockDb({ ppnRate = 0.11, submissionFound = true } = {}) {
  mockedQuery.mockImplementation((sql, params) => {
    const text = String(sql);
    if (text.includes('FROM app_settings')) return Promise.resolve({ rows: [{ value: taxValue }] });
    if (text.includes('INSERT INTO app_settings')) {
      taxValue = String(params?.[1] ?? 'false');
      return Promise.resolve({ rows: [] });
    }
    if (text.includes('FROM promo_media_types')) {
      const slugs = params?.[0] || [];
      return Promise.resolve({ rows: [mediaCetak('spanduk')].filter((m) => slugs.includes(m.slug)) });
    }
    if (text.includes('COUNT(DISTINCT')) return Promise.resolve({ rows: [{ n: 0 }] });
    if (text.includes('INSERT INTO promo_submission_batches')) {
      return Promise.resolve({ rows: [{ id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1', created_at: '2026-09-20T00:00:00Z' }] });
    }
    if (text.includes('INSERT INTO promo_submissions')) {
      return Promise.resolve({
        rows: [{ id: 'sub-1', submission_number: 'MP-260920-AAA231', status_token: 'tok-1', media_type_slug: 'spanduk', status: 'menunggu_review', created_at: '2026-09-20T00:00:00Z' }],
      });
    }
    if (text.includes('SELECT id, ppn_rate FROM promo_submissions')) {
      return Promise.resolve({ rows: submissionFound ? [{ id: 'sub-1', ppn_rate: ppnRate }] : [] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  taxValue = 'false';
  mockedRateLimit.mockReturnValue(true);
  mockedUpload.mockResolvedValue({ id: 'drive-tax-1', webViewLink: 'https://drive.google.com/file/d/tax-1/view' });
  mockDb();
});

// ─── Fail-safe: tabel settings belum ada (migrasi belum jalan) ────

describe('fail-safe saat tabel app_settings belum ada', () => {
  /** Tiru DB yang belum di-migrate: query app_settings melempar. */
  function mockTanpaTabelSettings() {
    mockedQuery.mockImplementation((sql, params) => {
      const text = String(sql);
      if (text.includes('FROM app_settings')) {
        return Promise.reject(new Error('relation "app_settings" does not exist'));
      }
      if (text.includes('FROM promo_media_types')) {
        const slugs = params?.[0] || [];
        return Promise.resolve({ rows: [mediaCetak('spanduk')].filter((m) => slugs.includes(m.slug)) });
      }
      if (text.includes('COUNT(DISTINCT')) return Promise.resolve({ rows: [{ n: 0 }] });
      if (text.includes('INSERT INTO promo_submission_batches')) {
        return Promise.resolve({ rows: [{ id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1', created_at: '2026-09-20T00:00:00Z' }] });
      }
      if (text.includes('INSERT INTO promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 'sub-1', submission_number: 'MP-260920-AAA231', status_token: 'tok-1', media_type_slug: 'spanduk', status: 'menunggu_review', created_at: '2026-09-20T00:00:00Z' }] });
      }
      return Promise.resolve({ rows: [] });
    });
  }

  it('GET /promo/settings tetap 200 dan melaporkan MATI', async () => {
    mockTanpaTabelSettings();
    const res = await call(promoRouter, '/settings', 'get');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.tax_proof_enabled).toBe(false);
  });

  it('POST /promo/submit-batch tetap 201 (fitur sekadar mati, bukan 500)', async () => {
    mockTanpaTabelSettings();
    const res = await call(promoRouter, '/submit-batch', 'post', {
      body: { ...BASE, items: [{ ...ITEM, tax_proof_file_id: 'drive-tax-1', tax_proof_file_name: 'bukti.png' }] },
    });
    expect(res.statusCode).toBe(201);
    // Tanpa tabel settings, bukti pajak TIDAK tersimpan.
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insert[1]).not.toContain('drive-tax-1');
  });
});


describe('GET /promo/settings', () => {
  it('membocorkan hanya boolean saklar (bukan data internal)', async () => {
    taxValue = 'true';
    const res = await call(promoRouter, '/settings', 'get');
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ tax_proof_enabled: true });
  });

  it('bawaan MATI bila baris belum ada', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM app_settings')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call(promoRouter, '/settings', 'get');
    expect(res.body.data.tax_proof_enabled).toBe(false);
  });
});

// ─── submit-batch: gerbang bukti pajak ────────────────────────────

describe('POST /promo/submit-batch — bukti pajak', () => {
  const PAJAK = {
    tax_proof_file_id: 'drive-tax-1',
    tax_proof_file_url: 'https://drive.google.com/file/d/tax-1/view',
    tax_proof_file_name: 'bukti.png',
    tax_proof_mime: 'image/png',
    tax_proof_size_bytes: 1234,
  };

  it('fitur menyala → bukti pajak tersimpan pada baris pengajuan', async () => {
    taxValue = 'true';
    const res = await call(promoRouter, '/submit-batch', 'post', {
      body: { ...BASE, items: [{ ...ITEM, ...PAJAK }] },
    });
    expect(res.statusCode).toBe(201);

    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insert).toBeDefined();
    expect(insert[1]).toContain('drive-tax-1');
    expect(insert[1]).toContain('bukti.png');
  });

  it('fitur MATI → field pajak dari klien diabaikan sepenuhnya', async () => {
    taxValue = 'false';
    const res = await call(promoRouter, '/submit-batch', 'post', {
      body: { ...BASE, items: [{ ...ITEM, ...PAJAK }] },
    });
    expect(res.statusCode).toBe(201);

    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insert[1]).not.toContain('drive-tax-1');
    expect(insert[1]).not.toContain('bukti.png');
  });
});

// ─── Hapus pengajuan: berkas pajak tidak jadi yatim ──────────────

describe('POST /admin/submissions/:id/delete — bukti pajak', () => {
  /** Mock SELECT penghapusan dengan nilai berkas tertentu. */
  function mockHapus({ taxProofFileId = '' }) {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, source_type, drive_file_id, tax_proof_file_id')) {
        return Promise.resolve({ rows: [{ id: 'sub-1', source_type: 'none', drive_file_id: '', tax_proof_file_id: taxProofFileId }] });
      }
      return Promise.resolve({ rows: [] });
    });
  }

  it('menghapus berkas pajak dari Drive saat pengajuan dihapus', async () => {
    mockHapus({ taxProofFileId: 'drive-tax-9' });
    const res = await call(adminRouter, '/submissions/:id/delete', 'post', { params: { id: 'sub-1' } });

    expect(res.statusCode).toBe(200);
    expect(mockedDeleteDrive).toHaveBeenCalledWith('drive-tax-9');
  });

  it('tanpa bukti pajak: tidak ada panggilan hapus Drive', async () => {
    mockHapus({ taxProofFileId: '' });
    const res = await call(adminRouter, '/submissions/:id/delete', 'post', { params: { id: 'sub-1' } });

    expect(res.statusCode).toBe(200);
    expect(mockedDeleteDrive).not.toHaveBeenCalled();
  });

  it('kegagalan hapus berkas pajak TIDAK menahan penghapusan baris', async () => {
    mockedDeleteDrive.mockRejectedValueOnce(new Error('drive down'));
    mockHapus({ taxProofFileId: 'drive-tax-9' });
    const res = await call(adminRouter, '/submissions/:id/delete', 'post', { params: { id: 'sub-1' } });

    expect(res.statusCode).toBe(200);
    expect(mockedQuery.mock.calls.some((c) => String(c[0]).includes('DELETE FROM promo_submissions'))).toBe(true);
  });
});

// ─── Saklar admin ─────────────────────────────────────────────────

describe('GET/POST /admin/settings', () => {
  it('GET mengembalikan keadaan saklar', async () => {
    taxValue = 'true';
    const res = await call(adminRouter, '/settings', 'get');
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ tax_proof_enabled: true });
  });

  it('POST nilai bukan boolean → 400 dan tidak menulis apa pun', async () => {
    const res = await call(adminRouter, '/settings', 'post', { body: { tax_proof_enabled: 'ya' } });
    expect(res.statusCode).toBe(400);
    expect(mockedQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO app_settings'))).toBe(false);
  });

  it('POST boolean → tersimpan dan terbaca ulang', async () => {
    const res = await call(adminRouter, '/settings', 'post', { body: { tax_proof_enabled: true } });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.tax_proof_enabled).toBe(true);

    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO app_settings'));
    expect(insert).toBeDefined();
    expect(insert[1]).toContain('true');

    const baca = await call(adminRouter, '/settings', 'get');
    expect(baca.body.data.tax_proof_enabled).toBe(true);
  });
});

// ─── Unggah bukti pajak oleh staf ─────────────────────────────────

describe('POST /admin/submissions/:id/tax-proof', () => {
  const PARAMS = { id: 'sub-1' };

  it('fitur mati → 409 (fail-closed)', async () => {
    taxValue = 'false';
    const res = await call(adminRouter, '/submissions/:id/tax-proof', 'post', { params: PARAMS });
    expect(res.statusCode).toBe(409);
    expect(mockedRead).not.toHaveBeenCalled();
  });

  it('pengajuan tidak ditemukan → 404', async () => {
    taxValue = 'true';
    mockDb({ submissionFound: false });
    const res = await call(adminRouter, '/submissions/:id/tax-proof', 'post', { params: PARAMS });
    expect(res.statusCode).toBe(404);
  });

  it('pengajuan tanpa PPN (ppn_rate 0) → 400', async () => {
    taxValue = 'true';
    mockDb({ ppnRate: 0 });
    const res = await call(adminRouter, '/submissions/:id/tax-proof', 'post', { params: PARAMS });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/ber-PPN/i);
  });

  it('format berkas tidak diizinkan → 400', async () => {
    taxValue = 'true';
    mockedRead.mockResolvedValue({ chunks: [], length: 10, contentType: 'text/plain', head: Buffer.alloc(4), originalName: 'x.txt' });
    const res = await call(adminRouter, '/submissions/:id/tax-proof', 'post', { params: PARAMS });
    expect(res.statusCode).toBe(400);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('berhasil → unggah ke Drive + simpan kolom pajak', async () => {
    taxValue = 'true';
    mockedRead.mockResolvedValue({ chunks: [], length: 1234, contentType: 'image/png', head: Buffer.alloc(4), originalName: 'bukti.png' });
    const res = await call(adminRouter, '/submissions/:id/tax-proof', 'post', { params: PARAMS });

    expect(res.statusCode).toBe(200);
    expect(mockedUpload).toHaveBeenCalledTimes(1);

    const update = mockedQuery.mock.calls.find((c) => String(c[0]).includes('tax_proof_file_id = $1'));
    expect(update).toBeDefined();
    expect(update[1][0]).toBe('drive-tax-1');
    expect(update[1][1]).toBe('https://drive.google.com/file/d/tax-1/view');
    expect(update[1][6]).toBe('sub-1');
  });
});
