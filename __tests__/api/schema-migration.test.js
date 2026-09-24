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

/**
 * Perluasan CHECK `source_type` (tambah 'none' untuk pengajuan cetak) mengulang
 * pitfall #6 yang sama: CHECK lama hanya mengizinkan 'upload'/'link', jadi ia
 * WAJIB dilepas sebelum baris ditulis dengan nilai baru. Urutan ini dikunci di
 * sini karena kegagalannya hanya muncul di DB yang sudah jalan.
 */
describe('schema.sql — urutan migrasi source_type', () => {
  /** Potongan blok perluasan (mulai dari komentar penandanya). */
  const blok = sql.slice(
    sql.indexOf('-- ── Perluasan CHECK `source_type`'),
    sql.indexOf('-- ── Batch pengajuan cetak'),
  );

  it('blok perluasan source_type ada dan ditulis setelah blok status', () => {
    expect(blok.length).toBeGreaterThan(0);
    // Heuristik indexOf('DO $$') milik test status harus tetap menunjuk blok
    // status: blok baru berada SETELAH-nya.
    expect(sql.indexOf('-- ── Perluasan CHECK `source_type`'))
      .toBeGreaterThan(sql.indexOf('SET status_token = md5('));
  });

  it('CHECK lama dilepas sebelum baris diremap', () => {
    const drop = blok.indexOf('DROP CONSTRAINT');
    const remap = blok.indexOf('SET source_type = ');
    expect(drop).toBeGreaterThan(-1);
    expect(remap).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(remap);
  });

  it('CHECK baru dipasang setelah remap', () => {
    const addChk = blok.indexOf('ADD CONSTRAINT promo_submissions_source_type_chk');
    const remap = blok.indexOf('SET source_type = ');
    expect(addChk).toBeGreaterThan(-1);
    expect(addChk).toBeGreaterThan(remap);
  });

  it('melepas CHECK lama lewat DEFINISI, bukan nama constraint', () => {
    expect(blok).toContain('pg_get_constraintdef');
    expect(blok).toMatch(/contype = 'c'/);
    for (const nilai of ["%''upload''%", "%''link''%", "%''none''%"]) {
      expect(blok).toContain(nilai);
    }
  });

  it('CHECK baru mengizinkan upload, link, dan none', () => {
    const addIdx = blok.indexOf('ADD CONSTRAINT promo_submissions_source_type_chk');
    const def = blok.slice(addIdx, addIdx + 300);
    for (const nilai of ['upload', 'link', 'none']) {
      expect(def).toContain(`'${nilai}'`);
    }
  });
});

/**
 * Kelas bug yang sama (pitfall #6) pada tabel VERSI MATERI.
 *
 * Pengajuan cetak menulis `promo_submissions.source_type = 'none'` tanpa baris
 * `promo_submission_files` (materi menyusul lewat revisi). Backfill versi materi
 * memakai `WHERE NOT EXISTS` yang selalu benar untuk pengajuan cetak, sehingga
 * ia menyalin `'none'` ke `promo_submission_files.source_type` dan `db:migrate`
 * gagal pada CHECK tabel files yang hanya mengizinkan ('upload','link') - gagal
 * BERULANG tiap migrate, dan hanya di DB yang sudah berisi pengajuan cetak.
 *
 * Perbaikan yang benar: KECUALIKAN `'none'` dari backfill (pengajuan tanpa
 * materi memang tidak punya versi materi), BUKAN melonggarkan CHECK tabel files.
 * Test ini mengunci keduanya agar tidak ada yang "memperbaiki" dengan
 * melonggarkan CHECK.
 */
