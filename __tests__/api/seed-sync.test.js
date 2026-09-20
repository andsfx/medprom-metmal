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
  it('upsert menyelaraskan SELURUH kolom yang dikelola seed', async () => {
    await import('../../server/scripts/seed-media-types.mjs');

    const upserts = queries.filter((q) => q.sql.includes('INSERT INTO promo_media_types'));
    expect(upserts.length).toBeGreaterThan(0);

    const sql = upserts[0].sql;
    // Setiap kolom yang dikelola seed harus ikut disinkronkan, bukan hanya
    // sebagian: koreksi harga/lokasi/ketentuan dari deck harus sampai ke
    // instance yang sudah jalan. Daftar ini sengaja lengkap supaya kolom baru
    // yang lupa ditambahkan ke ON CONFLICT langsung ketahuan.
    const KOLOM = [
      'category', 'name', 'size_spec', 'material_spec', 'accepted_formats',
      'price_note', 'location_note', 'rules', 'is_active', 'sort_order',
      // Kanal cetak/digital + harga numerik untuk PPN (alur media cetak).
      'media_channel', 'price_amount', 'price_unit', 'ppn_included',
    ];
    for (const kolom of KOLOM) {
      expect(sql, `${kolom} harus diset dari EXCLUDED`).toContain(`${kolom} = EXCLUDED.${kolom}`);
      expect(sql, `${kolom} harus ikut penjaga idempotensi`).toContain(`promo_media_types.${kolom}`);
    }

    // image_path sengaja BUKAN penimpaan biasa: foto hasil unggahan staf tidak
    // boleh dikembalikan ke foto bawaan deck setiap seed dijalankan. Hanya
    // `--reset-gambar` (parameter $13) yang boleh menimpanya.
    expect(sql, 'image_path wajib kondisional pada flag reset').toContain('CASE WHEN $13 THEN EXCLUDED.image_path');
  });

  it('tanpa --reset-gambar, image_path tidak ikut penjaga idempotensi', async () => {
    await import('../../server/scripts/seed-media-types.mjs');
    const sql = queries.find((q) => q.sql.includes('INSERT INTO promo_media_types')).sql;
    // Kolom image_path tidak boleh muncul di daftar perbandingan baris, karena
    // itu akan membuat foto unggahan dianggap "berbeda" lalu ditimpa.
    const where = sql.slice(sql.indexOf('WHERE (promo_media_types.category'));
    const daftarBanding = where.slice(0, where.indexOf('IS DISTINCT FROM'));
    expect(daftarBanding).not.toContain('image_path');
    // Flag reset juga harus jadi parameter terakhir yang dikirim.
    expect(queries.find((q) => q.sql.includes('INSERT INTO promo_media_types')).params[12]).toBe(false);
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
