/**
 * Test fitur bukti pembayaran pajak di wizard cetak.
 *
 * Kontrak yang dikunci:
 *  - field unggah HANYA muncul bila saklar server `tax_proof_enabled` menyala
 *    (bukan flag build-time);
 *  - berkas diunggah lewat `uploadFile` dan hasilnya (file_id Drive) ikut
 *    dikirim di payload `submitBatch` sebagai `tax_proof_*`;
 *  - fitur opsional: kirim tetap bisa tanpa berkas pajak.
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
    uploadFile: vi.fn(),
    fetchPublicSettings: vi.fn(),
  };
});

import {
  fetchMediaTypes, searchTenants, submitBatch, uploadFile, fetchPublicSettings,
} from '../../../utils/promoApi';

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);
const mockedSearchTenants = vi.mocked(searchTenants);
const mockedSubmitBatch = vi.mocked(submitBatch);
const mockedUploadFile = vi.mocked(uploadFile);
const mockedFetchSettings = vi.mocked(fetchPublicSettings);

const MEDIA: PromoMediaType[] = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 70.000,-/hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat', rules: '', sort_order: 1,
    media_channel: 'cetak', price_amount: 70000, price_unit: 'hari', ppn_included: false,
  },
];

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-pajak');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [] });
  mockedFetchSettings.mockResolvedValue({ tax_proof_enabled: true });
  mockedUploadFile.mockResolvedValue({
    file_id: 'drive-tax-1',
    web_view_link: 'https://drive.google.com/file/d/tax-1/view',
    file_name: 'bukti.png',
    mime_type: 'image/png',
    file_size_bytes: 1234,
  });
  mockedSubmitBatch.mockResolvedValue({
    batch_id: 'b1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok',
    applicant_type: 'non_tenant', created_at: '2026-09-20T00:00:00Z',
    items: [{
      id: 's1', submission_number: 'MP-260920-AAA234', status_token: 't1',
      media_type_slug: 'spanduk', status: 'menunggu_review',
      subtotal: 490000, ppn_amount: 53900, total_amount: 543900,
    }],
  });
});

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/ajukan-cetak']}>
      <PromoCetakWizard />
    </MemoryRouter>,
  );
}

/** Isi langkah 1 dan 2 sampai ringkasan (langkah 3). */
async function isiSampaiRingkasan() {
  fireEvent.click(await screen.findByRole('button', { name: 'Non-tenant' }));
  fireEvent.change(screen.getByLabelText(/Nama Non Tenant/i), { target: { value: 'PT Contoh' } });
  fireEvent.change(screen.getByLabelText(/Nama Pemohon/i), { target: { value: 'Andi' } });
  fireEvent.change(screen.getByLabelText(/Nomor Telepon/i), { target: { value: '081234567890' } });
  fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));

  fireEvent.click(await screen.findByLabelText(/Spanduk/));
  fireEvent.change(screen.getByLabelText(/Lokasi Pemasangan/i), { target: { value: 'Pintu Tol' } });
  fireEvent.change(screen.getByLabelText(/Periode Mulai/i), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText(/Periode Selesai/i), { target: { value: '2026-10-07' } });
  fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Ringkasan/i }));

  expect(await screen.findByRole('heading', { name: /Ringkasan & Kirim/i })).toBeInTheDocument();
}

describe('PromoCetakWizard — bukti pembayaran pajak', () => {
  it('saklar menyala → field unggah pajak tampil di langkah ringkasan', async () => {
    renderWizard();
    await isiSampaiRingkasan();
    expect(await screen.findByText(/Bukti Pembayaran Pajak/i)).toBeInTheDocument();
    expect(document.getElementById('cetak-tax-proof')).not.toBeNull();
  });

  it('saklar mati → field unggah pajak tidak dirender', async () => {
    mockedFetchSettings.mockResolvedValue({ tax_proof_enabled: false });
    renderWizard();
    await isiSampaiRingkasan();
    expect(screen.queryByText(/Bukti Pembayaran Pajak/i)).not.toBeInTheDocument();
    expect(document.getElementById('cetak-tax-proof')).toBeNull();
  });

  it('berkas pajak yang diunggah ikut dikirim di payload submitBatch', async () => {
    renderWizard();
    await isiSampaiRingkasan();

    const input = document.getElementById('cetak-tax-proof') as HTMLInputElement;
    const berkas = new File(['x'], 'bukti.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [berkas] } });

    // Unggahan selesai → penanda "siap dikirim".
    expect(await screen.findByText(/siap dikirim/i)).toBeInTheDocument();
    expect(mockedUploadFile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText(/Saya menyatakan/i));
    fireEvent.click(screen.getByRole('button', { name: /Kirim Pengajuan/i }));

    await waitFor(() => expect(mockedSubmitBatch).toHaveBeenCalledTimes(1));
    const payload = mockedSubmitBatch.mock.calls[0][0];
    expect(payload.items[0].tax_proof_file_id).toBe('drive-tax-1');
    expect(payload.items[0].tax_proof_file_name).toBe('bukti.png');
    expect(payload.items[0].tax_proof_size_bytes).toBe(1234);
  });

  it('fitur opsional: kirim tanpa berkas pajak tetap sah', async () => {
    renderWizard();
    await isiSampaiRingkasan();

    fireEvent.click(screen.getByLabelText(/Saya menyatakan/i));
    fireEvent.click(screen.getByRole('button', { name: /Kirim Pengajuan/i }));

    await waitFor(() => expect(mockedSubmitBatch).toHaveBeenCalledTimes(1));
    const payload = mockedSubmitBatch.mock.calls[0][0];
    expect(payload.items[0].tax_proof_file_id).toBeUndefined();
    expect(mockedUploadFile).not.toHaveBeenCalled();
  });
});
