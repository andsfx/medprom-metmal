import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PromoLandingPage from '../PromoLandingPage';
import { fetchMediaTypes } from '../../../utils/promoApi';
import type { PromoMediaType } from '../../../types/promo';

// API di-mock dengan `importOriginal` supaya util lain di modul yang sama
// (mis. normalisasi) tetap asli - pola yang sama dipakai
// `PromoLandingPage.test.tsx`.
vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(),
  };
});

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);

// Tiga media aktif di dua kategori: satu cetak outdoor dengan `location_note`
// khas ("Pintu Tol"), dua digital (indoor + social). Cukup untuk menguji
// pemfilteran per kategori, pencarian pada lokasi/ukuran, dan kanal.
const MEDIA: PromoMediaType[] = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 70.000,-/hari',
    media_channel: 'cetak',
    location_note: 'Sisi Pintu Tol Bekasi Barat',
    rules: '', sort_order: 1,
  },
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    size_spec: '800 x 600 Pixel (Landscape)', material_spec: 'JPEG/MP4, durasi 30 detik',
    accepted_formats: 'JPEG,PNG,MP4', image_path: '', price_note: 'Rp. 600.000,-/hari',
    media_channel: 'digital', location_note: '', rules: '', sort_order: 10,
  },
  {
    slug: 'sosmed-feed', category: 'social', name: 'Feed Instagram',
    size_spec: '800 x 800 Pixel (Square)', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', image_path: '', price_note: 'Gratis',
    media_channel: 'digital', location_note: '', rules: '', sort_order: 13,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <PromoLandingPage />
    </MemoryRouter>,
  );
}

describe('PromoLandingPage - pencarian & filter katalog', () => {
  it('mengetik kata di kotak cari → kartu tak cocok hilang, yang cocok tetap', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    fireEvent.change(screen.getByLabelText('Cari media'), { target: { value: 'videotron' } });

    expect(await screen.findByText('Videotron')).toBeInTheDocument();
    expect(screen.queryByText('Spanduk')).not.toBeInTheDocument();
    expect(screen.queryByText('Feed Instagram')).not.toBeInTheDocument();
  });

  it('kata dari location_note ikut dicari → kartu media itu tetap tampil', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    fireEvent.change(screen.getByLabelText('Cari media'), { target: { value: 'pintu tol' } });

    expect(await screen.findByText('Spanduk')).toBeInTheDocument();
    expect(screen.queryByText('Videotron')).not.toBeInTheDocument();
  });

  it('klik chip kategori → kartu kategori lain hilang beserta judulnya', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    fireEvent.click(screen.getByRole('button', { name: 'Indoor 1' }));

    expect(await screen.findByText('Videotron')).toBeInTheDocument();
    expect(screen.queryByText('Spanduk')).not.toBeInTheDocument();
    // Bagian kategori yang kosong tidak dirender sama sekali.
    expect(screen.queryByRole('heading', { name: 'Outdoor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Media Sosial' })).not.toBeInTheDocument();
  });

  it('klik chip Sudah "Semua" → seluruh kartu kembali', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    fireEvent.click(screen.getByRole('button', { name: 'Indoor 1' }));
    expect(await screen.findByRole('button', { name: 'Semua 3' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Semua 3' }));

    expect(await screen.findByText('Spanduk')).toBeInTheDocument();
    expect(screen.getByText('Videotron')).toBeInTheDocument();
    expect(screen.getByText('Feed Instagram')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Filter kategori' }))
      .getByRole('button', { name: 'Semua 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('catatan jumlah mengikuti filter yang aktif', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    expect(screen.getByRole('status')).toHaveTextContent('Menampilkan 3 dari 3 media');

    fireEvent.click(screen.getByRole('button', { name: 'Outdoor 1' }));

    expect(screen.getByRole('status')).toHaveTextContent('Menampilkan 1 dari 3 media');
  });

  it('kombinasi tanpa hasil → pesan kosong, tanpa bagian kategori', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    fireEvent.change(screen.getByLabelText('Cari media'), { target: { value: 'tidak ada media ini' } });

    expect(await screen.findByText('Tidak ada media yang cocok.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Menampilkan 0 dari 3 media');
    expect(screen.queryByRole('heading', { name: 'Outdoor' })).not.toBeInTheDocument();
  });

  it('baris kanal menampilkan nama handler sesuai media_channel', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    const spanduk = screen.getByText('Spanduk').closest('article') as HTMLElement;
    expect(within(spanduk).getByText(/Cetak · Tenant Relations/)).toBeInTheDocument();

    const videotron = screen.getByText('Videotron').closest('article') as HTMLElement;
    expect(within(videotron).getByText(/Digital · Marcom/)).toBeInTheDocument();
  });
});
