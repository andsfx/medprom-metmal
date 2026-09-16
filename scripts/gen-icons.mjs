/**
 * Render ikon PWA (PNG) dari public/icon.svg memakai Chromium Playwright.
 *
 * Playwright sudah menjadi devDependency (dipakai script verify-*), jadi tidak
 * ada dependensi baru. Jalankan sekali setelah mengubah icon.svg:
 *
 *   node scripts/gen-icons.mjs
 *
 * Hasil PNG ikut di-commit supaya `npm run build` tidak butuh Chromium.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const svg = readFileSync(join(PUBLIC_DIR, 'icon.svg'), 'utf8');

/**
 * Varian ikon.
 * - `padding` untuk maskable: Android memangkas ikon jadi lingkaran/squircle,
 *   jadi muatan penting harus berada di "safe zone" 80% bagian tengah.
 * - `bleed` mengisi latar penuh tosca agar tidak ada sudut transparan saat
 *   dipangkas.
 */
const VARIANTS = [
  { file: 'icon-192.png', size: 192, padding: 0, bleed: false },
  { file: 'icon-512.png', size: 512, padding: 0, bleed: false },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.1, bleed: true },
  { file: 'apple-touch-icon.png', size: 180, padding: 0, bleed: false },
];

const browser = await chromium.launch();
try {
  for (const { file, size, padding, bleed } of VARIANTS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const inset = Math.round(size * padding);
    await page.setContent(
      `<!doctype html><html><head><style>
        html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
        body{background:${bleed ? '#00918E' : 'transparent'}}
        .wrap{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center}
        svg{width:${size - inset * 2}px;height:${size - inset * 2}px;display:block}
        ${bleed ? 'svg rect:first-of-type{rx:0 !important}' : ''}
      </style></head><body><div class="wrap">${svg}</div></body></html>`,
      { waitUntil: 'load' },
    );
    const buf = await page.screenshot({ omitBackground: !bleed, type: 'png' });
    writeFileSync(join(PUBLIC_DIR, file), buf);
    console.log(`✓ ${file} (${size}×${size}${padding ? `, safe-zone ${(1 - padding * 2) * 100}%` : ''})`);
    await page.close();
  }
} finally {
  await browser.close();
}
