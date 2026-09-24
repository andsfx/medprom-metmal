/**
 * Landing publik - lembar spesifikasi katalog media promosi + kontak TR.
 * Data dari GET /promo/media-types; kartu expandable rules (pola FAQ).
 *
 * Dunia visual: "Lembar Spesifikasi & Tiket Pekerjaan". Setiap media adalah
 * satu lembar spesifikasi: nomor plate (urutan deck), garis dimensi pada foto,
 * tabel spesifikasi bertitik penghubung, dan lencana kanal. Angka memakai
 * monospace tabular karena ia data, bukan hiasan.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight, AlertTriangle } from 'lucide-react';
import { fetchMediaTypes } from '../../utils/promoApi';
import { parseLeadTime, describeLeadTime } from '../../utils/leadTime';
import AppShell from '../layout/AppShell';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../constants/promo';
import type { PromoMediaType } from '../../types/promo';

const CONTACTS = [
  { label: 'Tenant Relations (Media Promosi Cetak)', people: 'Bapak Ade · Ibu Ervita', wa: ['https://wa.me/6287785749386', 'https://wa.me/6281316759616'] },
  { label: 'Marketing Communications (Media Promosi Digital)', people: 'Bapak Uga', wa: ['https://wa.me/6285711088151'] },
];

/** Sudut tanda potong: murni dekoratif, jadi tidak boleh dibaca pembaca layar. */
function CropMarks() {
  return (
    <>
      <span className="doc-crop" data-corner="tl" aria-hidden="true" />
      <span className="doc-crop" data-corner="tr" aria-hidden="true" />
      <span className="doc-crop" data-corner="bl" aria-hidden="true" />
      <span className="doc-crop" data-corner="br" aria-hidden="true" />
    </>
  );
}

