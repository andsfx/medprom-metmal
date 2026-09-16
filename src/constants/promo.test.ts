import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, STATUS_ORDER, CATEGORY_LABELS, CATEGORY_ORDER, MAX_FILE_BYTES, MIME_LABELS } from './promo';

describe('konstanta promo', () => {
  it('status label lengkap untuk 8 status PRD', () => {
    expect(STATUS_LABELS['draft']).toBe('Draft');
    expect(STATUS_LABELS['menunggu_review']).toBe('Menunggu Review');
    expect(STATUS_LABELS['perlu_revisi']).toBe('Perlu Revisi');
    expect(STATUS_LABELS['disetujui']).toBe('Disetujui');
    expect(STATUS_LABELS['ditolak']).toBe('Ditolak');
    expect(STATUS_LABELS['siap_dipasang']).toBe('Siap Dipasang');
    expect(STATUS_LABELS['sudah_dipasang']).toBe('Sudah Dipasang');
    expect(STATUS_LABELS['selesai']).toBe('Selesai');
    expect(Object.keys(STATUS_LABELS)).toHaveLength(8);
  });

  it('urutan status tidak memuat draft (tidak ditampilkan sebagai filter)', () => {
    expect(STATUS_ORDER).not.toContain('draft');
    expect(STATUS_ORDER).toContain('menunggu_review');
  });

  it('kategori label & urutan konsisten', () => {
    expect(CATEGORY_LABELS['outdoor']).toBe('Outdoor');
    expect(CATEGORY_LABELS['indoor']).toBe('Indoor');
    expect(CATEGORY_LABELS['social']).toBe('Media Sosial');
    expect(CATEGORY_ORDER).toEqual(['outdoor', 'indoor', 'social']);
  });

  it('MAX_FILE_BYTES sinkron dengan cap server 50MB', () => {
    expect(MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
  });

  it('MIME_LABELS mencakup 4 mime yang diterima server', () => {
    expect(MIME_LABELS['image/jpeg']).toBe('JPEG');
    expect(MIME_LABELS['image/png']).toBe('PNG');
    expect(MIME_LABELS['application/pdf']).toBe('PDF');
    expect(MIME_LABELS['video/mp4']).toBe('MP4');
  });
});
