/**
 * Test penolakan `quantity` dari klien pada batch cetak (D3).
 *
 * Kontrak rapuh yang dikunci:
 *  - wizard cetak TIDAK punya input kuantitas dan selalu menampilkan 1x, jadi
 *    `quantity` tidak boleh dikendalikan klien: nilai selain 1 ditolak 400
 *    sebelum apa pun ditulis;
 *  - nilai absen tetap diterima sebagai 1.
 *
 * Sebelum perbaikan, `quantity` diambil apa adanya dari body
 * (`Math.max(1, Math.trunc(Number(raw?.quantity) || 1))`), sehingga pemanggil
 * API langsung bisa ditagih kelipatan (mis. 3x) sementara form menampilkan 1x.
 *
 * Handler sungguhan, pola mock sama dengan `__tests__/api/promo-batch.test.js`.
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

/* Tanggal fixture relatif terhadap "hari ini" (lihat catatan di promo-batch:
 * handler menghitung lead time dari tanggal sungguhan; tanggal beku lama
 * menjadi time-bomb yang menolak pengajuan sah dengan 400). */
function isoPlusDays(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

const ITEM_SPANDUK = {
  media_type_slug: 'spanduk',
  media_target: 'Sisi Pintu Tol Bekasi Barat',
  air_start_date: isoPlusDays(1),
  air_end_date: isoPlusDays(7),
  installation_date: isoPlusDays(1),
};

/** Payload valid di bawah kontrak sekarang (termasuk persetujuan ketentuan). */
const BASE = {
  applicant_type: 'tenant',
  tenant_name: 'Optik Melawai',
  unit_number: 'L1-05',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  submission_date: isoPlusDays(-7),
  notes: '',
  terms_accepted: true,
  device_fingerprint: 'fp-batch-qty-1',
  items: [ITEM_SPANDUK],
};

function mockSukses() {
  mockedQuery.mockImplementation((sql, params) => {
    const text = String(sql);
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
        rows: [{ id: 'sub-1', submission_number: 'MP-260920-AAA230', status_token: 'tok-0', media_type_slug: 'spanduk', status: 'menunggu_review', created_at: '2026-09-20T00:00:00Z' }],
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

/** Apakah ada INSERT ke tabel yang diberikan? */
function adaInsert(tabel) {
  return mockedQuery.mock.calls.some((c) => String(c[0]).includes(`INSERT INTO ${tabel}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockSukses();
});

describe('POST /promo/submit-batch - quantity tidak dikendalikan klien', () => {
  it('quantity: 3 -> 400 dan tidak ada INSERT apa pun', async () => {
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, items: [{ ...ITEM_SPANDUK, quantity: 3 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toContain('Media ke-1: kuantitas tidak didukung dan harus 1');
    expect(adaInsert('promo_submissions')).toBe(false);
    expect(adaInsert('promo_submission_batches')).toBe(false);
  });

  it('quantity: 1 -> 201 dan tersimpan 1', async () => {
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, items: [{ ...ITEM_SPANDUK, quantity: 1 }] },
    });
    expect(res.statusCode).toBe(201);
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insert).toBeDefined();
    expect(insert[1]).toContain(1);
  });

  it('quantity absen -> 201 (dianggap 1)', async () => {
    const res = await call('/submit-batch', 'post', { body: { ...BASE } });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
