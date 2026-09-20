import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from '../AdminDashboardPage';
import { useAuth } from '../../../hooks/useAuth';
import {
  fetchAdminSubmissions, fetchAdminMediaTypes, updateSubmissionStatus,
  fetchAdminSummary, fetchAdminSubmissionDetail, recordInstallation,
  fetchAdminUsers, fetchAdminReminders, uploadInstallationProof, createMediaType,
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
const mockedUpdateStatus = vi.mocked(updateSubmissionStatus);
const mockedRecordInstallation = vi.mocked(recordInstallation);
const mockedFetchUsers = vi.mocked(fetchAdminUsers);
const mockedFetchReminders = vi.mocked(fetchAdminReminders);
const mockedUploadProof = vi.mocked(uploadInstallationProof);
const mockedCreateMediaType = vi.mocked(createMediaType);

/** Bentuk baris API staf (snake_case, 8 status PRD). */
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

const ROWS: AdminSubmissionRow[] = [
  row({ id: 'sub-1' }),
  row({
    id: 'sub-2', submission_number: 'MP-260916-DEF567', media_type_slug: 'videotron',
    tenant_id: 'T2', tenant_name: 'Momoiro', unit_number: 'L2-10',
    pic_name: 'Budi', pic_phone: '08987654321', installation_date: '2026-09-20',
    material_title: 'Video Promo', source_type: 'upload',
    file_url: 'https://drive.google.com/file/d/file-2/view', file_name: 'video.mp4',
    mime_type: 'video/mp4', drive_file_id: 'file-2', status: 'disetujui',
    review_notes: 'OK', reviewed_by: 'u1', reviewed_at: '2026-09-12T02:00:00Z',
    reviewed_by_name: 'Admin Test', device_fingerprint: 'fp2',
    created_at: '2026-09-11T01:00:00Z',
  }),
  row({
    id: 'sub-3', submission_number: 'MP-260916-GHI890', media_type_slug: 'big-banner',
    tenant_id: 'T3', tenant_name: 'Kopi Kenangan', unit_number: 'L3-01',
    pic_name: 'Citra', pic_phone: '08111222333', source_type: 'link',
    file_url: '', file_name: '', mime_type: '', file_size_bytes: 0, drive_file_id: '',
    link_url: 'https://drive.google.com/file/d/abc/view', status: 'menunggu_review',
    device_fingerprint: 'fp3', created_at: '2026-09-10T01:00:00Z',
  }),
];

const PAGE = { data: ROWS, total: 3, page: 1, per_page: 20, total_pages: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchSubmissions.mockResolvedValue(PAGE);
  mockedFetchMediaTypes.mockResolvedValue([]);
  mockedFetchUsers.mockResolvedValue([]);
  mockedFetchReminders.mockResolvedValue({ days: 14, overdue: 0, due_soon: 0, items: [] });
  mockedUploadProof.mockResolvedValue({ proof_file_id: 'p1', proof_file_url: 'https://drive.google.com/x' });
  mockedFetchSummary.mockResolvedValue({
    total: 3,
    counts: {
      menunggu_review: 2, perlu_revisi: 0, disetujui: 1, siap_dipasang: 0,
      sudah_dipasang: 0, ditolak: 0, selesai: 0, draft: 0,
    },
  });
  mockedFetchDetail.mockResolvedValue({
    submission: ROWS[0]!,
    history: [{
      id: 'h1', submission_id: 'sub-1', from_status: '', to_status: 'menunggu_review',
      comment: 'Pengajuan dikirim tenant', actor_type: 'tenant', actor_name: '',
      actor_id: null, created_at: '2026-09-12T01:00:00Z',
    }],
    files: [{
      id: 'f1', submission_id: 'sub-1', version: 1, source_type: 'upload',
      file_url: 'https://drive.google.com/file/d/file-1/view', file_name: 'spanduk.jpg',
      mime_type: 'image/jpeg', file_size_bytes: 1024, link_url: '', drive_file_id: 'file-1',
      uploaded_by: 'tenant', notes: '', created_at: '2026-09-12T01:00:00Z',
    }],
    installation: null,
  });
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
    // Nomor pengajuan tampil di tabel (FR-026).
    expect(screen.getByText('MP-260916-ABC234')).toBeInTheDocument();
    expect(screen.getAllByText('Menunggu Review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Disetujui').length).toBeGreaterThan(0);
    // Admin bisa review + hapus.
    expect(screen.getAllByRole('button', { name: /Detail/i }).length).toBe(3);
    expect(screen.getAllByRole('button', { name: /Hapus pengajuan/i }).length).toBe(3);
  });

  it('menampilkan ringkasan jumlah per status (FR-025)', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    // Ringkasan dirender sebagai tombol filter: label status + jumlah.
    const pendingCard = screen.getByRole('button', { name: /Menunggu Review 2/i });
    expect(pendingCard).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disetujui 1/i })).toBeInTheDocument();
    expect(screen.getByText(/Total 3 pengajuan tercatat/i)).toBeInTheDocument();
  });

  it('mencari pengajuan lewat kolom cari (FR-026)', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.change(screen.getByLabelText(/^Cari$/i), { target: { value: 'MP-260916' } });

    await waitFor(() => {
      expect(mockedFetchSubmissions).toHaveBeenCalledWith(expect.objectContaining({ q: 'MP-260916' }));
    });
  });

  it('memfilter berdasarkan rentang tanggal (FR-027)', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.change(screen.getByLabelText(/Dari tanggal/i), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/Sampai tanggal/i), { target: { value: '2026-09-30' } });

    await waitFor(() => {
      expect(mockedFetchSubmissions).toHaveBeenCalledWith(expect.objectContaining({
        date_from: '2026-09-01', date_to: '2026-09-30',
      }));
    });
  });

  it('pengajuan bertautan: tabel menaut ke URL eksternal, bukan file Drive', async () => {
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

  it('modal detail: tombol buka materi + pesan WA dengan nomor ternormalisasi', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[0]!);
    await screen.findByText(/Ubah status/i);

    // Aksi verifikasi manual: tautan materi sebagai tombol primer.
    expect(screen.getByRole('link', { name: /Buka tautan materi/i }))
      .toHaveAttribute('href', 'https://drive.google.com/file/d/file-1/view');

    // wa.me menerima digit + kode negara: 08123456789 → 628123456789.
    const wa = screen.getByRole('link', { name: /Kirim pesan WA/i });
    expect(wa.getAttribute('href')).toContain('https://wa.me/628123456789?text=');
  });

  it('modal detail menampilkan riwayat status dan versi materi (FR-030, FR-031)', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[0]!);

    expect(await screen.findByText('Riwayat status')).toBeInTheDocument();
    expect(screen.getByText('Versi materi')).toBeInTheDocument();
    expect(screen.getByText('Versi 1')).toBeInTheDocument();
  });

  it('menandai pengajuan yang masuk lebih lambat dari lead time media', async () => {
    mockedFetchMediaTypes.mockResolvedValue([{
      slug: 'videotron', category: 'indoor', name: 'Videotron',
      size_spec: '', material_spec: '', accepted_formats: 'JPEG', image_path: '',
      price_note: '', location_note: '',
      rules: 'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
      sort_order: 10,
    }]);
    // sub-2: dibuat 2026-09-11, pasang 2026-09-20 → jauh dari lead time (aman).
    // Ganti fixture agar tanggal pasang lebih dekat dari 3 hari kerja.
    mockedFetchSubmissions.mockResolvedValue({
      ...PAGE,
      data: [{ ...ROWS[1]!, installation_date: '2026-09-12' }],
    });

    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Momoiro');

    // 2026-09-11 (Jumat) + 3 hari kerja → 2026-09-16; pasang 09-12 terlalu dekat.
    expect(await screen.findByText(/< lead time/i)).toBeInTheDocument();
  });

  it('tidak menandai pengajuan yang tanggalnya sudah aman', async () => {
    mockedFetchMediaTypes.mockResolvedValue([{
      slug: 'videotron', category: 'indoor', name: 'Videotron',
      size_spec: '', material_spec: '', accepted_formats: 'JPEG', image_path: '',
      price_note: '', location_note: '',
      rules: 'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
      sort_order: 10,
    }]);
    // Fixture asli: pasang 2026-09-20, jauh melewati lead time.
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Momoiro');

    expect(screen.queryByText(/< lead time/i)).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText(/^Status$/i), { target: { value: 'perlu_revisi' } });

    await waitFor(() => {
      expect(mockedFetchSubmissions).toHaveBeenCalledWith(expect.objectContaining({ status: 'perlu_revisi' }));
    });
  });

  it('admin menyetujui pengajuan lewat modal detail', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[0]!);
    await screen.findByText(/Ubah status/i);

    // Hanya transisi sah dari Menunggu Review yang ditawarkan.
    expect(screen.getByRole('radio', { name: /Disetujui/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Ditolak/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Perlu Revisi/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Sudah Dipasang/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Disetujui/i }));
    fireEvent.change(screen.getByLabelText(/Catatan Review/i), { target: { value: 'Materi sesuai ketentuan.' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan Status/i }));

    await waitFor(() => {
      expect(mockedUpdateStatus).toHaveBeenCalledWith('sub-1', 'disetujui', 'Materi sesuai ketentuan.');
    });
    // Modal tertutup + list dimuat ulang.
    await waitFor(() => {
      expect(screen.queryByText(/Ubah status/i)).not.toBeInTheDocument();
    });
  });

  it('menawarkan pemasangan hanya untuk materi Disetujui (FR-040)', async () => {
    // sub-2 = disetujui; buka detailnya (indeks 1).
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Momoiro');

    mockedFetchDetail.mockResolvedValue({
      submission: ROWS[1]!,
      history: [],
      files: [],
      installation: null,
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[1]!);

    expect(await screen.findByRole('group', { name: /Catat pemasangan/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Media \/ lokasi pemasangan/i)).toBeInTheDocument();
  });

  it('mencatat pemasangan lewat modal detail (FR-041..FR-044)', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Momoiro');

    mockedFetchDetail.mockResolvedValue({
      submission: ROWS[1]!, history: [], files: [], installation: null,
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[1]!);

    fireEvent.change(await screen.findByLabelText(/Media \/ lokasi pemasangan/i), {
      target: { value: 'Videotron Atrium 1' },
    });
    fireEvent.change(screen.getByLabelText(/Tanggal mulai/i), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Catat Pemasangan/i }));

    await waitFor(() => {
      expect(mockedRecordInstallation).toHaveBeenCalledWith('sub-2', expect.objectContaining({
        media_location: 'Videotron Atrium 1',
        start_date: '2026-10-01',
      }));
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

  it('daftar pengajuan kosong → pesan keadaan kosong diumumkan (role=status)', async () => {
    mockedFetchSubmissions.mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20, total_pages: 1 });
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });

    const pesan = await screen.findByText('Tidak ada pengajuan.');
    expect(pesan).toHaveAttribute('role', 'status');
  });

  it('katalog kosong → panel keadaan kosong, bukan grid tanpa pesan', async () => {
    mockedFetchMediaTypes.mockResolvedValue([]);
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getByRole('tab', { name: /Katalog Media/i }));

    const pesan = await screen.findByText(/Belum ada media di katalog/i);
    expect(pesan.closest('[role="status"]')).not.toBeNull();
  });

  it('form katalog menyediakan pilihan kanal Cetak/Digital dan mengirimnya', async () => {
    mockedFetchMediaTypes.mockResolvedValue([{
      slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
      size_spec: '', material_spec: '', accepted_formats: 'JPEG,PDF',
      image_path: '', price_note: 'Rp. 70.000,-/hari', location_note: '', rules: '',
      sort_order: 1, media_channel: 'cetak', price_amount: 70000,
      price_unit: 'hari', ppn_included: false,
    }]);
    mockedCreateMediaType.mockResolvedValue('mt-baru');
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getByRole('tab', { name: /Katalog Media/i }));
    // Baris daftar menampilkan kanal, kategori, dan slug.
    expect(await screen.findByText(/\/spanduk/)).toBeInTheDocument();
    expect(screen.getByText(/Media Promosi Cetak/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tambah Media/i }));
    const kanal = await screen.findByLabelText(/^Kanal$/i);
    expect(kanal).toHaveValue('digital');
    fireEvent.change(kanal, { target: { value: 'cetak' } });

    fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: 'banner-baru' } });
    fireEvent.change(screen.getByLabelText(/^Nama$/i), { target: { value: 'Banner Baru' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan/i }));

    await waitFor(() => expect(mockedCreateMediaType).toHaveBeenCalledTimes(1));
    expect(mockedCreateMediaType).toHaveBeenCalledWith(expect.objectContaining({ media_channel: 'cetak' }));
  });

  it('form katalog mengirim harga numerik, satuan, dan penanda PPN', async () => {
    mockedFetchMediaTypes.mockResolvedValue([]);
    mockedCreateMediaType.mockResolvedValue('mt-baru');
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getByRole('tab', { name: /Katalog Media/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Tambah Media/i }));

    fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: 'spanduk' } });
    fireEvent.change(screen.getByLabelText(/^Nama$/i), { target: { value: 'Spanduk' } });
    fireEvent.change(screen.getByLabelText(/Harga numerik/i), { target: { value: '70000' } });
    fireEvent.change(screen.getByLabelText(/Satuan harga/i), { target: { value: 'hari' } });
    fireEvent.click(screen.getByLabelText(/Harga sudah termasuk PPN/i));
    fireEvent.click(screen.getByRole('button', { name: /Simpan/i }));

    await waitFor(() => expect(mockedCreateMediaType).toHaveBeenCalledTimes(1));
    expect(mockedCreateMediaType).toHaveBeenCalledWith(expect.objectContaining({
      price_amount: 70000, price_unit: 'hari', ppn_included: true,
    }));
  });

  it('harga numerik bawaan 0 (media gratis) dan PPN tidak dicentang', async () => {
    mockedFetchMediaTypes.mockResolvedValue([]);
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');
    fireEvent.click(screen.getByRole('tab', { name: /Katalog Media/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Tambah Media/i }));

    expect(screen.getByLabelText(/Harga numerik/i)).toHaveValue(0);
    expect(screen.getByLabelText(/Harga sudah termasuk PPN/i)).not.toBeChecked();
  });

  it('pengguna kosong → panel keadaan kosong (superadmin)', async () => {
    renderDashboard({ id: 's1', email: 'super@test', display_name: 'Super', role: 'superadmin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getByRole('tab', { name: /Pengguna/i }));

    const pesan = await screen.findByText(/Belum ada akun staf/i);
    expect(pesan.closest('[role="status"]')).not.toBeNull();
  });

  it('Perlu Revisi tanpa catatan → Simpan Status terkunci + pesan tertaut field', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[0]!);
    await screen.findByText(/Ubah status/i);

    // Awalnya catatan kosong & status tersimpan → tombol tetap bisa ditekan.
    const simpan = screen.getByRole('button', { name: /Simpan Status/i });
    expect(simpan).not.toBeDisabled();

    // Pilih Perlu Revisi tanpa mengisi catatan → terkunci (cermin aturan server).
    fireEvent.click(screen.getByRole('radio', { name: /Perlu Revisi/i }));
    await waitFor(() => { expect(simpan).toBeDisabled(); });

    const pesan = screen.getByText(/Catatan wajib diisi saat meminta revisi/i);
    expect(pesan).toHaveAttribute('id', 'err-review-notes');
    expect(screen.getByLabelText(/Catatan Review/i)).toHaveAttribute('aria-describedby', 'err-review-notes');

    // Mengisi catatan membuka kuncinya kembali.
    fireEvent.change(screen.getByLabelText(/Catatan Review/i), { target: { value: 'Perbaiki resolusi.' } });
    await waitFor(() => { expect(simpan).not.toBeDisabled(); });
  });

  it('Ditolak tanpa catatan → pesan alasan wajib (cermin pesan server)', async () => {
    renderDashboard({ id: 'u1', email: 'admin@test', display_name: 'Admin Test', role: 'admin' });
    await screen.findByText('Optik Melawai');

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[0]!);
    await screen.findByText(/Ubah status/i);
    fireEvent.click(screen.getByRole('radio', { name: /Ditolak/i }));

    expect(await screen.findByText(/Alasan wajib diisi saat menolak materi/i)).toBeInTheDocument();
  });
});

