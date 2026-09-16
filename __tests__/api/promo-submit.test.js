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
  unit_number: 'L1-05',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  campaign_name: 'Promo Akhir Tahun',
  material_title: 'Spanduk Diskon 50%',
  material_description: 'Diskon akhir tahun seluruh produk.',
  material_type: 'Promosi',
  media_target: 'Sisi Pintu Tol Bekasi Barat',
  air_start_date: '2026-10-01',
  air_end_date: '2026-10-31',
  installation_date: '',
  terms_accepted: true,
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
      return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PNG,PDF', rules: '' }] });
    }
    // INSERT dicek dulu: SQL-nya juga memuat `drive_file_id` (kolom).
    if (text.includes('INSERT INTO promo_submissions')) {
      return Promise.resolve({ rows: [{ id: 'uuid-1', submission_number: 'MP-260916-ABC234', status_token: 'tok-1', created_at: '2026-09-13T00:00:00Z' }] });
    }
    // Cek duplikat drive_file_id (dijalankan sebelum INSERT).
    if (text.includes('FROM promo_submissions WHERE drive_file_id')) return Promise.resolve({ rows: [] });
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
    expect(res.body.errors).toContain('Nama campaign wajib diisi');
    expect(res.body.errors).toContain('Judul materi wajib diisi');
    expect(res.body.errors).toContain('Deskripsi materi wajib diisi');
    expect(res.body.errors).toContain('Jenis materi wajib diisi');
    expect(res.body.errors).toContain('Media atau lokasi pemasangan wajib diisi');
    expect(res.body.errors).toContain('Persetujuan ketentuan wajib dicentang');
  });

  it('persetujuan ketentuan belum dicentang → 400', async () => {
    const { res } = await callSubmit({ ...VALID_UPLOAD, terms_accepted: false });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Persetujuan ketentuan wajib dicentang');
  });

  it('periode tayang berakhir sebelum mulai → 400', async () => {
    const { res } = await callSubmit({ ...VALID_UPLOAD, air_start_date: '2026-10-31', air_end_date: '2026-10-01' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('Periode tayang berakhir sebelum tanggal mulai');
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

  it('tanpa drive_file_id dan tanpa tautan → 400', async () => {
    const { res } = await callSubmit({ ...VALID_UPLOAD, drive_file_id: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toContain('drive_file_id wajib diisi');
  });

  it('file melebihi 50MB → 400', async () => {
    mockedDrive.mockResolvedValue({ ok: true, id: 'file-1', name: 'x.jpg', mimeType: 'image/jpeg', size: 60 * 1024 * 1024, webViewLink: 'https://drive.google.com/file/d/file-1/view' });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File melebihi 50MB');
  });

  it('drive_file_id sudah dipakai pengajuan lain → 400', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_media_types')) {
        return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PNG,PDF', rules: '' }] });
      }
      // duplicate guard: return 1 row (id already used)
      if (text.includes('FROM promo_submissions WHERE drive_file_id')) {
        return Promise.resolve({ rows: [{ id: 'older-uuid' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('File sudah dipakai pengajuan lain.');
    // Tidak sampai INSERT.
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_submissions'))).toBe(true);
  });

  it('media type tidak aktif → 400', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_media_types')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Jenis media promosi tidak dikenal atau tidak aktif.');
  });

  it('fingerprint sudah 5x / 24 jam → 429', async () => {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_media_types')) return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PDF', rules: '' }] });
      if (text.includes('FROM promo_submissions WHERE drive_file_id')) return Promise.resolve({ rows: [] });
      if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 5 }] });
      return Promise.resolve({ rows: [] });
    });
    const { res } = await callSubmit(VALID_UPLOAD);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('Terlalu banyak pengajuan dari perangkat ini. Coba lagi besok.');
  });

  it('happy path upload Drive → 201 + nomor/token + INSERT params benar', async () => {
    const { res } = await callSubmit(VALID_UPLOAD);
    expect([200,201]).toContain(res.statusCode);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe('uuid-1');
    // FR-016/FR-017/FR-018: nomor pengajuan + token status dikembalikan ke tenant.
    expect(res.body.submission_number).toBe('MP-260916-ABC234');
    expect(res.body.status_token).toBe('tok-1');
    expect(res.body.status).toBe('menunggu_review');

    const insertCall = mockedQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO promo_submissions'));
    expect(insertCall).toBeDefined();
    const params = insertCall[1];
    // Nomor & token dibuat server (acak) — periksa formatnya, bukan nilai tetap.
    expect(params[0]).toMatch(/^MP-\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/); // submission_number
    expect(params[1]).toMatch(/^[A-Za-z0-9_-]{32}$/);                             // status_token
    expect(params[2]).toBe('spanduk');           // media_type_slug
    expect(params[18]).toBe('upload');           // source_type
    expect(params[19]).toBe('https://drive.google.com/file/d/file-1/view'); // file_url
    expect(params[20]).toBe('spanduk-srv.jpg');  // file_name dari metadata Drive
    expect(params[24]).toBe('file-1');           // drive_file_id
    expect(params[25]).toBe('menunggu_review');  // status awal
    expect(params[26]).toBe('fp123');            // fingerprint

    // Versi 1 materi + riwayat pembuka ikut dicatat.
    expect(mockedQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO promo_submission_files'))).toBe(true);
    expect(mockedQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO promo_submission_history'))).toBe(true);
  });
});

