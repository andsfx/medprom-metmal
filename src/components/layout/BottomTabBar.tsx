/**
 * Bottom tab bar - navigasi utama sisi tenant, hanya di mobile.
 *
 * Di layar lebar tab bar bawah terasa asing, jadi disembunyikan. Aturan
 * penyembunyian ada di `base.css` (`@media (min-width: 640px)`) - bukan
 * utilitas `sm:hidden` di sini, karena `display: grid` pada `.app-tabbar`
 * mengalahkan utilitas Tailwind tersebut.
 *
 * Di desktop, tujuan yang sama disajikan `TopNav` di dalam app bar
 * (lihat `DESIGN.md`: "Tab bar hanya mobile; di desktop navigasi ada di app
 * bar"). Keduanya membaca `NAV_ITEMS` agar tidak pernah lepas sinkron.
 */
import { Link, useLocation } from 'react-router-dom';
import { NAV_ITEMS, isNavItemActive } from './navItems';

export default function BottomTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="app-tabbar" aria-label="Navigasi utama">
      {NAV_ITEMS.map(({ to, label, Icon }) => {
        const active = isNavItemActive(to, pathname);
        return (
          <Link
            key={to}
            to={to}
            className="app-tab app-pressable ui-focus-ring"
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={active ? 2.4 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
