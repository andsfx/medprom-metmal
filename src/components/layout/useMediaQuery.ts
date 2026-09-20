/**
 * Hook media query berbasis `matchMedia`.
 *
 * Dipakai `AppShell` untuk memilih navigasi mana yang dirender: tab bar bawah
 * (mobile) atau navigasi app bar (desktop). Keduanya tidak boleh hadir
 * bersamaan di DOM - dua landmark `nav` bernama sama membingungkan pembaca
 * layar, dan di test jsdom (yang tidak menerapkan CSS) query peran menjadi
 * ambigu. Menyembunyikan lewat CSS saja tidak cukup karena alasan itu.
 *
 * Nilai awal dibaca sinkron dari `matchMedia` agar tidak ada kedipan navigasi
 * salah pada render pertama.
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
