/**
 * Test sisa hari periode pada halaman status tenant (#8).
 *
 * Kontrak rapuh yang dikunci: tenant dapat melihat sendiri berapa hari lagi
 * periodenya berakhir, dihitung dari `air_end_date` dan tanggal perangkat.
 * Sebelumnya halaman status hanya menampilkan rentang tanggal statis.
 *
 * Dirender lewat halaman status supaya jalur nyata (token -> API -> detail)
 * yang diuji, bukan komponennya secara terpisah.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionStatusPage from '../SubmissionStatusPage';
import { fetchStatusByToken } from '../../../utils/promoApi';
import type { StatusPageData } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchStatusByToken: vi.fn(),
    submitRevision: vi.fn(),
    uploadFile: vi.fn(),
  };
});

const mockedFetchStatus = vi.mocked(fetchStatusByToken);

/** Tanggal lokal `YYYY-MM-DD` relatif hari ini (untuk mengunci sisa hari). */
function isoRelatif(hari: number): string {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function base(endIso: string): StatusPageData {
  return {
    submission: {
      id: 'sub-1', submission_number: 'MP-260916-ABC234', media_type_slug: 'spanduk',
      tenant_name: 'Optik Melawai', unit_number: 'L1-05',
      material_title: 'Spanduk Diskon 50%', material_description: '', campaign_name: '',
      material_type: 'Promosi', media_target: 'Atrium 1',
      air_start_date: isoRelatif(-3), air_end_date: endIso, installation_date: '',
      notes: '', status: 'sudah_dipasang', review_notes: '', status_changed_at: null,
      created_at: '2026-09-16T01:00:00Z', updated_at: '2026-09-16T01:00:00Z',
      source_type: 'none', file_url: '', file_name: '', link_url: '',
    },
    history: [], files: [], installation: null,
  };
}

function renderPage(data: StatusPageData) {
  mockedFetchStatus.mockResolvedValue(data);
  return render(
    <MemoryRouter initialEntries={['/status/tok-1']}>
      <Routes>
        <Route path="/status/:token" element={<SubmissionStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

describe('SubmissionDetail - sisa hari periode', () => {
  it('periode masih berjalan -> menampilkan "N hari lagi"', async () => {
    renderPage(base(isoRelatif(5)));
    expect(await screen.findByText(/5 hari lagi/i)).toBeInTheDocument();
  });

  it('periode berakhir hari ini -> "berakhir hari ini"', async () => {
    renderPage(base(isoRelatif(0)));
    expect(await screen.findByText(/berakhir hari ini/i)).toBeInTheDocument();
  });

  it('periode sudah lewat -> "lewat N hari"', async () => {
    renderPage(base(isoRelatif(-2)));
    expect(await screen.findByText(/lewat 2 hari/i)).toBeInTheDocument();
  });

  it('tanpa tanggal berakhir -> tidak ada penanda sisa hari', async () => {
    renderPage(base(''));
    expect(await screen.findByText(/Periode/)).toBeInTheDocument();
    expect(screen.queryByText(/hari lagi|berakhir hari ini|lewat \d+ hari/i)).not.toBeInTheDocument();
  });
});
