/**
 * Test jalur batch halaman pelacakan (/lacak).
 *
 * Kontrak yang dikunci: input berawalan `MPB-` menempuh jalur pelacakan batch
 * (`fetchBatchByNumber`, endpoint `/promo/batches/track`) lalu diarahkan ke
 * `/batch/<batch_token>` yang sudah ada; input berawalan `MP-` tetap menempuh
 * jalur pengajuan (`fetchStatusByNumber`); dan input yang bukan salah satu
 * format ditolak di klien TANPA memanggil API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import TrackSubmissionPage from '../TrackSubmissionPage';
import { fetchStatusByNumber, fetchBatchByNumber } from '../../../utils/promoApi';
import type { StatusPageData, BatchStatusData } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchStatusByNumber: vi.fn(),
    fetchBatchByNumber: vi.fn(),
  };
});

const mockedSubmission = vi.mocked(fetchStatusByNumber);
const mockedBatch = vi.mocked(fetchBatchByNumber);

/**
 * Tangkap prop `action` yang diterima widget Turnstile. Server memverifikasi
 * `action` per permukaan ('track' vs 'track-batch'), jadi prop ini adalah
 * kontrak yang harus cocok - kalau salah, captcha aktif akan selalu ditolak.
 */
const { widgetActions } = vi.hoisted(() => ({ widgetActions: [] as string[] }));
vi.mock('../../ui/Turnstile', () => ({
  default: ({ action }: { action: string }) => {
    widgetActions.push(action);
    return null;
  },
}));

const SUBMISSION: StatusPageData = {
  submission: {
    id: 'sub-1', submission_number: 'MP-260918-A7K2QX', media_type_slug: 'spanduk',
    tenant_name: 'Optik Melawai', unit_number: 'L1-05',
    material_title: 'Spanduk Diskon 50%', material_description: 'Diskon akhir tahun.',
    campaign_name: 'Promo Akhir Tahun', material_type: 'Promosi',
    media_target: 'Atrium 1', air_start_date: '2026-10-01', air_end_date: '2026-10-31',
    installation_date: '', notes: '',
    status: 'menunggu_review', review_notes: '', status_changed_at: null,
    created_at: '2026-09-18T01:00:00Z', updated_at: '2026-09-18T01:00:00Z',
    source_type: 'link', file_url: '', file_name: '',
    link_url: 'https://drive.google.com/file/d/xyz/view',
  },
  history: [],
  files: [],
  installation: null,
};

const BATCH: BatchStatusData = {
  batch: {
    id: 'b-1', batch_number: 'MPB-260918-A7K2QX', applicant_type: 'tenant',
    applicant_name: 'Optik Melawai', unit_number: 'L1-05', submission_date: '2026-09-18',
    notes: '', created_at: '2026-09-18T01:00:00Z', batch_token: 'btok-9',
  },
  items: [],
};

/** Penanda tujuan: halaman batch yang menerima token dari rute. */
function HalamanBatch() {
  const { token = '' } = useParams();
  return <div>Halaman batch {token}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  widgetActions.length = 0;
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/lacak']}>
      <Routes>
        <Route path="/lacak" element={<TrackSubmissionPage />} />
        <Route path="/batch/:token" element={<HalamanBatch />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Isi nomor lalu tekan Lacak. */
function submitNumber(value: string) {
  fireEvent.change(screen.getByLabelText(/Nomor Pengajuan/i), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /Lacak/i }));
}

describe('TrackSubmissionPage - jalur batch', () => {
  it('nomor batch MPB- → fetchBatchByNumber lalu diarahkan ke /batch/<token>', async () => {
    mockedBatch.mockResolvedValue(BATCH);
    renderPage();

    submitNumber('MPB-260918-A7K2QX');

    expect(await screen.findByText(/Halaman batch btok-9/i)).toBeInTheDocument();
    expect(mockedBatch).toHaveBeenCalledWith('MPB-260918-A7K2QX', '');
    expect(mockedSubmission).not.toHaveBeenCalled();
  });

  it('nomor pengajuan MP- tetap ke jalur pengajuan', async () => {
    mockedSubmission.mockResolvedValue(SUBMISSION);
    renderPage();

    submitNumber('MP-260918-A7K2QX');

    expect(await screen.findByText('Spanduk Diskon 50%')).toBeInTheDocument();
    expect(mockedSubmission).toHaveBeenCalledWith('MP-260918-A7K2QX', '');
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it('input di luar kedua format → ditolak di klien tanpa memanggil API', async () => {
    renderPage();

    submitNumber('ABC-123');

    expect(await screen.findByText(/Format nomor tidak dikenal/i)).toBeInTheDocument();
    expect(mockedBatch).not.toHaveBeenCalled();
    expect(mockedSubmission).not.toHaveBeenCalled();
  });

  it('batch tanpa batch_token → pesan jelas, tidak diarahkan ke rute kosong', async () => {
    mockedBatch.mockResolvedValue({ batch: { ...BATCH.batch, batch_token: '' }, items: [] });
    renderPage();

    submitNumber('MPB-260918-A7K2QX');

    expect(await screen.findByText(/tautan statusnya tidak tersedia/i)).toBeInTheDocument();
    expect(screen.queryByText(/Halaman batch/i)).not.toBeInTheDocument();
  });

  it('teks bantuan menyebut kedua format (MP- dan MPB-)', () => {
    renderPage();

    expect(screen.getByText('MP-260918-A7K2QX')).toBeInTheDocument();
    expect(screen.getByText('MPB-260918-A7K2QX')).toBeInTheDocument();
  });

  it('input MPB- → widget Turnstile memakai action track-batch', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/Nomor Pengajuan/i), { target: { value: 'MPB-260918-A7K2QX' } });

    expect(widgetActions.at(-1)).toBe('track-batch');
  });

  it('input MP- → widget Turnstile memakai action track', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/Nomor Pengajuan/i), { target: { value: 'MP-260918-A7K2QX' } });

    expect(widgetActions.at(-1)).toBe('track');
  });

  it('input kosong → widget Turnstile memakai action track', () => {
    renderPage();

    expect(widgetActions.at(-1)).toBe('track');
  });
});
