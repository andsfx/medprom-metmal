/**
 * Test penegakan KANAL di POST /promo/submit (pengajuan digital).
 *
 * Kontrak rapuh yang dikunci:
 *  - media berkanal 'cetak' DITOLAK (400) dengan pesan yang menuntun ke form
 *    Media Promosi Cetak, dan TIDAK ada baris apa pun yang ditulis;
 *  - media berkanal 'digital' tetap lolos seperti sebelumnya;
 *  - media TANPA `media_channel` (baris katalog warisan) tetap lolos, supaya
 *    penegakan ini fail-safe dan tidak memutus pemanggil lama.
 *
 * Handler SUNGGUHAN dipanggil lewat `router.stack` (pola sama dengan
 * `promo-submit.test.js` / `promo-batch.test.js`).
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
  const layer = promoRouter.stack.find(
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
  await handler(req, res, (err) => {
    if (err) {
      res.statusCode = 500;
      res.body = { error: err.message };
    }
  });
  return { res, req };
}

/** Payload unggah lengkap; kanal ditentukan oleh media yang dikembalikan DB. */
const VALID_UPLOAD = {
  media_type_slug: 'videotron',
  tenant_id: 'T001',
  tenant_name: 'Optik Melawai',
  unit_number: 'L1-05',
  pic_name: 'Andi',
  pic_phone: '081234567890',
  campaign_name: 'Promo Akhir Tahun',
  material_title: 'Videotron Diskon 50%',
  material_description: 'Diskon akhir tahun seluruh produk.',
  material_type: 'Promosi',
  media_target: 'Atrium 1',
  air_start_date: '2026-10-01',
  air_end_date: '2026-10-31',
  installation_date: '',
  terms_accepted: true,
  notes: '',
  drive_file_id: 'file-1',
  file_name: 'videotron.mp4',
  mime_type: 'video/mp4',
  file_size_bytes: 1024,
  device_fingerprint: 'fp-kanal-1',
};

/** Media katalog yang dikembalikan SELECT `promo_media_types`. */
function mediaRow(over = {}) {
  return {
    slug: 'videotron',
    accepted_formats: 'JPEG,MP4',
    rules: '',
    media_channel: 'digital',
    ...over,
  };
}

/** SQL yang benar-benar dieksekusi - dipakai mengunci "tidak ada INSERT". */
let sqlLog = [];

function mockDb(media) {
  sqlLog = [];
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    sqlLog.push(text);
    if (text.includes('FROM promo_media_types')) {
      return Promise.resolve({ rows: media ? [media] : [] });
    }
    if (text.includes('FROM promo_submissions WHERE drive_file_id')) return Promise.resolve({ rows: [] });
    if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
    if (text.includes('INSERT INTO promo_submissions')) {
      return Promise.resolve({
        rows: [{
          id: 'uuid-1', submission_number: 'MP-260916-ABC234',
          status_token: 'tok-1', created_at: '2026-09-13T00:00:00Z',
        }],
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDrive.mockResolvedValue({
    ok: true,
    id: 'file-1',
    name: 'videotron-srv.mp4',
    mimeType: 'video/mp4',
    size: 1024,
    webViewLink: 'https://drive.google.com/file/d/file-1/view',
  });
  mockedRateLimit.mockReturnValue(true);
  mockedClientIp.mockImplementation((req) => req.headers['x-real-ip'] || '');
  mockDb(mediaRow());
});

describe('POST /promo/submit - penegakan kanal media', () => {
  it('media berkanal cetak ditolak 400, pesan menuntun ke form cetak, tanpa INSERT', async () => {
    mockDb(mediaRow({ slug: 'spanduk', media_channel: 'cetak' }));
    const { res } = await callSubmit({ ...VALID_UPLOAD, media_type_slug: 'spanduk' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/cetak/i);
    expect(res.body.error).toContain('/ajukan-cetak');
    expect(res.body.error).toMatch(/menyusul/i);

    // Tidak ada penulisan apa pun: pengajuan, versi materi, maupun riwayat.
    expect(sqlLog.some((s) => s.includes('INSERT INTO promo_submissions'))).toBe(false);
    expect(sqlLog.some((s) => s.includes('INSERT INTO promo_submission_files'))).toBe(false);
    expect(sqlLog.some((s) => s.includes('INSERT INTO promo_submission_history'))).toBe(false);
    expect(mockedDrive).not.toHaveBeenCalled();
  });

  it('media berkanal digital tetap lolos', async () => {
    mockDb(mediaRow({ slug: 'videotron', media_channel: 'digital' }));
    const { res } = await callSubmit(VALID_UPLOAD);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.submission_number).toBe('MP-260916-ABC234');
    expect(sqlLog.some((s) => s.includes('INSERT INTO promo_submissions'))).toBe(true);
  });

  it('media tanpa media_channel tetap lolos (kompatibilitas baris warisan)', async () => {
    mockDb(mediaRow({ slug: 'videotron', media_channel: undefined }));
    const { res } = await callSubmit(VALID_UPLOAD);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(sqlLog.some((s) => s.includes('INSERT INTO promo_submissions'))).toBe(true);
  });

  it('SELECT media memuat kolom media_channel (penegakan tidak buta kanal)', async () => {
    mockDb(mediaRow({ slug: 'videotron', media_channel: 'digital' }));
    await callSubmit(VALID_UPLOAD);

    const selectMedia = sqlLog.find((s) => s.includes('FROM promo_media_types')) || '';
    expect(selectMedia).toContain('media_channel');
  });
});
