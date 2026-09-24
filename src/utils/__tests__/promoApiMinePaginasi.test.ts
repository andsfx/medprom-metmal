/**
 * Test seam nyata `fetchMySubmissions` (klien API) - paginasi aditif.
 *
 * Kontrak rapuh yang dikunci: klien ini adalah satu-satunya jembatan antara
 * bentuk respons server dan yang dibaca `MySubmissionsPage`. Kalau ia salah
 * membaca, riwayat tampil kosong atau tombol "Muat lagi" hilang, padahal
 * datanya ada. Yang diuji lewat `fetch` sungguhan:
 *
 *  - tanpa `offset` URL persis seperti sebelum paginasi (tanpa `offset=0`),
 *    supaya pemanggil lama dan test lama tidak berubah;
 *  - `offset > 0` menambah `offset=<n>` pada query;
 *  - bentuk BARU `{ success, data, total }` → `{ rows, total }`;
 *  - bentuk LAMA (array polos) → `{ rows: <array>, total: null }`;
 *  - `success: false` pada HTTP 200 tetap dilempar sebagai ApiError (bukan
 *    diam-diam menjadi "belum ada pengajuan").
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchMySubmissions } from '../promoApi';
import { ApiError } from '../../lib/rest';

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlPanggilan(n: number): string {
  const call = vi.mocked(global.fetch).mock.calls.at(-n);
  return String(call?.[0] || '');
}

afterEach(() => { global.fetch = originalFetch; });
beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn(async () => jsonResponse({ success: true, data: [], total: 0 })) as unknown as typeof fetch;
});

describe('fetchMySubmissions - paginasi aditif', () => {
  it('tanpa offset → URL tanpa offset=0 (bentuk lama utuh)', async () => {
    await fetchMySubmissions('fp123');
    expect(urlPanggilan(1)).toContain('/promo/submissions/mine?fingerprint=fp123');
    expect(urlPanggilan(1)).not.toContain('offset');
  });

  it('offset > 0 → menambah offset pada query', async () => {
    await fetchMySubmissions('fp123', 50);
    expect(urlPanggilan(1)).toContain('offset=50');
  });

  it('bentuk baru { data, total } → rows + total', async () => {
    global.fetch = vi.fn(async () => jsonResponse({
      success: true, data: [{ id: 'sub-1' }], total: 120,
    })) as unknown as typeof fetch;

    const hasil = await fetchMySubmissions('fp123');
    expect(hasil.rows).toHaveLength(1);
    expect(hasil.total).toBe(120);
  });

  it('bentuk lama (array polos) → rows + total null', async () => {
    global.fetch = vi.fn(async () => jsonResponse([{ id: 'sub-1' }, { id: 'sub-2' }])) as unknown as typeof fetch;

    const hasil = await fetchMySubmissions('fp123');
    expect(hasil.rows).toHaveLength(2);
    expect(hasil.total).toBeNull();
  });

  it('total tidak ada → null, bukan NaN', async () => {
    global.fetch = vi.fn(async () => jsonResponse({ success: true, data: [{ id: 'sub-1' }] })) as unknown as typeof fetch;

    const hasil = await fetchMySubmissions('fp123');
    expect(hasil.total).toBeNull();
  });

  it('success:false pada HTTP 200 → tetap ApiError', async () => {
    global.fetch = vi.fn(async () => jsonResponse({ success: false, error: 'Gagal memuat.' })) as unknown as typeof fetch;

    await expect(fetchMySubmissions('fp123')).rejects.toBeInstanceOf(ApiError);
  });
});
