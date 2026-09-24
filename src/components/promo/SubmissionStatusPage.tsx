/**
 * Halaman status pengajuan via token - publik, tanpa login (FR-019..FR-022).
 *
 * Token adalah kredensial tautan tenant: halaman ini hanya menampilkan
 * pengajuan yang tokennya cocok. Seluruh isi detail dirender komponen bersama
 * `SubmissionDetail` (sama persis dengan halaman pelacakan nomor).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppShell from '../layout/AppShell';
import SubmissionDetail from './SubmissionDetail';
import { fetchStatusByToken, isNotFoundError } from '../../utils/promoApi';
import type { StatusPageData } from '../../types/promo';

export default function SubmissionStatusPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<StatusPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    try {
      setData(await fetchStatusByToken(token));
    } catch (err) {
      // Gagal memuat ≠ tidak ditemukan: hanya 404 yang berarti tautan tidak
      // cocok. Gangguan jaringan/503 ditampilkan sebagai galat yang bisa
      // dicoba ulang, bukan "Pengajuan tidak ditemukan".
      if (isNotFoundError(err)) setNotFound(true);
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  return (
    // Tujuan tombol kembali TIDAK bergantung pada riwayat perangkat: halaman
    // ini dibuka lewat tautan/token yang bisa datang dari PERANGKAT LAIN, dan
    // di perangkat itu `/riwayat` kosong ("Belum ada pengajuan dari perangkat
    // ini"), sehingga tenant mengira pengajuannya hilang. Dipilih beranda
    // (`/`) alih-alih kembali-satu-langkah browser karena tombol harus
    // berperilaku SAMA di setiap cara masuk: kembali-satu-langkah tidak punya
    // langkah untuk dimundurkan saat tautan dibuka LANGSUNG (kasus utama
    // perangkat lain), sedangkan beranda selalu ada dan memberi jalan lanjut.
    // Lihat `StatusPageTombolKembali.test.tsx`.
    <AppShell title="Status Pengajuan" back backTo="/">
      <div className="mx-auto max-w-2xl px-4 py-5">
        {loading && (
          <div className="doc-sheet flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
            <span className="text-sm ui-text-muted">Memuat status pengajuan…</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="doc-alert p-5" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Gagal memuat status pengajuan.</p>
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
              <Link to="/lacak" className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold">
                Lacak dengan Nomor Pengajuan
              </Link>
            </div>
          </div>
        )}

        {!loading && notFound && (
          <div className="doc-alert p-5" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Pengajuan tidak ditemukan.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              Periksa kembali tautan status Anda. Tautan ini hanya berlaku untuk satu pengajuan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/lacak" className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold transition">
                Lacak dengan Nomor Pengajuan
              </Link>
              <Link to="/riwayat" className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold">
                Lihat Riwayat Perangkat
              </Link>
            </div>
          </div>
        )}

        {!loading && data && <SubmissionDetail data={data} onReload={load} />}
      </div>
    </AppShell>
  );
}
