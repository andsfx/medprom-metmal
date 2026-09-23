/**
 * Test wizard pengajuan cetak: satu media boleh dipasang di BEBERAPA lokasi
 * dalam satu pengajuan (defect B2), dan daftar media dikelompokkan per
 * kategori Outdoor / Indoor (B3).
 *
 * Kontrak rapuh yang dikunci:
 *  - checkbox per media tetap ber-id `cetak-media-<slug>`; mencentang = satu
 *    baris lokasi, menghapus centang = semua baris media itu hilang;
 *  - tombol "Tambah lokasi lain" menambah baris berikutnya untuk media yang sama;
 *  - validasi langkah 3 tetap per baris (kunci error tidak bertabrakan);
 *  - payload `submitBatch` mengirim slug yang sama dua kali bila dua lokasi;
 *  - batas MAX_BATCH_ITEMS (10) dihitung pada jumlah BARIS;
 *  - draf `sessionStorage` bentuk lama (baris tanpa `id`) tetap dipulihkan;
 *  - daftar media dikelompokkan per kategori dengan label dari CATEGORY_LABELS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PromoCetakWizard from '../PromoCetakWizard';
import { MAX_BATCH_ITEMS } from '../../../constants/promo';
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

const DRAFT_KEY = 'metmal_promo_cetak_draft';

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
    slug: 'big-banner', category: 'indoor', name: 'Big Banner',
    size_spec: '2.0 M x 4.0 M', material_spec: 'Flexi 440gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 500.000,-/hari',
    location_note: '', rules: '', sort_order: 5,
    media_channel: 'cetak', price_amount: 500000, price_unit: 'hari', ppn_included: true,
  },
];

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-cetak-b2');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [] });
  mockedSubmitBatch.mockResolvedValue({
    batch_id: 'b1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok',
    applicant_type: 'non_tenant', created_at: '2026-09-20T00:00:00Z',
    items: [
      { id: 's1', submission_number: 'MP-1', status_token: 't1', media_type_slug: 'spanduk', status: 'menunggu_review', subtotal: 490000, ppn_amount: 53900, total_amount: 543900 },
      { id: 's2', submission_number: 'MP-2', status_token: 't2', media_type_slug: 'spanduk', status: 'menunggu_review', subtotal: 490000, ppn_amount: 53900, total_amount: 543900 },
    ],
  });
});

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/ajukan-cetak']}>
      <PromoCetakWizard />
    </MemoryRouter>,
  );
}

async function masukLangkah2() {
  fireEvent.click(await screen.findByRole('button', { name: 'Non-tenant' }));
  fireEvent.change(screen.getByLabelText(/Nama Non Tenant/i), { target: { value: 'PT Contoh' } });
  fireEvent.change(screen.getByLabelText(/Nama Pemohon/i), { target: { value: 'Andi' } });
  fireEvent.change(screen.getByLabelText(/Nomor Telepon/i), { target: { value: '081234567890' } });
  fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));
  await screen.findByRole('heading', { name: /Pilih Media & Periode/i });
}

function isiBaris(idx: number, target: string, mulai: string, selesai: string) {
  fireEvent.change(screen.getAllByLabelText(/Lokasi Pemasangan/i)[idx]!, { target: { value: target } });
  fireEvent.change(screen.getAllByLabelText(/Periode Mulai/i)[idx]!, { target: { value: mulai } });
  fireEvent.change(screen.getAllByLabelText(/Periode Selesai/i)[idx]!, { target: { value: selesai } });
}

describe('PromoCetakWizard — satu media di beberapa lokasi (B2)', () => {
  it('mencentang media menambah satu baris lokasi saja (bukan langsung dua)', async () => {
    renderWizard();
    await masukLangkah2();
    expect(screen.queryAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(0);

    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    expect(screen.getAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(1);
    // Satu baris saja → getByLabelText (tunggal) harus berhasil.
    expect(screen.getByLabelText(/Lokasi Pemasangan/i)).toBeInTheDocument();
  });

  it('tombol "Tambah lokasi lain" menambah baris kedua untuk media yang sama', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));

    fireEvent.click(screen.getByRole('button', { name: /Tambah lokasi lain/i }));
    expect(screen.getAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(2);
    // Checkbox media tetap satu dan tetap tercentang.
    expect(screen.getAllByRole('checkbox', { name: /Spanduk/ })).toHaveLength(1);
  });

  it('dua lokasi media yang sama dikirim sebagai dua item dengan slug sama', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    isiBaris(0, 'Pintu Tol', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Tambah lokasi lain/i }));
    isiBaris(1, 'Atrium', '2026-10-02', '2026-10-08');

    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));
    await screen.findByRole('heading', { name: /Ringkasan & Kirim/i });

    fireEvent.click(screen.getByLabelText(/Saya menyatakan/i));
    fireEvent.click(screen.getByRole('button', { name: /Kirim Pengajuan/i }));
    await waitFor(() => expect(mockedSubmitBatch).toHaveBeenCalledTimes(1));

    const payload = mockedSubmitBatch.mock.calls[0]![0];
    expect(payload.items).toHaveLength(2);
    expect(payload.items.map((it) => it.media_type_slug)).toEqual(['spanduk', 'spanduk']);
    expect(payload.items.map((it) => it.media_target)).toEqual(['Pintu Tol', 'Atrium']);
  });

  it('validasi langkah 3 tidak bertabrakan antar baris media yang sama', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    isiBaris(0, 'Pintu Tol', '2026-10-01', '2026-10-07');
    fireEvent.click(screen.getByRole('button', { name: /Tambah lokasi lain/i }));
    // Baris ke-2 sengaja dibiarkan kosong (lokasi + periode).
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));

    expect(await screen.findByText(/Media ke-2: lokasi pemasangan wajib diisi/i)).toBeInTheDocument();
    expect(screen.getByText(/Media ke-2: Periode pemasangan tidak valid/i)).toBeInTheDocument();
    // Baris pertama valid → tidak ada galat untuknya.
    expect(screen.queryByText(/Media ke-1:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Ringkasan & Kirim/i })).not.toBeInTheDocument();
  });

  it('menghapus centang media menghapus SEMUA baris lokasinya', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tambah lokasi lain/i }));
    expect(screen.getAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    expect(screen.queryAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(0);
  });

  it('batas 10 baris dihitung per BARIS, bukan per media unik', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    const tombol = screen.getByRole('button', { name: /Tambah lokasi lain/i });
    for (let i = 1; i < MAX_BATCH_ITEMS; i += 1) fireEvent.click(tombol);

    expect(screen.getAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(MAX_BATCH_ITEMS);
    expect(tombol).toBeDisabled();
  });

  it('draf sessionStorage bentuk lama (baris tanpa id) tetap dipulihkan', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      applicantType: 'non_tenant',
      nonTenantName: 'PT Lama',
      picName: 'Budi',
      picPhone: '081234567891',
      submissionDate: '2026-09-01',
      notes: 'draf lama',
      items: [
        { slug: 'spanduk', media_target: 'Pintu Tol', air_start_date: '2026-10-01', air_end_date: '2026-10-07' },
        { slug: 'spanduk', media_target: 'Atrium', air_start_date: '2026-10-01', air_end_date: '2026-10-07' },
        { slug: 'slug-tak-dikenal', media_target: 'X', air_start_date: '', air_end_date: '' },
      ],
    }));

    renderWizard();
    await masukLangkah2();
    // Dua baris spanduk dipulihkan; slug asing dibuang.
    expect(screen.getAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(2);
    expect((screen.getAllByLabelText(/Lokasi Pemasangan/i)[0] as HTMLInputElement).value).toBe('Pintu Tol');
    expect((screen.getAllByLabelText(/Lokasi Pemasangan/i)[1] as HTMLInputElement).value).toBe('Atrium');
  });
});

describe('PromoCetakWizard — pengelompokan kategori (B3)', () => {
  it('daftar media dikelompokkan per kategori Outdoor dan Indoor', async () => {
    renderWizard();
    await masukLangkah2();

    expect(screen.getByRole('heading', { name: 'Outdoor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Indoor' })).toBeInTheDocument();
    // Spanduk & Umbul-Umbul di grup Outdoor; Big Banner di grup Indoor.
    expect(screen.getByRole('checkbox', { name: /Spanduk/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Umbul-Umbul/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Big Banner/ })).toBeInTheDocument();
  });
});
