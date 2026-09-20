import { Navigate, Route, Routes } from 'react-router-dom';
import PromoLandingPage from './components/promo/PromoLandingPage';
import PromoUploadWizard from './components/promo/PromoUploadWizard';
import PromoCetakWizard from './components/promo/PromoCetakWizard';
import BatchStatusPage from './components/promo/BatchStatusPage';
import MySubmissionsPage from './components/promo/MySubmissionsPage';
import SubmissionStatusPage from './components/promo/SubmissionStatusPage';
import TrackSubmissionPage from './components/promo/TrackSubmissionPage';
import AdminLoginPage from './components/admin/AdminLoginPage';
import AdminDashboardPage from './components/admin/AdminDashboardPage';

export default function App() {
  return (
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
  );
}
