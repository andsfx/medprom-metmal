/**
 * Navigasi utama versi desktop - hidup di dalam app bar.
 *
 * Kontrak desain (`DESIGN.md`): "Tab bar hanya mobile (`< 640px`). Di desktop
 * navigasi ada di app bar." Sebelum ini, tab bar mobile menyembunyikan dirinya
 * di layar lebar tanpa pengganti, sehingga tujuan seperti `/lacak` tidak punya
 * jalan masuk sama sekali di desktop.
 *
 * Penyembunyian di mobile dilakukan CSS (`.app-nav`), bukan `hidden` Tailwind,
 * supaya simetris dengan aturan `.app-tabbar` dan bebas urutan utilitas.
 */
import { Link, useLocation } from 'react-router-dom';
import { NAV_ITEMS, isNavItemActive } from './navItems';

export default function TopNav() {
  const { pathname } = useLocation();

  return (
    <nav className="app-nav" aria-label="Navigasi utama">
      {NAV_ITEMS.map(({ to, label, Icon }) => {
        const active = isNavItemActive(to, pathname);
        return (
          <Link
            key={to}
            to={to}
            className="app-nav-link app-pressable ui-focus-ring"
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={active ? 2.4 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
