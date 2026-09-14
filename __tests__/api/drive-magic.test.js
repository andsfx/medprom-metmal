/**
 * Test regression magic bytes — verifikasi fix bug MP4 (signatures.some([])=false).
 */
import { describe, it, expect } from 'vitest';
import { checkMagicBytes } from '../../server/src/drive.js';

function buf(arr) { return Buffer.from(arr); }

describe('checkMagicBytes', () => {
  it('JPEG valid', () => {
    const r = checkMagicBytes(buf([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]), 'image/jpeg');
    expect(r.ok).toBe(true);
  });

  it('PNG valid', () => {
    const r = checkMagicBytes(buf([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]), 'image/png');
    expect(r.ok).toBe(true);
  });

  it('PDF valid', () => {
    const r = checkMagicBytes(buf([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]), 'application/pdf');
    expect(r.ok).toBe(true);
  });

  it('MP4 dengan ftyp valid', () => {
    const b = Buffer.alloc(24);
    b.writeUInt32BE(24, 0); // box size
    b.write('ftyp', 4);
    b.write('isom', 8);
    const r = checkMagicBytes(b, 'video/mp4');
    expect(r.ok).toBe(true);
  });

  it('MP4 tanpa ftyp → rejected', () => {
    const b = Buffer.alloc(24);
    b.writeUInt32BE(24, 0);
    b.write('moov', 4); // bukan ftyp
    const r = checkMagicBytes(b, 'video/mp4');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('MP4');
  });

  it('buffer klaim JPEG tapi isi PNG → rejected', () => {
    const r = checkMagicBytes(buf([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), 'image/jpeg');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Isi file tidak sesuai');
  });

  it('MIME tidak dikenal → rejected', () => {
    const r = checkMagicBytes(buf([0x00]), 'application/octet-stream');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Tipe file tidak dikenali');
  });
});