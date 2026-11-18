/**
 * Test tombol "Bagikan" pada halaman status pengajuan tenant.
 *
 * Tombol hanya dirender saat data pengajuan sudah termuat (token valid).
 * Perilaku mengikuti `detail.html` + Web Share API:
 * - `navigator.share` ada → dipanggil dengan `{ title, text, url }`;
 * - tanpa `navigator.share` (desktop) → `navigator.clipboard.writeText(url)`
 *   lalu tampil umpan balik "Tautan disalin" (state lokal deterministik,
 *   tetap tampil sampai unmount/klik berikutnya - tanpa setTimeout).
 * - clipboard gagal → pesan galat via `role="status"`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    source_type: 'none', file_url: '', file_name: '', link_url: '',
  },
  history: [],
  files: [],
  installation: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
  // jsdom tidak menyediakan clipboard; pasang penulisan dummy agar kode
  // aplikasi tidak melempar saat mengakses `navigator.clipboard`.
  Object.assign(window.navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  // Bersihkan stub yang dipasang di atas `window.navigator` agar tidak bocor
  // ke test lain.
  Reflect.deleteProperty(window.navigator, 'clipboard');
  Reflect.deleteProperty(window.navigator, 'share');
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

describe('SubmissionStatusPage - tombol Bagikan', () => {
  it('muncul di app bar saat data termuat, dengan aria-label yang benar', async () => {
    mockedFetchStatus.mockResolvedValue(BASE);
    renderPage();

    await screen.findByText('MP-260916-ABC234');
    expect(screen.getByRole('button', { name: 'Bagikan status pengajuan' })).toBeInTheDocument();
  });

  it('klik → memanggil navigator.share bila tersedia', async () => {
    mockedFetchStatus.mockResolvedValue(BASE);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(window.navigator, { share });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Bagikan status pengajuan' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      title: 'Pengajuan MP-260916-ABC234',
      text: 'Status pengajuan MP-260916-ABC234: Menunggu Review',
      url: window.location.href,
    });
    // Jalur share tidak memakai clipboard.
    expect(window.navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('tanpa navigator.share → menyalin URL + menampilkan "Tautan disalin"', async () => {
    mockedFetchStatus.mockResolvedValue(BASE);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(window.navigator, { clipboard: { writeText } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Bagikan status pengajuan' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText('Tautan disalin')).toBeInTheDocument();
  });

  it('clipboard gagal → pesan galat via role="status"', async () => {
    mockedFetchStatus.mockResolvedValue(BASE);
    const writeText = vi.fn().mockRejectedValue(new Error('ditolak'));
    Object.assign(window.navigator, { clipboard: { writeText } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Bagikan status pengajuan' }));

    expect(await screen.findByText('Gagal menyalin tautan')).toBeInTheDocument();
  });

  it('data gagal/tidak termuat → tombol tidak dirender', async () => {
    mockedFetchStatus.mockRejectedValue(new Error('Gagal terhubung ke server'));
    renderPage();

    await screen.findByText(/Gagal memuat status pengajuan/i);
    expect(screen.queryByRole('button', { name: 'Bagikan status pengajuan' })).not.toBeInTheDocument();
  });
});
