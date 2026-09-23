/**
 * Mount test materi tiga kanal di Sheet detail dashboard staf.
 *
 * Kontrak rapuh yang dikunci: `source_type` punya TIGA nilai, bukan dua.
 * Pengajuan cetak (`POST /promo/submit-batch`) sengaja tidak meminta berkas
 * materi sehingga tersimpan sebagai `'none'`; dulu Sheet staf memperlakukan
 * semua yang bukan `'link'` sebagai berkas, sehingga baris materi berlabel
 * "File" DAN tombol aksi cepat "Buka tautan materi" sama-sama menaut ke
 * `href=""` - mengkliknya hanya memuat ulang halaman, persis di alur kerja
 * staf yang sedang memverifikasi pengajuan cetak.
 *
 * Kanal `'none'` kini wajib menjadi baris informasi tanpa anchor, dan tombol
 * buka materi harus hilang; tombol WA tetap ada karena tidak bergantung materi.
 * Kanal `'link'` dan `'upload'` harus tetap persis seperti sebelumnya.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from '../AdminDashboardPage';
import { useAuth } from '../../../hooks/useAuth';
import {
  fetchAdminSubmissions, fetchAdminMediaTypes, fetchAdminSummary,
  fetchAdminSubmissionDetail, fetchAdminUsers, fetchAdminReminders,
} from '../../../utils/adminApi';
import type { AdminSubmissionRow } from '../../../types/promo';

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

/** Pengajuan cetak: kanal 'none', tanpa berkas maupun tautan. */
function row(over: Partial<AdminSubmissionRow> = {}): AdminSubmissionRow {
  return {
    id: 'sub-1', submission_number: 'MP-260916-ABC234', status_token: 'tok-x',
    media_type_slug: 'spanduk', tenant_id: '', tenant_name: 'Koperasi Karyawan',
    unit_number: '', pic_name: 'Andi', pic_phone: '08123456789',
    campaign_name: '', material_title: 'Spanduk Diskon', material_description: '',
    material_type: '', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
    installation_date: '', terms_accepted: true, notes: '',
    source_type: 'none', file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
    drive_file_id: '', link_url: '',
    applicant_type: 'non_tenant', submission_date: '2026-09-16', batch_id: 'b1',
    status: 'menunggu_review', status_changed_at: '2026-09-12T01:00:00Z',
    review_notes: '', reviewed_by: null, reviewed_at: null, reviewed_by_name: null,
    device_fingerprint: 'fp1', ip_address: '127.0.0.1',
    created_at: '2026-09-12T01:00:00Z', updated_at: '2026-09-12T01:00:00Z',
    ...over,
  };
}

