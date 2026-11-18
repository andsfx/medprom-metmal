/**
 * Lencana status pengajuan - satu tempat untuk seluruh produk.
 *
 * Dunia "Daftar Kerja Seluler" membaca keadaan pekerjaan sebagai PIL netral,
 * bukan cap miring: latar lembut, teks sewarna, tanpa bingkai tebal. Warnanya
 * satu-satunya sinyal makna. Tujuh nada (keputusan MIGRATION.md W2 opsi B):
 * menunggu biru, perlu revisi amber, disetujui hijau, siap dipasang teal,
 * sudah dipasang ungu, selesai netral, ditolak merah.
 *
 * Dipakai halaman status, status batch, riwayat, detail pengajuan, dan
 * konsol staf supaya bentuknya tidak pernah menyimpang antar layar.
 */
import { STATUS_LABELS } from '../../constants/promo';

export type StampTone = 'ok' | 'rev' | 'no' | 'wait' | 'siap' | 'pasang' | 'done';

/** Nada lencana per status. Menunggu = biru; siap/pasang/done punya nadanya
 * sendiri (keputusan MIGRATION.md W2 opsi B), tidak lagi menumpang hijau. */
const TONE_BY_STATUS: Record<string, StampTone> = {
  draft: 'wait',
  menunggu_review: 'wait',
  perlu_revisi: 'rev',
  disetujui: 'ok',
  ditolak: 'no',
  siap_dipasang: 'siap',
  sudah_dipasang: 'pasang',
  selesai: 'done',
};

export function stampTone(status: string): StampTone {
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