describe('schema.sql — backfill versi materi melewati pengajuan tanpa materi', () => {
  /** Potongan blok backfill: dari INSERT sampai `);` penutupnya. */
  function blokBackfill() {
    const start = sql.indexOf('INSERT INTO promo_submission_files');
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf(');', start);
    expect(end).toBeGreaterThan(start);
    return sql.slice(start, end + 2);
  }

  /** Potongan definisi tabel promo_submission_files (sampai penutup tabelnya). */
  function blokTabelFiles() {
    const start = sql.indexOf('CREATE TABLE IF NOT EXISTS promo_submission_files');
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf(');', start);
    expect(end).toBeGreaterThan(start);
    return sql.slice(start, end + 2);
  }

  it('backfill memuat pengecualian source_type = none', () => {
    const backfill = blokBackfill();
    // idempotensi tetap dipertahankan
    expect(backfill).toContain('NOT EXISTS');
    // pengecualian 'none' (boleh `<>` atau `!=`)
    expect(backfill).toMatch(/source_type\s*(<>|!=)\s*'none'/);
  });

  it('backfill tidak menyalin nilai source_type dari pengajuan cetak', () => {
    // Tanpa pengecualian, SELECT menyalin s.source_type apa adanya termasuk
    // 'none' - pelanggaran CHECK tabel files.
    const backfill = blokBackfill();
    expect(backfill).toMatch(/s\.source_type/);
    expect(backfill).toMatch(/source_type\s*(<>|!=)\s*'none'/);
  });

  it('CHECK promo_submission_files tetap hanya upload dan link', () => {
    const tabel = blokTabelFiles();
    expect(tabel).toContain("('upload','link')");
    // 'none' tidak boleh masuk ke CHECK tabel files: baris versi materi untuk
    // pengajuan tanpa materi memang tidak bermakna.
    expect(tabel).not.toContain("'none'");
  });
});

/**
 * Integritas harga & durasi pengajuan cetak (D2).
 *
 * Jebakannya: `duration_days` adalah kolom BERSAMA dengan alur digital, yang
 * tidak pernah mengisinya sehingga baris digital sah bernilai 0. CHECK durasi
 * TANPA syarat akan menolak baris digital yang sah dan `db:migrate` gagal di
 * DB yang sudah berisi pengajuan digital - kegagalan yang hanya muncul di
 * produksi, bukan di DB kosong.
 */
