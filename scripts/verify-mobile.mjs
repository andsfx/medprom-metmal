/**
 * Gate UI mobile: memastikan seluruh rute tetap layak pakai di ponsel.
 *
 *   node scripts/verify-mobile.mjs
 *
 * Menjalankan build produksi lewat `scripts/preview-server.mjs` (lihat
 * `AUDIT_BASE`), lalu memeriksa invarian objektif di 360x740 dan 320x568:
 *
 *   1. Tidak ada gulir horizontal di tingkat HALAMAN. Tabel staf boleh
 *      menggulir, tetapi harus DI DALAM wadahnya sendiri.
 *   2. Tidak ada teks di bawah 12px (`--text-meta` adalah batas bawah; lihat
 *      DESIGN.md "Tidak ada teks di bawah 12px").
 *   3. Target sentuh >= 44px (`--tap-min`). Tautan `display: inline` di dalam
 *      prosa dikecualikan sesuai WCAG 2.5.8 (Inline).
 *   4. Di bawah 640px, pasangan spesifikasi ditumpuk: nilai tidak boleh
 *      terpotong oleh wadahnya.
 *
 * Bukan pengganti pemeriksaan mata: tangkapan layar tetap ditulis ke
 * `.tmp/audit/` supaya perubahan bisa ditinjau.
 *
 * Hanya alat verifikasi lokal.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4173';
const TOKEN = process.env.AUDIT_TOKEN || '';
const OUT = '.tmp/audit';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  ['m360', { width: 360, height: 740 }],
  ['m320', { width: 320, height: 568 }],
];

const ROUTES = [
  ['landing', '/'],
  ['wizard-digital', '/ajukan'],
  ['wizard-cetak', '/ajukan-cetak'],
  ['lacak', '/lacak'],
  ['riwayat', '/riwayat'],
  ['login', '/login'],
  ...(TOKEN ? [['status', `/status/${TOKEN}`]] : []),
];

const hasil = [];
const check = (nama, ok, detail = '') => {
  hasil.push({ nama, ok });
  console.log(`${ok ? 'v' : 'x'} ${nama}${detail ? `: ${detail}` : ''}`);
};

/** Ukuran dan invarian satu halaman. */
async function periksa(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const halamanGulir = document.documentElement.scrollWidth > vw + 1;

    // Teks di bawah 12px: hanya daun (tanpa anak) supaya tidak menghitung
    // ulang ukuran induk.
    const kecil = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (!t) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) kecil.push(`${px}px "${t.slice(0, 24)}"`);
    }

    // Target sentuh.
    const sempit = [];
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea')) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      // WCAG 2.5.8 pengecualian Inline: tautan di tengah prosa.
      if (el.tagName === 'A' && cs.display === 'inline') continue;
      // Kotak centang/radio kecil secara sengaja: yang harus >= 44px adalah
      // label pembungkusnya (seluruh kartu bisa disentuh), bukan kotaknya.
      let box = el;
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        const lbl = el.closest('label');
        if (lbl) box = lbl;
      }
      const r = box.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44) {
        sempit.push(`<${el.tagName.toLowerCase()}> ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || '').trim().slice(0, 20)}"`);
      }
    }

    // Nilai spesifikasi tidak boleh melebihi wadahnya.
    // Dunia "Daftar Kerja Seluler" membuang titik penghubung (`doc-leader`):
    // pasangan label/nilai rata kanan, dan ditumpuk di bawah 640px. Ganti
    // pemeriksaannya jadi overflow pada `.ui-spec > dd` supaya invarian yang
    // sama (nilai tidak terpotong) tetap terjaga setelah kelasnya berganti.
    const ddMeluber = [...document.querySelectorAll('.ui-spec > dd, .ui-row-num')]
      .filter((dd) => dd.scrollWidth > dd.clientWidth + 1)
      .map((dd) => dd.textContent.trim().slice(0, 28));

    // Tabel: gulir harus terjadi di dalam wadah, bukan di halaman.
    const tabel = [...document.querySelectorAll('table')].map((t) => {
      const wrap = t.parentElement;
      const cs = wrap ? getComputedStyle(wrap) : null;
      return {
        bisaGulir: wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
        wadahOverflowX: cs ? cs.overflowX : 'none',
      };
    });

    return { vw, halamanGulir, kecil, sempit, ddMeluber, tabel };
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const galatJs = [];
page.on('pageerror', (e) => galatJs.push(String(e)));

