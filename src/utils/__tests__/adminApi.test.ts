/**
 * Regresi client API — dua kontrak yang sempat rusak:
 *  1. GET /auth/me membalas { success, user } TANPA field `data` (bukan envelope
 *     publik) — session check harus membaca bentuk aslinya.
 *  2. GET /admin/submissions membalas envelope + metadata (total/page) sekaligus —
 *     pemanggil butuh body penuh, bukan hanya `data`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuth } from '../../hooks/useAuth';
import { fetchAdminSubmissions } from '../../utils/adminApi';
import { renderHook, waitFor } from '@testing-library/react';

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useAuth — session check /auth/me', () => {
  it('membaca user dari respons { success, user }', async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/auth/me')) {
        return jsonResponse({
          success: true,
          user: { id: 'u1', email: 'tr@metmal.co.id', display_name: 'Staf TR', role: 'admin' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth());

    await waitFor(() => { expect(result.current.isLoading).toBe(false); });
    expect(result.current.user?.email).toBe('tr@metmal.co.id');
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('fetchAdminSubmissions — envelope + metadata', () => {
  it('mengembalikan data, total, dan total_pages', async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/admin/submissions')) {
        return jsonResponse({
          success: true,
          data: [{ id: 's1', tenant_name: 'Optik Melawai', status: 'pending' }],
          total: 1,
          page: 1,
          per_page: 20,
          total_pages: 1,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const page = await fetchAdminSubmissions({});

    expect(page.data).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.total_pages).toBe(1);
  });
});
