/**
 * Mount test bukti tayang di `SubmissionDetail` - komponen bersama halaman
 * status token (`/status/:token`), pelacakan (`/lacak`), dan batch (`/batch/:token`).
 *
 * Kontrak rapuh yang dikunci: tabel `promo_installations` punya DUA kanal bukti
 * tayang. Kanal `link` memakai `proof_url`, kanal `upload` memakai
 * `proof_file_url` + metadata berkas. Sebelumnya komponen ini hanya merender
 * `proof_url`, sehingga staf mengunggah berkas, tersimpan ke Drive + DB, dan
 * tenant tidak melihat apa pun.
 *
 * Dirender lewat halaman status supaya jalur nyata (token → API → detail) yang
 * diuji, bukan komponennya secara terpisah.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionStatusPage from '../SubmissionStatusPage';
import { fetchStatusByToken } from '../../../utils/promoApi';
import type { InstallationRow, StatusPageData } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchStatusByToken: vi.fn(),
    submitRevision: vi.fn(),
    uploadFile: vi.fn(),
  };
});

const mockedFetchStatus = vi.mocked(fetchStatusByToken);

const BASE: StatusPageData = {
  submission: {
    id: 'sub-1', submission_number: 'MP-260916-ABC234', media_type_slug: 'spanduk',
    tenant_name: 'Optik Melawai', unit_number: 'L1-05',
    material_title: 'Spanduk Diskon 50%', material_description: 'Diskon akhir tahun.',
    campaign_name: 'Promo Akhir Tahun', material_type: 'Promosi',
    media_target: 'Atrium 1', air_start_date: '2026-10-01', air_end_date: '2026-10-31',
    installation_date: '', notes: '',
    status: 'sudah_dipasang', review_notes: '', status_changed_at: null,
    created_at: '2026-09-16T01:00:00Z', updated_at: '2026-09-16T01:00:00Z',
    source_type: 'link', file_url: '', file_name: '',
    link_url: 'https://drive.google.com/file/d/xyz/view',
  },
  history: [],
  files: [],
  installation: null,
};

/** Baris pemasangan kanonik - kolom bukti diisi per kasus uji. */
function installation(over: Partial<InstallationRow> = {}): InstallationRow {
  return {
    id: 'i1', submission_id: 'sub-1', media_location: 'Atrium 1',
    start_date: '2026-10-01', end_date: '2026-10-31', notes: 'Dipasang pagi',
    proof_url: '', proof_kind: 'link', installed_by: 'Admin Satu', installed_by_id: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

function renderPage(data: StatusPageData) {
  mockedFetchStatus.mockResolvedValue(data);
  return render(
    <MemoryRouter initialEntries={['/status/tok-1']}>
      <Routes>
        <Route path="/status/:token" element={<SubmissionStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Blok "Informasi Pemasangan" tempat bukti tayang dirender. */
async function blokPemasangan(): Promise<HTMLElement> {
  const heading = await screen.findByText('Informasi Pemasangan');
  const card = heading.closest('div');
  if (!card) throw new Error('blok Informasi Pemasangan tidak ditemukan');
  return card;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

describe('SubmissionDetail - bukti tayang dua kanal', () => {
  it('kanal unggahan → tautan bukti tayang, nama berkas, jenis/ukuran, pengunggah', async () => {
    renderPage({
      ...BASE,
      installation: installation({
        proof_kind: 'upload',
        proof_url: '',
        proof_file_url: 'https://drive.google.com/file/d/bukti-1/view',
        proof_file_name: 'bukti-atrium-1.jpg',
        proof_mime: 'image/jpeg',
        proof_size_bytes: 1572864,
        proof_uploaded_by: 'Admin Satu',
        proof_uploaded_at: '2026-10-01T02:30:00Z',
      }),
    });

    const blok = await blokPemasangan();
    // Inti defect: bukti kanal unggahan harus punya tautan yang bisa dibuka tenant.
    const tautan = within(blok).getByRole('link', { name: /Buka bukti tayang/i });
    expect(tautan).toHaveAttribute('href', 'https://drive.google.com/file/d/bukti-1/view');
    expect(tautan).toHaveAttribute('target', '_blank');
    // Nama berkas + info jenis/ukuran + pelaku/waktu unggah.
    expect(within(blok).getByText('bukti-atrium-1.jpg')).toBeInTheDocument();
    expect(within(blok).getByText(/JPEG · 1\.5 MB/)).toBeInTheDocument();
    expect(within(blok).getByText(/Diunggah oleh Admin Satu/)).toBeInTheDocument();
  });

  it('kanal tautan → perilaku lama dipertahankan', async () => {
    renderPage({
      ...BASE,
      installation: installation({
        proof_kind: 'link',
        proof_url: 'https://drive.google.com/file/d/tautan/view',
      }),
    });

    const blok = await blokPemasangan();
    expect(within(blok).getByRole('link', { name: /Buka bukti pemasangan/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/tautan/view');
    // Kanal unggahan tidak berisi → tidak ada tautan bukti tayang.
    expect(within(blok).queryByRole('link', { name: /Buka bukti tayang/i })).not.toBeInTheDocument();
  });

  it('kedua kanal terisi → dua tautan terpisah, bukan saling menimpa', async () => {
    renderPage({
      ...BASE,
      installation: installation({
        proof_kind: 'upload',
        proof_url: 'https://drive.google.com/file/d/tautan/view',
        proof_file_url: 'https://drive.google.com/file/d/berkas/view',
        proof_file_name: 'bukti.jpg',
      }),
    });

    const blok = await blokPemasangan();
    expect(within(blok).getByRole('link', { name: /Buka bukti pemasangan/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/tautan/view');
    expect(within(blok).getByRole('link', { name: /Buka bukti tayang/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/berkas/view');
    // Label berbeda supaya kedua baris tidak terbaca sebagai bukti yang sama.
    expect(within(blok).getByText('Bukti')).toBeInTheDocument();
    expect(within(blok).getByText('Bukti tayang')).toBeInTheDocument();
  });

  it('tanpa bukti sama sekali → tidak ada baris bukti kosong', async () => {
    renderPage({ ...BASE, installation: installation() });

    const blok = await blokPemasangan();
    expect(within(blok).queryByRole('link', { name: /Buka bukti/i })).not.toBeInTheDocument();
    // Lokasi & catatan pemasangan tetap tampil - hanya baris bukti yang absen.
    expect(within(blok).getByText('Atrium 1')).toBeInTheDocument();
    expect(within(blok).getByText('Dipasang pagi')).toBeInTheDocument();
  });

  it('metadata kanal unggahan tidak lengkap → hanya yang ada yang dirender', async () => {
    renderPage({
      ...BASE,
      installation: installation({
        proof_kind: 'upload',
        proof_file_url: 'https://drive.google.com/file/d/berkas/view',
      }),
    });

    const blok = await blokPemasangan();
    const tautan = within(blok).getByRole('link', { name: /Buka bukti tayang/i });
    // Tautan tetap berdiri sendiri dengan target sentuh minimal 44px.
    expect(tautan.className).toContain('min-h-11');
    expect(within(blok).queryByText(/Diunggah/)).not.toBeInTheDocument();
    expect(within(blok).queryByText(/JPEG|MB|KB/)).not.toBeInTheDocument();
  });
});
