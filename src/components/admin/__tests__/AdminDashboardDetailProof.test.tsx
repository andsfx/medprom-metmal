/**
 * Mount test bukti tayang kanal unggahan + isi deskripsi form katalog pada
 * Sheet/dashboard staf.
 *
 * Kontrak rapuh yang dikunci:
 *  1. Blok "Informasi pemasangan" merender KEDUA kanal bukti tayang
 *     (`proof_url` dan `proof_file_url` + metadata berkas). Sebelumnya hanya
 *     `proof_url` yang dirender, sehingga staf yang baru mengunggah berkas
 *     tidak melihat buktinya di tempat yang sama.
 *  2. Baris "Deskripsi" selalu tampil - kekosongan dinyatakan eksplisit,
 *     bukan disembunyikan (pengajuan kanal cetak memang tidak mengisi kolom
 *     ini, dan staf mengira datanya hilang).
 *  3. Kolom Harga (`price_note`) yang menyimpan tangga tarif multi-baris tetap
 *     dapat disunting tanpa barisnya digabung menjadi satu (input satu baris
 *     membuang karakter baris baru).
 *  4. Kolom Ketentuan menjelaskan bahwa isinya tampil ke tenant di katalog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from '../AdminDashboardPage';
import { useAuth } from '../../../hooks/useAuth';
import {
  fetchAdminSubmissions, fetchAdminMediaTypes, fetchAdminSummary,
  fetchAdminSubmissionDetail, fetchAdminUsers, fetchAdminReminders,
  updateMediaType,
} from '../../../utils/adminApi';
import type { AdminSubmissionRow, InstallationRow } from '../../../types/promo';

vi.mock('../../../hooks/useAuth');
vi.mock('../../../utils/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/adminApi')>();
  return {
    ...actual,
    fetchAdminSubmissions: vi.fn(),
    fetchAdminSummary: vi.fn(),
    fetchAdminSubmissionDetail: vi.fn(),
    fetchAdminMediaTypes: vi.fn(),
    updateSubmissionStatus: vi.fn(),
    updateMediaType: vi.fn(),
    recordInstallation: vi.fn(),
    deleteSubmission: vi.fn(),
    downloadExportCsv: vi.fn(),
    fetchAdminUsers: vi.fn(),
    fetchAdminReminders: vi.fn(),
    uploadInstallationProof: vi.fn(),
    createMediaType: vi.fn(),
  };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedFetchSubmissions = vi.mocked(fetchAdminSubmissions);
const mockedFetchSummary = vi.mocked(fetchAdminSummary);
const mockedFetchDetail = vi.mocked(fetchAdminSubmissionDetail);
const mockedFetchMediaTypes = vi.mocked(fetchAdminMediaTypes);
const mockedFetchUsers = vi.mocked(fetchAdminUsers);
const mockedFetchReminders = vi.mocked(fetchAdminReminders);
const mockedUpdateMediaType = vi.mocked(updateMediaType);

function row(over: Partial<AdminSubmissionRow> = {}): AdminSubmissionRow {
  return {
    id: 'sub-1', submission_number: 'MP-260916-ABC234', status_token: 'tok-x',
    media_type_slug: 'spanduk', tenant_id: 'T1', tenant_name: 'Optik Melawai',
    unit_number: 'L1-05', pic_name: 'Andi', pic_phone: '08123456789',
    campaign_name: '', material_title: 'Spanduk Diskon', material_description: '',
    material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
    installation_date: '', terms_accepted: true, notes: '',
    source_type: 'none', file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
    drive_file_id: '', link_url: '',
    status: 'sudah_dipasang', status_changed_at: '2026-09-12T01:00:00Z',
    review_notes: '', reviewed_by: null, reviewed_at: null, reviewed_by_name: null,
    device_fingerprint: 'fp1', ip_address: '127.0.0.1',
    created_at: '2026-09-12T01:00:00Z', updated_at: '2026-09-12T01:00:00Z',
    ...over,
  };
}

function installation(over: Partial<InstallationRow> = {}): InstallationRow {
  return {
    id: 'i1', submission_id: 'sub-1', media_location: 'Atrium 1',
    start_date: '', end_date: '', notes: '', proof_url: '', proof_kind: 'link',
    installed_by: 'Admin Satu', installed_by_id: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const PAGE = { data: [row()], total: 1, page: 1, per_page: 20, total_pages: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchSubmissions.mockResolvedValue(PAGE);
  mockedFetchMediaTypes.mockResolvedValue([]);
  mockedFetchUsers.mockResolvedValue([]);
  mockedFetchReminders.mockResolvedValue({ days: 14, overdue: 0, due_soon: 0, items: [] });
  mockedFetchSummary.mockResolvedValue({ total: 1, counts: { sudah_dipasang: 1 } });
  mockedFetchDetail.mockResolvedValue({
    submission: row(), history: [], files: [], installation: installation(),
  });
});

function renderDashboard() {
  mockedUseAuth.mockReturnValue({
    user: { id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

/** Buka Sheet detail satu-satunya baris pengajuan. */
async function bukaDetail() {
  await screen.findByText('Optik Melawai');
  fireEvent.click(screen.getByRole('button', { name: /Detail/i }));
  await screen.findByText('Informasi pemasangan');
}

/** Kartu "Informasi pemasangan" tempat bukti tayang dirender. */
function blokPemasangan(): HTMLElement {
  const judul = screen.getByText('Informasi pemasangan');
  const card = judul.closest('div');
  if (!card) throw new Error('blok Informasi pemasangan tidak ditemukan');
  return card;
}

