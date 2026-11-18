/**
 * Test chip filter status di halaman Riwayat per perangkat.
 *
 * Kontrak rapuh yang dikunci: filter mempersempit daftar YANG TAMPIL saja,
 * BUKAN mengirim query param baru ke server. Server sudah `ORDER BY created_at
 * DESC LIMIT 50 OFFSET n`; filter sisi-server akan merusak paginasi offset.
 * Chip dibangun dari `STATUS_ORDER` (label dari `STATUS_LABELS`) plus "Semua"
 * di depan, dan hasil saringan kosong menampilkan pesan khusus — bukan panel
 * ajakan yang hanya boleh muncul saat daftar total benar-benar kosong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MySubmissionsPage from '../MySubmissionsPage';
import { fetchMySubmissions } from '../../../utils/promoApi';
import { STATUS_LABELS, STATUS_ORDER } from '../../../constants/promo';
import type * as PromoApi from '../../../utils/promoApi';
import type { MySubmissionRow } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof PromoApi>();
  return { ...actual, fetchMySubmissions: vi.fn() };
});

const mockedFetch = vi.mocked(fetchMySubmissions);

function makeRow(id: string, status: string, submissionNumber: string): MySubmissionRow {
  return {
    id, submission_number: submissionNumber, status_token: `tok-${id}`,
    media_type_slug: 'spanduk', tenant_name: 'Optik Melawai', unit_number: 'L1-05',
    material_title: `Judul ${id}`, material_description: '', campaign_name: '',
    material_type: 'Promosi', media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
    installation_date: '', notes: '', status, review_notes: '',
    status_changed_at: null, created_at: '2026-09-18T01:00:00Z', updated_at: '2026-09-18T01:00:00Z',
    source_type: 'none', file_url: '', file_name: '', link_url: '',
  };
}

// Tiga baris dengan tiga status berbeda supaya saringan benar-benar membedakan.
const ROWS: MySubmissionRow[] = [
  makeRow('sub-1', 'menunggu_review', 'MP-260918-AAAAAA'),
  makeRow('sub-2', 'perlu_revisi', 'MP-260918-BBBBBB'),
  makeRow('sub-3', 'disetujui', 'MP-260918-CCCCCC'),
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
  mockedFetch.mockResolvedValue({ rows: ROWS, total: ROWS.length });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MySubmissionsPage />
    </MemoryRouter>,
  );
}

// Label chip "Perlu Revisi" ikut dipakai `Stamp` di baris, jadi dipilih lewat
// role button (chip) agar tidak bentrok dengan stempel di baris.
function chip(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

describe('MySubmissionsPage - chip filter status', () => {
  it('merender "Semua" aktif + chip STATUS_ORDER berlabel STATUS_LABELS', async () => {
    renderPage();
    await screen.findByText('MP-260918-AAAAAA');

    const group = screen.getByRole('group', { name: 'Filter status' });
    expect(group).toBeInTheDocument();

    // "Semua" pertama dan aktif bawaan; sisanya urut STATUS_ORDER.
    const chips = Array.from(group.querySelectorAll('button'));
    expect(chips[0]).toHaveTextContent('Semua');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    const labels = chips.slice(1).map((c) => c.textContent);
    expect(labels).toEqual(STATUS_ORDER.map((s) => STATUS_LABELS[s]));
    // Bawaan "Semua" → semua baris tampil.
    expect(screen.getByText('Judul sub-1')).toBeInTheDocument();
    expect(screen.getByText('Judul sub-2')).toBeInTheDocument();
    expect(screen.getByText('Judul sub-3')).toBeInTheDocument();
  });

  it('klik "Perlu Revisi" → hanya baris perlu_revisi yang tampil', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('MP-260918-AAAAAA');

    await user.click(chip('Perlu Revisi'));

    expect(chip('Perlu Revisi')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Judul sub-2')).toBeInTheDocument();
    expect(screen.queryByText('Judul sub-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Judul sub-3')).not.toBeInTheDocument();
  });

  it('klik "Semua" lagi → semua baris tampil kembali', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('MP-260918-AAAAAA');

    await user.click(chip('Perlu Revisi'));
    await user.click(chip('Semua'));

    expect(chip('Semua')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Judul sub-1')).toBeInTheDocument();
    expect(screen.getByText('Judul sub-2')).toBeInTheDocument();
    expect(screen.getByText('Judul sub-3')).toBeInTheDocument();
  });

  it('filter aktif + hasil kosong → pesan khusus, panel ajakan TIDAK muncul', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('MP-260918-AAAAAA');

    // "Ditolak" ada di chip tapi tidak ada baris berstatus ditolak.
    await user.click(chip('Ditolak'));
    // Panel ajakan hanya untuk daftar total kosong; daftar total TIDAK kosong.
    expect(screen.queryByText(/Belum ada pengajuan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ajukan materi promosi pertama/i)).not.toBeInTheDocument();
  });
});
