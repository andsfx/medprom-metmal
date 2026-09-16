import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sheet from './ui/Sheet';

export interface ConfirmOptions {
  /** Judul singkat, mis. "Hapus pengajuan?" */
  title: string;
  /** Deskripsi konsekuensi, mis. "File materi juga akan dihapus dari storage." */
  message: string;
  /** Nama objek yang terdampak (ditampilkan dalam kartu merah). */
  subject?: string;
  /** Label tombol konfirmasi (default "Hapus"). */
  confirmLabel?: string;
  /** Label tombol batal (default "Batal"). */
  cancelLabel?: string;
}

interface Props extends ConfirmOptions {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Dialog konfirmasi generik — pengganti window.confirm().
 * Aksen merah, kartu subjek, tombol Batal/Hapus, state submitting.
 * (Pola schedule-event-v2/src/components/ConfirmDialog.tsx.)
 */
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, subject, confirmLabel = 'Hapus', cancelLabel = 'Batal' }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    if (isOpen) setIsSubmitting(false);
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onClose={onClose} title={title}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
      </div>

      {subject && (
        <p className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200">
          {subject}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="ui-control app-pressable ui-focus-ring min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-semibold text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="app-pressable ui-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Memproses…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function useConfirmDialog() {
  const [state, setState] = useState<{ options: ConfirmOptions | null; resolve: ((v: boolean) => void) | null }>({
    options: null,
    resolve: null,
  });
  const resolveRef = useRef(state.resolve);
  resolveRef.current = state.resolve;

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const handleClose = useCallback(() => {
    resolveRef.current?.(false);
    setState({ options: null, resolve: null });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    setState({ options: null, resolve: null });
  }, []);

  const dialog: ReactNode = (
    <ConfirmDialog
      isOpen={state.options !== null}
      onClose={handleClose}
      onConfirm={handleConfirm}
      {...(state.options ?? { title: '', message: '' })}
    />
  );

  return { confirm, dialog } as const;
}
