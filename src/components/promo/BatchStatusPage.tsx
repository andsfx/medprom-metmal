/**
 * Halaman status batch pengajuan cetak - publik, tanpa login.
 *
 * Token batch adalah kredensial tautan: halaman ini hanya menampilkan batch
 * yang tokennya cocok. Isi tiap item dirender komponen bersama
 * `SubmissionDetail` (sama persis dengan halaman status per-pengajuan),
 * sehingga tidak ada bentuk tampilan yang menyimpang antar jalur publik.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppShell from '../layout/AppShell';
import SubmissionDetail from './SubmissionDetail';
import { fetchBatchByToken, isNotFoundError } from '../../utils/promoApi';
import { APPLICANT_TYPE_LABELS } from '../../constants/promo';
import type { BatchStatusData } from '../../types/promo';

function rupiah(n: number | undefined): string {
  return `Rp. ${Number(n || 0).toLocaleString('id-ID')}`;
}

export default function BatchStatusPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<BatchStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    try {
      setData(await fetchBatchByToken(token));
    } catch (err) {
      // Gagal memuat ≠ tidak ditemukan: hanya 404 yang berarti tautan batch
      // tidak cocok. Gangguan jaringan/503 ditampilkan sebagai galat yang
      // bisa dicoba ulang.
      if (isNotFoundError(err)) setNotFound(true);
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const totalPpn = data?.items.reduce((s, it) => s + (it.submission.ppn_amount || 0), 0) ?? 0;
  const total = data?.items.reduce((s, it) => s + (it.submission.total_amount || 0), 0) ?? 0;
  // Untuk media ber-`ppn_included`, `ppn_amount` adalah PORSI PPN DI DALAM
  // subtotal (bukan pajak yang ditambahkan), sehingga label "Total PPN"
  // menyesatkan. Label mengikuti data batch; nilai `undefined`/falsy
  // diperlakukan sebagai "belum termasuk".
  const adaTermasukPpn = data?.items.some((it) => Boolean(it.submission.ppn_included)) ?? false;
  const adaBelumTermasukPpn = data?.items.some((it) => !it.submission.ppn_included) ?? false;
  const labelPpn = adaTermasukPpn ? 'Termasuk PPN' : 'Total PPN';

  return (
    // Tujuan tombol kembali TIDAK bergantung pada riwayat perangkat: lihat
    // alasan pada `SubmissionStatusPage` - beranda (`/`) dipilih supaya
    // perilakunya sama di setiap cara masuk, termasuk saat tautan dibuka
    // langsung tanpa riwayat navigasi.
    <AppShell title="Status Pengajuan Cetak" back backTo="/">
      <div className="mx-auto max-w-2xl px-4 py-5">
        {loading && (
          <div className="ui-card flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
            <span className="text-sm ui-text-muted">Memuat status batch…</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="ui-alert p-5" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Gagal memuat status batch.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              Pengajuan Anda tidak hilang. Sambungan ke server sedang bermasalah. Coba lagi sebentar lagi.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { void load(); }}
                className="ui-btn-primary inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition"
              >
                Coba lagi
              </button>
              <Link to="/riwayat" className="ui-control inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Lihat Riwayat Perangkat
              </Link>
            </div>
          </div>
        )}

        {!loading && notFound && (
          <div className="ui-alert p-5" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Pengajuan tidak ditemukan.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              Periksa kembali tautan status Anda. Tautan ini hanya berlaku untuk satu batch pengajuan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/riwayat" className="ui-btn-primary inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition">
                Lihat Riwayat Perangkat
              </Link>
            </div>
          </div>
        )}

        {!loading && data && (
          <div className="space-y-4">
            <div className="ui-card p-5">
              <p className="font-mono text-sm font-bold tracking-wide text-brand-primary-700 dark:text-brand-primary-300">
                {data.batch.batch_number}
              </p>
              <h1 className="ui-title-card mt-1 text-slate-900 dark:text-white">
                {data.batch.applicant_name}
              </h1>
              <p className="mt-0.5 text-xs ui-text-muted">
                {APPLICANT_TYPE_LABELS[data.batch.applicant_type] ?? data.batch.applicant_type}
                {data.batch.unit_number ? ` · Unit ${data.batch.unit_number}` : ''}
                {data.batch.submission_date ? ` · Diajukan ${data.batch.submission_date}` : ''}
              </p>
              {data.batch.notes && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{data.batch.notes}</p>
              )}
              {data.items.length > 0 && (
                <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
                  <div>
                    <dt className="ui-text-muted">{labelPpn}</dt>
                    <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{rupiah(totalPpn)}</dd>
                  </div>
                  <div>
                    <dt className="ui-text-muted">Total tagihan</dt>
                    <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{rupiah(total)}</dd>
                  </div>
                </dl>
              )}
              {data.items.length > 0 && adaTermasukPpn && adaBelumTermasukPpn && (
                <p className="mt-2 text-xs ui-text-muted">
                  Sebagian media harganya sudah termasuk PPN dan sebagian belum; angka PPN di atas adalah
                  porsi PPN dari seluruh baris.
                </p>
              )}
            </div>

            <p className="px-1 text-xs font-semibold ui-text-muted">
              {data.items.length} media dalam pengajuan ini
            </p>

            {data.items.map((it) => (
              <SubmissionDetail key={it.submission.id} data={it} onReload={load} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
