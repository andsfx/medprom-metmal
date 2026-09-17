/** Tipe domain promo — bentuk row API (snake_case) + bentuk FE (camelCase). */

export interface PromoMediaType {
  slug: string;
  category: 'outdoor' | 'indoor' | 'social';
  name: string;
  size_spec: string;
  material_spec: string;
  accepted_formats: string;
  /** Path foto contoh media ('/media/<slug>.webp'); '' = tanpa foto. */
  image_path: string;
  price_note: string;
  location_note: string;
  rules: string;
  sort_order: number;
  /** Hanya di admin list (GET /admin/media-types). */
  id?: string;
  is_active?: boolean;
}

export interface TenantOption {
  id: string;
  name: string;
  floor: string;
  lot: string;
  category: string;
}

/**
 * Payload pengajuan. Dua mode sumber materi (keduanya kanal resmi PRD):
 *   'upload' → drive_file_id terisi (file di Google Drive kami; nama/mime/size
 *              diambil server dari metadata Drive, bukan klaim klien)
 *   'link'   → link_url terisi (Google Drive/Dropbox/WeTransfer milik tenant)
 */
export interface PromoSubmissionPayload {
  media_type_slug: string;
  tenant_id: string;
  tenant_name: string;
  unit_number: string;
  pic_name: string;
  pic_phone: string;
  campaign_name: string;
  material_title: string;
  material_description: string;
  material_type: string;
  media_target: string;
  air_start_date: string;
  air_end_date: string;
  installation_date: string;
  terms_accepted: boolean;
  notes: string;
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  link_url: string;
  device_fingerprint: string;
}

/** Satu versi materi pengajuan (tabel promo_submission_files). */
export interface SubmissionFileRow {
  id: string;
  submission_id: string;
  version: number;
  source_type: 'upload' | 'link';
  file_url: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  link_url: string;
  drive_file_id: string;
  uploaded_by: string;
  notes: string;
  created_at: string;
}

/** Satu baris riwayat status (tabel promo_submission_history). */
export interface SubmissionHistoryRow {
  id: string;
  submission_id: string;
  from_status: string;
  to_status: string;
  comment: string;
  actor_type: 'admin' | 'tenant' | 'system';
  actor_name: string;
  actor_id: string | null;
  created_at: string;
}

/** Catatan pemasangan (tabel promo_installations). */
export interface InstallationRow {
  id: string;
  submission_id: string;
  media_location: string;
  start_date: string;
  end_date: string;
  notes: string;
  proof_url: string;
  installed_by: string;
  installed_by_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pengajuan seperti yang dilihat tenant lewat token status (FR-019..FR-022).
 * Sengaja tanpa fingerprint/IP — halaman status publik tidak boleh membocorkan
 * metadata internal.
 */
export interface StatusPageData {
  submission: MySubmissionRow;
  history: SubmissionHistoryRow[];
  files: SubmissionFileRow[];
  installation: InstallationRow | null;
}

export interface MySubmissionRow {
  id: string;
  submission_number: string;
  /** Hanya terisi pada /promo/submissions/mine (akses digerbangi fingerprint). */
  status_token?: string;
  media_type_slug: string;
  tenant_name: string;
  unit_number: string;
  material_title: string;
  material_description: string;
  campaign_name: string;
  material_type: string;
  media_target: string;
  air_start_date: string;
  air_end_date: string;
  installation_date: string;
  notes: string;
  status: string;
  review_notes: string;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
  source_type: 'upload' | 'link';
  file_url: string;
  file_name: string;
  link_url: string;
}

export interface AdminSubmissionRow {
  id: string;
  submission_number: string;
  status_token: string;
  media_type_slug: string;
  tenant_id: string;
  tenant_name: string;
  unit_number: string;
  pic_name: string;
  pic_phone: string;
  campaign_name: string;
  material_title: string;
  material_description: string;
  material_type: string;
  media_target: string;
  air_start_date: string;
  air_end_date: string;
  installation_date: string;
  terms_accepted: boolean;
  notes: string;
  source_type: 'upload' | 'link';
  file_url: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  drive_file_id: string;
  link_url: string;
  status: string;
  status_changed_at: string | null;
  review_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  device_fingerprint: string;
  ip_address: string;
  created_at: string;
  updated_at: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
}
