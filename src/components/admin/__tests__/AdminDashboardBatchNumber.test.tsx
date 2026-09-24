/**
 * Mount test kolom "Nomor" pada tabel daftar pengajuan di dashboard staf.
 *
 * Kontrak rapuh yang dikunci:
 *  1. Baris pengajuan cetak (batch) menampilkan `batch_number` di bawah
 *     `submission_number`, karena `GET /admin/submissions` sudah mengirim
 *     `b.batch_number` (LEFT JOIN `promo_submission_batches`) tetapi UI dulu
 *     membuangnya sehingga staf tidak bisa mengenali baris batch dari daftar.
 *  2. Baris non-batch (`batch_number` null/undefined) tidak menambah elemen
 *     kosong: tidak ada `<p>` kosong, dan teks nomor pengajuan tetap benar.
 *
 * Semua pencarian dipersempit ke sel kolom "Nomor" baris yang bersangkutan
 * supaya nomor batch yang juga muncul di Sheet detail (di balik tabel) tidak
 * membuat asersi lolos secara palsu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from '../AdminDashboardPage';
import { useAuth } from '../../../hooks/useAuth';
import {
  fetchAdminSubmissions, fetchAdminMediaTypes, fetchAdminSummary,
  fetchAdminSubmissionDetail, fetchAdminUsers, fetchAdminReminders,
} from '../../../utils/adminApi';
import type { AdminSubmissionRow } from '../../../types/promo';
import type * as AdminApiModule from '../../../utils/adminApi';

vi.mock('../../../hooks/useAuth');
vi.mock('../../../utils/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof AdminApiModule>();
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

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue([]);
  mockedFetchUsers.mockResolvedValue([]);
  mockedFetchReminders.mockResolvedValue({ days: 14, overdue: 0, due_soon: 0, items: [] });
  mockedFetchSummary.mockResolvedValue({ total: 2, counts: { menunggu_review: 2 } });
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

/** Sel kolom "Nomor" baris tabel yang memuat teks nomor pengajuan. */
function selNomor(nomor: string): HTMLTableCellElement {
  const sel = screen.getByText(nomor).closest('td');
  if (!sel) throw new Error(`sel kolom Nomor untuk ${nomor} tidak ditemukan`);
  return sel as HTMLTableCellElement;
}

describe('AdminDashboardPage - nomor batch di kolom Nomor tabel daftar', () => {
  it('baris ber-batch menampilkan batch_number di bawah nomor pengajuan', async () => {
    const denganBatch = row({ id: 'sub-batch', submission_number: 'MP-260923-BATCH1', batch_number: 'BATCH-2609-0007' });
    const tanpaBatch = row({ id: 'sub-plain', submission_number: 'MP-260923-PLAIN2' });
    mockedFetchSubmissions.mockResolvedValue({
      data: [denganBatch, tanpaBatch], total: 2, page: 1, per_page: 20, total_pages: 1,
    });
    mockedFetchDetail.mockResolvedValue({ submission: denganBatch, history: [], files: [], installation: null });

    renderDashboard();
    await screen.findByText('MP-260923-BATCH1');

    const sel = selNomor('MP-260923-BATCH1');
    expect(within(sel).getByText('BATCH-2609-0007')).toBeInTheDocument();
  });

  it('baris tanpa batch tidak menambah elemen kosong dan nomornya tetap benar', async () => {
    const denganBatch = row({ id: 'sub-batch', submission_number: 'MP-260923-BATCH1', batch_number: 'BATCH-2609-0007' });
    const tanpaBatch = row({ id: 'sub-plain', submission_number: 'MP-260923-PLAIN2' });
    mockedFetchSubmissions.mockResolvedValue({
      data: [denganBatch, tanpaBatch], total: 2, page: 1, per_page: 20, total_pages: 1,
    });
    mockedFetchDetail.mockResolvedValue({ submission: tanpaBatch, history: [], files: [], installation: null });

    renderDashboard();
    await screen.findByText('MP-260923-PLAIN2');

    const sel = selNomor('MP-260923-PLAIN2');
    // Nomor pengajuan tetap tampil utuh.
    expect(within(sel).getByText('MP-260923-PLAIN2')).toBeInTheDocument();
    // Tidak ada elemen `<p>` kosong yang lahir dari batch yang tidak ada.
    const paragrafKosong = Array.from(sel.querySelectorAll('p')).filter((p) => (p.textContent ?? '').trim() === '');
    expect(paragrafKosong).toHaveLength(0);
    // Tidak ada sisa teks batch dari baris lain.
    expect(within(sel).queryByText(/BATCH-/)).not.toBeInTheDocument();
  });
});
