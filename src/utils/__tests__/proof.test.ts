/**
 * Unit test helper bukti tayang - kontrak yang dipakai BERSAMA oleh
 * `SubmissionDetail` (sisi tenant) dan Sheet detail staf.
 *
 * Yang dikunci:
 *  - kanal ditentukan dari ADA/TIDAKNYA URL, bukan dari kolom `proof_kind`
 *    (baris warisan dapat ber-`proof_kind` 'link' sekaligus punya berkas);
 *  - baris kosong tidak pernah dihasilkan;
 *  - metadata yang tidak ada tidak dipaksakan menjadi teks kosong menggantung.
 */
import { describe, it, expect } from 'vitest';
import { installationProofViews, formatProofSize, proofMimeLabel } from '../proof';
import type { InstallationRow } from '../../types/promo';

function inst(over: Partial<InstallationRow> = {}): InstallationRow {
  return {
    id: 'i1', submission_id: 'sub-1', media_location: 'Atrium 1',
    start_date: '', end_date: '', notes: '', proof_url: '', proof_kind: 'link',
    installed_by: '', installed_by_id: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

describe('installationProofViews', () => {
  it('tanpa pemasangan → tanpa baris bukti', () => {
    expect(installationProofViews(null)).toEqual([]);
    expect(installationProofViews(undefined)).toEqual([]);
  });

  it('tanpa URL di kedua kolom → tanpa baris bukti', () => {
    expect(installationProofViews(inst())).toEqual([]);
  });

  it('kanal tautan → satu baris berlabel Bukti', () => {
    const views = installationProofViews(inst({ proof_url: 'https://drive.google.com/a' }));
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      kind: 'link',
      label: 'Bukti',
      linkLabel: 'Buka bukti pemasangan',
      url: 'https://drive.google.com/a',
    });
  });

  it('kanal unggahan → satu baris berlabel Bukti tayang beserta metadata', () => {
    const views = installationProofViews(inst({
      proof_kind: 'upload',
      proof_file_url: 'https://drive.google.com/b',
      proof_file_name: 'bukti.jpg',
      proof_mime: 'image/jpeg',
      proof_size_bytes: 1572864,
      proof_uploaded_by: 'Admin Satu',
      proof_uploaded_at: '2026-10-01T02:30:00Z',
    }));
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      kind: 'upload',
      label: 'Bukti tayang',
      linkLabel: 'Buka bukti tayang',
      url: 'https://drive.google.com/b',
      fileName: 'bukti.jpg',
      meta: 'JPEG · 1.5 MB',
    });
    expect(views[0]!.uploaded).toContain('Admin Satu');
  });

  it('kedua kolom terisi → dua baris, urut tautan lalu unggahan', () => {
    const views = installationProofViews(inst({
      proof_url: 'https://drive.google.com/a',
      proof_file_url: 'https://drive.google.com/b',
    }));
    expect(views.map((v) => v.kind)).toEqual(['link', 'upload']);
  });

  it('proof_kind "link" tetapi berkas ada → kanal unggahan tetap tampil', () => {
    // Baris warisan: kolom `proof_kind` ber-DEFAULT 'link' sementara berkas
    // sudah tersimpan. URL, bukan label, yang menentukan.
    const views = installationProofViews(inst({
      proof_kind: 'link',
      proof_file_url: 'https://drive.google.com/b',
    }));
    expect(views.map((v) => v.kind)).toEqual(['upload']);
  });

  it('URL hanya berisi spasi → dianggap tidak ada', () => {
    expect(installationProofViews(inst({ proof_url: '   ' }))).toEqual([]);
  });

  it('metadata tidak lengkap → hanya yang ada yang diisi', () => {
    const views = installationProofViews(inst({ proof_file_url: 'https://drive.google.com/b' }));
    expect(views[0]).toMatchObject({ fileName: '', meta: '', uploaded: '' });
  });

  it('pengunggah tanpa waktu → kalimat tanpa tanggal menggantung', () => {
    const views = installationProofViews(inst({
      proof_file_url: 'https://drive.google.com/b', proof_uploaded_by: 'Admin Satu',
    }));
    expect(views[0]!.uploaded).toBe('Diunggah oleh Admin Satu');
  });
});

describe('formatProofSize', () => {
  it('nol/absen/tidak masuk akal → string kosong', () => {
    expect(formatProofSize(0)).toBe('');
    expect(formatProofSize(undefined)).toBe('');
    expect(formatProofSize(null)).toBe('');
    expect(formatProofSize(Number.NaN)).toBe('');
    expect(formatProofSize(-5)).toBe('');
  });

  it('di bawah 1MB → KB, minimal 1 KB', () => {
    expect(formatProofSize(2048)).toBe('2 KB');
    expect(formatProofSize(10)).toBe('1 KB');
  });

  it('1MB ke atas → MB satu desimal', () => {
    expect(formatProofSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatProofSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('proofMimeLabel', () => {
  it('MIME dikenal → label pendek', () => {
    expect(proofMimeLabel('image/jpeg')).toBe('JPEG');
    expect(proofMimeLabel('application/pdf')).toBe('PDF');
    expect(proofMimeLabel('video/mp4')).toBe('MP4');
  });

  it('MIME tak dikenal → dikembalikan apa adanya, bukan disembunyikan', () => {
    expect(proofMimeLabel('image/webp')).toBe('image/webp');
  });

  it('kosong → string kosong', () => {
    expect(proofMimeLabel('')).toBe('');
    expect(proofMimeLabel(null)).toBe('');
  });
});
