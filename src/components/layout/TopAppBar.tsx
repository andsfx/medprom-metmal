/**
 * Top app bar — judul kontekstual + aksi balik.
 *
 * Terangkat (`data-elevated`) begitu konten menggulir di belakangnya; ini
 * penanda kedalaman yang dipakai aplikasi asli, menggantikan garis statis.
 */
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

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
    const target = scrollTargetId ? document.getElementById(scrollTargetId) : null;
    const read = () => (target ? target.scrollTop : window.scrollY);
    const onScroll = () => setElevated(read() > 4);
    onScroll();
    const node: HTMLElement | Window = target ?? window;
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
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
