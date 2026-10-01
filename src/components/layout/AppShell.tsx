/**
 * App shell - kerangka tetap seluruh layar tenant.
 *
 * Menyusun: top app bar (sticky) + area konten yang menggulir sendiri +
 * bottom tab bar (mobile). Hanya area konten yang menggulir, sehingga bar
 * tidak pernah bergeser - perilaku yang membedakan aplikasi dari dokumen.
 */
import type { ReactNode } from 'react';
import BottomTabBar from './BottomTabBar';
import TopAppBar from './TopAppBar';
import TopNav from './TopNav';
import { useMediaQuery } from './useMediaQuery';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const SCROLL_ID = 'app-scroll';

/** Ambang yang sama dengan aturan CSS `.app-tabbar`/`.app-nav` di `base.css`. */
const DESKTOP_QUERY = '(min-width: 640px)';

interface AppShellProps {
  children: ReactNode;
  /** Judul di app bar; kosong = wordmark. */
  title?: string;
  /** Tampilkan tombol kembali di app bar. */
  back?: boolean;
  /** Tujuan tombol kembali. */
  backTo?: string;
  /** Handler kembali kustom (mis. memundurkan langkah wizard). */
  onBack?: () => void;
  /** Aksi kanan app bar. */
  actions?: ReactNode;
  /** Sembunyikan tab bar (mis. alur wizard yang fokus). */
  hideTabBar?: boolean;
}

export default function AppShell({
  children,
  title,
  back,
  backTo,
  onBack,
  actions,
  hideTabBar,
}: AppShellProps) {
  // Desktop: navigasi pindah ke app bar; mobile: tab bar bawah. Hanya satu yang
  // dirender agar tidak ada dua landmark `nav` bernama sama di DOM.
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const showNav = !hideTabBar;

  // Judul dokumen mengikuti judul layar (lihat useDocumentTitle). Layar tanpa
  // judul - beranda - memakai nama produk saja.
  useDocumentTitle(title ?? '');

  return (
    <div className="app-shell">
      <TopAppBar
        title={title}
        back={back}
        backTo={backTo}
        onBack={onBack}
        actions={actions}
        nav={showNav && desktop ? <TopNav /> : undefined}
        scrollTargetId={SCROLL_ID}
      />

      <main id={SCROLL_ID} className="app-scroll" data-tabbar={showNav ? 'on' : 'off'}>
        {children}
      </main>

      {showNav && !desktop && <BottomTabBar />}
    </div>
  );
}
