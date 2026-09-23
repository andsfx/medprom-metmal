/**
 * Mount test materi tiga kanal di `SubmissionDetail` - komponen bersama halaman
 * status token (`/status/:token`), pelacakan (`/lacak`), dan batch (`/batch/:token`).
 *
 * Kontrak rapuh yang dikunci: `source_type` punya TIGA nilai, bukan dua.
 * Pengajuan cetak (`POST /promo/submit-batch`) sengaja tidak meminta berkas
 * materi sehingga tersimpan sebagai `'none'`; dulu komponen ini memperlakukan
 * semua yang bukan `'link'` sebagai berkas, sehingga pengajuan yang baru saja
 * tenant kirim menampilkan tautan `href=""` berlabel "Berkas materi" -
 * mengkliknya hanya memuat ulang halaman.
 *
 * Kanal `'none'` kini wajib menjadi baris INFORMASI tanpa anchor, sedangkan
 * kanal `'link'` dan `'upload'` harus tetap persis seperti sebelumnya
 * (href, `target`, `rel`, dan labelnya).
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

/** Basis pengajuan cetak: kanal 'none', tanpa berkas maupun tautan. */
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
    source_type: 'none', file_url: '', file_name: '', link_url: '',
    applicant_type: 'non_tenant', submission_date: '2026-09-16',
    batch_id: 'b1', subtotal: 490000, ppn_amount: 53900, total_amount: 543900,
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

describe('SubmissionDetail - pengajuan tanpa materi (source_type none)', () => {
  it('tidak merender anchor ber-href kosong sama sekali', async () => {
    renderPage(BASE);
    await screen.findByText('MP-260916-ABC234');

    // Inti defect: dulu blok materi merender <a href=""> untuk kanal 'none'.
    // Diperiksa pada SELURUH dokumen, bukan hanya blok materi, supaya tautan
    // kosong di tempat lain pun ikut tertangkap.
    const kosong = anchorHrefs().filter((h) => h === '' || h === null);
    expect(kosong).toEqual([]);
  });

  it('menampilkan baris informasi "Materi" berisi keterangan menyusul', async () => {
    renderPage(BASE);
    await screen.findByText('MP-260916-ABC234');

    const blok = blokMateri();
    // Label yang tepat: bukan "Berkas materi" (materinya memang belum ada).
    expect(within(blok).getByText('Materi')).toBeInTheDocument();
    expect(within(blok).getByText(/menyusul setelah pengajuan disetujui/i)).toBeInTheDocument();
    // Tanpa anchor di dalam blok materi.
    expect(within(blok).queryAllByRole('link')).toHaveLength(0);
    expect(within(blok).queryByText(/Lihat berkas/i)).not.toBeInTheDocument();
  });

  it('tidak menampilkan label berkas/tautan untuk kanal none', async () => {
    renderPage(BASE);
    await screen.findByText('MP-260916-ABC234');

    expect(screen.queryByText('Berkas materi')).not.toBeInTheDocument();
    expect(screen.queryByText('Tautan materi')).not.toBeInTheDocument();
  });
});

describe('SubmissionDetail - kanal link dan upload tidak berubah', () => {
  it('kanal link tetap menaut ke link_url dengan label "Tautan materi"', async () => {
    renderPage({
      ...BASE,
      submission: {
        ...BASE.submission,
        source_type: 'link',
        link_url: 'https://drive.google.com/file/d/xyz/view',
      },
    });
    await screen.findByText('MP-260916-ABC234');

    const blok = blokMateri();
    expect(within(blok).getByText('Tautan materi')).toBeInTheDocument();
    const tautan = within(blok).getByRole('link', { name: /drive\.google\.com/i });
    expect(tautan).toHaveAttribute('href', 'https://drive.google.com/file/d/xyz/view');
    expect(tautan).toHaveAttribute('target', '_blank');
    expect(tautan).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('kanal upload tetap menaut ke file_url dengan label "Berkas materi"', async () => {
    renderPage({
      ...BASE,
      submission: {
        ...BASE.submission,
        source_type: 'upload',
        file_url: 'https://drive.google.com/file/d/file-1/view',
        file_name: 'spanduk.jpg',
      },
    });
    await screen.findByText('MP-260916-ABC234');

    const blok = blokMateri();
    expect(within(blok).getByText('Berkas materi')).toBeInTheDocument();
    const tautan = within(blok).getByRole('link', { name: /spanduk\.jpg/i });
    expect(tautan).toHaveAttribute('href', 'https://drive.google.com/file/d/file-1/view');
    expect(tautan).toHaveAttribute('target', '_blank');
    expect(tautan).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
