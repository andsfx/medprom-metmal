/**
 * Combobox pencarian tenant MID — pola TenantSearchSelect
 * (schedule-event-v2/src/components/survey/TenantSurveyShared.tsx):
 * debounce 250ms, q>=2, aria combobox/listbox, keyboard nav, clear.
 *
 * Fallback: bila MID_API_KEY server belum dikonfigurasi/tidak terjangkau,
 * komponen beralih ke mode isian manual (nama tenant diketik) supaya pengajuan
 * tenant tetap bisa masuk — TR melihat nama tenant apa adanya.
 */
import { useEffect, useRef, useState } from 'react';
import { Info, Loader2, Store, X } from 'lucide-react';
import { searchTenants } from '../../utils/promoApi';
import type { TenantOption } from '../../types/promo';

interface Props {
  id: string;
  value: string;
  onTenantSelect: (tenant: TenantOption | null) => void;
  /** Dipanggil saat mode manual (MID tidak tersedia) berubah. */
  onManualModeChange?: (manual: boolean) => void;
  disabled?: boolean;
  error?: string;
}

export function TenantSearchSelect({ id, value, onTenantSelect, onManualModeChange, disabled, error }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [manualMode, setManualMode] = useState(false);
  const listboxId = `${id}-listbox`;

  // Sync display saat parent commit selection / reset form.
  useEffect(() => {
    if (value && value !== query) {
      setQuery(value);
      return;
    }
    if (!value && !open) setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  useEffect(() => { setHighlighted(-1); }, [tenants]);

  // Debounced search MID → beralih ke mode manual bila daftar tak tersedia.
  useEffect(() => {
    if (disabled) return;
    const q = query.trim();
    if (q.length < 2) {
      setTenants([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const result = await searchTenants(q);
      if (cancelled) return;
      setTenants(result.tenants);
      setLoading(false);
      if (!result.available) {
        setManualMode(true);
        setOpen(false);
        onManualModeChange?.(true);
        // Teks yang sudah diketik sebelum mode manual aktif tetap dipakai.
        const typed = q;
        if (typed) {
          selectedIdRef.current = null;
          onTenantSelect({ id: '', name: typed, floor: '', lot: '', category: '' });
        }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, disabled, onManualModeChange]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function clearSelection() {
    selectedIdRef.current = null;
    setQuery('');
    setTenants([]);
    setOpen(false);
    onTenantSelect(null);
  }

  function commitTenant(tenant: TenantOption) {
    selectedIdRef.current = tenant.id;
    setQuery(tenant.name);
    setOpen(false);
    onTenantSelect(tenant);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (manualMode) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter') && tenants.length > 0) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, tenants.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = highlighted >= 0 && highlighted < tenants.length ? tenants[highlighted] : tenants[0];
      if (t) commitTenant(t);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div ref={containerRef}>
      {manualMode && (
        <p className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" role="status">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Daftar tenant sedang tidak dapat dimuat — ketik nama tenant Anda secara manual (sesuai papan nama).
        </p>
      )}
      <div className="relative">
        <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role={manualMode ? undefined : 'combobox'}
          aria-expanded={manualMode ? undefined : open}
          aria-controls={manualMode ? undefined : listboxId}
          aria-autocomplete={manualMode ? undefined : 'list'}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          value={query}
          autoComplete="off"
          placeholder={manualMode ? 'Nama tenant Anda' : 'Ketik nama tenant min. 2 huruf, pilih dari daftar'}
          className={`ui-control w-full rounded-md py-2.5 pl-9 ${selectedIdRef.current || query ? 'pr-9' : 'pr-3'} text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : ''}`}
          onChange={(e) => {
            const next = e.target.value;
            if (manualMode) {
              setQuery(next);
              onTenantSelect(next.trim() ? { id: '', name: next, floor: '', lot: '', category: '' } : null);
              return;
            }
            selectedIdRef.current = null;
            onTenantSelect(null);
            setQuery(next);
            setOpen(true);
          }}
          onFocus={() => { if (!manualMode && tenants.length > 0) setOpen(true); }}
          onKeyDown={onInputKeyDown}
        />
        {(selectedIdRef.current !== null || query) && (
          <button
            type="button"
            onClick={clearSelection}
            disabled={disabled}
            aria-label="Hapus pilihan tenant"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {loading && !manualMode && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" aria-hidden="true" />
        )}
      </div>

      {!manualMode && open && (loading || tenants.length > 0) && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Daftar tenant"
          className="ui-card absolute z-30 mt-1 max-h-64 w-full overflow-auto p-1 text-sm shadow-lg"
        >
          {loading && tenants.length === 0 && (
            <li className="px-3 py-2 text-slate-500 dark:text-slate-300" role="status">Mencari tenant…</li>
          )}
          {tenants.map((t, i) => (
            <li key={t.id} role="option" aria-selected={selectedIdRef.current === t.id}>
              <button
                type="button"
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => commitTenant(t)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition ${
                  highlighted === i ? 'bg-brand-primary-50 dark:bg-brand-primary-950/40' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{t.name}</span>
                  {(t.floor || t.lot) && (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {[t.floor, t.lot].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
