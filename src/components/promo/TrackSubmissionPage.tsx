/**
 * Halaman pelacakan pengajuan lewat nomor `MP-YYMMDD-XXXXXX` - publik.
 *
 * Jalur kedua selain tautan ber-token: nomor pengajuan dibacakan ke PIC di
 * layar sukses (dan tampil di Riwayat), jadi tenant yang kehilangan tautan
 * tetap bisa memantau prosesnya tanpa akun. Untuk mencegah nomor dipanen
 * otomatis, pengiriman dijaga captcha Cloudflare Turnstile - token wajib
 * selesai sebelum tombol Lacak bisa ditekan, dan diverifikasi ulang di server.
 *
 * Isi detailnya sama persis dengan halaman status ber-token
 * (komponen `SubmissionDetail`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import AppShell from '../layout/AppShell';
import SubmissionDetail from './SubmissionDetail';
import TurnstileWidget from '../ui/Turnstile';
import { fetchStatusByNumber } from '../../utils/promoApi';
import type { StatusPageData } from '../../types/promo';

export default function TrackSubmissionPage() {
  const [number, setNumber] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [data, setData] = useState<StatusPageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Nomor yang terakhir berhasil dilacak - dipakai saat memuat ulang setelah
  // revisi, agar isian yang sedang diketik tidak mengubah target.
  const [searched, setSearched] = useState('');
  // Token Turnstile sekali pakai: setiap pengiriman menaikkan kunci ini agar
  // widget memasang token segar untuk pencarian berikutnya.
  const [captchaKey, setCaptchaKey] = useState(0);
  // Nomor yang menunggu token captcha berikutnya (muat ulang setelah revisi).
  const [pendingReload, setPendingReload] = useState<string | null>(null);
  // Sitekey Turnstile; '' = captcha tidak dikonfigurasi (server pun melewatinya).
  const siteKey = String(
    (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '',
  ).trim();

  const search = useCallback(async (raw: string, token: string) => {
    const q = raw.trim();
    if (!q) {
      setError('Masukkan nomor pengajuan terlebih dahulu.');
      return;
    }
    setLoading(true);
    setError('');
    // Token sekali pakai - buang setelah dipakai (berhasil maupun gagal) supaya
    // percobaan berikutnya memakai token baru, bukan token yang sudah terpakai.
    setCaptchaKey((k) => k + 1);
    try {
      const result = await fetchStatusByNumber(q, token);
      setData(result);
      setSearched(q);
    } catch (err) {
      // Pesan server sudah informatif (format salah / tidak ditemukan / captcha
      // gagal) - teruskan apa adanya, jangan ganti dengan teks generik.
      setData(null);
      setError(err instanceof Error ? err.message : 'Gagal melacak pengajuan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Muat ulang detail setelah revisi. Token captcha bersifat sekali pakai, jadi
   * muat ulang pun butuh token segar: nomor ditahan di `pendingReload` dan
   * pencarian baru dijalankan begitu widget menghasilkan token berikutnya
   * (tanpa captcha, langsung jalan).
   */
  const reload = useCallback(() => setPendingReload(searched), [searched]);

  useEffect(() => {
    if (!pendingReload) return;
    if (!captchaToken && siteKey) return;
    setPendingReload(null);
    void search(pendingReload, captchaToken);
  }, [pendingReload, captchaToken, siteKey, search]);

  const captchaBlocked = Boolean(siteKey) && !captchaToken;
  const hasilRef = useRef<HTMLDivElement>(null);
  const hasilFokusRef = useRef<string>('');

  // Setelah hasil tiba, gulirkan detail ke layar dan pindahkan fokus ke
  // judulnya. Tanpa ini, di layar pendek detail muncul DI BAWAH lipatan dan
  // pengguna hanya melihat formulir yang sama - tidak ada tanda apa pun bahwa
  // pencariannya berhasil (terukur: area gulir tetap di scrollTop 0).
  // Fokus hanya diambil saat pengajuan yang ditampilkan BERGANTI, supaya muat
  // ulang setelah kirim revisi tidak merampas fokus dari form revisi.
  useEffect(() => {
    const id = data?.submission?.id ?? '';
    if (!id || id === hasilFokusRef.current) return;
    hasilFokusRef.current = id;
    const el = hasilRef.current;
    if (!el) return;
    el.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }, [data]);

  return (
    <AppShell title="Lacak Pengajuan">
      <div className="mx-auto max-w-2xl px-4 py-5">
        <div className="ui-card p-5">
          <h2 className="ui-title-card text-slate-900 dark:text-white">Lacak dengan Nomor Pengajuan</h2>
          <p className="mt-2 text-xs ui-text-muted">
            Masukkan nomor pengajuan yang Anda terima setelah mengirim materi. Formatnya seperti
            <span className="font-mono font-semibold"> MP-260918-A7K2QX</span>. Tidak perlu akun.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); void search(number, captchaToken); }}
            className="mt-4"
          >
            <label htmlFor="track-number" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Nomor Pengajuan
            </label>
            <input
              id="track-number"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              value={number}
              placeholder="MP-260918-A7K2QX"
              onChange={(e) => { setNumber(e.target.value.toUpperCase()); setError(''); }}
              className="ui-control w-full rounded-md px-3 py-2.5 font-mono text-sm tracking-wide text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
            />

            <TurnstileWidget onToken={setCaptchaToken} resetKey={captchaKey} action="track" />

            {error && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || captchaBlocked}
              className="ui-btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Melacak…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Lacak
                </>
              )}
            </button>

            {captchaBlocked && (
              <p className="mt-2 text-xs ui-text-muted">
                {pendingReload
                  ? 'Selesaikan verifikasi captcha untuk memuat status terbaru.'
                  : 'Selesaikan verifikasi captcha di atas untuk mengaktifkan tombol Lacak.'}
              </p>
            )}
          </form>

          <p className="mt-3 text-xs ui-text-muted">
            Nomor juga tersimpan di{' '}
            <Link to="/riwayat" className="font-semibold text-brand-primary-700 dark:text-brand-primary-300">
              Riwayat
            </Link>{' '}
            pada perangkat ini.
          </p>
        </div>

        {/* `tabIndex={-1}`: kontainer hasil difokuskan secara programatis
         * setelah pencarian berhasil, agar pembaca layar langsung
         * membacakan status pengajuan yang baru dimuat. */}
        {data && (
          <div className="mt-4" ref={hasilRef} tabIndex={-1} aria-label="Hasil pelacakan">
            <SubmissionDetail data={data} onReload={reload} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
