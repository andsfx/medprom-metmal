/**
 * Mount test pembedaan "tidak ditemukan" (404) vs "gagal memuat" pada halaman
 * status tenant: `/status/:token` dan `/batch/:token`.
 *
 * Kontrak rapuh yang dikunci: dulu kedua halaman menangkap SEMUA galat dengan
 * `setNotFound(true)`, sehingga galat jaringan/503 ditampilkan sebagai
 * "Pengajuan tidak ditemukan" - menyesatkan tenant yang pengajuannya
 * sebenarnya ada. Kini hanya 404 yang berarti tidak ditemukan; galat lain
 * menampilkan panel "gagal memuat" dengan tombol "Coba lagi" yang benar-benar
 * memanggil ulang pemuatan.
 *
 * Status HTTP dibaca dari `ApiError.status` (dipasang `src/lib/rest.ts`),
 * bukan ditebak dari pesan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionStatusPage from '../SubmissionStatusPage';
import BatchStatusPage from '../BatchStatusPage';
import { fetchStatusByToken, fetchBatchByToken } from '../../../utils/promoApi';
import { ApiError } from '../../../lib/rest';
import type { StatusPageData, BatchStatusData } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchStatusByToken: vi.fn(),
    fetchBatchByToken: vi.fn(),
    submitRevision: vi.fn(),
    uploadFile: vi.fn(),
  };
});

const mockedFetchStatus = vi.mocked(fetchStatusByToken);
const mockedFetchBatch = vi.mocked(fetchBatchByToken);

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
  },
  history: [],
  files: [],
  installation: null,
};

const BATCH: BatchStatusData = {
  batch: {
    id: 'b1', batch_number: 'MPB-260920-ABC234', applicant_type: 'non_tenant',
    applicant_name: 'PT Contoh', unit_number: '', submission_date: '2026-09-20',
    notes: '', created_at: '2026-09-20T00:00:00Z',
  },
  items: [{
    submission: { ...BASE.submission, id: 'sub-b1', submission_number: 'MP-260920-AAA234', batch_id: 'b1' },
    history: [], files: [], installation: null,
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

function renderStatus() {
  return render(
    <MemoryRouter initialEntries={['/status/tok-1']}>
      <Routes>
        <Route path="/status/:token" element={<SubmissionStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderBatch() {
  return render(
    <MemoryRouter initialEntries={['/batch/btok-1']}>
      <Routes>
        <Route path="/batch/:token" element={<BatchStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SubmissionStatusPage - 404 vs gagal memuat', () => {
  it('galat non-404 (jaringan) → panel gagal memuat + tombol Coba lagi', async () => {
    mockedFetchStatus.mockRejectedValue(new ApiError('Gagal terhubung ke server', 'NETWORK'));
    renderStatus();

    expect(await screen.findByText(/Gagal memuat status pengajuan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Coba lagi/i })).toBeInTheDocument();
    expect(screen.queryByText(/Pengajuan tidak ditemukan/i)).not.toBeInTheDocument();
  });

  it('galat 503 → gagal memuat, bukan "tidak ditemukan"', async () => {
    mockedFetchStatus.mockRejectedValue(new ApiError('Layanan tidak tersedia', '503', undefined, 503));
    renderStatus();

    expect(await screen.findByText(/Gagal memuat status pengajuan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pengajuan tidak ditemukan/i)).not.toBeInTheDocument();
  });

  it('tombol Coba lagi memanggil ulang pemuatan sampai berhasil', async () => {
    mockedFetchStatus
      .mockRejectedValueOnce(new ApiError('Gagal terhubung ke server', 'NETWORK'))
      .mockResolvedValueOnce(BASE);
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: /Coba lagi/i }));

    expect(await screen.findByText('MP-260916-ABC234')).toBeInTheDocument();
    await waitFor(() => expect(mockedFetchStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Gagal memuat status pengajuan/i)).not.toBeInTheDocument();
  });

  it('404 → pesan "tidak ditemukan", bukan panel gagal memuat', async () => {
    mockedFetchStatus.mockRejectedValue(
      new ApiError('Pengajuan tidak ditemukan.', '404', undefined, 404),
    );
    renderStatus();

    expect(await screen.findByText(/Pengajuan tidak ditemukan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gagal memuat status pengajuan/i)).not.toBeInTheDocument();
  });
});

describe('BatchStatusPage - 404 vs gagal memuat', () => {
  it('galat non-404 (jaringan) → panel gagal memuat + tombol Coba lagi', async () => {
    mockedFetchBatch.mockRejectedValue(new ApiError('Gagal terhubung ke server', 'NETWORK'));
    renderBatch();

    expect(await screen.findByText(/Gagal memuat status batch/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Coba lagi/i })).toBeInTheDocument();
    expect(screen.queryByText(/Pengajuan tidak ditemukan/i)).not.toBeInTheDocument();
  });

  it('tombol Coba lagi memanggil ulang pemuatan sampai berhasil', async () => {
    mockedFetchBatch
      .mockRejectedValueOnce(new ApiError('Layanan tidak tersedia', '503', undefined, 503))
      .mockResolvedValueOnce(BATCH);
    renderBatch();

    fireEvent.click(await screen.findByRole('button', { name: /Coba lagi/i }));

    expect(await screen.findByText('MPB-260920-ABC234')).toBeInTheDocument();
    await waitFor(() => expect(mockedFetchBatch).toHaveBeenCalledTimes(2));
  });

  it('404 → pesan "tidak ditemukan", bukan panel gagal memuat', async () => {
    mockedFetchBatch.mockRejectedValue(
      new ApiError('Pengajuan tidak ditemukan.', '404', undefined, 404),
    );
    renderBatch();

    expect(await screen.findByText(/Pengajuan tidak ditemukan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gagal memuat status batch/i)).not.toBeInTheDocument();
  });
});
