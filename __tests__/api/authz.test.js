/**
 * @vitest-environment node
 *
 * Test middleware otorisasi ASLI (server/src/auth.js).
 *
 * Lingkungan `node` dipakai karena jose memverifikasi kunci dengan
 * `instanceof Uint8Array`; di jsdom, TextEncoder menghasilkan Uint8Array dari
 * realm lain sehingga verifikasi selalu gagal.
 *
 * Test lain mem-mock `requireRole` menjadi pass-through, sehingga matriks
 * 401/403 (tanpa sesi / role tidak diizinkan / user nonaktif) tidak pernah
 * terbukti. Di sini middleware asli dijalankan dengan JWT asli (jose); hanya
 * `db` yang di-mock, supaya role dibaca ulang dari DB seperti di produksi.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../server/src/db.js', () => ({
  db: { query: vi.fn(), ready: true, verify: vi.fn(), end: vi.fn() },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/lib/rateLimit.js', () => ({
  clientIp: vi.fn(() => '203.0.113.10'),
  enforceRateLimit: vi.fn(() => true),
}));

import { requireRole, signAccess, signRefresh, READ_ROLES, STAFF_ROLES } from '../../server/src/auth.js';
import { db } from '../../server/src/db.js';

const mockedQuery = vi.mocked(db.query);

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    cookie(name, value, opts) { this.cookies.push({ name, value, opts }); return this; },
    clearCookie() { return this; },
    setHeader() { return this; },
  };
}

/** Jalankan middleware asli; laporkan apakah next() dipanggil. */
async function run(middleware, req) {
  const res = createMockResponse();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

/** db mengembalikan baris user dengan role/is_active yang diminta. */
function mockUser({ role = 'admin', is_active = true } = {}) {
  mockedQuery.mockImplementation((sql) => {
    if (String(sql).includes('FROM users WHERE id = $1')) {
      return Promise.resolve({
        rows: [{ id: 'u1', email: 'u@metmal.co.id', display_name: 'Uji', role, is_active }],
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

const SECRET = 'test-secret-authz-jangan-dipakai-produksi';

function reqWith(token) {
  return {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    socket: {},
  };
}

function tokenFor(role) {
  return signAccess({ id: 'u1', email: 'u@metmal.co.id', display_name: 'Uji', role });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe('requireRole — middleware asli', () => {
  it('tanpa sesi → 401', async () => {
    mockUser({ role: 'admin' });
    const { res, nextCalled } = await run(requireRole(STAFF_ROLES), reqWith(''));
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/Sesi berakhir/);
    expect(nextCalled).toBe(false);
  });

  it('tanpa JWT_SECRET → 401 (fail-closed)', async () => {
    delete process.env.JWT_SECRET;
    mockUser({ role: 'admin' });
    const { res } = await run(requireRole(STAFF_ROLES), reqWith('token-apa-saja'));
    expect(res.statusCode).toBe(401);
  });

  it('token tidak sah → 401', async () => {
    mockUser({ role: 'admin' });
    const { res } = await run(requireRole(STAFF_ROLES), reqWith('bukan.jwt.sah'));
    expect(res.statusCode).toBe(401);
  });

  it('admin lolos STAFF_ROLES → next() + req.auth terisi', async () => {
    mockUser({ role: 'admin' });
    const req = reqWith(await tokenFor('admin'));
    const { res, nextCalled } = await run(requireRole(STAFF_ROLES), req);
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(req.auth.user.role).toBe('admin');
  });

  it('tenant_relation ditolak STAFF_ROLES → 403', async () => {
    mockUser({ role: 'tenant_relation' });
    const { res, nextCalled } = await run(requireRole(STAFF_ROLES), reqWith(await tokenFor('tenant_relation')));
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/tidak memiliki akses/);
    expect(nextCalled).toBe(false);
  });

  it('tenant_relation lolos READ_ROLES', async () => {
    mockUser({ role: 'tenant_relation' });
    const { nextCalled } = await run(requireRole(READ_ROLES), reqWith(await tokenFor('tenant_relation')));
    expect(nextCalled).toBe(true);
  });

  it('admin ditolak daftar superadmin → 403', async () => {
    mockUser({ role: 'admin' });
    const { res } = await run(requireRole(['superadmin']), reqWith(await tokenFor('admin')));
    expect(res.statusCode).toBe(403);
  });

  it('role diambil ulang dari DB, bukan dari klaim token', async () => {
    // Token mengklaim admin, tetapi baris DB kini tenant_relation.
    mockUser({ role: 'tenant_relation' });
    const { res } = await run(requireRole(STAFF_ROLES), reqWith(await tokenFor('admin')));
    expect(res.statusCode).toBe(403);
  });

  it('user nonaktif → 401 meski token sah', async () => {
    mockUser({ role: 'admin', is_active: false });
    const { res, nextCalled } = await run(requireRole(STAFF_ROLES), reqWith(await tokenFor('admin')));
    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('refresh token via cookie memutar token lalu lolos', async () => {
    mockUser({ role: 'admin' });
    const refresh = await signRefresh('u1');
    const req = { method: 'GET', headers: { cookie: `sb-refresh-token=${refresh}` }, socket: {} };
    const { res, nextCalled } = await run(requireRole(STAFF_ROLES), req);
    expect(nextCalled).toBe(true);
    expect(res.cookies.some((c) => c.name === 'sb-access-token')).toBe(true);
  });
});
