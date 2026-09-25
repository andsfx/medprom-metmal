/**
 * Kontrak preselect wizard cetak.
 *
 * Bug yang dikunci: membuka `/ajukan-cetak?media=<slug>` (mis. dari kartu
 * katalog cetak di landing) dulu langsung melompat ke langkah 2 "Pilih Media
 * & Periode", padahal langkah 1 "Data Pemohon" (pilih Tenant/Non-tenant) belum
 * diisi. Wizard cetak selalu harus dimulai dari langkah Data Pemohon; media
 * dari katalog hanya ditandai terpilih lebih awal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PromoCetakWizard from '../PromoCetakWizard';
import type { PromoMediaType } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(),
    searchTenants: vi.fn(),
    submitBatch: vi.fn(),
  };
});

import { fetchMediaTypes, searchTenants, submitBatch } from '../../../utils/promoApi';

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);
const mockedSearchTenants = vi.mocked(searchTenants);
const mockedSubmitBatch = vi.mocked(submitBatch);

const MEDIA: PromoMediaType[] = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 70.000,-/hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat', rules: '', sort_order: 1,
    media_channel: 'cetak', price_amount: 70000, price_unit: 'hari', ppn_included: false,
  },
  {
    slug: 'umbul-umbul', category: 'outdoor', name: 'Umbul-Umbul',
    size_spec: '0.9 x 4.8 M', material_spec: 'Flexi 440gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 288.000,-/hari/16 tiang',
    location_note: '', rules: '', sort_order: 3,
    media_channel: 'cetak', price_amount: 288000, price_unit: 'hari/16 tiang', ppn_included: false,
  },
];

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-preselect-cetak');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [] });
  mockedSubmitBatch.mockResolvedValue({} as never);
});

function renderWizard(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PromoCetakWizard />
    </MemoryRouter>,
  );
}

describe('PromoCetakWizard — preselect media cetak', () => {
  it('?media=spanduk mendarat di langkah Data Pemohon, bukan Pilih Media', async () => {
    renderWizard('/ajukan-cetak?media=spanduk');

    // Langkah Data Pemohon terbuka: pilihan Tenant/Non-tenant tersedia.
    expect(await screen.findByRole('button', { name: 'Tenant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Non-tenant' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Data Pemohon/i })).toBeInTheDocument();

    // Langkah Pilih Media TIDAK terbuka lebih awal.
    expect(screen.queryByRole('heading', { name: /Pilih Media & Periode/i })).not.toBeInTheDocument();
  });

  it('media dari katalog tetap tercentang saat langkah Pilih Media dibuka', async () => {
    renderWizard('/ajukan-cetak?media=spanduk');

    fireEvent.click(await screen.findByRole('button', { name: 'Non-tenant' }));
    fireEvent.change(screen.getByLabelText(/Nama Non Tenant/i), { target: { value: 'PT Contoh' } });
    fireEvent.change(screen.getByLabelText(/Nama Pemohon/i), { target: { value: 'Andi' } });
    fireEvent.change(screen.getByLabelText(/Nomor Telepon/i), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));

    expect(await screen.findByRole('heading', { name: /Pilih Media & Periode/i })).toBeInTheDocument();
    // Spanduk sudah tercentang karena dipilih dari katalog.
    expect((screen.getByLabelText(/Spanduk/) as HTMLInputElement).checked).toBe(true);
    // Media lain tidak ikut tercentang.
    expect((screen.getByLabelText(/Umbul-Umbul/) as HTMLInputElement).checked).toBe(false);
  });

  it('tanpa ?media= tetap mulai dari langkah Data Pemohon', async () => {
    renderWizard('/ajukan-cetak');
    expect(await screen.findByRole('button', { name: 'Tenant' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Pilih Media & Periode/i })).not.toBeInTheDocument();
  });

  it('langkah Data Pemohon menampilkan penanda media yang dipilih dari katalog', async () => {
    renderWizard('/ajukan-cetak?media=spanduk');
    expect(await screen.findByText(/Media terpilih: Spanduk/i)).toBeInTheDocument();
  });

  it('tanpa media terpilih, penanda tidak ditampilkan', async () => {
    renderWizard('/ajukan-cetak');
    await screen.findByRole('button', { name: 'Tenant' });
    expect(screen.queryByText(/Media terpilih:/i)).not.toBeInTheDocument();
  });
});
