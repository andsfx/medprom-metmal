/**
 * Riwayat pengajuan per perangkat — publik (fingerprint = identitas soft).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Clock, ExternalLink, Info, XCircle, Loader2, Wrench,
} from 'lucide-react';
import { fetchMySubmissions } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { STATUS_LABELS } from '../../constants/promo';
import type { MySubmissionRow } from '../../types/promo';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    draft: { cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <Info className="h-3.5 w-3.5" aria-hidden="true" /> },
    menunggu_review: { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: <Clock className="h-3.5 w-3.5" aria-hidden="true" /> },
    perlu_revisi: { cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: <Info className="h-3.5 w-3.5" aria-hidden="true" /> },
    disetujui: { cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
    ditolak: { cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> },
    siap_dipasang: { cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300', icon: <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> },
    sudah_dipasang: { cls: 'bg-brand-primary-100 text-brand-primary-800 dark:bg-brand-primary-950/50 dark:text-brand-primary-300', icon: <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> },
    selesai: { cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  };
  const cfg = map[status] ?? map.menunggu_review!;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.cls}`}>
      {cfg.icon}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function MySubmissionsPage() {
  const [rows, setRows] = useState<MySubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fp = getDeviceFingerprint();
    fetchMySubmissions(fp)
      .then((r) => { if (!cancelled) setRows(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="ui-dashboard-page min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary-700 transition hover:text-brand-primary-800 dark:text-brand-primary-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Beranda
          </Link>
          <span className="text-xs font-semibold text-brand-primary-600 dark:text-brand-primary-400">
            Metropolitan Mall Bekasi
          </span>
        </div>

        <div className="ui-dashboard-surface overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-brand-primary-50/60 to-transparent px-5 py-4 dark:border-slate-700 dark:from-brand-primary-950/30">
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">Riwayat Pengajuan</h1>
            <p className="mt-0.5 text-xs ui-text-muted">
              Pengajuan yang dikirim dari perangkat ini beserta statusnya.
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="mb-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Riwayat terikat pada browser/perangkat ini — mengganti perangkat atau membersihkan data browser
              akan menghilangkan akses ke riwayat.
            </p>

            {loading && (
              <div className="flex items-center justify-center gap-3 py-10" role="status">
                <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
                <span className="text-sm ui-text-muted">Memuat riwayat…</span>
              </div>
            )}

            {!loading && rows.length === 0 && (
              <div className="ui-empty-panel px-6 py-10">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Belum ada pengajuan dari perangkat ini.</p>
                <p className="mt-1 text-xs ui-text-muted">Ajukan materi promosi pertama Anda dari halaman beranda.</p>
                <Link to="/" className="ui-btn-primary mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition">
                  Ajukan Materi
                </Link>
              </div>
            )}

            {!loading && rows.length > 0 && (
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li key={r.id} className="ui-dashboard-control rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold tracking-wide text-brand-primary-700 dark:text-brand-primary-300">
                          {r.submission_number}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                          {r.material_title || r.media_type_slug}
                        </p>
                        <p className="mt-0.5 text-xs ui-text-muted">
                          {r.created_at ? new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.review_notes && (
                      <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                        <span className="font-semibold">Catatan TR: </span>{r.review_notes}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {(r.source_type === 'link' ? r.link_url : r.file_url) && (
                        <a
                          href={r.source_type === 'link' ? r.link_url : r.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary-700 transition hover:text-brand-primary-800 dark:text-brand-primary-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          {r.source_type === 'link' ? 'Buka tautan materi' : 'Lihat file materi'}
                        </a>
                      )}
                      {r.status_token && (
                        <Link
                          to={`/status/${r.status_token}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary-700 transition hover:text-brand-primary-800 dark:text-brand-primary-300"
                        >
                          Lihat status & kirim revisi
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