describe('POST /promo/submit — mode tautan eksternal', () => {
  const LINK_BODY = {
    media_type_slug: 'spanduk',
    tenant_id: 'T001',
    tenant_name: 'Optik Melawai',
    unit_number: 'L1-05',
    pic_name: 'Andi',
    pic_phone: '081234567890',
    campaign_name: 'Promo Akhir Tahun',
    material_title: 'Spanduk Diskon 50%',
    material_description: 'Diskon akhir tahun.',
    material_type: 'Promosi',
    media_target: 'Sisi Pintu Tol Bekasi Barat',
    air_start_date: '',
    air_end_date: '',
    installation_date: '',
    terms_accepted: true,
    notes: '',
    link_url: 'https://drive.google.com/file/d/xyz/view',
    device_fingerprint: 'fp123',
  };

  it('tautan https valid → 201 tanpa menyentuh Drive', async () => {
    const { res } = await callSubmit(LINK_BODY);
    expect([200,201]).toContain(res.statusCode);
    expect(mockedDrive).not.toHaveBeenCalled();

    const params = mockedQuery.mock.calls
      .find((c) => String(c[0]).includes('INSERT INTO promo_submissions'))[1];
    expect(params[18]).toBe('link');   // source_type
    expect(params[19]).toBe('');       // file_url
    expect(params[22]).toBe('https://drive.google.com/file/d/xyz/view'); // link_url
    expect(params[23]).toBe(0);        // file_size_bytes
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

describe('POST /promo/submit — lead time materi', () => {
  const RULES_2D = 'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.';
  const RULES_3BD = 'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.';

  function isoFromNow(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }

  function mockMedia(rules) {
    mockedQuery.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM promo_media_types')) {
        return Promise.resolve({ rows: [{ slug: 'spanduk', accepted_formats: 'JPEG,PDF', rules }] });
      }
      if (text.includes('INSERT INTO promo_submissions')) {
        return Promise.resolve({ rows: [{ id: 'uuid-9', submission_number: 'MP-260916-ZZZ999', status_token: 'tok-9', created_at: '2026-09-13T00:00:00Z' }] });
      }
      if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rows: [] });
    });
  }

  const LINK_BODY = {
    media_type_slug: 'spanduk',
    tenant_name: 'Optik Melawai',
    pic_name: 'Andi',
    pic_phone: '081234567890',
    campaign_name: 'Promo',
    material_title: 'Spanduk Promo',
    material_description: 'Keterangan promo.',
    material_type: 'Promosi',
    media_target: 'Pintu Tol',
    terms_accepted: true,
    link_url: 'https://drive.google.com/file/d/xyz/view',
    device_fingerprint: 'fp123',
  };

  it('menolak tanggal pasang yang lebih dekat dari lead time media', async () => {
    mockMedia(RULES_2D);
    const { res } = await callSubmit({ ...LINK_BODY, installation_date: isoFromNow(0) });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0]).toMatch(/terlalu dekat/);
    // Ditolak sebelum INSERT.
    expect(mockedQuery.mock.calls.every((c) => !String(c[0]).includes('INSERT INTO promo_submissions'))).toBe(true);
  });

  it('menerima tanggal pasang yang sudah melewati lead time', async () => {
    mockMedia(RULES_2D);
    const { res } = await callSubmit({ ...LINK_BODY, installation_date: isoFromNow(10) });
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body.success).toBe(true);
  });

  it('media tanpa aturan lead time: tanggal dekat tetap diterima', async () => {
    mockMedia('Mengirimkan materi promosi diluar hari dan jam kerja akan di respon sesuai ketersediaan admin.');
    const { res } = await callSubmit({ ...LINK_BODY, installation_date: isoFromNow(0) });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('tanggal kosong (opsional) tidak diblokir lead time', async () => {
    mockMedia(RULES_3BD);
    const { res } = await callSubmit({ ...LINK_BODY, installation_date: '' });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('aturan hari kerja: batasnya lebih longgar dari hari kalender', async () => {
    // Acuan hari ini; 3 hari kerja selalu >= 3 hari kalender.
    mockMedia(RULES_3BD);
    const { res } = await callSubmit({ ...LINK_BODY, installation_date: isoFromNow(3) });
    // 3 hari kalender dari hari ini belum tentu 3 hari kerja → boleh ditolak,
    // tapi bila ditolak pesannya harus menyebut "hari kerja".
    if (res.statusCode === 400) {
      expect(res.body.errors[0]).toMatch(/hari kerja/);
    } else {
      expect([200, 201]).toContain(res.statusCode);
    }
  });
});