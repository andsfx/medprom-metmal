/**
 * Service worker medprom-metmal — shell offline + cache aset.
 *
 * Aturan yang TIDAK boleh dilanggar:
 *  1. Permintaan API tidak pernah di-cache. Status pengajuan wajib mutakhir;
 *     menyajikan status basi lebih buruk daripada gagal terang-terangan.
 *     API berada di origin lain (promapi.*), jadi seluruh permintaan lintas
 *     origin dilewatkan langsung ke jaringan.
 *  2. Naikkan CACHE_VERSION setiap rilis yang mengubah aset shell — cache lama
 *     disapu di event `activate`.
 *  3. Hanya GET yang di-cache.
 *
 * Ditulis tangan (tanpa vite-plugin-pwa) mengikuti kebijakan "tanpa
 * dependensi baru".
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `medprom-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `medprom-aset-${CACHE_VERSION}`;

/** Berkas yang membuat aplikasi bisa dibuka tanpa jaringan. */
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll gagal total bila satu berkas 404; tambahkan satu per satu agar
      // satu aset hilang tidak menggagalkan seluruh instalasi.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('medprom-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Aset build Vite ber-hash (/assets/*) — aman di-cache selamanya. */
function isBuildAsset(url) {
  return url.pathname.startsWith('/assets/');
}

/** Ikon, manifest, favicon. */
function isStaticAsset(url) {
  return /\.(png|svg|ico|webmanifest|woff2?)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Lintas origin (API, Google Fonts) — biarkan jaringan menangani.
  if (url.origin !== self.location.origin) return;

  // Sabuk pengaman bila suatu saat API dipasang di origin yang sama.
  if (url.pathname.startsWith('/api/')) return;

  // Navigasi (SPA) — jaringan lebih dulu, jatuh ke shell saat offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('/').then(
            (cached) =>
              cached ??
              new Response(
                '<!doctype html><html lang="id"><meta charset="utf-8">' +
                  '<title>Tidak ada koneksi</title>' +
                  '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
                  '<h1>Tidak ada koneksi</h1>' +
                  '<p>Sambungkan perangkat ke internet lalu muat ulang halaman ini.</p>',
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
              ),
          ),
        ),
    );
    return;
  }

  // Aset build ber-hash — cache dulu (isinya tidak pernah berubah).
  if (isBuildAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Aset statis lain — sajikan cache, perbarui di latar (stale-while-revalidate).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});
