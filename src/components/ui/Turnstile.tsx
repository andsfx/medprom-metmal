/**
 * Widget Cloudflare Turnstile — captcha untuk aksi publik.
 *
 * Turnstile dirender eksplisit lewat API `window.turnstile` supaya token bisa
 * dibaca React (mode implisit hanya menyuntik input tersembunyi ke form).
 *
 * Token Turnstile **sekali pakai** dan kedaluwarsa dalam 5 menit. Karena itu
 * widget menerima `resetKey`: setiap kali nilainya berubah, widget lama dibuang
 * dan widget baru dipasang sehingga token berikutnya segar — tanpa ini
 * pencarian kedua selalu ditolak Siteverify dengan `timeout-or-duplicate`.
 *
 * Sitekey publik dibaca dari `VITE_TURNSTILE_SITE_KEY` (aman di-bundle).
 * Kosong = captcha dimatikan — server juga melewati verifikasi bila
 * `TURNSTILE_SECRET_KEY` kosong, jadi kedua sisi bisa diaktifkan bersamaan.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

let scriptPromise: Promise<void> | null = null;

/** Muat skrip Turnstile sekali; panggilan berikutnya memakai promise yang sama. */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      scriptPromise = null;
      reject(new Error('gagal memuat skrip Turnstile'));
    });
    if (!existing) document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Dipanggil dengan token baru, atau '' saat widget dipasang ulang/kedaluwarsa. */
  onToken: (token: string) => void;
  /** Naikkan untuk memaksa token baru (token lama sudah terpakai/kedaluwarsa). */
  resetKey?: number;
  /** Nama permukaan yang dilindungi; server memverifikasi nilainya. */
  action: string;
}

export default function TurnstileWidget({ onToken, resetKey = 0, action }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  // Sitekey publik; '' = captcha tidak dikonfigurasi (widget tidak dirender).
  const siteKey = String((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '').trim();
  // Callback disimpan di ref supaya efek pemasangan widget tidak ikut berjalan
  // ulang saat induk merender dengan closure baru.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    let widgetId: string | null = null;

    // Token sebelumnya tidak berlaku lagi begitu widget dipasang ulang.
    onTokenRef.current('');
    setReady(false);

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'auto',
          language: 'auto',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => onTokenRef.current(''),
        });
        setReady(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey, action]);

  if (!siteKey) return null;

  if (failed) {
    return (
      <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300" role="alert">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Gagal memuat verifikasi captcha. Periksa koneksi lalu muat ulang halaman.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div ref={containerRef} />
      {/* Placeholder sampai widget Turnstile benar-benar terpasang. */}
      {!ready && (
        <p className="flex items-center gap-1.5 text-xs ui-text-muted" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Memuat verifikasi captcha…
        </p>
      )}
    </div>
  );
}
