/**
 * Sheet — bottom sheet di mobile, dialog terpusat di desktop (lihat .app-sheet).
 *
 * Menangani: kunci gulir latar, tutup dengan Escape, tutup dengan klik scrim,
 * jebakan fokus (Tab melingkar), dan pemulihan fokus ke pemicu saat ditutup.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Slot aksi lengket di dasar sheet. */
  footer?: ReactNode;
}

export default function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Fokus awal ke panel agar pembaca layar mengumumkan judul sheet.
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="app-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="app-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="app-sheet-grip" aria-hidden="true" />

        <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-color)] px-4 py-3 dark:border-slate-700">
          <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="app-pressable ui-focus-ring -mr-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-[var(--surface-hover)] dark:text-slate-400"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <div className="border-t border-[var(--rule-color)] px-4 py-3 dark:border-slate-700">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
