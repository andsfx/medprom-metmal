/**
 * Kontrak POST /admin/media-types/:id — pembeda "tidak dikirim" vs "dikirim kosong".
 *
 * Latar: handler lama melewati setiap nilai kosong (`if (!value) continue`),
 * sehingga mengosongkan field teks — terutama `rules` (Ketentuan yang tampil
 * sebagai deskripsi media di katalog) — tidak pernah tersimpan. Nilai lama
 * diam-diam bertahan dan pengguna mengira perubahannya sudah masuk.
 *
 * Yang dikunci di sini:
 *  - `rules: ''` benar-benar ditulis sebagai '' (bukan dipertahankan);
 *  - kunci yang TIDAK ada di body tidak ikut di-SET;
 *  - `name: ''` ditolak 400 (kolom wajib);
 *  - `slug`/`category` kosong tidak dikosongkan (NOT NULL/CHECK tetap aman);
 *  - `image_path` tidak lagi dapat ditimpa lewat endpoint ini.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/src/db.js', () => ({
  db: { query: vi.fn(), ready: true, verify: vi.fn(), end: vi.fn() },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/drive.js', () => ({
  deleteDriveFileOrThrow: vi.fn(),
  getDriveFile: vi.fn(),
  readMultipartFile: vi.fn(),
}));
vi.mock('../../server/src/media.js', () => ({
  ALLOWED_IMAGE_MIME: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_IMAGE_BYTES: 4 * 1024 * 1024,
  checkImageMagic: vi.fn(() => ({ ok: true })),
  mediaFileName: vi.fn(() => 'x.jpg'),
  simpanGambar: vi.fn(),
  hapusGambar: vi.fn(),
  namaBerkasUnggahan: vi.fn(() => null),
  urlGambar: vi.fn((n) => `/api/v1/media/${n}`),
}));
vi.mock('../../server/src/auth.js', () => ({
  requireRole: () => (req, _res, next) => { req.auth = { user: { id: 'u1', display_name: 'Admin' } }; next(); },
  logActivity: vi.fn(),
  READ_ROLES: ['superadmin', 'admin', 'tenant_relation'],
  STAFF_ROLES: ['superadmin', 'admin'],
}));

import adminRouter from '../../server/src/routes/admin.js';
import { db } from '../../server/src/db.js';

const mockedQuery = vi.mocked(db.query);

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
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

async function callUpdate(body) {
  const handler = getHandler('/media-types/:id', 'post');
  const req = {
    method: 'POST', params: { id: 'mt-1' }, body, headers: {}, socket: {},
    // `requireRole` di-mock dan lapisan-nya dilewati (handler terakhir diambil
    // langsung), jadi konteks auth dipasang manual seperti yang dilakukan
    // middleware asli.
    auth: { user: { id: 'u1', display_name: 'Admin' } },
  };
  const res = createMockResponse();
  await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
  return res;
}

/** Ambil panggilan UPDATE promo_media_types (SQL + parameter). */
function updateCall() {
  return mockedQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE promo_media_types'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('SELECT id, slug FROM promo_media_types')) {
      return Promise.resolve({ rows: [{ id: 'mt-1', slug: 'spanduk' }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe('POST /admin/media-types/:id — kosong vs tidak dikirim', () => {
  it('rules: "" benar-benar ditulis kosong, bukan dipertahankan', async () => {
    const res = await callUpdate({ rules: '' });
    expect(res.statusCode).toBe(200);
    const call = updateCall();
    expect(call).toBeDefined();
    expect(String(call[0])).toContain('rules = $1');
    expect(call[1][0]).toBe('');
  });

  it('kunci yang tidak dikirim tidak ikut di-SET', async () => {
    await callUpdate({ rules: 'Aturan baru.' });
    const call = updateCall();
    expect(String(call[0])).toContain('rules = $1');
    // `price_note`/`location_note` absen dari body → tidak boleh muncul.
    expect(String(call[0])).not.toContain('price_note');
    expect(String(call[0])).not.toContain('location_note');
  });

  it('beberapa field kosong sekaligus tetap ditulis', async () => {
    await callUpdate({ price_note: '', location_note: '', size_spec: '' });
    const call = updateCall();
    const sql = String(call[0]);
    for (const kolom of ['price_note', 'location_note', 'size_spec']) {
      expect(sql, `${kolom} harus ikut di-SET`).toContain(`${kolom} = `);
    }
    expect(call[1].slice(0, 3)).toEqual(['', '', '']);
  });

  it('name: "" ditolak 400 — kolom wajib', async () => {
    const res = await callUpdate({ name: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Nama wajib diisi');
    expect(updateCall()).toBeUndefined();
  });

  it('slug/category kosong tidak mengosongkan kolom', async () => {
    await callUpdate({ slug: '', category: '', rules: 'x' });
    const sql = String(updateCall()[0]);
    expect(sql).not.toContain('slug = ');
    expect(sql).not.toContain('category = ');
  });

  it('image_path tidak dapat ditimpa lewat endpoint ini', async () => {
    // Hanya `image_path` yang dikirim → tidak ada perubahan yang sah (dan foto
    // yang baru diunggah tidak tertimpa nilai state lama).
    const res = await callUpdate({ image_path: '/media/apa-saja.webp' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Tidak ada perubahan');
    expect(updateCall()).toBeUndefined();
  });
});

describe('POST /admin/media-types — kanal katalog', () => {
  async function callCreate(body) {
    const handler = getHandler('/media-types', 'post');
    const req = {
      method: 'POST', body, params: {}, headers: {}, socket: {},
      auth: { user: { id: 'u1', display_name: 'Admin' } },
    };
    const res = createMockResponse();
    await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
    return res;
  }

  it('create menyimpan media_channel', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM promo_media_types WHERE slug')) return Promise.resolve({ rows: [] });
      if (text.includes('INSERT INTO promo_media_types')) return Promise.resolve({ rows: [{ id: 'mt-new' }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await callCreate({ slug: 'banner-baru', name: 'Banner Baru', category: 'outdoor', media_channel: 'cetak' });
    expect(res.statusCode).toBe(200);
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_media_types'));
    expect(String(insert[0])).toContain('media_channel');
    expect(insert[1]).toContain('cetak');
  });

  it('create tanpa media_channel → default digital', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM promo_media_types WHERE slug')) return Promise.resolve({ rows: [] });
      if (text.includes('INSERT INTO promo_media_types')) return Promise.resolve({ rows: [{ id: 'mt-new' }] });
      return Promise.resolve({ rows: [] });
    });
    await callCreate({ slug: 'x', name: 'X', category: 'indoor' });
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_media_types'));
    expect(insert[1]).toContain('digital');
  });

  it('create dengan kanal tak dikenal → 400 tanpa INSERT', async () => {
    const res = await callCreate({ slug: 'x', name: 'X', category: 'indoor', media_channel: 'aneh' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Kanal media harus cetak atau digital');
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_media_types'))).toBe(true);
  });

  it('update mengubah media_channel', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, slug FROM promo_media_types')) {
        return Promise.resolve({ rows: [{ id: 'mt-1', slug: 'spanduk' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await callUpdate({ media_channel: 'digital' });
    expect(res.statusCode).toBe(200);
    const call = updateCall();
    expect(String(call[0])).toContain('media_channel = $1');
    expect(call[1][0]).toBe('digital');
  });

  it('update dengan kanal tak dikenal → 400 tanpa UPDATE', async () => {
    const res = await callUpdate({ media_channel: 'aneh' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Kanal media harus cetak atau digital');
    expect(updateCall()).toBeUndefined();
  });
});

describe('POST /admin/media-types — harga numerik & PPN', () => {
  async function callCreate(body) {
    const handler = getHandler('/media-types', 'post');
    const req = {
      method: 'POST', body, params: {}, headers: {}, socket: {},
      auth: { user: { id: 'u1', display_name: 'Admin' } },
    };
    const res = createMockResponse();
    await handler(req, res, (err) => { if (err) { res.statusCode = 500; res.body = { error: err.message }; } });
    return res;
  }

  function mockCreate() {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM promo_media_types WHERE slug')) return Promise.resolve({ rows: [] });
      if (text.includes('INSERT INTO promo_media_types')) return Promise.resolve({ rows: [{ id: 'mt-new' }] });
      return Promise.resolve({ rows: [] });
    });
  }

  it('create menyimpan price_amount, price_unit, dan ppn_included', async () => {
    mockCreate();
    const res = await callCreate({
      slug: 'spanduk', name: 'Spanduk', category: 'outdoor',
      price_amount: '70000', price_unit: 'hari', ppn_included: true,
    });
    expect(res.statusCode).toBe(200);
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_media_types'));
    expect(String(insert[0])).toContain('price_amount');
    expect(String(insert[0])).toContain('ppn_included');
    expect(insert[1]).toContain(70000);
    expect(insert[1]).toContain('hari');
    expect(insert[1]).toContain(true);
  });

  it('create tanpa harga → 0 / false (media gratis), bukan NaN', async () => {
    mockCreate();
    await callCreate({ slug: 'x', name: 'X', category: 'indoor' });
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_media_types'));
    expect(insert[1]).toContain(0);
    expect(insert[1]).toContain(false);
    expect(insert[1].some((v) => typeof v === 'number' && Number.isNaN(v))).toBe(false);
  });

  it('create harga tidak sah (teks/negatif) → 0, bukan galat', async () => {
    for (const nilai of ['abc', '-500', '', null]) {
      mockedQuery.mockClear();
      mockCreate();
      const res = await callCreate({ slug: 'x', name: 'X', category: 'indoor', price_amount: nilai });
      expect(res.statusCode, `price_amount=${nilai}`).toBe(200);
      const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_media_types'));
      expect(insert[1]).toContain(0);
    }
  });

  it('create membulatkan harga ke 2 desimal', async () => {
    mockCreate();
    await callCreate({ slug: 'x', name: 'X', category: 'indoor', price_amount: '12345.6789' });
    const insert = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_media_types'));
    expect(insert[1]).toContain(12345.68);
  });

  it('update menulis harga hanya bila dikirim', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, slug FROM promo_media_types')) {
        return Promise.resolve({ rows: [{ id: 'mt-1', slug: 'spanduk' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await callUpdate({ price_amount: 288000, price_unit: 'hari/16 tiang', ppn_included: false });
    expect(res.statusCode).toBe(200);
    const sql = String(updateCall()[0]);
    expect(sql).toContain('price_amount = ');
    expect(sql).toContain('price_unit = ');
    expect(sql).toContain('ppn_included = ');
  });

  it('update price_amount 0 sah — media gratis, bukan "tidak dikirim"', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, slug FROM promo_media_types')) {
        return Promise.resolve({ rows: [{ id: 'mt-1', slug: 'spanduk' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await callUpdate({ price_amount: 0 });
    expect(res.statusCode).toBe(200);
    const call = updateCall();
    expect(String(call[0])).toContain('price_amount = $1');
    expect(call[1][0]).toBe(0);
  });

  it('update tanpa field harga tidak menyentuh kolomnya', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('SELECT id, slug FROM promo_media_types')) {
        return Promise.resolve({ rows: [{ id: 'mt-1', slug: 'spanduk' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    await callUpdate({ rules: 'Aturan baru.' });
    const sql = String(updateCall()[0]);
    expect(sql).not.toContain('price_amount');
    expect(sql).not.toContain('price_unit');
    expect(sql).not.toContain('ppn_included');
  });
});
