/**
 * Modul harga cetak FE ≡ server.
 *
 * `src/utils/pricing.ts` dan `server/src/lib/pricing.js` sengaja diduplikasi
 * (proyek tanpa paket bersama). Test ini mengimpor KEDUANYA dan meng-assert
 * keluaran yang identik untuk seluruh rentang kasus, meniru pola
 * `lead-time.test.js` dan `status-flow.test.js`. Menyimpang = test gagal.
 */
import { describe, it, expect } from 'vitest';
import * as fe from '../../src/utils/pricing';
import * as be from '../../server/src/lib/pricing.js';

const KONSTANTA = ['PPN_RATE', 'MIN_DURATION_DAYS', 'REMINDER_DAYS'];
const FUNGSI = ['round2', 'durationDays', 'hitungHarga', 'cekDurasiMinimal', 'daysUntil'];

const KASUS_HARGA = [
  { priceAmount: 70000, ppnIncluded: false, quantity: 1, durationDays: 7 },
  { priceAmount: 70000, ppnIncluded: false, quantity: 1, durationDays: 30 },
  { priceAmount: 160000, ppnIncluded: false, quantity: 2, durationDays: 7 },
  { priceAmount: 288000, ppnIncluded: false, quantity: 1, durationDays: 14 },
  { priceAmount: 600000, ppnIncluded: true, quantity: 1, durationDays: 7 },
  { priceAmount: 0, ppnIncluded: false, quantity: 1, durationDays: 7 },
  { priceAmount: 70000, ppnIncluded: false, quantity: 1, durationDays: 0 },
  { priceAmount: 123456.78, ppnIncluded: false, quantity: 3, durationDays: 11 },
];

const KASUS_TANGGAL = [
  ['2026-10-01', '2026-10-07'],
  ['2026-10-01', '2026-10-01'],
  ['2026-10-31', '2026-10-01'],
  ['2026-02-27', '2026-03-02'],
  ['', '2026-10-01'],
  ['12/09/2026', '2026-10-01'],
];

describe('pricing FE ≡ server', () => {
  it('konstanta sama persis', () => {
    for (const k of KONSTANTA) {
      expect(fe[k], k).toBe(be[k]);
    }
  });

  it('mengekspor fungsi yang sama', () => {
    for (const f of FUNGSI) {
      expect(typeof fe[f], `FE ${f}`).toBe('function');
      expect(typeof be[f], `BE ${f}`).toBe('function');
    }
  });

  it('PPN efektif adalah 11% (keputusan pemilik)', () => {
    expect(fe.PPN_RATE).toBe(0.11);
    expect(be.PPN_RATE).toBe(0.11);
  });

  it('round2 sepakat untuk berbagai nilai', () => {
    for (const v of [0, 0.005, 1.005, 123.456, 543900, 1234567.891, -1.005]) {
      expect(fe.round2(v), `round2(${v})`).toBe(be.round2(v));
    }
  });

  it('durationDays sepakat (inklusif, tanggal cacat → 0)', () => {
    for (const [a, b] of KASUS_TANGGAL) {
      expect(fe.durationDays(a, b), `durationDays(${a},${b})`).toBe(be.durationDays(a, b));
    }
  });

  it('hitungHarga sepakat untuk seluruh kasus', () => {
    for (const kasus of KASUS_HARGA) {
      const hasilFe = fe.hitungHarga(kasus);
      const hasilBe = be.hitungHarga(kasus);
      expect(hasilFe, JSON.stringify(kasus)).toEqual(hasilBe);
    }
  });

  it('cekDurasiMinimal sepakat, termasuk pesannya', () => {
    for (const [a, b] of KASUS_TANGGAL) {
      const hasilFe = fe.cekDurasiMinimal(a, b);
      const hasilBe = be.cekDurasiMinimal(a, b);
      expect(hasilFe, `cekDurasiMinimal(${a},${b})`).toEqual(hasilBe);
    }
  });

  it('daysUntil sepakat, termasuk null', () => {
    const kasus = [
      ['2026-10-10', '2026-10-01'],
      ['2026-10-01', '2026-10-01'],
      ['2026-09-01', '2026-10-01'],
      ['', '2026-10-01'],
    ];
    for (const [e, t] of kasus) {
      expect(fe.daysUntil(e, t), `daysUntil(${e},${t})`).toBe(be.daysUntil(e, t));
    }
  });
});

describe('perhitungan PPN — nilai konkret', () => {
  it('spanduk 7 hari: subtotal 490.000, PPN 53.900, total 543.900', () => {
    const h = fe.hitungHarga({ priceAmount: 70000, ppnIncluded: false, durationDays: 7 });
    expect(h).toEqual({ subtotal: 490000, ppnAmount: 53900, totalAmount: 543900, rate: 0.11 });
  });

  it('umbul-umbul 30 hari: PPN dihitung di atas subtotal, bukan per hari', () => {
    const h = fe.hitungHarga({ priceAmount: 288000, ppnIncluded: false, durationDays: 30 });
    expect(h.subtotal).toBe(8640000);
    expect(h.ppnAmount).toBe(950400);
    expect(h.totalAmount).toBe(9590400);
  });

  it('harga sudah termasuk PPN: pajak adalah porsi di dalam subtotal', () => {
    const h = fe.hitungHarga({ priceAmount: 600000, ppnIncluded: true, durationDays: 7 });
    expect(h.subtotal).toBe(4200000);
    // 4.200.000 − 4.200.000/1,11 = 416.216,22 (2 desimal).
    expect(h.ppnAmount).toBe(416216.22);
    expect(h.totalAmount).toBe(4200000);
  });

  it('durasi di bawah 7 hari ditolak dengan pesan Indonesia', () => {
    const cek = fe.cekDurasiMinimal('2026-10-01', '2026-10-05');
    expect(cek.ok).toBe(false);
    expect(cek.durationDays).toBe(5);
    expect(cek.message).toMatch(/Minimal sewa.*7 hari/);
  });

  it('periode 7 hari inklusif diterima', () => {
    const cek = fe.cekDurasiMinimal('2026-10-01', '2026-10-07');
    expect(cek.ok).toBe(true);
    expect(cek.durationDays).toBe(7);
  });
});
