/**
 * Mount test halaman status batch cetak.
 *
 * Kontrak rapuh yang dikunci: token batch memuat seluruh item, dan tiap item
 * dirender lewat komponen bersama `SubmissionDetail` (bentuk identik dengan
 * halaman status per-pengajuan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BatchStatusPage from '../BatchStatusPage';
import type { BatchStatusData } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return { ...actual, fetchBatchByToken: vi.fn() };
});

import { fetchBatchByToken } from '../../../utils/promoApi';

const mockedFetch = vi.mocked(fetchBatchByToken);

function item(over: Partial<BatchStatusData['items'][number]['submission']> = {}) {
  return {
    submission: {
      id: 'sub-1', submission_number: 'MP-260920-AAA234', media_type_slug: 'spanduk',
      tenant_name: 'PT Contoh', unit_number: '', material_title: 'Spanduk Promo',
      material_description: '', campaign_name: '', material_type: '', media_target: 'Pintu Tol',
      air_start_date: '2026-10-01', air_end_date: '2026-10-07', installation_date: '',
      notes: '', status: 'menunggu_review', review_notes: '', status_changed_at: null,
      created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z',
      source_type: 'none' as const, file_url: '', file_name: '', link_url: '',
      applicant_type: 'non_tenant' as const, submission_date: '2026-09-20',
      batch_id: 'b1', subtotal: 490000, ppn_amount: 53900, total_amount: 543900,
      ...over,
    },
    history: [],
    files: [],
    installation: null,
  };
}

const DATA: BatchStatusData = {
  batch: {
    id: 'b1', batch_number: 'MPB-260920-ABC234', applicant_type: 'non_tenant',
    applicant_name: 'PT Contoh', unit_number: '', submission_date: '2026-09-20',
    notes: '', created_at: '2026-09-20T00:00:00Z',
  },
  items: [item(), item({ id: 'sub-2', submission_number: 'MP-260920-BBB234', media_type_slug: 'umbul-umbul' })],
};

function renderPage(token = 'btok-1') {
  return render(
    <MemoryRouter initialEntries={[`/batch/${token}`]}>
      <Routes>
        <Route path="/batch/:token" element={<BatchStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('BatchStatusPage', () => {
  it('menampilkan nomor batch, pemohon, dan seluruh item', async () => {
    mockedFetch.mockResolvedValue(DATA);
    renderPage();

    expect(await screen.findByText('MPB-260920-ABC234')).toBeInTheDocument();
    // Nama pemohon muncul di header batch dan di setiap item.
    expect(screen.getAllByText('PT Contoh').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('MP-260920-AAA234')).toBeInTheDocument();
    expect(screen.getByText('MP-260920-BBB234')).toBeInTheDocument();
    expect(screen.getByText(/2 media dalam pengajuan ini/i)).toBeInTheDocument();
  });

  it('menampilkan total PPN gabungan', async () => {
    mockedFetch.mockResolvedValue(DATA);
    renderPage();
    await screen.findByText('MPB-260920-ABC234');
    // Dua item × 53.900.
    expect(screen.getByText('Rp. 107.800')).toBeInTheDocument();
  });

  it('token tidak dikenal → pesan tidak ditemukan', async () => {
    mockedFetch.mockRejectedValue(new Error('404'));
    renderPage('salah');
    expect(await screen.findByText(/Pengajuan tidak ditemukan/i)).toBeInTheDocument();
  });
});
