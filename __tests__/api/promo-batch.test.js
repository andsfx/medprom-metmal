/**
 * Test endpoint batch cetak: POST /promo/submit-batch + status/track batch.
 *
 * Kontrak rapuh yang dikunci:
 *  - fan-out: satu kirim → N baris promo_submissions, semua single-media,
 *    `source_type='none'`, menunjuk satu `batch_id`;
 *  - snapshot harga/PPN dihitung SERVER (klien tidak dipercaya);
 *  - hanya media berkanal `cetak` yang diterima (digital ditolak);
 *  - minimal 7 hari ditegakkan sebelum apa pun ditulis;
 *  - kuota anti-spam dihitung per BATCH, bukan per baris;
 *  - respons publik batch tidak membocorkan fingerprint/IP.
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
}));

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);
const mockedRateLimit = vi.mocked(enforceRateLimit);

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
  };
}

async function call(path, method, { body = {}, params = {}, query = {} } = {}) {
  const handler = getHandler(path, method);
  const req = { method: method.toUpperCase(), body, params, query, headers: { 'user-agent': 'vitest' }, socket: {} };
  const res = createMockResponse();
  await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
  return res;
}

/** Media cetak mock untuk slug tertentu. */
function mediaCetak(slug, over = {}) {
  return {
    slug,
    name: slug,
    rules: 'Minimal sewa pemasangan media promosi outdoor yakni 1 minggu (7 hari).',
    media_channel: 'cetak',
    price_amount: 70000,
    price_unit: 'hari',
    ppn_included: false,
    ...over,
  };
}

const ITEM_SPANDUK = {
  media_type_slug: 'spanduk',
  media_target: 'Sisi Pintu Tol Bekasi Barat',
  air_start_date: '2026-10-01',
  air_end_date: '2026-10-07',
  installation_date: '2026-10-01',
};

const BASE = {
  applicant_type: 'tenant',
  tenant_name: 'Optik Melawai',
  unit_number: 'L1-05',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  submission_date: '2026-09-20',
  notes: '',
  device_fingerprint: 'fp-batch-1',
  items: [ITEM_SPANDUK],
};

