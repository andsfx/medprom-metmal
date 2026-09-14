import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PromoUploadWizard from '../PromoUploadWizard';
import type { PromoMediaType } from '../../../types/promo';

// Mock promoApi — wizard tidak boleh melakukan network nyata di unit test.
vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
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

// Fingerprint localStorage-stable di jsdom.
beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp123');
  vi.clearAllMocks();
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [
    { id: 'T001', name: 'Optik Melawai', floor: '1', lot: 'A-01', category: 'Fashion' },
  ] });
});

const MEDIA: PromoMediaType[] = [
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    size_spec: '800 x 600 px', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,MP4', price_note: 'Rp 600rb/hari',
    location_note: '', rules: 'Aturan videotron.', sort_order: 10,
  },
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9x6m', material_spec: 'Flexi', accepted_formats: 'JPEG,PDF',
    price_note: '', location_note: '', rules: '', sort_order: 1,
  },
];

function renderWizard(route = '/ajukan') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PromoUploadWizard />
    </MemoryRouter>,
  );
}

async function wizardToStep3() {
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  renderWizard();
  await screen.findByText('Pilih Jenis Media Promosi');

  // Step 1: pilih Videotron
  fireEvent.click(screen.getByLabelText(/Videotron/i));
  fireEvent.click(screen.getByRole('button', { name: /Lanjut — Data Tenant/i }));

  // Step 2: isi data tenant
  const nameInput = await screen.findByLabelText(/Nama PIC/i);
  fireEvent.change(nameInput, { target: { value: 'Andi PIC' } });
  fireEvent.change(screen.getByLabelText(/Nomor Telepon PIC/i), { target: { value: '081234567890' } });
  // Tenant picker: ketik lalu pilih opsi listbox.
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Optik Melawai' } });
  const option = await screen.findByText('Optik Melawai');
  fireEvent.click(option);
  fireEvent.click(screen.getByRole('button', { name: /Lanjut — Kirim Materi/i }));
  await screen.findByRole('heading', { name: 'Kirim Materi' });
}

