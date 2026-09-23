/**
 * Mount test baris identitas pemohon + nomor batch + perkiraan biaya pada
 * Sheet detail pengajuan di dashboard staf.
 *
 * Kontrak rapuh yang dikunci:
 *  1. `applicant_type` dari `POST /promo/submit-batch` benar-benar tampil
 *     sebagai baris "Jenis Pemohon"; sebelumnya tidak pernah dirender.
 *  2. Label baris nama mengikuti jenis pemohon: "Nama Tenant" untuk tenant dan
 *     "Nama Non Tenant" untuk non-tenant (nilainya tetap `tenant_name`).
 *  3. Penanda MID hanya bermakna untuk tenant. Non-tenant tidak boleh diberi
 *     "(MID ...)" maupun "(manual, tidak tertaut MID)" - keduanya menyesatkan
 *     karena pemohon non-tenant memang tidak punya MID.
 *  4. "Nomor Batch" tampil bila ada (pengajuan form cetak berisi beberapa
 *     media), dan tidak dirender sama sekali bila tidak ada.
 *  5. Baris "Perkiraan biaya" hanya dirender bila `total_amount > 0`, supaya
 *     pengajuan lama tanpa snapshot harga tidak menampilkan baris nol.
 *
 * Semua pencarian dipersempit ke dalam dialog (`role="dialog"`) karena label
 * seperti "Tenant" juga muncul di header kolom tabel dan filter di belakang
 * Sheet.
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
    status: 'menunggu_review', status_changed_at: '2026-09-12T01:00:00Z',
    review_notes: '', reviewed_by: null, reviewed_at: null, reviewed_by_name: null,
    device_fingerprint: 'fp1', ip_address: '127.0.0.1',
    created_at: '2026-09-12T01:00:00Z', updated_at: '2026-09-12T01:00:00Z',
    ...over,
  };
}

/** Satu baris pengajuan di daftar + detail yang cocok dengannya. */
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

describe('AdminDashboardPage - jenis pemohon di Sheet detail', () => {
  it('non-tenant menampilkan "Non-tenant" dan tanpa penanda MID', async () => {
    siapkan(row({
      applicant_type: 'non_tenant', tenant_id: '', tenant_name: 'Koperasi Karyawan', unit_number: '',
    }));
    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');

    expect(within(sheet).getByText('Jenis Pemohon')).toBeInTheDocument();
    expect(within(sheet).getByText('Non-tenant')).toBeInTheDocument();
    expect(within(sheet).getByText('Nama Non Tenant')).toBeInTheDocument();
    expect(within(sheet).getByText('Koperasi Karyawan')).toBeInTheDocument();

    // Penanda MID hanya bermakna untuk tenant.
    expect(within(sheet).queryByText(/MID/)).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/tidak tertaut MID/)).not.toBeInTheDocument();
    expect(within(sheet).queryByText('Nama Tenant')).not.toBeInTheDocument();
  });

  it('tenant menampilkan "Tenant" dan penanda MID tetap ada', async () => {
    siapkan(row({ applicant_type: 'tenant' }));
    renderDashboard();
    const sheet = await bukaDetail('Optik Melawai');

    expect(within(sheet).getByText('Jenis Pemohon')).toBeInTheDocument();
    expect(within(sheet).getByText('Tenant')).toBeInTheDocument();
    expect(within(sheet).getByText('Nama Tenant')).toBeInTheDocument();
    expect(within(sheet).getByText(/\(MID T1\)/)).toBeInTheDocument();
    expect(within(sheet).queryByText('Nama Non Tenant')).not.toBeInTheDocument();
  });

  it('tenant tanpa MID tetap ditandai manual', async () => {
    siapkan(row({ applicant_type: 'tenant', tenant_id: '' }));
    renderDashboard();
    const sheet = await bukaDetail('Optik Melawai');

    expect(within(sheet).getByText(/manual, tidak tertaut MID/)).toBeInTheDocument();
  });

  it('nomor batch tampil bila ada', async () => {
    siapkan(row({
      applicant_type: 'non_tenant', tenant_id: '', tenant_name: 'Koperasi Karyawan',
      batch_number: 'BATCH-260923-XY12',
    }));
    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');

    expect(within(sheet).getByText('Nomor Batch')).toBeInTheDocument();
    expect(within(sheet).getByText('BATCH-260923-XY12')).toBeInTheDocument();
  });

  it('nomor batch tidak dirender bila tidak ada', async () => {
    renderDashboard();
    const sheet = await bukaDetail('Optik Melawai');

    expect(within(sheet).queryByText('Nomor Batch')).not.toBeInTheDocument();
  });
});

describe('AdminDashboardPage - perkiraan biaya di Sheet detail', () => {
  it('total_amount > 0 menampilkan subtotal, PPN, dan total dalam format rupiah', async () => {
    siapkan(row({
      applicant_type: 'non_tenant', tenant_id: '', tenant_name: 'Koperasi Karyawan',
      batch_number: 'BATCH-260923-XY12',
      ppn_included: false, subtotal: 2100000, ppn_amount: 231000, total_amount: 2331000,
    }));
    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');

    expect(within(sheet).getByText('Perkiraan biaya')).toBeInTheDocument();
    expect(within(sheet).getByText(/Subtotal Rp\. 2\.100\.000/)).toBeInTheDocument();
    expect(within(sheet).getByText(/PPN Rp\. 231\.000/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Total Rp\. 2\.331\.000/)).toBeInTheDocument();
    expect(within(sheet).getByText(/tidak melakukan penagihan/i)).toBeInTheDocument();
  });

  it('media ber-ppn_included melabeli baris PPN sebagai "Termasuk PPN"', async () => {
    siapkan(row({
      applicant_type: 'non_tenant', tenant_id: '', tenant_name: 'Koperasi Karyawan',
      ppn_included: true, subtotal: 1000000, ppn_amount: 99099, total_amount: 1000000,
    }));
    renderDashboard();
    const sheet = await bukaDetail('Koperasi Karyawan');

    expect(within(sheet).getByText(/Termasuk PPN Rp\. 99\.099/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Total Rp\. 1\.000\.000/)).toBeInTheDocument();
  });

  it('total_amount 0 atau tidak ada tidak menampilkan baris perkiraan biaya', async () => {
    renderDashboard();
    const sheet = await bukaDetail('Optik Melawai');

    // Pengajuan lama tanpa snapshot harga.
    expect(within(sheet).queryByText('Perkiraan biaya')).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/tidak melakukan penagihan/i)).not.toBeInTheDocument();
  });
});
