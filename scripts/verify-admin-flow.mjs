/**
 * verify-admin-flow.mjs — verifikasi alur staf di produksi:
 * login → dashboard → buka detail pengajuan → set status + catatan → cek
 * perubahan tercermin di riwayat tenant (GET /promo/submissions/mine).
 *
 *   VERIFY_PASSWORD='...' node scripts/verify-admin-flow.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.VERIFY_BASE || 'https://medprom-metmal.vercel.app';
const API = process.env.VERIFY_API || 'https://promapi.andotherstori.my.id';
const EMAIL = process.env.VERIFY_EMAIL || 'tr@metmal.co.id';
const PASSWORD = process.env.VERIFY_PASSWORD || '';
const FINGERPRINT = process.env.VERIFY_FP || 'verify-fp-e2e-1';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Riwayat tenant sebelum review (via API, deterministik).
const before = await fetch(`${API}/api/v1/promo/submissions/mine?fingerprint=${FINGERPRINT}`).then((r) => r.json());
const beforeRow = before.data?.[0];
check('riwayat punya pengajuan uji', Boolean(beforeRow), beforeRow ? `${beforeRow.media_type_slug} ${beforeRow.status}` : 'kosong');

const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input#email', EMAIL);
  await page.fill('input#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/admin', { timeout: 20000 });
  await page.waitForSelector('button:has-text("Detail")', { timeout: 20000 });

  // Buka detail baris pertama → set Terpasang + catatan.
  await page.click('button:has-text("Detail")');
  await page.waitForSelector('text=Set status', { timeout: 10000 });
  await page.click('label:has-text("Terpasang")');
  await page.fill('textarea#review-notes', 'Verifikasi produksi: materi terpasang Jumat.');
  await page.click('button:has-text("Simpan")');
  await page.waitForSelector('text=Set status', { state: 'detached', timeout: 15000 });
  check('review tersimpan (modal tertutup)', true);

  // Riwayat tenant mencerminkan status baru.
  const after = await fetch(`${API}/api/v1/promo/submissions/mine?fingerprint=${FINGERPRINT}`).then((r) => r.json());
  const afterRow = after.data?.[0];
  check('status riwayat = installed', afterRow?.status === 'installed', afterRow?.status);
  check('catatan review tampil ke tenant', String(afterRow?.review_notes).includes('Verifikasi produksi'), afterRow?.review_notes?.slice(0, 40));
} catch (err) {
  check('alur admin', false, err.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} lolos`);
process.exit(failed.length > 0 ? 1 : 0);
