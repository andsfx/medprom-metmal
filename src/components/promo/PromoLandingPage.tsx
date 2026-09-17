/**
 * Landing publik — katalog media promosi (3 kategori) + kontak TR.
 * Data dari GET /promo/media-types; kartu expandable rules (pola FAQ).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MapPin, Ruler, Tag, ArrowRight, AlertTriangle } from 'lucide-react';
import { fetchMediaTypes } from '../../utils/promoApi';
import AppShell from '../layout/AppShell';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../constants/promo';
import type { PromoMediaType } from '../../types/promo';

const CONTACTS = [
  { label: 'Tenant Relations — Media Promosi Cetak', people: 'Bapak Ade · Ibu Ervita', wa: ['https://wa.me/6287785749386', 'https://wa.me/6281316759616'] },
  { label: 'Marketing Communications — Media Promosi Digital', people: 'Bapak Uga', wa: ['https://wa.me/6285711088151'] },
];

function MediaCard({ media }: { media: PromoMediaType }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <article className="ui-card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">{media.name}</h3>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        {media.size_spec && (
          <div className="flex items-start gap-2">
            <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />
            <div>
              <dt className="sr-only">Ukuran</dt>
              <dd className="ui-text-muted">{media.size_spec}</dd>
            </div>
          </div>
        )}
        {media.material_spec && (
          <div className="flex items-start gap-2">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />
            <div>
              <dt className="sr-only">Materi</dt>
              <dd className="ui-text-muted">{media.material_spec}</dd>
            </div>
          </div>
        )}
        {media.price_note && (
          <div className="flex items-start gap-2">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />
            <div>
              <dt className="sr-only">Harga</dt>
              {/* Satu tarif per baris: sebagian media punya beberapa tarif
               * (per hari/7 hari/14 hari/30 hari) yang tak terbaca bila
               * didorong jadi satu baris panjang. */}
              <dd className="font-semibold text-slate-900 dark:text-slate-100">
                {media.price_note.split('\n').map((line, i) => (
                  <span key={i} className="block">{line}</span>
                ))}
              </dd>
            </div>
          </div>
        )}
        {media.location_note && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="sr-only">Lokasi</dt>
              <dd className="ui-text-muted">{media.location_note}</dd>
            </div>
          </div>
        )}
      </dl>

      {media.rules && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setRulesOpen((v) => !v)}
            aria-expanded={rulesOpen}
            className="app-pressable ui-focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] text-left text-sm font-medium text-brand-primary-700 transition hover:text-brand-primary-800 dark:text-brand-primary-300 dark:hover:text-brand-primary-200"
          >
            Ketentuan pemasangan
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${rulesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {rulesOpen && (
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {media.rules.split('\n').filter(Boolean).map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-primary-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 flex-1" />
      <Link
        to={`/ajukan?media=${encodeURIComponent(media.slug)}`}
        className="ui-btn-primary app-pressable ui-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition"
      >
        Ajukan Materi
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

export default function PromoLandingPage() {
  const [mediaTypes, setMediaTypes] = useState<PromoMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMediaTypes()
      .then((rows) => { if (!cancelled) setMediaTypes(rows); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell
      actions={
        <Link
          to="/login"
          className="app-pressable ui-focus-ring inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-slate-600 hover:bg-[var(--surface-hover)] dark:text-slate-300"
        >
          Login Staf
        </Link>
      }
    >
      {/* Hero — padat, langsung ke aksi (bukan halaman pembuka panjang) */}
      <section className="mx-auto max-w-6xl px-4 pb-6 pt-6 sm:pb-10 sm:pt-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-primary-600">
          Tenant Relations · 2026
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
          Ajukan Materi Promosi Tenant Anda
        </h1>
        <p className="ui-body ui-text-muted mt-2 max-w-lg">
          Kirim materi media promosi — spanduk, LED, videotron, hingga media sosial —
          langsung ke Tim Tenant Relations. Status pengajuan bisa dipantau kapan saja.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            to="/ajukan"
            className="ui-btn-primary app-pressable inline-flex items-center gap-2 rounded-[var(--radius-control)] px-5 py-3 text-sm font-semibold"
          >
            Mulai Pengajuan
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="#katalog"
            className="ui-btn-secondary app-pressable inline-flex items-center gap-2 rounded-[var(--radius-control)] px-5 py-3 text-sm font-medium"
          >
            Lihat Katalog
          </a>
        </div>
      </section>

      {/* Katalog */}
      <section id="katalog" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-10">
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Memuat katalog">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ui-card h-64 animate-pulse bg-stone-50" />
            ))}
          </div>
        )}

        {loadError && (
          <div className="ui-alert flex items-start gap-3 p-4" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-red-800">Gagal memuat katalog media.</p>
              <p className="mt-1 text-xs text-red-700">Muat ulang halaman atau coba lagi sebentar.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && CATEGORY_ORDER.map((cat) => {
          const items = mediaTypes.filter((m) => m.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-12">
              <h2 className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
                {CATEGORY_LABELS[cat] ?? cat}
              </h2>
              <div className="ui-rule mt-3" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => <MediaCard key={m.slug} media={m} />)}
              </div>
            </div>
          );
        })}
      </section>

      {/* Kontak */}
      <section className="border-t border-stone-200 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl">Butuh Bantuan?</h2>
          <p className="ui-body ui-text-muted mt-1">Hubungi kontak Tenant Relations / Marcom kami:</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {CONTACTS.map((c) => (
              <div key={c.label} className="ui-card p-5">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.label}</p>
                <p className="ui-text-muted mt-1 text-sm">{c.people}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.wa.map((wa) => (
                    <a
                      key={wa}
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ui-control app-pressable ui-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-brand-primary-700 transition hover:text-brand-primary-800 dark:text-brand-primary-300"
                    >
                      WhatsApp
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8">
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          &copy; {new Date().getFullYear()} Metropolitan Mall Bekasi — Metland Coloring Life
        </p>
      </footer>
    </AppShell>
  );
}
