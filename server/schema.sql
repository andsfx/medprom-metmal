/**
 * Skema database: medprom-metmal (platform media promosi tenant).
 * Idempotent (IF NOT EXISTS); eksekusi via scripts/db-migrate.mjs.
 *
 * Tabel:
 *   promo_media_types       : katalog media (admin CRUD; seed dari deck 2026)
 *   promo_submissions       : pengajuan tenant (publik, tanpa login)
 *   promo_submission_files  : versi materi (Data Model: Material File)
 *   promo_submission_history: riwayat perubahan status (Review History)
 *   promo_installations     : catatan pemasangan (Installation Record)
 *   users                   : akun staf (TR/admin/superadmin, bcrypt + JWT)
 *   activity_logs           : jejak aksi staf
 *
 * Status pengajuan memakai 8 nilai PRD §8 (menunggu_review … selesai).
 * Definisi transisinya ada di server/src/lib/statusFlow.js (cermin FE).
 */
CREATE TABLE IF NOT EXISTS promo_media_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('outdoor','indoor','social')),
  name TEXT NOT NULL,
  size_spec TEXT DEFAULT '',
  material_spec TEXT DEFAULT '',
  accepted_formats TEXT DEFAULT '',
  price_note TEXT DEFAULT '',
  location_note TEXT DEFAULT '',
  rules TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pengajuan media promosi oleh tenant (publik, tanpa login).
-- media_type_slug = snapshot teks TANPA FK: media type bisa dinonaktifkan
-- tanpa memutus jejak historis submission (hapus ditolak bila masih dipakai).
-- source_type: 'upload' = file di Google Drive kami (drive_file_id terisi);
-- 'link' = tautan eksternal (Drive/Dropbox/WeTransfer): file_url/file_name/mime_type kosong.
-- tenant_name/unit_number = SNAPSHOT saat submit (PRD §9.2): data MID bisa berubah,
-- jejak historis pengajuan tidak boleh ikut berubah.
-- Kolom file_*/link_url pada baris ini menyimpan VERSI TERBARU; riwayat lengkap
-- tiap versi ada di promo_submission_files.
CREATE TABLE IF NOT EXISTS promo_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_number TEXT DEFAULT '',
  status_token TEXT DEFAULT '',
  media_type_slug TEXT NOT NULL,
  tenant_id TEXT DEFAULT '',
  tenant_name TEXT NOT NULL,
  unit_number TEXT DEFAULT '',
  pic_name TEXT NOT NULL,
  pic_phone TEXT NOT NULL,
  campaign_name TEXT DEFAULT '',
  material_title TEXT DEFAULT '',
  material_description TEXT DEFAULT '',
  material_type TEXT DEFAULT '',
  media_target TEXT DEFAULT '',
  air_start_date TEXT DEFAULT '',
  air_end_date TEXT DEFAULT '',
  installation_date TEXT DEFAULT '',
  terms_accepted BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload','link')),
  file_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  drive_file_id TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'menunggu_review'
    CONSTRAINT promo_submissions_status_chk CHECK (status IN (
      'draft','menunggu_review','perlu_revisi','disetujui','ditolak',
      'siap_dipasang','sudah_dipasang','selesai'
    )),
  status_changed_at TIMESTAMPTZ,
  review_notes TEXT DEFAULT '',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  device_fingerprint TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrasi idempotent untuk DB yang sudah jalan sebelum kolom ini ada.
-- Foto contoh tiap media (diekspor dari deck 2026, hal. 2-14). Kosong = tanpa foto.
ALTER TABLE promo_media_types ADD COLUMN IF NOT EXISTS image_path TEXT DEFAULT '';

ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS link_url TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS drive_file_id TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS submission_number TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS status_token TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS unit_number TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS campaign_name TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS material_title TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS material_description TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS material_type TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS media_target TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS air_start_date TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS air_end_date TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE promo_submissions ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE promo_submissions ALTER COLUMN mime_type DROP NOT NULL;
-- Default lama 'pending' tidak lagi status yang sah; samakan dengan status awal PRD.
ALTER TABLE promo_submissions ALTER COLUMN status SET DEFAULT 'menunggu_review';

