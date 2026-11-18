/**
 * Landing publik - daftar kerja katalog media promosi + kontak TR.
 * Data dari GET /promo/media-types; ketentuan pemasangan bisa dibuka (pola FAQ).
 *
 * Dunia visual: "Akromatik Tinta" - kertas putih, garis rambut tipis, dan
 * tinta #222222 sebagai aksen tunggal (lihat `DESIGN.md`). Di ponsel setiap
 * media satu BARIS daftar (thumbnail, nama, harga sebagai angka terbesar di
 * barisnya, lalu spesifikasi dan lokasi sebagai label redup). Di layar
 * >=640px baris itu berubah menjadi KARTU kisi lewat `.catalog-grid` (lihat
 * `base.css`): foto memimpin, isi mengalir vertikal, aksi dipatok ke dasar
 * kartu. Katalog dikelompokkan per KATEGORI deck (outdoor/indoor/social),
 * bukan per kanal - lihat catatan di bawah.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight, AlertTriangle, Search } from 'lucide-react';
import { fetchMediaTypes } from '../../utils/promoApi';
import { parseLeadTime, describeLeadTime } from '../../utils/leadTime';
import AppShell from '../layout/AppShell';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../constants/promo';
import { mediaPrice } from '../../utils/mediaPrice';
import MediaPriceTag from './MediaPriceTag';
import { MIN_DURATION_DAYS } from '../../utils/pricing';
import type { PromoMediaType } from '../../types/promo';

// Nilai filter "tampilkan semua media". Bukan `null` supaya tidak ambigu
// dengan "belum memilih", dan bukan string kosong yang mudah tertukar dengan
// `falsy` (pola FILTER_SEMUA di MySubmissionsPage).
const FILTER_SEMUA = 'all';

const CONTACTS = [
  { label: 'Tenant Relations (Media Promosi Cetak)', people: 'Bapak Ade · Ibu Ervita', wa: ['https://wa.me/6287785749386', 'https://wa.me/6281316759616'] },
  { label: 'Marketing Communications (Media Promosi Digital)', people: 'Bapak Uga', wa: ['https://wa.me/6285711088151'] },
];

function MediaRow({ media }: { media: PromoMediaType }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  // Aturan lead time diturunkan dari teks `rules`; null = media tak mengatur.
  const lead = parseLeadTime(media.rules);
  const isCetak = media.media_channel === 'cetak';
  const spec = [media.size_spec, media.material_spec].filter(Boolean).join(' · ');

  return (
    <article className="ui-row">
      {/* Foto contoh dari deck 2026: mempercepat tenant mengenali medianya.
       * Dimensi eksplisit + tinggi terkunci mencegah pergeseran tata letak
       * (CLS) saat gambar tiba. */}
      {media.image_path && (
        <img
          src={media.image_path}
          alt={`Contoh pemasangan ${media.name}`}
          width={800}
          height={600}
          loading="lazy"
          decoding="async"
          className="ui-row-lead"
        />
      )}

      <div className="ui-row-main">
        <div className="ui-row-head">
          <h3 className="ui-title-row">{media.name}</h3>
          <MediaPriceTag media={media} />
        </div>

        {spec && <p className="ui-dense ui-text-muted mt-1">{spec}</p>}
        {/* Kanal ditulis sebagai teks, bukan chip tersendiri: informasinya
         * penting (siapa yang menangani), tetapi chip memakan satu baris penuh
         * di layar 392px untuk satu kata. Teks ini memuat nama handler
         * ("Cetak · Tenant Relations" / "Digital · Marcom"), jadi siapa yang
         * menangani langsung terlihat di kartu. */}
        <p className="ui-meta ui-text-muted mt-0.5">
          {media.location_note && <>{media.location_note} · </>}
          {isCetak ? 'Cetak · Tenant Relations' : 'Digital · Marcom'}
        </p>
        {/* Lead time diturunkan dari teks `rules` (bukan dari kategori) -
         * ketentuan deck tidak seragam, jadi media tanpa aturan tidak
         * menampilkan baris ini sama sekali. */}
        {lead && (
          <p className="ui-meta ui-text-muted mt-0.5">
            Materi diterima paling lambat {describeLeadTime(lead)}.
          </p>
        )}

        {/* Ketentuan yang terbuka berada SEBELUM baris aksi: kalau diletakkan
         * sesudahnya, daftar aturan mendorong CTA naik dan kartu itu
         * kehilangan aksi di dasarnya (terukur: aksi kartu terbuka di 600px,
         * tetangganya 665px). */}
        {media.rules && rulesOpen && (
          <ul className="mb-1 mt-1 space-y-1.5">
            {media.rules.split('\n').filter(Boolean).map((line, i) => (
              <li key={i} className="ui-dense ui-text-muted flex items-start gap-2">
                <span aria-hidden="true" className="ui-num shrink-0 font-medium">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Baris aksi: ketentuan di kiri, tautan ajukan di kanan. Digabung
         * supaya dua aksi tidak memakan dua baris 44px berturut-turut.
         * `.catalog-actions` memakukan baris ini ke dasar kartu di >=640px. */}
        <div className="catalog-actions mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0">
          {media.rules ? (
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="app-pressable ui-focus-ring flex min-h-11 items-center gap-1 text-left ui-meta font-medium ui-text-muted"
            >
              Ketentuan pemasangan
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${rulesOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span />
          )}

          {/* Tujuan tautan mengikuti KANAL media, bukan kategori katalog.
           * Kanal `cetak` (Tenant Relations) punya formnya sendiri di
           * `/ajukan-cetak`: field persis permintaan pemilik, boleh beberapa
           * media sekaligus, dan TIDAK meminta berkas materi (materi menyusul
           * lewat revisi). Wizard digital `/ajukan` justru mewajibkan
           * unggah/tautan materi, jadi mengarahkan baris cetak ke sana meminta
           * berkas yang belum ada dan menghilangkan seluruh alur cetak. */}
          <Link
            to={isCetak
              ? `/ajukan-cetak?media=${encodeURIComponent(media.slug)}`
              : `/ajukan?media=${encodeURIComponent(media.slug)}`}
            className="app-pressable ui-focus-ring inline-flex min-h-11 items-center gap-1.5 ui-dense font-medium underline underline-offset-[3px] ui-text-strong"
          >
            Ajukan Materi
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function PromoLandingPage() {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>(FILTER_SEMUA);
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
  const gratis = mediaTypes.filter((m) => {
    const p = mediaPrice(m);
    const teks = p.mode === 'single' ? p.text : (p.lines[0] ?? '');
    return teks.toLowerCase().startsWith('gratis');
  }).length;

  // Filter murni sisi-klien: katalog kecil (14 slug) dimuat sekali, jadi
  // pencarian/pemfilteran tidak menambah panggilan. `aktif` menjadi dasar
  // hitungan per chip dan total; `visible` adalah hasil saringan yang dirender.
  const aktif = mediaTypes.filter((m) => m.is_active !== false);
  const kata = query.trim().toLowerCase();
  const visible = aktif.filter((m) => {
    const haystack = [m.name, m.slug, m.location_note, m.size_spec, m.material_spec]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (catFilter === FILTER_SEMUA || m.category === catFilter)
      && (kata === '' || haystack.includes(kata));
  });
  const totalKatalog = aktif.length;

  return (
    <AppShell
      actions={
        <Link
          to="/login"
          className="app-pressable ui-focus-ring inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 ui-dense font-medium ui-text-muted hover:bg-[var(--surface-hover)]"
        >
          Login
        </Link>
      }
    >
      {/* Kepala: judul, satu paragraf, lalu tiga fakta. Yang meyakinkan di sini
       * adalah ketepatan angka katalog, bukan foto atau badge. */}
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-6 sm:pt-12 sm:pb-8">
        <h1 className="ui-title-hero">
          Ajukan Materi Promosi Tenant Anda
        </h1>
        <p className="ui-body ui-text-muted mt-3 max-w-[52ch]">
          Ukuran, material, format, tarif, dan ketentuan pemasangan tiap media
          bersumber dari katalog resmi Metropolitan Mall Bekasi 2026.
          Pengajuan diverifikasi tim Tenant Relations.
        </p>

        {/* Fakta: tiga angka dari API, bukan angka yang ditulis di kode. */}
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-y border-[color:var(--rule-color)] py-4">
          <div>
            <dd className="ui-figure">{loading ? '—' : jumlahAktif}</dd>
            <dt className="ui-meta ui-text-muted mt-0.5">Media tersedia</dt>
          </div>
          <div>
            <dd className="ui-figure">{loading ? '—' : gratis}</dd>
            <dt className="ui-meta ui-text-muted mt-0.5">Gratis</dt>
          </div>
          <div>
            <dd className="ui-figure">{MIN_DURATION_DAYS} hari</dd>
            <dt className="ui-meta ui-text-muted mt-0.5">Sewa minimal cetak</dt>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            to="/ajukan"
            className="ui-btn-primary app-pressable inline-flex items-center gap-2 px-5 ui-dense font-semibold"
          >
            Mulai pengajuan
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="#katalog"
            className="ui-btn-secondary app-pressable inline-flex items-center gap-2 px-5 ui-dense font-semibold"
          >
            Lihat katalog
          </a>
        </div>

        <p className="ui-dense ui-text-muted mt-4">
          Sudah mengajukan?{' '}
          <Link to="/lacak" className="font-medium underline underline-offset-[3px]">
            Lacak dengan nomor pengajuan
          </Link>
          .
        </p>
      </section>

      {/* Katalog: satu bagian per KATEGORI deck.
       *
       * Bukan per kanal: hanya 3 dari 14 slug berkanal `cetak`, jadi
       * mengelompokkan per kanal akan memecah katalog menjadi "3 cetak" dan
       * "11 sisanya" sekaligus menghapus struktur outdoor/indoor/social yang
       * justru dipakai deck. Kanal kini dipakai sebagai teks meta dengan nama
       * handler di setiap kartu, bukan sebagai TAG. Di atas grid ada kotak
       * cari, sabuk chip filter kategori, dan catatan jumlah: semuanya
       * penyaringan sisi-klien atas katalog yang sudah termuat (lihat
       * konstanta `FILTER_SEMUA` dan komentar logika filter di badan
       * komponen). */}
      <section id="katalog" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-12">
        {loading && (
          <div className="catalog-grid" role="status" aria-live="polite" aria-label="Memuat katalog">
            <span className="sr-only">Memuat katalog…</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="ui-row" aria-hidden="true">
                <div className="ui-row-lead animate-pulse" />
                <div className="ui-row-main">
                  <div className="h-5 w-2/5 rounded-[var(--radius-chip)] bg-[var(--surface-tint)] animate-pulse" />
                  <div className="mt-2 h-4 w-3/5 rounded-[var(--radius-chip)] bg-[var(--surface-tint)] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {loadError && (
          <div className="ui-alert flex items-start gap-3 p-4" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--stamp-no)]" aria-hidden="true" />
            <div>
              <p className="ui-dense font-semibold text-[color:var(--stamp-no)]">Gagal memuat katalog media.</p>
              <p className="ui-meta ui-text-muted mt-1">Muat ulang halaman atau coba lagi sebentar.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* Cari: mempersempit grid tanpa panggilan baru; ikon kiri memberi
             * posisi visual yang familier pada kontrol isian `ui-control`. */}
            <div className="relative">
              <label htmlFor="catalog-search" className="sr-only">Cari media</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ui-text-muted" aria-hidden="true" />
              <input
                id="catalog-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari media, lokasi, atau ukuran"
                className="ui-control w-full pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {/* Sabuk chip kategori (pola filter status MySubmissionsPage). */}
            <div
              role="group"
              aria-label="Filter kategori"
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
              style={{ scrollbarWidth: 'none' }}
            >
              <button
                type="button"
                aria-pressed={catFilter === FILTER_SEMUA}
                onClick={() => setCatFilter(FILTER_SEMUA)}
                className="ui-tag min-h-11 px-3 py-2 text-sm"
                data-tone={catFilter === FILTER_SEMUA ? 'ink' : undefined}
              >
                {`Semua ${totalKatalog}`}
              </button>
              {CATEGORY_ORDER.map((cat) => {
                const n = aktif.filter((m) => m.category === cat).length;
                if (n === 0) return null;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={catFilter === cat}
                    onClick={() => setCatFilter(cat)}
                    className="ui-tag min-h-11 px-3 py-2 text-sm"
                    data-tone={catFilter === cat ? 'ink' : undefined}
                  >
                    {`${CATEGORY_LABELS[cat] ?? cat} ${n}`}
                  </button>
                );
              })}
            </div>

            <p className="ui-meta ui-text-muted mt-4" role="status">
              Menampilkan {visible.length} dari {totalKatalog} media.
            </p>

            {visible.length === 0 ? (
              <p className="ui-empty px-6 py-10 text-sm font-semibold">Tidak ada media yang cocok.</p>
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const items = visible.filter((m) => m.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="mb-10">
                    <div className="flex items-baseline justify-between gap-4 border-b border-[color:var(--rule-strong)] pb-2">
                      <h2 className="ui-title-section">{CATEGORY_LABELS[cat] ?? cat}</h2>
                      <span className="ui-meta ui-text-muted">
                        {items.length} media
                      </span>
                    </div>
                    <div className="catalog-grid">
                      {items.map((m) => <MediaRow key={m.slug} media={m} />)}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </section>

      {/* Kontak */}
      <section className="border-t border-[color:var(--rule-color)] py-12">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="ui-title-section">Butuh bantuan?</h2>
          <p className="ui-body ui-text-muted mt-2 max-w-[52ch]">
            Media cetak ditangani Tenant Relations; media digital ditangani
            Marketing Communications.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {CONTACTS.map((c) => (
              <div key={c.label} className="flex h-full flex-col rounded-[var(--radius-card)] border border-[color:var(--rule-color)] p-5">
                <p className="ui-dense font-semibold ui-text-strong">{c.label}</p>
                <p className="ui-dense ui-text-muted mt-1">{c.people}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {c.wa.map((wa) => (
                    <a
                      key={wa}
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ui-btn-secondary app-pressable ui-focus-ring inline-flex min-h-11 items-center gap-1.5 px-3 ui-meta font-medium transition-colors hover:bg-[var(--surface-hover)]"
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
        <p className="ui-meta ui-text-muted text-center">
          &copy; {new Date().getFullYear()} Metropolitan Mall Bekasi · Metland Coloring Life
        </p>
      </footer>
    </AppShell>
  );
}