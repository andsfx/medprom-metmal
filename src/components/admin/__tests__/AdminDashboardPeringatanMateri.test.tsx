/**
 * Mount test peringatan "materi belum diterima" di fieldset "Catat pemasangan".
 *
 * Kontrak rapuh yang dikunci: celah integritas pemasangan tanpa materi SUDAH
 * tercatat sebagai keputusan terbuka di `docs/PLAN_2026-09-23_19-45.md`, dan
 * arahnya belum dipilih pemilik. Perubahan ini sengaja TIDAK memblokir apa
 * pun; yang dikunci adalah keadaan "materi belum diterima" terlihat tepat di
 * tempat staf mengambil keputusan, yaitu di dalam fieldset "Catat pemasangan".
 *
 *  (a) `source_type: 'none'` + status boleh dipasang -> peringatan tampil,
 *      DAN tombol "Catat Pemasangan" tetap ada serta TIDAK disabled.
 *  (b) `source_type: 'link'` -> peringatan tidak tampil.
 *  (c) `source_type: 'upload'` -> peringatan tidak tampil.
 *
 * Bila guard server kelak diambil pemilik (opsi A), peringatan ini tetap sah
 * sebagai penjelas; bila opsi B atau C yang dipilih, peringatan ini juga tetap
 * sah. Karena itu test ini tidak mengunci pemblokiran apa pun.
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

/** Nama tenant unik per test supaya `screen.findByText` tidak ambigu. */
const TENANT = 'Optik Peringatan';

/** Pengajuan ber-status `disetujui` (boleh dipasang, FR-040). */
function row(over: Partial<AdminSubmissionRow> = {}): AdminSubmissionRow {
  return {
    id: 'sub-1', submission_number: 'MP-260916-ABC234', status_token: 'tok-x',
    media_type_slug: 'spanduk', tenant_id: 'T1', tenant_name: TENANT,
    unit_number: 'L1-05', pic_name: 'Andi', pic_phone: '08123456789',
    campaign_name: '', material_title: 'Spanduk Diskon', material_description: '',
    material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
    installation_date: '', terms_accepted: true, notes: '',
    source_type: 'none', file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
    drive_file_id: '', link_url: '',
    status: 'disetujui', status_changed_at: '2026-09-12T01:00:00Z',
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
  mockedFetchSummary.mockResolvedValue({ total: 1, counts: { disetujui: 1 } });
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

/**
 * Buka Sheet detail satu-satunya baris pengajuan dan kembalikan fieldset
 * "Catat pemasangan". Pencarian dipersempit ke dalam Sheet karena teks serupa
 * (nama tenant, nomor pengajuan) juga muncul di tabel di belakangnya.
 */
async function bukaFieldsetPemasangan(): Promise<HTMLElement> {
  await screen.findByText(TENANT);
  fireEvent.click(screen.getByRole('button', { name: /Detail/i }));
  await screen.findByRole('dialog');
  const sheet = screen.getByRole('dialog');
  return within(sheet).findByRole('group', { name: /Catat pemasangan/i });
}

describe('AdminDashboardPage - peringatan materi belum diterima saat catat pemasangan', () => {
  it('source_type none + disetujui -> peringatan tampil dan tombol Catat Pemasangan tetap aktif', async () => {
    renderDashboard();
    const fieldset = await bukaFieldsetPemasangan();

    const teks = within(fieldset).queryByText(/Materi belum pernah diterima/i);
    expect(teks).not.toBeNull();
    // Isi peringatan menyebut tiga hal: materi belum diterima, alasan kanal
    // cetak, dan akibat menyimpan pemasangan.
    expect(teks!.textContent).toMatch(/Materi belum pernah diterima untuk pengajuan ini/i);
    expect(teks!.textContent).toMatch(/tidak\s+melampirkan materi saat diajukan/i);
    expect(teks!.textContent).toMatch(/menyusul lewat revisi/i);
    expect(teks!.textContent).toMatch(/Sudah Dipasang/i);
    expect(teks!.textContent).toMatch(/koordinasi dengan tenant/i);

    // Gaya peringatan yang sudah ada di berkas (pola `leadTimeRisk`): amber,
    // bukan merah. Merah dikhususkan untuk galat.
    const panel = teks!.closest('div[role="status"]') ?? teks!.parentElement!.parentElement!;
    expect(panel.className).toContain('amber-300');
    expect(panel.className).toContain('amber-50');
    expect(panel.className).not.toContain('red');
    // Penting tapi tidak mendesak: diumumkan pembaca layar tanpa memotong
    // alur (bukan `role="alert"`).
    expect(panel).toHaveAttribute('role', 'status');

    // BUKTI TIDAK MEMBLOKIR: tombol tetap dirender, dan fieldset tetap bisa
    // diisi. Satu-satunya alasan tombol terkunci adalah syarat lokasi yang
    // sudah ada sebelumnya (`!installLocation.trim()`), BUKAN materi.
    const tombol = within(screen.getByRole('dialog')).getByRole('button', { name: /Catat Pemasangan/i });
    expect(tombol).toBeInTheDocument();
    const lokasi = within(fieldset).getByLabelText(/Media \/ lokasi pemasangan/i);
    expect(lokasi).not.toBeDisabled();
    expect(within(fieldset).getByLabelText(/Tanggal mulai/i)).not.toBeDisabled();
    fireEvent.change(lokasi, { target: { value: 'Atrium 1' } });
    expect(tombol).not.toBeDisabled();
  });

  it('source_type link (materi sudah ada) -> peringatan tidak tampil', async () => {
    siapkan(row({ source_type: 'link', link_url: 'https://drive.google.com/file/d/abc/view' }));
    renderDashboard();
    const fieldset = await bukaFieldsetPemasangan();

    expect(within(fieldset).queryByText(/Materi belum pernah diterima/i)).toBeNull();
    expect(within(fieldset).queryByRole('status')).toBeNull();
    // Fieldset dan tombol tetap ada seperti sebelumnya.
    const tombol = within(screen.getByRole('dialog')).getByRole('button', { name: /Catat Pemasangan/i });
    expect(tombol).toBeInTheDocument();
    fireEvent.change(within(fieldset).getByLabelText(/Media \/ lokasi pemasangan/i), {
      target: { value: 'Atrium 1' },
    });
    expect(tombol).not.toBeDisabled();
  });

  it('source_type upload -> peringatan tidak tampil', async () => {
    siapkan(row({
      source_type: 'upload', file_url: 'https://drive.google.com/file/d/file-1/view',
      file_name: 'spanduk.jpg', mime_type: 'image/jpeg', file_size_bytes: 1024,
    }));
    renderDashboard();
    const fieldset = await bukaFieldsetPemasangan();

    expect(within(fieldset).queryByText(/Materi belum pernah diterima/i)).toBeNull();
    expect(within(fieldset).queryByRole('status')).toBeNull();
    const tombol = within(screen.getByRole('dialog')).getByRole('button', { name: /Catat Pemasangan/i });
    expect(tombol).toBeInTheDocument();
    fireEvent.change(within(fieldset).getByLabelText(/Media \/ lokasi pemasangan/i), {
      target: { value: 'Atrium 1' },
    });
    expect(tombol).not.toBeDisabled();
  });
});
