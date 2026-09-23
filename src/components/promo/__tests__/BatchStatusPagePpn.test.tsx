/**
 * Test label PPN ringkasan batch cetak.
 *
 * Kontrak: label kolom PPN mengikuti perlakuan `ppn_included` tiap item.
 * - Tidak ada item `ppn_included` true → label tetap persis "Total PPN".
 * - Ada minimal satu item `ppn_included` true → label "Termasuk PPN".
 * - Campuran → muncul keterangan bahwa sebagian media sudah termasuk PPN.
 * Nilai Σ `ppn_amount` dan Σ `total_amount` tidak berubah oleh label.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BatchStatusPage from '../BatchStatusPage';
import type { BatchStatusData } from '../../../types/promo';
import type * as PromoApiModule from '../../../utils/promoApi';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof PromoApiModule>();
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

function batch(items: BatchStatusData['items']): BatchStatusData {
  return {
    batch: {
      id: 'b1', batch_number: 'MPB-260920-ABC234', applicant_type: 'non_tenant',
      applicant_name: 'PT Contoh', unit_number: '', submission_date: '2026-09-20',
      notes: '', created_at: '2026-09-20T00:00:00Z',
    },
    items,
  };
}

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

describe('BatchStatusPage label PPN', () => {
  it('semua item tanpa ppn_included → label Total PPN, tanpa Termasuk PPN', async () => {
    mockedFetch.mockResolvedValue(batch([
      item(),
      item({ id: 'sub-2', submission_number: 'MP-260920-BBB234', media_type_slug: 'umbul-umbul' }),
    ]));
    renderPage();
    await screen.findByText('MPB-260920-ABC234');

    expect(screen.getByText('Total PPN')).toBeInTheDocument();
    expect(screen.queryByText('Termasuk PPN')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sebagian media/i)).not.toBeInTheDocument();
    // Nilai Σ ppn_amount tetap benar (dua item × 53.900).
    expect(screen.getByText('Rp. 107.800')).toBeInTheDocument();
  });

  it('ada item ppn_included true → label Termasuk PPN', async () => {
    mockedFetch.mockResolvedValue(batch([
      item({ ppn_included: true }),
      item({ id: 'sub-2', submission_number: 'MP-260920-BBB234', media_type_slug: 'umbul-umbul', ppn_included: true }),
    ]));
    renderPage();
    await screen.findByText('MPB-260920-ABC234');

    expect(screen.getByText('Termasuk PPN')).toBeInTheDocument();
    expect(screen.queryByText('Total PPN')).not.toBeInTheDocument();
    // Semua sudah termasuk → tidak ada keterangan campuran.
    expect(screen.queryByText(/Sebagian media/i)).not.toBeInTheDocument();
    expect(screen.getByText('Rp. 107.800')).toBeInTheDocument();
  });

  it('campuran included dan belum → keterangan Sebagian media tampil, nilai Σ tetap benar', async () => {
    mockedFetch.mockResolvedValue(batch([
      item({ ppn_included: true }),
      item({
        id: 'sub-2', submission_number: 'MP-260920-BBB234', media_type_slug: 'umbul-umbul',
        subtotal: 510000, ppn_amount: 56100, total_amount: 566100,
      }),
    ]));
    renderPage();
    await screen.findByText('MPB-260920-ABC234');

    expect(screen.getByText('Termasuk PPN')).toBeInTheDocument();
    expect(screen.getByText(/Sebagian media/i)).toBeInTheDocument();
    // Σ ppn_amount = 53.900 + 56.100; Σ total_amount = 543.900 + 566.100.
    expect(screen.getByText('Rp. 110.000')).toBeInTheDocument();
    expect(screen.getByText('Rp. 1.110.000')).toBeInTheDocument();
    // Label total tagihan tidak berubah.
    expect(screen.getByText('Total tagihan')).toBeInTheDocument();
  });
});