describe('AdminDashboardPage - bukti tayang kanal unggahan', () => {
  it('kanal unggahan → staf melihat tautan bukti, nama berkas, dan pengunggah', async () => {
    mockedFetchDetail.mockResolvedValue({
      submission: row(),
      history: [],
      files: [],
      installation: installation({
        proof_kind: 'upload',
        proof_file_url: 'https://drive.google.com/file/d/bukti-1/view',
        proof_file_name: 'bukti-atrium-1.jpg',
        proof_mime: 'image/jpeg',
        proof_size_bytes: 1572864,
        proof_uploaded_by: 'Admin Satu',
        proof_uploaded_at: '2026-10-01T02:30:00Z',
      }),
    });
    renderDashboard();
    await bukaDetail();

    const blok = blokPemasangan();
    const tautan = within(blok).getByRole('link', { name: /Buka bukti tayang/i });
    expect(tautan).toHaveAttribute('href', 'https://drive.google.com/file/d/bukti-1/view');
    expect(tautan.className).toContain('min-h-11');
    expect(within(blok).getByText('bukti-atrium-1.jpg')).toBeInTheDocument();
    expect(within(blok).getByText(/JPEG · 1\.5 MB/)).toBeInTheDocument();
    expect(within(blok).getByText(/Diunggah oleh Admin Satu/)).toBeInTheDocument();
  });

  it('kanal tautan tetap dirender seperti sebelumnya', async () => {
    mockedFetchDetail.mockResolvedValue({
      submission: row(),
      history: [],
      files: [],
      installation: installation({ proof_url: 'https://drive.google.com/file/d/tautan/view' }),
    });
    renderDashboard();
    await bukaDetail();

    const blok = blokPemasangan();
    expect(within(blok).getByRole('link', { name: /Buka bukti pemasangan/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/tautan/view');
    expect(within(blok).queryByRole('link', { name: /Buka bukti tayang/i })).not.toBeInTheDocument();
  });

  it('tanpa bukti → tidak ada baris bukti kosong', async () => {
    renderDashboard();
    await bukaDetail();

    const blok = blokPemasangan();
    expect(within(blok).queryByRole('link', { name: /Buka bukti/i })).not.toBeInTheDocument();
    // Data pemasangan lain tetap tampil.
    expect(within(blok).getByText('Atrium 1')).toBeInTheDocument();
  });
});

describe('AdminDashboardPage - isi deskripsi form admin', () => {
  it('deskripsi kosong → baris Deskripsi tetap tampil dengan penanda eksplisit', async () => {
    renderDashboard();
    await bukaDetail();

    // Pengajuan kanal cetak: form-nya tidak meminta deskripsi.
    expect(screen.getByText('Deskripsi')).toBeInTheDocument();
    expect(screen.getByText('tidak diisi')).toBeInTheDocument();
  });

  it('deskripsi terisi → nilainya yang ditampilkan, bukan penanda kosong', async () => {
    mockedFetchSubmissions.mockResolvedValue({
      ...PAGE,
      data: [row({ material_description: 'Diskon akhir tahun.' })],
    });
    renderDashboard();
    await bukaDetail();

    expect(screen.getByText('Diskon akhir tahun.')).toBeInTheDocument();
    expect(screen.queryByText('tidak diisi')).not.toBeInTheDocument();
  });

  it('Ketentuan menjelaskan isinya tampil ke tenant di katalog publik', async () => {
    mockedFetchMediaTypes.mockResolvedValue([{
      id: 'mt-1', slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
      size_spec: '', material_spec: '', accepted_formats: 'JPEG', image_path: '',
      price_note: '', location_note: '', rules: 'Minimal sewa 1 minggu.', sort_order: 1,
    }]);
    renderDashboard();
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getByRole('tab', { name: /Katalog Media/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Edit/i }));

    const ketentuan = await screen.findByLabelText(/Ketentuan \(satu per baris\)/i);
    expect(ketentuan).toHaveAttribute('aria-describedby', 'cf-rules-hint');
    const hint = document.getElementById('cf-rules-hint');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toMatch(/katalog publik/i);
  });

  it('Harga multi-baris dapat disunting tanpa barisnya digabung', async () => {
    // Deck menyimpan tangga tarif sebagai beberapa baris di `price_note`.
    mockedFetchMediaTypes.mockResolvedValue([{
      id: 'mt-1', slug: 'videotron', category: 'indoor', name: 'Videotron',
      size_spec: '', material_spec: '', accepted_formats: 'JPEG', image_path: '',
      price_note: 'Rp. 600.000,-/hari\nRp. 4.200.000,-/7 hari',
      location_note: '', rules: '', sort_order: 10,
    }]);
    mockedUpdateMediaType.mockResolvedValue(undefined);
    renderDashboard();
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getByRole('tab', { name: /Katalog Media/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Edit/i }));

    // Kontrol Harga harus mempertahankan baris baru (textarea), bukan input
    // satu baris yang membuang CR/LF dan menggabungkan seluruh tarif.
    const harga = await screen.findByLabelText(/^Harga$/i);
    expect(harga.tagName).toBe('TEXTAREA');
    expect((harga as HTMLTextAreaElement).value).toBe('Rp. 600.000,-/hari\nRp. 4.200.000,-/7 hari');

    fireEvent.click(screen.getByRole('button', { name: /Simpan/i }));

    await waitFor(() => expect(mockedUpdateMediaType).toHaveBeenCalledTimes(1));
    expect(mockedUpdateMediaType).toHaveBeenCalledWith('mt-1', expect.objectContaining({
      price_note: 'Rp. 600.000,-/hari\nRp. 4.200.000,-/7 hari',
    }));
  });
});