-- Status lama (4 nilai) → 8 nilai PRD.
--
-- URUTAN PENTING: CHECK lama hanya mengizinkan 'pending'/'approved'/'rejected'/
-- 'installed', jadi constraint itu WAJIB dilepas SEBELUM baris diremap: kalau
-- tidak, UPDATE pertama langsung melanggar CHECK dan migrasi gagal di DB yang
-- sudah jalan (DB baru tetap hijau, jadi bug-nya hanya muncul di produksi).
--
-- Sasaran dipilih lewat NILAI lama, bukan nama constraint: nama lama bergantung
-- versi skema (`promo_submissions_status_check`), sedangkan definisi CHECK baru
-- tidak memuat satu pun nilai lama: sehingga pada DB baru (yang CHECK-nya sudah
-- benar) blok ini tidak melepas apa pun.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'promo_submissions'::regclass
       AND c.contype = 'c'
  LOOP
    IF con.def ILIKE '%pending%'
       OR con.def ILIKE '%approved%'
       OR con.def ILIKE '%rejected%'
       OR con.def ILIKE '%installed%'
    THEN
      EXECUTE format('ALTER TABLE promo_submissions DROP CONSTRAINT %I', con.conname);
    END IF;
  END LOOP;
END $$;

UPDATE promo_submissions SET status = 'menunggu_review' WHERE status = 'pending';
UPDATE promo_submissions SET status = 'disetujui'       WHERE status = 'approved';
UPDATE promo_submissions SET status = 'ditolak'         WHERE status = 'rejected';
UPDATE promo_submissions SET status = 'sudah_dipasang'  WHERE status = 'installed';

-- Backfill nomor + token pengajuan lama yang belum punya.
-- Token backfill memakai md5 (bukan CSPRNG): hanya untuk baris warisan; semua
-- pengajuan baru memakai crypto.randomBytes (server/src/lib/identifiers.js).
UPDATE promo_submissions
   SET submission_number = 'MP-' || to_char(created_at, 'YYMMDD') || '-' || upper(substr(md5(id::text), 1, 6))
 WHERE submission_number = '' OR submission_number IS NULL;
UPDATE promo_submissions
   SET status_token = md5(id::text || created_at::text || random()::text)
 WHERE status_token = '' OR status_token IS NULL;
UPDATE promo_submissions SET status_changed_at = COALESCE(status_changed_at, updated_at, created_at);

-- Pasang CHECK status yang mendukung 8 nilai (setelah remap di atas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'promo_submissions'::regclass
       AND conname = 'promo_submissions_status_chk'
  ) THEN
    ALTER TABLE promo_submissions ADD CONSTRAINT promo_submissions_status_chk CHECK (status IN (
      'draft','menunggu_review','perlu_revisi','disetujui','ditolak',
      'siap_dipasang','sudah_dipasang','selesai'
    ));
  END IF;
END $$;

-- Alur "media promosi cetak" (rencana: docs/PLAN_2026-09-20_16-00.md).
--
-- Seluruh blok di bawah SENGAJA diletakkan SETELAH blok migrasi status di
-- atas: `__tests__/api/schema-migration.test.js` memakai heuristik
-- `indexOf('DO $$')` untuk mengisolasi blok pelepasan CHECK lama, jadi blok
-- baru yang disisipkan sebelumnya akan membuat potongan itu kabur.

-- Kanal katalog: 'cetak' (Tenant Relations) vs 'digital' (Marcom).
-- Deck memisahkan keduanya lewat blok "Contact Person", BUKAN lewat kategori
-- (kategori deck tetap outdoor/indoor/social: CHECK-nya tidak disentuh).
ALTER TABLE promo_media_types ADD COLUMN IF NOT EXISTS media_channel TEXT NOT NULL DEFAULT 'digital';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'promo_media_types'::regclass
       AND conname = 'promo_media_types_channel_chk'
  ) THEN
    ALTER TABLE promo_media_types
      ADD CONSTRAINT promo_media_types_channel_chk
      CHECK (media_channel IN ('cetak','digital'));
  END IF;
END $$;

-- Harga numerik untuk PPN. `price_note` TETAP: ia teks deck yang ditampilkan
-- verbatim (termasuk tangga tarif multi-baris) dan tidak dapat dijumlahkan.
ALTER TABLE promo_media_types ADD COLUMN IF NOT EXISTS price_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE promo_media_types ADD COLUMN IF NOT EXISTS price_unit   TEXT DEFAULT '';
-- Diturunkan dari teks `rules`: 'Harga belum termasuk PPN.' → false;
-- 'Harga sudah termasuk PPN.' → true.
ALTER TABLE promo_media_types ADD COLUMN IF NOT EXISTS ppn_included BOOLEAN NOT NULL DEFAULT false;

-- Backfill kanal dari slug: kebijakan operasional, bukan klaim deck baru.
-- Pemilik menyebut persis tiga media ini sebagai "media promosi cetak".
UPDATE promo_media_types
   SET media_channel = 'cetak'
 WHERE media_channel <> 'cetak'
   AND slug IN ('spanduk','big-banner','umbul-umbul');

