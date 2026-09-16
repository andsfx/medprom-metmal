import { Navigate, Route, Routes } from 'react-router-dom';
import PromoLandingPage from './components/promo/PromoLandingPage';
import PromoUploadWizard from './components/promo/PromoUploadWizard';
import MySubmissionsPage from './components/promo/MySubmissionsPage';
import SubmissionStatusPage from './components/promo/SubmissionStatusPage';
import AdminLoginPage from './components/admin/AdminLoginPage';
import AdminDashboardPage from './components/admin/AdminDashboardPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PromoLandingPage />} />
      <Route path="/ajukan" element={<PromoUploadWizard />} />
      <Route path="/riwayat" element={<MySubmissionsPage />} />
      <Route path="/status/:token" element={<SubmissionStatusPage />} />
      <Route path="/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
