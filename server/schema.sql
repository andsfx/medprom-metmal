/**
 * Skema database — medprom-metmal (platform media promosi tenant).
 * Idempotent (IF NOT EXISTS); eksekusi via scripts/db-migrate.mjs.
 *
 * Tabel:
 *   promo_media_types  — katalog media (admin CRUD; seed dari deck 2026)
 *   promo_submissions  — pengajuan tenant (publik, tanpa login)
 *   users              — akun staf (TR/admin/superadmin, bcrypt + JWT)
 *   activity_logs      — jejak aksi staf
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
-- source_type: 'upload' = file di R2 kita; 'link' = tautan eksternal
-- (Google Drive/Dropbox/WeTransfer) — file_url/file_name/mime_type kosong.
CREATE TABLE IF NOT EXISTS promo_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  media_type_slug TEXT NOT NULL,
  tenant_id TEXT DEFAULT '',
  tenant_name TEXT NOT NULL,
  pic_name TEXT NOT NULL,
  pic_phone TEXT NOT NULL,
  installation_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload','link')),
  file_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','installed')),
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
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE promo_submissions ADD COLUMN IF NOT EXISTS link_url TEXT DEFAULT '';
ALTER TABLE promo_submissions ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE promo_submissions ALTER COLUMN mime_type DROP NOT NULL;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('superadmin','admin','tenant_relation')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

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
CREATE INDEX IF NOT EXISTS idx_amt_sort ON promo_media_types (sort_order);
CREATE INDEX IF NOT EXISTS idx_amt_category ON promo_media_types (category);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
