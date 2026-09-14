/**
 * Test validasi POST /promo/submit — pasca-migrasi Google Drive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db + drive sebelum import router.
vi.mock('../../server/src/db.js', () => ({
  db: {
    query: vi.fn(),
    ready: true,
    verify: vi.fn(),
    end: vi.fn(),
  },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/drive.js', () => ({
  getDriveFile: vi.fn(),
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  driveReady: true,
}));
vi.mock('../../server/src/lib/rateLimit.js', () => ({
  enforceRateLimit: vi.fn(() => true),
  clientIp: vi.fn((req) => req.headers['x-real-ip'] || ''),
}));

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';
import { getDriveFile } from '../../server/src/drive.js';
import { enforceRateLimit, clientIp } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);
const mockedDrive = vi.mocked(getDriveFile);
const mockedRateLimit = vi.mocked(enforceRateLimit);
const mockedClientIp = vi.mocked(clientIp);

function createMockRequest(body = {}, ip = '203.0.113.10') {
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

function getSubmitHandler() {
  const stack = promoRouter.stack;
  const layer = stack.find(
    (l) => l.route?.path === '/submit' && l.route?.methods?.post,
  );
  if (!layer) throw new Error('handler /submit tidak ditemukan');
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

async function callSubmit(body, ip = '203.0.113.10') {
  const handler = getSubmitHandler();
  const req = createMockRequest(body, ip);
  const res = createMockResponse();
  await handler(req, res, (err) => { if (err) { console.error('SUBMIT-ERR:', err.message); res.statusCode = 500; res.body = { error: err.message }; } });
  return { res, req };
}

const VALID_UPLOAD = {
  media_type_slug: 'spanduk',
  tenant_id: 'T001',
  tenant_name: 'Optik Melawai',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  installation_date: '',
  notes: '',
  drive_file_id: 'file-1',
  file_name: 'spanduk.jpg',
  mime_type: 'image/jpeg',
  file_size_bytes: 1024,
  device_fingerprint: 'fp123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedDrive.mockResolvedValue({
    ok: true,
    id: 'file-1',
    name: 'spanduk-srv.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    webViewLink: 'https://drive.google.com/file/d/file-1/view',
  });
  mockedRateLimit.mockReturnValue(true);
  mockedClientIp.mockImplementation((req) => req.headers['x-real-ip'] || '');
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('FROM promo_media_types')) {
      return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PNG,PDF' }] });
    }
    // INSERT dicek dulu: SQL-nya juga memuat `drive_file_id` (kolom).
    if (text.includes('INSERT INTO promo_submissions')) {
      return Promise.resolve({ rows: [{ id: 'uuid-1', created_at: '2026-09-13T00:00:00Z' }] });
    }
    // `drive_file_id` duplicate check (mocked before INSERT every time)
    if (text.includes('drive_file_id')) return Promise.resolve({ rows: [] });
    if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
    return Promise.resolve({ rows: [] });
  });
});

describe('POST /promo/submit — validasi', () => {
  it('field wajib hilang → 400 + daftar errors', async () => {
    const { res } = await callSubmit({ media_type_slug: 'spanduk' });
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toContain('Nama gerai wajib diisi');
    expect(res.body.errors).toContain('drive_file_id wajib diisi');
  });

  it('nomor telepon tidak valid → 400', async () => {
    const { res } = await callSubmit({ ...VALID_UPLOAD, pic_phone: 'abc' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Format nomor telepon tidak valid');
  });

  it('installation_date bukan YYYY-MM-DD → 400', async () => {
    const { res } = await callSubmit({ ...VALID_UPLOAD, installation_date: '12/09/2026' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors.some((e) => String(e).includes('installation_date'))).toBe(true);
  });

  it('drive_file_id tidak ditemukan → 400', async () => {
    mockedDrive.mockResolvedValue({ ok: false, notFound: true, error: 'File tidak ditemukan di storage.' });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File tidak ditemukan di storage.');
  });

  it('file melebihi 50MB → 400', async () => {
    mockedDrive.mockResolvedValue({ ok: true, id: 'file-1', name: 'x.jpg', mimeType: 'image/jpeg', size: 60 * 1024 * 1024, webViewLink: 'https://drive.google.com/file/d/file-1/view' });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File melebihi 50MB');
  });

  it('drive_file_id sudah dipakai pengajuan lain → 400', async () => {
    mockedQuery.mockImplementationOnce((sql) => {
      if (String(sql).includes('FROM promo_media_types')) return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PNG,PDF' }] });
      return Promise.resolve({ rows: [] });
    });
    mockedQuery.mockImplementationOnce((sql) => {
      // duplicate guard: return 1 row (id already used)
      if (String(sql).includes('drive_file_id')) return Promise.resolve({ rows: [{ id: 'older-uuid' }] });
      return Promise.resolve({ rows: [] });
    });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File sudah dipakai pengajuan lain.');
    // Tidak sampai INSERT.
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_submissions'))).toBe(true);
  });

  it('media type tidak aktif → 400', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Jenis media promosi tidak dikenal atau tidak aktif.');
  });

  it('fingerprint sudah 5x / 24 jam → 429', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ slug: 'spanduk' }] });
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    mockedQuery.mockResolvedValueOnce({ rows: [{ n: 5 }] });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect([400,429]).toContain(res.statusCode);
    expect(res.body.error).toBe('Terlalu banyak pengajuan dari perangkat ini. Coba lagi besok.');
  });

  it('happy path upload Drive → 201 + INSERT params benar', async () => {
    // Media + dup-check + fingerprint count + INSERT all from default mock
    const { res } = await callSubmit(VALID_UPLOAD);
    expect([200,201]).toContain(res.statusCode);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe('uuid-1');

    const insertCall = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insertCall).toBeDefined();
    const params = insertCall[1];
    expect(params[0]).toBe('spanduk');
    expect(params[7]).toBe('upload');          // source_type
    expect(params[8]).toBe('https://drive.google.com/file/d/file-1/view'); // file_url = webViewLink
    expect(params[9]).toBe('spanduk-srv.jpg'); // file_name dari metadata Drive
    expect(params[13]).toBe('file-1');        // drive_file_id ($14)
    expect(params[14]).toBe('fp123');          // fingerprint ($15)
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

  it('tautan https valid → 201 tanpa menyentuh Drive', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PDF' }] });
    mockedQuery.mockResolvedValueOnce({ rows: [{ n: 0 }] });
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-2', created_at: '2026-09-13T00:00:00Z' }] });

    const { res } = await callSubmit(LINK_BODY);
    expect([200,201]).toContain(res.statusCode);
    expect(mockedDrive).not.toHaveBeenCalled();

    const params = mockedQuery.mock.calls
      .find((c) => String(c[0]).includes('INSERT INTO promo_submissions'))[1];
    expect(params[7]).toBe('link');
    expect(params[8]).toBe('');
    expect(params[11]).toBe('https://drive.google.com/file/d/xyz/view');
    expect(params[12]).toBe(0);
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