/**
 * Test registrasi rute aplikasi.
 *
 * Kontrak rapuh yang dikunci: `/lacak` benar-benar terdaftar di `App` (bukan
 * hanya komponennya ada), beranda + katalog punya rutenya sendiri, dan tab
 * bar sisi tenant memuat empat tujuan + FAB ajukan. Kalau rutenya lupa
 * didaftarkan, halaman jatuh ke redirect `*`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { ONBOARDING_KEY } from '../constants/onboarding';

// Halaman status/beranda memanggil API saat mount — tidak diuji di sini, cukup
// dicegah agar tidak menyentuh jaringan nyata.
vi.mock('../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/promoApi')>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(async () => []),
    fetchMySubmissions: vi.fn(async () => []),
    fetchHomeSummary: vi.fn(async () => ({ by_status: {}, total: 0, needing_action: null, expiring_soon: [] })),
    fetchStatusByToken: vi.fn(async () => { throw new Error('tidak dipakai'); }),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App — registrasi rute', () => {
  it('/ → beranda tenant, bukan onboarding (sudah pernah dikunjungi)', async () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    renderAt('/');

    expect(await screen.findByRole('heading', { name: /Selamat datang/i })).toBeInTheDocument();
  });

  it('/katalog → halaman katalog media (bukan beranda)', async () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    renderAt('/katalog');

    expect(await screen.findByRole('heading', { name: 'Ajukan Materi Promosi Tenant Anda' })).toBeInTheDocument();
  });

  it('/lacak → halaman pelacakan nomor, bukan redirect ke beranda', async () => {
    renderAt('/lacak');

    expect(await screen.findByRole('heading', { name: 'Lacak Pengajuan' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nomor Pengajuan/i)).toBeInTheDocument();
  });

  it('/riwayat → halaman riwayat perangkat', async () => {
    renderAt('/riwayat');

    expect(await screen.findByRole('heading', { name: 'Riwayat Pengajuan' })).toBeInTheDocument();
  });

  it('/ajukan-cetak → form media promosi cetak (bukan redirect)', async () => {
    renderAt('/ajukan-cetak');

    // Judul langkah 1 form cetak; bila rutenya lupa didaftarkan, halaman jatuh
    // ke redirect `*` dan heading ini tidak akan pernah muncul.
    expect(await screen.findByRole('heading', { name: 'Data Pemohon' })).toBeInTheDocument();
  });

  it('/batch/:token → halaman status batch terdaftar', async () => {
    renderAt('/batch/abc');

    expect(await screen.findByRole('heading', { name: /Status Pengajuan Cetak/i })).toBeInTheDocument();
  });

  it('tab bar memuat Beranda, Katalog, Riwayat, Lacak + FAB ajukan', async () => {
    renderAt('/lacak');

    // Tab bar berada di dalam halaman rute, yang kini dimuat malas.
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    for (const label of ['Beranda', 'Katalog', 'Riwayat']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Lacak' })).toHaveAttribute('href', '/lacak');
    expect(within(nav).getByRole('link', { name: /ajukan materi baru/i })).toHaveAttribute('href', '/ajukan');
  });
});