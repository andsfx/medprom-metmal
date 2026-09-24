/**
 * Halaman login staf - pola AdminLoginPage app lama
 * (email+password, show/hide password, error state, redirect /admin).
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, Lock, LogIn, Megaphone } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { DEV_ACCOUNTS, DEV_LOGIN_PASSWORD, isDevLoginHintEnabled } from '../../constants/devCredentials';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login, user, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sudah login → langsung dashboard.
  if (!isLoading && user) {
    navigate('/admin', { replace: true });
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    const result = await login(email.trim(), pw);
    if (result.ok) {
      navigate('/admin', { replace: true });
      return;
    }
    setError(result.error || 'Login gagal');
    setLoading(false);
  }

  return (
    <div className="app-shell">
      <main className="app-canvas">
        <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] bg-brand-primary-600">
            <Megaphone className="h-6 w-6 text-white" aria-hidden="true" />
          </span>
          <h1 className="ui-title-screen mt-3 text-slate-900 dark:text-white">Login</h1>
          <p className="mt-1 text-xs ui-text-muted">Media Promosi Metropolitan Mall Bekasi</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="ui-admin-card p-6"
          noValidate
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="nama@metmal.co.id"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="ui-control w-full rounded-md px-3 py-2.5 pr-12 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="app-pressable ui-focus-ring absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {showPw ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300" role="alert">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {loading ? 'Memeriksa…' : 'Login'}
          </button>
        </form>

        {/* Petunjuk kredensial tahap pengembangan - matikan dengan
            VITE_PROMO_SHOW_DEV_LOGIN='0' sebelum dipakai publik. */}
        {isDevLoginHintEnabled() && (
          <div className="ui-admin-card mt-4 border border-amber-300/70 p-4 dark:border-amber-600/40">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Akun demo (tahap pengembangan)
            </p>
            <p className="mt-1 text-xs ui-text-muted">
              Klik salah satu akun untuk mengisi form. Password semua akun:{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                {DEV_LOGIN_PASSWORD}
              </code>
            </p>
            <ul className="mt-3 space-y-1.5">
              {DEV_ACCOUNTS.map((acc) => (
                <li key={acc.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPw(DEV_LOGIN_PASSWORD);
                      setError('');
                    }}
                    className="ui-control app-pressable ui-focus-ring w-full rounded-md px-2.5 py-2 text-left transition hover:border-brand-primary-400"
                  >
                    <span className="block font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
                      {acc.email}
                    </span>
                    <span className="mt-0.5 block text-xs ui-text-muted">
                      {acc.roleLabel}: {acc.note}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          <Link
            to="/"
            className="ui-focus-ring inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-3 font-medium text-brand-primary-700 hover:text-brand-primary-800 dark:text-brand-primary-300"
          >
            ← Kembali ke halaman publik
          </Link>
        </p>
        </div>
      </main>
    </div>
  );
}
