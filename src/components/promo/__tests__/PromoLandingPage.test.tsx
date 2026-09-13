import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PromoLandingPage from '../PromoLandingPage';
import { fetchMediaTypes } from '../../../utils/promoApi';
import type { PromoMediaType } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(),
  };
});

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);

const MEDIA: PromoMediaType[] = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PDF', price_note: 'Rp. 70.000,-/hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat',
    rules: 'Harga belum termasuk PPN.\nMinimal sewa 1 minggu.', sort_order: 1,
  },
  {
    slug: 'sosmed-feed', category: 'social', name: 'Feed Instagram/Fanpage/TikTok',
    size_spec: '800 x 800 px', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,MP4', price_note: 'Free',
    location_note: '', rules: 'Caption wajib sebut lantai tenant.', sort_order: 13,
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

describe('PromoLandingPage', () => {
  it('render grup kategori + kartu media dari API', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();

    expect(await screen.findByText('Spanduk')).toBeInTheDocument();
    expect(screen.getByText('Feed Instagram/Fanpage/TikTok')).toBeInTheDocument();
    expect(screen.getByText('Outdoor')).toBeInTheDocument();
    expect(screen.getByText('Media Sosial')).toBeInTheDocument();
    expect(screen.getByText('Rp. 70.000,-/hari')).toBeInTheDocument();
  });

  it('expandable rules per kartu', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    // Rules tersembunyi awalnya.
    expect(screen.queryByText(/Minimal sewa 1 minggu/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Ketentuan pemasangan/i })[0]!);
    expect(await screen.findByText(/Minimal sewa 1 minggu/i)).toBeInTheDocument();
  });

  it('tombol Ajukan Materi membawa slug media ke wizard', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    const links = screen.getAllByRole('link', { name: /Ajukan Materi/i });
    expect(links[0]).toHaveAttribute('href', '/ajukan?media=spanduk');
  });

  it('error state saat katalog gagal dimuat', async () => {
    mockedFetchMediaTypes.mockRejectedValue(new Error('network'));
    renderLanding();

    expect(await screen.findByText(/Gagal memuat katalog media/i)).toBeInTheDocument();
  });
});
