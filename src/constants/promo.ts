/** Label status & kategori pengajuan — satu sumber untuk publik + admin. */

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  installed: 'Terpasang',
};

export const CATEGORY_LABELS: Record<string, string> = {
  outdoor: 'Outdoor',
  indoor: 'Indoor',
  social: 'Media Sosial',
};

export const CATEGORY_ORDER: string[] = ['outdoor', 'indoor', 'social'];

/**
 * Mode unggah file ke Drive mall — jalur LEGACY.
 *
 * Kanonis adalah link-only: tenant mengirim tautan penyimpanannya sendiri dan
 * admin memverifikasi manual. Mode unggah dipertahankan sementara di balik flag
 * agar data legacy tetap bisa diproses; jangan nyalakan untuk pengajuan baru.
 * Aktifkan hanya bila VITE_PROMO_UPLOAD_MODE='1' (masa transisi).
 *
 * Fungsi (bukan konstanta) supaya test bisa `vi.stubEnv` per-kasus.
 */
export function isUploadModeEnabled(): boolean {
  return (import.meta.env.VITE_PROMO_UPLOAD_MODE as string | undefined) === '1';
}

/** Kap ukuran file FE — sinkron server MAX_UPLOAD_BYTES (50MB). Hanya relevan
 *  selama mode unggah aktif. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Mime → label tampilan. */
export const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
  'video/mp4': 'MP4',
};
