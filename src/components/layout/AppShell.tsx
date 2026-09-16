/**
 * App shell — kerangka tetap seluruh layar tenant.
 *
 * Menyusun: top app bar (sticky) + area konten yang menggulir sendiri +
 * bottom tab bar (mobile). Hanya area konten yang menggulir, sehingga bar
 * tidak pernah bergeser — perilaku yang membedakan aplikasi dari dokumen.
 */
import type { ReactNode } from 'react';
import BottomTabBar from './BottomTabBar';
import TopAppBar from './TopAppBar';

const SCROLL_ID = 'app-scroll';

interface AppShellProps {
  children: ReactNode;
  /** Judul di app bar; kosong = wordmark. */
  title?: string;
  /** Tampilkan tombol kembali di app bar. */
  back?: boolean;
  /** Tujuan tombol kembali. */
  backTo?: string;
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
  actions,
  hideTabBar,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopAppBar
        title={title}
        back={back}
        backTo={backTo}
        actions={actions}
        scrollTargetId={SCROLL_ID}
      />

      <main id={SCROLL_ID} className="app-scroll" data-tabbar={hideTabBar ? 'off' : 'on'}>
        {children}
      </main>

      {!hideTabBar && <BottomTabBar />}
    </div>
  );
}
