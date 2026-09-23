/**
 * Regresi seam "kolom hilang dari SELECT": Nomor Batch di sheet detail staf.
 *
 * `src/components/admin/AdminDashboardPage.tsx` merender baris "Nomor Batch"
 * bila `detail.batch_number` ada, dan tipe `AdminSubmissionRow` sudah memuat
 * `batch_number`. Bila kedua handler admin tidak meng-SELECT kolom itu, baris
 * tersebut tidak akan pernah tampil di aplikasi nyata - dan test FE tidak
 * menangkapnya karena fixture test mengarang nilainya sendiri.
 *
 * Pola sama dengan `catalog-invariants.test.js` (media_channel hilang dari
 * `GET /promo/media-types`): handler SUNGGUHAN dijalankan dengan `db` di-mock,
 * lalu SQL yang benar-benar dikirim ke driver diperiksa.
 *
 * Latar skema: `promo_submission_batches` BERTABRAKAN nama kolom dengan
 * `promo_submissions` (id, tenant_id, unit_number, pic_name, pic_phone,
 * submission_date, notes, device_fingerprint, ip_address, user_agent,
 * created_at, updated_at, applicant_type). Karena itu join ini WAJIB memilih
 * hanya `b.batch_number` - `b.*` akan menimpa kolom `s.*` di hasil dan
 * `created_at` menjadi ambigu pada klausa WHERE. Test di bawah mengunci
 * keduanya.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/src/db.js', () => ({
  db: { query: vi.fn(), ready: true, verify: vi.fn(), end: vi.fn() },
  isDbReady: vi.fn(() => true),
}));
vi.mock('../../server/src/drive.js', () => ({
  deleteDriveFileOrThrow: vi.fn(),
  getDriveFile: vi.fn(),
}));
vi.mock('../../server/src/auth.js', () => ({
  requireRole: () => (req, _res, next) => {
    req.auth = { user: { id: 'admin-1', display_name: 'Admin Satu', role: 'admin' } };
    next();
  },
  logActivity: vi.fn(),
  READ_ROLES: ['superadmin', 'admin', 'tenant_relation'],
  STAFF_ROLES: ['superadmin', 'admin'],
}));

import adminRouter from '../../server/src/routes/admin.js';
import { db } from '../../server/src/db.js';

const mockedQuery = vi.mocked(db.query);

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader() { return this; },
    end() { return this; },
    send(data) { this.body = data; return this; },
  };
}

function getHandler(path, method) {
  const layer = adminRouter.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`handler ${method.toUpperCase()} ${path} tidak ditemukan`);
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

async function call(path, method, { params, query } = {}) {
  const handler = getHandler(path, method);
  const req = {
    method: method.toUpperCase(),
    params,
    query,
    headers: {},
    socket: {},
    // requireRole sudah dilewati (handler dipanggil langsung) - sediakan sesi.
    auth: { user: { id: 'admin-1', display_name: 'Admin Satu', role: 'admin' } },
  };
  const res = createMockResponse();
  await handler(req, res, (err) => {
    if (err) { res.statusCode = 500; res.body = { error: err.message }; }
  });
  return res;
}

/** Semua token `b.<kolom>` di dalam SQL (untuk melarang `b.*` / kolom tabrakan). */
function aliasBColumns(sql) {
  return [...String(sql).matchAll(/\bb\.([A-Za-z_][A-Za-z0-9_]*|\*)/g)].map((m) => m[1]);
}

/**
 * Klausa WHERE hasil `buildSubmissionFilters` ikut dijalankan pada dua bentuk
 * query: daftar (alias `s` + join) dan hitungan (alias `s`, tanpa join).
 * Kolom tabrakan (`created_at`) wajib berkualifikasi `s.` agar tidak
 * "column reference is ambiguous" setelah join ditambahkan.
 */
const KOLOM_FILTER = [
  'created_at',
  'status',
  'media_type_slug',
  'tenant_name',
  'submission_number',
  'material_title',
];

beforeEach(() => { vi.clearAllMocks(); });

