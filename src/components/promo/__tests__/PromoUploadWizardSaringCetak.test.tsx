/**
 * Test penyaringan kanal di langkah 1 wizard pengajuan DIGITAL
 * (`/ajukan` - PromoUploadWizard).
 *
 * Kontrak rapuh yang dikunci:
 *  - media berkanal 'cetak' TIDAK ditawarkan di wizard digital (kalau
 *    ditawarkan, tenant terpaksa mengunggah materi yang seharusnya menyusul
 *    lewat revisi di form cetak);
 *  - media berkanal 'digital' TETAP ditawarkan;
 *  - media TANPA penanda kanal (baris katalog warisan) TETAP ditawarkan dan
 *    tetap bisa dipilih - itulah alasan penyaringnya `!== 'cetak'`, bukan
 *    `=== 'digital'`;
 *  - pemanggilan API katalog tidak berubah (tanpa argumen kanal), sesuai
 *    komentar aditif di GET /promo/media-types.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
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

import {
  fetchMediaTypes, searchTenants, submitPromo, uploadFile,
} from '../../../utils/promoApi';

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);
const mockedSearchTenants = vi.mocked(searchTenants);
const mockedUploadFile = vi.mocked(uploadFile);
const mockedSubmitPromo = vi.mocked(submitPromo);

/**
 * Katalog uji: satu media digital, dua media cetak, dan satu media WARISAN
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
    slug: 'umbul-umbul', category: 'outdoor', name: 'Umbul-Umbul',
    size_spec: '0.6x4m', material_spec: 'Flexi', accepted_formats: 'JPEG,PDF',
    image_path: '', price_note: '', media_channel: 'cetak',
    location_note: '', rules: '', sort_order: 3,
  },
  {
    slug: 'feed-sosmed', category: 'social', name: 'Feed Sosial Warisan',
    size_spec: '800 x 800 px', material_spec: 'JPEG/MP4', accepted_formats: 'JPEG,MP4',
    image_path: '', price_note: '', location_note: '', rules: '', sort_order: 20,
  },
];

function renderWizard(route = '/ajukan') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PromoUploadWizard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-saring-cetak');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [] });
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
});

describe('PromoUploadWizard - penyaringan media kanal cetak di langkah 1', () => {
  it('tidak menawarkan media berkanal cetak, menawarkan digital dan tanpa kanal', async () => {
    renderWizard();
    await screen.findByText('Pilih Jenis Media Promosi');

    // Media digital: tetap ditawarkan.
    expect(await screen.findByLabelText(/Videotron/)).toBeInTheDocument();
    // Media tanpa penanda kanal: tetap ditawarkan (kompatibilitas warisan).
    expect(screen.getByLabelText(/Feed Sosial Warisan/)).toBeInTheDocument();
    // Media cetak: TIDAK ditawarkan di wizard digital.
    expect(screen.queryByLabelText(/Spanduk/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Umbul-Umbul/)).not.toBeInTheDocument();
  });

  it('memanggil katalog tanpa argumen kanal (perilaku API tidak diubah)', async () => {
    renderWizard();
    await screen.findByText('Pilih Jenis Media Promosi');

    expect(mockedFetchMediaTypes).toHaveBeenCalledTimes(1);
    expect(mockedFetchMediaTypes.mock.calls[0]).toEqual([]);
  });

  it('media tanpa penanda kanal tetap bisa dipilih dan lanjut ke langkah 2', async () => {
    renderWizard();
    await screen.findByText('Pilih Jenis Media Promosi');

    fireEvent.click(screen.getByLabelText(/Feed Sosial Warisan/));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Data Tenant/i }));

    // Langkah 2 hanya terbuka bila slug media benar-benar terpilih.
    expect(await screen.findByLabelText(/Nama PIC/i)).toBeInTheDocument();
  });
});
