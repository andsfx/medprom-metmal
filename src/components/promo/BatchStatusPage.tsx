/**
 * Halaman status batch pengajuan cetak - publik, tanpa login.
 *
 * Token batch adalah kredensial tautan: halaman ini hanya menampilkan batch
 * yang tokennya cocok. Batch dibaca sebagai SATU TIKET PEKERJAAN INDUK:
 * nomor batch monospace, daftar media sebagai baris dokumen bergaris (nomor
 * job + stempel status per baris), dan ringkasan biaya sebagai blok
 * perhitungan. Isi tiap media dirender komponen bersama `SubmissionDetail`
 * (sama persis dengan halaman status per-pengajuan), sehingga tidak ada
 * bentuk tampilan yang menyimpang antar jalur publik.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppShell from '../layout/AppShell';
import SubmissionDetail from './SubmissionDetail';
import Stamp from './Stamp';
import { fetchBatchByToken, isNotFoundError } from '../../utils/promoApi';
import { APPLICANT_TYPE_LABELS } from '../../constants/promo';
import type { BatchStatusData } from '../../types/promo';

function rupiah(n: number | undefined): string {
  return `Rp. ${Number(n || 0).toLocaleString('id-ID')}`;
}

/** Tanda potong di empat sudut lembar - murni dekoratif, jadi aria-hidden. */
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
          <div className="doc-sheet flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
            <span className="text-sm ui-text-muted">Memuat status batch…</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="doc-alert p-5" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Gagal memuat status batch.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              Pengajuan Anda tidak hilang. Sambungan ke server sedang bermasalah. Coba lagi sebentar lagi.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { void load(); }}
                className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold transition"
              >
                Coba lagi
              </button>
              <Link to="/riwayat" className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold">
                Lihat Riwayat Perangkat
              </Link>
            </div>
          </div>
        )}

        {!loading && notFound && (
          <div className="doc-alert p-5" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Pengajuan tidak ditemukan.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              Periksa kembali tautan status Anda. Tautan ini hanya berlaku untuk satu batch pengajuan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/riwayat" className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold transition">
                Lihat Riwayat Perangkat
              </Link>
            </div>
          </div>
        )}

        {!loading && data && (
          <div className="space-y-4">
            {/* Kepala tiket induk: nomor batch, pemohon, ringkasan biaya. */}
            <div className="doc-sheet overflow-hidden">
              <CropMarks />
              <div className="px-7 pt-7 pb-4">
                <span className="doc-plate-no">Tiket batch</span>
                <p className="doc-num mt-1 text-sm font-bold tracking-wide text-slate-900">
                  {data.batch.batch_number}
                </p>
                <h1 className="ui-title-card mt-1 text-slate-900">
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
              </div>

              {data.items.length > 0 && (
                <>
                  <div className="doc-perf" />
                  <div className="px-7 py-4">
                    {/* Total PPN / tagihan: blok perhitungan, bukan kartu. */}
                    <div className="doc-calc">
                      <div>
                        <div className="doc-calc-k">{labelPpn}</div>
                        <div className="doc-calc-v">{rupiah(totalPpn)}</div>
                      </div>
                      <div>
                        <div className="doc-calc-k">Total tagihan</div>
                        <div className="doc-calc-v" data-emphasis="true">{rupiah(total)}</div>
                      </div>
                    </div>
                    {adaTermasukPpn && adaBelumTermasukPpn && (
                      <p className="mt-2 text-xs ui-text-muted">
                        Sebagian media harganya sudah termasuk PPN dan sebagian belum; angka PPN di atas adalah
                        porsi PPN dari seluruh baris.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Daftar media dalam batch: baris dokumen bergaris, nomor job +
             * stempel status per baris. */}
            {data.items.length > 0 && (
              <div className="doc-sheet">
                <CropMarks />
                <div className="px-7 py-4">
                  <div className="flex items-baseline gap-4 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
                    <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">Media dalam batch</h2>
                    <span className="doc-plate-no ml-auto">{data.items.length} media dalam pengajuan ini</span>
                  </div>
                  <ul className="mt-3">
                    {data.items.map((it, i) => (
                      <li
                        key={it.submission.id}
                        className="flex items-baseline gap-3 border-b border-[color:var(--rule-color)] py-3 last:border-b-0"
                      >
                        {/* Nomor baris + nomor job dalam satu label mono: baris
                         * manifest terbaca seperti daftar plate (01, 02, ...),
                         * dan nomor job tetap utuh di dalamnya. */}
                        <span className="doc-num shrink-0 text-xs font-bold text-slate-900">
                          {`${String(i + 1).padStart(2, '0')} · ${it.submission.submission_number}`}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs ui-text-muted">
                          {it.submission.material_title || it.submission.media_type_slug}
                        </span>
                        <Stamp status={it.submission.status} className="shrink-0" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {data.items.map((it) => (
              <SubmissionDetail key={it.submission.id} data={it} onReload={load} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
