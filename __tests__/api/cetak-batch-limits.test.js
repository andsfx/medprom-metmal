/**
 * Cermin batas jumlah media batch FE ≡ server (`MAX_BATCH_ITEMS`).
 *
 * `AGENTS.md` mencantumkan cermin FE↔BE yang wajib diubah berpasangan, tetapi
 * batas `MAX_BATCH_ITEMS` belum dikunci test mana pun: `src/constants/promo.ts`
 * (dipakai `PromoCetakWizard` untuk menonaktifkan checkbox/tombol "Tambah
 * lokasi lain") dan `server/src/routes/promo.js` (dipakai `POST /promo/submit-
 * batch`) bisa menyimpang tanpa ada yang gagal. Akibatnya klien mengizinkan
 * jumlah media berbeda dari yang diterima server, dan pengguna menerima `400`
 * baru di akhir form setelah mengisi semuanya.
 *
 * Karena `server/src/routes/promo.js` TIDAK mengekspor `MAX_BATCH_ITEMS`, dua
 * bukti dipakai bersama - masing-masing menangkap mode kegagalan berbeda:
 *  1. baca sumber server dengan `readFileSync` lalu ekstrak nilai deklarasi
 *     `const MAX_BATCH_ITEMS = <angka>` -> menangkap drift NILAI konstanta
 *     walau handler tidak pernah dieksekusi;
 *  2. uji perilaku lewat handler SUNGGUHAN (`router.stack`) -> menangkap
 *     konstanta yang benar tetapi penegakan di handler yang salah (mis.
 *     operator pembanding tertukar).
 *
 * Penegakan sisi server (11 media -> 400) sudah ada dan dikunci
 * `__tests__/api/promo-batch.test.js`; di sini sisi "tepat N diterima"
 * ditambahkan sebagai pasangan batas yang belum pernah diuji, sekaligus
 * mengikat kedua sisi ke konstanta FE.
 *
 * Pola mock (`db`, `drive`, `rateLimit`, `turnstile`) dan helper
 * `getHandler`/`call`/`mockSukses` meniru `__tests__/api/promo-batch.test.js`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
import { MAX_BATCH_ITEMS } from '../../src/constants/promo';

const mockedQuery = vi.mocked(db.query);
const mockedRateLimit = vi.mocked(enforceRateLimit);

const SUMBER_SERVER = readFileSync(
  resolve(process.cwd(), 'server/src/routes/promo.js'),
  'utf8',
);

/** Nilai `MAX_BATCH_ITEMS` yang dideklarasikan di sumber server (bukan ekspor). */
function nilaiServerMaxBatchItems() {
  const m = /const\s+MAX_BATCH_ITEMS\s*=\s*(\d+)\s*;/.exec(SUMBER_SERVER);
  if (!m) throw new Error('deklarasi const MAX_BATCH_ITEMS tidak ditemukan di server/src/routes/promo.js');
  return Number(m[1]);
}

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

/** Media cetak mock (rules tanpa lead time -> tidak menghalangi). */
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
  device_fingerprint: 'fp-batas-1',
  items: [ITEM_SPANDUK],
};

/** Buat `n` item media cetak (semua slug 'spanduk'). */
function itemSebanyak(n) {
  return Array.from({ length: n }, () => ({ ...ITEM_SPANDUK }));
}

/**
 * Mock DB sukses untuk `n` item: katalog cetak + batch + `n` baris submission.
 * `jumlahItem` menentukan jumlah baris yang dikembalikan INSERT submissions.
 */
function mockSukses(jumlahItem, media = [mediaCetak('spanduk')]) {
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('FROM promo_media_types')) {
      return Promise.resolve({ rows: media.filter((m) => m.media_channel === 'cetak') });
    }
    if (text.includes('COUNT(DISTINCT')) return Promise.resolve({ rows: [{ n: 0 }] });
    if (text.includes('INSERT INTO promo_submission_batches')) {
      return Promise.resolve({
        rows: [{ id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1', created_at: '2026-09-20T00:00:00Z' }],
      });
    }
    if (text.includes('INSERT INTO promo_submissions')) {
      return Promise.resolve({
        rows: Array.from({ length: jumlahItem }, (_, i) => ({
          id: `sub-${i + 1}`,
          submission_number: `MP-260920-AAA23${i}`,
          status_token: `tok-${i}`,
          media_type_slug: 'spanduk',
          status: 'menunggu_review',
          created_at: '2026-09-20T00:00:00Z',
        })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockReturnValue(true);
  mockSukses(MAX_BATCH_ITEMS);
});

describe('cermin konstanta MAX_BATCH_ITEMS FE ≡ server', () => {
  it('konstanta FE bernilai 10', () => {
    expect(MAX_BATCH_ITEMS).toBe(10);
  });

  it('deklarasi server bernilai sama dengan konstanta FE (dibaca dari sumber)', () => {
    expect(nilaiServerMaxBatchItems()).toBe(MAX_BATCH_ITEMS);
  });

  it('pesan validasi server diturunkan dari konstanta yang sama (bukan angka keras)', () => {
    // Menyimpang: bila pesan ditulis angka literal, mengubah konstanta bisa
    // membuat pesan berbohong tanpa ada test yang gagal.
    expect(SUMBER_SERVER).toMatch(/Maksimal \$\{MAX_BATCH_ITEMS\} media dalam satu pengajuan/);
  });
});

describe('POST /promo/submit-batch - batas batch ditegakkan handler sungguhan', () => {
  it('tepat MAX_BATCH_ITEMS media diterima (201)', async () => {
    mockSukses(MAX_BATCH_ITEMS);
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, items: itemSebanyak(MAX_BATCH_ITEMS) },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.items).toHaveLength(MAX_BATCH_ITEMS);
  });

  it('MAX_BATCH_ITEMS + 1 media ditolak 400 dengan pesan menyebut batas maksimal', async () => {
    // Validasi berjalan sebelum menyentuh DB, jadi kasus ini cukup tanpa mock rumit.
    const res = await call('/submit-batch', 'post', {
      body: { ...BASE, items: itemSebanyak(MAX_BATCH_ITEMS + 1) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain(`Maksimal ${MAX_BATCH_ITEMS} media dalam satu pengajuan`);
    // Tidak ada batch yang ditulis saat validasi gagal.
    expect(
      mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_submission_batches')),
    ).toBe(true);
  });
});