for (const [vpNama, viewport] of VIEWPORTS) {
  await page.setViewportSize(viewport);

  for (const [nama, rute] of ROUTES) {
    await page.goto(BASE + rute, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
    const r = await periksa(page);
    await page.screenshot({ path: `${OUT}/${vpNama}-${nama}.png`, fullPage: true });

    check(`[${vpNama}] ${nama}: tanpa gulir halaman`, !r.halamanGulir, r.halamanGulir ? `scrollWidth=${r.vw}` : '');
    check(`[${vpNama}] ${nama}: tanpa teks < 12px`, r.kecil.length === 0, r.kecil.slice(0, 3).join(' | '));
    check(`[${vpNama}] ${nama}: target sentuh >= 44px`, r.sempit.length === 0, r.sempit.slice(0, 3).join(' | '));
    check(`[${vpNama}] ${nama}: nilai tidak terpotong`, r.ddMeluber.length === 0, r.ddMeluber.slice(0, 3).join(' | '));
  }
}

// Wizard cetak langkah 2 dan 3 pada 320px: field per-media dan ringkasan biaya.
for (const [vpNama, viewport] of VIEWPORTS) {
  await page.setViewportSize(viewport);
  await page.goto(BASE + '/ajukan-cetak', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.click('button:has-text("Non-tenant")');
  await page.fill('#cetak-non-tenant', 'PT Gate Mobile');
  await page.fill('#cetak-pic', 'Andi');
  await page.fill('#cetak-phone', '081234567890');
  await page.click('button:has-text("Lanjut")');
  await page.waitForSelector('input[id^="cetak-media-"]', { timeout: 20000 });

  const kotak = page.locator('input[id^="cetak-media-"]').first();
  const slug = String(await kotak.getAttribute('id')).replace('cetak-media-', '');
  await kotak.check();
  await page.fill(`#cetak-target-${slug}`, 'Sisi Pintu Tol Bekasi Barat');
  await page.fill(`#cetak-start-${slug}`, '2026-10-01');
  await page.fill(`#cetak-end-${slug}`, '2026-10-07');
  await page.fill(`#cetak-install-${slug}`, '2026-10-01');
  await page.waitForTimeout(500);
  const r2 = await periksa(page);
  await page.screenshot({ path: `${OUT}/${vpNama}-cetak-langkah2.png`, fullPage: true });
  check(`[${vpNama}] cetak langkah 2: tanpa gulir halaman`, !r2.halamanGulir);
  check(`[${vpNama}] cetak langkah 2: tanpa teks < 12px`, r2.kecil.length === 0, r2.kecil.slice(0, 3).join(' | '));
  check(`[${vpNama}] cetak langkah 2: target sentuh >= 44px`, r2.sempit.length === 0, r2.sempit.slice(0, 3).join(' | '));

  await page.click('button:has-text("Lanjut")');
  await page.waitForSelector('h2:has-text("Ringkasan")', { timeout: 20000 });
  await page.waitForTimeout(700);
  const r3 = await periksa(page);
  await page.screenshot({ path: `${OUT}/${vpNama}-cetak-langkah3.png`, fullPage: true });
  check(`[${vpNama}] cetak langkah 3: tanpa gulir halaman`, !r3.halamanGulir);
  check(`[${vpNama}] cetak langkah 3: tanpa teks < 12px`, r3.kecil.length === 0, r3.kecil.slice(0, 3).join(' | '));
  check(`[${vpNama}] cetak langkah 3: nilai tidak terpotong`, r3.ddMeluber.length === 0, r3.ddMeluber.slice(0, 3).join(' | '));

  // Nominal rupiah tidak boleh terbelah dari "Rp." (non-breaking space).
  // Selektor mengikuti kosakata baru: baris biaya memakai `.ui-num`,
  // `.ui-calc-v`, atau `.ui-row-num` (dulu `doc-num`).
  const biaya = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.ui-num, .ui-calc-v, .ui-row-num')]
      .find((el) => /Rp\./.test(el.textContent || ''));
    if (!p) return null;
    const teks = p.textContent || '';
    return { teks: teks.slice(0, 60), adaNbsp: /\u00A0/.test(teks) };
  });
  check(`[${vpNama}] cetak langkah 3: nominal utuh (NBSP setelah Rp.)`, biaya ? biaya.adaNbsp : true, biaya ? biaya.teks : 'tidak ada baris biaya');
}

