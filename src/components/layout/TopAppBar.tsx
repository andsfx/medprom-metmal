/**
 * Top app bar - judul kontekstual + aksi balik.
 *
 * Terangkat (`data-elevated`) begitu konten menggulir di belakangnya; ini
 * penanda kedalaman yang dipakai aplikasi asli, menggantikan garis statis.
 *
 * Elevasi digerakkan IntersectionObserver atas sentinel setinggi 0 di titik
 * awal area gulir - bukan listener `scroll`/`scrollTop` (aturan performa
 * motion: jangan menggerakkan animasi dari peristiwa gulir atau posisi gulir).
 */
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** Ambang elevasi dalam piksel; sama dengan perilaku lama (`scrollTop > 4`). */
const ELEVATION_THRESHOLD = 4;

interface TopAppBarProps {
  /** Judul layar; kosongkan untuk memakai wordmark. */
  title?: string;
  /** Tampilkan tombol kembali. */
  back?: boolean;
  /** Tujuan tombol kembali; bawaan: satu langkah mundur di riwayat. */
  backTo?: string;
  /** Handler kembali kustom. Dipakai alur berlangkah agar mundur ke langkah
   * sebelumnya, bukan keluar dari alur lewat riwayat peramban. */
  onBack?: () => void;
  /** Slot aksi di kanan bar. */
  actions?: ReactNode;
  /** Slot navigasi utama (desktop). Dirender di antara judul dan aksi. */
  nav?: ReactNode;
  /** Elemen yang digulir untuk memicu elevasi; bawaan window. */
  scrollTargetId?: string;
}

export default function TopAppBar({ title, back, backTo, onBack, actions, nav, scrollTargetId }: TopAppBarProps) {
  const navigate = useNavigate();
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    // Lingkungan tanpa IntersectionObserver (jsdom di test) tidak melempar:
    // elevasi cukup dibiarkan `false`. Sengaja TIDAK kembali ke listener
    // `scroll` - aturan performa motion melarang menggerakkan animasi dari
    // peristiwa gulir, dan di test tidak ada gulir nyata yang perlu dilacak.
    // Peramban yang didukung aplikasi ini semuanya punya API tersebut.
    if (typeof IntersectionObserver === 'undefined') return;

    const target = scrollTargetId ? document.getElementById(scrollTargetId) : null;

    // Sentinel setinggi 0 di titik awal area gulir. `display: flow-root`
    // mencegah margin anak berikutnya menembus (margin collapse) dan
    // menggeser ambang; `height: 0` memastikan tidak menambah tinggi gulir.
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'height:0;margin:0;display:flow-root';

    // Area gulir (`<main id="app-scroll">`) adalah SAUDARA app bar, bukan
    // leluhurnya - karena itu sentinel disisipkan ke dalam elemen target,
    // bukan dirender sebagai keturunan bar.
    const container: HTMLElement = target ?? document.body;
    container.prepend(sentinel);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setElevated(!entry.isIntersecting);
      },
      {
        // `root` = area gulir itu sendiri. Dokumen tidak menggulir (`.app-shell`
        // mengunci tinggi viewport), jadi mengamati viewport akan selalu salah.
        root: target,
        threshold: 0,
        // Ambang 4px dipindahkan ke margin root, bukan dibaca dari `scrollTop`:
        // sentinel keluar dari area gulir begitu posisi gulir melewatinya.
        rootMargin: `${ELEVATION_THRESHOLD}px 0px 0px 0px`,
      },
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, [scrollTargetId]);

  return (
    <header className="app-bar" data-elevated={elevated}>
      {back && (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : backTo ? navigate(backTo) : navigate(-1))}
          className="app-pressable ui-focus-ring -ml-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-[var(--surface-hover)] dark:text-slate-200"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {title ? (
          <h1 className="ui-title-screen truncate text-slate-900 dark:text-white">{title}</h1>
        ) : (
          <span className="font-display text-base font-bold text-slate-900 dark:text-white">
            Media Promosi
          </span>
        )}
      </div>

      {nav}

      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}
