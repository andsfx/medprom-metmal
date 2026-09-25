/**
 * Test tab Pengaturan di dashboard staf.
 *
 * Kontrak yang dikunci:
 *  - tab "Pengaturan" hanya tampil untuk staf (admin/superadmin), tidak untuk
 *    tenant_relation;
 *  - nilai awal checkbox dibaca dari server (`fetchAdminSettings`), bukan
 *    hardcoded;
 *  - mencentang memanggil `updateAdminSettings({ tax_proof_enabled: true })`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from '../AdminDashboardPage';
import { useAuth } from '../../../hooks/useAuth';
import {
  fetchAdminSubmissions, fetchAdminMediaTypes, fetchAdminSummary,
  fetchAdminReminders, fetchAdminSettings, updateAdminSettings,
} from '../../../utils/adminApi';

vi.mock('../../../hooks/useAuth');
vi.mock('../../../utils/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/adminApi')>();
  return {
    ...actual,
    fetchAdminSubmissions: vi.fn(),
    fetchAdminSummary: vi.fn(),
    fetchAdminMediaTypes: vi.fn(),
    fetchAdminReminders: vi.fn(),
    fetchAdminSettings: vi.fn(),
    updateAdminSettings: vi.fn(),
  };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedFetchSettings = vi.mocked(fetchAdminSettings);
const mockedUpdateSettings = vi.mocked(updateAdminSettings);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAdminSubmissions).mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20, total_pages: 1 });
  vi.mocked(fetchAdminSummary).mockResolvedValue({ total: 0, counts: {} });
  vi.mocked(fetchAdminMediaTypes).mockResolvedValue([]);
  vi.mocked(fetchAdminReminders).mockResolvedValue({ days: 14, overdue: 0, due_soon: 0, belum_terpasang: 0, items: [] });
  mockedFetchSettings.mockResolvedValue({ tax_proof_enabled: false });
  mockedUpdateSettings.mockImplementation(async (input) => input);
});

function renderDashboard(role: string) {
  mockedUseAuth.mockReturnValue({
    user: { id: 'u1', email: 'admin@test', display_name: 'Admin Test', role },
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

describe('AdminDashboardPage — tab Pengaturan', () => {
  it('admin melihat tab Pengaturan dan nilainya dibaca dari server', async () => {
    renderDashboard('admin');
    fireEvent.click(await screen.findByRole('tab', { name: /Pengaturan/i }));

    const kotak = await screen.findByLabelText(/Bukti pembayaran pajak/i);
    expect(kotak).not.toBeChecked();
    expect(mockedFetchSettings).toHaveBeenCalled();
  });

  it('mencentang saklar memanggil updateAdminSettings', async () => {
    renderDashboard('admin');
    fireEvent.click(await screen.findByRole('tab', { name: /Pengaturan/i }));

    const kotak = await screen.findByLabelText(/Bukti pembayaran pajak/i);
    fireEvent.click(kotak);

    await waitFor(() => {
      expect(mockedUpdateSettings).toHaveBeenCalledWith({ tax_proof_enabled: true });
    });
  });

  it('nilai awal menyala bila server mengaktifkan', async () => {
    mockedFetchSettings.mockResolvedValue({ tax_proof_enabled: true });
    renderDashboard('superadmin');
    fireEvent.click(await screen.findByRole('tab', { name: /Pengaturan/i }));

    expect(await screen.findByLabelText(/Bukti pembayaran pajak/i)).toBeChecked();
  });

  it('tenant_relation tidak melihat tab Pengaturan', async () => {
    renderDashboard('tenant_relation');
    await screen.findByText(/Total 0 pengajuan tercatat/i);
    expect(screen.queryByRole('tab', { name: /Pengaturan/i })).not.toBeInTheDocument();
  });
});
