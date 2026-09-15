/**
 * Regresi sync katalog: seed harus menyelaraskan `rules` (bukan hanya
 * `accepted_formats`), dan tetap idempotent — menjalankannya dua kali tidak
 * boleh menulis ulang baris yang sudah selaras.
 *
 * Latar: sebelumnya `ON CONFLICT ... SET accepted_formats` saja, sehingga
 * koreksi ketentuan dari deck tidak pernah sampai ke instance yang sudah jalan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries = [];

vi.mock('pg', () => {
  class Pool {
    constructor() {}
    query(sql, params) {
      queries.push({ sql: String(sql), params });
      const text = String(sql);
      if (text.includes('INSERT INTO promo_media_types')) {
        // Baris sudah ada → is_insert=false (meniru RETURNING saat DO UPDATE jalan).
        return Promise.resolve({ rows: [{ id: 'x', is_insert: false }] });
      }
      if (text.includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 14 }] });
      return Promise.resolve({ rows: [] });
    }
    end() { return Promise.resolve(); }
  }
  return { default: { Pool } };
});

beforeEach(() => {
  queries.length = 0;
  process.env.DATABASE_URL = 'postgres://stub/db';
  // Modul ESM di-cache; reset agar tiap test benar-benar menjalankan seed.
  vi.resetModules();
});

describe('seed-media-types — sync rules', () => {
  it('upsert menyelaraskan accepted_formats DAN rules', async () => {
    await import('../../server/scripts/seed-media-types.mjs');

    const upserts = queries.filter((q) => q.sql.includes('INSERT INTO promo_media_types'));
    expect(upserts.length).toBeGreaterThan(0);

    const sql = upserts[0].sql;
    expect(sql).toContain('accepted_formats = EXCLUDED.accepted_formats');
    expect(sql).toContain('rules = EXCLUDED.rules');
    // Guard idempotensi harus mempertimbangkan kedua kolom.
    expect(sql).toContain('promo_media_types.rules IS DISTINCT FROM EXCLUDED.rules');
  });

  it('mengirim 14 media dengan rules berisi email kanal social media', async () => {
    await import('../../server/scripts/seed-media-types.mjs');

    const upserts = queries.filter((q) => q.sql.includes('INSERT INTO promo_media_types'));
    expect(upserts.length).toBe(14);

    const withEmail = upserts.filter((q) => String(q.params[8]).includes('marketing@malmetropolitan.com'));
    expect(withEmail.length).toBe(2);   // sosmed-feed + sosmed-story
  });

  it('Digital Poster hanya menerima JPEG (deck: tidak menerima materi lain)', async () => {
    await import('../../server/scripts/seed-media-types.mjs');

    const upserts = queries.filter((q) => q.sql.includes('INSERT INTO promo_media_types'));
    const dp = upserts.find((q) => q.params[0] === 'digital-poster');
    expect(dp).toBeDefined();
    expect(dp.params[5]).toBe('JPEG');
  });
});
