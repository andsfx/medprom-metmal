/**
 * Util WhatsApp — normalisasi nomor PIC ke format `wa.me`.
 *
 * Kenapa perlu: validator server (`PHONE_RE`) dan wizard sama-sama menerima
 * spasi, tanda hubung, dan awalan `0` — placeholder wizard pun mengajarkan
 * "08xx xxxx xxxx". `wa.me` hanya menerima digit dengan kode negara, jadi
 * `wa.me/0812-3456-7890` gagal untuk setiap pengajuan yang mengikuti format
 * yang diterima form. Normalizer ini menjembatani keduanya.
 */
import { STATUS_LABELS } from '../constants/promo';

/** Buang semua non-digit, lalu ubah awalan Indonesia → kode negara 62. */
export function toWaNumber(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  // Kode negara lain (mis. 65 Singapura) — teruskan apa adanya.
  return digits;
}

/**
 * Bangun tautan `wa.me` dengan pesan siap kirim.
 * Mengembalikan `null` bila nomor tidak ada / terlalu pendek — pemanggil
 * menyembunyikan atau menonaktifkan tombol, bukan merender tautan rusak.
 */
export function waLink(raw: string | null | undefined, text = ''): string | null {
  const number = toWaNumber(raw);
  if (!number || number.length < 9) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${number}${query}`;
}

/** Tautan WhatsApp untuk meneruskan status pengajuan ke PIC tenant. */
export function submissionWaLink(input: {
  pic_phone: string;
  tenant_name: string;
  media_type_slug: string;
  status: string;
  review_notes?: string;
}): string | null {
  // Label dari satu sumber (src/constants/promo) — jangan duplikasi daftar
  // status di sini: saat status bertambah, peta lokal akan diam-diam basi dan
  // pesan WA menampilkan kunci mentah (mis. "menunggu_review").
  const lines = [
    `Halo ${input.tenant_name},`,
    `Pengajuan media promosi (${input.media_type_slug}) berstatus: ${STATUS_LABELS[input.status] ?? input.status}.`,
  ];
  if (input.review_notes) lines.push(`Catatan Tenant Relations: ${input.review_notes}`);
  lines.push('Terima kasih. Tenant Relations Metropolitan Mall Bekasi');
  return waLink(input.pic_phone, lines.join('\n'));
}
