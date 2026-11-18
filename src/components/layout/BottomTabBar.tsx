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
import { NAV_ITEMS, FAB_ITEM, isNavItemActive } from './navItems';

/**
 * Tab bar tenant: empat tujuan + FAB "Ajukan" di tengah (IA prototype).
 * Urutan NAV_ITEMS = [Beranda, Katalog, Riwayat, Lacak]; tab pertama (kiri)
 * Beranda+Katalog, tab kedua (kanan) Riwayat+Lacak, FAB di antaranya.
 */
export default function BottomTabBar() {
  const { pathname } = useLocation();
  const left = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);

  return (
    <nav className="app-tabbar" aria-label="Navigasi utama">
      {left.map(({ to, label, Icon }) => (
        <Tab key={to} to={to} label={label} Icon={Icon} pathname={pathname} />
      ))}
      <Link
        to={FAB_ITEM.to}
        className="app-fab app-pressable ui-focus-ring"
        aria-label={`${FAB_ITEM.label} materi baru`}
      >
        <FAB_ITEM.Icon className="h-6 w-6" aria-hidden="true" strokeWidth={2} />
      </Link>
      {right.map(({ to, label, Icon }) => (
        <Tab key={to} to={to} label={label} Icon={Icon} pathname={pathname} />
      ))}
    </nav>
  );
}

function Tab({ to, label, Icon, pathname }: {
  to: string; label: string; Icon: typeof NAV_ITEMS[number]['Icon']; pathname: string;
}) {
  const active = isNavItemActive(to, pathname);
  return (
    <Link
      to={to}
      className="app-tab app-pressable ui-focus-ring"
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={active ? 2.4 : 1.8} />
      {label}
    </Link>
  );
}
