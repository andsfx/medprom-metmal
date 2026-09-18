/**
 * Test verifikasi Cloudflare Turnstile (lib/turnstile.js).
 *
 * Yang dikunci di sini adalah kontrak keamanannya: token kosong ditolak,
 * token sah diterima, token ditolak bila Siteverify bilang gagal, dan gangguan
 * jaringan bersifat FAIL-CLOSED (503) — bukan diam-diam melepas gerbang.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verifyTurnstile, turnstileConfigured, turnstileHostnamesConfigured,
} from '../../server/src/lib/turnstile.js';

const originalFetch = global.fetch;
const ENV_KEY = 'TURNSTILE_SECRET_KEY';
const HOSTS_KEY = 'TURNSTILE_HOSTNAMES';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Respons sukses Siteverify dengan action + hostname yang cocok. */
function okBody(over = {}) {
  return { success: true, action: 'track', hostname: 'localhost', ...over };
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env[ENV_KEY] = 'secret-uji';
  process.env[HOSTS_KEY] = 'localhost,medprom.vercel.app';
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env[ENV_KEY];
  delete process.env[HOSTS_KEY];
});

describe('turnstileConfigured', () => {
  it('false tanpa secret key, true saat diisi', () => {
    delete process.env[ENV_KEY];
    expect(turnstileConfigured()).toBe(false);
    process.env[ENV_KEY] = 'secret-uji';
    expect(turnstileConfigured()).toBe(true);
  });
});

describe('turnstileHostnamesConfigured', () => {
  it('false tanpa allowlist, true saat diisi', () => {
    delete process.env[HOSTS_KEY];
    expect(turnstileHostnamesConfigured()).toBe(false);
    process.env[HOSTS_KEY] = 'localhost';
    expect(turnstileHostnamesConfigured()).toBe(true);
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
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const res = await verifyTurnstile('   ');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/captcha wajib/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('token lebih panjang dari 2048 karakter → ditolak tanpa Siteverify', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const res = await verifyTurnstile('x'.repeat(2049));
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('secret ada tapi allowlist hostname kosong → fail-closed 503', async () => {
    delete process.env[HOSTS_KEY];
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await verifyTurnstile('tok-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Siteverify sukses + action & hostname cocok → ok', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(okBody()));
    global.fetch = fetchSpy;

    await expect(
      verifyTurnstile('tok-1', { remoteip: '203.0.113.7', action: 'track' }),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('siteverify');
    expect(init.method).toBe('POST');
    // Form-urlencoded (kontrak kanonik), bukan JSON.
    const body = new URLSearchParams(String(init.body));
    expect(body.get('secret')).toBe('secret-uji');
    expect(body.get('response')).toBe('tok-1');
    expect(body.get('remoteip')).toBe('203.0.113.7');
  });

  it('action tidak cocok → ditolak (token permukaan lain tak bisa dipakai ulang)', async () => {
    global.fetch = vi.fn(async () => jsonResponse(okBody({ action: 'submit' })));

    const res = await verifyTurnstile('tok-1', { action: 'track' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/captcha gagal/i);
  });

  it('hostname di luar allowlist → ditolak', async () => {
    global.fetch = vi.fn(async () => jsonResponse(okBody({ hostname: 'penyerang.example' })));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await verifyTurnstile('tok-1', { action: 'track' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/captcha gagal/i);
  });

  it('Siteverify menolak → pesan seragam (tidak membocorkan kode kegagalan)', async () => {
    global.fetch = vi.fn(async () => jsonResponse(
      { success: false, 'error-codes': ['timeout-or-duplicate'] },
    ));

    const res = await verifyTurnstile('tok-kedaluwarsa');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/captcha gagal/i);
    expect(res.error).not.toMatch(/timeout-or-duplicate/);
  });

  it('Siteverify tak terjangkau → fail-closed 503', async () => {
    global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await verifyTurnstile('tok-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it('respons Siteverify non-2xx → ditolak, bukan crash', async () => {
    global.fetch = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));

    const res = await verifyTurnstile('tok-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });
});
