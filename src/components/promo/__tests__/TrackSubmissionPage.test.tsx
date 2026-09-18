/**
 * Test halaman pelacakan nomor pengajuan (/lacak).
 *
 * Kontrak yang dikunci: nomor + token captcha dikirim ke API, hasil tampil,
 * pesan server (format salah / tidak ditemukan / captcha gagal) diteruskan apa
 * adanya, dan tombol Lacak terkunci selama captcha belum selesai.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TrackSubmissionPage from '../TrackSubmissionPage';
import { fetchStatusByNumber } from '../../../utils/promoApi';
import { ApiError } from '../../../lib/rest';
import type { StatusPageData } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchStatusByNumber: vi.fn(),
  };
});

const mockedTrack = vi.mocked(fetchStatusByNumber);

const BASE: StatusPageData = {
  submission: {
    id: 'sub-1', submission_number: 'MP-260918-A7K2QX', media_type_slug: 'spanduk',
    tenant_name: 'Optik Melawai', unit_number: 'L1-05',
    material_title: 'Spanduk Diskon 50%', material_description: 'Diskon akhir tahun.',
    campaign_name: 'Promo Akhir Tahun', material_type: 'Promosi',
    media_target: 'Atrium 1', air_start_date: '2026-10-01', air_end_date: '2026-10-31',
    installation_date: '', notes: '',
    status: 'menunggu_review', review_notes: '', status_changed_at: null,
    created_at: '2026-09-18T01:00:00Z', updated_at: '2026-09-18T01:00:00Z',
    source_type: 'link', file_url: '', file_name: '',
    link_url: 'https://drive.google.com/file/d/xyz/view',
  },
  history: [{
    id: 'h1', submission_id: 'sub-1', from_status: '', to_status: 'menunggu_review',
    comment: 'Pengajuan dikirim tenant', actor_type: 'tenant', actor_name: '',
    actor_id: null, created_at: '2026-09-18T01:00:00Z',
  }],
  files: [],
  installation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Captcha dimatikan bawaan agar test fokus pada alur pelacakan; test khusus
  // gerbang captcha menyalakannya sendiri.
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TrackSubmissionPage />
    </MemoryRouter>,
  );
}

/** Isi nomor lalu tekan Lacak. */
function submitNumber(value: string) {
  fireEvent.change(screen.getByLabelText(/Nomor Pengajuan/i), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /Lacak/i }));
}

describe('TrackSubmissionPage', () => {
  it('nomor valid → detail pengajuan ditampilkan', async () => {
    mockedTrack.mockResolvedValue(BASE);
    renderPage();

    submitNumber('MP-260918-A7K2QX');

    expect(await screen.findByText('Spanduk Diskon 50%')).toBeInTheDocument();
    // Nomor tampil di detail (hint juga memuat contoh nomor, jadi ada >1).
    expect(screen.getAllByText('MP-260918-A7K2QX').length).toBeGreaterThan(1);
    expect(screen.getByText('Riwayat Status')).toBeInTheDocument();
    expect(mockedTrack).toHaveBeenCalledWith('MP-260918-A7K2QX', '');
  });

  it('isian dikonversi ke huruf besar saat mengetik', () => {
    renderPage();
    const input = screen.getByLabelText(/Nomor Pengajuan/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mp-260918-a7k2qx' } });
    expect(input.value).toBe('MP-260918-A7K2QX');
  });

  it('nomor tidak ditemukan → pesan server diteruskan apa adanya', async () => {
    mockedTrack.mockRejectedValue(new ApiError(
      'Pengajuan tidak ditemukan. Periksa kembali nomor atau tautan status Anda.', '404',
    ));
    renderPage();

    submitNumber('MP-260918-ZZZZZZ');

    expect(await screen.findByText(/tidak ditemukan/i)).toBeInTheDocument();
    expect(screen.queryByText('Riwayat Status')).not.toBeInTheDocument();
  });

  it('captcha gagal di server → pesan captcha tampil, bukan pesan generik', async () => {
    mockedTrack.mockRejectedValue(new ApiError(
      'Verifikasi captcha gagal. Muat ulang halaman lalu coba lagi.', '400',
    ));
    renderPage();

    submitNumber('MP-260918-A7K2QX');

    expect(await screen.findByText(/Verifikasi captcha gagal/i)).toBeInTheDocument();
  });

  it('nomor kosong → tidak memanggil API', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Lacak/i }));

    expect(await screen.findByText(/Masukkan nomor pengajuan terlebih dahulu/i)).toBeInTheDocument();
    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it('captcha dikonfigurasi & belum selesai → tombol Lacak terkunci', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    renderPage();

    expect(screen.getByRole('button', { name: /Lacak/i })).toBeDisabled();
    expect(screen.getByText(/Selesaikan verifikasi captcha/i)).toBeInTheDocument();
  });

  it('captcha tidak dikonfigurasi → tanpa widget dan tombol aktif', () => {
    renderPage();

    expect(screen.queryByText(/Selesaikan verifikasi captcha/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lacak/i })).not.toBeDisabled();
  });

  it('setelah pencarian, token captcha dibuang (token sekali pakai)', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const rendered: Array<(token: string) => void> = [];
    window.turnstile = {
      render: vi.fn((_el: HTMLElement, options: Record<string, unknown>) => {
        rendered.push(options.callback as (token: string) => void);
        // Hanya widget pertama yang langsung "selesai"; widget berikutnya
        // menunggu pengguna — meniru token sekali pakai yang sudah terpakai.
        if (rendered.length === 1) rendered[0]!('tok-1');
        return `widget-${rendered.length}`;
      }),
      remove: vi.fn(),
      reset: vi.fn(),
    };
    mockedTrack.mockResolvedValue(BASE);
    renderPage();

    const numberInput = screen.getByLabelText(/Nomor Pengajuan/i);
    await waitFor(() => expect(screen.getByRole('button', { name: /Lacak/i })).not.toBeDisabled());

    fireEvent.change(numberInput, { target: { value: 'MP-260918-A7K2QX' } });
    fireEvent.click(screen.getByRole('button', { name: /Lacak/i }));

    await waitFor(() => expect(mockedTrack).toHaveBeenCalledWith('MP-260918-A7K2QX', 'tok-1'));

    // Token terpakai → widget dipasang ulang dan tombol terkunci sampai token baru.
    await waitFor(() => expect(rendered).toHaveLength(2));
    expect(screen.getByRole('button', { name: /Lacak/i })).toBeDisabled();

    act(() => rendered[1]!('tok-2'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Lacak/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: /Lacak/i }));
    await waitFor(() => expect(mockedTrack).toHaveBeenLastCalledWith('MP-260918-A7K2QX', 'tok-2'));

    delete window.turnstile;
  });
});
