import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminLoginPage from '../AdminLoginPage';
import { useAuth } from '../../../hooks/useAuth';
import { DEV_ACCOUNTS, DEV_LOGIN_PASSWORD } from '../../../constants/devCredentials';

vi.mock('../../../hooks/useAuth');

const mockedUseAuth = vi.mocked(useAuth);

/** useAuth tiruan — belum login, tidak sedang memuat. */
function mockAuth() {
  mockedUseAuth.mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: vi.fn().mockResolvedValue({ ok: true }),
    logout: vi.fn(),
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminLoginPage />
    </MemoryRouter>,
  );
}

describe('AdminLoginPage — petunjuk akun demo', () => {
  beforeEach(() => {
    mockAuth();
  });

  it('flag menyala → email tiap akun staf dan password dev terlihat', () => {
    renderPage();

    for (const acc of DEV_ACCOUNTS) {
      expect(screen.getByRole('button', { name: new RegExp(acc.email) })).toBeInTheDocument();
    }
    expect(screen.getByText(DEV_LOGIN_PASSWORD)).toBeInTheDocument();
  });

  it('VITE_PROMO_SHOW_DEV_LOGIN=0 → kredensial tidak dirender sama sekali', () => {
    vi.stubEnv('VITE_PROMO_SHOW_DEV_LOGIN', '0');
    try {
      renderPage();

      expect(screen.queryByText(DEV_LOGIN_PASSWORD)).not.toBeInTheDocument();
      for (const acc of DEV_ACCOUNTS) {
        expect(screen.queryByText(acc.email)).not.toBeInTheDocument();
      }
      // Form login tetap ada — hanya petunjuknya yang disembunyikan.
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});