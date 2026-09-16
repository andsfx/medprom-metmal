import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('rute katalog dicocokkan persis → tidak ikut aktif di rute lain', () => {
    renderShell('/ajukan');
    expect(screen.getByRole('link', { name: 'Katalog' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Ajukan' })).toHaveAttribute('aria-current', 'page');
  });
});
