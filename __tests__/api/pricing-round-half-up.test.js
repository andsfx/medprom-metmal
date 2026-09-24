/**
 * Test pembulatan half-up sejati pada cermin harga (D1).
 *
 * Kontrak rapuh yang dikunci:
 *  - `round2` membulatkan setengah KE ATAS pada skala sen, termasuk nilai
 *    .xx5 yang representasi float-nya sedikit di bawah .5 (mis. 10.075);
 *  - cermin FE (`src/utils/pricing.ts`) dan BE (`server/src/lib/pricing.js`)
 *    tetap IDENTIK untuk seluruh kasus batas.
 *
 * Perbaikan: `n + Number.EPSILON` diganti `Math.round((n * 100) + 1e-9) / 100`.
 * Sebelum perbaikan, `round2(10.075)` bernilai 10.07 (turun), sehingga mall
 * kurang 1 sen per baris ber-harga-sen.
 */
import { describe, it, expect } from 'vitest';

import * as fe from '../../src/utils/pricing';
import * as be from '../../server/src/lib/pricing.js';

/** Kasus batas .xx5 dan kontrol non-batas. */
const KASUS = [
  [10.075, 10.08],
  [10.065, 10.07],
  [10.085, 10.09],
  [1.005, 1.01],
  [0.005, 0.01],
  [10.074, 10.07],
  [10.076, 10.08],
  [123.456, 123.46],
  [1234567.891, 1234567.89],
  [543900, 543900],
  [0, 0],
];

describe('round2 half-up sejati (D1)', () => {
  it('membulatkan setengah ke atas pada skala sen', () => {
    for (const [masukan, harapan] of KASUS) {
      expect(fe.round2(masukan), `FE round2(${masukan})`).toBe(harapan);
      expect(be.round2(masukan), `BE round2(${masukan})`).toBe(harapan);
    }
  });

  it('PPN atas subtotal 171,5 adalah 18,87 (bukan 18,86)', () => {
    const ppn = fe.round2(171.5 * fe.PPN_RATE);
    expect(ppn).toBe(18.87);
    expect(be.round2(171.5 * be.PPN_RATE)).toBe(18.87);
  });

  it('cermin FE dan BE tetap identik untuk seluruh kasus batas', () => {
    for (const [masukan] of KASUS) {
      expect(fe.round2(masukan), `round2(${masukan})`).toBe(be.round2(masukan));
    }
  });

  it('nilai tak terhingga / bukan angka menjadi 0', () => {
    for (const buruk of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(fe.round2(buruk)).toBe(0);
      expect(be.round2(buruk)).toBe(0);
    }
  });
});
