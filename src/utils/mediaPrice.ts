/**
 * Harga katalog deck - satu sumber untuk landing dan kedua wizard.
 *
 * Katalog deck TIDAK seragam, dan menyimpulkannya dari satu kolom saja adalah
 * kesalahan yang mahal: hanya 3 dari 14 media punya `price_amount` terstruktur,
 * sementara sisanya menyatakan harga atau status gratis di `price_note` -
 * termasuk `Gratis (syarat: tenant baru atau peserta program promo)` untuk LED
 * Banner dan `Rp. 6.700.000,-/sisi/bulan` untuk Sticker Eskalator.
 * Menyimpulkan "tidak ada `price_amount`" = "tidak ada harga" akan menampilkan
 * LED Banner sebagai "Hubungi Marcom" dan menghapus label "Gratis" dari empat
 * media lain.
 *
 * `price_note` juga sering memuat TANGGA TARIF multi-baris (Videotron 4 baris,
 * Sticker Lift 2 baris dengan keterangan sisi), jadi ia **wajib** dipisah per
 * `\n` dan setiap baris dipertahankan verbatim - termasuk format "Rp." bertitik
 * dan spasi aslinya. Menggabungkannya jadi satu baris membuat dua tarif
 * berdurasi berbeda terbaca sebagai satu kalimat panjang tanpa jangkar.
 */
import type { PromoMediaType } from '../types/promo';

export type PriceKind = 'money' | 'text';

/** Baris tarif deck, apa adanya. Kosong bila media tidak menyatakan tarif. */
export function priceLadder(media: PromoMediaType): string[] {
  return (media.price_note || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Harga cadangan saat `price_note` kosong: nominal terstruktur, lalu kanal. */
export function fallbackPrice(media: PromoMediaType): { text: string; kind: PriceKind } {
  if (typeof media.price_amount === 'number' && media.price_amount > 0) {
    return { text: `Rp ${media.price_amount.toLocaleString('id-ID')}`, kind: 'money' };
  }
  return {
    text: media.media_channel === 'cetak' ? 'Hubungi TR' : 'Hubungi Marcom',
    kind: 'text',
  };
}

export type MediaPrice =
  | { mode: 'single'; text: string; kind: PriceKind; unit: string | null }
  | { mode: 'ladder'; lines: string[] };

/**
 * Bentuk harga yang siap dirender.
 *
 * PENTING: "tangga" hanya untuk **dua baris atau lebih**. Satu baris panjang
 * ("Gratis (syarat: tenant baru atau peserta program promo)") tetap `single` —
 * CSS `.ui-row-num[data-kind='text']` yang menurunkannya ke barisnya sendiri.
 * Mengarahkannya ke cabang tangga membuatnya menjadi `<div>` di samping nama,
 * yang (a) tidak lagi dikenali `:has()` sehingga kepala baris tetap flex, dan
 * (b) memepetkan nama sampai satu huruf per baris.
 */
export function mediaPrice(media: PromoMediaType): MediaPrice {
  const ladder = priceLadder(media);
  if (ladder.length === 0) {
    const f = fallbackPrice(media);
    return { mode: 'single', text: f.text, kind: f.kind, unit: null };
  }
  const first = ladder[0];
  if (ladder.length === 1 && first !== undefined) {
    return { mode: 'single', text: first, kind: /^Rp\b/i.test(first) ? 'money' : 'text', unit: null };
  }
  return { mode: 'ladder', lines: ladder };
}

/**
 * Tangga tarif multi-baris dirender dengan bentuk berbeda menurut isinya:
 * baris berlabel ("Bulanan Rp. 35.000.000,-") jadi dua kolom supaya nominal
 * berbagai durasi sejajar dan bisa dibandingkan sekilas; baris tanpa label
 * ("Rp. 600.000,-/hari") dibiarkan satu baris, karena sufiksnya berbeda lebar
 * dan memaksanya dua kolom hanya membuat nominal menggantung tanpa jangkar.
 */
export function pecahBarisTarif(line: string): { label: string | null; nominal: string } {
  const at = line.indexOf('Rp.');
  if (at > 0) return { label: line.slice(0, at).trim(), nominal: line.slice(at) };
  return { label: null, nominal: line };
}
