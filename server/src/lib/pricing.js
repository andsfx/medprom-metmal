/**
 * Perhitungan harga & PPN pengajuan media promosi cetak - CERMIN dari
 * src/utils/pricing.ts (jaga keduanya sinkron; dikunci
 * __tests__/api/cetak-pricing.test.js).
 *
 * Konteks tarif: permintaan pemilik adalah **PPN 11%**. Regulasi Indonesia
 * sejak 2025 memakai tarif PPN 12% dengan DPP Nilai Lain 11/12 untuk
 * barang/jasa non-mewah, sehingga beban efektifnya tepat 11%. Karena itu
 * konstanta di sini adalah tarif EFEKTIF - jangan "perbaiki" menjadi 12% tanpa
 * mengubah pemisahan DPP di kedua sisi.
 *
 * Aturan yang ditegakkan (keputusan pemilik, docs/PLAN_2026-09-20_16-00.md):
 *   - minimal sewa pemasangan media promosi cetak = 7 hari;
 *   - `subtotal = price_amount × quantity × duration_days`;
 *   - bila `ppn_included` false → `ppn_amount = subtotal × rate`,
 *     `total = subtotal + ppn_amount`;
 *   - pembulatan 2 desimal (NUMERIC(14,2)).
 */

/** Tarif PPN efektif. Lihat catatan konteks di atas. */
export const PPN_RATE = 0.11;

/** Minimal durasi sewa media promosi cetak (deck: "minimal 1 minggu (7 hari)"). */
export const MIN_DURATION_DAYS = 7;

/** Ambang pengingat periode berakhir (hari) - query turunan dashboard. */
export const REMINDER_DAYS = 14;

/** Bulatkan ke 2 desimal seperti NUMERIC(14,2) - hindari galat floating point. */
export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Hitung jumlah hari sewa inklusif antara dua tanggal YYYY-MM-DD.
 * Mengembalikan 0 bila salah satu tidak valid atau `end < start`.
 */
export function durationDays(startIso, endIso) {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Hitung subtotal, PPN, dan total satu baris pengajuan.
 *
 * @param {{priceAmount:number, ppnIncluded:boolean, quantity?:number, durationDays?:number, rate?:number}} input
 * @returns {{subtotal:number, ppnAmount:number, totalAmount:number, rate:number}}
 */
export function hitungHarga({
  priceAmount,
  ppnIncluded,
  quantity = 1,
  durationDays: dur = 0,
  rate = PPN_RATE,
}) {
  const harga = Number(priceAmount) || 0;
  const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
  const hari = Math.max(0, Math.trunc(Number(dur) || 0));
  const tarif = Number(rate);

  const subtotal = round2(harga * qty * hari);

  if (ppnIncluded) {
    // Harga sudah termasuk PPN: pajak adalah PORSI di dalam subtotal.
    const ppnAmount = round2(subtotal - subtotal / (1 + tarif));
    return { subtotal, ppnAmount, totalAmount: subtotal, rate: tarif };
  }

  const ppnAmount = round2(subtotal * tarif);
  return { subtotal, ppnAmount, totalAmount: round2(subtotal + ppnAmount), rate: tarif };
}

/**
 * Validasi durasi sewa terhadap minimal deck.
 * @returns {{ok:boolean, message:string, durationDays:number}}
 */
export function cekDurasiMinimal(startIso, endIso, minimum = MIN_DURATION_DAYS) {
  const dur = durationDays(startIso, endIso);
  if (!dur) {
    return { ok: false, message: 'Periode pemasangan tidak valid. Isi tanggal mulai dan tanggal selesai.', durationDays: 0 };
  }
  if (dur < minimum) {
    return {
      ok: false,
      message: `Minimal sewa pemasangan media promosi cetak adalah ${minimum} hari (periode terisi ${dur} hari).`,
      durationDays: dur,
    };
  }
  return { ok: true, message: '', durationDays: dur };
}

/**
 * Sisa hari sampai periode berakhir, dihitung dari `todayIso`.
 * `null` bila tanggal tidak valid. Negatif = sudah lewat.
 */
export function daysUntil(endIso, todayIso) {
  const end = parseIso(endIso);
  const today = parseIso(todayIso);
  if (!end || !today) return null;
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}
