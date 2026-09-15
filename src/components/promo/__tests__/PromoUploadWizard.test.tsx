import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PromoUploadWizard from '../PromoUploadWizard';
import { ApiError } from '../../../lib/rest';
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
  // Draf wizard disimpan di sessionStorage — bersihkan agar tak bocor antar-test.
  sessionStorage.clear();
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
    vi.stubEnv('VITE_PROMO_UPLOAD_MODE', '1');
    await wizardToStep3();

    fireEvent.click(screen.getByRole('button', { name: /Unggah File/i }));
    const input = screen.getByLabelText(/Klik untuk memilih file/i) as HTMLInputElement;
    const file = new File(['dummy'], 'materi.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByText(/Format file tidak didukung. Gunakan JPEG,MP4/i)).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('alur sukses (mode unggah legacy): upload → submit menampilkan layar tiket', async () => {
    vi.stubEnv('VITE_PROMO_UPLOAD_MODE', '1');
    mockedUploadFile.mockResolvedValue({
      file_id: 'f1', web_view_link: '', file_name: 'materi.jpg', mime_type: 'image/jpeg', file_size_bytes: 1024,
    });
    mockedSubmitPromo.mockResolvedValue({ id: 'abcdefgh-1234', created_at: '2026-09-12T00:00:00Z' });
    await wizardToStep3();

    fireEvent.click(screen.getByRole('button', { name: /Unggah File/i }));
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
    vi.unstubAllEnvs();
  });

  it('default link-only: tanpa tab unggah, langsung input tautan', async () => {
    mockedSubmitPromo.mockResolvedValue({ id: 'link1234-5678', created_at: '2026-09-13T00:00:00Z' });
    await wizardToStep3();

    // Toggle upload tidak dirender; input tautan langsung tersedia.
    expect(screen.queryByRole('button', { name: /Unggah File/i })).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/Tautan Materi/i)).toBeInTheDocument();
  });

  it('mode tautan: kirim URL Drive tanpa unggah file', async () => {
    mockedSubmitPromo.mockResolvedValue({ id: 'link1234-5678', created_at: '2026-09-13T00:00:00Z' });
    await wizardToStep3();

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
    expect(mockedSubmitPromo).toHaveBeenCalledWith(expect.objectContaining({
      media_type_slug: 'videotron',
      link_url: 'https://drive.google.com/file/d/xyz/view',
      drive_file_id: '',
      mime_type: '',
      file_size_bytes: 0,
    }));
  });

  it('pesan validasi server dari errors[] dipetakan ke field (bukan 400 generik)', async () => {
    mockedSubmitPromo.mockRejectedValue(new ApiError(
      'Tautan materi harus berupa URL http/https yang valid', '400',
      { errors: ['Tautan materi harus berupa URL http/https yang valid'] },
    ));
    await wizardToStep3();

    const linkInput = await screen.findByLabelText(/Tautan Materi/i);
    fireEvent.change(linkInput, { target: { value: 'https://drive.google.com/file/d/xyz/view' } });
    const submitBtn = screen.getByRole('button', { name: /Kirim Pengajuan/i });
    await waitFor(() => { expect(submitBtn).not.toBeDisabled(); });
    fireEvent.click(submitBtn);

    // Pesan muncul inline di field tautan, bukan sebagai "HTTP 400".
    expect(await screen.findByText(/Tautan materi harus berupa URL/)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP 400/)).not.toBeInTheDocument();
  });

  it('menampilkan pesan error jaringan verbatim saat submit gagal', async () => {
    mockedSubmitPromo.mockRejectedValue(new Error('Gagal terhubung ke server'));
    await wizardToStep3();

    const linkInput = await screen.findByLabelText(/Tautan Materi/i);
    fireEvent.change(linkInput, { target: { value: 'https://drive.google.com/file/d/xyz/view' } });
    const submitBtn = screen.getByRole('button', { name: /Kirim Pengajuan/i });
    await waitFor(() => { expect(submitBtn).not.toBeDisabled(); });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Gagal terhubung ke server/i)).toBeInTheDocument();
    expect(screen.getByText('Pengajuan gagal.')).toBeInTheDocument();
  });
});

