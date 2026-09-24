/**
 * Test navigasi "Kembali" halaman status per pengajuan dan status batch.
 *
 * Kontrak rapuh yang dikunci: halaman status dibuka lewat tautan/token yang
 * bisa datang dari PERANGKAT LAIN (dan sering dibuka LANGSUNG dari tautan,
 * tanpa riwayat navigasi). Tujuan tombol kembali TIDAK BOLEH bergantung pada
 * riwayat perangkat (`/riwayat`), karena di perangkat itu riwayat kosong
 * ("Belum ada pengajuan dari perangkat ini") dan tenant mengira pengajuannya
 * hilang.
 *
 * Pilihan yang diambil: (b) arahkan ke beranda (`/`). Alasan: tombol kembali
 * harus berperilaku SAMA di setiap cara masuk. Kembali-satu-langkah browser
 * bergantung pada riwayat navigasi yang tidak ada saat tautan dibuka langsung
 * (kasus utama perangkat lain), sehingga hasilnya tidak dapat diprediksi;
 * beranda selalu ada, tidak menyesatkan, dan memberi jalan lanjut (katalog,
 * lacak nomor). Dua kasus masuk diuji: lewat riwayat navigasi dan dibuka
 * langsung.
 *
 * Tautan "Lihat Riwayat Perangkat" di panel galat/tidak ditemukan SENGAJA
 * dibiarkan: itu teks lain di halaman dan bukan tombol kembali.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SubmissionStatusPage from '../SubmissionStatusPage';
import BatchStatusPage from '../BatchStatusPage';
import { fetchStatusByToken, fetchBatchByToken } from '../../../utils/promoApi';
import type * as PromoApi from '../../../utils/promoApi';
import type { StatusPageData, BatchStatusData } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof PromoApi>();
  return { ...actual, fetchStatusByToken: vi.fn(), fetchBatchByToken: vi.fn() };
});

const mockedFetchStatus = vi.mocked(fetchStatusByToken);
const mockedFetchBatch = vi.mocked(fetchBatchByToken);

const STATUS: StatusPageData = {
  submission: {
    id: 'sub-1', submission_number: 'MP-260916-ABC234', media_type_slug: 'spanduk',
    tenant_name: 'Optik Melawai', unit_number: 'L1-05',
    material_title: 'Spanduk Diskon 50%', material_description: '',
    campaign_name: '', material_type: '', media_target: 'Atrium 1',
    air_start_date: '', air_end_date: '', installation_date: '', notes: '',
    status: 'menunggu_review', review_notes: '', status_changed_at: null,
    created_at: '2026-09-16T01:00:00Z', updated_at: '2026-09-16T01:00:00Z',
    source_type: 'link', file_url: '', file_name: '',
    link_url: 'https://drive.google.com/file/d/xyz/view',
  },
  history: [], files: [], installation: null,
};

const BATCH: BatchStatusData = {
  batch: {
    id: 'b1', batch_number: 'MPB-260920-ABC234', applicant_type: 'non_tenant',
    applicant_name: 'PT Contoh', unit_number: '', submission_date: '2026-09-20',
    notes: '', created_at: '2026-09-20T00:00:00Z',
  },
  items: [],
};

/** Penanda rute aktif: membuktikan tombol kembali benar-benar berpindah. */
function PenandaRute() {
  const { pathname } = useLocation();
  return <p>Rute sekarang: {pathname}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchStatus.mockResolvedValue(STATUS);
  mockedFetchBatch.mockResolvedValue(BATCH);
});

describe('tombol kembali halaman status/batch tidak bergantung pada riwayat perangkat', () => {
  it('halaman status pengajuan dibuka lewat riwayat → tombol kembali ke beranda, bukan /riwayat', async () => {
    render(
      <MemoryRouter initialEntries={['/masuk', '/status/tok-1']} initialIndex={1}>
        <Routes>
          <Route path="/masuk" element={<PenandaRute />} />
          <Route path="/status/:token" element={<><SubmissionStatusPage /><PenandaRute /></>} />
          <Route path="/" element={<PenandaRute />} />
          <Route path="/riwayat" element={<PenandaRute />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('MP-260916-ABC234');
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));

    expect(await screen.findByText('Rute sekarang: /')).toBeInTheDocument();
    expect(screen.queryByText('Rute sekarang: /riwayat')).not.toBeInTheDocument();
  });

  it('halaman status batch dibuka lewat riwayat → tombol kembali ke beranda, bukan /riwayat', async () => {
    render(
      <MemoryRouter initialEntries={['/masuk', '/batch/btok-1']} initialIndex={1}>
        <Routes>
          <Route path="/masuk" element={<PenandaRute />} />
          <Route path="/batch/:token" element={<><BatchStatusPage /><PenandaRute /></>} />
          <Route path="/" element={<PenandaRute />} />
          <Route path="/riwayat" element={<PenandaRute />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('MPB-260920-ABC234');
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));

    expect(await screen.findByText('Rute sekarang: /')).toBeInTheDocument();
    expect(screen.queryByText('Rute sekarang: /riwayat')).not.toBeInTheDocument();
  });

  it('dibuka langsung tanpa riwayat navigasi (perangkat lain) → tombol kembali tetap ke beranda', async () => {
    render(
      <MemoryRouter initialEntries={['/status/tok-1']}>
        <Routes>
          <Route path="/status/:token" element={<><SubmissionStatusPage /><PenandaRute /></>} />
          <Route path="/" element={<PenandaRute />} />
          <Route path="/riwayat" element={<PenandaRute />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('MP-260916-ABC234');
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));

    expect(await screen.findByText('Rute sekarang: /')).toBeInTheDocument();
    expect(screen.queryByText('Rute sekarang: /riwayat')).not.toBeInTheDocument();
  });

  it('halaman status batch dibuka langsung tanpa riwayat → tombol kembali juga ke beranda', async () => {
    render(
      <MemoryRouter initialEntries={['/batch/btok-1']}>
        <Routes>
          <Route path="/batch/:token" element={<><BatchStatusPage /><PenandaRute /></>} />
          <Route path="/" element={<PenandaRute />} />
          <Route path="/riwayat" element={<PenandaRute />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('MPB-260920-ABC234');
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));

    expect(await screen.findByText('Rute sekarang: /')).toBeInTheDocument();
    expect(screen.queryByText('Rute sekarang: /riwayat')).not.toBeInTheDocument();
  });
});
