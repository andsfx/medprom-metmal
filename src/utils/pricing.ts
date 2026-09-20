/**
 * Perhitungan harga & PPN pengajuan media promosi cetak - CERMIN dari
 * server/src/lib/pricing.js (duplikasi disengaja; proyek tanpa paket bersama).
 * Kesamaannya dikunci __tests__/api/cetak-pricing.test.js.
 *
 * Konteks tarif: permintaan pemilik adalah **PPN 11%**. Regulasi Indonesia
 * sejak 2025 memakai tarif PPN 12% dengan DPP Nilai Lain 11/12 untuk
 * barang/jasa non-mewah, sehingga beban efektifnya tepat 11%. Konstanta di
 * sini adalah tarif EFEKTIF.
 */

/** Tarif PPN efektif. */
export const PPN_RATE = 0.11;

/** Minimal durasi sewa media promosi cetak (deck: "minimal 1 minggu (7 hari)"). */
export const MIN_DURATION_DAYS = 7;

/** Ambang pengingat periode berakhir (hari). */
export const REMINDER_DAYS = 14;

/** Bulatkan ke 2 desimal seperti NUMERIC(14,2). */
export function round2(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Jumlah hari sewa inklusif antara dua tanggal YYYY-MM-DD; 0 bila tidak valid. */
export function durationDays(startIso: string, endIso: string): number {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface HargaInput {
  priceAmount: number;
  ppnIncluded: boolean;
  quantity?: number;
  durationDays?: number;
  rate?: number;
}

export interface HargaHasil {
  subtotal: number;
  ppnAmount: number;
  totalAmount: number;
  rate: number;
}

/** Hitung subtotal, PPN, dan total satu baris pengajuan. */
export function hitungHarga({
  priceAmount,
  ppnIncluded,
  quantity = 1,
  durationDays: dur = 0,
  rate = PPN_RATE,
}: HargaInput): HargaHasil {
  const harga = Number(priceAmount) || 0;
  const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
  const hari = Math.max(0, Math.trunc(Number(dur) || 0));
  const tarif = Number(rate);

  const subtotal = round2(harga * qty * hari);

  if (ppnIncluded) {
    const ppnAmount = round2(subtotal - subtotal / (1 + tarif));
    return { subtotal, ppnAmount, totalAmount: subtotal, rate: tarif };
  }

  const ppnAmount = round2(subtotal * tarif);
  return { subtotal, ppnAmount, totalAmount: round2(subtotal + ppnAmount), rate: tarif };
}

export interface CekDurasiHasil {
  ok: boolean;
  message: string;
  durationDays: number;
}

/** Validasi durasi sewa terhadap minimal deck. */
export function cekDurasiMinimal(
  startIso: string,
  endIso: string,
  minimum = MIN_DURATION_DAYS,
): CekDurasiHasil {
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

/** Sisa hari sampai periode berakhir; `null` bila tanggal tidak valid. */
export function daysUntil(endIso: string, todayIso: string): number | null {
  const end = parseIso(endIso);
  const today = parseIso(todayIso);
  if (!end || !today) return null;
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}
