/**
 * Kontrak urutan migrasi status pada server/schema.sql.
 *
 * Latar: CHECK lama (`pending`/`approved`/`rejected`/`installed`) menolak nilai
 * PRD yang baru. Bila baris diremap SEBELUM CHECK dilepas, `db:migrate` gagal di
 * setiap DB yang sudah jalan (constraint violation) — dan DB baru tetap hijau,
 * jadi bug ini hanya muncul di produksi. Test ini mengunci urutannya.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'server/schema.sql'), 'utf8');

/** Posisi kemunculan pertama `needle` di schema (atau -1). */
function at(needle) {
  return sql.indexOf(needle);
}

describe('schema.sql — urutan migrasi status', () => {
  it('CHECK status dilepas sebelum baris status diremap', () => {
    const drop = at('DROP CONSTRAINT');
    const remap = at("SET status = 'menunggu_review' WHERE status = 'pending'");
    expect(drop).toBeGreaterThan(-1);
    expect(remap).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(remap);
  });

  it('CHECK 8 nilai dipasang setelah remap dan backfill selesai', () => {
    const addChk = at('ADD CONSTRAINT promo_submissions_status_chk');
    const remap = at("SET status = 'menunggu_review' WHERE status = 'pending'");
    const tokenBackfill = at('SET status_token = md5(');
    expect(addChk).toBeGreaterThan(-1);
    expect(addChk).toBeGreaterThan(remap);
    expect(addChk).toBeGreaterThan(tokenBackfill);
  });

  it('melepas CHECK lama tanpa bergantung pada nama constraint', () => {
    // Nama constraint lama bergantung versi skema — pencarian berbasis nama
    // spesifik akan melewatkannya dan remap tetap melanggar CHECK.
    expect(sql).toContain('pg_get_constraintdef');
    expect(sql).toContain('ILIKE');
    expect(sql).toMatch(/contype = 'c'/);
  });

  it('menyasar CHECK lama lewat NILAI lama, bukan sekadar kolom status', () => {
    // Definisi CHECK baru tidak memuat nilai lama, sehingga pada DB baru
    // (CHECK sudah benar) blok pelepasan tidak melepas apa pun.
    const dropBlock = sql.slice(
      sql.indexOf('DO $$'),
      sql.indexOf("SET status = 'menunggu_review' WHERE status = 'pending'"),
    );
    for (const legacy of ['pending', 'approved', 'rejected', 'installed']) {
      expect(dropBlock).toContain(`%${legacy}%`);
    }
  });

  it('mendukung seluruh 8 status PRD pada CHECK baru', () => {
    const addIdx = at('ADD CONSTRAINT promo_submissions_status_chk');
    const block = sql.slice(addIdx, addIdx + 400);
    for (const s of [
      'draft', 'menunggu_review', 'perlu_revisi', 'disetujui', 'ditolak',
      'siap_dipasang', 'sudah_dipasang', 'selesai',
    ]) {
      expect(block).toContain(`'${s}'`);
    }
  });

  it('membuat tabel data model PRD (file, riwayat, pemasangan)', () => {
    for (const table of ['promo_submission_files', 'promo_submission_history', 'promo_installations']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    // Nomor + token unik (dipakai pencarian tenant).
    expect(sql).toContain('idx_ps_number');
    expect(sql).toContain('idx_ps_token');
  });

  it('default role users tidak melanggar CHECK-nya sendiri', () => {
    // Sebelumnya DEFAULT 'viewer' tidak ada di daftar role.
    expect(sql).toContain("ALTER COLUMN role SET DEFAULT 'tenant_relation'");
    expect(sql).not.toMatch(/role TEXT NOT NULL DEFAULT 'viewer'/);
  });
});
