/**
 * Lencana status pengajuan - satu tempat untuk seluruh produk.
 *
 * Dunia "Daftar Kerja Seluler" membaca keadaan pekerjaan sebagai PIL netral,
 * bukan cap miring: latar lembut, teks sewarna, tanpa bingkai tebal. Warnanya
 * satu-satunya sinyal makna (disetujui hijau, perlu revisi amber, ditolak
 * merah, sisanya tinta), dan itu disengaja - dunia ini akromatik kecuali
 * keadaan pekerjaan.
 *
 * Dipakai halaman status, status batch, riwayat, detail pengajuan, dan
 * konsol staf supaya bentuknya tidak pernah menyimpang antar layar.
 */
import { STATUS_LABELS } from '../../constants/promo';

/** Nada lencana per status. Menunggu/diproses = tinta; hasil akhir berwarna. */
const TONE_BY_STATUS: Record<string, 'ok' | 'rev' | 'no' | 'wait'> = {
  draft: 'wait',
  menunggu_review: 'wait',
  perlu_revisi: 'rev',
  disetujui: 'ok',
  ditolak: 'no',
  siap_dipasang: 'ok',
  sudah_dipasang: 'ok',
  selesai: 'ok',
};

export function stampTone(status: string): 'ok' | 'rev' | 'no' | 'wait' {
  return TONE_BY_STATUS[String(status ?? '')] ?? 'wait';
}

export default function Stamp({ status, className = '' }: { status: string; className?: string }) {
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`ui-tag ui-stamp ${className}`} data-tone={stampTone(status)}>
      {label}
    </span>
  );
}
