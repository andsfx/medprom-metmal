/**
 * verify-admin-flow.mjs: verifikasi alur staf di produksi:
 * login → dashboard → buka detail pengajuan → set status + catatan → cek
 * perubahan tercermin di riwayat tenant (GET /promo/submissions/mine).
 *
 *   VERIFY_PASSWORD='...' node scripts/verify-admin-flow.mjs
 *
 * Catatan: status mengikuti alur PRD §8: dari Menunggu Review hanya
 * Perlu Revisi / Disetujui / Ditolak yang sah (lompatan ke Sudah Dipasang
 * ditolak server). Jadi alur uji di sini adalah **setujui** materi.
 *
 * Prasyarat: jalankan `node scripts/verify-cetak.mjs` lebih dulu agar ada
 * baris batch cetak (nomor MPB-...) di daftar pengajuan yang diperiksa.
 */
import { chromium } from 'playwright';

const BASE = process.env.VERIFY_BASE || 'https://medprom-metmal.vercel.app';
const API = process.env.VERIFY_API || 'https://promapi.metmalcommunityspace.web.id';
const EMAIL = process.env.VERIFY_EMAIL || 'tr@metmal.co.id';
const PASSWORD = process.env.VERIFY_PASSWORD || '';
const FINGERPRINT = process.env.VERIFY_FP || 'verify-fp-e2e-1';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `: ${detail}` : ''}`);
};

// Riwayat tenant sebelum review (via API, deterministik).
const before = await fetch(`${API}/api/v1/promo/submissions/mine?fingerprint=${FINGERPRINT}`).then((r) => r.json());
const beforeRow = before.data?.[0];
check('riwayat punya pengajuan uji', Boolean(beforeRow), beforeRow ? `${beforeRow.media_type_slug} ${beforeRow.status}` : 'kosong');
check('baris riwayat memuat nomor pengajuan', Boolean(beforeRow?.submission_number), beforeRow?.submission_number || '');

const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input#email', EMAIL);
  await page.fill('input#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/admin', { timeout: 20000 });
  await page.waitForSelector('button:has-text("Detail")', { timeout: 20000 });

  // Ringkasan per status tampil di dashboard (FR-025).
  const dashBody = await page.textContent('body');
  check('ringkasan status tampil di dashboard', dashBody.includes('Menunggu Review'));

  // Daftar pengajuan memuat baris batch cetak (nomor MPB-...) bila ada.
  check('daftar pengajuan memuat baris batch cetak', /MPB-\d{6}-[0-9A-Z]{6}/.test(dashBody));

  // Buka detail baris pertama → setujui materi + catatan.
  await page.click('button:has-text("Detail")');
  await page.waitForSelector('text=Ubah status', { timeout: 10000 });

  // Dari Menunggu Review, status Sudah Dipasang TIDAK boleh ditawarkan (PRD §8).
  const offered = await page.locator('label:has-text("Sudah Dipasang")').count();
  check('lompatan ke Sudah Dipasang tidak ditawarkan', offered === 0, `${offered} opsi`);

  await page.click('label:has-text("Disetujui")');
  await page.fill('textarea#review-notes', 'Verifikasi produksi: materi disetujui.');
  await page.click('button:has-text("Simpan Status")');
  await page.waitForSelector('text=Ubah status', { state: 'detached', timeout: 15000 });
  check('review tersimpan (modal tertutup)', true);

  // Riwayat tenant mencerminkan status baru.
  const after = await fetch(`${API}/api/v1/promo/submissions/mine?fingerprint=${FINGERPRINT}`).then((r) => r.json());
  const afterRow = after.data?.[0];
  check('status riwayat = disetujui', afterRow?.status === 'disetujui', afterRow?.status);
  check('catatan review tampil ke tenant', String(afterRow?.review_notes).includes('Verifikasi produksi'), afterRow?.review_notes?.slice(0, 40));

  // Halaman status ber-token tenant menampilkan hasil review (FR-020).
  if (afterRow?.status_token) {
    await page.goto(`${BASE}/status/${afterRow.status_token}`, { waitUntil: 'networkidle' });
    const statusBody = await page.textContent('body');
    check('halaman status menampilkan Disetujui', statusBody.includes('Disetujui'));
    check('halaman status menampilkan catatan review', statusBody.includes('Verifikasi produksi'));
  }

  // Pengingat periode berakhir (dashboard staf) - hanya media ber-PPN.
  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  const reminders = await fetch(`${API}/api/v1/admin/submissions/reminders?days=14`, {
    headers: cookie ? { cookie } : {},
  }).then((r) => r.json());
  check('endpoint reminders balas success', reminders.success === true);
  check('respons reminders memuat daftar periode', typeof reminders.data?.due_soon === 'number' && Array.isArray(reminders.data?.items));
} catch (err) {
  check('alur admin', false, err.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} lolos`);
process.exit(failed.length > 0 ? 1 : 0);
