/**
 * Test khusus TOTAL & label PPN wizard pengajuan cetak (defect B1).
 *
 * Kontrak rapuh yang dikunci:
 *  - Total ringkasan = Σ `totalAmount` (satu sumber kebenaran), BUKAN
 *    subtotal + PPN. Media ber-`ppn_included` true menyimpan PPN DI DALAM
 *    subtotal, sehingga menambahkannya lagi = PPN dihitung dua kali.
 *  - Baris per media: `ppn_included` true → "sudah termasuk PPN ...";
 *    `ppn_included` false → "subtotal + PPN ... = total".
 *  - Label PPN agregat tetap PERSIS "PPN 11%" selama tidak ada media yang
 *    sudah termasuk PPN, dan berubah bila ada.
 *  - Kalimat "Perkiraan; harga final sesuai penawaran Tenant Relations" tetap ada.
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

import { fetchMediaTypes, searchTenants } from '../../../utils/promoApi';

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);
const mockedSearchTenants = vi.mocked(searchTenants);

/**
 * Katalog uji: dua media berkanal cetak dengan perlakuan PPN berbeda.
 *  - `spanduk`    → ppn_included false (PPN ditambahkan di atas subtotal)
 *  - `big-banner` → ppn_included true  (PPN sudah di dalam subtotal)
 * Media digital (`videotron`) disertakan untuk memastikan hanya kanal cetak
 * yang dihitung.
 */
const MEDIA: PromoMediaType[] = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 70.000,-/hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat', rules: '', sort_order: 1,
    media_channel: 'cetak', price_amount: 70000, price_unit: 'hari', ppn_included: false,
  },
  {
    slug: 'big-banner', category: 'indoor', name: 'Big Banner',
    size_spec: '2.0 M x 4.0 M', material_spec: 'Flexi 440gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 500.000,-/hari',
    location_note: '', rules: '', sort_order: 5,
    media_channel: 'cetak', price_amount: 500000, price_unit: 'hari', ppn_included: true,
  },
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    size_spec: '800 x 600 px', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,MP4', image_path: '', price_note: 'Rp. 600.000,-/hari',
    location_note: '', rules: '', sort_order: 10,
    media_channel: 'digital', price_amount: 600000, price_unit: 'hari', ppn_included: true,
  },
];

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-cetak-total');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [] });
});

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/ajukan-cetak']}>
      <PromoCetakWizard />
    </MemoryRouter>,
  );
}

/** Isi langkah 1 dengan pemohon non-tenant lalu masuk ke langkah 2. */
async function masukLangkah2() {
  fireEvent.click(await screen.findByRole('button', { name: 'Non-tenant' }));
  fireEvent.change(screen.getByLabelText(/Nama Non Tenant/i), { target: { value: 'PT Contoh' } });
  fireEvent.change(screen.getByLabelText(/Nama Pemohon/i), { target: { value: 'Andi' } });
  fireEvent.change(screen.getByLabelText(/Nomor Telepon/i), { target: { value: '081234567890' } });
  fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));
  await screen.findByRole('heading', { name: /Pilih Media & Periode/i });
}

/**
 * Isi baris ke-`idx` (0-based, urut DOM). Dipakai agar test tetap sah saat ada
 * lebih dari satu baris lokasi di halaman.
 */
function isiBaris(idx: number, target: string, mulai: string, selesai: string) {
  const lokasi = screen.getAllByLabelText(/Lokasi Pemasangan/i)[idx]!;
  const mulaiField = screen.getAllByLabelText(/Periode Mulai/i)[idx]!;
  const selesaiField = screen.getAllByLabelText(/Periode Selesai/i)[idx]!;
  fireEvent.change(lokasi, { target: { value: target } });
  fireEvent.change(mulaiField, { target: { value: mulai } });
  fireEvent.change(selesaiField, { target: { value: selesai } });
}