describe('PromoUploadWizard — lead time materi', () => {
  const MEDIA_LEAD: PromoMediaType[] = [{
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9x6m', material_spec: 'Flexi', accepted_formats: 'JPEG,PDF',
    price_note: '', location_note: '',
    rules: 'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.',
    sort_order: 1,
  }];

  function isoFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }

  async function toStep2WithLead() {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA_LEAD);
    renderWizard();
    fireEvent.click(await screen.findByLabelText(/Spanduk/i));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Data Tenant/i }));
    await screen.findByLabelText(/Nama PIC/i);
    fireEvent.change(screen.getByLabelText(/Nama PIC/i), { target: { value: 'Andi PIC' } });
    fireEvent.change(screen.getByLabelText(/Nomor Telepon PIC/i), { target: { value: '081234567890' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Optik Melawai' } });
    fireEvent.click(await screen.findByText('Optik Melawai'));
  }

  it('menampilkan hint lead time dari teks rules media', async () => {
    await toStep2WithLead();
    expect(await screen.findByText(/paling lambat 2 hari sebelum pemasangan/i)).toBeInTheDocument();
  });

  it('memblokir tanggal pasang yang lebih dekat dari lead time', async () => {
    await toStep2WithLead();
    fireEvent.change(screen.getByLabelText(/Tanggal Pemasangan/i), { target: { value: isoFromNow(0) } });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Kirim Materi/i }));

    expect(await screen.findByText(/terlalu dekat/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kirim Materi' })).not.toBeInTheDocument();
  });

  it('meloloskan tanggal pasang yang sudah melewati lead time', async () => {
    await toStep2WithLead();
    fireEvent.change(screen.getByLabelText(/Tanggal Pemasangan/i), { target: { value: isoFromNow(10) } });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Kirim Materi/i }));

    expect(await screen.findByRole('heading', { name: 'Kirim Materi' })).toBeInTheDocument();
  });
});

describe('PromoUploadWizard — kanal email media sosial', () => {
  const MEDIA_SOCIAL: PromoMediaType[] = [{
    slug: 'sosmed-feed', category: 'social', name: 'Feed Instagram/Fanpage/TikTok',
    size_spec: '800 x 800 px', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', price_note: 'Free', location_note: '',
    rules: 'Materi promosi harus clean image.\nMateri juga dapat dikirim via email ke marketing@malmetropolitan.com.',
    sort_order: 13,
  }];

  async function toStep3Social() {
    mockedFetchMediaTypes.mockResolvedValue(MEDIA_SOCIAL);
    renderWizard();
    fireEvent.click(await screen.findByLabelText(/Feed Instagram/i));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Data Tenant/i }));
    await screen.findByLabelText(/Nama PIC/i);
    fireEvent.change(screen.getByLabelText(/Nama PIC/i), { target: { value: 'Andi PIC' } });
    fireEvent.change(screen.getByLabelText(/Nomor Telepon PIC/i), { target: { value: '081234567890' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Optik Melawai' } });
    fireEvent.click(await screen.findByText('Optik Melawai'));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut — Kirim Materi/i }));
    await screen.findByRole('heading', { name: 'Kirim Materi' });
  }

  it('menampilkan kanal email dari aturan deck untuk media sosial', async () => {
    await toStep3Social();
    const mail = await screen.findByRole('link', { name: 'marketing@malmetropolitan.com' });
    expect(mail).toHaveAttribute('href', expect.stringContaining('mailto:marketing@malmetropolitan.com'));
  });

  it('tidak menampilkan kanal email untuk media yang tidak menyebutnya', async () => {
    await wizardToStep3();   // videotron, tanpa email di rules
    expect(screen.queryByText(/dikirim via email/i)).not.toBeInTheDocument();
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