/** Mock DB default: media cetak + batch + insert submission. */
function mockSukses(media = [mediaCetak('spanduk')]) {
  mockedQuery.mockImplementation((sql, params) => {
    const text = String(sql);
    if (text.includes('FROM promo_media_types')) {
      // Tiru filter SQL: hanya slug terpilih DAN berkanal 'cetak'.
      const slugs = params?.[0] || [];
      return Promise.resolve({
        rows: media.filter((m) => slugs.includes(m.slug) && m.media_channel === 'cetak'),
      });
    }
    if (text.includes('COUNT(DISTINCT')) return Promise.resolve({ rows: [{ n: 0 }] });
    if (text.includes('INSERT INTO promo_submission_batches')) {
      return Promise.resolve({ rows: [{ id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1', created_at: '2026-09-20T00:00:00Z' }] });
    }
    if (text.includes('INSERT INTO promo_submissions')) {
      // Jumlah tuple = jumlah media yang lolos filter kanal.
      const cetak = media.filter((m) => m.media_channel === 'cetak');
      return Promise.resolve({
        rows: cetak.map((m, i) => ({
          id: `sub-${i + 1}`, submission_number: `MP-260920-AAA23${i}`,
          status_token: `tok-${i}`, media_type_slug: m.slug,
          status: 'menunggu_review', created_at: '2026-09-20T00:00:00Z',
        })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockSukses();
});

describe('POST /promo/submit-batch — validasi', () => {
  it('field wajib hilang → 400 + daftar errors', async () => {
    const res = await call('/submit-batch', 'post', { body: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Jenis pemohon wajib dipilih: tenant atau non-tenant');
    expect(res.body.errors).toContain('Nama pemohon wajib diisi');
    expect(res.body.errors).toContain('Pilih minimal satu media promosi');
    expect(res.body.errors).toContain('Fingerprint perangkat wajib diisi');
  });

  it('non-tenant tanpa nama → pesan menyebut "Nama non tenant"', async () => {
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, applicant_type: 'non_tenant', tenant_name: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Nama non tenant wajib diisi');
  });

  it('periode kurang dari 7 hari → 400 dan tidak menulis apa pun', async () => {
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, items: [{ ...ITEM_SPANDUK, air_end_date: '2026-10-03' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors.some((e) => /Minimal sewa.*7 hari/.test(e))).toBe(true);
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_submission_batches'))).toBe(true);
  });

  it('media digital (bukan kanal cetak) → 400', async () => {
    // Media ada & aktif, tetapi berkanal 'digital' → filter SQL tidak
    // mengembalikannya, sehingga server menolaknya sebagai bukan media cetak.
    mockSukses([mediaCetak('videotron', { media_channel: 'digital' })]);
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, items: [{ ...ITEM_SPANDUK, media_type_slug: 'videotron' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cetak tidak dikenal atau tidak aktif/);
  });

  it('lebih dari 10 media → 400', async () => {
    const items = Array.from({ length: 11 }, () => ITEM_SPANDUK);
    const res = await call('/submit-batch', 'post', { body: { ...BASE, items } });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Maksimal 10 media dalam satu pengajuan');
  });
});

describe('POST /promo/submit-batch — fan-out & harga', () => {
  it('satu kirim 2 media → 2 baris submission ber-batch_id sama', async () => {
    mockSukses([mediaCetak('spanduk'), mediaCetak('umbul-umbul', { price_amount: 288000, price_unit: 'hari/16 tiang' })]);
    const res = await call('/submit-batch', 'post', {
      body: {
        ...BASE,
        items: [ITEM_SPANDUK, { ...ITEM_SPANDUK, media_type_slug: 'umbul-umbul' }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.batch_number).toBe('MPB-260920-ABC234');
    expect(res.body.batch_token).toBe('btok-1');

    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insert).toBeDefined();
    // Dua tuple VALUES (dua baris) dalam satu statement.
    expect(String(insert[0]).match(/\(/g).length).toBeGreaterThanOrEqual(2);
    // source_type 'none' dikirim sebagai parameter.
    expect(insert[1]).toContain('none');
  });

  it('PPN 11% dihitung server: spanduk 7 hari → 490.000 / 53.900 / 543.900', async () => {
    const res = await call('/submit-batch', 'post', { body: BASE });
    expect(res.statusCode).toBe(201);
    expect(res.body.items[0]).toMatchObject({
      subtotal: 490000, ppn_amount: 53900, total_amount: 543900,
    });

    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insert[1]).toContain(490000);
    expect(insert[1]).toContain(53900);
    expect(insert[1]).toContain(543900);
    expect(insert[1]).toContain(7);       // duration_days
    expect(insert[1]).toContain(0.11);    // ppn_rate
  });

  it('kuota 5/24 jam dihitung per BATCH, bukan per baris', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_media_types')) return Promise.resolve({ rows: [mediaCetak('spanduk')] });
      if (text.includes('COUNT(DISTINCT')) return Promise.resolve({ rows: [{ n: 5 }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/submit-batch', 'post', { body: BASE });
    expect(res.statusCode).toBe(429);
    // SQL memakai COUNT(DISTINCT …) — fan-out tidak menghabiskan kuota sekali kirim.
    const countSql = mockedQuery.mock.calls.map((c) => String(c[0])).find((s) => s.includes('COUNT(DISTINCT'));
    expect(countSql).toContain('batch_id');
  });

  it('rate limit memakai bucket yang sama dengan /submit', async () => {
    await call('/submit-batch', 'post', { body: BASE });
    const call0 = mockedRateLimit.mock.calls[0];
    expect(call0[2]).toBe('promo-submit');
  });
});

describe('GET /promo/batches/status/:token', () => {
  it('tidak ditemukan → 404 pesan seragam', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const res = await call('/batches/status/:token', 'get', { params: { token: 'x' } });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/tidak ditemukan/i);
  });

  it('token kosong → 400', async () => {
    const res = await call('/batches/status/:token', 'get', { params: { token: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('SQL publik tidak menyentuh fingerprint/IP', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_submission_batches')) {
        return Promise.resolve({ rows: [{ id: 'batch-1', batch_number: 'MPB-260920-ABC234', applicant_type: 'tenant', applicant_name: 'X', unit_number: '', submission_date: '', notes: '', created_at: 'x' }] });
      }
      if (text.includes('FROM promo_submissions WHERE batch_id')) return Promise.resolve({ rows: [{ id: 'sub-1' }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await call('/batches/status/:token', 'get', { params: { token: 'btok-1' } });
    expect(res.statusCode).toBe(200);
    const batchSql = mockedQuery.mock.calls.map((c) => String(c[0])).find((s) => s.includes('FROM promo_submission_batches'));
    expect(batchSql).not.toMatch(/device_fingerprint/);
    expect(batchSql).not.toMatch(/ip_address/);
    const subSql = mockedQuery.mock.calls.map((c) => String(c[0])).find((s) => s.includes('FROM promo_submissions WHERE batch_id'));
    expect(subSql).not.toMatch(/device_fingerprint/);
    expect(subSql).not.toMatch(/ip_address/);
  });
});

describe('GET /promo/batches/track', () => {
  it('format nomor salah → 400 sebelum captcha', async () => {
    const res = await call('/batches/track', 'get', { query: { number: 'MP-260920-ABC234' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Format nomor batch/);
  });

  it('nomor kosong → 400', async () => {
    const res = await call('/batches/track', 'get', { query: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/wajib diisi/);
  });
});
