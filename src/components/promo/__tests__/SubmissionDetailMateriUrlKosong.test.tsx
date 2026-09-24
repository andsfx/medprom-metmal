/**
 * Mount test kanal materi di `SubmissionDetail` untuk kasus URL KOSONG.
 *
 * Kontrak rapuh yang dikunci: kanal materi ditentukan dari ADA/TIDAKNYA URL,
 * bukan hanya dari `source_type` (preseden `src/utils/proof.ts`). Kanal
 * 'link'/'upload' dengan `link_url`/`file_url` string kosong dulu tetap
 * dirender `<a href="">`, sehingga klik hanya memuat ulang halaman. Kini
 * kasus itu menjadi baris informasi, sedangkan kanal 'none' (sudah benar)
 * dan kanal ber-URL terisi tidak berubah.
 *
 * Blok riwayat versi materi memakai aturan yang sama; keduanya diperiksa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionStatusPage from '../SubmissionStatusPage';
import { fetchStatusByToken } from '../../../utils/promoApi';
import type { StatusPageData } from '../../../types/promo';

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
    material_title: 'Spanduk Diskon 50%', material_description: '',
    campaign_name: '', material_type: '', media_target: 'Atrium 1',
    air_start_date: '2026-10-01', air_end_date: '2026-10-31',
    installation_date: '', notes: '',
    status: 'menunggu_review', review_notes: '', status_changed_at: null,
    created_at: '2026-09-16T01:00:00Z', updated_at: '2026-09-16T01:00:00Z',
    source_type: 'link', file_url: '', file_name: '', link_url: '',
  },
  history: [],
  files: [],
  installation: null,
};

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

/** Semua anchor di dokumen beserta nilai atribut `href`-nya. */
function anchorHrefs(): (string | null)[] {
  return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
}

/** Blok materi: paragraf label + nilai di dalam kartu ringkasan. */
function blokMateri(): HTMLElement {
  const label = screen.getByText(/^(Materi|Tautan materi|Berkas materi)$/);
  const blok = label.parentElement;
  if (!blok) throw new Error('blok materi tidak ditemukan');
  return blok;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

describe('SubmissionDetail - kanal link/upload dengan URL kosong', () => {
  it('source_type link tanpa link_url → tanpa anchor, baris informasi tampil', async () => {
    renderPage({ ...BASE, submission: { ...BASE.submission, source_type: 'link', link_url: '' } });
    await screen.findByText('MP-260916-ABC234');

    const blok = blokMateri();
    expect(within(blok).getByText('Tautan materi')).toBeInTheDocument();
    expect(within(blok).queryAllByRole('link')).toHaveLength(0);
    expect(within(blok).getByText(/Tautan materi belum tersedia/i)).toBeInTheDocument();
    // Tidak ada `href=""` di seluruh dokumen.
    expect(anchorHrefs().filter((h) => h === '' || h === null)).toEqual([]);
  });

  it('source_type upload tanpa file_url → tanpa anchor, baris informasi tampil', async () => {
    renderPage({
      ...BASE,
      submission: { ...BASE.submission, source_type: 'upload', file_url: '', file_name: 'spanduk.jpg' },
    });
    await screen.findByText('MP-260916-ABC234');

    const blok = blokMateri();
    expect(within(blok).getByText('Berkas materi')).toBeInTheDocument();
    expect(within(blok).queryAllByRole('link')).toHaveLength(0);
    expect(within(blok).getByText(/Berkas materi belum tersedia/i)).toBeInTheDocument();
    expect(anchorHrefs().filter((h) => h === '' || h === null)).toEqual([]);
  });

  it('kanal link dengan URL terisi tetap menjadi anchor (tidak berubah)', async () => {
    renderPage({
      ...BASE,
      submission: {
        ...BASE.submission,
        source_type: 'link',
        link_url: 'https://drive.google.com/file/d/xyz/view',
      },
    });
    await screen.findByText('MP-260916-ABC234');

    const tautan = within(blokMateri()).getByRole('link', { name: /drive\.google\.com/i });
    expect(tautan).toHaveAttribute('href', 'https://drive.google.com/file/d/xyz/view');
  });
});

describe('SubmissionDetail - riwayat versi materi dengan URL kosong', () => {
  it('versi tanpa URL → tanpa anchor mati di blok riwayat versi', async () => {
    renderPage({
      ...BASE,
      files: [
        {
          id: 'f1', submission_id: 'sub-1', version: 1, source_type: 'link',
          file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
          link_url: '', drive_file_id: '', uploaded_by: 'tenant', notes: '',
          created_at: '2026-09-16T01:00:00Z',
        },
      ],
    });
    await screen.findByText('MP-260916-ABC234');

    expect(screen.getByText('Riwayat Versi Materi')).toBeInTheDocument();
    const item = screen.getByText(/Versi 1 \(awal\)/).closest('li');
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).queryAllByRole('link')).toHaveLength(0);
    expect(within(item as HTMLElement).getByText(/Tautan belum tersedia/i)).toBeInTheDocument();
    expect(anchorHrefs().filter((h) => h === '' || h === null)).toEqual([]);
  });

  it('versi ber-URL terisi tetap menampilkan tautan "Buka"', async () => {
    renderPage({
      ...BASE,
      files: [
        {
          id: 'f1', submission_id: 'sub-1', version: 1, source_type: 'link',
          file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
          link_url: 'https://drive.google.com/file/d/old/view', drive_file_id: '',
          uploaded_by: 'tenant', notes: '', created_at: '2026-09-16T01:00:00Z',
        },
      ],
    });
    await screen.findByText('MP-260916-ABC234');

    const tautan = screen.getByRole('link', { name: /^Buka$/i });
    expect(tautan).toHaveAttribute('href', 'https://drive.google.com/file/d/old/view');
  });
});
