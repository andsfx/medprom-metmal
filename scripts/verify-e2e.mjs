/**
 * verify-e2e.mjs — verifikasi produksi medprom (Playwright dari node_modules
 * project ini; install: npm i -D playwright && npx playwright install chromium).
 *
 *   node scripts/verify-e2e.mjs
 *
 * Alur: landing katalog → wizard (validasi format) → login staf → dashboard
 * menampilkan pengajuan → review status → riwayat tenant.
 */
import { chromium } from 'playwright';

const BASE = process.env.VERIFY_BASE || 'https://medprom-metmal.vercel.app';
const EMAIL = process.env.VERIFY_EMAIL || 'tr@metmal.co.id';
const PASSWORD = process.env.VERIFY_PASSWORD || '';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  // 1. Landing + katalog live
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const h1 = (await page.textContent('h1'))?.trim();
  check('landing h1', h1 === 'Ajukan Materi Promosi Tenant Anda', h1);
  const cards = await page.locator('article h3').count();
  check('katalog kartu aktif = 13', cards === 13, `${cards} kartu`);

  // 2. Form pengajuan: preselect + validasi tenant
  await page.click('a:has-text("Ajukan Materi")');
  await page.waitForSelector('input#pic-name', { timeout: 15000 });
  await page.fill('input#pic-name', 'Andi Verify');
  await page.fill('input#pic-phone', '081234567890');
  await page.click('button:has-text("Lanjut — Kirim Materi")');
  const tenantError = await page.locator('text=Pilih tenant dari daftar').isVisible();
  check('form menolak tenant kosong', tenantError);

  // 3. Login staf → dashboard
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input#email', EMAIL);
  await page.fill('input#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/admin', { timeout: 20000 });
  await page.waitForTimeout(3000);
  const hasTabs = await page.locator('[role=tab]').count();
  check('dashboard render tab (sesi aktif)', hasTabs >= 2, `${hasTabs} tab`);
  const bodyText = await page.textContent('body');
  check('dashboard tidak menampilkan "Sesi berakhir"', !bodyText.includes('Sesi berakhir'));

  // 4. Riwayat publik
  await page.goto(`${BASE}/riwayat`, { waitUntil: 'networkidle' });
  const riwayatH1 = (await page.locator('h1').textContent())?.trim();
  check('halaman riwayat', riwayatH1 === 'Riwayat Pengajuan', riwayatH1);

  check('tanpa console error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (err) {
  check('alur verifikasi', false, err.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} lolos`);
process.exit(failed.length > 0 ? 1 : 0);
