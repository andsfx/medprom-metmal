/**
 * verify-tenant-upload.mjs — jalur tenant penuh via browser produksi:
 * landing → form pengajuan (pilih media, tenant, PIC) → upload file nyata →
 * tiket + dashboard staf + riwayat tenant.
 *
 *   VERIFY_PASSWORD='...' node scripts/verify-tenant-upload.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.VERIFY_BASE || 'https://medprom-metmal.vercel.app';
const API = process.env.VERIFY_API || 'https://promapi.andotherstori.my.id';
const EMAIL = process.env.VERIFY_EMAIL || 'tr@metmal.co.id';
const PASSWORD = process.env.VERIFY_PASSWORD || '';
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); };

// PNG 1x1 valid — diterima server (magic bytes cocok, < 50MB).
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const tmp = mkdtempSync(join(tmpdir(), 'medprom-verify-'));
const filePath = join(tmp, 'materi-verify.png');
writeFileSync(filePath, png);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let ticketId = '';

try {
  // 1. Landing (katalog live)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const cards = await page.locator('article h3').count();
  check('katalog tampil di landing', cards === 13, `${cards} kartu`);

  // 2. Preselect ?media=spanduk → form langsung ke tahap Data Tenant.
  await page.goto(`${BASE}/ajukan?media=spanduk`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input#tenant-search', { timeout: 20000 });
  const header = await page.textContent('body');
  check('media terpilih dari URL (?media=spanduk)', header.includes('Materi untuk Spanduk'));

  // 3. Gerai dari daftar MID nyata
  await page.fill('input#tenant-search', 'Optik');
  await page.waitForSelector('[role=option]', { timeout: 25000 });
  const optName = (await page.locator('[role=option]').first().innerText()).split('\n')[0].trim();
  await page.locator('[role=option]').first().click();
  check('tenant terpilih dari API tenant', optName.length > 2, optName);

  await page.fill('input#pic-name', 'Andi Verifikasi');
  await page.fill('input#pic-phone', '081234567890');
  await page.fill('textarea#notes', 'Uji alur tenant produksi.');
  await page.click('button:has-text("Lanjut — Kirim Materi")');
  await page.waitForSelector('text=Kirim Pengajuan', { timeout: 15000 });

  // 4. Upload file via Drive flow (wizard → POST /drive/upload → Drive).
  //    Klik label upload, isi file, tunggu tombol Kirim aktif (file tervalidasi).
  await page.click('label:has-text("Klik untuk memilih file")');
  const fileChooser = await page.waitForEvent('filechooser', { timeout: 10000 });
  await fileChooser.setFiles(filePath);
  await page.waitForSelector('button:has-text("Kirim Pengajuan")', { timeout: 10000 });
  // Tunggu file tertera di UI sebelum submit.
  await page.waitForSelector('text=materi-verify.png', { timeout: 5000 });

  // Submit: klik tombol Kirim Pengajuan, tunggu progress & success.
  await page.click('button:has-text("Kirim Pengajuan")');
  await page.waitForSelector('text=Pengajuan Terkirim', { timeout: 90000 });
  check('pengajuan sukses (tampil nomor tiket)', true);

  // 5. Tiket = 8 karakter hex (potongan pertama UUID, uppercase).
  //    Tampilan: "Nomor Tiket: XXXXXXXX" pada layar sukses wizard.
  const bodyText = await page.textContent('body');
  const ticketMatch = bodyText.match(/Nomor Tiket:?\s*([A-Z0-9]{8})/);
  ticketId = ticketMatch ? ticketMatch[1] : '';
  check('nomor tiket 8-char hex', /^[A-F0-9]{8}$/.test(ticketId), ticketId);

  // 6. Dashboard staf melihat pengajuan (via API admin)
  const ctx = await browser.newContext();
  const login = await ctx.request.post(`${API}/api/v1/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  check('login staf via API', login.ok());
  const list = await ctx.request.get(`${API}/api/v1/admin/submissions?status=pending`, {
    headers: { cookie: (login.headers()['set-cookie'] || '').split(';')[0] },
  });
  const json = await list.json();
  const found = (json.data || []).find((r) => r.tenant_name === optName);
  check('pengajuan muncul di antrean staf', Boolean(found), found ? `${found.status} · ${found.media_type_slug}` : 'tidak ditemukan');
  await ctx.close();

  // 7. Riwayat publik menampilkan pengajuan (by media slug, tanpa auth)
  await page.goto(`${BASE}/riwayat`, { waitUntil: 'networkidle' });
  const riwayatBody = await page.textContent('body');
  check('halaman riwayat menampilkan pengajuan', riwayatBody.includes('spanduk') || riwayatBody.includes('Spanduk'));

  check('tanpa error runtime', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (err) {
  check('alur tenant', false, err.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exit(failed > 0 ? 1 : 0);