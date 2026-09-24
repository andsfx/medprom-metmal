/**
 * Mount test kalimat penanda batch di riwayat per perangkat.
 *
 * Kontrak rapuh yang dikunci: kalimat ditulis dari `batch_item_count`. Dulu
 * kalimatnya selalu "Pengajuan ini bagian dari satu kirim berisi beberapa
 * media (N media dalam kiriman ini)", sehingga batch berisi TEPAT SATU media
 * menampilkan kalimat kontradiktif "beberapa media (1 media dalam kiriman
 * ini)". Kini: >1 menyebut "beberapa media" + jumlahnya, tepat 1 memakai
 * kalimat yang benar tanpa kata "beberapa", dan tanpa `batch_item_count`
 * memakai kalimat netral tanpa klaim jumlah.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MySubmissionsPage from '../MySubmissionsPage';
import { fetchMySubmissions } from '../../../utils/promoApi';
import type * as PromoApi from '../../../utils/promoApi';
import type { MySubmissionRow } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof PromoApi>();
  return { ...actual, fetchMySubmissions: vi.fn() };
});

const mockedFetch = vi.mocked(fetchMySubmissions);

const ROW_BATCH: MySubmissionRow = {
  id: 'sub-b1', submission_number: 'MP-260920-B7K2QX', status_token: 'tok-b1',
  media_type_slug: 'spanduk', tenant_name: 'Optik Melawai', unit_number: 'L1-05',
  material_title: 'Spanduk Gerai Baru', material_description: '', campaign_name: '',
  material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
  installation_date: '', notes: '', status: 'menunggu_review', review_notes: '',
  status_changed_at: null, created_at: '2026-09-20T01:00:00Z', updated_at: '2026-09-20T01:00:00Z',
  source_type: 'none', file_url: '', file_name: '', link_url: '',
  batch_id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1',
  batch_item_count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

function renderPage(row: MySubmissionRow) {
  mockedFetch.mockResolvedValue([row]);
  return render(
    <MemoryRouter>
      <MySubmissionsPage />
    </MemoryRouter>,
  );
}

describe('MySubmissionsPage - kalimat penanda batch', () => {
  it('batch_item_count 1 → kalimat tanpa kata "beberapa" dan tanpa kontradiksi', async () => {
    renderPage({ ...ROW_BATCH, batch_item_count: 1 });
    await screen.findByText('MP-260920-B7K2QX');

    expect(screen.getByText(/bagian dari satu kiriman \(1 media dalam kiriman ini\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/beberapa media/i)).not.toBeInTheDocument();
  });

  it('batch_item_count > 1 → menyebut "beberapa media" beserta jumlahnya', async () => {
    renderPage({ ...ROW_BATCH, batch_item_count: 3 });
    await screen.findByText('MP-260920-B7K2QX');

    expect(screen.getByText(/beberapa media \(3 media dalam kiriman ini\)/i)).toBeInTheDocument();
  });

  it('tanpa batch_item_count → keterangan kualitatif tanpa angka (perilaku lama utuh)', async () => {
    renderPage({ ...ROW_BATCH, batch_item_count: undefined });
    await screen.findByText('MP-260920-B7K2QX');

    // Perilaku lama yang dikunci test lain tetap dipertahankan: tanpa angka
    // dari server, kalimat tetap kualitatif dan tidak mengarang jumlah.
    expect(screen.getByText(/satu kirim berisi beberapa media/i)).toBeInTheDocument();
    expect(screen.queryByText(/media dalam kiriman ini/i)).not.toBeInTheDocument();
  });
});
