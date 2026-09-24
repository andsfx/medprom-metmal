/**
 * verify-cetak.mjs: verifikasi produksi alur pengajuan media promosi cetak:
 * landing → /ajukan-cetak → data pemohon (non-tenant) → pilih media + periode
 * (minimal 7 hari) → ringkasan (PPN 11%) → kirim batch → nomor batch
 * MPB-YYMMDD-XXXXXX → halaman status batch ber-token.
 *
 *   node scripts/verify-cetak.mjs
 *
 * Catatan: skrip ini membuat baris batch nyata di produksi (sama seperti
 * verify-e2e) dan memakai konteks browser segar sehingga fingerprint pengirim
 * berbeda tiap run (aman dari batas anti-spam 5 pengajuan/24 jam).
 */
import { chromium } from 'playwright';

const BASE = process.env.VERIFY_BASE || 'https://medprom-metmal.vercel.app';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `: ${detail}` : ''}`);
};

/** Tanggal YYYY-MM-DD (waktu lokal) untuk input[type=date]. */
function isoPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  // 1. Landing → tautan ke form cetak.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const ctaCetak = page.locator('a:has-text("Ajukan Media Cetak")');
  check('landing punya CTA ajukan media cetak', (await ctaCetak.count()) > 0);
  await ctaCetak.first().click();
  await page.waitForURL('**/ajukan-cetak', { timeout: 20000 });
  await page.waitForSelector('input#cetak-pic', { timeout: 20000 });

  // 2. Langkah 1 - data pemohon non-tenant.
  await page.click('button:has-text("Non-tenant")');
  await page.fill('input#cetak-non-tenant', 'Yayasan Verifikasi Cetak');
  await page.fill('input#cetak-pic', 'Andi Verifikasi');
  await page.fill('input#cetak-phone', '081234567890');
  await page.click('button:has-text("Lanjut ke Pilih Media")');
  await page.waitForSelector('h2:has-text("Pilih Media")', { timeout: 20000 });

  // 3. Katalog cetak aktif + centang dua media pertama.
  const boxes = page.locator('input[id^="cetak-media-"]');
  await boxes.first().waitFor({ timeout: 20000 });
  const jumlahMedia = await boxes.count();
  check('katalog cetak aktif = 3 media', jumlahMedia === 3, `${jumlahMedia} media`);

  const slugs = [];
  for (let i = 0; i < Math.min(2, jumlahMedia); i += 1) {
    const id = await boxes.nth(i).getAttribute('id');
    slugs.push(String(id).replace('cetak-media-', ''));
    await boxes.nth(i).check();
  }
  check('dua media terpilih', slugs.length === 2, slugs.join(', '));

  // 4. Lokasi + periode (minimal 7 hari) + tanggal pemasangan per media.
  // Lead time media cetak = "paling lambat 2 hari sebelum pemasangan" (aturan
  // `rules` katalog), sehingga tanggal pasang minimal H+2; server MENOLAK H+1.
  const mulai = isoPlus(1);
  const selesai = isoPlus(8);
  const pasang = isoPlus(2);
  for (const slug of slugs) {
    await page.fill(`input#cetak-target-${slug}`, 'Sisi Pintu Tol Bekasi Barat');
    await page.fill(`input#cetak-start-${slug}`, mulai);
    await page.fill(`input#cetak-end-${slug}`, selesai);
    await page.fill(`input#cetak-install-${slug}`, pasang);
  }
  const step2 = await page.textContent('body');
  check('estimasi harga per media non-nol', /Subtotal/.test(step2) && /Rp\. [1-9]/.test(step2));
  check('label estimasi harga di langkah 2', /Perkiraan; harga final sesuai penawaran/i.test(step2));

  // 5. Ringkasan: total + PPN 11% + label estimasi.
  await page.click('button:has-text("Lanjut ke Ringkasan")');
  await page.waitForSelector('h2:has-text("Ringkasan")', { timeout: 15000 });
  const ringkasan = await page.textContent('body');
  check('ringkasan memuat baris PPN 11%', /PPN 11%/.test(ringkasan));
  check('ringkasan memuat label estimasi harga', /Perkiraan; harga final sesuai penawaran/i.test(ringkasan));
  check('ringkasan menampilkan dua media dipilih', /Media dipilih \(2\)/.test(ringkasan));

  // 6. Persetujuan ketentuan → kirim batch.
  await page.check('input#cetak-terms');
  await page.click('button:has-text("Kirim Pengajuan")');
  await page.waitForSelector('text=Pengajuan Terkirim', { timeout: 90000 });
  const sukses = await page.textContent('body');
  const nomorBatch = (sukses.match(/MPB-\d{6}-[0-9A-Z]{6}/) || [])[0] || '';
  check('nomor batch MPB-YYMMDD-XXXXXX', /^MPB-\d{6}-[0-9A-Z]{6}$/.test(nomorBatch), nomorBatch);

  // 7. Halaman status batch ber-token (tanpa login) memuat kedua media.
  await page.click('button:has-text("Lihat Status Pengajuan")');
  await page.waitForURL('**/batch/**', { timeout: 20000 });
  await page.waitForSelector('text=media dalam pengajuan ini', { timeout: 20000 });
  const batchBody = await page.textContent('body');
  check('halaman batch memuat nomor batch', Boolean(nomorBatch) && batchBody.includes(nomorBatch), nomorBatch);
  check('halaman batch memuat 2 media', /2 media dalam pengajuan ini/.test(batchBody));

  check('tanpa console error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (err) {
  check('alur cetak', false, err.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} lolos`);
process.exit(failed.length > 0 ? 1 : 0);
