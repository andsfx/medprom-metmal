import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../AppShell';

function renderShell(path = '/', props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell {...props}>
        <p>Isi layar</p>
      </AppShell>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('mount → merender konten anak di dalam area gulir', () => {
    renderShell();
    expect(screen.getByText('Isi layar')).toBeInTheDocument();
  });

  it('tanpa judul → app bar menampilkan wordmark', () => {
    renderShell();
    expect(screen.getByText('Media Promosi')).toBeInTheDocument();
  });

  it('judul diberikan → dipakai sebagai heading utama layar', () => {
    renderShell('/riwayat', { title: 'Riwayat Pengajuan' });
    expect(screen.getByRole('heading', { name: 'Riwayat Pengajuan' })).toBeInTheDocument();
  });

  it('bawaan → tab bar navigasi tersedia', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeInTheDocument();
  });

  it('hideTabBar → tab bar disembunyikan agar alur wizard tetap fokus', () => {
    renderShell('/ajukan', { hideTabBar: true });
    expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).not.toBeInTheDocument();
  });

  it('back → tombol kembali tersedia dengan label yang terbaca', () => {
    renderShell('/status/abc', { back: true });
    expect(screen.getByRole('button', { name: 'Kembali' })).toBeInTheDocument();
  });

  it('tanpa back → tombol kembali tidak dirender', () => {
    renderShell();
    expect(screen.queryByRole('button', { name: 'Kembali' })).not.toBeInTheDocument();
  });

  it('rute aktif → tab yang cocok ditandai aria-current', () => {
    renderShell('/riwayat');
    expect(screen.getByRole('link', { name: 'Riwayat' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Katalog' })).not.toHaveAttribute('aria-current');
  });

  it('beranda dicocokkan persis → tidak ikut aktif di /katalog', () => {
    renderShell('/katalog');
    expect(screen.getByRole('link', { name: 'Beranda' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Katalog' })).toHaveAttribute('aria-current', 'page');
    // FAB ajukan bukan tab: tidak pernah membawa aria-current.
    expect(screen.getByRole('link', { name: /ajukan materi baru/i })).not.toHaveAttribute('aria-current');
  });

  it('onBack → tombol kembali memakai handler kustom, bukan riwayat peramban', () => {
    // Regresi: alur berlangkah harus mundur ke langkah sebelumnya, bukan
    // keluar dari alur lewat navigate(-1).
    let dipanggil = 0;
    renderShell('/ajukan', { back: true, onBack: () => { dipanggil += 1; } });
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(dipanggil).toBe(1);
  });

  it('tanpa tab bar → area gulir tidak menyisakan ruang tab bar', () => {
    renderShell('/ajukan', { hideTabBar: true });
    expect(document.querySelector('.app-scroll')).toHaveAttribute('data-tabbar', 'off');
  });

  it('dengan tab bar → area gulir ditandai aktif', () => {
    renderShell();
    expect(document.querySelector('.app-scroll')).toHaveAttribute('data-tabbar', 'on');
  });
});
