/**
 * verify-tenant-upload.mjs: jalur tenant penuh via browser produksi:
 * landing → form pengajuan (pilih media, tenant, PIC, data materi PRD) →
 * unggah berkas nyata → nomor pengajuan + dashboard staf + riwayat tenant.
 *
 *   VERIFY_PASSWORD='...' node scripts/verify-tenant-upload.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.VERIFY_BASE || 'https://medprom-metmal.vercel.app';
const API = process.env.VERIFY_API || 'https://promapi.metmalcommunityspace.web.id';
const EMAIL = process.env.VERIFY_EMAIL || 'tr@metmal.co.id';
const PASSWORD = process.env.VERIFY_PASSWORD || '';
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${n}${d ? `: ${d}` : ''}`); };

// PNG 1x1 valid: diterima server (magic bytes cocok, < 50MB).
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const tmp = mkdtempSync(join(tmpdir(), 'medprom-verify-'));
const filePath = join(tmp, 'materi-verify.png');
writeFileSync(filePath, png);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let submissionNumber = '';

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

  // 4. Data PIC + field materi wajib PRD §9.3.
  await page.fill('input#pic-name', 'Andi Verifikasi');
  await page.fill('input#pic-phone', '081234567890');
  await page.fill('input#campaign-name', 'Verifikasi Produksi');
  await page.fill('input#material-title', 'Spanduk Verifikasi');
  await page.fill('textarea#material-description', 'Uji alur tenant produksi.');
  await page.selectOption('select#material-type', 'Promosi');
  await page.fill('input#media-target', 'Sisi Pintu Tol Bekasi Barat');
  await page.click('button:has-text("Lanjut ke Kirim Materi")');
  await page.waitForSelector('text=Kirim Pengajuan', { timeout: 15000 });

  // 5. Pilih kanal unggah berkas (bawaan wizard adalah kirim tautan).
  await page.click('button:has-text("Unggah File")');
  await page.click('label:has-text("Klik untuk memilih file")');
  const fileChooser = await page.waitForEvent('filechooser', { timeout: 10000 });
  await fileChooser.setFiles(filePath);
  await page.waitForSelector('text=materi-verify.png', { timeout: 5000 });

  // 6. Persetujuan ketentuan wajib sebelum tombol kirim aktif.
  await page.getByLabel(/Saya menyatakan/i).check();
  await page.click('button:has-text("Kirim Pengajuan")');
  await page.waitForSelector('text=Pengajuan Terkirim', { timeout: 90000 });
  check('pengajuan sukses (tampil nomor pengajuan)', true);

  // 7. Nomor pengajuan berformat MP-YYMMDD-XXXXXX (FR-016).
  const bodyText = await page.textContent('body');
  const numberMatch = bodyText.match(/Nomor pengajuan\s*(MP-\d{6}-[A-Z0-9]{6})/);
  submissionNumber = numberMatch ? numberMatch[1] : '';
  check('nomor pengajuan MP-YYMMDD-XXXXXX', /^MP-\d{6}-[A-Z0-9]{6}$/.test(submissionNumber), submissionNumber);

  // 8. Halaman status ber-token dapat dibuka tanpa login (FR-019).
  const statusLink = await page.getAttribute('a:has-text("Lihat Status Pengajuan")', 'href');
  check('tautan status tersedia setelah submit', Boolean(statusLink && statusLink.startsWith('/status/')), statusLink || '');
  if (statusLink) {
    await page.goto(`${BASE}${statusLink}`, { waitUntil: 'networkidle' });
    const statusBody = await page.textContent('body');
    check('halaman status menampilkan nomor pengajuan', statusBody.includes(submissionNumber), submissionNumber);
    check('halaman status menampilkan riwayat status', statusBody.includes('Riwayat Status'));
  }

  // 9. Dashboard staf melihat pengajuan (via API admin): status awal PRD.
  const ctx = await browser.newContext();
  const login = await ctx.request.post(`${API}/api/v1/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  check('login staf via API', login.ok());
  const list = await ctx.request.get(`${API}/api/v1/admin/submissions?status=menunggu_review`, {
    headers: { cookie: (login.headers()['set-cookie'] || '').split(';')[0] },
  });
  const json = await list.json();
  const found = (json.data || []).find((r) => r.tenant_name === optName);
  check('pengajuan muncul di antrean staf', Boolean(found), found ? `${found.status} · ${found.media_type_slug}` : 'tidak ditemukan');
  check('status awal = menunggu_review', found?.status === 'menunggu_review', found?.status || '');
  check('nomor pengajuan tersimpan di baris staf', found?.submission_number === submissionNumber, found?.submission_number || '');
  await ctx.close();

  // 10. Riwayat publik menampilkan pengajuan (by media slug, tanpa auth)
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