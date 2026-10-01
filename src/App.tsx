/**
 * Tabel rute aplikasi.
 *
 * Setiap halaman dimuat **malas** (`React.lazy`) supaya bundel awal hanya berisi
 * kerangka + halaman yang benar-benar dibuka. Sebelumnya kesepuluh halaman
 * diimpor statis, sehingga setiap pengunjung beranda ikut mengunduh konsol staf
 * (`AdminDashboardPage`, ~2.380 baris) dan kedua wizard - padahal mayoritas
 * pengunjung publik tidak pernah membukanya. Aturan skill `bundle-splitting`
 * (Performance, HIGH).
 *
 * Konsol staf tidak lagi bocor ke bundel publik: hanya diunduh saat `/admin`
 * dibuka. Ini bukan pengamanan (kode tetap bisa diunduh siapa pun yang meminta
 * chunk-nya; otorisasi nyata ada di server), melainkan penghematan unduhan.
 *
 * `Suspense` dipasang sekali di sekitar `<Routes>` dengan fallback yang sama
 * untuk semua rute, mengikuti pola status pemuatan yang sudah dipakai repo
 * (`role="status"` + ikon berputar + teks untuk pembaca layar).
 */
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const PromoLandingPage = lazy(() => import('./components/promo/PromoLandingPage'));
const PromoUploadWizard = lazy(() => import('./components/promo/PromoUploadWizard'));
const PromoCetakWizard = lazy(() => import('./components/promo/PromoCetakWizard'));
const BatchStatusPage = lazy(() => import('./components/promo/BatchStatusPage'));
const MySubmissionsPage = lazy(() => import('./components/promo/MySubmissionsPage'));
const SubmissionStatusPage = lazy(() => import('./components/promo/SubmissionStatusPage'));
const TrackSubmissionPage = lazy(() => import('./components/promo/TrackSubmissionPage'));
const AdminLoginPage = lazy(() => import('./components/admin/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./components/admin/AdminDashboardPage'));

/**
 * Tampilan selagi chunk rute diunduh.
 *
 * `.app-canvas` sudah memusatkan isi dan tetap dapat menggulir; statusnya
 * diumumkan lewat `role="status"` supaya pengguna pembaca layar tahu halaman
 * sedang dimuat, bukan kosong.
 */
function RouteFallback() {
  return (
    <div className="app-shell">
      <main className="app-canvas" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-brand-primary-600" aria-hidden="true" />
        <span className="sr-only">Memuat…</span>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<PromoLandingPage />} />
        <Route path="/ajukan" element={<PromoUploadWizard />} />
        <Route path="/ajukan-cetak" element={<PromoCetakWizard />} />
        <Route path="/batch/:token" element={<BatchStatusPage />} />
        <Route path="/riwayat" element={<MySubmissionsPage />} />
        <Route path="/lacak" element={<TrackSubmissionPage />} />
        <Route path="/status/:token" element={<SubmissionStatusPage />} />
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