-- Backfill ppn_included dari teks rules (sumber yang sama dengan seed).
UPDATE promo_media_types
   SET ppn_included = true
 WHERE ppn_included = false
   AND rules ILIKE '%harga sudah termasuk ppn%';

-- Pengajuan cetak: jenis pemohon, tanggal, batch, snapshot harga.
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS applicant_type TEXT NOT NULL DEFAULT 'tenant';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS submission_date TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Snapshot harga & pajak (dihitung server, bukan klien). Rincian rumus ada di
-- server/src/lib/pricing.js (cermin src/utils/pricing.ts).
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS price_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS price_unit   TEXT DEFAULT '';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS ppn_included BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS ppn_rate     NUMERIC(6,4) NOT NULL DEFAULT 0;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS quantity     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS subtotal     NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS ppn_amount   NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'promo_submissions'::regclass
       AND conname = 'promo_submissions_applicant_type_chk'
  ) THEN
    ALTER TABLE promo_submissions
      ADD CONSTRAINT promo_submissions_applicant_type_chk
      CHECK (applicant_type IN ('tenant','non_tenant'));
  END IF;
END $$;

-- ── Perluasan CHECK `source_type`: tambah 'none' (pengajuan cetak tidak
-- meminta berkas materi; materi menyusul lewat alur revisi).
--
-- URUTAN PENTING (pitfall #6): CHECK lama hanya mengizinkan 'upload'/'link',
-- jadi constraint itu WAJIB dilepas SEBELUM baris ditulis dengan nilai baru.
-- Sasaran dipilih lewat DEFINISI (bukan nama: nama inline bergantung versi
-- skema), mengikuti pola blok status di atas.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'promo_submissions'::regclass
       AND c.contype = 'c'
  LOOP
    IF con.def ILIKE '%''upload''%'
       AND con.def ILIKE '%''link''%'
       AND con.def NOT ILIKE '%''none''%'
    THEN
      EXECUTE format('ALTER TABLE promo_submissions DROP CONSTRAINT %I', con.conname);
    END IF;
  END LOOP;
END $$;

UPDATE promo_submissions
   SET source_type = 'upload'
 WHERE source_type IS NULL
    OR source_type NOT IN ('upload','link','none');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'promo_submissions'::regclass
       AND conname = 'promo_submissions_source_type_chk'
  ) THEN
    ALTER TABLE promo_submissions
      ADD CONSTRAINT promo_submissions_source_type_chk
      CHECK (source_type IN ('upload','link','none'));
  END IF;
END $$;

