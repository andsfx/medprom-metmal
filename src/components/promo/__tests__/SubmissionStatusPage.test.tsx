import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionStatusPage from '../SubmissionStatusPage';
import { fetchStatusByToken, submitRevision } from '../../../utils/promoApi';
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
const mockedSubmitRevision = vi.mocked(submitRevision);

const BASE: StatusPageData = {
  submission: {
    id: 'sub-1', submission_number: 'MP-260916-ABC234', media_type_slug: 'spanduk',
    tenant_name: 'Optik Melawai', unit_number: 'L1-05',
    material_title: 'Spanduk Diskon 50%', material_description: 'Diskon akhir tahun.',
    campaign_name: 'Promo Akhir Tahun', material_type: 'Promosi',
    media_target: 'Atrium 1', air_start_date: '2026-10-01', air_end_date: '2026-10-31',
    installation_date: '', notes: '',
    status: 'menunggu_review', review_notes: '', status_changed_at: null,
    created_at: '2026-09-16T01:00:00Z', updated_at: '2026-09-16T01:00:00Z',
    source_type: 'link', file_url: '', file_name: '',
    link_url: 'https://drive.google.com/file/d/xyz/view',
  },
  history: [{
    id: 'h1', submission_id: 'sub-1', from_status: '', to_status: 'menunggu_review',
    comment: 'Pengajuan dikirim tenant', actor_type: 'tenant', actor_name: '',
    actor_id: null, created_at: '2026-09-16T01:00:00Z',
  }],
  files: [],
  installation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

function renderPage(token = 'tok-1') {
  return render(
    <MemoryRouter initialEntries={[`/status/${token}`]}>
      <Routes>
        <Route path="/status/:token" element={<SubmissionStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SubmissionStatusPage', () => {
  it('menampilkan nomor pengajuan, status, dan riwayat', async () => {
    mockedFetchStatus.mockResolvedValue(BASE);
    renderPage();

    expect(await screen.findByText('MP-260916-ABC234')).toBeInTheDocument();
    expect(screen.getByText('Spanduk Diskon 50%')).toBeInTheDocument();
    // Status muncul sebagai badge pada header pengajuan.
    expect(screen.getAllByText('Menunggu Review').length).toBeGreaterThan(0);
    expect(screen.getByText('Riwayat Status')).toBeInTheDocument();
  });

  it('token tidak dikenal → pesan tidak ditemukan', async () => {
    mockedFetchStatus.mockRejectedValue(new Error('404'));
    renderPage('salah');

    expect(await screen.findByText(/Pengajuan tidak ditemukan/i)).toBeInTheDocument();
  });

  it('status Perlu Revisi di perangkat pengirim → form kirim revisi muncul dan terkirim', async () => {
    mockedFetchStatus.mockResolvedValue({
      ...BASE,
      is_owner: true,
      submission: { ...BASE.submission, status: 'perlu_revisi', review_notes: 'Tolong perbaiki resolusi.' },
    });
    mockedSubmitRevision.mockResolvedValue({ version: 2, status: 'menunggu_review' });
    renderPage();

    expect(await screen.findByText('Kirim Materi Revisi')).toBeInTheDocument();
    // Catatan admin terlihat tenant.
    expect(screen.getByText('Tolong perbaiki resolusi.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Tautan Materi Revisi/i), {
      target: { value: 'https://drive.google.com/file/d/new/view' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Kirim Revisi/i }));

    await waitFor(() => {
      expect(mockedSubmitRevision).toHaveBeenCalledWith('sub-1', expect.objectContaining({
        link_url: 'https://drive.google.com/file/d/new/view',
        device_fingerprint: 'testfp123',
      }));
    });
  });

  it('status Perlu Revisi di perangkat LAIN → tanpa form, ada keterangan', async () => {
    // `is_owner` dihitung server dari fingerprint perangkat. Perangkat lain
    // tetap bisa MELIHAT catatan revisi, tetapi tidak diberi form yang pasti
    // ditolak server.
    mockedFetchStatus.mockResolvedValue({
      ...BASE,
      is_owner: false,
      submission: { ...BASE.submission, status: 'perlu_revisi', review_notes: 'Tolong perbaiki resolusi.' },
    });
    renderPage();

    expect(await screen.findByText('Materi Revisi')).toBeInTheDocument();
    expect(screen.queryByText('Kirim Materi Revisi')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kirim Revisi/i })).not.toBeInTheDocument();
    // Catatan admin tetap terlihat.
    expect(screen.getByText('Tolong perbaiki resolusi.')).toBeInTheDocument();
    expect(screen.getByText(/hanya dapat dikirim dari perangkat yang mengirim pengajuan/i)).toBeInTheDocument();
  });

  it('status bukan Perlu Revisi → tanpa form revisi', async () => {
    mockedFetchStatus.mockResolvedValue(BASE);
    renderPage();

    await screen.findByText('MP-260916-ABC234');
    expect(screen.queryByText('Kirim Materi Revisi')).not.toBeInTheDocument();
  });

  it('menampilkan informasi pemasangan bila sudah ada (FR-047)', async () => {
    mockedFetchStatus.mockResolvedValue({
      ...BASE,
      submission: { ...BASE.submission, status: 'sudah_dipasang' },
      installation: {
        id: 'i1', submission_id: 'sub-1', media_location: 'Atrium 1',
        start_date: '2026-10-01', end_date: '2026-10-31', notes: 'Dipasang pagi',
        proof_url: '', installed_by: 'Admin Satu', installed_by_id: null,
        created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
      },
    });
    renderPage();

    expect(await screen.findByText('Informasi Pemasangan')).toBeInTheDocument();
    // Lokasi pemasangan muncul di blok pemasangan (media_target juga "Atrium 1").
    expect(screen.getAllByText('Atrium 1').length).toBeGreaterThan(0);
    expect(screen.getByText('Dipasang pagi')).toBeInTheDocument();
  });

  it('menampilkan riwayat versi materi', async () => {
    mockedFetchStatus.mockResolvedValue({
      ...BASE,
      files: [
        {
          id: 'f2', submission_id: 'sub-1', version: 2, source_type: 'link',
          file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
          link_url: 'https://drive.google.com/file/d/new/view', drive_file_id: '',
          uploaded_by: 'tenant', notes: 'Sudah diperbaiki', created_at: '2026-09-17T01:00:00Z',
        },
        {
          id: 'f1', submission_id: 'sub-1', version: 1, source_type: 'link',
          file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
          link_url: 'https://drive.google.com/file/d/old/view', drive_file_id: '',
          uploaded_by: 'tenant', notes: '', created_at: '2026-09-16T01:00:00Z',
        },
      ],
    });
    renderPage();

    expect(await screen.findByText('Riwayat Versi Materi')).toBeInTheDocument();
    expect(screen.getByText('Versi 2')).toBeInTheDocument();
    expect(screen.getByText(/Versi 1 \(awal\)/)).toBeInTheDocument();
  });
});
