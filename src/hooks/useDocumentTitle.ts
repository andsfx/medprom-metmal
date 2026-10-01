/**
 * useDocumentTitle - menyetel judul dokumen per layar.
 *
 * Sebelumnya seluruh rute berjudul sama ("Media Promosi Metropolitan Mall
 * Bekasi"): terukur 2026-09-30 pada `/`, `/ajukan`, `/ajukan-cetak`,
 * `/riwayat`, `/lacak`, dan `/login`. Karena ini PWA, judul tidak muncul di
 * UI aplikasi - tetapi ia tetap muncul di riwayat peramban, daftar tab, dan
 * penanda, sehingga riwayat tanpa judul layar membuat pengguna kehilangan
 * penanda saat berpindah-pindah. Tanpa hook ini setiap halaman harus
 * mengingat `useEffect`-nya sendiri, dan halaman baru pasti terlewat.
 *
 * Judul lama dipulihkan saat unmount agar tidak tertinggal pada layar yang
 * tidak memakai hook ini (mis. konsol staf punya judulnya sendiri).
 */
import { useEffect } from 'react';

/** Nama produk yang tampil di setiap judul layar. */
export const APP_TITLE_SUFFIX = 'Media Promosi Metropolitan Mall Bekasi';

/**
 * @param title Judul layar; string kosong = pakai nama produk saja (beranda).
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${APP_TITLE_SUFFIX}` : APP_TITLE_SUFFIX;
    return () => { document.title = previous; };
  }, [title]);
}