describe('PromoUploadWizard', () => {
  it('menampilkan daftar media dari katalog aktif', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderWizard();
    expect(await screen.findByText('Videotron')).toBeInTheDocument();
    expect(screen.getByText('Spanduk')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lanjut/i })).toBeDisabled();
  });

  it('validasi step 2: PIC wajib sebelum lanjut', async () => {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderWizard();
    fireEvent.click(await screen.findByText('Videotron'));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Data Tenant/i }));

    await screen.findByLabelText(/Nama PIC/i);
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Kirim Materi/i }));
    expect(await screen.findByText(/Nama PIC wajib diisi/i)).toBeInTheDocument();
  });

  it('menolak file format di luar yang diterima media (videotron: txt)', async () => {
    await wizardToStep3();

    const input = screen.getByLabelText(/Klik untuk memilih file/i) as HTMLInputElement;
    const file = new File(['dummy'], 'materi.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByText(/Format file tidak didukung. Gunakan JPEG,MP4/i)).toBeInTheDocument();
  });

  it('alur sukses: upload → submit menampilkan layar tiket', async () => {
    mockedUploadFile.mockResolvedValue({
      file_id: 'f1', web_view_link: '', file_name: 'materi.jpg', mime_type: 'image/jpeg', file_size_bytes: 1024,
    });
    mockedSubmitPromo.mockResolvedValue({ id: 'abcdefgh-1234', created_at: '2026-09-12T00:00:00Z' });
    await wizardToStep3();

    const input = screen.getByLabelText(/Klik untuk memilih file/i) as HTMLInputElement;
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'materi.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    const submitBtn = screen.getByRole('button', { name: /Kirim Pengajuan/i });
    await waitFor(() => { expect(submitBtn).not.toBeDisabled(); });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Pengajuan Terkirim!')).toBeInTheDocument();
    expect(screen.getByText('ABCDEFGH')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lihat Riwayat/i })).toHaveAttribute('href', '/riwayat');
    expect(mockedSubmitPromo).toHaveBeenCalledWith(expect.objectContaining({
      media_type_slug: 'videotron',
      tenant_name: 'Optik Melawai',
      pic_name: 'Andi PIC',
      mime_type: 'image/jpeg',
      device_fingerprint: 'testfp123',
    }));
  });

  it('mode tautan: kirim URL Drive tanpa unggah file', async () => {
    mockedSubmitPromo.mockResolvedValue({ id: 'link1234-5678', created_at: '2026-09-13T00:00:00Z' });
    await wizardToStep3();

    fireEvent.click(screen.getByRole('button', { name: /Kirim Tautan/i }));
    const linkInput = await screen.findByLabelText(/Tautan Materi/i);

    // URL tanpa skema http(s) tidak boleh mengaktifkan tombol kirim.
    fireEvent.change(linkInput, { target: { value: 'drive.google.com/file/d/xyz' } });
    expect(screen.getByRole('button', { name: /Kirim Pengajuan/i })).toBeDisabled();

    fireEvent.change(linkInput, { target: { value: 'https://drive.google.com/file/d/xyz/view' } });
    const submitBtn = screen.getByRole('button', { name: /Kirim Pengajuan/i });
    await waitFor(() => { expect(submitBtn).not.toBeDisabled(); });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Pengajuan Terkirim!')).toBeInTheDocument();
    // Tanpa upload API — materi tetap di penyimpanan tenant.
    expect(mockedUploadFile).not.toHaveBeenCalled();
    expect(mockedUploadFile).not.toHaveBeenCalled();
    expect(mockedSubmitPromo).toHaveBeenCalledWith(expect.objectContaining({
      media_type_slug: 'videotron',
      link_url: 'https://drive.google.com/file/d/xyz/view',
      drive_file_id: '',
      mime_type: '',
      file_size_bytes: 0,
    }));
  });

  it('menampilkan pesan error server verbatim saat submit gagal', async () => {
    mockedUploadFile.mockResolvedValue({
      file_id: 'f1', web_view_link: '', file_name: 'materi.jpg', mime_type: 'image/jpeg', file_size_bytes: 1024,
    });
    mockedSubmitPromo.mockRejectedValue(new Error('Isi file tidak sesuai dengan tipe yang dipilih.'));
    await wizardToStep3();

    const input = screen.getByLabelText(/Klik untuk memilih file/i) as HTMLInputElement;
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'materi.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    const submitBtn = screen.getByRole('button', { name: /Kirim Pengajuan/i });
    await waitFor(() => { expect(submitBtn).not.toBeDisabled(); });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Isi file tidak sesuai dengan tipe yang dipilih/i)).toBeInTheDocument();
    expect(screen.getByText('Pengajuan gagal.')).toBeInTheDocument();
  });
});

describe('PromoUploadWizard — fallback tenant manual (API tenant tidak tersedia)', () => {
  it('beralih ke isian manual saat daftar tenant tidak tersedia', async () => {
    mockedSearchTenants.mockResolvedValue({ available: false, tenants: [] });
    mockedFetchMediaTypes.mockResolvedValue(MEDIA);
    renderWizard();

    fireEvent.click(await screen.findByText('Videotron'));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Data Tenant/i }));

    const combobox = await screen.findByRole('combobox');
    fireEvent.change(combobox, { target: { value: 'Gerai Baru' } });

    // Mode manual aktif → combobox berubah jadi input teks biasa + hint tampil.
    expect(await screen.findByText(/Daftar tenant tidak tersedia/i, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nama PIC/i), { target: { value: 'Andi PIC' } });
    fireEvent.change(screen.getByLabelText(/Nomor Telepon PIC/i), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Kirim Materi/i }));

    expect(await screen.findByRole('heading', { name: 'Kirim Materi' })).toBeInTheDocument();
  });
});