-- ── Batch pengajuan cetak: satu kirim form = satu batch; tiap media terpilih
-- = satu baris promo_submissions (single-media, seperti sebelumnya).
-- `batch_id` di promo_submissions SENGAJA tanpa FK: mengikuti pola
-- media_type_slug: jejak historis tidak boleh putus saat baris batch hilang.
CREATE TABLE IF NOT EXISTS promo_submission_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_number TEXT DEFAULT '',
  batch_token TEXT DEFAULT '',
  applicant_type TEXT NOT NULL DEFAULT 'tenant'
    CHECK (applicant_type IN ('tenant','non_tenant')),
  applicant_name TEXT NOT NULL,
  tenant_id TEXT DEFAULT '',
  unit_number TEXT DEFAULT '',
  pic_name TEXT NOT NULL,
  pic_phone TEXT NOT NULL,
  submission_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  device_fingerprint TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bukti tayang: dua kanal. `proof_url` tetap untuk kanal 'link' (data lama
-- utuh); kanal 'upload' menyimpan metadata berkas hasil unggahan staf.
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_kind TEXT NOT NULL DEFAULT 'link';
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_file_id   TEXT DEFAULT '';
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_file_url  TEXT DEFAULT '';
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_file_name TEXT DEFAULT '';
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_mime      TEXT DEFAULT '';
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_size_bytes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_uploaded_by TEXT DEFAULT '';
ALTER TABLE promo_installations ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'promo_installations'::regclass
       AND conname = 'promo_installations_proof_kind_chk'
  ) THEN
    ALTER TABLE promo_installations
      ADD CONSTRAINT promo_installations_proof_kind_chk
      CHECK (proof_kind IN ('link','upload'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_psb_number ON promo_submission_batches (batch_number) WHERE batch_number != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_psb_token  ON promo_submission_batches (batch_token)  WHERE batch_token  != '';
CREATE INDEX IF NOT EXISTS idx_ps_batch ON promo_submissions (batch_id) WHERE batch_id IS NOT NULL;
-- Pengingat: cari periode berakhir pada materi yang statusnya sudah masuk
-- cakupan pengingat (terpasang DAN belum tercatat terpasang).
--
-- Predikat index ini PERNAH berubah (dulu hanya `sudah_dipasang`). `CREATE
-- INDEX IF NOT EXISTS` TIDAK memperbarui index yang sudah ada, jadi pada DB
-- yang sudah jalan index lama yang sempit akan tetap dipakai dan kueri
-- pengingat kehilangan manfaat index (tidak gagal, hanya lambat). Karena itu
-- index dilepas lebih dulu; pasangan DROP/CREATE ini idempotent dan selalu
-- menuju bentuk terbaru.
DROP INDEX IF EXISTS idx_ps_status_airend;
CREATE INDEX IF NOT EXISTS idx_ps_status_airend ON promo_submissions (status, air_end_date)
  WHERE status IN ('sudah_dipasang','disetujui','siap_dipasang');
CREATE INDEX IF NOT EXISTS idx_amt_channel ON promo_media_types (media_channel);

-- ── Integritas harga & durasi pengajuan cetak (D2).
--
-- Route SUDAH menolak durasi kurang dari 7 hari sebelum menulis
-- (`cekDurasiMinimal` di server/src/routes/promo.js), jadi blok ini hanya
-- jaring pengaman untuk baris yang ditulis DI LUAR route - mis. perbaikan
-- manual atau skrip impor.
--
-- Pembebasnya adalah KANAL, bukan nilai durasinya:
--  - baris CETAK (`source_type = 'none'`) WAJIB berdurasi minimal 7 hari;
--  - baris DIGITAL (`upload`/`link`) TIDAK PERNAH mengisi `duration_days`
--    (`POST /promo/submit` tidak menyentuh kolom itu), jadi baris digital sah
--    bernilai 0 dan HARUS tetap lolos.
-- Karena itu bentuknya `source_type <> 'none' OR duration_days >= 7`.
-- JANGAN menulis `duration_days = 0 OR duration_days >= 7`: klausa itu selalu
-- benar untuk SETIAP nilai, sehingga durasi cetak 1-6 hari ikut lolos dan
-- CHECK-nya menjadi vakum.
--
-- NOT VALID itu SENGAJA dan WAJIB: `ADD CONSTRAINT` biasa memvalidasi SELURUH
-- baris yang sudah ada, sehingga satu baris cetak warisan berdurasi < 7 hari
-- akan MENGGAGALKAN `db:migrate` - kegagalan yang hanya muncul di DB produksi,
-- bukan di DB kosong (kelas bug yang sama dengan backfill `source_type` di
-- migrasi sebelumnya).
--
-- BATAS NOT VALID, jangan disalahpahami: ia hanya melewati SCAN AWAL, bukan
-- membebaskan baris itu selamanya. Constraint tetap mengikat setiap
-- INSERT/UPDATE baru, dan UPDATE apa pun pada baris warisan yang melanggar
-- akan DITOLAK Postgres (fail-loud). Jadi baris warisan yang tidak patuh akan
-- menggigit saat staf berikutnya mengubahnya (mis. menaikkan status), bukan
-- diam-diam lolos. Karena itu runbook memuat query deteksi di bawah untuk
-- membersihkan data warisan SEBELUM deploy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'promo_submissions'::regclass
       AND contype = 'c'
       AND conname = 'promo_submissions_duration_days_chk'
  ) THEN
    ALTER TABLE promo_submissions
      ADD CONSTRAINT promo_submissions_duration_days_chk
      CHECK (source_type <> 'none' OR duration_days >= 7) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'promo_submissions'::regclass
       AND contype = 'c'
       AND conname = 'promo_submissions_quantity_chk'
  ) THEN
    ALTER TABLE promo_submissions
      ADD CONSTRAINT promo_submissions_quantity_chk
      CHECK (quantity >= 1) NOT VALID;
  END IF;
END $$;

-- Versi materi (Data Model: Material File). Satu baris per unggahan/revisi;
-- versi terbaru juga dicerminkan pada kolom file_*/link_url promo_submissions.
CREATE TABLE IF NOT EXISTS promo_submission_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES promo_submissions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL DEFAULT 'link' CHECK (source_type IN ('upload','link')),
  file_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  link_url TEXT DEFAULT '',
  drive_file_id TEXT DEFAULT '',
  uploaded_by TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill versi 1 untuk pengajuan lama yang materinya masih hanya tersimpan
