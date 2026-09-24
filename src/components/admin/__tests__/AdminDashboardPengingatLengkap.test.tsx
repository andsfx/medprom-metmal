import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from '../AdminDashboardPage';
import { useAuth } from '../../../hooks/useAuth';
import {
  fetchAdminSubmissions, fetchAdminMediaTypes, fetchAdminSummary,
  fetchAdminSubmissionDetail, fetchAdminUsers, fetchAdminReminders,
  uploadInstallationProof,
} from '../../../utils/adminApi';
import type { AdminSubmissionRow, ReminderRow } from '../../../types/promo';

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
const mockedUploadProof = vi.mocked(uploadInstallationProof);

/** Bentuk baris API staf (snake_case) untuk tabel di belakang panel. */
function row(over: Partial<AdminSubmissionRow>): AdminSubmissionRow {
  return {
    id: 'sub-x', submission_number: 'MP-260916-ABC234', status_token: 'tok-x',
    media_type_slug: 'spanduk', tenant_id: 'T1', tenant_name: 'Optik Melawai',
    unit_number: 'L1-05', pic_name: 'Andi', pic_phone: '08123456789',
    campaign_name: 'Promo', material_title: 'Spanduk Diskon', material_description: '',
    material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
    installation_date: '', terms_accepted: true, notes: '',
    source_type: 'upload',
    file_url: 'https://drive.google.com/file/d/file-1/view', file_name: 'spanduk.jpg',
    mime_type: 'image/jpeg', file_size_bytes: 1024, drive_file_id: 'file-1', link_url: '',
    status: 'menunggu_review', status_changed_at: '2026-09-12T01:00:00Z',
    review_notes: '', reviewed_by: null, reviewed_at: null, reviewed_by_name: null,
    device_fingerprint: 'fp1', ip_address: '127.0.0.1',
    created_at: '2026-09-12T01:00:00Z', updated_at: '2026-09-12T01:00:00Z',
    ...over,
  };
}

const ROWS: AdminSubmissionRow[] = [row({ id: 'sub-1' })];

/**
 * Baris pengingat unik (nama tenant berbeda dari tabel) agar pencarian teks
 * tidak ambigu; tetap dipersempit lagi lewat `within(panel)` di tiap uji.
 */
function reminder(no: number): ReminderRow {
  return {
    id: `rem-${no}`,
    submission_number: `MP-260916-REM${String(no).padStart(3, '0')}`,
    tenant_name: `Pengingat Tenant ${no}`,
    pic_phone: `0812000000${no}`,
    applicant_type: 'tenant',
    media_type_slug: 'spanduk',
    status: 'sudah_dipasang',
    air_end_date: '2026-10-01',
    end_date: '2026-10-01',
    days_left: no,
    ppn_amount: 1000,
    total_amount: 11000,
  };
}

