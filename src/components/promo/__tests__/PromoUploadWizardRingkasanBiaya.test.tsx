/**
 * Test blok "Ringkasan biaya" langkah 3 wizard pengajuan DIGITAL.
 *
 * Kontrak rapuh yang dikunci:
 *  - langkah 3 menampilkan label "Ringkasan biaya" + tarif media VERBATIM
 *    dari katalog (bukan total hitungan): deck digital tidak mengatur
 *    prorata/qty, jadi menghitung harga × qty × hari + PPN di sini sama dengan
 *    mengarang kebijakan harga. Perhitungan presisi hanya sah untuk kanal
 *    cetak (PromoCetakWizard).
 *  - media dengan `price_note` → teks note tampil utuh;
 *  - media tangga tarif (`price_note` multi-baris) → SEMUA baris tarif tampil;
 *  - blok TIDAK tampil di langkah 1 dan 2.
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

import { fetchMediaTypes, searchTenants } from '../../../utils/promoApi';

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);
const mockedSearchTenants = vi.mocked(searchTenants);

/** Katalog uji: media tangga tarif, tarif tunggal ber-note, dan gratis. */
const MEDIA: PromoMediaType[] = [
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    size_spec: '800 x 600 px', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', image_path: '',
    price_note: [
      'Rp. 600.000,-/hari',
      'Rp. 4.200.000,-/7 hari',
    ].join('\n'),
    media_channel: 'digital', location_note: '', rules: 'Aturan videotron.', sort_order: 10,
  },
  {
    slug: 'sticker-eskalator', category: 'indoor', name: 'Sticker Eskalator',
    size_spec: '65 x 800 CM', material_spec: 'Sticker Vynil',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '',
    price_note: 'Rp. 6.700.000,-/sisi/bulan',
    media_channel: 'digital', location_note: '', rules: '', sort_order: 7,
  },
  {
    slug: 'digital-poster', category: 'indoor', name: 'Digital Poster',
    size_spec: '1920 x 1080 px', material_spec: 'JPEG',
    accepted_formats: 'JPEG', image_path: '',
    price_note: 'Gratis',
    media_channel: 'digital', location_note: '', rules: '', sort_order: 6,
  },
];

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/ajukan']}>
      <PromoUploadWizard />
    </MemoryRouter>,
  );
}

/** Isi seluruh field wajib langkah 2 (PRD §9.3). */
async function fillStep2Fields() {
  fireEvent.change(await screen.findByLabelText(/Nama PIC/i), { target: { value: 'Andi PIC' } });
  fireEvent.change(screen.getByLabelText(/Nomor Telepon PIC/i), { target: { value: '081234567890' } });
  fireEvent.change(screen.getByLabelText(/Nama Campaign/i), { target: { value: 'Promo Akhir Tahun' } });
  fireEvent.change(screen.getByLabelText(/Judul Materi/i), { target: { value: 'Materi Promo' } });
  fireEvent.change(screen.getByLabelText(/Deskripsi Materi/i), { target: { value: 'Deskripsi promo.' } });
  fireEvent.change(screen.getByLabelText(/Jenis Materi/i), { target: { value: 'Promosi' } });
  fireEvent.change(screen.getByLabelText(/Media \/ Lokasi Pemasangan/i), { target: { value: 'Atrium 1' } });
}

/** Pilih tenant dari combobox pencarian. */
async function pickTenant(name = 'Optik Melawai') {
  fireEvent.change(screen.getByLabelText(/Nama Tenant/i), { target: { value: name } });
  fireEvent.click(await screen.findByText(name));
}

/** Pilih media lalu isi langkah 2 sampai langkah 3 terbuka. */
async function wizardToStep3(mediaName: RegExp) {
  await screen.findByText('Pilih Jenis Media Promosi');
  fireEvent.click(screen.getByLabelText(mediaName));
  fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Data Tenant/i }));
  await screen.findByLabelText(/Nama PIC/i);
  await fillStep2Fields();
  await pickTenant();
  fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Kirim Materi/i }));
  await screen.findByRole('heading', { name: 'Kirim Materi' });
}

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-ringkasan-biaya');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  mockedSearchTenants.mockResolvedValue({
    available: true,
    tenants: [{ id: 'T001', name: 'Optik Melawai', floor: '1', lot: 'A-01', category: 'Fashion' }],
  });
});

describe('PromoUploadWizard — ringkasan biaya langkah 3', () => {
  it('langkah 3 menampilkan label "Ringkasan biaya" + tarif verbatim', async () => {
    renderWizard();
    await wizardToStep3(/Sticker Eskalator/i);

    expect(screen.getByText('Ringkasan biaya')).toBeInTheDocument();
    expect(screen.getByText('Tarif')).toBeInTheDocument();
    // Nilai tarif persis dari katalog, tidak dirangkum jadi angka lain.
    expect(screen.getByText('Rp. 6.700.000,-/sisi/bulan')).toBeInTheDocument();
  });

  it('media dengan price_note → teks note tampil utuh', async () => {
    renderWizard();
    await wizardToStep3(/Sticker Eskalator/i);

    // Teks deck verbatim, termasuk tanda baca aslinya.
    expect(screen.getByText('Rp. 6.700.000,-/sisi/bulan')).toBeInTheDocument();
  });

  it('media tangga tarif → semua baris tarif tampil', async () => {
    renderWizard();
    await wizardToStep3(/Videotron/i);

    // Dua baris deck tampil keduanya; tidak dipilih satu saja.
    expect(screen.getByText('Rp. 600.000,-/hari')).toBeInTheDocument();
    expect(screen.getByText('Rp. 4.200.000,-/7 hari')).toBeInTheDocument();
  });

  it('media gratis → nilai verbatim "Gratis" tetap tampil', async () => {
    renderWizard();
    await wizardToStep3(/Digital Poster/i);

    expect(screen.getByText('Gratis')).toBeInTheDocument();
  });

  it('blok ringkasan biaya TIDAK tampil di langkah 1 dan 2', async () => {
    renderWizard();
    await screen.findByText('Pilih Jenis Media Promosi');

    // Langkah 1: belum ada ringkasan biaya.
    expect(screen.queryByText('Ringkasan biaya')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Sticker Eskalator/i));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Data Tenant/i }));
    await screen.findByLabelText(/Nama PIC/i);

    // Langkah 2: masih belum ada.
    expect(screen.queryByText('Ringkasan biaya')).not.toBeInTheDocument();
  });
});
