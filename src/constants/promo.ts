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

/** Kap ukuran file FE — sinkron server MAX_UPLOAD_BYTES (50MB). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Mime → label tampilan. */
export const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
  'video/mp4': 'MP4',
};
