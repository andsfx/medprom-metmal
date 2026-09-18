/**
 * Test rate limit in-memory (server/src/lib/rateLimit.js) — TANPA mock.
 *
 * Modul aslinya diuji di sini karena seluruh test lain mem-mock
 * `enforceRateLimit`/`clientIp`, sehingga cabang 429, header Retry-After, dan
 * anti-spoof `clientIp` (X-Real-IP vs X-Forwarded-For) tidak pernah dieksekusi.
 *
 * Catatan: Map bucket hidup selama berkas ini, jadi tiap test memakai kunci
 * bucket unik agar tidak saling mencemari.
 */
import { describe, it, expect, vi } from 'vitest';

import { enforceRateLimit, clientIp } from '../../server/src/lib/rateLimit.js';

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader(key, value) { this.headers[key] = value; return this; },
  };
}

let seq = 0;
function uniqueKey(prefix = 'bucket') {
  seq += 1;
  return `${prefix}-${seq}`;
}

function reqFrom(ip, extra = {}) {
  return { headers: { 'x-real-ip': ip, ...extra }, socket: {} };
}

describe('enforceRateLimit', () => {
  it('mengizinkan sampai batas, lalu 429 + Retry-After + header X-RateLimit', () => {
    const key = uniqueKey();
    const max = 3;
    const windowMs = 60_000;
    const req = reqFrom('203.0.113.1');

    for (let i = 1; i <= max; i += 1) {
      const res = createMockResponse();
      expect(enforceRateLimit(req, res, key, max, windowMs)).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.headers['X-RateLimit-Limit']).toBe(String(max));
      expect(res.headers['X-RateLimit-Remaining']).toBe(String(max - i));
      expect(res.headers['X-RateLimit-Reset']).toBeDefined();
    }

    const res = createMockResponse();
    expect(enforceRateLimit(req, res, key, max, windowMs)).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
    expect(res.headers['X-RateLimit-Remaining']).toBe('0');
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Terlalu banyak permintaan/);
  });

  it('bucket berbeda dihitung terpisah', () => {
    const a = uniqueKey('a');
    const b = uniqueKey('b');
    const req = reqFrom('203.0.113.2');

    expect(enforceRateLimit(req, createMockResponse(), a, 1, 60_000)).toBe(true);
    expect(enforceRateLimit(req, createMockResponse(), a, 1, 60_000)).toBe(false);
    // Bucket lain belum tersentuh.
    expect(enforceRateLimit(req, createMockResponse(), b, 1, 60_000)).toBe(true);
  });

  it('IP berbeda memiliki kuota sendiri pada bucket yang sama', () => {
    const key = uniqueKey('ip');
    expect(enforceRateLimit(reqFrom('198.51.100.1'), createMockResponse(), key, 1, 60_000)).toBe(true);
    expect(enforceRateLimit(reqFrom('198.51.100.2'), createMockResponse(), key, 1, 60_000)).toBe(true);
  });

  it('jendela direset setelah windowMs', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-17T00:00:00Z'));
      const key = uniqueKey('window');
      const req = reqFrom('203.0.113.9');

      expect(enforceRateLimit(req, createMockResponse(), key, 1, 60_000)).toBe(true);
      expect(enforceRateLimit(req, createMockResponse(), key, 1, 60_000)).toBe(false);

      vi.advanceTimersByTime(60_001);
      expect(enforceRateLimit(req, createMockResponse(), key, 1, 60_000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('clientIp — anti-spoof', () => {
  it('memakai X-Real-IP dan MENGABAIKAN X-Forwarded-For', () => {
    const ip = clientIp({
      headers: { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '10.0.0.1' },
      ip: '10.0.0.1',
      socket: { remoteAddress: '10.0.0.1' },
    });
    expect(ip).toBe('198.51.100.7');
  });

  it('jatuh ke req.ip bila X-Real-IP tidak ada', () => {
    expect(clientIp({ headers: {}, ip: '198.51.100.8', socket: {} })).toBe('198.51.100.8');
  });

  it('jatuh ke socket.remoteAddress bila req.ip kosong/unknown', () => {
    expect(clientIp({ headers: {}, ip: 'unknown', socket: { remoteAddress: '198.51.100.9' } })).toBe('198.51.100.9');
  });

  it('memberi "unknown" bila tidak ada sumber alamat sama sekali', () => {
    expect(clientIp({ headers: {}, socket: {} })).toBe('unknown');
  });
});
