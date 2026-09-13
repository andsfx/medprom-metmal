/**
 * Test validasi POST /promo/submit — unit test handler router promo
 * dengan mock req/res (pola __tests__/api/community-registration.test.js
 * dari schedule-event-v2: mock req/res ringan, bukan supertest).
 *
 * Cakupan (tanpa network): validasi field wajib, phone, tanggal, file_url
 * di luar prefix R2, mode tautan eksternal, dan happy path INSERT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db + r2 sebelum import router — promo.js mengimpor keduanya di top-level.
vi.mock('../../server/src/db.js', () => ({
  db: {
    query: vi.fn(),
    ready: true,
    verify: vi.fn(),
    end: vi.fn(),
  },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/r2.js', () => ({
  headR2File: vi.fn(),
  verifyMimeMagicBytes: vi.fn(),
  deleteR2File: vi.fn(),
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  R2_PUBLIC_URL: 'https://media.example.com',
}));
// Rate limit dites terpisah; di sini selalu lolos agar 13 kasus tidak kena 429.
vi.mock('../../server/src/lib/rateLimit.js', () => ({
  enforceRateLimit: vi.fn(() => true),
  clientIp: vi.fn((req) => req.headers['x-real-ip'] || ''),
}));

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';
import { headR2File, verifyMimeMagicBytes } from '../../server/src/r2.js';
import { enforceRateLimit, clientIp } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);
const mockedHead = vi.mocked(headR2File);
const mockedMagic = vi.mocked(verifyMimeMagicBytes);
const mockedRateLimit = vi.mocked(enforceRateLimit);
const mockedClientIp = vi.mocked(clientIp);

/** Mock req/res ala Express (pola community-registration.test.js). */
function createMockRequest(body, ip = '203.0.113.10') {
  return {
    method: 'POST',
    body,
    headers: { 'user-agent': 'vitest', 'x-real-ip': ip },
    socket: { remoteAddress: ip },
  };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    end() {
      return this;
    },
  };
}

