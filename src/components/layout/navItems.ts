/**
 * Daftar tujuan navigasi utama sisi tenant.
 *
 * Satu sumber kebenaran untuk dua penyaji: `BottomTabBar` (mobile) dan
 * `TopNav` (desktop, di dalam app bar). Sebelumnya daftar ini hanya hidup di
 * tab bar, sehingga menambah tujuan (mis. `/lacak`) hanya muncul di mobile -
 * desktop kehilangan jalan ke halaman baru. Jangan duplikasi daftar ini.
 *
 * Struktur mengikuti prototype Open Design: Beranda + Katalog di kiri FAB,
 * Riwayat + Lacak di kanan. `BottomTabBar` merender FAB (`/ajukan`) di tengah
 * dari konstanta terpisah supaya tata letaknya (dua-tab-kiri/dua-tab-kanan)
 * tidak tergantung urutan array ini.
 */
import { LayoutGrid, ClipboardList, Search, House } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Beranda', Icon: House },
  { to: '/katalog', label: 'Katalog', Icon: LayoutGrid },
  { to: '/riwayat', label: 'Riwayat', Icon: ClipboardList },
  { to: '/lacak', label: 'Lacak', Icon: Search },
];

/** Tujuan FAB tengah tab bar (ajukan materi baru). */
export const FAB_ITEM: NavItem = { to: '/ajukan', label: 'Ajukan', Icon: LayoutGrid };

/**
 * Rute dianggap aktif bila cocok persis (`/`) atau berawalan (`/lacak`).
 *
 * Dipakai bersama oleh tab bar mobile, navigasi desktop, dan test - tiga
 * pemanggil yang wajib berperilaku identik. Aturan cocok-persis untuk `/`
 * mudah salah bila disalin ulang ( `/` berawalan setiap rute); `/katalog`
 * ikut berawalan sehingga memakai aturan yang sama.
 */
export function isNavItemActive(to: string, pathname: string): boolean {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}