describe('GET /admin/submissions - nomor batch ikut ter-SELECT', () => {
  // Query daftar = SELECT baris; query hitungan juga memakai alias `s` sekarang,
  // jadi keduanya harus dibedakan lewat `COUNT(*)`.
  function listSql() {
    return mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('FROM promo_submissions s') && !sql.includes('COUNT(*)'));
  }

  beforeEach(() => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rows: [] });
    });
  });

  it('memuat join promo_submission_batches dan kolom b.batch_number', async () => {
    const res = await call('/submissions', 'get', {});
    expect(res.statusCode).toBe(200);
    const sql = listSql();
    expect(sql).toContain('LEFT JOIN promo_submission_batches b ON b.id = s.batch_id');
    expect(sql).toContain('b.batch_number');
  });

  it('TIDAK memakai b.* dan hanya mengambil b.batch_number dari tabel batch', async () => {
    await call('/submissions', 'get', {});
    const kolom = aliasBColumns(listSql());
    expect(kolom).not.toContain('*');
    // `b.id` hanya boleh muncul sebagai syarat join, bukan sebagai kolom hasil.
    expect(new Set(kolom)).toEqual(new Set(['id', 'batch_number']));
    expect(kolom.filter((c) => c === 'batch_number').length).toBe(1);
    // Kolom hasil tetap `s.*` supaya seluruh field pengajuan utuh.
    expect(listSql()).toContain('SELECT s.*');
  });

  it('mengembalikan batch_number dari DB apa adanya ke klien', async () => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 1 }] });
      return Promise.resolve({ rows: [{ id: 's1', submission_number: 'MP-1', batch_number: 'BATCH-2609-0007' }] });
    });
    const res = await call('/submissions', 'get', {});
    expect(res.body.data[0].batch_number).toBe('BATCH-2609-0007');
  });

  it('klausa WHERE memakai prefix s. untuk seluruh kolom filter', async () => {
    await call('/submissions', 'get', {
      query: {
        status: 'menunggu_review',
        media_type: 'spanduk',
        tenant: 'Melawai',
        date_from: '2026-09-01',
        date_to: '2026-09-30',
        q: 'MP-260916',
      },
    });
    const sql = listSql();
    for (const kolom of KOLOM_FILTER) {
      expect(sql, `${kolom} wajib berkualifikasi s.`).toContain(`s.${kolom}`);
      // Tidak boleh ada kemunculan telanjang (tanpa alias) yang jadi ambigu.
      expect(sql, `${kolom} muncul tanpa alias`).not.toMatch(
        new RegExp(`(?<![.\\w])${kolom}`),
      );
    }
    // Query hitungan memakai alias yang sama supaya WHERE hasil filter valid.
    const countSql = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('COUNT(*)') && sql.includes('WHERE'));
    expect(countSql).toContain('FROM promo_submissions s');
    expect(countSql).toContain('s.created_at');
  });
});

describe('GET /admin/submissions/:id - nomor batch ikut ter-SELECT', () => {
  function detailSql() {
    return String(mockedQuery.mock.calls[0][0]);
  }

  beforeEach(() => {
    mockedQuery.mockImplementation((sql) => {
      if (String(sql).includes('FROM promo_submissions s')) {
        return Promise.resolve({ rows: [{ id: 's1', submission_number: 'MP-1', batch_number: 'BATCH-2609-0007' }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it('memuat join promo_submission_batches dan kolom b.batch_number', async () => {
    const res = await call('/submissions/:id', 'get', { params: { id: 's1' } });
    expect(res.statusCode).toBe(200);
    const sql = detailSql();
    expect(sql).toContain('LEFT JOIN promo_submission_batches b ON b.id = s.batch_id');
    expect(sql).toContain('b.batch_number');
    expect(sql).toContain('SELECT s.*');
  });

  it('TIDAK memakai b.* dan hanya mengambil b.batch_number dari tabel batch', async () => {
    await call('/submissions/:id', 'get', { params: { id: 's1' } });
    const kolom = aliasBColumns(detailSql());
    expect(kolom).not.toContain('*');
    expect(new Set(kolom)).toEqual(new Set(['id', 'batch_number']));
  });

  it('meneruskan batch_number ke payload detail', async () => {
    const res = await call('/submissions/:id', 'get', { params: { id: 's1' } });
    expect(res.body.data.submission.batch_number).toBe('BATCH-2609-0007');
  });
});