function panel(): HTMLElement {
  return screen.getByRole('region', { name: /Pengingat periode berakhir/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchSubmissions.mockResolvedValue({
    data: ROWS, total: 1, page: 1, per_page: 20, total_pages: 1,
  });
  mockedFetchMediaTypes.mockResolvedValue([]);
  mockedFetchUsers.mockResolvedValue([]);
  mockedFetchReminders.mockResolvedValue({ days: 14, overdue: 0, due_soon: 0, items: [] });
  mockedUploadProof.mockResolvedValue({ proof_file_id: 'p1', proof_file_url: 'https://drive.google.com/x' });
  mockedFetchSummary.mockResolvedValue({
    total: 1,
    counts: {
      menunggu_review: 1, perlu_revisi: 0, disetujui: 0, siap_dipasang: 0,
      sudah_dipasang: 0, ditolak: 0, selesai: 0, draft: 0,
    },
  });
  mockedFetchDetail.mockResolvedValue({
    submission: ROWS[0]!,
    history: [],
    files: [],
    installation: null,
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

describe('AdminDashboardPage — pengingat periode berakhir dapat dibuka lengkap', () => {
  it('7 item: 5 baris awal tampil + tombol "Tampilkan 2 lainnya"', async () => {
    mockedFetchReminders.mockResolvedValue({
      days: 14, overdue: 0, due_soon: 7,
      items: Array.from({ length: 7 }, (_, i) => reminder(i + 1)),
    });
    renderDashboard();

    await screen.findByRole('heading', { name: /Pengingat periode berakhir/i });
    const p = panel();

    // Hanya 5 baris pertama yang terlihat.
    expect(within(p).getAllByRole('listitem')).toHaveLength(5);
    for (let i = 1; i <= 5; i += 1) {
      expect(within(p).getByText(new RegExp(`Pengingat Tenant ${i} `))).toBeInTheDocument();
    }
    expect(within(p).queryByText(/Pengingat Tenant 6 /)).not.toBeInTheDocument();
    expect(within(p).queryByText(/Pengingat Tenant 7 /)).not.toBeInTheDocument();

    // Tombol buka daftar penuh, dengan atribut aksesibilitas yang benar.
    const toggle = within(p).getByRole('button', { name: 'Tampilkan 2 lainnya' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'pengingat-daftar');
    expect(toggle.className).toContain('min-h-11');
  });

  it('setelah tombol diklik: ketujuh item tampil dan tombol menjadi "Sembunyikan"', async () => {
    mockedFetchReminders.mockResolvedValue({
      days: 14, overdue: 0, due_soon: 7,
      items: Array.from({ length: 7 }, (_, i) => reminder(i + 1)),
    });
    renderDashboard();

    await screen.findByRole('heading', { name: /Pengingat periode berakhir/i });
    const p = panel();

    fireEvent.click(within(p).getByRole('button', { name: 'Tampilkan 2 lainnya' }));

    expect(within(p).getAllByRole('listitem')).toHaveLength(7);
    for (let i = 1; i <= 7; i += 1) {
      expect(within(p).getByText(new RegExp(`Pengingat Tenant ${i} `))).toBeInTheDocument();
    }

    const toggle = within(p).getByRole('button', { name: 'Sembunyikan' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'pengingat-daftar');

    // Wadah daftar menggulir agar panel tidak mendorong seluruh halaman.
    const list = p.querySelector('#pengingat-daftar');
    expect(list?.className).toContain('max-h-80');
    expect(list?.className).toContain('overflow-y-auto');

    // Kembali ke 5 baris saat "Sembunyikan" diklik.
    fireEvent.click(toggle);
    expect(within(p).getAllByRole('listitem')).toHaveLength(5);
  });

  it('3 item: tidak ada tombol buka-tutup', async () => {
    mockedFetchReminders.mockResolvedValue({
      days: 14, overdue: 0, due_soon: 3,
      items: Array.from({ length: 3 }, (_, i) => reminder(i + 1)),
    });
    renderDashboard();

    await screen.findByRole('heading', { name: /Pengingat periode berakhir/i });
    const p = panel();

    expect(within(p).getAllByRole('listitem')).toHaveLength(3);
    expect(within(p).queryByRole('button', { name: /Tampilkan/i })).not.toBeInTheDocument();
    expect(within(p).queryByRole('button', { name: /Sembunyikan/i })).not.toBeInTheDocument();
  });

  it('kategori belum tercatat terpasang: badge per baris + ringkasan jumlah', async () => {
    // Cakupan pengingat diperluas ke status Disetujui/Siap Dipasang. Kategori
    // dibedakan di server; panel menampilkan badge per baris dan jumlahnya di
    // ringkasan supaya staf tahu mana yang periodenya habis tanpa pernah
    // dicatat pemasangannya.
    mockedFetchReminders.mockResolvedValue({
      days: 14, overdue: 1, due_soon: 2, belum_terpasang: 2,
      items: [
        { ...reminder(1), category: 'terpasang', days_left: -2 },
        { ...reminder(2), category: 'belum_terpasang' },
        { ...reminder(3), category: 'belum_terpasang' },
      ],
    });
    renderDashboard();

    await screen.findByRole('heading', { name: /Pengingat periode berakhir/i });
    const p = panel();

    // Badge hanya pada dua baris kategori belum terpasang.
    expect(within(p).getAllByText('belum tercatat terpasang')).toHaveLength(2);
    // Ringkasan menyebut jumlahnya.
    expect(within(p).getByText(/2 belum tercatat terpasang/i)).toBeInTheDocument();
    expect(within(p).getByText(/1 sudah lewat/i)).toBeInTheDocument();
  });
});
