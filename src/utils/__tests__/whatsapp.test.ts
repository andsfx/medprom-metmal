import { describe, it, expect } from 'vitest';
import { toWaNumber, waLink, submissionWaLink } from '../whatsapp';

describe('toWaNumber', () => {
  // Format yang benar-benar diterima PHONE_RE (/^[+0-9][0-9\s-]{7,19}$/)
  // dan placeholder wizard "08xx xxxx xxxx".
  it('mengubah 0 lokal menjadi kode negara 62', () => {
    expect(toWaNumber('081234567890')).toBe('6281234567890');
    expect(toWaNumber('0812-3456-7890')).toBe('6281234567890');
    expect(toWaNumber('0812 3456 7890')).toBe('6281234567890');
  });

  it('mempertahankan 62 yang sudah lengkap', () => {
    expect(toWaNumber('6281234567890')).toBe('6281234567890');
    expect(toWaNumber('+62 812 3456 7890')).toBe('6281234567890');
  });

  it('menambahkan 62 untuk nomor tanpa awalan 0', () => {
    expect(toWaNumber('81234567890')).toBe('6281234567890');
  });

  it('meneruskan kode negara lain apa adanya', () => {
    expect(toWaNumber('+65 8123 4567')).toBe('6581234567');
  });

  it('mengembalikan null untuk masukan kosong', () => {
    expect(toWaNumber('')).toBeNull();
    expect(toWaNumber('   ')).toBeNull();
    expect(toWaNumber(null)).toBeNull();
    expect(toWaNumber(undefined)).toBeNull();
  });
});

describe('waLink', () => {
  it('membangun tautan digit-saja dengan pesan ter-encode', () => {
    const link = waLink('0812-3456-7890', 'Halo\nBaris dua');
    expect(link).toBe('https://wa.me/6281234567890?text=Halo%0ABaris%20dua');
  });

  it('menolak nomor terlalu pendek', () => {
    expect(waLink('08123')).toBeNull();
    expect(waLink('')).toBeNull();
  });

  it('menerima nomor tanpa teks', () => {
    expect(waLink('081234567890')).toBe('https://wa.me/6281234567890');
  });
});

describe('submissionWaLink', () => {
  it('menyusun pesan status berbahasa Indonesia', () => {
    const link = submissionWaLink({
      pic_phone: '08123456789',
      tenant_name: 'Optik Melawai',
      media_type_slug: 'spanduk',
      status: 'approved',
      review_notes: 'Desain OK.',
    });
    expect(link).toContain('https://wa.me/628123456789?text=');
    const decoded = decodeURIComponent(link!.split('text=')[1]!);
    expect(decoded).toContain('Optik Melawai');
    expect(decoded).toContain('Disetujui');
    expect(decoded).toContain('Desain OK.');
  });

  it('mengembalikan null bila nomor tidak valid', () => {
    expect(submissionWaLink({
      pic_phone: '', tenant_name: 'X', media_type_slug: 'spanduk', status: 'pending',
    })).toBeNull();
  });
});
