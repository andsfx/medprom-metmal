import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, CATEGORY_LABELS, CATEGORY_ORDER, MAX_FILE_BYTES, MIME_LABELS } from './promo';

describe('konstanta promo', () => {
  it('status label lengkap untuk 4 status', () => {
    expect(STATUS_LABELS['pending']).toBe('Menunggu');
    expect(STATUS_LABELS['approved']).toBe('Disetujui');
    expect(STATUS_LABELS['rejected']).toBe('Ditolak');
    expect(STATUS_LABELS['installed']).toBe('Terpasang');
    expect(Object.keys(STATUS_LABELS)).toHaveLength(4);
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
