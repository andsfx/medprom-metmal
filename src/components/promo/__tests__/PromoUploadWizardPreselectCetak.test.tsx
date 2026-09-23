/**
 * Test pra-pilih media lewat query param `?media=` pada wizard pengajuan
 * DIGITAL (`/ajukan` - PromoUploadWizard).
 *
 * Kontrak rapuh yang dikunci:
 *  - slug berkanal 'cetak' (spanduk/big-banner/umbul-umbul) TIDAK boleh
 *    melompat ke langkah 2 di wizard digital - kalau dibiarkan, pengguna
 *    mengisi langkah 2 dan 3 dulu, baru ditolak server di akhir. Ia harus
 *    dialihkan ke form cetak `/ajukan-cetak?media=<slug>`, yang membaca param
 *    yang sama dan langsung pra-memilih slug itu;
 *  - slug berkanal 'digital' TETAP memakai perilaku lama: terpilih + langsung
 *    langkah 2;
 *  - slug TANPA `media_channel` (baris katalog warisan) juga tetap perilaku
 *    lama - itulah alasan penjaganya `=== 'cetak'`, bukan `!== 'digital'`.
 *
 * Pengalihan rute diuji dengan `MemoryRouter` + `Routes`: rute `/ajukan` dan
 * rute stub `/ajukan-cetak`. Stub itu yang membuktikan navigasi benar-benar
 * berpindah, bukan sekadar nilai state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import PromoUploadWizard from '../PromoUploadWizard';
import type { PromoMediaType } from '../../../types/promo';
import type * as PromoApi from '../../../utils/promoApi';

// Mock promoApi - wizard tidak boleh melakukan network nyata di unit test.
vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof PromoApi>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(),
    searchTenants: vi.fn(),
    uploadFile: vi.fn(),
    submitPromo: vi.fn(),
  };
});

import { fetchMediaTypes, searchTenants } from '../../../utils/promoApi';

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);
const mockedSearchTenants = vi.mocked(searchTenants);

/**
 * Katalog uji: satu media digital, satu media cetak, dan satu media WARISAN
 * tanpa `media_channel` (tiruan baris katalog yang belum di-backfill).
 */
const MEDIA: PromoMediaType[] = [
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    size_spec: '800 x 600 px', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,MP4', image_path: '', price_note: 'Rp 600rb/hari',
    media_channel: 'digital', location_note: '', rules: 'Aturan videotron.', sort_order: 10,
  },
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9x6m', material_spec: 'Flexi', accepted_formats: 'JPEG,PDF',
    image_path: '', price_note: '', media_channel: 'cetak',
    location_note: '', rules: '', sort_order: 1,
  },
  {
    slug: 'feed-sosmed', category: 'social', name: 'Feed Sosial Warisan',
    size_spec: '800 x 800 px', material_spec: 'JPEG/MP4', accepted_formats: 'JPEG,MP4',
    image_path: '', price_note: '', location_note: '', rules: '', sort_order: 20,
  },
];

/**
 * Stub form cetak: menandai rute tujuan sekaligus membeberkan query param
 * `media` yang diterimanya - cerminan cara `PromoCetakWizard` membacanya.
 */
function StubCetak() {
  const { search } = useLocation();
  return (
    <div>
      <h1>STUB FORM CETAK</h1>
      <p data-testid="stub-cetak-search">{search}</p>
    </div>
  );
}

/** Rute tujuan pengalihan: `/ajukan-cetak` (stub, bukan form cetak asli). */
function renderWizard(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/ajukan" element={<PromoUploadWizard />} />
        <Route path="/ajukan-cetak" element={<StubCetak />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-preselect-cetak');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [] });
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
});

describe('PromoUploadWizard - pra-pilih ?media= untuk kanal cetak', () => {
  it('media cetak dialihkan ke /ajukan-cetak, TIDAK melompat ke langkah 2', async () => {
    renderWizard('/ajukan?media=spanduk');

    // Tujuan: form cetak tampil dengan slug yang sama.
    expect(await screen.findByRole('heading', { name: 'STUB FORM CETAK' })).toBeInTheDocument();
    expect(screen.getByTestId('stub-cetak-search')).toHaveTextContent('?media=spanduk');

    // Langkah 2 wizard digital tidak pernah terbuka (tidak ada field Data Tenant).
    expect(screen.queryByLabelText(/Nama PIC/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Pilih Jenis Media Promosi')).not.toBeInTheDocument();
  });

  it('media digital tetap perilaku lama: terpilih + langsung langkah 2', async () => {
    renderWizard('/ajukan?media=videotron');

    // Langkah 2 terbuka; pengguna tidak dialihkan ke form cetak.
    expect(await screen.findByLabelText(/Nama PIC/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'STUB FORM CETAK' })).not.toBeInTheDocument();
  });

  it('media tanpa media_channel tetap perilaku lama (kompatibilitas warisan)', async () => {
    renderWizard('/ajukan?media=feed-sosmed');

    expect(await screen.findByLabelText(/Nama PIC/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'STUB FORM CETAK' })).not.toBeInTheDocument();
  });
});
