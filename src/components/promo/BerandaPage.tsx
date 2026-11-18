/**
 * Beranda tenant - home baru (prototype `beranda.html`, IA full scope).
 *
 * Tiga blok dari SATU panggilan `GET /promo/summary` (fingerprint perangkat):
 * ringkasan status (GROUP BY server), pengajuan yang perlu tindakan
 * (terbaru, menunggu review/perlu revisi), dan periode tayang yang hampir
 * berakhir (disetujui/siap/terpasang dengan `air_end_date` masih aktif).
 *
 * Semua angka dihitung SERVER - klien hanya merender. Bila pemuatan gagal,
 * seluruh blok menampilkan panel galat (bukan angka nol yang menyesatkan
 * tenant yang pengajuannya ada); bila perangkat belum punya pengajuan, blok
 * diganti ajakan mengajukan. Pengajuan terbaru dimuat dari
 * `/promo/submissions/mine` (riwayat perangkat, 3 baris pertama).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Clock, Grid3X3, History, Loader2 } from 'lucide-react';
import AppShell from '../layout/AppShell';
import Stamp from './Stamp';
import MediaPriceTag from './MediaPriceTag';
import { fetchHomeSummary, fetchMySubmissions, normalizeMySubmissions } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { STATUS_ORDER } from '../../constants/promo';
import type { HomeSummary } from '../../utils/promoApi';
import type { MySubmissionRow } from '../../types/promo';

/** Ambang "hampir berakhir" (hari) - sama dengan pengingat konsol staf. */
const EXPIRING_SOON_DAYS = 14;

const NEEDS_ACTION: Record<string, true> = { menunggu_review: true, perlu_revisi: true };

/** Status yang bisa menampilkan periode berakhir. */
const ACTIVE_TRAY: Record<string, true> = { disetujui: true, siap_dipasang: true, sudah_dipasang: true };
function shortDate(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / 86_400_000);
}

