/** Label status & kategori pengajuan - satu sumber untuk publik + admin. */

/**
 * Label 8 status PRD §8. Urutannya mengikuti alur kerja (bukan alfabetis) agar
 * bisa dipakai langsung untuk dropdown filter dan ringkasan dashboard.
 */
export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  menunggu_review: 'Menunggu Review',
  perlu_revisi: 'Perlu Revisi',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  siap_dipasang: 'Siap Dipasang',
  sudah_dipasang: 'Sudah Dipasang',
  selesai: 'Selesai',
};

/** Urutan tampilan status pada filter & ringkasan dashboard. */
export const STATUS_ORDER: string[] = [
  'menunggu_review',
  'perlu_revisi',
  'disetujui',
  'siap_dipasang',
  'sudah_dipasang',
  'ditolak',
  'selesai',
];

export const CATEGORY_LABELS: Record<string, string> = {
  outdoor: 'Outdoor',
  indoor: 'Indoor',
  social: 'Media Sosial',
};

export const CATEGORY_ORDER: string[] = ['outdoor', 'indoor', 'social'];

/**
 * Kanal katalog - dipisahkan deck lewat blok "Contact Person", BUKAN kategori.
 * Kategori tetap outdoor/indoor/social (CHECK keras di DB).
 */
export const CHANNEL_LABELS: Record<string, string> = {
  cetak: 'Media Promosi Cetak',
  digital: 'Media Promosi Digital',
};

/** Jenis pemohon pada form cetak (tenant maupun non-tenant boleh mengajukan). */
export const APPLICANT_TYPE_LABELS: Record<string, string> = {
  tenant: 'Tenant',
  non_tenant: 'Non-tenant',
};

/** Batas jumlah media dalam satu pengajuan cetak - cermin server MAX_BATCH_ITEMS. */
export const MAX_BATCH_ITEMS = 10;

/** Jenis materi (field form PRD §9.3) - nilai disimpan apa adanya. */
export const MATERIAL_TYPES: string[] = [
  'Promosi',
  'Event',
  'Seasonal Campaign',
  'Lainnya',
];

/**
 * Kanal unggah berkas ke Drive mall.
 *
 * PRD menetapkan unggah berkas sebagai salah satu kanal materi (FR-008..FR-015),
 * berdampingan dengan kanal tautan (kanonis). Karena itu kanal unggah
 * **menyala secara bawaan**; `VITE_PROMO_UPLOAD_MODE='0'` adalah saklar
 * opt-out untuk instance yang belum punya kredensial Google Drive - pada
 * instance seperti itu server menolak bersih dengan 503 (fail-closed,
 * lihat `driveReady` di server/src/drive.js), jadi lebih baik tombolnya tidak
 * ditampilkan sama sekali.
 *
 * Fungsi (bukan konstanta) supaya test bisa `vi.stubEnv` per-kasus.
 */
export function isUploadModeEnabled(): boolean {
  return (import.meta.env.VITE_PROMO_UPLOAD_MODE as string | undefined) !== '0';
}

/** Kap ukuran file FE - sinkron server MAX_UPLOAD_BYTES (50MB). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Mime → label tampilan. */
export const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
  'video/mp4': 'MP4',
};
