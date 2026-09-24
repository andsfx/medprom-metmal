/**
 * Test penyimpanan persetujuan ketentuan pada batch cetak (cacat T5).
 *
 * Latar: handler `POST /promo/submit-batch` dahulu menuliskan nilai
 * KONSTANTA `true` ke kolom `terms_accepted` untuk setiap baris, tanpa pernah
 * membaca `body.terms_accepted`. Akibatnya kolom itu tidak membuktikan apa
 * pun. Perbaikan ini membuat server menyimpan isi body APA ADANYA.
 *
 * Kontrak yang dikunci di sini:
 *  - `terms_accepted: true`  -> tersimpan boolean `true`;
 *  - `terms_accepted: false` -> tersimpan boolean `false`;
 *  - field dihilangkan       -> tersimpan boolean `false` (bukan lagi `true`
 *    hardcoded), karena `body.terms_accepted === true` bernilai false.
 *
 * CATATAN PENTING - penegakan server DITUNDA.
 * Alur digital `POST /promo/submit` menolak 400 saat `terms_accepted` bukan
 * `true` ('Persetujuan ketentuan wajib dicentang'). Penegakan yang sama
 * SENGAJA BELUM dipasang di `/submit-batch`: fixture batch lama
 * (`__tests__/api/promo-batch.test.js`, `__tests__/api/cetak-batch-limits.test.js`)
 * tidak mengirim field itu dan masih mengharapkan 201/429. Karena itu test ini
 * menuntut 201 (bukan 400) untuk semua kasus, dan menunggu keputusan pemilik
 * sebelum penolakan 400 ditambahkan.
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

/** Item cetak valid: kanal `cetak`, periode tepat 7 hari. */
const ITEM_SPANDUK = {
  media_type_slug: 'spanduk',
  media_target: 'Sisi Pintu Tol Bekasi Barat',
  air_start_date: '2026-10-01',
  air_end_date: '2026-10-07',
  installation_date: '2026-10-01',
};

/** Payload batch cetak valid (tanpa `terms_accepted`; ditambahkan per test). */
const BASE = {
  applicant_type: 'tenant',
  tenant_name: 'Optik Melawai',
  unit_number: 'L1-05',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  submission_date: '2026-09-20',
  notes: '',
  device_fingerprint: 'fp-batch-terms-1',
  items: [ITEM_SPANDUK],
};

/** Mock DB default: media cetak + batch + insert submission. */
function mockSukses(media = [mediaCetak('spanduk')]) {
  mockedQuery.mockImplementation((sql, params) => {
    const text = String(sql);
    if (text.includes('FROM promo_media_types')) {
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

/**
 * Indeks parameter kolom `terms_accepted` pada INSERT promo_submissions.
 * Turunan dari urutan `kolom` di handler: submission_number, status_token,
 * media_type_slug, tenant_id, tenant_name, unit_number, pic_name, pic_phone,
 * media_target, air_start_date, air_end_date, installation_date,
 * terms_accepted (indeks 12).
 */
const IDX_TERMS = 12;

/** Ambil argumen VALUES dari INSERT promo_submissions. */
function insertValues() {
  const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
  expect(insert).toBeDefined();
  return insert[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockSukses();
});

describe('POST /promo/submit-batch - persetujuan ketentuan tersimpan apa adanya', () => {
  it('terms_accepted: true -> 201 dan kolom tersimpan boolean true', async () => {
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, terms_accepted: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    const values = insertValues();
    expect(typeof values[IDX_TERMS]).toBe('boolean');
    expect(values[IDX_TERMS]).toBe(true);

    // Batch benar-benar tertulis (fan-out berjalan).
    expect(
      mockedQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO promo_submission_batches')),
    ).toBe(true);
  });

  it('terms_accepted: false -> 201 dan kolom tersimpan boolean false', async () => {
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, terms_accepted: false },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    const values = insertValues();
    expect(typeof values[IDX_TERMS]).toBe('boolean');
    expect(values[IDX_TERMS]).toBe(false);
  });

  it('field dihilangkan -> 201 dan kolom tersimpan boolean false (bukan true hardcoded)', async () => {
    // Regresi cacat T5: dahulu nilai selalu `true` meski klien tidak mengirim
    // apa pun. Kini `body.terms_accepted === true` bernilai false.
    const res = await call('/submit-batch', 'post', { body: { ...BASE } });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    const values = insertValues();
    expect(typeof values[IDX_TERMS]).toBe('boolean');
    expect(values[IDX_TERMS]).toBe(false);
  });

  it('sumber handler tidak lagi memuat literal `true` pada kolom terms_accepted', async () => {
    // Penjaga regresi: pastikan baris array `row` memakai `termsAccepted`,
    // bukan konstanta `true`. Dibaca dari sumber handler sungguhan.
    const src = String(getHandler('/submit-batch', 'post'));
    expect(src).toContain('termsAccepted');
    expect(src).not.toMatch(/installation_date, true,/);
  });
});
