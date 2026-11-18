/**
 * Test gate onboarding `/` (MIGRATION.md W1): kunjungan pertama menampilkan
 * onboarding, setelah selesai flag `mmb-onboarded` disimpan dan home =
 * beranda tenant (`BerandaPage`).
 *
 * Gate hidup di `App.tsx` (`HomeGate`), jadi test ini mengemudikan `App`
 * langsung lewat `MemoryRouter` — bukan merender `OnboardingPage` terpisah.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import App from '../../../App';
import { ONBOARDING_KEY } from '../../../constants/onboarding';

// Beranda memanggil API saat mount; dicegah menyentuh jaringan nyata.
vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(async () => []),
    fetchMySubmissions: vi.fn(async () => []),
    fetchHomeSummary: vi.fn(async () => ({ by_status: {}, total: 0, needing_action: null, expiring_soon: [] })),
  };
});

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gate onboarding /', () => {
  it('localStorage kosong → menampilkan onboarding, bukan beranda', async () => {
    renderAt();

    expect(await screen.findByRole('heading', {
      name: 'Pengajuan materi promosi Metropolitan Mall Bekasi',
    })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Selamat datang/i })).not.toBeInTheDocument();
  });

  it('klik "Buka Beranda" → set flag + menampilkan beranda', async () => {
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: /Buka Beranda/i }));

    expect(localStorage.getItem(ONBOARDING_KEY)).toBe('1');
    expect(await screen.findByRole('heading', { name: /Selamat datang/i })).toBeInTheDocument();
  });

  it('flag sudah 1 → langsung beranda, tanpa onboarding', async () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    renderAt();

    expect(await screen.findByRole('heading', { name: /Selamat datang/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', {
      name: 'Pengajuan materi promosi Metropolitan Mall Bekasi',
    })).not.toBeInTheDocument();
  });

  it('localStorage diblokir → fallback ke beranda tanpa crash', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });
    renderAt();

    expect(await screen.findByRole('heading', { name: /Selamat datang/i })).toBeInTheDocument();
  });
});