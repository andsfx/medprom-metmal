/**
 * Test registrasi rute aplikasi.
 *
 * Kontrak rapuh yang dikunci: `/lacak` benar-benar terdaftar di `App` (bukan
 * hanya komponennya ada) dan tab bar sisi tenant memuat keempat tujuan utama.
 * Kalau rutenya lupa didaftarkan, halaman pelacakan jatuh ke redirect `*`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// Halaman status memanggil API saat mount — tidak diuji di sini, cukup dicegah
// agar tidak menyentuh jaringan nyata.
vi.mock('../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/promoApi')>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(async () => []),
    fetchMySubmissions: vi.fn(async () => []),
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
  it('/lacak → halaman pelacakan nomor, bukan redirect ke beranda', () => {
    renderAt('/lacak');

    expect(screen.getByRole('heading', { name: 'Lacak Pengajuan' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nomor Pengajuan/i)).toBeInTheDocument();
  });

  it('/riwayat → halaman riwayat perangkat', () => {
    renderAt('/riwayat');

    expect(screen.getByRole('heading', { name: 'Riwayat Pengajuan' })).toBeInTheDocument();
  });

  it('tab bar memuat Lacak menuju /lacak', () => {
    renderAt('/lacak');

    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(within(nav).getByRole('link', { name: 'Lacak' })).toHaveAttribute('href', '/lacak');
    // Tiga tujuan lain tetap ada — jangan sampai tab ke-4 menggusur yang lama.
    for (const label of ['Katalog', 'Ajukan', 'Riwayat']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});
