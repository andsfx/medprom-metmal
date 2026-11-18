/** Tipe domain promo - bentuk row API (snake_case) + bentuk FE (camelCase). */

export interface PromoMediaType {
  slug: string;
  category: 'outdoor' | 'indoor' | 'social';
  name: string;
  size_spec: string;
  material_spec: string;
  accepted_formats: string;
  /** Path foto contoh media ('/media/<slug>.webp'); '' = tanpa foto. */
  image_path: string;
  /** Teks harga deck (verbatim, bisa multi-baris) - hanya untuk tampilan. */
  price_note: string;
  /** Kanal katalog: 'cetak' (Tenant Relations) atau 'digital' (Marcom). */
  media_channel?: 'cetak' | 'digital';
  /** Harga numerik (per unit) untuk perhitungan PPN; 0 bila tanpa harga. */
  price_amount?: number;
  /** Satuan harga numerik (mis. 'hari', 'hari/16 tiang'). */
  price_unit?: string;
  /** true bila harga di katalog SUDAH termasuk PPN. */
  ppn_included?: boolean;
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
  /** Kanal bukti tayang: tautan (kolom proof_url) atau unggahan berkas. */
  proof_kind?: 'link' | 'upload';
  proof_file_id?: string;
  proof_file_url?: string;
  proof_file_name?: string;
  proof_mime?: string;
  proof_size_bytes?: number;
  proof_uploaded_by?: string;
  proof_uploaded_at?: string | null;
  installed_by: string;
  installed_by_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pengajuan seperti yang dilihat tenant lewat token status (FR-019..FR-022).
 * Sengaja tanpa fingerprint/IP - halaman status publik tidak boleh membocorkan
 * metadata internal.
 */
export interface StatusPageData {
  submission: MySubmissionRow;
  history: SubmissionHistoryRow[];
  files: SubmissionFileRow[];
  installation: InstallationRow | null;
  /**
   * Apakah perangkat pemanggil adalah perangkat yang mengirim pengajuan.
   * Dihitung DI SERVER (boolean saja; `device_fingerprint` mentah tidak pernah
   * dikirim ke klien). Dipakai halaman untuk menyembunyikan form revisi dari
   * perangkat yang tidak berhak; penegakan sebenarnya tetap di server.
   * `undefined` (pemanggil lama) diperlakukan sebagai "bukan pemilik".
   */
  is_owner?: boolean;
}

export interface MySubmissionRow {
  id: string;
  submission_number: string;
  /** Hanya terisi pada /promo/submissions/mine (akses digerbangi fingerprint). */
  status_token?: string;
  media_type_slug: string;
  /** Foto contoh media dari katalog; terisi pada /promo/submissions/mine. */
  image_path?: string;
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
  source_type: 'upload' | 'link' | 'none';
  file_url: string;
  file_name: string;
  link_url: string;
  /** Jenis pemohon pengajuan cetak. */
  applicant_type?: 'tenant' | 'non_tenant';
  /** Tanggal pengajuan (form cetak); '' bila tidak diisi. */
  submission_date?: string;
  /** Batch pengajuan cetak (satu kirim berisi beberapa media). */
  batch_id?: string | null;
  /**
   * Nomor batch induk (`MPB-YYMMDD-XXXXXX`).
   * Hanya terisi pada `/promo/submissions/mine`; kosong pada jalur publik lain.
   */
  batch_number?: string | null;
  /**
   * Token batch induk - dipakai menaut ke `/batch/<batch_token>`.
   * Hanya terisi pada `/promo/submissions/mine`, di batas kepercayaan yang
   * sama dengan `status_token` (akses digerbangi fingerprint perangkat).
   */
  batch_token?: string | null;
  /**
   * Jumlah SELURUH media dalam batch induk, dihitung server pada
   * `/promo/submissions/mine` lewat subquery yang tidak dibatasi `LIMIT 50`.
   * Angka ini yang dipakai UI, bukan hitungan baris yang termuat, supaya
   * label "N media dalam kiriman ini" tidak undercount saat daftar pengajuan
   * per perangkat terpotong limit.
   */
  batch_item_count?: number | null;
  price_amount?: number;
  price_unit?: string;
  ppn_included?: boolean;
  ppn_rate?: number;
  quantity?: number;
  duration_days?: number;
  subtotal?: number;
  ppn_amount?: number;
  total_amount?: number;
  /**
   * Bukti pembayaran pajak (media cetak ber-PPN). Hanya terisi bila admin
   * menyalakan fiturnya dan bukti sudah diunggah. `tax_proof_file_url` adalah
   * tautan Drive yang bisa dibuka.
   */
  tax_proof_file_url?: string;
  tax_proof_file_name?: string;
  tax_proof_mime?: string;
  tax_proof_uploaded_at?: string | null;
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
  source_type: 'upload' | 'link' | 'none';
  file_url: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  drive_file_id: string;
  link_url: string;
  applicant_type?: 'tenant' | 'non_tenant';
  submission_date?: string;
  batch_id?: string | null;
  batch_number?: string | null;
  price_amount?: number;
  price_unit?: string;
  ppn_included?: boolean;
  ppn_rate?: number;
  quantity?: number;
  duration_days?: number;
  subtotal?: number;
  ppn_amount?: number;
  total_amount?: number;
  /** Bukti pembayaran pajak (media cetak ber-PPN). */
  tax_proof_file_url?: string;
  tax_proof_file_name?: string;
  tax_proof_mime?: string;
  tax_proof_uploaded_at?: string | null;
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

// ─── Batch pengajuan cetak ──────────────────────────────────────

/** Satu item dalam hasil submit batch (snapshot harga dihitung server). */
export interface BatchSubmitItem {
  id: string;
  submission_number: string;
  status_token: string;
  media_type_slug: string;
  status: string;
  subtotal: number;
  ppn_amount: number;
  total_amount: number;
}

/** Hasil POST /promo/submit-batch. */
export interface BatchSubmitResult {
  batch_id: string;
  batch_number: string;
  batch_token: string;
  applicant_type: string;
  created_at: string;
  items: BatchSubmitItem[];
}

/** Ringkasan batch (tanpa fingerprint/IP). */
export interface BatchRow {
  id: string;
  batch_number: string;
  /**
   * Token batch - terisi pada respons pelacakan/status batch (dipakai
   * mengarahkan ke `/batch/<batch_token>`), opsional bila jalur tidak
   * mengirimkannya.
   */
  batch_token?: string;
  applicant_type: 'tenant' | 'non_tenant';
  applicant_name: string;
  unit_number: string;
  submission_date: string;
  notes: string;
  created_at: string;
}

/** Data halaman status batch (publik). */
export interface BatchStatusData {
  batch: BatchRow;
  items: StatusPageData[];
}

/** Baris pengingat periode berakhir (dashboard staf). */
export interface ReminderRow {
  id: string;
  submission_number: string;
  tenant_name: string;
  /** Telepon PIC - untuk tombol "Ingatkan via WhatsApp". */
  pic_phone: string;
  applicant_type: 'tenant' | 'non_tenant';
  media_type_slug: string;
  status: string;
  air_end_date: string;
  end_date: string;
  days_left: number | null;
  /**
   * Kategori pengingat: 'terpasang' (sudah dicatat terpasang) atau
   * 'belum_terpasang' (Disetujui / Siap Dipasang). Pengajuan berstatus belum
   * terpasang yang periodenya habis tanpa pernah dicatat pemasangannya tetap
   * perlu diingatkan. Opsional: pemanggil lama tanpa kolom ini diperlakukan
   * sebagai 'terpasang'.
   */
  category?: 'terpasang' | 'belum_terpasang';
  ppn_amount: number;
  total_amount: number;
}

export interface RemindersData {
  days: number;
  overdue: number;
  due_soon: number;
  /** Jumlah item yang belum tercatat terpasang (kategori 'belum_terpasang'). */
  belum_terpasang?: number;
  items: ReminderRow[];
}