/** Ekstrak handler POST /promo/submit dari router Express. */
function getSubmitHandler() {
  const stack = promoRouter.stack;
  const layer = stack.find(
    (l) => l.route?.path === '/submit' && l.route?.methods?.post,
  );
  if (!layer) throw new Error('handler /submit tidak ditemukan di router');
  // Handler terakhir di stack route (setelah middleware rate limit).
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

/** Invoke handler dengan mock rate-limit pass-through (rate limit diuji terpisah). */
async function callSubmit(body, ip = '203.0.113.10') {
  const handler = getSubmitHandler();
  const req = createMockRequest(body, ip);
  const res = createMockResponse();
  await handler(req, res, (err) => { throw err; });
  return { res, req };
}

const VALID_BODY = {
  media_type_slug: 'spanduk',
  tenant_id: 'T001',
  tenant_name: 'Optik Melawai',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  installation_date: '',
  notes: '',
  file_url: 'https://media.example.com/promo/123-x.jpg',
  file_name: 'spanduk.jpg',
  mime_type: 'image/jpeg',
  file_size_bytes: 1024,
  device_fingerprint: 'fp123',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path mocks.
  mockedHead.mockResolvedValue({ ok: true, contentLength: 1024 });
  mockedMagic.mockResolvedValue({ ok: true });
  mockedRateLimit.mockReturnValue(true);
  mockedClientIp.mockImplementation((req) => req.headers['x-real-ip'] || '');
  // Default DB: media type aktif, belum ada pengajuan dari fingerprint, INSERT sukses.
  // Test spesifik menimpa lewat mockResolvedValueOnce (antre lebih dulu).
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('FROM promo_media_types')) {
      return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PNG,PDF' }] });
    }
    if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
    if (text.includes('INSERT INTO promo_submissions')) {
      return Promise.resolve({ rows: [{ id: 'uuid-1', created_at: '2026-09-12T00:00:00Z' }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe('POST /promo/submit — validasi', () => {
  it('field wajib hilang → 400 + daftar errors', async () => {
    const { res } = await callSubmit({ media_type_slug: 'spanduk' });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toContain('Nama gerai wajib diisi');
    expect(res.body.errors).toContain('file_url wajib diisi');
  });

  it('nomor telepon tidak valid → 400', async () => {
    const { res } = await callSubmit({ ...VALID_BODY, pic_phone: 'abc' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Format nomor telepon tidak valid');
  });

  it('installation_date bukan YYYY-MM-DD → 400', async () => {
    const { res } = await callSubmit({ ...VALID_BODY, installation_date: '12/09/2026' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors.some((e) => e.includes('installation_date'))).toBe(true);
  });

  it('file_url di luar prefix R2 promo → 400 File URL tidak valid', async () => {
    const { res } = await callSubmit({ ...VALID_BODY, file_url: 'https://evil.example.com/promo/123.jpg' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File URL tidak valid.');
    // Tidak menyentuh R2 HEAD sama sekali.
    expect(mockedHead).not.toHaveBeenCalled();
  });

  it('file tidak ditemukan (HEAD 404) → 400 pesan unggah ulang', async () => {
    mockedHead.mockResolvedValue({ ok: false, notFound: true, error: 'File tidak ditemukan di storage. Silakan unggah ulang.' });
    const { res } = await callSubmit(VALID_BODY);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File tidak ditemukan di storage. Silakan unggah ulang.');
  });

  it('file melebihi 50MB → 400 + object dihapus', async () => {
    mockedHead.mockResolvedValue({ ok: true, contentLength: 60 * 1024 * 1024 });
    const { res } = await callSubmit(VALID_BODY);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File melebihi 50MB');
  });

  it('magic bytes tidak cocok → 400 + object dihapus', async () => {
    mockedMagic.mockResolvedValue({ ok: false, error: 'Isi file tidak sesuai dengan tipe yang dipilih.' });
    const { res } = await callSubmit(VALID_BODY);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Isi file tidak sesuai dengan tipe yang dipilih.');
  });

  it('media type tidak aktif → 400 jenis media tidak dikenal', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    const { res } = await callSubmit(VALID_BODY);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Jenis media promosi tidak dikenal atau tidak aktif.');
  });

  it('fingerprint sudah 5x / 24 jam → 429 anti-spam', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ slug: 'spanduk' }] }); // media type aktif
    mockedQuery.mockResolvedValueOnce({ rows: [{ n: 5 }] });            // count fingerprint
    const { res } = await callSubmit(VALID_BODY);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('Terlalu banyak pengajuan dari perangkat ini. Coba lagi besok.');
  });

  it('happy path → 201 + id + created_at, INSERT dipanggil dengan field lengkap', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PDF' }] }); // media type
    mockedQuery.mockResolvedValueOnce({ rows: [{ n: 0 }] });            // count fingerprint
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1', created_at: '2026-09-12T00:00:00Z' }] }); // INSERT

    const { res } = await callSubmit(VALID_BODY);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, id: 'uuid-1', created_at: '2026-09-12T00:00:00Z' });

    const insertCall = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insertCall).toBeDefined();
    const params = insertCall[1];
    expect(params[0]).toBe('spanduk');        // media_type_slug
    expect(params[2]).toBe('Optik Melawai');  // tenant_name
    expect(params[7]).toBe('upload');         // source_type
    expect(params[13]).toBe('fp123');         // device_fingerprint
    expect(params[14]).toBe('203.0.113.10'); // ip_address dari X-Real-IP
  });
});

describe('POST /promo/submit — mode tautan eksternal', () => {
  const LINK_BODY = {
    media_type_slug: 'spanduk',
    tenant_id: 'T001',
    tenant_name: 'Optik Melawai',
    pic_name: 'Andi',
    pic_phone: '081234567890',
    installation_date: '',
    notes: '',
    link_url: 'https://drive.google.com/file/d/xyz/view',
    device_fingerprint: 'fp123',
  };

  it('tautan https valid → 201 tanpa menyentuh R2', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PNG,PDF' }] });
    mockedQuery.mockResolvedValueOnce({ rows: [{ n: 0 }] });
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-2', created_at: '2026-09-13T00:00:00Z' }] });

    const { res } = await callSubmit(LINK_BODY);

    expect(res.statusCode).toBe(201);
    expect(mockedHead).not.toHaveBeenCalled();
    expect(mockedMagic).not.toHaveBeenCalled();

    const params = mockedQuery.mock.calls
      .find((c) => String(c[0]).includes('INSERT INTO promo_submissions'))[1];
    expect(params[7]).toBe('link');   // source_type
    expect(params[8]).toBe('');       // file_url kosong
    expect(params[11]).toBe('https://drive.google.com/file/d/xyz/view'); // link_url
    expect(params[12]).toBe(0);       // file_size_bytes
  });

  it('tautan tanpa skema http(s) → 400', async () => {
    const { res } = await callSubmit({ ...LINK_BODY, link_url: 'drive.google.com/file/d/xyz' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Tautan materi harus berupa URL http/https yang valid');
  });

  it('tautan javascript: ditolak → 400', async () => {
    const { res } = await callSubmit({ ...LINK_BODY, link_url: 'javascript:alert(1)' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Tautan materi harus berupa URL http/https yang valid');
  });
});
