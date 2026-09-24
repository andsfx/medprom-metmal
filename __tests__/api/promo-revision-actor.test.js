/**
 * Test nama pelaku riwayat pada kirim revisi tenant (F2).
 *
 * Kontrak rapuh yang dikunci:
 *  - handler `POST /promo/submissions/:id/revision` memakai nama PIC pengajuan
 *    (`pic_name`) sebagai `actor_name` baris riwayat, bukan string kosong;
 *  - SELECT pengajuan di handler itu memuat `pic_name` sebagai sumbernya.
 *
 * Handler sungguhan, pola mock sama dengan `__tests__/api/promo-status.test.js`.
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

import promoRouter from '../../server/src/routes/promo.js';
import { db } from '../../server/src/db.js';
import { enforceRateLimit } from '../../server/src/lib/rateLimit.js';

const mockedQuery = vi.mocked(db.query);

const PIC_NAME = 'Andi Wijaya';

const SUBMISSION_ROW = {
  id: 'sub-1',
  status_token: 'tok-abc',
  status: 'perlu_revisi',
  device_fingerprint: 'fp123',
  source_type: 'link',
  pic_name: PIC_NAME,
};

const REVISION_BODY = {
  link_url: 'https://drive.google.com/file/d/new/view',
  device_fingerprint: 'fp123',
  notes: 'Sudah diperbaiki',
};

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
}

function getHandler(path, method) {
  const layer = promoRouter.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`handler ${method.toUpperCase()} ${path} tidak ditemukan`);
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

async function call(path, method, { body, params, query } = {}) {
  const handler = getHandler(path, method);
  const req = {
    method: method.toUpperCase(), body, params, query,
    headers: { 'user-agent': 'vitest' }, socket: {},
  };
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

/** Panggilan INSERT baris riwayat. */
function findHistoryInsert() {
  return mockedQuery.mock.calls.find(
    (c) => String(c[0]).includes('INSERT INTO promo_submission_history'),
  );
}

function mockRevisi(row) {
  mockedQuery.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('SELECT id, status, status_token, device_fingerprint')) {
      return Promise.resolve({ rows: [row] });
    }
    if (text.includes('COALESCE(MAX(version)')) return Promise.resolve({ rows: [{ v: 1 }] });
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockReturnValue(true);
});

describe('POST /promo/submissions/:id/revision - nama pelaku riwayat', () => {
  it('SELECT pengajuan memuat pic_name (sumber nama pelaku)', async () => {
    mockRevisi(SUBMISSION_ROW);
    await call('/submissions/:id/revision', 'post', { params: { id: 'sub-1' }, body: REVISION_BODY });
    const selectSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('FROM promo_submissions WHERE id = $1'));
    expect(selectSql).toBeDefined();
    expect(selectSql).toContain('pic_name');
  });

  it('menulis pic_name pengajuan sebagai actor_name, bukan string kosong', async () => {
    mockRevisi(SUBMISSION_ROW);
    const res = await call('/submissions/:id/revision', 'post', {
      params: { id: 'sub-1' },
      body: REVISION_BODY,
    });
    expect(res.statusCode).toBe(200);

    const hist = findHistoryInsert();
    expect(hist).toBeDefined();
    // params: [submission_id, from_status, to_status, comment, actor_type, actor_name, actor_id]
    expect(hist[1][4]).toBe('tenant');
    expect(hist[1][5]).toBe(PIC_NAME);
    expect(hist[1][5]).not.toBe('');
  });

  it('pic_name kosong → actor_name tetap aman (string kosong, tanpa crash)', async () => {
    mockRevisi({ ...SUBMISSION_ROW, pic_name: undefined });
    const res = await call('/submissions/:id/revision', 'post', {
      params: { id: 'sub-1' },
      body: REVISION_BODY,
    });
    expect(res.statusCode).toBe(200);
    const hist = findHistoryInsert();
    expect(hist[1][5]).toBe('');
  });
});
