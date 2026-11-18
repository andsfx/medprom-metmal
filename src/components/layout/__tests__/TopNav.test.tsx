/**
 * Test navigasi desktop — regresi "tab bar hanya mobile".
 *
 * Kontrak desain: di desktop navigasi pindah ke app bar, di mobile ke tab bar
 * bawah. Yang dikunci di sini: **tepat satu** landmark `nav` bernama sama hadir
 * di DOM, apa pun viewport-nya. Sebelum perbaikan, desktop tidak punya navigasi
 * sama sekali sehingga `/lacak` tak terjangkau tanpa mengetik URL.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../AppShell';

/** Stub `matchMedia` — jsdom tidak menyediakannya. */
function stubViewport(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <p>Isi layar</p>
      </AppShell>
    </MemoryRouter>,
  );
}

afterEach(() => {
  // @ts-expect-error kembalikan ke kondisi jsdom asli (tanpa matchMedia)
  delete window.matchMedia;
});

describe('navigasi utama — desktop vs mobile', () => {
  it('desktop → navigasi ada di app bar (di dalam header)', () => {
    stubViewport(true);
    renderShell('/lacak');

    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(nav).toHaveClass('app-nav');
    expect(nav.closest('header')).not.toBeNull();
  });

  it('desktop → tab bar bawah tidak dirender (hindari landmark ganda)', () => {
    stubViewport(true);
    renderShell('/lacak');

    expect(screen.getAllByRole('navigation', { name: 'Navigasi utama' })).toHaveLength(1);
    expect(document.querySelector('.app-tabbar')).toBeNull();
  });

  it('mobile → tab bar bawah yang bertugas, app bar tanpa nav', () => {
    stubViewport(false);
    renderShell('/lacak');

    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(nav).toHaveClass('app-tabbar');
    expect(screen.getAllByRole('navigation', { name: 'Navigasi utama' })).toHaveLength(1);
  });

  it('desktop → keempat tujuan tersedia termasuk /lacak', () => {
    stubViewport(true);
    renderShell('/lacak');

    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(within(nav).getByRole('link', { name: 'Lacak' })).toHaveAttribute('href', '/lacak');
    for (const label of ['Beranda', 'Katalog', 'Riwayat']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('desktop → rute aktif ditandai aria-current di app bar', () => {
    stubViewport(true);
    renderShell('/lacak');

    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(within(nav).getByRole('link', { name: 'Lacak' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Katalog' })).not.toHaveAttribute('aria-current');
  });

  it('desktop + hideTabBar → tidak ada navigasi (alur wizard tetap fokus)', () => {
    stubViewport(true);
    render(
      <MemoryRouter initialEntries={['/ajukan']}>
        <AppShell hideTabBar>
          <p>Isi layar</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).not.toBeInTheDocument();
  });
});
