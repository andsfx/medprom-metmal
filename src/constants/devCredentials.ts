/**
 * Kredensial akun staf untuk **tahap pengembangan**.
 *
 * Selama pengembangan, halaman login menampilkan daftar akun staf beserta
 * password defaultnya supaya tim TR bisa masuk tanpa menebak. Password default
 * seragam: `admin123` (di-seed ke produksi lewat `create-admin.mjs --reset`).
 *
 * ️ Ini adalah disklosur kredensial ke siapa pun yang membuka /login. Karena
 * itu tampilannya **opt-out lewat env**, pola yang sama dengan
 * `isUploadModeEnabled` di `./promo.ts`: sebelum dipakai publik, set
 * `VITE_PROMO_SHOW_DEV_LOGIN='0'` lalu build + deploy ulang (nilai VITE_*
 * di-inline saat build, bukan dibaca runtime). Saat flag mati, panelnya tidak
 * dirender sama sekali. Kode kredensial tetap ikut ter-bundle - flag hanya
 * menggerbangi perenderan, jadi **jangan** mengandalkan tree-shaking.
 *
 * Ganti password akun nyata sebelum go-live: `create-admin.mjs --reset`.
 */

export type DevAccount = {
  email: string;
  role: string;
  /** Label peran berbahasa Indonesia untuk ditampilkan di UI. */
  roleLabel: string;
  /** Keterangan singkat hak akses, memakai istilah PRD. */
  note: string;
};

/** Password default semua akun staf di tahap pengembangan. */
export const DEV_LOGIN_PASSWORD = 'admin123';

/** Akun staf yang ditampilkan di halaman login. */
export const DEV_ACCOUNTS: DevAccount[] = [
  {
    email: 'super@metmal.co.id',
    role: 'superadmin',
    roleLabel: 'Superadmin',
    note: 'Akses penuh, termasuk kelola akun',
  },
  {
    email: 'tr@metmal.co.id',
    role: 'admin',
    roleLabel: 'Admin',
    note: 'Verifikasi pengajuan, kelola katalog',
  },
  {
    email: 'trstaff@metmal.co.id',
    role: 'tenant_relation',
    roleLabel: 'Tenant Relation',
    note: 'Hanya membaca (tanpa mengubah status)',
  },
];

/**
 * Apakah petunjuk kredensial dev ditampilkan di halaman login?
 *
 * Menyala secara bawaan agar pengembangan tidak terhambat; matikan dengan
 * `VITE_PROMO_SHOW_DEV_LOGIN='0'` sebelum dipakai publik.
 *
 * Fungsi (bukan konstanta) supaya test bisa `vi.stubEnv` per-kasus.
 */
export function isDevLoginHintEnabled(): boolean {
  return (import.meta.env.VITE_PROMO_SHOW_DEV_LOGIN as string | undefined) !== '0';
}