/**
 * Bottom tab bar — navigasi utama sisi tenant, hanya di mobile.
 *
 * Di layar lebar tab bar bawah terasa asing, jadi disembunyikan. Aturan
 * penyembunyian ada di `base.css` (`@media (min-width: 640px)`) — bukan
 * utilitas `sm:hidden` di sini, karena `display: grid` pada `.app-tabbar`
 * mengalahkan utilitas Tailwind tersebut.
 */
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, FilePlus2, ClipboardList } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Katalog', Icon: LayoutGrid },
  { to: '/ajukan', label: 'Ajukan', Icon: FilePlus2 },
  { to: '/riwayat', label: 'Riwayat', Icon: ClipboardList },
];

export default function BottomTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="app-tabbar" aria-label="Navigasi utama">
      {TABS.map(({ to, label, Icon }) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
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
