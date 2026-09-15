/**
 * Kontrak: aturan lead time harus identik antara FE (src/utils/leadTime.ts) dan
 * server (server/src/lib/leadTime.js). Duplikasi ini disengaja (tanpa dependensi
 * bersama), jadi test ini yang menjaganya tidak menyimpang.
 */
import { describe, it, expect } from 'vitest';
import * as fe from '../../src/utils/leadTime';
import * as be from '../../server/src/lib/leadTime.js';

// Teks verbatim deck 2026 (lihat server/scripts/seed-media-types.mjs).
const RULES = {
  spanduk: 'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.',
  'boom-gate': 'Media promosi akan dipasang dan dibongkar oleh pihak tenant dengan berkoordinasi dengan pihak Mall 3 hari kerja sebelum pemasangan.',
  videotron: 'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
  sosmed: 'Mengirimkan materi promosi diluar hari dan jam kerja akan di respon sesuai dengan ketersediaan admin.',
};

describe('lead time FE ≡ server', () => {
  it('parseLeadTime menghasilkan aturan sama untuk seluruh aturan deck', () => {
    for (const rules of Object.values(RULES)) {
      expect(be.parseLeadTime(rules)).toEqual(fe.parseLeadTime(rules));
    }
  });

  it('earliestInstallationDate menghasilkan tanggal sama (kalender & hari kerja)', () => {
    for (const from of ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']) {
      for (const rules of Object.values(RULES)) {
        const feLead = fe.parseLeadTime(rules);
        const beLead = be.parseLeadTime(rules);
        expect(be.earliestInstallationDate(from, beLead))
          .toBe(fe.earliestInstallationDate(from, feLead));
      }
    }
  });

  it('checkInstallationDate sepakat soal lolos/tolak dan pesannya', () => {
    for (const rules of Object.values(RULES)) {
      for (const date of ['2026-09-11', '2026-09-13', '2026-09-16', '']) {
        const a = fe.checkInstallationDate(date, rules, '2026-09-11');
        const b = be.checkInstallationDate(date, rules, '2026-09-11');
        expect(b.ok).toBe(a.ok);
        expect(b.message).toBe(a.message);
        expect(b.earliest).toBe(a.earliest);
      }
    }
  });

  it('toIsoDate sepakat', () => {
    const d = new Date(2026, 8, 15);
    expect(be.toIsoDate(d)).toBe(fe.toIsoDate(d));
  });

  it('parseMaterialEmail sepakat (email deck social media)', () => {
    const rules = 'Materi juga dapat dikirim via email ke marketing@malmetropolitan.com.';
    expect(be.parseMaterialEmail(rules)).toBe(fe.parseMaterialEmail(rules));
    expect(fe.parseMaterialEmail(rules)).toBe('marketing@malmetropolitan.com');
    const noEmail = 'Harga belum termasuk PPN.';
    expect(be.parseMaterialEmail(noEmail)).toBe(fe.parseMaterialEmail(noEmail));
  });
});