describe('PromoCetakWizard — total & label PPN (ppn_included)', () => {
  it('campuran media termasuk/belum termasuk PPN: Total = Σ totalAmount, bukan subtotal + PPN', async () => {
    renderWizard();
    await masukLangkah2();

    // Spanduk: 70.000 x 7 hari = 490.000 + PPN 11% (53.900) = 543.900.
    fireEvent.click(screen.getByLabelText(/Spanduk/));
    isiBaris(0, 'Pintu Tol', '2026-10-01', '2026-10-07');

    // Big Banner: 500.000 x 7 hari = 3.500.000 (SUDAH termasuk PPN).
    fireEvent.click(screen.getByLabelText(/Big Banner/));
    isiBaris(1, 'Atrium', '2026-10-01', '2026-10-07');

    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    // Σ totalAmount = 543.900 + 3.500.000 = 4.043.900.
    expect(screen.getByText('Rp. 4.043.900')).toBeInTheDocument();
    // Bentuk lama (subtotal + PPN) = 3.990.000 + 400.746,85 → salah.
    expect(screen.queryByText('Rp. 4.390.746,85')).not.toBeInTheDocument();
    // Subtotal tetap ditampilkan apa adanya (Σ subtotal).
    expect(screen.getByText('Rp. 3.990.000')).toBeInTheDocument();
  });

  it('label agregat berubah jadi "Termasuk PPN" bila ada media ber-ppn_included', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByLabelText(/Big Banner/));
    isiBaris(0, 'Atrium', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    expect(screen.getByText('Termasuk PPN')).toBeInTheDocument();
    expect(screen.queryByText('PPN 11%')).not.toBeInTheDocument();
  });

  it('baris media ber-ppn_included memakai bentuk "sudah termasuk PPN", bukan subtotal + PPN', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByLabelText(/Big Banner/));
    isiBaris(0, 'Atrium', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    // 3.500.000 sudah termasuk PPN; porsi PPN di dalamnya 346.846,85.
    expect(screen.getByText('Rp. 3.500.000 (sudah termasuk PPN Rp. 346.846,85)')).toBeInTheDocument();
    // Kalimat bertentangan versi lama tidak boleh muncul.
    expect(screen.queryByText(/Rp. 3.500.000 \+ PPN/)).not.toBeInTheDocument();
  });

  it('media belum termasuk PPN tetap memakai bentuk subtotal + PPN = total', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByLabelText(/Spanduk/));
    isiBaris(0, 'Pintu Tol', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    expect(screen.getByText('Rp. 490.000 + PPN Rp. 53.900 = Rp. 543.900')).toBeInTheDocument();
  });

  it('semua media belum termasuk PPN: label agregat tetap PERSIS "PPN 11%" dan Total = Σ totalAmount', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByLabelText(/Spanduk/));
    isiBaris(0, 'Pintu Tol', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    expect(screen.getByText('PPN 11%')).toBeInTheDocument();
    expect(screen.getByText('Rp. 543.900')).toBeInTheDocument();
  });

  it('kalimat "Perkiraan; harga final sesuai penawaran Tenant Relations" tetap ada', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByLabelText(/Big Banner/));
    isiBaris(0, 'Atrium', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    expect(screen.getByText(/Perkiraan; harga final sesuai penawaran/i)).toBeInTheDocument();
  });

  it('blok harga langkah 2 memakai label "Termasuk PPN" untuk media ber-ppn_included', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByLabelText(/Big Banner/));
    isiBaris(0, 'Atrium', '2026-10-01', '2026-10-07');

    // Hanya satu media terpilih dan ia termasuk PPN → tidak ada label "PPN 11%".
    expect(screen.getByText('Termasuk PPN')).toBeInTheDocument();
    expect(screen.queryByText('PPN 11%')).not.toBeInTheDocument();
  });

  it('media ber-ppn_included tidak menambah PPN ke total (Rp 700.000 tetap Rp 700.000)', async () => {
    mockedFetchMediaTypes.mockResolvedValue([{
      slug: 'big-banner', category: 'indoor', name: 'Big Banner',
      size_spec: '2.0 M x 4.0 M', material_spec: 'Flexi 440gr',
      accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: '',
      location_note: '', rules: '', sort_order: 5,
      media_channel: 'cetak', price_amount: 100000, price_unit: 'hari', ppn_included: true,
    }]);
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByLabelText(/Big Banner/));
    // 100.000 x 7 hari → subtotal 700.000 (sudah termasuk PPN 69.369,37).
    isiBaris(0, 'Atrium', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    expect(screen.getByText('Rp. 700.000 (sudah termasuk PPN Rp. 69.369,37)')).toBeInTheDocument();
    // Total versi lama (subtotal + PPN) = 769.369,37 → tidak boleh muncul.
    expect(screen.queryByText('Rp. 769.369,37')).not.toBeInTheDocument();
  });
});
