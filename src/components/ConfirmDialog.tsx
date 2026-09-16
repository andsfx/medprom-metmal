import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div className="ui-card w-full max-w-md p-6">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-70 dark:hover:bg-slate-700"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>

        {subject && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200">
            {subject}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
