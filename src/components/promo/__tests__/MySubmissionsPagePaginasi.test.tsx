/**
 * Test riwayat per perangkat - pemuatan bertahap (paginasi).
 *
 * Kontrak rapuh yang dikunci: riwayat TIDAK boleh memotong daftar secara
 * senyap. Bila masih ada sisa, halaman menampilkan penanda jujur
 * ("Menampilkan N ... pengajuan terbaru") beserta tombol "Muat lagi" yang
 * memuat halaman berikutnya dengan `offset` dan MENAMBAH baris ke daftar
 * (bukan menggantinya). Bila tidak ada sisa, tombol tidak muncul.
 *
 * Dua sumber kebenaran "masih ada sisa":
 *  - `total` dari server (jumlah seluruh pengajuan perangkat) → dipakai bila ada;
 *  - heuristik: tanpa `total`, halaman yang terisi PENUH (`MY_SUBMISSIONS_PAGE_SIZE`
 *    baris) dianggap mungkin masih ada sisa, supaya tenant pada instance lama
 *    tetap punya jalan memuat sisanya.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MySubmissionsPage from '../MySubmissionsPage';
import { fetchMySubmissions } from '../../../utils/promoApi';
import type * as PromoApi from '../../../utils/promoApi';
import type { MySubmissionRow } from '../../../types/promo';
import { MY_SUBMISSIONS_PAGE_SIZE } from '../../../constants/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof PromoApi>();
  return { ...actual, fetchMySubmissions: vi.fn() };
});

const mockedFetch = vi.mocked(fetchMySubmissions);

/** Baris riwayat bernomor urut agar bisa dibedakan per halaman. */
function row(n: number): MySubmissionRow {
  const nomor = String(n).padStart(5, '0');
  return {
    id: `sub-${nomor}`, submission_number: `MP-260918-A${nomor}`, status_token: `tok-${nomor}`,
    media_type_slug: 'spanduk', tenant_name: 'Optik Melawai', unit_number: 'L1-05',
    material_title: `Spanduk Promo ${nomor}`, material_description: '', campaign_name: '',
    material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
    installation_date: '', notes: '', status: 'menunggu_review', review_notes: '',
    status_changed_at: null, created_at: '2026-09-18T01:00:00Z', updated_at: '2026-09-18T01:00:00Z',
    source_type: 'link', file_url: '', file_name: '', link_url: 'https://drive.google.com/file/d/x/view',
  };
}

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

describe('MySubmissionsPage - pemuatan bertahap', () => {
  it('masih ada sisa (total dari server) → penanda jujur + tombol yang menambah baris', async () => {
    mockedFetch.mockResolvedValueOnce({ rows: [row(1), row(2)], total: 3 });
    mockedFetch.mockResolvedValueOnce({ rows: [row(3)], total: 3 });
    renderPage();

    expect(await screen.findByText('MP-260918-A00001')).toBeInTheDocument();
    expect(screen.getByText(/Menampilkan 2 dari 3 pengajuan terbaru/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Muat lagi/i }));

    expect(await screen.findByText('MP-260918-A00003')).toBeInTheDocument();
    // Halaman berikutnya diminta dengan offset sejumlah baris yang sudah termuat.
    expect(mockedFetch).toHaveBeenLastCalledWith('testfp123', 2);
    // Menambah, bukan mengganti.
    expect(screen.getByText('MP-260918-A00001')).toBeInTheDocument();
    expect(screen.getByText('MP-260918-A00002')).toBeInTheDocument();
    // Semua sudah termuat → tombol hilang.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Muat lagi/i })).not.toBeInTheDocument();
    });
  });

  it('tidak ada sisa (total sama dengan jumlah baris) → tanpa tombol dan tanpa penanda', async () => {
    mockedFetch.mockResolvedValue({ rows: [row(1), row(2)], total: 2 });
    renderPage();

    expect(await screen.findByText('MP-260918-A00001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Muat lagi/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/pengajuan terbaru/i)).not.toBeInTheDocument();
  });

  it('total tidak tersedia tetapi halaman terisi penuh → tombol tetap tampil (heuristik)', async () => {
    const penuh = Array.from({ length: MY_SUBMISSIONS_PAGE_SIZE }, (_, i) => row(i + 1));
    mockedFetch.mockResolvedValue({ rows: penuh, total: null });
    renderPage();

    expect(await screen.findByText('MP-260918-A00001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Muat lagi/i })).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Menampilkan ${MY_SUBMISSIONS_PAGE_SIZE} pengajuan terbaru`, 'i')),
    ).toBeInTheDocument();
  });

  it('total tidak tersedia dan halaman tidak penuh → tanpa tombol', async () => {
    mockedFetch.mockResolvedValue({ rows: [row(1)], total: null });
    renderPage();

    expect(await screen.findByText('MP-260918-A00001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Muat lagi/i })).not.toBeInTheDocument();
  });

  it('gagal memuat halaman berikutnya → daftar lama tetap, pesan galat muncul', async () => {
    mockedFetch.mockResolvedValueOnce({ rows: [row(1)], total: 2 });
    mockedFetch.mockRejectedValueOnce(new Error('503'));
    renderPage();

    await screen.findByText('MP-260918-A00001');
    fireEvent.click(screen.getByRole('button', { name: /Muat lagi/i }));

    expect(await screen.findByText(/Gagal memuat pengajuan berikutnya/i)).toBeInTheDocument();
    // Baris yang sudah termuat tidak hilang dan tombol bisa dicoba lagi.
    expect(screen.getByText('MP-260918-A00001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Muat lagi/i })).toBeEnabled();
  });
});