function MediaCard({ media }: { media: PromoMediaType }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  // Aturan lead time diturunkan dari teks `rules`; null = media tak mengatur.
  const lead = parseLeadTime(media.rules);
  // Satu baris per baris `\n`; baris kosong dibuang agar tak menyisakan
  // baris menggantung di tangga tarif.
  const priceLines = (media.price_note || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const isCetak = media.media_channel === 'cetak';
  // Nomor plate = urutan deck. Urutan itu sendiri informasi (posisi media di
  // deck 2026), jadi angkanya ditampilkan, bukan hiasan.
  const plateNo = String(media.sort_order ?? 0).padStart(2, '0');

  return (
    <article className="doc-sheet flex flex-col overflow-hidden">
      {/* Foto contoh dari deck 2026 - mempercepat tenant mengenali medianya.
       * Rasio dikunci 4:3 agar tinggi kartu tidak melompat saat gambar tiba. */}
      {media.image_path && (
        <div className="relative border-b border-[color:var(--rule-color)] bg-[var(--surface-offset)]">
          <img
            src={media.image_path}
            alt={`Contoh pemasangan ${media.name}`}
            width={800}
            height={600}
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full object-cover"
          />
          {/* Garis dimensi pada foto: ukuran media diukur langsung di atas
           * gambarnya, seperti anotasi pada lembar teknis. */}
          {media.size_spec && (
            <span className="doc-num absolute bottom-2.5 left-2.5 rounded-[2px] border border-[color:var(--rule-strong)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">
              {media.size_spec}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="doc-plate-no">Plate {plateNo}</span>
            <h3 className="mt-0.5 text-lg font-bold leading-tight text-slate-900 dark:text-white">{media.name}</h3>
          </div>
          <span className="doc-tag shrink-0" data-tone={isCetak ? 'process' : 'none'}>
            {isCetak ? 'Cetak' : 'Digital'}
          </span>
        </div>

        {/* `<dl>` hanya boleh berisi `<dt>`/`<dd>`; pembungkus `<div>` dipakai
         * supaya tiap baris punya pemimpin titik, dan `<dd>` tidak kehilangan
         * induk `<dl>` (axe: definition-list + dlitem). */}
        <dl className="doc-rows mt-3.5">
          {media.material_spec && (
            <div className="doc-row">
              <dt>Material</dt>
              <span className="doc-leader" aria-hidden="true" />
              <dd>{media.material_spec}</dd>
            </div>
          )}
          {media.accepted_formats && (
            <div className="doc-row">
              <dt>Format</dt>
              <span className="doc-leader" aria-hidden="true" />
              <dd>{media.accepted_formats}</dd>
            </div>
          )}
          {media.price_note && (
            <div className="doc-row items-start">
              <dt className="pt-0.5">Tarif</dt>
              <span className="doc-leader mt-2.5" aria-hidden="true" />
              <dd>
                {/* Tangga tarif: keputusan tata letak dibuat PER BARIS. Baris
                 * berlabel (kata sebelum `Rp.`, mis. "Mingguan") jadi dua kolom
                 * - kata di kiri, nominal rata kanan - sehingga tarif berdurasi
                 * berbeda sejajar dan bisa dibandingkan sekilas. Baris tanpa
                 * kata di depan (`Rp. 600.000,-/hari`) dibiarkan apa adanya
                 * sebagai satu baris rata kanan: sufiksnya (`/hari`, `/30 hari`)
                 * lebarnya berbeda, jadi memaksanya dua kolom hanya membuat
                 * angka menggantung tanpa jangkar. Setiap karakter
                 * dipertahankan verbatim. */}
                {priceLines.map((line, i) => {
                  const at = line.indexOf('Rp.');
                  if (at > 0) {
                    return (
                      <span key={i} className="flex items-baseline justify-between gap-3">
                        <span>{line.slice(0, at).trim()}</span>
                        <span className="whitespace-nowrap tabular-nums">{line.slice(at)}</span>
                      </span>
                    );
                  }
                  return (
                    <span key={i} className="block tabular-nums">{line}</span>
                  );
                })}
              </dd>
            </div>
          )}
          {media.location_note && (
            <div className="doc-row items-start">
              <dt className="pt-0.5">Lokasi</dt>
              <span className="doc-leader mt-2.5" aria-hidden="true" />
              <dd className="text-left font-sans text-xs leading-snug font-normal normal-case">{media.location_note}</dd>
            </div>
          )}
        </dl>

        {/* Lead time diturunkan dari teks `rules` (bukan dari kategori) -
         * ketentuan deck tidak seragam, jadi media tanpa aturan tidak
         * menampilkan baris ini sama sekali. */}
        {lead && (
          <p className="ui-meta ui-text-muted mt-3">
            Materi diterima paling lambat {describeLeadTime(lead)}.
          </p>
        )}

        {media.rules && (
          <div className="mt-4 border-t border-[color:var(--rule-color)] pt-2">
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="app-pressable ui-focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] text-left text-sm font-semibold text-brand-primary-700 transition hover:text-brand-primary-800 dark:text-brand-primary-300 dark:hover:text-brand-primary-200"
            >
              Ketentuan pemasangan
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${rulesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {rulesOpen && (
              <ul className="mt-2 space-y-1.5 pb-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {media.rules.split('\n').filter(Boolean).map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span aria-hidden="true" className="doc-num mt-0.5 text-[10px] font-bold text-slate-400">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-auto pt-4">
          {/* Tujuan tautan mengikuti KANAL media, bukan kategori katalog.
           * Kanal `cetak` (Tenant Relations) punya formnya sendiri di
           * `/ajukan-cetak`: field persis permintaan pemilik, boleh beberapa
           * media sekaligus, dan TIDAK meminta berkas materi (materi menyusul
           * lewat revisi). Wizard digital `/ajukan` justru mewajibkan
           * unggah/tautan materi, jadi mengarahkan kartu cetak ke sana meminta
           * berkas yang belum ada dan menghilangkan seluruh alur cetak. */}
          <Link
            to={isCetak
              ? `/ajukan-cetak?media=${encodeURIComponent(media.slug)}`
              : `/ajukan?media=${encodeURIComponent(media.slug)}`}
            className="app-pressable ui-focus-ring inline-flex min-h-11 items-center gap-2 border-b-2 border-[color:var(--ink-primary)] pb-1 text-sm font-bold tracking-wide text-brand-primary-700 transition-colors hover:text-brand-primary-800 dark:text-brand-primary-300 dark:hover:text-brand-primary-200"
          >
            Ajukan Materi
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
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

  const jumlahAktif = mediaTypes.filter((m) => m.is_active !== false).length;

  return (
    <AppShell
      actions={
        <Link
          to="/login"
          className="app-pressable ui-focus-ring inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-slate-600 hover:bg-[var(--surface-hover)] dark:text-slate-300"
        >
          Login
        </Link>
      }
    >
      {/* Lembar pertama: judul + ukuran + aksi. Tanpa eyebrow, tanpa badge,
       * tanpa gambar: yang meyakinkan di sini adalah ketepatan, bukan foto. */}
      <section className="mx-auto max-w-6xl px-4 pt-6 pb-8 sm:pt-10">
        <div className="doc-sheet px-5 py-7 sm:px-9 sm:py-9">
          <CropMarks />
          <span className="doc-plate-no absolute top-4 right-5 sm:right-9">Plate 01 / Katalog</span>
          <h1 className="mt-1 text-3xl font-extrabold uppercase leading-[0.98] tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Ajukan Materi
            <br />
            Promosi
          </h1>
          {/* Garis dimensi: mengukur jumlah katalog, seperti anotasi lembar
           * teknis. Nilainya data nyata dari API, bukan angka tetap. */}
          <div className="doc-dim mt-5 max-w-md">
            <span className="doc-dim-val">{mediaTypes.length || '—'} media</span>
            <span className="doc-dim-line" aria-hidden="true" />
            <span className="doc-dim-val">{loading ? '—' : `${jumlahAktif} aktif`}</span>
          </div>
          <p className="ui-body ui-text-muted mt-5 max-w-[46ch]">
            Ukuran, material, format, tarif, dan ketentuan pemasangan tiap media
            bersumber dari katalog resmi Metropolitan Mall Bekasi 2026.
            Pengajuan diverifikasi tim Tenant Relations.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              to="/ajukan"
              className="ui-btn-primary app-pressable inline-flex items-center gap-2 rounded-[var(--radius-control)] px-5 py-3 text-sm font-bold"
            >
              Mulai Pengajuan
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/ajukan-cetak"
              className="ui-btn-secondary app-pressable inline-flex items-center gap-2 rounded-[var(--radius-control)] px-5 py-3 text-sm font-semibold"
            >
              Ajukan Media Cetak
            </Link>
            <a
              href="#katalog"
              className="ui-btn-secondary app-pressable inline-flex items-center gap-2 rounded-[var(--radius-control)] px-5 py-3 text-sm font-semibold"
            >
              Lihat Katalog
            </a>
          </div>
          <p className="mt-5 text-sm ui-text-muted">
            Sudah mengajukan?{' '}
            <Link
              to="/lacak"
              className="doc-link font-semibold"
            >
              Lacak dengan nomor pengajuan
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Katalog: satu bagian per kategori deck. */}
      <section id="katalog" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-12">
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Memuat katalog">
            {[0, 1, 2].map((i) => (
              <div key={i} className="doc-sheet h-64 animate-pulse bg-[var(--surface-offset)]" />
            ))}
          </div>
        )}

        {loadError && (
          <div className="ui-alert flex items-start gap-3 p-4" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--stamp-no)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[color:var(--stamp-no)]">Gagal memuat katalog media.</p>
              <p className="mt-1 text-xs ui-text-muted">Muat ulang halaman atau coba lagi sebentar.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && CATEGORY_ORDER.map((cat) => {
          const items = mediaTypes.filter((m) => m.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-10">
              <div className="flex items-baseline gap-4 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
                <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h2>
                <span className="doc-plate-no ml-auto">
                  {items.length} media · plate {String(items[0]?.sort_order ?? 0).padStart(2, '0')}
                  {items.length > 1 ? `–${String(items[items.length - 1]?.sort_order ?? 0).padStart(2, '0')}` : ''}
                </span>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => <MediaCard key={m.slug} media={m} />)}
              </div>
            </div>
          );
        })}
      </section>

      {/* Kontak */}
      <section className="border-t border-[color:var(--rule-color)] py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-baseline gap-4 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
            <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">Butuh Bantuan?</h2>
            <span className="doc-plate-no ml-auto">Hubungi TR / Marcom</span>
          </div>
          <p className="ui-body ui-text-muted mt-4">Hubungi kontak Tenant Relations / Marcom kami:</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {CONTACTS.map((c) => (
              <div key={c.label} className="doc-sheet p-5">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{c.label}</p>
                <p className="ui-text-muted mt-1 text-sm">{c.people}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.wa.map((wa) => (
                    <a
                      key={wa}
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ui-btn-secondary app-pressable ui-focus-ring inline-flex min-h-11 items-center gap-1.5 px-3 text-xs font-semibold text-brand-primary-700 transition-colors hover:text-brand-primary-800 dark:text-brand-primary-300"
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

      <footer className="border-t border-[color:var(--rule-color)] py-8">
        <p className="doc-plate-no text-center">
          &copy; {new Date().getFullYear()} Metropolitan Mall Bekasi · Metland Coloring Life
        </p>
      </footer>
    </AppShell>
  );
}