// Konsol staf: tabel boleh menggulir, tetapi DI DALAM wadahnya.
for (const [vpNama, viewport] of VIEWPORTS) {
  await page.setViewportSize(viewport);
  // Cookie sesi dari iterasi sebelumnya akan mengalihkan /login ke /admin;
  // bersihkan agar formulir login benar-benar teruji.
  await ctx.clearCookies();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  if (await page.locator('#email').count()) {
    await page.fill('#email', process.env.AUDIT_ADMIN_EMAIL || 'super@metmal.co.id');
    await page.fill('#password', process.env.AUDIT_ADMIN_PASSWORD || 'admin123');
    await page.click('button[type="submit"]');
  }
  await page.waitForTimeout(2500);

  if (!page.url().includes('/admin')) {
    check(`[${vpNama}] admin: login berhasil`, false, 'tidak sampai /admin');
    continue;
  }

  // Tunggu data selesai dimuat: tanpa ini pengukuran bisa menangkap keadaan
  // transisi dan melaporkan luapan palsu.
  await page
    .waitForFunction(() => !document.querySelector('[role="status"] .animate-spin'), { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(800);

  const r = await periksa(page);
  await page.screenshot({ path: `${OUT}/${vpNama}-admin.png`, fullPage: true });
  check(`[${vpNama}] admin: tanpa gulir halaman`, !r.halamanGulir, r.halamanGulir ? 'tabel keluar dari wadah' : '');
  check(`[${vpNama}] admin: tanpa teks < 12px`, r.kecil.length === 0, r.kecil.slice(0, 3).join(' | '));
  const adaTabel = r.tabel.length > 0;
  const semuaTerwadahi = r.tabel.every((t) => t.wadahOverflowX === 'auto' || t.wadahOverflowX === 'scroll');
  check(`[${vpNama}] admin: tabel berada di wadah bergulir`, !adaTabel || semuaTerwadahi, r.tabel.map((t) => t.wadahOverflowX).join(','));

  // Isyarat geser: tabel yang lebih lebar dari layar harus memberi tahu staf
  // bahwa ada kolom lain, dan petunjuknya harus terlihat (di luar wadah gulir).
  const isyarat = await page.evaluate(() => {
    // Luapan ada di WADAH tabel (overflow-x-auto), bukan di elemen <table>:
    // tabel min-w-[760px] di dalam wadah 360px punya clientWidth == scrollWidth
    // sendiri, sehingga mengukur tabel selalu melaporkan "muat".
    const wadah = [...document.querySelectorAll('table')]
      .map((t) => t.parentElement)
      .filter(Boolean);
    const perluGeser = wadah.some((w) => w.scrollWidth > w.clientWidth + 1);
    if (!perluGeser) return { perluGeser: false, terlihat: 0, teks: '' };
    const p = [...document.querySelectorAll('p')].find((el) => /Geser tabel/i.test(el.textContent || ''));
    if (!p) return { perluGeser: true, terlihat: 0, teks: '' };
    const cs = getComputedStyle(p);
    const r = p.getBoundingClientRect();
    const dalamGulir = (() => {
      let n = p.parentElement;
      while (n && n !== document.body) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
        n = n.parentElement;
      }
      return false;
    })();
    return {
      perluGeser: true,
      terlihat: cs.display !== 'none' && r.width > 0 && r.height > 0 ? 1 : 0,
      teks: (p.textContent || '').trim(),
      diDalamWadahGulir: dalamGulir,
      px: parseFloat(cs.fontSize),
    };
  });
  check(
    `[${vpNama}] admin: isyarat geser tampil saat tabel lebih lebar`,
    !isyarat.perluGeser || (isyarat.terlihat === 1 && !isyarat.diDalamWadahGulir),
    isyarat.perluGeser ? `terlihat=${isyarat.terlihat} dalamGulir=${isyarat.diDalamWadahGulir} "${isyarat.teks}"` : 'tabel muat, tidak perlu isyarat',
  );
}

check('tanpa galat JS', galatJs.length === 0, galatJs.slice(0, 2).join(' | '));

await browser.close();

const gagal = hasil.filter((h) => !h.ok);
console.log(`\n${hasil.length - gagal.length}/${hasil.length} lolos`);
if (gagal.length > 0) {
  console.log('GAGAL:');
  for (const g of gagal) console.log(`  - ${g.nama}`);
}
process.exit(gagal.length > 0 ? 1 : 0);