export default function BerandaPage() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [recent, setRecent] = useState<MySubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fp = getDeviceFingerprint();
    // Ringkasan + 3 pengajuan terbaru dimuat paralel; keduanya dari server.
    Promise.all([fetchHomeSummary(fp), fetchMySubmissions(fp)])
      .then(([s, mine]) => {
        if (cancelled) return;
        setSummary(s);
        setRecent(normalizeMySubmissions(mine).rows.slice(0, 3));
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const total = summary?.total ?? 0;
  const needingAction = summary?.needing_action ?? null;
  const expiring = (summary?.expiring_soon ?? [])
    .filter((e) => daysUntil(e.air_end_date) <= EXPIRING_SOON_DAYS);

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
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-12">
        <h1 className="ui-title-screen ui-text-strong">
          Selamat datang
          <small className="mt-1 block ui-dense font-normal ui-text-muted">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </small>
        </h1>

        {loading && (
          <div className="ui-card mt-5 flex items-center justify-center gap-3 py-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
            <span className="ui-dense ui-text-muted">Memuat ringkasan…</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="ui-alert mt-5 p-5" role="alert">
            <p className="ui-dense font-semibold text-[color:var(--stamp-no)]">Gagal memuat ringkasan pengajuan.</p>
            <p className="ui-meta ui-text-muted mt-1">
              Pengajuan Anda tidak hilang. Muat ulang halaman atau coba lagi sebentar.
            </p>
          </div>
        )}

        {!loading && !loadError && summary && total === 0 && (
          <div className="ui-card mt-5 px-6 py-10 text-center">
            <p className="ui-title-card ui-text-strong">Belum ada pengajuan dari perangkat ini.</p>
            <p className="ui-dense ui-text-muted mt-1">
              Pilih media dari katalog, isi kampanye, lalu kirim materinya.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Link to="/ajukan" className="ui-btn-primary app-pressable inline-flex min-h-11 items-center gap-2 px-4 ui-dense font-semibold">
                Ajukan Materi <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/katalog" className="ui-btn-secondary app-pressable inline-flex min-h-11 items-center gap-2 px-4 ui-dense font-semibold">
                Lihat Katalog
              </Link>
            </div>
          </div>
        )}

        {!loading && !loadError && summary && total > 0 && (
          <>
            {/* Ringkasan status: 4 sel yang paling sering dibaca tenant. */}
            <section aria-label="Ringkasan status pengajuan" className="mt-5">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { kode: 'menunggu_review', label: 'Menunggu Review' },
                  { kode: 'perlu_revisi', label: 'Perlu Revisi' },
                  { kode: 'siap_dipasang', label: 'Siap Dipasang' },
                  { kode: 'selesai', label: 'Selesai' },
                ].map(({ kode, label }) => (
                  <div key={kode} className="ui-card px-2 py-3 text-center">
                    <span className="ui-number block text-xl">{summary.by_status[kode] ?? 0}</span>
                    <span className="ui-meta ui-text-muted mt-0.5 block leading-tight">{label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Aksi cepat: jalur paling sering dipakai (prototype beranda). */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Link
                to="/katalog"
                className="ui-card flex flex-col items-center gap-2 px-2 py-3.5 ui-dense font-medium ui-text-strong transition-colors hover:bg-[var(--surface-offset)]"
              >
                <Grid3X3 className="h-5 w-5" aria-hidden="true" />
                Katalog
              </Link>
              <Link
                to="/riwayat"
                className="ui-card flex flex-col items-center gap-2 px-2 py-3.5 ui-dense font-medium ui-text-strong transition-colors hover:bg-[var(--surface-offset)]"
              >
                <History className="h-5 w-5" aria-hidden="true" />
                Riwayat
              </Link>
              <Link
                to="/lacak"
                className="ui-card flex flex-col items-center gap-2 px-2 py-3.5 ui-dense font-medium ui-text-strong transition-colors hover:bg-[var(--surface-offset)]"
              >
                <Clock className="h-5 w-5" aria-hidden="true" />
                Lacak
              </Link>
            </div>

            {/* Perlu tindakan: pengajuan terbaru yang menunggu tenant. */}
            {needingAction && NEEDS_ACTION[needingAction.status] && (
              <section className="mt-8" aria-labelledby="bh-action">
                <h2 id="bh-action" className="ui-title-section">Perlu tindakan kamu</h2>
                <div className="ui-card mt-3 p-4">
                  <Stamp status={needingAction.status} />
                  <p className="ui-title-card ui-text-strong mt-2">
                    {needingAction.material_title || needingAction.media_type_slug}
                  </p>
                  {needingAction.review_notes && (
                    <p className="ui-dense ui-text-muted mt-1">{needingAction.review_notes}</p>
                  )}
                  <Link
                    to={`/status/${needingAction.status_token}`}
                    className="ui-btn-primary app-pressable mt-4 inline-flex w-full min-h-11 items-center justify-center gap-2 px-4 ui-dense font-semibold"
                  >
                    {needingAction.status === 'perlu_revisi' ? 'Kirim Revisi' : 'Lihat Pengajuan'}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <p className="ui-meta ui-text-muted mt-2 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {needingAction.submission_number}
                  </p>
                </div>
              </section>
            )}

            {/* Periode hampir berakhir: status aktif dengan akhir tayang terdekat. */}
            {expiring.length > 0 && (
              <section className="mt-8" aria-labelledby="bh-expiring">
                <h2 id="bh-expiring" className="ui-title-section">Periode hampir berakhir</h2>
                <ul className="mt-3 space-y-2.5">
                  {expiring.map((e) => {
                    const sisa = daysUntil(e.air_end_date);
                    const aktif = ACTIVE_TRAY[e.status];
                    if (!aktif) return null;
                    return (
                      <li key={e.submission_number}>
                        <Link
                          to={`/status/${e.status_token}`}
                          className="ui-card flex items-center justify-between gap-3 p-4 transition-colors hover:bg-[var(--surface-offset)]"
                        >
                          <span className="min-w-0">
                            <span className="ui-dense font-semibold ui-text-strong block truncate">
                              {e.material_title || e.media_type_slug}
                            </span>
                            <span className="ui-meta ui-text-muted mt-0.5 flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              Berakhir {shortDate(e.air_end_date)}
                            </span>
                          </span>
                          <span className="ui-number shrink-0 text-lg">
                            {sisa <= 0 ? 'Hari ini' : `${sisa} hari`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Pengajuan terbaru: 3 baris pertama riwayat perangkat. */}
            {recent.length > 0 && (
              <section className="mt-8" aria-labelledby="bh-recent">
                <h2 id="bh-recent" className="ui-title-section">Pengajuan terbaru</h2>
                <ul className="mt-3 space-y-2.5">
                  {recent.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={r.status_token ? `/status/${r.status_token}` : `/lacak?nomor=${r.submission_number}`}
                        className="ui-card flex items-center gap-3 p-3.5 transition-colors hover:bg-[var(--surface-offset)]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="ui-dense font-semibold ui-text-strong block truncate">
                            {r.material_title || r.media_type_slug}
                          </span>
                          <span className="ui-meta ui-text-muted mt-0.5 block">
                            {r.submission_number} ·{' '}
                            {r.created_at
                              ? new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                              : ''}
                          </span>
                        </span>
                        <Stamp status={r.status} className="shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Status yang punya jumlah diurutkan menurut alur kerja repo. */}
            <section className="mt-8" aria-labelledby="bh-status">
              <h2 id="bh-status" className="ui-title-section">Semua status</h2>
              <ul className="mt-3 divide-y divide-[color:var(--rule-color)] border-y border-[color:var(--rule-color)]">
                {STATUS_ORDER.filter((kode) => (summary.by_status[kode] ?? 0) > 0).map((kode) => (
                  <li key={kode} className="flex items-center justify-between gap-3 py-3">
                    <Stamp status={kode} />
                    <span className="ui-number">{summary.by_status[kode]}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}