describe('AdminDashboardPage — pengingat periode berakhir', () => {
  it('menampilkan panel pengingat bila ada materi mendekati akhir periode', async () => {
    mockedFetchReminders.mockResolvedValue({
      days: 14,
      overdue: 1,
      due_soon: 1,
      items: [
        {
          id: 'sub-1', submission_number: 'MP-260916-ABC234', tenant_name: 'Optik Melawai',
          pic_phone: '08123456789', applicant_type: 'tenant', media_type_slug: 'spanduk',
          status: 'sudah_dipasang', air_end_date: '2026-10-01', end_date: '2026-10-01',
          days_left: -2, ppn_amount: 53900, total_amount: 543900,
        },
        {
          id: 'sub-2', submission_number: 'MP-260916-DEF567', tenant_name: 'Momoiro',
          pic_phone: '08987654321', applicant_type: 'tenant', media_type_slug: 'big-banner',
          status: 'sudah_dipasang', air_end_date: '2026-10-05', end_date: '2026-10-05',
          days_left: 3, ppn_amount: 107800, total_amount: 1087800,
        },
      ],
    });
    renderDashboard({ id: 'u1', email: 'a@b.c', display_name: 'Admin', role: 'admin' });

    expect(await screen.findByRole('heading', { name: /Pengingat periode berakhir/i })).toBeInTheDocument();
    expect(screen.getByText(/1 sudah lewat/i)).toBeInTheDocument();
    expect(screen.getByText(/3 hari lagi/i)).toBeInTheDocument();
  });

  it('tidak menampilkan panel bila tidak ada pengingat', async () => {
    renderDashboard({ id: 'u1', email: 'a@b.c', display_name: 'Admin', role: 'admin' });
    await screen.findByText(/Total 3 pengajuan tercatat/i);
    expect(screen.queryByRole('heading', { name: /Pengingat periode berakhir/i })).not.toBeInTheDocument();
  });
});

