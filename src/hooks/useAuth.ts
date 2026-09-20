/**
 * useAuth - REST + cookie HttpOnly (pola schedule-event-v2/src/hooks/useAuth.ts).
 * Session check via GET /auth/me saat mount; login email+password; logout.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGetRaw, apiPost } from '../lib/rest';
import type { AuthUser } from '../types/promo';

interface AuthMeResponse {
  success: boolean;
  user: AuthUser | null;
}

interface AuthLoginResponse {
  success: boolean;
  user?: AuthUser | null;
  error?: string;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Session check on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const data = await apiGetRaw<AuthMeResponse>('/auth/me');
        if (cancelled) return;
        setUser(data.user || null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Login with email + password ────────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const data = await apiPost<AuthLoginResponse>('/auth/login', { email, password });

      if (data.success && data.user) {
        setUser(data.user);
        return { ok: true };
      }

      return { ok: false, error: data.error || 'Login gagal' };
    } catch (err) {
      // ApiError membawa pesan server (mis. "Email atau password salah")
      // atau fallback koneksi.
      return { ok: false, error: err instanceof Error ? err.message : 'Tidak dapat terhubung ke server' };
    }
  }, []);

  // ─── Logout ─────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } catch {
      // ignore - state di-reset apa adanya.
    } finally {
      setUser(null);
    }
  }, []);

  const isAuthenticated = useMemo(() => !!user, [user]);

  return { user, isLoading, isAuthenticated, login, logout } as const;
}