function siapkan(submission: AdminSubmissionRow) {
  mockedFetchSubmissions.mockResolvedValue({
    data: [submission], total: 1, page: 1, per_page: 20, total_pages: 1,
  });
  mockedFetchDetail.mockResolvedValue({
    submission, history: [], files: [], installation: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  siapkan(row());
  mockedFetchMediaTypes.mockResolvedValue([]);
  mockedFetchUsers.mockResolvedValue([]);
  mockedFetchReminders.mockResolvedValue({ days: 14, overdue: 0, due_soon: 0, items: [] });
  mockedFetchSummary.mockResolvedValue({ total: 1, counts: { menunggu_review: 1 } });
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

/** Buka Sheet detail satu-satunya baris pengajuan, lalu kembalikan dialognya. */
async function bukaDetail(nama: string): Promise<HTMLElement> {
  await screen.findByText(nama);
  fireEvent.click(screen.getByRole('button', { name: /Detail/i }));
  await screen.findByRole('dialog');
  const sheet = screen.getByRole('dialog');
  await within(sheet).findByText('Jenis Pemohon');
  return sheet;
}

/** Semua anchor di dalam satu elemen beserta nilai atribut `href`-nya. */
function hrefsDi(root: HTMLElement): (string | null)[] {
  return Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
}

describe('AdminDashboardPage - materi menyusul di Sheet detail (source_type none)', () => {
  it('baris materi menjadi keterangan "Materi", bukan tautan "File" kosong', async () => {
    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');

    // Label yang tepat untuk pengajuan tanpa materi.
    expect(within(sheet).getByText('Materi')).toBeInTheDocument();
    expect(within(sheet).getByText(/menyusul setelah pengajuan disetujui/i)).toBeInTheDocument();
    // Label kanal lain tidak boleh dipakai di sini.
    expect(within(sheet).queryByText('File')).not.toBeInTheDocument();
    expect(within(sheet).queryByText('Tautan')).not.toBeInTheDocument();
  });

  it('tombol "Buka tautan materi" tidak dirender, tombol WA tetap ada', async () => {
    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');

    expect(within(sheet).queryByRole('link', { name: /Buka tautan materi/i })).not.toBeInTheDocument();
    // WA tidak bergantung materi - pengajuan cetak tetap bisa ditindaklanjuti.
    const wa = within(sheet).getByRole('link', { name: /Kirim pesan WA/i });
    expect(wa.getAttribute('href')).toContain('https://wa.me/628123456789?text=');
  });

  it('tidak ada anchor ber-href kosong di dalam Sheet', async () => {
    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');

    const kosong = hrefsDi(sheet).filter((h) => h === '' || h === null);
    expect(kosong).toEqual([]);
  });

  it('"Salin tautan" tidak menyalin baris "Tautan:" kosong', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText }, configurable: true,
    });

    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');
    fireEvent.click(within(sheet).getByRole('button', { name: /Salin tautan/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Materi: menyusul'));
    expect(writeText.mock.calls[0]?.[0]).not.toContain('Tautan: ');
  });

  it('tabel pengajuan tidak menautkan materi kosong untuk kanal none', async () => {
    renderDashboard();
    await screen.findByText('Koperasi Karyawan');

    const baris = screen.getByText('Koperasi Karyawan').closest('tr');
    if (!baris) throw new Error('baris tabel tidak ditemukan');
    expect(hrefsDi(baris).filter((h) => h === '' || h === null)).toEqual([]);
    expect(within(baris).getByText('menyusul')).toBeInTheDocument();
  });
});

describe('AdminDashboardPage - kanal link dan upload tidak berubah', () => {
  it('kanal link tetap menaut ke link_url di tabel dan Sheet', async () => {
    siapkan(row({
      source_type: 'link', link_url: 'https://drive.google.com/file/d/abc/view',
      tenant_name: 'Optik Melawai',
    }));
    renderDashboard();
    const sheet = await bukaDetail('Optik Melawai');

    const tautan = within(sheet).getByRole('link', { name: /Buka tautan materi/i });
    expect(tautan).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
    expect(tautan).toHaveAttribute('target', '_blank');
    expect(tautan).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(sheet).getByRole('link', { name: /drive\.google\.com/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
  });

  it('kanal upload tetap menaut ke file_url di tabel dan Sheet', async () => {
    siapkan(row({
      source_type: 'upload', file_url: 'https://drive.google.com/file/d/file-1/view',
      file_name: 'spanduk.jpg', mime_type: 'image/jpeg', file_size_bytes: 1024,
      tenant_name: 'Optik Melawai',
    }));
    renderDashboard();
    const sheet = await bukaDetail('Optik Melawai');

    expect(within(sheet).getByRole('link', { name: /Buka tautan materi/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/file-1/view');
    expect(within(sheet).getByRole('link', { name: /spanduk\.jpg/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/file-1/view');
    // Tautan tabel juga memakai file_url.
    const baris = within(screen.getByRole('table')).getByText('MP-260916-ABC234').closest('tr');
    if (!baris) throw new Error('baris tabel tidak ditemukan');
    expect(within(baris).getByRole('link', { name: /spanduk\.jpg/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/file-1/view');
  });
});
