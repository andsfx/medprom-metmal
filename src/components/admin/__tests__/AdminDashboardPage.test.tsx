import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from '../AdminDashboardPage';
import { useAuth } from '../../../hooks/useAuth';
import { fetchAdminSubmissions, fetchAdminMediaTypes, updateSubmissionStatus } from '../../../utils/adminApi';
import type { AdminSubmissionRow } from '../../../types/promo';

vi.mock('../../../hooks/useAuth');
vi.mock('../../../utils/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/adminApi')>();
  return {
    ...actual,
    fetchAdminSubmissions: vi.fn(),
    fetchAdminMediaTypes: vi.fn(),
    updateSubmissionStatus: vi.fn(),
    deleteSubmission: vi.fn(),
    downloadExportCsv: vi.fn(),
  };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedFetchSubmissions = vi.mocked(fetchAdminSubmissions);
const mockedFetchMediaTypes = vi.mocked(fetchAdminMediaTypes);
const mockedUpdateStatus = vi.mocked(updateSubmissionStatus);

const ROWS: AdminSubmissionRow[] = [
  {
    id: 'sub-1', media_type_slug: 'spanduk', tenant_id: 'T1', tenant_name: 'Optik Melawai',
    pic_name: 'Andi', pic_phone: '08123456789', installation_date: '', notes: '',
    source_type: 'upload',
    file_url: 'https://r2.example/promo/1.jpg', file_name: 'spanduk.jpg',
    mime_type: 'image/jpeg', file_size_bytes: 1024, link_url: '', status: 'pending',
    review_notes: '', reviewed_by: null, reviewed_at: null, reviewed_by_name: null,
    device_fingerprint: 'fp1', ip_address: '127.0.0.1', created_at: '2026-09-12T01:00:00Z',
  },
  {
    id: 'sub-2', media_type_slug: 'videotron', tenant_id: 'T2', tenant_name: 'Momoiro',
    pic_name: 'Budi', pic_phone: '08987654321', installation_date: '2026-09-20', notes: '',
    source_type: 'upload',
    file_url: 'https://r2.example/promo/2.mp4', file_name: 'video.mp4',
    mime_type: 'video/mp4', file_size_bytes: 2048, link_url: '', status: 'approved',
    review_notes: 'OK', reviewed_by: 'u1', reviewed_at: '2026-09-12T02:00:00Z', reviewed_by_name: 'Admin Test',
    device_fingerprint: 'fp2', ip_address: '127.0.0.1', created_at: '2026-09-11T01:00:00Z',
  },
  {
    id: 'sub-3', media_type_slug: 'big-banner', tenant_id: 'T3', tenant_name: 'Kopi Kenangan',
    pic_name: 'Citra', pic_phone: '08111222333', installation_date: '', notes: '',
    source_type: 'link',
    file_url: '', file_name: '', mime_type: '', file_size_bytes: 0,
    link_url: 'https://drive.google.com/file/d/abc/view', status: 'pending',
    review_notes: '', reviewed_by: null, reviewed_at: null, reviewed_by_name: null,
    device_fingerprint: 'fp3', ip_address: '127.0.0.1', created_at: '2026-09-10T01:00:00Z',
  },
];

const PAGE = { data: ROWS, total: 3, page: 1, per_page: 20, total_pages: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchSubmissions.mockResolvedValue(PAGE);
  mockedFetchMediaTypes.mockResolvedValue([]);
});

function renderDashboard(user: { id: string; email: string; display_name: string; role: string } | null) {
  mockedUseAuth.mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

describe('AdminDashboardPage', () => {
  it('tanpa sesi → tampilkan prompt login', () => {
    renderDashboard(null);
    expect(screen.getByText(/Sesi berakhir atau belum login/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  });

  it('role admin: tabel pengajuan + aksi lengkap', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });

    expect(await screen.findByText('Optik Melawai')).toBeInTheDocument();
    expect(screen.getByText('Momoiro')).toBeInTheDocument();
    expect(screen.getAllByText('Menunggu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Disetujui').length).toBeGreaterThan(0);
    // Admin bisa review + hapus.
    expect(screen.getAllByRole('button', { name: /Detail/i }).length).toBe(3);
    expect(screen.getAllByRole('button', { name: /Hapus pengajuan/i }).length).toBe(3);
  });

  it('pengajuan bertautan: tabel menaut ke URL eksternal, bukan file R2', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Kopi Kenangan');

    expect(screen.getByRole('link', { name: /tautan materi/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
  });

  it('modal detail pengajuan bertautan menampilkan URL penuh', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Kopi Kenangan');

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[2]!);
    expect(await screen.findByText(/tidak tersimpan di server kami/i)).toBeInTheDocument();
  });

  it('role tenant_relation: read-only — tanpa tombol hapus/status', async () => {
    renderDashboard({ id: 'u2', email: 'tr@test', display_name: 'TR Test', role: 'tenant_relation' });

    await screen.findByText('Optik Melawai');
    expect(screen.queryByRole('button', { name: /Hapus pengajuan/i })).not.toBeInTheDocument();
    // Detail tetap bisa dibuka, tapi tanpa form status.
    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[0]!);
    await waitFor(() => {
      expect(screen.getByText(/hanya dapat melihat dan mengunduh/i)).toBeInTheDocument();
    });
  });

  it('filter status memicu fetch ulang dengan parameter', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.change(screen.getByLabelText(/Status/i), { target: { value: 'pending' } });

    await waitFor(() => {
      expect(mockedFetchSubmissions).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    });
  });

  it('admin menyetujui pengajuan lewat modal detail', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[0]!);
    await screen.findByText(/Set status/i);

    fireEvent.click(screen.getByRole('radio', { name: 'Terpasang' }));
    fireEvent.change(screen.getByLabelText(/Catatan Review/i), { target: { value: 'Sudah terpasang hari Jumat.' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan/i }));

    await waitFor(() => {
      expect(mockedUpdateStatus).toHaveBeenCalledWith('sub-1', 'installed', 'Sudah terpasang hari Jumat.');
    });
    // Modal tertutup + list dimuat ulang.
    await waitFor(() => {
      expect(screen.queryByText(/Set status/i)).not.toBeInTheDocument();
    });
  });

  it('role superadmin: tab Pengguna tampil; admin: tidak', async () => {
    const { unmount } = renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin', role: 'admin' });
    await screen.findByText('Optik Melawai');
    expect(screen.queryByRole('tab', { name: /Pengguna/i })).not.toBeInTheDocument();
    unmount();

    renderDashboard({ id: 's1', email: 'super@test', display_name: 'Super', role: 'superadmin' });
    await screen.findByText('Optik Melawai');
    expect(screen.getByRole('tab', { name: /Pengguna/i })).toBeInTheDocument();
  });
});
