/**
 * Test widget Cloudflare Turnstile.
 *
 * Kontrak rapuh yang dikunci: token Turnstile SEKALI PAKAI. Setelah sebuah
 * pengiriman memakai token, widget harus dipasang ulang (dan token lama
 * dibuang) agar percobaan berikutnya tidak ditolak Siteverify dengan
 * `timeout-or-duplicate`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen, act } from '@testing-library/react';
import TurnstileWidget from '../Turnstile';

const SITE_KEY = '1x00000000000000000000AA';

beforeEach(() => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', SITE_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.turnstile;
});

/** Pasang tiruan API Turnstile dan kembalikan spy-nya. */
function installTurnstile() {
  const renderWidget = vi.fn((_el: HTMLElement, _options: Record<string, unknown>) => 'widget-1');
  const removeWidget = vi.fn();
  window.turnstile = { render: renderWidget, remove: removeWidget, reset: vi.fn() };
  return { renderWidget, removeWidget };
}

describe('TurnstileWidget', () => {
  it('tanpa sitekey → tidak merender apa pun', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    const { renderWidget } = installTurnstile();

    const { container } = render(<TurnstileWidget onToken={() => {}} action="track" />);

    expect(container).toBeEmptyDOMElement();
    expect(renderWidget).not.toHaveBeenCalled();
  });

  it('sitekey ada → widget Turnstile dipasang dengan sitekey dan action', async () => {
    const { renderWidget } = installTurnstile();

    render(<TurnstileWidget onToken={() => {}} action="track" />);

    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
    const options = renderWidget.mock.calls[0]![1];
    expect(options.sitekey).toBe(SITE_KEY);
    // `action` ikut dipasang; server memverifikasinya (anti pakai-ulang token).
    expect(options.action).toBe('track');
  });

  it('token dari callback diteruskan ke pemanggil', async () => {
    const { renderWidget } = installTurnstile();
    const onToken = vi.fn();

    render(<TurnstileWidget onToken={onToken} action="track" />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));

    const options = renderWidget.mock.calls[0]![1];
    (options.callback as (token: string) => void)('tok-1');

    expect(onToken).toHaveBeenCalledWith('tok-1');
  });

  it('token kedaluwarsa → pemanggil diberi tahu bahwa token kosong', async () => {
    const { renderWidget } = installTurnstile();
    const onToken = vi.fn();

    render(<TurnstileWidget onToken={onToken} action="track" />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));

    const options = renderWidget.mock.calls[0]![1];
    (options['expired-callback'] as () => void)();

    expect(onToken).toHaveBeenCalledWith('');
  });

  it('resetKey naik → widget dipasang ulang dan token lama dibuang', async () => {
    const { renderWidget, removeWidget } = installTurnstile();
    const onToken = vi.fn();

    const { rerender } = render(<TurnstileWidget onToken={onToken} resetKey={0} action="track" />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));

    const options = renderWidget.mock.calls[0]![1];
    (options.callback as (token: string) => void)('tok-1');
    onToken.mockClear();

    // Pengiriman berikutnya menaikkan kunci: token sekali pakai harus dibuang.
    rerender(<TurnstileWidget onToken={onToken} resetKey={1} action="track" />);

    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2));
    expect(removeWidget).toHaveBeenCalledWith('widget-1');
    expect(onToken).toHaveBeenLastCalledWith('');
  });

  /**
   * Widget yang GAGAL dipasang tidak boleh gagal secara senyap.
   *
   * Kasus nyata: sitekey belum terdaftar pada hostname → Cloudflare memanggil
   * `error-callback` dengan `110200`, tidak ada iframe dan tidak ada token.
   * Sebelum diperbaiki, callback itu dibuang: placeholder hilang, tak ada pesan
   * galat, dan halaman induk tetap menyuruh pengguna "selesaikan verifikasi
   * captcha di atas" - menunjuk ruang kosong yang tak akan pernah terisi
   * (terukur 2026-09-30 di produksi).
   */
  it('error-callback → pesan galat tampil dan pemanggil diberi tahu tidak tersedia', async () => {
    const { renderWidget } = installTurnstile();
    const onToken = vi.fn();
    const onUnavailable = vi.fn();

    render(<TurnstileWidget onToken={onToken} action="track" onUnavailable={onUnavailable} />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
    // Widget terpasang: pemanggil diberi tahu keadaan tersedia lebih dulu.
    expect(onUnavailable).toHaveBeenLastCalledWith(false);

    const options = renderWidget.mock.calls[0]![1];
    // Mengembalikan `true` menandai galat sudah ditangani Turnstile.
    let handled: unknown;
    await act(async () => {
      handled = (options['error-callback'] as (code: string) => unknown)('110200');
    });

    expect(handled).toBe(true);
    expect(onUnavailable).toHaveBeenLastCalledWith(true);
    expect(onToken).toHaveBeenLastCalledWith('');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Verifikasi keamanan tidak dapat dimuat/i);
  });

  it('resetKey naik → keadaan galat dibersihkan dan pemanggil diberi tahu tersedia lagi', async () => {
    const { renderWidget } = installTurnstile();
    const onUnavailable = vi.fn();

    const { rerender } = render(
      <TurnstileWidget onToken={() => {}} resetKey={0} action="track" onUnavailable={onUnavailable} />,
    );
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
    (renderWidget.mock.calls[0]![1]['error-callback'] as (code: string) => unknown)('110200');
    expect(onUnavailable).toHaveBeenLastCalledWith(true);

    rerender(<TurnstileWidget onToken={() => {}} resetKey={1} action="track" onUnavailable={onUnavailable} />);

    await waitFor(() => expect(onUnavailable).toHaveBeenLastCalledWith(false));
  });
});
