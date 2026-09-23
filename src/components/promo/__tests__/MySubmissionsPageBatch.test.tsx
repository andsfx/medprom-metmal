/**
 * Test riwayat per perangkat — penandaan batch pengajuan cetak.
 *
 * Kontrak rapuh yang dikunci: baris yang berasal dari satu kirim form cetak
 * (punya `batch_number` + `batch_token`) menampilkan nomor batch dan tautan
 * "Lihat status batch" ke `/batch/<batch_token>`, sehingga tenant bisa kembali
 * ke tampilan batch setelah meninggalkan layar sukses wizard. Baris non-batch
 * TIDAK menampilkan keduanya (perilaku lama utuh), dan tautan lama
 * `/status/<status_token>` tetap ada di kedua kasus.
 *
 * Handler server sudah mengunci keberadaan kolomnya di
 * `__tests__/api/promo-mine-batch.test.js`; berkas ini mengunci sisi tampilan.
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

/** Baris dasar tanpa batch - perilaku lama. */
const ROW_POLOS: MySubmissionRow = {
  id: 'sub-1', submission_number: 'MP-260918-A7K2QX', status_token: 'tok-1',
  media_type_slug: 'spanduk', tenant_name: 'Optik Melawai', unit_number: 'L1-05',
  material_title: 'Spanduk Diskon 50%', material_description: '', campaign_name: '',
  material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
  installation_date: '', notes: '', status: 'menunggu_review', review_notes: '',
  status_changed_at: null, created_at: '2026-09-18T01:00:00Z', updated_at: '2026-09-18T01:00:00Z',
  source_type: 'link', file_url: '', file_name: '', link_url: 'https://drive.google.com/file/d/x/view',
};

/** Baris hasil kirim cetak: bagian dari satu batch berisi beberapa media. */
const ROW_BATCH: MySubmissionRow = {
  ...ROW_POLOS,
  id: 'sub-b1', submission_number: 'MP-260920-B7K2QX', status_token: 'tok-b1',
  material_title: 'Spanduk Gerai Baru',
  batch_id: 'batch-1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MySubmissionsPage />
    </MemoryRouter>,
  );
}

describe('MySubmissionsPage — penandaan batch', () => {
  it('baris ber-batch menampilkan nomor batch, keterangan kiriman, dan tautan batch', async () => {
    mockedFetch.mockResolvedValue([ROW_BATCH]);
    renderPage();

    expect(await screen.findByText('MPB-260920-ABC234')).toBeInTheDocument();
    expect(screen.getByText(/satu kirim berisi beberapa media/i)).toBeInTheDocument();

    const tautanBatch = screen.getByRole('link', { name: /Lihat status batch/i });
    expect(tautanBatch).toHaveAttribute('href', '/batch/btok-1');
    // Tautan berdiri sendiri: target sentuh minimal 44px.
    expect(tautanBatch.className).toContain('min-h-11');
  });

  it('baris ber-batch tetap menampilkan tautan status per pengajuan', async () => {
    mockedFetch.mockResolvedValue([ROW_BATCH]);
    renderPage();

    expect(await screen.findByRole('link', { name: /Lihat status & kirim revisi/i }))
      .toHaveAttribute('href', '/status/tok-b1');
  });

  it('baris tanpa batch tidak menampilkan nomor batch maupun tautan batch', async () => {
    mockedFetch.mockResolvedValue([ROW_POLOS]);
    renderPage();

    expect(await screen.findByText('MP-260918-A7K2QX')).toBeInTheDocument();
    expect(screen.queryByText(/Nomor batch/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Lihat status batch/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/satu kirim berisi beberapa media/i)).not.toBeInTheDocument();
  });

  it('baris tanpa batch tetap menampilkan tautan status per pengajuan', async () => {
    mockedFetch.mockResolvedValue([ROW_POLOS]);
    renderPage();

    expect(await screen.findByRole('link', { name: /Lihat status & kirim revisi/i }))
      .toHaveAttribute('href', '/status/tok-1');
  });

  it('dua kartu sekiriman menampilkan nomor batch yang sama', async () => {
    mockedFetch.mockResolvedValue([
      ROW_BATCH,
      { ...ROW_BATCH, id: 'sub-b2', submission_number: 'MP-260920-C7K2QX', status_token: 'tok-b2', material_title: 'Big Banner Gerai Baru' },
    ]);
    renderPage();

    expect(await screen.findByText('MP-260920-B7K2QX')).toBeInTheDocument();
    expect(screen.getByText('MP-260920-C7K2QX')).toBeInTheDocument();
    // Nomor batch sama untuk kedua kartu → jelas satu kiriman.
    expect(screen.getAllByText('MPB-260920-ABC234')).toHaveLength(2);
    expect(screen.getAllByText(/2 media dalam kiriman ini/i)).toHaveLength(2);
  });
});
