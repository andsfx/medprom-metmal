/**
 * Daftar tujuan navigasi utama sisi tenant.
 *
 * Satu sumber kebenaran untuk dua penyaji: `BottomTabBar` (mobile) dan
 * `TopNav` (desktop, di dalam app bar). Sebelumnya daftar ini hanya hidup di
 * tab bar, sehingga menambah tujuan (mis. `/lacak`) hanya muncul di mobile -
 * desktop kehilangan jalan ke halaman baru. Jangan duplikasi daftar ini.
 */
import { LayoutGrid, FilePlus2, ClipboardList, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Katalog', Icon: LayoutGrid },
  { to: '/ajukan', label: 'Ajukan', Icon: FilePlus2 },
  { to: '/lacak', label: 'Lacak', Icon: Search },
  { to: '/riwayat', label: 'Riwayat', Icon: ClipboardList },
];

/**
 * Rute dianggap aktif bila cocok persis (`/`) atau berawalan (`/lacak`).
 *
 * Dipakai bersama oleh tab bar mobile, navigasi desktop, dan test - tiga
 * pemanggil yang wajib berperilaku identik. Aturan cocok-persis untuk `/`
 * mudah salah bila disalin ulang ( `/` berawalan setiap rute).
 */
export function isNavItemActive(to: string, pathname: string): boolean {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}
