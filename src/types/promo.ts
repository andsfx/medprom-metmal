/** Tipe domain promo — bentuk row API (snake_case) + bentuk FE (camelCase). */

export interface PromoMediaType {
  slug: string;
  category: 'outdoor' | 'indoor' | 'social';
  name: string;
  size_spec: string;
  material_spec: string;
  accepted_formats: string;
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
 * Payload pengajuan. Dua mode sumber materi:
 *   'upload' → drive_file_id terisi (file di Google Drive kami; nama/mime/size
 *              diambil server dari metadata Drive, bukan klaim klien)
 *   'link'   → link_url terisi (Google Drive/Dropbox/WeTransfer milik tenant)
 */
export interface PromoSubmissionPayload {
  media_type_slug: string;
  tenant_id: string;
  tenant_name: string;
  pic_name: string;
  pic_phone: string;
  installation_date: string;
  notes: string;
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  link_url: string;
  device_fingerprint: string;
}

export interface MySubmissionRow {
  id: string;
  media_type_slug: string;
  status: string;
  review_notes: string;
  created_at: string;
  source_type: 'upload' | 'link';
  file_url: string;
  file_name: string;
  link_url: string;
}

export interface AdminSubmissionRow {
  id: string;
  media_type_slug: string;
  tenant_id: string;
  tenant_name: string;
  pic_name: string;
  pic_phone: string;
  installation_date: string;
  notes: string;
  source_type: 'upload' | 'link';
  file_url: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  drive_file_id: string;
  link_url: string;
  status: string;
  review_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  device_fingerprint: string;
  ip_address: string;
  created_at: string;
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
