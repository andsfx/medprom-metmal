/**
 * Riwayat pengajuan per perangkat - publik (fingerprint = identitas soft).
 *
 * Setiap baris dibaca sebagai TIKET PEKERJAAN: nomor job monospace di kepala
 * tiket, stempel status, tepi perforasi, lalu isi tiket (kiriman batch,
 * catatan TR, tautan). Baris yang berasal dari satu kirim form cetak membawa
 * `batch_number` dan `batch_token` (hanya endpoint ini yang mengirimkannya;
 * lihat komentar di `server/src/routes/promo.js`). Keduanya ditampilkan
 * supaya tenant yang mengirim beberapa media dalam satu kali kirim bisa
 * mengenali bahwa tiket-tiket itu satu kiriman, dan tetap punya jalan kembali
 * ke `/batch/<batch_token>` setelah meninggalkan layar sukses wizard.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Info, Layers, Loader2 } from 'lucide-react';
import AppShell from '../layout/AppShell';
import Stamp from './Stamp';
import { fetchMySubmissions, normalizeMySubmissions } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { MY_SUBMISSIONS_PAGE_SIZE } from '../../constants/promo';
import type { MySubmissionRow } from '../../types/promo';

export default function MySubmissionsPage() {
  const [rows, setRows] = useState<MySubmissionRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [moreError, setMoreError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fp = getDeviceFingerprint();
    fetchMySubmissions(fp)
      .then((r) => {
        if (cancelled) return;
        // Bentuk LAMA (array polos) tetap diterima - paginasi ini aditif.
        const hasil = normalizeMySubmissions(r);
        setRows(hasil.rows);
        setTotal(hasil.total);
      })
      // Gagal memuat ≠ tidak ada pengajuan: tanpa pembedaan ini tenant
      // mengira pengajuannya hilang (lihat komentar `fetchMySubmissions`).
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Pemuatan halaman berikutnya MENAMBAH ke daftar, bukan menggantinya.
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const r = normalizeMySubmissions(
        await fetchMySubmissions(getDeviceFingerprint(), rows.length),
      );
      // Dedup per id supaya baris baru tidak tampil dua kali bila server
      // bergeser (pengajuan baru masuk di antara dua permintaan).
      setRows((prev) => {
        const ada = new Set(prev.map((x) => x.id));
        return [...prev, ...r.rows.filter((x) => !ada.has(x.id))];
      });
      setTotal(r.total);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  // "Masih ada sisa" hanya bila kita punya bukti: `total` dari server, atau
  // heuristik halaman penuh untuk server versi lama yang tidak mengirim
  // `total`. Tanpa keduanya, tombol tidak ditampilkan (tidak menebak).
  const totalTersedia = typeof total === 'number';
  const adaSisa = totalTersedia
    ? rows.length < total
    : rows.length === MY_SUBMISSIONS_PAGE_SIZE;

  return (
    <AppShell title="Riwayat Pengajuan">
      <div className="mx-auto max-w-2xl px-4 py-5">
        <p className="ui-prose ui-body mb-4 flex items-start gap-1.5 ui-text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Riwayat terikat pada browser/perangkat ini. Mengganti perangkat atau membersihkan data
          browser akan menghilangkan akses ke riwayat.
        </p>

        <div>
            {loading && (
              <div className="ui-card flex items-center justify-center gap-3 py-10" role="status">
                <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
                <span className="text-sm ui-text-muted">Memuat riwayat…</span>
              </div>
            )}

            {!loading && loadError && (
              <div className="ui-alert p-5" role="alert">
                <p className="text-sm font-semibold text-red-800">Gagal memuat riwayat pengajuan.</p>
                <p className="mt-1 text-xs text-red-700">
                  Riwayat Anda tidak hilang. Sambungan ke server sedang bermasalah. Muat ulang
                  halaman atau coba lagi sebentar.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/lacak" className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold transition">
                    Lacak dengan Nomor
                  </Link>
                </div>
              </div>
            )}

            {!loading && !loadError && rows.length === 0 && (
              <div className="ui-card px-6 py-10">
                <p className="text-sm font-semibold text-slate-700">Belum ada pengajuan dari perangkat ini.</p>
                <p className="mt-1 text-xs ui-text-muted">Ajukan materi promosi pertama Anda. Pilih media yang sesuai, lalu kirim materinya.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link to="/ajukan" className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold transition">
                    Ajukan Materi
                  </Link>
                  <Link to="/lacak" className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold">
                    Lacak dengan Nomor
                  </Link>
                </div>
              </div>
            )}

            {!loading && rows.length > 0 && (
              <>
              {adaSisa && (
                <p className="mb-3 text-xs ui-text-muted" role="status">
                  {totalTersedia
                    ? `Menampilkan ${rows.length} dari ${total} pengajuan terbaru.`
                    : `Menampilkan ${rows.length} pengajuan terbaru.`}
                </p>
              )}
              <ul className="space-y-4">
                {rows.map((r) => (
                  <li key={r.id} className="ui-card overflow-hidden">
                    {/* Kepala tiket: nomor job monospace + stempel status. */}
                    <div className="px-7 pt-7 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="ui-num text-xs font-bold tracking-wide text-slate-900">
                            {r.submission_number}
                          </p>
                          <p className="ui-title-card mt-0.5 ui-text-strong">
                            {r.material_title || r.media_type_slug}
                          </p>
                          <p className="ui-num mt-0.5 text-xs ui-text-muted">
                            {r.created_at ? new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                          </p>
                        </div>
                        <Stamp status={r.status} className="shrink-0" />
                      </div>
                    </div>


                    <div className="px-7 py-4">
                      {r.batch_number && (
                        <div className="border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-2.5">
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-700">
                            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>Nomor batch:</span>
                            <span className="ui-num font-bold tracking-wide">{r.batch_number}</span>
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
                            {typeof r.batch_item_count === 'number' && r.batch_item_count > 1
                              ? `Pengajuan ini bagian dari satu kirim berisi beberapa media (${r.batch_item_count} media dalam kiriman ini).`
                              : typeof r.batch_item_count === 'number' && r.batch_item_count === 1
                                ? 'Pengajuan ini bagian dari satu kiriman (1 media dalam kiriman ini).'
                                : 'Pengajuan ini bagian dari satu kirim berisi beberapa media.'}
                          </p>
                          {r.batch_token && (
                            <Link
                              to={`/batch/${r.batch_token}`}
                              className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-primary-700 transition hover:text-brand-primary-800"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              Lihat status batch
                            </Link>
                          )}
                        </div>
                      )}
                      {r.review_notes && (
                        <p className="mt-3 text-xs leading-relaxed text-slate-600">
                          <span className="font-semibold">Catatan TR: </span>{r.review_notes}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {(r.source_type === 'link' ? r.link_url : r.file_url) && (
                          <a
                            href={r.source_type === 'link' ? r.link_url : r.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-brand-primary-700 transition hover:text-brand-primary-800"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            {r.source_type === 'link' ? 'Buka tautan materi' : 'Lihat file materi'}
                          </a>
                        )}
                        {r.status_token && (
                          <Link
                            to={`/status/${r.status_token}`}
                            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-primary-700 transition hover:text-brand-primary-800"
                          >
                            Lihat status & kirim revisi
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {adaSisa && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void loadMore(); }}
                    disabled={loadingMore}
                    className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {loadingMore ? 'Memuat…' : 'Muat lagi'}
                  </button>
                  {moreError && (
                    <p className="text-xs font-medium text-red-600" role="alert">
                      Gagal memuat pengajuan berikutnya. Coba lagi sebentar.
                    </p>
                  )}
                </div>
              )}
              </>
            )}
        </div>
      </div>
    </AppShell>
  );
}
