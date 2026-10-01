/**
 * Halaman status batch pengajuan cetak - publik, tanpa login.
 *
 * Token batch adalah kredensial tautan: halaman ini hanya menampilkan batch
 * yang tokennya cocok. Batch dibaca sebagai SATU daftar kerja: nomor batch
 * mono, daftar media sebagai baris-baris daftar (nomor pengajuan + stempel
 * status per baris), dan ringkasan biaya sebagai blok perhitungan. Isi tiap
 * media dirender komponen bersama `SubmissionDetail` (sama persis dengan
 * halaman status per-pengajuan), sehingga tidak ada bentuk tampilan yang
 * menyimpang antar jalur publik.
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
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-hidden="true" />
            <span className="ui-dense ui-text-muted">Memuat status batch…</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="ui-alert p-5" role="alert">
            <p className="ui-dense font-semibold text-red-800">Gagal memuat status batch.</p>
            <p className="ui-meta text-red-700 mt-1">
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
          <div className="ui-alert p-5" role="alert">
            <p className="ui-dense font-semibold text-red-800">Pengajuan tidak ditemukan.</p>
            <p className="ui-meta text-red-700 mt-1">
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
            {/* Kepala batch: nomor batch, pemohon, ringkasan biaya. */}
            <div className="ui-card overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <span className="ui-label">Tiket batch</span>
                <p className="ui-num mt-1 text-sm font-medium">
                  {data.batch.batch_number}
                </p>
                <h1 className="ui-title-card mt-1">
                  {data.batch.applicant_name}
                </h1>
                <p className="ui-meta ui-text-muted mt-0.5">
                  {APPLICANT_TYPE_LABELS[data.batch.applicant_type] ?? data.batch.applicant_type}
                  {data.batch.unit_number ? ` · Unit ${data.batch.unit_number}` : ''}
                  {data.batch.submission_date ? ` · Diajukan ${data.batch.submission_date}` : ''}
                </p>
                {data.batch.notes && (
                  <p className="ui-meta text-slate-600 mt-2 leading-relaxed">{data.batch.notes}</p>
                )}
              </div>

              {data.items.length > 0 && (
                <>
                  <div className="ui-rule" />
                  <div className="px-5 py-4">
                    {/* Total PPN / tagihan: blok perhitungan, bukan kartu. */}
                    <div className="ui-calc">
                      <div>
                        <div className="ui-calc-k">{labelPpn}</div>
                        <div className="ui-calc-v">{rupiah(totalPpn)}</div>
                      </div>
                      <div>
                        <div className="ui-calc-k">Total tagihan</div>
                        <div className="ui-calc-v" data-emphasis="true">{rupiah(total)}</div>
                      </div>
                    </div>
                    {adaTermasukPpn && adaBelumTermasukPpn && (
                      <p className="ui-meta ui-text-muted mt-2">
                        Sebagian media harganya sudah termasuk PPN dan sebagian belum; angka PPN di atas adalah
                        porsi PPN dari seluruh baris.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Daftar media dalam batch: satu baris daftar per media, dengan
             * nomor pengajuan mono dan stempel statusnya sendiri. */}
            {data.items.length > 0 && (
              <div className="ui-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="ui-title-section">Media dalam batch</h2>
                  <span className="ui-meta ui-text-muted">{data.items.length} media dalam pengajuan ini</span>
                </div>
                <ul className="mt-1">
                  {data.items.map((it, i) => (
                    <li key={it.submission.id} className="ui-row">
                      <div className="ui-row-main">
                        <div className="ui-row-head">
                          <span className="ui-title-row">
                            {it.submission.material_title || it.submission.media_type_slug}
                          </span>
                          <Stamp status={it.submission.status} className="shrink-0" />
                        </div>
                        {/* Nomor urut + nomor pengajuan dalam satu label mono:
                         * baris daftar tetap terbaca berurutan (01, 02, ...),
                         * dan nomor pengajuan tetap utuh di dalamnya. */}
                        <p className="ui-num ui-meta ui-text-muted mt-0.5">
                          {`${String(i + 1).padStart(2, '0')} · ${it.submission.submission_number}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
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
