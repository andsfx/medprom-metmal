/**
 * Mount test Beranda tenant (prototype `beranda.html`).
 *
 * Kontrak rapuh yang dikunci:
 *  - ringkasan status merender EMPAT sel (Menunggu Review, Perlu Revisi,
 *    Siap Dipasang, Selesai) dengan angka dari `by_status` server;
 *  - blok "Perlu tindakan kamu" hanya muncul saat server mengirim
 *    `needing_action` berstatus menunggu review / perlu revisi;
 *  - blok "Periode hampir berakhir" menampilkan sisa hari dari
 *    `air_end_date` dan hanya untuk status aktif (disetujui/siap/terpasang);
 *  - perangkat tanpa pengajuan melihat ajakan mengajukan (bukan nol);
 *  - gagal memuat = panel galat, bukan angka nol yang menyesatkan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import BerandaPage from '../BerandaPage';
import { fetchHomeSummary, fetchMySubmissions } from '../../../utils/promoApi';
import type { HomeSummary } from '../../../utils/promoApi';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchHomeSummary: vi.fn(),
    fetchMySubmissions: vi.fn(async () => []),
  };
});

const mockedSummary = vi.mocked(fetchHomeSummary);

function isoHariIniPlus(hari: number): string {
  return new Date(Date.now() + hari * 86_400_000).toISOString().slice(0, 10);
}

const DASAR: HomeSummary = {
  by_status: { menunggu_review: 2, perlu_revisi: 1, siap_dipasang: 1, selesai: 12 },
  total: 16,
  needing_action: null,
  expiring_soon: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <BerandaPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('metmal_device_fp', 'testfp123');
});

describe('BerandaPage', () => {
  it('ringkasan status merender 4 sel dengan angka server', async () => {
    mockedSummary.mockResolvedValue(DASAR);
    renderPage();

    expect(await screen.findByRole('region', { name: 'Ringkasan status pengajuan' })).toBeInTheDocument();
    // Angka sel "Menunggu Review" = 2 dari by_status (bukan nol karangan).
    const sel = screen.getByRole('region', { name: 'Ringkasan status pengajuan' });
    expect(sel).toHaveTextContent('Menunggu Review');
    expect(sel).toHaveTextContent('2');
    expect(sel).toHaveTextContent('Selesai');
    expect(sel).toHaveTextContent('12');
  });

  it('perlu tindakan muncul hanya saat status menunggu review / perlu revisi', async () => {
    mockedSummary.mockResolvedValue({
      ...DASAR,
      needing_action: {
        submission_number: 'MP-261116-ABC234',
        status_token: 'tok-1',
        status: 'perlu_revisi',
        media_type_slug: 'sticker-eskalator',
        material_title: 'Sticker Eskalator — Promo Kopi Susu Senja',
        review_notes: 'Materi belum memakai ukuran cetak 65 × 800 cm.',
        created_at: '2026-11-15T09:00:00Z',
        reviewed_at: '2026-11-16T14:32:00Z',
        reviewed_by_name: 'Marcom',
      },
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Perlu tindakan kamu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kirim Revisi/i })).toHaveAttribute('href', '/status/tok-1');
    // "Perlu Revisi" muncul dua kali (sel ringkasan + stempel kartu tindakan):
    // cakup ke kartu tindakan saja supaya assertion tidak ambigu.
    const section = screen.getByRole('heading', { name: 'Perlu tindakan kamu' }).closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText('Perlu Revisi')).toBeInTheDocument();
  });

  it('perlu tindakan berstatus disetujui → blok tidak dirender', async () => {
    mockedSummary.mockResolvedValue({
      ...DASAR,
      needing_action: {
        submission_number: 'MP-261116-ABC234',
        status_token: 'tok-1',
        status: 'disetujui',
        media_type_slug: 'spanduk',
        material_title: 'Spanduk',
        review_notes: '',
        created_at: '2026-11-16T08:00:00Z',
        reviewed_at: null,
        reviewed_by_name: '',
      },
    });
    renderPage();

    expect(await screen.findByRole('region', { name: 'Ringkasan status pengajuan' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Perlu tindakan kamu' })).not.toBeInTheDocument();
  });

  it('perlu revisi menampilkan aktor + waktu, bukan nomor pengajuan', async () => {
    mockedSummary.mockResolvedValue({
      ...DASAR,
      needing_action: {
        submission_number: 'MP-261116-ABC234',
        status_token: 'tok-1',
        status: 'perlu_revisi',
        media_type_slug: 'sticker-eskalator',
        material_title: 'Sticker Eskalator — Promo Kopi Susu Senja',
        review_notes: 'Materi belum memakai ukuran cetak 65 × 800 cm.',
        created_at: '2026-11-15T09:00:00Z',
        reviewed_at: '2026-11-16T14:32:00Z',
        reviewed_by_name: 'Marcom',
      },
    });
    renderPage();

    const section = (await screen.findByRole('heading', { name: 'Perlu tindakan kamu' })).closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/Diminta Marcom ·/)).toBeInTheDocument();
    expect(within(section as HTMLElement).queryByText('MP-261116-ABC234')).not.toBeInTheDocument();
  });

  it('menunggu review menampilkan "Dikirim" dengan waktu kirim', async () => {
    mockedSummary.mockResolvedValue({
      ...DASAR,
      needing_action: {
        submission_number: 'MP-261116-ABC234',
        status_token: 'tok-1',
        status: 'menunggu_review',
        media_type_slug: 'spanduk',
        material_title: 'Spanduk — Ramadan Ekstra',
        review_notes: '',
        created_at: '2026-11-16T08:00:00Z',
        reviewed_at: null,
        reviewed_by_name: '',
      },
    });
    renderPage();

    const section = (await screen.findByRole('heading', { name: 'Perlu tindakan kamu' })).closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/^Dikirim ·/)).toBeInTheDocument();
  });

  it('periode hampir berakhir menampilkan sisa hari dari air_end_date', async () => {
    mockedSummary.mockResolvedValue({
      ...DASAR,
      expiring_soon: [{
        submission_number: 'MP-261101-ABC234',
        status_token: 'tok-2',
        status: 'disetujui',
        media_type_slug: 'spanduk',
        material_title: 'Spanduk — Ramadan Ekstra',
        air_end_date: isoHariIniPlus(3),
      }],
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Periode hampir berakhir' })).toBeInTheDocument();
    expect(screen.getByText('Spanduk — Ramadan Ekstra')).toBeInTheDocument();
    expect(screen.getByText('3 hari')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Spanduk — Ramadan Ekstra/i })).toHaveAttribute('href', '/status/tok-2');
  });

  it('label sel Selesai memuat tahun berjalan', async () => {
    mockedSummary.mockResolvedValue(DASAR);
    renderPage();

    const region = await screen.findByRole('region', { name: 'Ringkasan status pengajuan' });
    expect(region).toHaveTextContent(`Selesai ${new Date().getFullYear()}`);
  });

  it('blok periode hampir berakhir menampilkan hint perpanjangan 7 hari', async () => {
    mockedSummary.mockResolvedValue({
      ...DASAR,
      expiring_soon: [{
        submission_number: 'MP-261101-ABC234',
        status_token: 'tok-2',
        status: 'disetujui',
        media_type_slug: 'spanduk',
        material_title: 'Spanduk — Ramadan Ekstra',
        air_end_date: isoHariIniPlus(3),
      }],
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Periode hampir berakhir' })).toBeInTheDocument();
    expect(screen.getByText(/Perpanjangan diajukan paling lambat 7 hari sebelum berakhir/)).toBeInTheDocument();
  });

  it('pengajuan terbaru merender baris dari riwayat perangkat', async () => {
    mockedSummary.mockResolvedValue(DASAR);
    vi.mocked(fetchMySubmissions).mockResolvedValue({
      rows: [
        { id: 'a1', submission_number: 'MP-261115-AAA234', status_token: 't1', media_type_slug: 'videotron', tenant_name: '', unit_number: '', material_title: 'Videotron — Big Sale 12.12', material_description: '', campaign_name: '', material_type: '', media_target: '', air_start_date: '', air_end_date: '', installation_date: '', notes: '', status: 'menunggu_review', review_notes: '', status_changed_at: null, created_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T00:00:00Z', source_type: 'none', file_url: '', file_name: '', link_url: '' },
        { id: 'a2', submission_number: 'MP-261110-BBB234', status_token: 't2', media_type_slug: 'sosmed-feed', tenant_name: '', unit_number: '', material_title: 'Feed Instagram — Hari Guru', material_description: '', campaign_name: '', material_type: '', media_target: '', air_start_date: '', air_end_date: '', installation_date: '', notes: '', status: 'disetujui', review_notes: '', status_changed_at: null, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z', source_type: 'none', file_url: '', file_name: '', link_url: '' },
      ],
      total: 2,
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Pengajuan terbaru' })).toBeInTheDocument();
    expect(screen.getByText('Videotron — Big Sale 12.12')).toBeInTheDocument();
    expect(screen.getByText('Feed Instagram — Hari Guru')).toBeInTheDocument();
  });

  it('pengajuan terbaru menampilkan foto media dan harga', async () => {
    mockedSummary.mockResolvedValue(DASAR);
    vi.mocked(fetchMySubmissions).mockResolvedValue({
      rows: [
        { id: 'a1', submission_number: 'MP-261115-AAA234', status_token: 't1', media_type_slug: 'videotron', image_path: '/media/videotron.webp', tenant_name: '', unit_number: '', material_title: 'Videotron — Big Sale 12.12', material_description: '', campaign_name: '', material_type: '', media_target: '', air_start_date: '', air_end_date: '', installation_date: '', notes: '', status: 'menunggu_review', review_notes: '', status_changed_at: null, created_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T00:00:00Z', source_type: 'none', file_url: '', file_name: '', link_url: '', total_amount: 4200000 },
        { id: 'a2', submission_number: 'MP-261110-BBB234', status_token: 't2', media_type_slug: 'sosmed-feed', tenant_name: '', unit_number: '', material_title: 'Feed Instagram — Hari Guru', material_description: '', campaign_name: '', material_type: '', media_target: '', air_start_date: '', air_end_date: '', installation_date: '', notes: '', status: 'disetujui', review_notes: '', status_changed_at: null, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z', source_type: 'none', file_url: '', file_name: '', link_url: '', total_amount: 0 },
      ],
      total: 2,
    });
    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Pengajuan terbaru' })).toBeInTheDocument();
    expect(container.querySelector('img[src="/media/videotron.webp"]')).not.toBeNull();
    expect(screen.getByText('Rp 4.200.000')).toBeInTheDocument();
    expect(screen.getByText('Gratis')).toBeInTheDocument();
  });

  it('perangkat tanpa pengajuan → ajakan mengajukan, bukan angka nol', async () => {
    mockedSummary.mockResolvedValue({ by_status: {}, total: 0, needing_action: null, expiring_soon: [] });
    renderPage();

    expect(await screen.findByText(/Belum ada pengajuan dari perangkat ini/i)).toBeInTheDocument();
    // Dua tautan berlabel "Ajukan Materi": tombol ajakan + FAB tab bar.
    const emptyCard = screen.getByText(/Belum ada pengajuan dari perangkat ini/i).closest('div');
    expect(emptyCard).not.toBeNull();
    expect(within(emptyCard as HTMLElement).getByRole('link', { name: /Ajukan Materi/i })).toHaveAttribute('href', '/ajukan');
    expect(screen.queryByRole('region', { name: 'Ringkasan status pengajuan' })).not.toBeInTheDocument();
  });

  it('gagal memuat → panel galat, bukan ringkasan nol', async () => {
    mockedSummary.mockRejectedValue(new Error('jaringan'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Gagal memuat ringkasan pengajuan/i);
    expect(screen.queryByRole('region', { name: 'Ringkasan status pengajuan' })).not.toBeInTheDocument();
  });
});