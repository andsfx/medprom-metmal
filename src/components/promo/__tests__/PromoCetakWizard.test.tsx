/**
 * Mount test wizard pengajuan cetak.
 *
 * Kontrak rapuh yang dikunci:
 *  - dua jenis pemohon (tenant / non-tenant) tersedia dan berpengaruh ke field;
 *  - hanya media berkanal 'cetak' yang ditawarkan, dan beberapa media bisa
 *    dipilih sekaligus (checkbox, bukan radio);
 *  - minimal sewa 7 hari ditegakkan di klien sebelum lanjut;
 *  - ringkasan menampilkan PPN 11%.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    size_spec: '800 x 600 px', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,MP4', image_path: '', price_note: 'Rp. 600.000,-/hari',
    location_note: '', rules: '', sort_order: 10,
    media_channel: 'digital', price_amount: 600000, price_unit: 'hari', ppn_included: true,
  },
];

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-cetak');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [
    { id: 'T001', name: 'Optik Melawai', floor: '1', lot: 'A-01', category: 'Fashion' },
  ] });
});

function renderWizard(route = '/ajukan-cetak') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PromoCetakWizard />
    </MemoryRouter>,
  );
}

/** Isi langkah 1 dengan pemohon non-tenant. */
async function isiPemohonNonTenant() {
  fireEvent.click(await screen.findByRole('button', { name: 'Non-tenant' }));
  fireEvent.change(screen.getByLabelText(/Nama Non Tenant/i), { target: { value: 'PT Contoh' } });
  fireEvent.change(screen.getByLabelText(/Nama Pemohon/i), { target: { value: 'Andi' } });
  fireEvent.change(screen.getByLabelText(/Nomor Telepon/i), { target: { value: '081234567890' } });
}

describe('PromoCetakWizard — langkah 1 (pemohon)', () => {
  it('menawarkan dua jenis pemohon: Tenant dan Non-tenant', async () => {
    renderWizard();
    expect(await screen.findByRole('button', { name: 'Tenant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Non-tenant' })).toBeInTheDocument();
  });

  it('memilih Non-tenant memunculkan field Nama Non Tenant', async () => {
    renderWizard();
    await screen.findByRole('button', { name: 'Non-tenant' });
    expect(screen.queryByLabelText(/Nama Non Tenant/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Non-tenant' }));
    expect(await screen.findByLabelText(/Nama Non Tenant/i)).toBeInTheDocument();
  });

  it('field wajib kosong → pesan galat, tidak lanjut langkah', async () => {
    renderWizard();
    await screen.findByRole('button', { name: 'Tenant' });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));
    expect(await screen.findByText(/Nama pemohon wajib diisi/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Pilih Media & Periode/i })).not.toBeInTheDocument();
  });
});

describe('PromoCetakWizard — langkah 2 (multi-media)', () => {
  it('hanya menawarkan media berkanal cetak, bukan digital', async () => {
    renderWizard();
    await isiPemohonNonTenant();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));

    expect(await screen.findByLabelText(/Spanduk/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Umbul-Umbul/)).toBeInTheDocument();
    // Videotron berkanal digital → tidak ditawarkan di form cetak.
    expect(screen.queryByLabelText(/Videotron/)).not.toBeInTheDocument();
  });

  it('beberapa media bisa dipilih sekaligus (checkbox)', async () => {
    renderWizard();
    await isiPemohonNonTenant();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));

    const spanduk = await screen.findByLabelText(/Spanduk/);
    const umbul = screen.getByLabelText(/Umbul-Umbul/);
    expect(spanduk).toHaveAttribute('type', 'checkbox');
    fireEvent.click(spanduk);
    fireEvent.click(umbul);
    expect((spanduk as HTMLInputElement).checked).toBe(true);
    expect((umbul as HTMLInputElement).checked).toBe(true);
  });

  it('periode kurang dari 7 hari ditolak saat lanjut ringkasan', async () => {
    renderWizard();
    await isiPemohonNonTenant();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));
    fireEvent.click(await screen.findByLabelText(/Spanduk/));

    fireEvent.change(screen.getByLabelText(/Lokasi Pemasangan/i), { target: { value: 'Pintu Tol' } });
    fireEvent.change(screen.getByLabelText(/Periode Mulai/i), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(/Periode Selesai/i), { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));

    expect(await screen.findByText(/Media ke-1: Minimal sewa.*7 hari.*terisi 3 hari/i)).toBeInTheDocument();
    // Tetap di langkah 2 — ringkasan belum dirender.
    expect(screen.queryByRole('heading', { name: /Ringkasan & Kirim/i })).not.toBeInTheDocument();
  });
});

describe('PromoCetakWizard — langkah 3 (ringkasan & kirim)', () => {
  async function isiSampaiRingkasan() {
    renderWizard();
    await isiPemohonNonTenant();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));
    fireEvent.click(await screen.findByLabelText(/Spanduk/));
    fireEvent.change(screen.getByLabelText(/Lokasi Pemasangan/i), { target: { value: 'Pintu Tol' } });
    fireEvent.change(screen.getByLabelText(/Periode Mulai/i), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(/Periode Selesai/i), { target: { value: '2026-10-07' } });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
  }

  it('ringkasan menampilkan PPN 11% dan total', async () => {
    await isiSampaiRingkasan();
    expect(await screen.findByRole('heading', { name: /Ringkasan & Kirim/i })).toBeInTheDocument();
    // Spanduk 70.000 x 7 hari = 490.000; PPN 11% = 53.900; total 543.900.
    expect(screen.getByText('PPN 11%')).toBeInTheDocument();
    expect(screen.getByText('Rp. 53.900')).toBeInTheDocument();
    expect(screen.getByText('Rp. 543.900')).toBeInTheDocument();
  });

  it('angka PPN ditandai sebagai perkiraan, bukan tagihan final', async () => {
    await isiSampaiRingkasan();
    // Tidak ada penagihan di aplikasi ini — label harus jujur.
    expect(await screen.findByText(/Perkiraan; harga final sesuai penawaran/i)).toBeInTheDocument();
  });

  it('tombol kirim nonaktif sampai ketentuan disetujui', async () => {
    await isiSampaiRingkasan();
    const kirim = await screen.findByRole('button', { name: /Kirim Pengajuan/i });
    expect(kirim).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Saya menyatakan/i));
    expect(kirim).not.toBeDisabled();
  });

  it('kirim sukses menampilkan nomor batch dan nomor per media', async () => {
    mockedSubmitBatch.mockResolvedValue({
      batch_id: 'b1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok',
      applicant_type: 'non_tenant', created_at: '2026-09-20T00:00:00Z',
      items: [
        { id: 's1', submission_number: 'MP-260920-AAA234', status_token: 't1', media_type_slug: 'spanduk', status: 'menunggu_review', subtotal: 490000, ppn_amount: 53900, total_amount: 543900 },
      ],
    });
    await isiSampaiRingkasan();
    fireEvent.click(screen.getByLabelText(/Saya menyatakan/i));
    fireEvent.click(screen.getByRole('button', { name: /Kirim Pengajuan/i }));

    await waitFor(() => expect(mockedSubmitBatch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('MPB-260920-ABC234')).toBeInTheDocument();
    expect(screen.getByText('MP-260920-AAA234')).toBeInTheDocument();
    // Payload: jenis pemohon non-tenant dan satu item cetak.
    const payload = mockedSubmitBatch.mock.calls[0][0];
    expect(payload.applicant_type).toBe('non_tenant');
    expect(payload.tenant_name).toBe('PT Contoh');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].media_type_slug).toBe('spanduk');
  });
});
