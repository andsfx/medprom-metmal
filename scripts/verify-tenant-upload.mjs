/**
 * verify-tenant-upload.mjs — jalur tenant penuh lewat browser produksi:
 * landing → form pengajuan (pilih media, tenant dari API, PIC) → unggah file nyata →
 * tiket + baris riwayat + tampil di dashboard staf.
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

// PNG 1x1 valid (magic bytes cocok) — melewati verifikasi server.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const tmp = mkdtempSync(join(tmpdir(), 'medprom-verify-'));
const filePath = join(tmp, 'materi-verify.png');
writeFileSync(filePath, png);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
try {
  // 1. Landing (katalog hidup) → wizard dengan media terpilih
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const cards = await page.locator('article h3').count();
  check('katalog tampil di landing', cards === 13, `${cards} kartu`);

  // Preselect ?media=spanduk → form langsung ke tahap Data Tenant.
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
  await page.waitForSelector('input#file-input', { timeout: 15000 });

  // 4. Unggah file → submit
  await page.setInputFiles('input#file-input', filePath);
  await page.waitForTimeout(2500); // tunggu PUT R2 + verifikasi
  await page.click('button:has-text("Kirim")');
  await page.waitForSelector('text=Nomor tiket', { timeout: 30000 });
  const ticket = (await page.locator('text=/MP-\\d{8}-\\d+/').first().innerText()).trim();
  check('tiket diterbitkan', /MP-\d{8}-\d+/.test(ticket), ticket);

  // 5. Riwayat perangkat menampilkan pengajuan tsb
  await page.goto(`${BASE}/riwayat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const body = await page.textContent('body');
  check('riwayat memuat tiket baru', body.includes(ticket));
  check('tenant tampil di riwayat', body.includes(optName));

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

  check('tanpa error runtime', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (err) {
  check('alur tenant', false, err.message);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exit(failed > 0 ? 1 : 0);
