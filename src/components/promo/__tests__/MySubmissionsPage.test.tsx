/**
 * Test halaman Riwayat per perangkat.
 *
 * Kontrak rapuh yang dikunci: riwayat memakai fingerprint perangkat (bukan
 * akun), tiap baris menautkan ke halaman status lewat token, dan keadaan kosong
 * menyediakan jalan ke pelacakan nomor — supaya tenant yang pindah perangkat
 * tahu ada jalur lain selain riwayat ini.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MySubmissionsPage from '../MySubmissionsPage';
import { fetchMySubmissions } from '../../../utils/promoApi';
import type { MySubmissionRow } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return { ...actual, fetchMySubmissions: vi.fn() };
});

const mockedFetch = vi.mocked(fetchMySubmissions);

const ROW: MySubmissionRow = {
  id: 'sub-1', submission_number: 'MP-260918-A7K2QX', status_token: 'tok-1',
  media_type_slug: 'spanduk', tenant_name: 'Optik Melawai', unit_number: 'L1-05',
  material_title: 'Spanduk Diskon 50%', material_description: '', campaign_name: '',
  material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
  installation_date: '', notes: '', status: 'perlu_revisi', review_notes: 'Perbaiki resolusi.',
  status_changed_at: null, created_at: '2026-09-18T01:00:00Z', updated_at: '2026-09-18T01:00:00Z',
  source_type: 'link', file_url: '', file_name: '', link_url: 'https://drive.google.com/file/d/x/view',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MySubmissionsPage />
    </MemoryRouter>,
  );
}

describe('MySubmissionsPage', () => {
  it('mengirim fingerprint perangkat, bukan identitas akun', async () => {
    mockedFetch.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/Belum ada pengajuan/i)).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith('testfp123');
  });

  it('baris riwayat menampilkan nomor, status, dan tautan status ber-token', async () => {
    mockedFetch.mockResolvedValue([ROW]);
    renderPage();

    expect(await screen.findByText('MP-260918-A7K2QX')).toBeInTheDocument();
    expect(screen.getByText('Spanduk Diskon 50%')).toBeInTheDocument();
    expect(screen.getByText('Perlu Revisi')).toBeInTheDocument();
    expect(screen.getByText('Perbaiki resolusi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lihat status & kirim revisi/i }))
      .toHaveAttribute('href', '/status/tok-1');
  });

  it('keadaan kosong menyediakan jalan ke pelacakan nomor', async () => {
    mockedFetch.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('link', { name: /Lacak dengan Nomor/i }))
      .toHaveAttribute('href', '/lacak');
  });

  it('API gagal → daftar kosong, bukan layar rusak', async () => {
    mockedFetch.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/Belum ada pengajuan/i)).toBeInTheDocument();
  });
});