-- di kolom promo_submissions.file_url/link_url. Tanpa ini, daftar "Versi materi"
-- di dashboard dan halaman status tampil kosong untuk pengajuan warisan
-- (materinya masih bisa dibuka dari header, tapi riwayat versinya hilang).
-- `WHERE NOT EXISTS` membuat langkah ini idempotent dan tidak menimpa versi
-- yang sudah ada.
--
-- URUTAN/NILAI PENTING (pitfall #6): baris `source_type = 'none'` WAJIB
-- dikecualikan. Pengajuan cetak (`POST /promo/submit-batch`) memang tidak
-- meminta berkas materi dan tidak menulis baris versi apa pun, jadi `'none'`
-- TIDAK PERNAH punya versi materi. Tanpa pengecualian ini, `WHERE NOT EXISTS`
-- selalu benar untuk pengajuan cetak (tidak punya baris file) sehingga backfill
-- menyalin `'none'` ke promo_submission_files.source_type dan `db:migrate`
-- gagal pada CHECK tabel files yang hanya mengizinkan ('upload','link') -
-- kegagalan berulang setiap migrate, dan hanya muncul di DB yang sudah berisi
-- pengajuan cetak (DB baru selalu hijau). Pengecualian ini dipilih daripada
-- melonggarkan CHECK: `promo_submission_files` menyimpan VERSI MATERI, sehingga
-- melonggarkan CHECK akan mengizinkan baris "versi materi" yang tidak bermakna.
INSERT INTO promo_submission_files
  (submission_id, version, source_type, file_url, file_name, mime_type,
   file_size_bytes, link_url, drive_file_id, uploaded_by, notes, created_at)
SELECT s.id, 1, s.source_type, COALESCE(s.file_url, ''), COALESCE(s.file_name, ''),
       COALESCE(s.mime_type, ''), COALESCE(s.file_size_bytes, 0),
       COALESCE(s.link_url, ''), COALESCE(s.drive_file_id, ''),
       'tenant', 'Versi awal (backfill migrasi)', s.created_at
  FROM promo_submissions s
 WHERE s.source_type <> 'none'
   AND NOT EXISTS (
   SELECT 1 FROM promo_submission_files f WHERE f.submission_id = s.id
 );

-- Riwayat perubahan status (Data Model: Review History).
CREATE TABLE IF NOT EXISTS promo_submission_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES promo_submissions(id) ON DELETE CASCADE,
  from_status TEXT DEFAULT '',
  to_status TEXT NOT NULL,
  comment TEXT DEFAULT '',
  actor_type TEXT NOT NULL DEFAULT 'admin' CHECK (actor_type IN ('admin','tenant','system')),
  actor_name TEXT DEFAULT '',
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catatan pemasangan (Data Model: Installation Record).
CREATE TABLE IF NOT EXISTS promo_installations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES promo_submissions(id) ON DELETE CASCADE,
  media_location TEXT NOT NULL,
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  proof_url TEXT DEFAULT '',
  installed_by TEXT DEFAULT '',
  installed_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant_relation' CHECK (role IN ('superadmin','admin','tenant_relation')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- users.role bawaan lama 'viewer' melanggar CHECK-nya sendiri; perbaiki untuk DB
-- yang sudah jalan (kolom default tidak bisa diubah dengan IF NOT EXISTS).
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'tenant_relation';

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT DEFAULT '',
  resource_id TEXT DEFAULT '',
  details JSONB,
  ip_address TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ps_status_created ON promo_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_media_type ON promo_submissions (media_type_slug);
CREATE INDEX IF NOT EXISTS idx_ps_created ON promo_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_fingerprint ON promo_submissions (device_fingerprint) WHERE device_fingerprint != '';
-- Nomor pengajuan & token status harus unik (pencarian tenant memakai keduanya).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_number ON promo_submissions (submission_number) WHERE submission_number != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_token ON promo_submissions (status_token) WHERE status_token != '';
-- Satu objek Drive = satu pengajuan: file tidak bisa diklaim duplikat lintas
-- pengajuan (hapus pengajuan tak akan menghapus file yang masih dipakai baris lain).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_drive_file ON promo_submissions (drive_file_id) WHERE drive_file_id != '';
CREATE INDEX IF NOT EXISTS idx_psf_submission ON promo_submission_files (submission_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_psh_submission ON promo_submission_history (submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pi_submission ON promo_installations (submission_id);
CREATE INDEX IF NOT EXISTS idx_amt_sort ON promo_media_types (sort_order);
CREATE INDEX IF NOT EXISTS idx_amt_category ON promo_media_types (category);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
