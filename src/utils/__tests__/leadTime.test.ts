import { describe, it, expect } from 'vitest';
import {
  parseLeadTime, earliestInstallationDate, checkInstallationDate, describeLeadTime, parseMaterialEmail,
} from '../leadTime';

// Teks verbatim dari server/scripts/seed-media-types.mjs — parse harus cocok
// dengan aturan deck, bukan asumsi "outdoor = 2, indoor = 3".
const RULES_SPANDUK = [
  'Harga belum termasuk PPN.',
  'Minimal sewa pemasangan media promosi outdoor yakni 1 minggu (7 hari) dan dapat diperpanjang sesuai dengan kebutuhan.',
  'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.',
  'Pengambilan materi media promosi maksimal 3 hari setelah pencopotan.',
].join('\n');

const RULES_BOOM_GATE = [
  'Pemasangan dilakukan oleh Tenant.',
  'Media promosi akan dipasang dan dibongkar oleh pihak tenant dengan berkoordinasi dengan pihak Mall 3 hari kerja sebelum pemasangan.',
].join('\n');

const RULES_VIDEOTRON = [
  'Harga sudah termasuk PPN.',
  'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
  'Pemasangan dan pembongkaran hanya pada hari kerja.',
].join('\n');

const RULES_SOSMED = [
  'Menyebutkan detail lokasi Lantai tenant dengan detail pada caption.',
  'Mohon mengirimkan materi promosi pada hari dan jam kerja.',
].join('\n');

const RULES_LED_BANNER = [
  'Periode pemasangan ditentukan oleh Mall. Tenant diperkenankan request tanggal namun mall tidak menerima komplain.',
].join('\n');

describe('parseLeadTime — aturan asli deck', () => {
  it('spanduk: 2 hari kalender (bukan hari kerja)', () => {
    expect(parseLeadTime(RULES_SPANDUK)).toEqual({ days: 2, businessDays: false });
  });

  it('boom-gate: outdoor tapi 3 hari KERJA', () => {
    expect(parseLeadTime(RULES_BOOM_GATE)).toEqual({ days: 3, businessDays: true });
  });

  it('videotron: 3 hari kerja, tidak tertipu frasa "hari kerja" tanpa angka', () => {
    expect(parseLeadTime(RULES_VIDEOTRON)).toEqual({ days: 3, businessDays: true });
  });

  it('sosmed: tanpa lead time', () => {
    expect(parseLeadTime(RULES_SOSMED)).toBeNull();
  });

  it('led-banner: tanpa lead time', () => {
    expect(parseLeadTime(RULES_LED_BANNER)).toBeNull();
  });

  it('tidak tertipu "3 hari setelah pencopotan"', () => {
    expect(parseLeadTime('Pengambilan materi maksimal 3 hari setelah pencopotan.')).toBeNull();
  });

  it('tidak tertipu "1 minggu (7 hari)" tanpa frasa sebelum pemasangan', () => {
    expect(parseLeadTime('Minimal sewa yakni 1 minggu (7 hari).')).toBeNull();
  });

  it('teks kosong → null', () => {
    expect(parseLeadTime('')).toBeNull();
  });
});

describe('earliestInstallationDate', () => {
  it('hari kalender: maju persis N hari (termasuk akhir pekan)', () => {
    // Jumat 2026-09-11 + 2 hari kalender → Minggu 2026-09-13.
    expect(earliestInstallationDate('2026-09-11', { days: 2, businessDays: false }))
      .toBe('2026-09-13');
  });

  it('hari kerja: melompati Sabtu/Minggu', () => {
    // Kamis 2026-09-10 + 3 hari kerja → Selasa 2026-09-15 (Jumat=1, Sen=2, Sel=3).
    expect(earliestInstallationDate('2026-09-10', { days: 3, businessDays: true }))
      .toBe('2026-09-15');
  });

  it('hari kerja: mulai Jumat, melompati akhir pekan', () => {
    // Jumat 2026-09-11 + 1 hari kerja → Senin 2026-09-14.
    expect(earliestInstallationDate('2026-09-11', { days: 1, businessDays: true }))
      .toBe('2026-09-14');
  });

  it('tanpa aturan → tanggal acuan', () => {
    expect(earliestInstallationDate('2026-09-11', null)).toBe('2026-09-11');
  });
});

describe('checkInstallationDate', () => {
  it('menolak tanggal lebih awal dari batas, pesan menyebut tanggal & aturan', () => {
    const r = checkInstallationDate('2026-09-12', RULES_SPANDUK, '2026-09-11');
    expect(r.ok).toBe(false);
    expect(r.earliest).toBe('2026-09-13');
    expect(r.message).toMatch(/terlalu dekat/);
    expect(r.message).toMatch(/2026-09-13/);
  });

  it('menerima tepat di batas', () => {
    expect(checkInstallationDate('2026-09-13', RULES_SPANDUK, '2026-09-11').ok).toBe(true);
  });

  it('hari kerja: tanggal yang jatuh di akhir pekan tetap ditolak bila terlalu dekat', () => {
    const r = checkInstallationDate('2026-09-14', RULES_BOOM_GATE, '2026-09-11');
    expect(r.ok).toBe(false);
    expect(r.earliest).toBe('2026-09-16');
  });

  it('media tanpa lead time: tanggal apa pun setelah acuan diterima', () => {
    expect(checkInstallationDate('2026-09-11', RULES_SOSMED, '2026-09-11').ok).toBe(true);
  });

  it('tanggal kosong (opsional) dianggap lolos', () => {
    const r = checkInstallationDate('', RULES_SPANDUK, '2026-09-11');
    expect(r.ok).toBe(true);
    expect(r.message).toBe('');
  });

  it('menolak format tanggal tidak valid', () => {
    expect(checkInstallationDate('12/09/2026', RULES_SPANDUK, '2026-09-11').ok).toBe(false);
  });
});

describe('describeLeadTime', () => {
  it('menyebut hari kerja secara eksplisit', () => {
    expect(describeLeadTime({ days: 3, businessDays: true })).toBe('3 hari kerja sebelum pemasangan');
    expect(describeLeadTime({ days: 2, businessDays: false })).toBe('2 hari sebelum pemasangan');
  });
});

describe('parseMaterialEmail', () => {
  it('menemukan email dari aturan deck social media', () => {
    const rules = 'Materi promosi harus clean image.\nMateri juga dapat dikirim via email ke marketing@malmetropolitan.com.';
    expect(parseMaterialEmail(rules)).toBe('marketing@malmetropolitan.com');
  });

  it('mengembalikan null bila media tidak menyebut email', () => {
    expect(parseMaterialEmail('Harga belum termasuk PPN.')).toBeNull();
    expect(parseMaterialEmail('')).toBeNull();
  });

  it('tidak salah menangkap teks non-email', () => {
    expect(parseMaterialEmail('Hubungi Ibu Marli di +62 813-5619-1951.')).toBeNull();
  });
});
