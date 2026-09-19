/**
 * Test elevasi app bar — mekanisme IntersectionObserver, bukan listener gulir.
 *
 * Kontrak yang dikunci: `data-elevated` bernilai `false` saat sentinel masih
 * terlihat, `true` begitu sentinel keluar dari area gulir, dan mount tetap aman
 * di lingkungan tanpa `IntersectionObserver` (jsdom — dipakai seluruh suite).
 *
 * Mocking `IntersectionObserver` WAJIB: jsdom tidak menyediakannya, sehingga
 * tanpa mock komponen hanya menempuh jalur fallback dan transisi elevasi tidak
 * bisa diuji sama sekali. jsdom juga tidak menghitung tata letak, jadi gulir
 * sungguhan tidak akan pernah memicu observer — callback-nya harus dipicu
 * manual. Tiruan di bawah menyimpan elemen yang diamati, opsinya, dan
 * callback-nya, sehingga test dapat memverifikasi ketiganya secara langsung.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TopAppBar from '../TopAppBar';

/** Tiruan `IntersectionObserver` — mencatat elemen, opsi, dan callback. */
class ObserverTiruan {
  static semua: ObserverTiruan[] = [];

  elemen: Element[] = [];
  opsi: IntersectionObserverInit | undefined;
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);

  private readonly callback: (entries: IntersectionObserverEntry[]) => void;

  constructor(callback: (entries: IntersectionObserverEntry[]) => void, opsi?: IntersectionObserverInit) {
    this.callback = callback;
    this.opsi = opsi;
    ObserverTiruan.semua.push(this);
  }

  observe(el: Element) {
    this.elemen.push(el);
  }

  /** Picu callback seolah sentinel masuk ke / keluar dari area gulir. */
  picu(isIntersecting: boolean) {
    const entry = { isIntersecting, target: this.elemen[0] } as unknown as IntersectionObserverEntry;
    this.callback([entry]);
  }
}

/** Observer terakhir yang dibuat komponen. */
function observerTerakhir(): ObserverTiruan {
  const o = ObserverTiruan.semua.at(-1);
  if (!o) throw new Error('TopAppBar tidak membuat IntersectionObserver');
  return o;
}

interface PropsBar {
  title?: string;
  scrollTargetId?: string;
}

/** Harness meniru topologi `AppShell`: app bar dan area gulir adalah SAUDARA. */
function renderBar(props: PropsBar = {}) {
  return render(
    <MemoryRouter>
      <div className="app-shell">
        <TopAppBar {...props} />
        <main id="app-scroll" className="app-scroll">
          <p>Isi layar</p>
        </main>
      </div>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  ObserverTiruan.semua = [];
  vi.stubGlobal('IntersectionObserver', ObserverTiruan);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TopAppBar — elevasi app bar', () => {
  it('mount → app bar belum terangkat', () => {
    renderBar({ scrollTargetId: 'app-scroll' });
    expect(screen.getByRole('banner')).toHaveAttribute('data-elevated', 'false');
  });

  it('sentinel keluar dari area gulir → app bar terangkat, lalu turun lagi saat kembali', () => {
    renderBar({ scrollTargetId: 'app-scroll' });
    const bar = screen.getByRole('banner');

    act(() => { observerTerakhir().picu(false); });
    expect(bar).toHaveAttribute('data-elevated', 'true');

    act(() => { observerTerakhir().picu(true); });
    expect(bar).toHaveAttribute('data-elevated', 'false');
  });

  it('observer mengamati sentinel di dalam area gulir dengan ambang 4px', () => {
    renderBar({ scrollTargetId: 'app-scroll' });
    const observer = observerTerakhir();
    const sentinel = observer.elemen[0]!;

    // Sentinel harus berada DI DALAM area gulir, bukan di luar — app bar dan
    // area gulir bersaudara, jadi sentinel tidak boleh jadi keturunan bar.
    expect(sentinel.closest('#app-scroll')).not.toBeNull();
    // Tidak terlihat dan tidak mengganggu tata letak/a11y.
    expect(sentinel).toHaveAttribute('aria-hidden', 'true');
    expect(sentinel).toHaveStyle({ height: '0px' });
    // Ambang 4px (perilaku lama `scrollTop > 4`) dibawa oleh rootMargin, dan
    // root harus elemen area gulir — dokumen tidak menggulir.
    expect(observer.opsi?.root).toBe(document.getElementById('app-scroll'));
    expect(observer.opsi?.rootMargin).toBe('4px 0px 0px 0px');
  });

  it('tanpa scrollTargetId → sentinel di dokumen, root kembali ke viewport', () => {
    renderBar();
    const observer = observerTerakhir();
    expect(observer.opsi?.root).toBeNull();
    expect(observer.elemen[0]!.parentElement).toBe(document.body);
  });

  it('unmount → observer dilepas dan sentinel dibersihkan', () => {
    const { unmount } = renderBar({ scrollTargetId: 'app-scroll' });
    const observer = observerTerakhir();
    const sentinel = observer.elemen[0]!;

    unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(sentinel.isConnected).toBe(false);
  });

  it('scrollTargetId berubah → observer lama dilepas beserta sentinelnya', () => {
    const { rerender } = renderBar({ scrollTargetId: 'app-scroll' });

    rerender(
      <MemoryRouter>
        <div className="app-shell">
          <TopAppBar scrollTargetId="area-lain" />
          <main id="app-scroll" className="app-scroll">
            <p>Isi layar</p>
          </main>
          <div id="area-lain" />
        </div>
      </MemoryRouter>,
    );

    const [lama, baru] = ObserverTiruan.semua;
    expect(ObserverTiruan.semua).toHaveLength(2);
    expect(lama!.disconnect).toHaveBeenCalledTimes(1);
    expect(lama!.elemen[0]!.isConnected).toBe(false);
    expect(baru!.elemen[0]!.parentElement).toBe(document.getElementById('area-lain'));
  });

  it('tanpa IntersectionObserver (jsdom) → mount tidak melempar dan tetap tidak terangkat', () => {
    // Kembalikan ke kondisi jsdom asli: `IntersectionObserver` tidak ada.
    vi.unstubAllGlobals();
    expect(typeof IntersectionObserver).toBe('undefined');

    expect(() => renderBar({ scrollTargetId: 'app-scroll' })).not.toThrow();
    expect(screen.getByRole('banner')).toHaveAttribute('data-elevated', 'false');
  });
});
