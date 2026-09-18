/**
 * Test verifikasi Cloudflare Turnstile (lib/turnstile.js).
 *
 * Yang dikunci di sini adalah kontrak keamanannya: token kosong ditolak,
 * token sah diterima, token ditolak bila Siteverify bilang gagal, dan gangguan
 * jaringan bersifat FAIL-CLOSED (503) — bukan diam-diam melepas gerbang.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstile, turnstileConfigured } from '../../server/src/lib/turnstile.js';

const originalFetch = global.fetch;
const ENV_KEY = 'TURNSTILE_SECRET_KEY';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env[ENV_KEY];
});

describe('turnstileConfigured', () => {
  it('false tanpa secret key, true saat diisi', () => {
    delete process.env[ENV_KEY];
    expect(turnstileConfigured()).toBe(false);
    process.env[ENV_KEY] = 'secret-uji';
    expect(turnstileConfigured()).toBe(true);
  });
});

describe('verifyTurnstile', () => {
  it('secret key kosong → dilewati (instance lama tetap jalan)', async () => {
    delete process.env[ENV_KEY];
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    await expect(verifyTurnstile('token')).resolves.toEqual({ ok: true, skipped: true });
    // Tidak memanggil Siteverify sama sekali.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('token kosong → ditolak tanpa memanggil Siteverify', async () => {
    process.env[ENV_KEY] = 'secret-uji';
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const res = await verifyTurnstile('   ');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/captcha wajib/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Siteverify sukses → ok', async () => {
    process.env[ENV_KEY] = 'secret-uji';
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, hostname: 'localhost' }));
    global.fetch = fetchSpy;

    await expect(verifyTurnstile('tok-1', '203.0.113.7')).resolves.toEqual({ ok: true });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('siteverify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      secret: 'secret-uji', response: 'tok-1', remoteip: '203.0.113.7',
    });
  });

  it('Siteverify menolak → pesan seragam (tidak membocorkan kode kegagalan)', async () => {
    process.env[ENV_KEY] = 'secret-uji';
    global.fetch = vi.fn(async () => jsonResponse(
      { success: false, 'error-codes': ['timeout-or-duplicate'] },
    ));

    const res = await verifyTurnstile('tok-kedaluwarsa');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/captcha gagal/i);
    expect(res.error).not.toMatch(/timeout-or-duplicate/);
  });

  it('Siteverify tak terjangkau → fail-closed 503', async () => {
    process.env[ENV_KEY] = 'secret-uji';
    global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await verifyTurnstile('tok-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it('respons Siteverify bukan JSON → ditolak, bukan crash', async () => {
    process.env[ENV_KEY] = 'secret-uji';
    global.fetch = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));

    const res = await verifyTurnstile('tok-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/captcha gagal/i);
  });
});