describe('schema.sql - CHECK durasi & kuantitas pengajuan cetak', () => {
  function blokDurasi() {
    const start = sql.indexOf('-- ── Integritas harga & durasi pengajuan cetak');
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf('-- Versi materi (Data Model: Material File)', start);
    expect(end).toBeGreaterThan(start);
    return sql.slice(start, end);
  }

  /** Ekspresi CHECK durasi apa adanya dari skema. */
  function ekspresiDurasi() {
    const blok = blokDurasi();
    const m = blok.match(/CHECK\s*\(([^)]*duration_days[^)]*)\)/);
    expect(m, 'CHECK durasi tidak ditemukan di blok').not.toBeNull();
    return m ? m[1] : '';
  }

  /**
   * Evaluator predikat CHECK durasi yang dibaca dari SKEMA, bukan disalin.
   *
   * Mendukung `A OR B` dua suku dengan `source_type <> 'none'` dan
   * `duration_days >= N`. Dipakai untuk membuktikan CHECK-nya benar-benar
   * MENGIKAT baris cetak sekaligus MEMBEBASKAN baris digital - sifat yang
   * tidak dapat dibuktikan oleh pencocokan teks biasa.
   */
  function evaluatorDurasi() {
    const expr = ekspresiDurasi();
    const bebasKanal = /source_type\s*<>\s*'none'/.test(expr);
    const minMatch = expr.match(/duration_days\s*>=\s*(\d+)/);
    expect(bebasKanal, 'pembebas harus lewat kanal (source_type <> none)').toBe(true);
    expect(minMatch, 'ambang durasi minimal tidak ditemukan').not.toBeNull();
    const min = minMatch ? Number(minMatch[1]) : 7;
    return (sourceType, durationDays) => (bebasKanal && sourceType !== 'none' ? true : durationDays >= min);
  }

  it('durasi di bawah 7 hari ditolak untuk baris cetak', () => {
    const blok = blokDurasi();
    expect(blok).toContain('promo_submissions_duration_days_chk');
    expect(blok).toMatch(/duration_days\s*>=\s*7/);
  });

  it('CHECK durasi TIDAK vakum: durasi cetak 1-6 hari harus GAGAL', () => {
    // Jebakan nyata: `duration_days = 0 OR duration_days >= 7` selalu BENAR
    // untuk setiap nilai, sehingga CHECK-nya tidak mengikat apa pun dan
    // durasi cetak 3 hari ikut lolos. Bentuk yang benar membebaskan lewat
    // KANAL (`source_type <> 'none'`), bukan lewat nilai durasinya.
    const expr = ekspresiDurasi();
    expect(expr).toMatch(/source_type\s*<>\s*'none'/);
    expect(expr).not.toMatch(/duration_days\s*=\s*0/);
  });

  it('semantik predikat: cetak wajib >= 7 hari, digital (durasi 0) tetap lolos', () => {
    const cek = evaluatorDurasi();
    // Baris CETAK: durasi 1-6 ditolak, 0 ditolak, 7 ke atas diterima.
    expect(cek('none', 0)).toBe(false);
    expect(cek('none', 1)).toBe(false);
    expect(cek('none', 3)).toBe(false);
    expect(cek('none', 6)).toBe(false);
    expect(cek('none', 7)).toBe(true);
    expect(cek('none', 30)).toBe(true);
    // Baris DIGITAL: `duration_days` memang tidak pernah diisi (0) dan wajib
    // tetap lolos, termasuk nilai lain yang mungkin berasal dari data lama.
    expect(cek('upload', 0)).toBe(true);
    expect(cek('link', 0)).toBe(true);
    expect(cek('upload', 3)).toBe(true);
  });

  it('CHECK durasi dipasang idempotent (dijaga pg_constraint)', () => {
    const blok = blokDurasi();
    expect(blok).toContain('pg_constraint');
    expect(blok).toMatch(/contype\s*=\s*'c'/);
    expect(blok).toContain('promo_submissions_duration_days_chk');
  });

  it('kuantitas minimal 1 ditegakkan', () => {
    const blok = blokDurasi();
    expect(blok).toContain('promo_submissions_quantity_chk');
    expect(blok).toMatch(/quantity\s*>=\s*1/);
  });

  it('kedua CHECK dipasang NOT VALID agar migrasi tidak gagal pada data lama', () => {
    // `ADD CONSTRAINT` tanpa NOT VALID memvalidasi SELURUH baris lama; satu
    // baris cetak warisan berdurasi < 7 akan menggagalkan `db:migrate` hanya
    // di DB produksi. NOT VALID menjaga constraint tetap MENGIKAT baris baru
    // tanpa memvalidasi ulang baris lama.
    const blok = blokDurasi();
    // Setiap ADD CONSTRAINT di blok ini harus diakhiri NOT VALID.
    const addConstraints = blok.match(/ADD CONSTRAINT[\s\S]*?;/g) || [];
    expect(addConstraints).toHaveLength(2);
    for (const c of addConstraints) {
      expect(c).toMatch(/NOT VALID\s*;/);
    }
    // Keduanya tetap memasang CHECK (bukan hanya nama).
    for (const c of addConstraints) {
      expect(c).toContain('CHECK (');
    }
  });

  it('blok integritas ditulis SETELAH blok migrasi status (heuristik DO $$)', () => {
    // `indexOf('DO $$')` milik test status harus tetap menunjuk blok status.
    expect(sql.indexOf('-- ── Integritas harga & durasi pengajuan cetak'))
      .toBeGreaterThan(sql.indexOf('SET status_token = md5('));
  });
});

/**
 * Index pengingat berpredikat parsial dan predikatnya PERNAH berubah (dulu
 * hanya `sudah_dipasang`, kini tiga status). `CREATE INDEX IF NOT EXISTS`
 * TIDAK memperbarui index lama, sehingga tanpa DROP lebih dulu DB produksi
 * akan tetap memakai index sempit - tidak gagal, hanya kehilangan manfaat
 * index. Test ini mengunci pasangan DROP/CREATE-nya.
 */
describe('schema.sql - index pengingat diperbarui saat predikat berubah', () => {
  it('idx_ps_status_airend dilepas sebelum dibuat ulang', () => {
    const drop = sql.indexOf('DROP INDEX IF EXISTS idx_ps_status_airend');
    const create = sql.indexOf('CREATE INDEX IF NOT EXISTS idx_ps_status_airend');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(create);
  });

  it('index pengingat mencakup ketiga status', () => {
    const start = sql.indexOf('CREATE INDEX IF NOT EXISTS idx_ps_status_airend');
    const blok = sql.slice(start, start + 250);
    expect(blok).toContain('sudah_dipasang');
    expect(blok).toContain('disetujui');
    expect(blok).toContain('siap_dipasang');
  });
});
