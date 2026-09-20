import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

// Data katalog mengikuti deck 2026: harga, ukuran, dan spesifikasi verbatim
// dari server/scripts/seed-media-types.mjs (pola yang sama dipakai
// leadTime.test.ts). Sebagian `rules` DIPENDEKKAN — bukan verbatim deck —
// lihat catatan pada entri Spanduk.
const MEDIA: PromoMediaType[] = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '/media/spanduk.webp', price_note: 'Rp. 70.000,-/hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat',
    rules: [
      'Harga belum termasuk PPN.',
      // 'Minimal sewa 1 minggu.' adalah BENTUK PENDEK, bukan verbatim deck.
      // Deck aslinya: 'Minimal sewa pemasangan media promosi outdoor yakni 1
      // minggu (7 hari) dan dapat diperpanjang sesuai dengan kebutuhan.'
      // Bentuk pendek dipertahankan karena test "expandable rules per kartu"
      // mengunci frasa /Minimal sewa 1 minggu/i. Baris terakhir kalimat deck
      // verbatim, dipakai menguji baris lead time.
      'Minimal sewa 1 minggu.',
      'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.',
    ].join('\n'),
    sort_order: 1,
  },
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    size_spec: '800 x 600 Pixel (Landscape)', material_spec: 'JPEG/MP4, durasi 30 detik',
    accepted_formats: 'JPEG,PNG,MP4', image_path: '/media/videotron.webp',
    // Multi-tarif TANPA kata di depan `Rp.` — tiap baris harus tetap terbaca
    // sebagai baris tersendiri, bukan kolom kanan yang menggantung.
    price_note: [
      'Rp. 600.000,-/hari',
      'Rp. 4.200.000,-/7 hari',
      'Rp. 5.100.000,-/14 hari',
      'Rp. 10.000.000,-/30 hari',
    ].join('\n'),
    location_note: '',
    rules: 'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
    sort_order: 10,
  },
  {
    slug: 'videotron-integrasia', category: 'indoor', name: 'Videotron Integrasia',
    size_spec: '4 x 8m Horizontal (Resolusi 1025 x 1025)', material_spec: 'JPEG/MP4, durasi 15 detik',
    accepted_formats: 'JPEG,PNG,MP4', image_path: '/media/videotron-integrasia.webp',
    // Multi-tarif DENGAN kata di depan `Rp.` — harus jadi tangga dua kolom.
    price_note: [
      'Hari kerja Rp. 1.800.000,-',
      'Akhir pekan Rp. 2.500.000,-',
      'Mingguan Rp. 10.000.000,-',
      'Bulanan Rp. 35.000.000,-',
    ].join('\n'),
    location_note: '', rules: 'Harga belum termasuk PPN, biaya admin Rp. 10.000 dan materai Rp. 10.000.',
    sort_order: 12,
  },
  {
    slug: 'sosmed-feed', category: 'social', name: 'Feed Instagram/Fanpage/TikTok',
    size_spec: '800 x 800 Pixel (Square)', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', image_path: '', price_note: 'Gratis',
    location_note: '', rules: 'Mohon mengirimkan materi promosi pada hari dan jam kerja.', sort_order: 13,
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

  it('hero menautkan ke pelacakan nomor', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();

    expect(await screen.findByRole('link', { name: /Lacak dengan nomor pengajuan/i }))
      .toHaveAttribute('href', '/lacak');
  });

  it('error state saat katalog gagal dimuat', async () => {
    mockedFetchMediaTypes.mockRejectedValue(new Error('network'));
    renderLanding();

    expect(await screen.findByText(/Gagal memuat katalog media/i)).toBeInTheDocument();
  });

  it('menampilkan foto contoh dengan alt deskriptif, tanpa img bila kosong', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    const foto = screen.getByAltText('Contoh pemasangan Spanduk') as HTMLImageElement;
    expect(foto).toBeInTheDocument();
    expect(foto).toHaveAttribute('src', '/media/spanduk.webp');
    // Dimensi eksplisit mencegah pergeseran tata letak (CLS).
    expect(foto).toHaveAttribute('width', '800');
    expect(foto).toHaveAttribute('height', '600');

    // Media tanpa image_path tidak boleh menyisakan <img> kosong.
    expect(screen.queryByAltText('Contoh pemasangan Feed Instagram/Fanpage/TikTok')).not.toBeInTheDocument();
  });

  // Pemecahan harga rapuh (mem-parse string), jadi dikunci di sini.
  it('kartu Videotron menampilkan tiap nominal tarif verbatim di baris terpisah', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    const kartu = screen.getByText('Videotron').closest('article')!;
    const tarif = [
      'Rp. 600.000,-/hari',
      'Rp. 4.200.000,-/7 hari',
      'Rp. 5.100.000,-/14 hari',
      'Rp. 10.000.000,-/30 hari',
    ];
    for (const teks of tarif) {
      const baris = within(kartu).getByText(teks);
      expect(baris).toBeInTheDocument();
      // Baris tersendiri (block), bukan potongan satu baris panjang.
      expect(baris).toHaveClass('block');
    }
  });

  it('baris lead time muncul hanya untuk media yang rules-nya mengatur', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    // Spanduk: deck menyebut "2 hari sebelum pemasangan".
    const spanduk = screen.getByText('Spanduk').closest('article')!;
    expect(within(spanduk).getByText(/2 hari sebelum pemasangan/)).toBeInTheDocument();

    // sosmed-feed: rules tanpa kalimat lead time → tidak ada baris.
    const sosmed = screen.getByText('Feed Instagram/Fanpage/TikTok').closest('article')!;
    expect(within(sosmed).queryByText(/Materi diterima paling lambat/)).not.toBeInTheDocument();
  });

  it('baris tarif berlabel jadi dua kolom (nominal rata kanan), yang tanpa label tetap satu baris', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderLanding();
    await screen.findByText('Spanduk');

    // Integrasia: kata di kiri + nominal rata kanan dalam satu baris flex.
    const integrasia = screen.getByText('Videotron Integrasia').closest('article')!;
    const nominal = within(integrasia).getByText('Rp. 35.000.000,-');
    expect(nominal.parentElement).toHaveClass('justify-between');
    expect(nominal).toHaveClass('tabular-nums');
    expect(within(integrasia).getByText('Bulanan')).toBeInTheDocument();

    // Videotron: nominal TIDAK ditaruh di baris dua kolom.
    const videotron = screen.getByText('Videotron').closest('article')!;
    expect(within(videotron).getByText('Rp. 600.000,-/hari').parentElement)
      .not.toHaveClass('justify-between');
  });
});