describe('AdminDashboardPage — bukti tayang kanal unggahan', () => {
  it('memilih "Unggah Foto" mengganti input tautan menjadi pemilih berkas', async () => {
    mockedFetchDetail.mockResolvedValue({
      submission: { ...ROWS[1]!, status: 'disetujui' },
      history: [], files: [], installation: null,
    });
    renderDashboard({ id: 'u1', email: 'a@b.c', display_name: 'Admin', role: 'admin' });
    await screen.findByText(/Optik Melawai/i);

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[1]!);
    // Legenda fieldset — bukan tombol "Catat Pemasangan".
    await screen.findByText('Catat pemasangan', { selector: 'legend' });

    // Default: kanal tautan.
    expect(screen.getByLabelText(/Tautan bukti pemasangan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Unggah Foto/i }));
    expect(await screen.findByLabelText(/Berkas bukti/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tautan bukti pemasangan/i)).not.toBeInTheDocument();
  });

  it('menyimpan pemasangan dengan kanal unggahan mengirim berkas ke server', async () => {
    mockedFetchDetail.mockResolvedValue({
      submission: { ...ROWS[1]!, status: 'disetujui' },
      history: [], files: [], installation: null,
    });
    renderDashboard({ id: 'u1', email: 'a@b.c', display_name: 'Admin', role: 'admin' });
    await screen.findByText(/Optik Melawai/i);

    fireEvent.click(screen.getAllByRole('button', { name: /Detail/i })[1]!);
    await screen.findByText('Catat pemasangan', { selector: 'legend' });
    fireEvent.change(screen.getByLabelText(/Media \/ lokasi pemasangan/i), { target: { value: 'Atrium 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Unggah Foto/i }));

    const berkas = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bukti.jpg', { type: 'image/jpeg' });
    fireEvent.change(await screen.findByLabelText(/Berkas bukti/i), { target: { files: [berkas] } });

    fireEvent.click(screen.getByRole('button', { name: /Catat Pemasangan/i }));

    await waitFor(() => expect(mockedRecordInstallation).toHaveBeenCalledTimes(1));
    expect(mockedRecordInstallation).toHaveBeenCalledWith('sub-2', expect.objectContaining({ proof_kind: 'upload' }));
    await waitFor(() => expect(mockedUploadProof).toHaveBeenCalledWith('sub-2', berkas));
  });
});
