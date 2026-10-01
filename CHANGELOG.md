# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
penomoran versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]
### Diperbaiki
- **Kepatuhan Web Interface Guidelines diperbaiki.** `theme-color` kini
  light-only (`#ffffff`) karena aplikasi belum memiliki dark mode; override
  dark dihapus. Loading katalog diumumkan lewat `role="status"`,
  `aria-live="polite"`, dan teks ellipsis untuk pembaca layar. Skip link
  keyboard ditambahkan sebelum navigasi tenant dan dashboard admin; target
  `main#app-scroll` serta `main#admin-content` dapat menerima fokus. Field
  autofill relevan mendapat `name` tanpa kehilangan `id` sehingga label serta
  pesan error tetap tertaut. `ConfirmDialog` memakai `transition-colors`,
  typo `hover:` diperbaiki, dan pola focus tanpa replacement diganti ke
  `focus-visible` atau dihapus.
### Ditambahkan
- **Unggah bukti pembayaran pajak untuk media cetak, dengan saklar on/off
  dari dashboard.** Fitur opsional (tidak menghalangi pengiriman) yang bisa
  dinyalakan/dimatikan staf tanpa deploy ulang:
  - **Saklar disimpan di server, bukan build-time.** Tabel baru `app_settings`
    (key-value generik) berisi `tax_proof_enabled` (bawaan `false`). Endpoint
    `GET /promo/settings` (publik, hanya boolean) dan `GET/POST /admin/settings`
    (staf; `tenant_relation` hanya baca). Berbeda dari flag `VITE_*` yang
    di-inline saat build, nilai ini dibaca dari DB tiap permintaan sehingga
    perubahan berlaku langsung.
  - **Wizard cetak.** Bila menyala, langkah "Ringkasan & Kirim" menampilkan
    field unggah bukti pajak (satu berkas untuk seluruh batch; JPEG/PNG/PDF/MP4,
    maks 50MB). Berkas diunggah lewat `/drive/upload` yang sudah ada, lalu
    `tax_proof_*` ikut dikirim di `POST /promo/submit-batch`.
  - **Dashboard staf.** Tab baru "Pengaturan" berisi saklar; sheet detail
    pengajuan menampilkan bukti pajak yang ada dan memungkinkan staf
    menambah/menggantinya lewat `POST /admin/submissions/:id/tax-proof`
    (dibatasi pengajuan ber-PPN; 409 saat fitur mati; fail-closed 503 tanpa
    kredensial Drive).
  - **Halaman tenant.** Bukti pajak yang sudah ada ditampilkan di halaman
    status/pelacakan.
  - **Penghapusan pengajuan membersihkan berkas pajak dari Drive** (best-effort,
    tidak menahan penghapusan baris), supaya tidak meninggalkan berkas yatim -
    sebelumnya hanya berkas materi yang dibersihkan.
  - **Kolom** `tax_proof_file_id/url/name/mime/size_bytes/uploaded_by/
    uploaded_at` ditambahkan aditif pada `promo_submissions` (pengajuan lama
    tetap sah). Saat saklar mati, server MENGABAIKAN field pajak dari klien
    (bukan sekadar tidak menampilkannya), sehingga API tidak bisa dipakai
    menulis data fitur yang mati.
  - **Urutan rilis aman.** `isTaxProofEnabled()` menelan kegagalan baca
    (mis. tabel belum ada karena migrasi belum dijalankan) dan menganggap
    fitur MATI, sehingga deploy kode sebelum migrasi tidak mematikan
    pengajuan cetak dengan 500. **Rilis fitur ini tetap butuh
    `npm run db:migrate`** (membuat `app_settings` + kolom `tax_proof_*`).
  - Dikunci `__tests__/api/tax-proof.test.js` (14 test),
    `PromoCetakWizardPajak.test.tsx` (4 test), `AdminSettingsTab.test.tsx`
    (4 test); ketiganya terbukti merah saat gerbangnya dilepas (uji mutasi).
    Catatan `docs/PLAN_2026-09-25_09-15.md`.

### Diubah
- **Redesign UI/UX menyeluruh: dunia "Daftar Kerja Seluler" diterapkan ke
  seluruh permukaan.** Menggantikan "Lembar Spesifikasi & Tiket Pekerjaan".
  Dunia cetak (tanda potong, nomor plate, garis dimensi, perforasi, titik
  penghubung, kertas abu-netral, process blue) dibuang karena metafora kertas
  memakan ruang dan terbaca sebagai noise di layar 6 inci - perangkat yang
  paling sering dipakai.
  - **Akromatik + stempel.** Kertas putih `#ffffff`, tinta `#09090b`, garis
    rambut `#e4e4e7`, dan **nol warna aksen**: aksi utama memakai tinta penuh.
    Warna hanya tersisa untuk stempel keadaan (setuju/revisi/tolak/tunggu).
  - **Tipografi Instrument Sans** (menggantikan Archivo) + Spline Sans Mono,
    dengan `preload` + `display=swap` + `<noscript>` dan tracking negatif
    per peran (`-0.035em` hero, `-0.03em` bagian, `-0.02em` baris).
  - **Aturan hierarki: angka memimpin.** Nama baris 16px, harga 18px mono,
    total biaya 24px - angka terpenting di layar selalu yang terbesar.
    Baris daftar mengikuti kategori deck (outdoor 5 / indoor 7 / social 2).
  - **Perabot baru:** `.ui-row` (+`-lead`/`-main`/`-head`/`-num`), `.ui-specs`,
    `.ui-calc`, `.ui-timeline`, `.ui-stat`, `.ui-label`, `.ui-figure`,
    `.ui-title-hero`/`-row`. Perabot lama (`doc-crop`, `doc-plate-no`,
    `doc-dim`, `doc-perf`, `doc-leader`, `doc-link`, `doc-stamp`) **dihapus**;
    `doc-num`/`doc-calc`/`doc-rows`/`doc-tag`/`doc-sheet`/`doc-alert`
    dipetakan ke `ui-num`/`ui-calc`/`ui-specs`/`ui-tag`/`ui-card`/`ui-alert`.
  - **Radius 10-16px** (menggantikan 2-6px siku). Skala Tailwind `rounded-*`,
    `slate`/`stone`, dan `red`/`amber`/`green`/`emerald` dipetakan ulang di
    `@theme`, sehingga ratusan utilitas lama ikut palet baru.
  - **Harga katalog mengikuti deck secara verbatim.** `price_note` dipakai
    apa adanya, **satu baris per `\n`**: tangga tarif multi-baris (Videotron 4
    baris), baris berlabel jadi dua kolom (nominal rata kanan), dan kalimat
    panjang turun ke barisnya sendiri. Sebelumnya kolom ini hanya dibaca lewat
    satu jalur sehingga risiko "Gratis" hilang.
  - **Kontras diukur, bukan diklaim.** Tiga nilai pratinjau gagal ambang dan
    dikoreksi: `--ink-muted` `#71717a` -> `#65656e` (4,40:1 di blok isian),
    `--stamp-rev` `#a16207` -> `#8a5a0a` (4,48:1), dan `--rule-strong`
    `#d4d4d8` -> `#8a8a90` (**1,48:1** - tepi input nyaris tak terlihat, gagal
    ambang komponen 3:1). **19/19 pasangan terverifikasi lolos AA.**
  - **Tepi kontrol kini `--rule-strong`,** karena pada input berlatar putih di
    atas halaman putih justru tepi itulah satu-satunya penanda kotak isian.
  - **Mode gelap dihapus** (blok `.dark` di CSS **dan 192 utilitas `dark:`**):
    dunia akromatik bergantung pada kontras tinta-terhadap-kertas, jadi
    membaliknya menuntut audit tersendiri, bukan inversi token.
  - **Empat drift judul diperbaiki sekalian** (audit 2026-09-30): `D1` kelas
    peran judul kini 600 + tracking negatif; `D2` `.ui-title-section` dipakai
    di seluruh h2 (0 sisa judul ad-hoc); `D3` 192 `dark:` dihapus; `D4` hero
    landing memakai `.ui-title-hero` sehingga `--text-sheet` benar-benar dipakai.
  - **Ikon PWA dan manifest diselaraskan ke tinta** (`icon.svg` + 4 PNG
    diregenerasi, `theme_color` `#09090b`, `background_color` `#ffffff`).
    Skeleton critical CSS di `index.html` ikut palet baru.
  - **`CACHE_VERSION` service worker dinaikkan v12 -> v13** karena aset shell
    (ikon, manifest) berubah; pin di `__tests__/service-worker-shell.test.js`
    diperbarui bersamaan.
  - `scripts/verify-mobile.mjs` menyesuaikan selektor ke kosakata baru (dulu
    mem-query `.doc-leader`/`.doc-num` yang sudah tidak ada, sehingga
    pemeriksaannya jadi no-op palsu).
  - Verifikasi: `npx tsc --noEmit` bersih, `npm run build` hijau,
    `npx vitest run` **655/655 hijau**, dan build produksi diperiksa langsung
    pada 6 rute x 6 lebar (320-1280px) - **0 scroll horizontal**. Catatan
    `docs/PLAN_2026-09-30_16-33.md`.
  - **Harga katalog kini satu sumber untuk tiga permukaan.**
    `src/utils/mediaPrice.ts` + `MediaPriceTag.tsx` menggantikan tiga salinan
    logika harga (landing dan kedua wizard). Sebelumnya kedua wizard
    **menggabungkan** `price_note` multi-baris jadi satu kalimat, sehingga
    Sticker Lift tampil sebagai
    `Rp. 3.630.000,-/sisi/bulan (Lift Sisi Luar) Rp. 4.235.000,-/…` dalam satu
    baris - dua tarif berdurasi berbeda terbaca sebagai satu harga. Sekarang
    tangga tarif selalu terpisah per baris di ketiga permukaan.
  - **Kepala baris ditumpuk di bawah 640px.** Terukur di 320px: harga
    `Rp. 6.700.000,-/sisi/bulan` butuh 168px dari lebar baris ~272px. Karena
    angka wajib `nowrap` (kalau membungkus, nominalnya pecah dan tidak bisa
    dibandingkan), yang mengalah adalah nama - "Digital Poster" terpepet sampai
    **10px** dan membungkus satu huruf per baris. Ditumpuk, nama selalu dapat
    lebar penuh dan harga turun ke barisnya sendiri; angka tetap yang terbesar,
    hanya posisinya berubah.
  - **Ukuran media jadi baris spesifikasi, bukan chip di samping nama.** Chip
    `shrink-0` mengambil ~130px di kepala baris dan mengembalikan persoalan yang
    sama; sebagai `.ui-spec` ukurannya terbaca sama dan nama tidak berebut ruang.
  - **68 label disatukan ke `.ui-label`** dengan dua nada (redup untuk metadata,
    `data-tone="strong"` untuk legend/kepala seksi). Nilai warna tiap label
    dipertahankan, jadi **kontrasnya tidak berubah** (tidak ada label yang turun
    dari 19,9:1 ke 5,8:1).
  - Nilai `data-tone` mati (`"process"`, `"none"` pada `.ui-tag`) diganti ke
    `"ink"`/absen; sebelumnya atribut itu tidak punya aturan CSS sama sekali.
  - **Target tap pemilihan media dinaikkan ke 44px.** Label pemilihan di kedua
    wizard hanya setinggi teks nama (**21px**, terukur di 375px). Secara WCAG
    2.2 AA 2.5.8 ini masih lolos lewat pengecualian jarak - tidak ada target
    lain dalam 24px - tetapi proyek ini sudah memakai konvensi 44px
    (`min-h-11`, dengan komentar axe di `AdminDashboardPage`), dan 21px terlalu
    kecil untuk aksi utama wizard di ponsel 6 inci. Kini 223x44px
    (`PromoUploadWizard`) dan 197x44px (`PromoCetakWizard`). Label tetap
    membungkus kontrol + nama saja; tombol "Ketentuan pemasangan" dan checkbox
    persetujuan tetap di luar label sehingga tidak ada kontrol bersarang
    (0 `label label`).
- **`DESIGN.md` ditulis ulang untuk arah "Daftar Kerja Seluler".** Dunia "Lembar
  Spesifikasi & Tiket Pekerjaan" (kertas abu-netral, tanda potong, nomor plate,
  garis dimensi, process blue) dinilai memakan ruang dan terbaca sebagai noise
  di layar 6 inci - tepat perangkat yang paling sering dipakai tenant.
  - **Sistem baru: akromatik + stempel.** Kertas putih `#ffffff`, tinta
    `#09090b`, garis rambut `#e4e4e7`, dan **nol warna aksen** - aksi utama
    adalah tinta penuh, bukan warna merek. Warna hanya untuk stempel keadaan.
  - **Tipografi: Instrument Sans** (menggantikan Archivo) + Spline Sans Mono.
    Tracking negatif tetap: `-0.035em` hero, `-0.03em` judul bagian.
  - **Aturan hierarki baris:** angka memimpin, nama mengalah, label mengecil.
    Harga/total/KPI selalu elemen terbesar di barisnya.
  - **Radius 10-12px** (menggantikan 2-6px siku). Perabot `doc-*` (394
    kemunculan) dipetakan ke awalan tunggal `ui-*`; `.doc-crop`,
    `.doc-plate-no`, `.doc-dim`, dan `.doc-perf` **dihapus tanpa pengganti**
    karena tidak memberi informasi kepada tenant.
  - **Mode gelap dihapus** dari dokumen sebagai keputusan produk: dunia ini
    akromatik dan bergantung pada kontras tinta-terhadap-kertas, jadi membalik
    kontras menuntut audit tersendiri. 192 utilitas `dark:` dinyatakan kode mati.
  - **Kontras dihitung ulang, bukan diklaim.** Tiga nilai mockup terbukti gagal
    ambang dan dikoreksi: `--ink-muted` `#71717a` -> `#65656e` (4,40:1 di atas
    blok isian), `--stamp-rev` `#a16207` -> `#8a5a0a` (4,48:1), dan
    `--rule-strong` `#d4d4d8` -> `#8a8a90` (1,48:1, gagal ambang komponen
    3:1). 16 pasangan terverifikasi lolos AA.
  - **Empat drift judul ditemukan saat audit** dan dicatat sebagai pekerjaan:
    `D1` bobot/tracking kelas judul, `D2` `.ui-title-section` dipakai 0x
    sementara 14 `<h2>` menduplikasi string kelas verbatim, `D3` 192 `dark:`
    mati, `D4` hero landing memakai `text-3xl sm:text-5xl` ad-hoc sehingga
    `--text-sheet` 0 pemakaian.
  - **Peringatan urutan ditambahkan** di kepala dokumen: `DESIGN.md` kini
    **mendahului kode**. Aturan "kode menang" belum berlaku sampai migrasi
    selesai; daftar selisihnya ada di bagian Catatan Ketidaksesuaian.
  - **Urutan harga katalog dikunci: `price_amount` -> `price_note` -> "Hubungi".**
    Produksi **sudah** menampilkan `price_note` verbatim
    (`PromoLandingPage.tsx:102-132`), jadi informasi "Gratis" dan "Rp 6.700.000"
    tidak hilang hari ini. Yang berubah adalah **dokumennya**: `DESIGN.md` kini
    mengunci urutannya sebagai aturan, karena mockup pratinjau v5 sempat
    menyimpulkan "tidak ada `price_amount`" = "tidak ada harga" dan menampilkan
    LED Banner sebagai "Hubungi Marcom" - padahal deck menyatakannya
    **gratis bersyarat**.
  - Urutan yang benar: `price_amount` ada -> angka mono; jika kosong tetapi
    `price_note` ada -> `price_note` **verbatim** (berlaku untuk 6 media);
    keduanya kosong -> "Hubungi TR"/"Hubungi Marcom" menurut kanal (berlaku
    untuk 4 media: `boom-gate`, `sticker-lift`, `videotron`,
    `videotron-integrasia`).
  - **Pengelompokan katalog memakai kategori deck, bukan kanal.** Hanya 3 dari
    14 slug berkanal `cetak`, jadi mengelompokkan per kanal akan memecah katalog
    menjadi "3 cetak" dan "11 sisanya" serta menghapus struktur
    `outdoor`/`indoor`/`social` yang justru dipakai deck (outdoor 5 - indoor 7 -
    social 2). Kanal tetap dipakai sebagai tag baris dan penentu rute
    (`/ajukan-cetak` vs `/ajukan`).
  - Dokumen ini **belum diterapkan ke kode**. Catatan
    `docs/PLAN_2026-09-30_16-33.md`.
- **Setiap rute kini dimuat malas (code splitting), sehingga bundel awal turun
  ~50%.** Sebelumnya kesepuluh halaman diimpor statis di `src/App.tsx`, jadi
  **setiap pengunjung beranda ikut mengunduh konsol staf**
  (`AdminDashboardPage`, ~2.380 baris) dan kedua wizard - halaman yang tidak
  pernah dibuka mayoritas pengunjung publik. Kini `React.lazy` + satu
  `Suspense` di sekitar `<Routes>` dengan fallback `role="status"`.
  - Bundel awal: **452 kB → 226 kB** (gzip **119,9 → 73,1 kB**). Chunk admin
    (80 kB / 17 kB gzip), kedua wizard, dan halaman lain hanya diunduh saat
    rutenya dibuka.
  - Konsol staf tidak lagi ikut bundel publik. Ini **bukan pengamanan** - kode
    tetap dapat diunduh siapa pun yang meminta chunk-nya; otorisasi nyata tetap
    di server. Yang dihemat hanya unduhan.
  - Test rute di `src/__tests__/App.test.tsx` disesuaikan dari `getByRole`
    sinkron ke `findByRole` asinkron (kontrak rute tidak berubah, hanya
    mekanisme muatnya).
- **Redesign UI/UX menyeluruh: dunia "Lembar Spesifikasi & Tiket Pekerjaan".**
  Seluruh permukaan (landing, wizard digital + cetak, status/batch, lacak,
  riwayat, login, konsol staf) memakai dunia visual baru: kertas kerja
  `#f2f2ef` + lembar `#fbfbf9`, tinta `#101010`, satu warna proses `#1440d6`,
  warna stempel untuk keadaan, dan perabot dokumen (tanda potong, garis
  dimensi, nomor plate, tabel titik penghubung, stempel, perforasi). Tipografi
  Archivo (kerja + display) + Spline Sans Mono (data/angka). Tanpa bayangan dan
  tanpa blur: kedalaman dari garis dan kecerahan permukaan. Radius dipetakan
  ke 2-6px (siku). Skala Tailwind `slate`/`stone` dan `red`/`amber`/`green`/
  `emerald` dipetakan ulang di `@theme` ke palet ini, sehingga komponen lama
  ikut berubah tanpa disentuh. Komponen baru `Stamp.tsx` menjadi satu sumber
  stempel status. Kontras `--ink-muted` dinaikkan agar lolos AA. Rincian dan
  bukti verifikasi ada di `docs/PLAN_2026-09-24_19-50.md`.
- **Sisa dunia lama dibersihkan (ditemukan lewat pemeriksaan artefak build).**
  `.ui-chrome` masih membawa `backdrop-filter: blur(12px)` - dibuang. Ikon PWA
  (`icon.svg` + `icon-192/512`, `icon-maskable-512`, `apple-touch-icon`) dan
  `theme_color`/`background_color` manifest masih memakai tosca lama
  `#00918E` - diselaraskan ke process blue `#1440D6` dan kertas `#f2f2ef`;
  ikon PNG digambar ulang dari geometri SVG baru dengan radius luar yang
  ditajamkan. Judul halaman login diseragamkan ke kelas peran `.ui-title-screen`.
- **H1 landing dikembalikan ke frasa yang dikunci `scripts/verify-e2e.mjs`**
  ("Ajukan Materi Promosi Tenant Anda"). Redesign sempat memendekkannya menjadi
  "Ajukan Materi Promosi", yang akan menggagalkan pemeriksaan produksi; skrip
  verifikasi tidak boleh diubah, jadi kode yang disesuaikan. Frasa tetap
  ditampilkan dalam gaya dunia baru (kapital besar, Archivo).

### Operasional
- **Deploy produksi 2026-09-24 (VPS + Vercel).** Produksi sebelumnya
  menjalankan kode `f4effbe` di atas DB yang belum pernah di-migrate untuk
  kolom alur cetak, sehingga fitur cetak hanya tampil di katalog tetapi
  pengirimannya tidak berfungsi. Migrasi diuji lebih dulu di salinan DB
  terbuang (menangkap perilaku constraint sebelum menyentuh data asli), lalu
  dijalankan ke produksi dengan urutan stop API, migrate, seed, up API. Data
  lama (2 pengajuan, 14 media, 3 user) utuh. Rincian dan query deteksi data
  warisan ada di `docs/PLAN_2026-09-24_17-35.md`.

### Diperbaiki
- **Halaman `/lacak` tidak lagi menjadi jalan buntu saat captcha gagal dimuat.**
  Bila widget Turnstile tidak dapat dipasang (kasus nyata: sitekey belum
  terdaftar pada hostname → Cloudflare membalas `error-callback` `110200`),
  halaman sebelumnya gagal secara **senyap**: placeholder hilang, tidak ada
  pesan galat, tombol Lacak terkunci selamanya, dan UI tetap menyuruh pengguna
  "selesaikan verifikasi captcha di atas" - menunjuk ruang kosong yang tak akan
  pernah terisi. Terukur di produksi: `iframe` 0, `.cf-turnstile` 0, token `''`.
  - `TurnstileWidget` kini **memakai `error-callback`** (sebelumnya dibuang) dan
    melaporkan keadaan itu lewat prop baru `onUnavailable`. Pesannya diubah dari
    "Periksa koneksi" menjadi jujur dan memberi langkah lanjut.
  - `/lacak` membedakan "pengguna belum menyelesaikan captcha" dari "captcha
    tidak akan pernah muncul": yang kedua **tidak lagi mengunci tombol**, jadi
    pencarian tetap dapat dicoba dan pengguna tidak terjebak. Pesan yang salah
    diganti keterangan bahwa verifikasi sedang tidak tersedia.
  - **Perbaikan konfigurasi tetap diperlukan** agar captcha hidup kembali:
    daftarkan `medprom-metmal.vercel.app` di *Turnstile → widget → Settings →
    Hostname Management*. Perubahan ini membuat kegagalan itu terlihat dan
    tidak mematikan fitur, bukan mengaktifkan captcha kembali.
  - Dikunci 2 test di `Turnstile.test.tsx` (terbukti merah saat gerbangnya
    dilepas - uji mutasi).
- **Judul dokumen mengikuti layar, bukan seragam di semua rute.** Sebelumnya
  `/`, `/ajukan`, `/ajukan-cetak`, `/riwayat`, `/lacak`, dan `/login` semuanya
  berjudul sama, sehingga riwayat peramban, daftar tab, dan penanda tidak bisa
  dibedakan. Hook baru `src/hooks/useDocumentTitle.ts` menyetel judul per layar
  (mis. "Lacak Pengajuan · Media Promosi Metropolitan Mall Bekasi") dan
  memulihkan judul sebelumnya saat unmount; `AppShell` menerapkannya otomatis
  untuk 9 layar tenant, sedangkan `/login` dan `/admin` (yang punya kerangka
  sendiri) menyetelnya eksplisit - `/admin` mengikuti tab aktif.
- **Umpan balik galat pada wizard cetak disamakan dengan wizard digital.**
  Audit UI/UX 2026-09-30 menemukan dua celah di `/ajukan-cetak`:
  - **Fokus tidak berpindah ke field tidak valid pertama.** Setelah submit
    gagal, fokus tetap di `BODY` sementara pesan galat muncul di tempat lain
    pada lembar yang panjang. Di PWA terpasang tidak ada scroll bar yang
    memberi petunjuk posisi, jadi pengguna yang menekan "Lanjut" dari dasar
    lembar tidak melihat apa pun berubah. Kini `PromoCetakWizard` memakai pola
    `fokusKeField()` + `focusErrorTick` yang sudah terbukti di
    `PromoUploadWizard` (fokus + `scrollIntoView({block:'center'})`), dipicu
    dari `goStep2`, `goStep3`, dan gerbang persetujuan ketentuan.
  - **Pesan galat combobox tenant tidak diumumkan.** `TenantSearchSelect`
    merender pesan galatnya tanpa `role="alert"` - satu-satunya dari seluruh
    field di kedua wizard yang begitu - sehingga galat field pertama tidak
    sampai ke pengguna pembaca layar. Ditambahkan `role="alert"`; kaitannya
    dengan perbaikan fokus di atas membuat galat pertama kini terbaca dua kali
    (diumumkan + saat difokuskan), bukan nol kali.
  - `html` mendapat `scroll-padding-top` setinggi app bar lengket sebagai
    jaring pengaman WCAG 2.2 "Focus Not Obscured" (mitigasi kanonik; terukur
    saat ini belum ada target yang tertutup).
  - Catatan `docs/PLAN_2026-09-30_15-41.md`.
- **UI mobile: lantai ukuran teks dan tabel titik penghubung yang rusak di
  layar sempit.** Audit terukur di 360x740 dan 320x568 menemukan dua cacat:
  - **86 tempat memakai teks di bawah 12px** (`text-[11px]` 84x, `text-[10px]`
    2x) di konsol staf, kedua wizard, dan landing - melanggar aturan keras
    DESIGN.md ("Tidak ada teks di bawah 12px"; `--text-meta` = 12px adalah
    batas bawah). Semua dinaikkan ke `text-xs` (12px). Label kapital ber-track
    adalah teks yang paling sulit dibaca di ponsel, jadi ini perbaikan
    keterbacaan, bukan sekadar kepatuhan.
  - **Tabel titik penghubung (`.doc-row`) rusak di bawah 640px.** Pola satu
    baris (label - titik - nilai) hanya terbaca bila nilai muat satu baris; di
    ponsel nilai seperti "4 x 8m Horizontal (Resolusi 1025 x 2000 Pixel)"
    membungkus sampai tiga baris sementara titik penghubung menyusut jadi 12px,
    sehingga terbaca "Material ..... Sticker di Impraboard". Terukur 17 dari 44
    baris katalog membungkus di 320px. Di bawah 640px baris kini DITUMPUK
    (label di atas, nilai di bawah, rata kiri, lebar penuh) dan titik
    penghubung disembunyikan; di 640px ke atas tampilan dokumen dipertahankan
    apa adanya. Dipakai `overflow-wrap: break-word` (bukan `anywhere`) supaya
    token mono hanya pecah bila benar-benar tak muat.
  - **Nominal rupiah tidak lagi terbelah dari "Rp."** `rupiah()` di wizard
    cetak memakai spasi biasa setelah "Rp.", sehingga di 320px baris biaya
    terbelah "Rp." / "543.900". Diganti non-breaking space (U+00A0): titik
    putus berpindah ke pemisah "+ PPN" / "=", dan kontrak teks uji tetap cocok
    karena normalizer testing-library memperlakukan U+00A0 sebagai whitespace.
  - **Nomor pengajuan dan tanggal di konsol staf tidak lagi membungkus.**
    "MP-260919-EKWNQU" terbelah tiga baris di kolom sempit; kini
    `whitespace-nowrap` (tabel staf memang menggulir di dalam wadahnya). Sel
    email pengguna diberi `break-all` agar alamat panjang tidak melebarkan
    tabel `min-w-[640px]` melebihi wadah `overflow-x-auto`.
  - **Isyarat geser untuk tabel staf di ponsel.** Tabel pengajuan, katalog
    media, dan pengguna lebih lebar dari layar ponsel, jadi kolom status/aksi
    tersembunyi di luar pandangan tanpa petunjuk apa pun. Kini ada baris
    "Geser tabel ke samping untuk melihat kolom lain." (`lg:hidden`, jadi
    tidak muncul di desktop). Petunjuknya sengaja diletakkan DI LUAR wadah
    `overflow-x-auto`: di dalam, ia ikut tergulir dan justru hilang saat paling
    dibutuhkan. Dikunci `scripts/verify-mobile.mjs` yang mengukur luapan di
    WADAH tabel (bukan di elemen `<table>`, yang `scrollWidth`-nya selalu sama
    dengan `clientWidth`) dan memastikan petunjuk terlihat serta berada di luar
    wadah gulir.
  - **Gate baru `scripts/verify-mobile.mjs`** (93 pemeriksaan): menjalankan
    build produksi lewat preview server, lalu memastikan di 360x740 dan
    320x568 tidak ada gulir horizontal tingkat halaman, tidak ada teks < 12px,
    target sentuh >= 44px (kotak centang diukur dari label pembungkusnya;
    tautan inline dikecualikan sesuai WCAG 2.5.8), titik penghubung tersembunyi
    di mobile, nilai tidak terpotong, tabel staf tetap di dalam wadah
    bergulirnya, dan nominal rupiah utuh. Bukti dan tangkapan layar ada di
    `docs/PLAN_2026-09-25_13-58.md`.
- **Service worker tidak menyapu cache aset shell setelah ikon PWA diganti.**
  Aturan #2 `public/sw.js` mewajibkan `CACHE_VERSION` dinaikkan setiap rilis
  yang mengubah aset shell, tetapi commit `077de87` mengganti ikon PWA
  (`icon.svg`, `icon-192/512`, `icon-maskable-512`, `apple-touch-icon`) tanpa
  menaikkannya, sehingga pengguna yang sudah punya service worker lama terus
  disajikan ikon lama dari cache tanpa batas. `CACHE_VERSION` dinaikkan `v11`
  ke `v12`; event `activate` menyapu seluruh cache `medprom-*` lama. Dikunci
  `__tests__/service-worker-shell.test.js` (2 test) yang mem-pin pasangan
  (versi, hash isi aset shell): mengubah aset shell tanpa memperbarui pin
  gagal, memaksa keputusan versi cache diambil.
- **Wizard cetak tidak lagi melompat ke langkah Pilih Media saat media
  dipilih dari katalog.** Membuka `/ajukan-cetak?media=<slug>` (mis. dari
  kartu cetak di landing) dulu langsung membuka langkah 2 "Pilih Media &
  Periode" karena efek pra-pilih memanggil `setStep(2)`, padahal langkah 1
  "Data Pemohon" (pilih Tenant/Non-tenant) belum diisi. Wizard cetak kini
  selalu dimulai dari langkah Data Pemohon; media dari katalog tetap ditandai
  terpilih lebih awal sehingga sudah tercentang saat staf sampai ke langkah
  media. Langkah Data Pemohon juga menampilkan penanda "Media terpilih: ..."
  bila media sudah dipilih dari katalog, supaya staf tidak mengira pilihannya
  hilang. Dikunci `PromoCetakWizardPreselect.test.tsx` (5 test, terbukti merah
  pada kode sebelum perbaikan). Catatan
  `docs/PLAN_2026-09-25_08-40.md`.
- **Pemasangan tanpa materi kini meminta konfirmasi eksplisit (opsi B).**
  Staf tetap boleh mencatat pemasangan untuk pengajuan cetak yang belum
  menerima materi (materi bisa diterima di luar aplikasi), tetapi lebih dulu
  menjawab dialog "Materi belum diterima. Tetap catat pemasangan?" yang
  menyebut konsekuensinya. Sebelumnya status Sudah Dipasang bisa ditetapkan
  tanpa satu pun isyarat keputusan. Dikunci
  `AdminDashboardPeringatanMateri.test.tsx`. Catatan
  `docs/PLAN_2026-09-24_17-04.md`.
- **Form revisi hanya tampil di perangkat pengirim.** Server kini menurunkan
  `is_owner` (boolean) pada empat jalur publik (`status/:token`, `track`,
  `batches/status/:token`, `batches/track`) dengan membandingkan fingerprint
  pemanggil; `device_fingerprint` mentah tetap tidak pernah dikirim. Di
  perangkat lain, status Perlu Revisi menampilkan keterangan alih-alih form
  yang pasti ditolak server.
- **Pengingat periode berakhir mencakup materi yang belum tercatat terpasang.**
  Query kini menyertakan `disetujui` dan `siap_dipasang` sebagai kategori
  terpisah ("belum tercatat terpasang"), sehingga periode yang habis tanpa
  pernah dicatat pemasangannya tidak luput. Panel menampilkan jumlah dan badge
  kategori. Index `idx_ps_status_airend` ikut diperluas ke ketiga status
  (dilepas lalu dibuat ulang, karena `CREATE INDEX IF NOT EXISTS` tidak
  memperbarui index yang sudah ada).
- **Pengingat tidak lagi kehilangan baris ber-pajak yang PPN-nya membulat
  nol.** Penanda "kena pajak" berubah dari `ppn_amount > 0` (hasil pembulatan)
  menjadi `ppn_rate > 0` (tarif yang benar-benar terpasang).
- **Parameter `days` pada pengingat divalidasi.** Nilai di luar 1 sampai 365
  kini dibalas `400`, bukan diam-diam dipangkas atau dijadikan default 14
  (`days=0` sebelumnya menjadi 14 tanpa pemberitahuan).
- **Integritas durasi dan kuantitas pengajuan cetak ditegakkan di skema.**
  CHECK BERSYARAT `source_type <> 'none' OR duration_days >= 7` (baris cetak
  wajib minimal 7 hari) dan `quantity >= 1`, keduanya dipasang `NOT VALID`.
  Pembebasnya adalah KANAL, bukan nilai durasinya: `duration_days` adalah kolom
  bersama alur digital yang sah bernilai 0, dan bentuk
  `duration_days = 0 OR duration_days >= 7` akan selalu benar sehingga
  CHECK-nya vakum. `NOT VALID` wajib supaya baris cetak warisan berdurasi
  kurang dari 7 hari tidak menggagalkan `db:migrate` (constraint tetap
  mengikat baris baru). Perubahan skema ini memerlukan `npm run db:migrate`
  saat deploy.
- **Dokumen desain `docs/PLAN_2026-09-20_16-00.md` dikoreksi.** `PPN_RATE`
  berada di `src/utils/pricing.ts` (bukan `src/constants/promo.ts`), dan rumus
  PPN yang benar adalah `subtotal - subtotal / (1 + rate)` dengan pembulatan
  half-up sejati.
- **Tenant kini dapat melihat sisa hari periodenya.** Halaman status ber-token
  dan halaman pelacakan (`SubmissionDetail`) hanya menampilkan rentang tanggal
  statis. Baris "Periode" kini menambahkan sisa hari: "N hari lagi", "berakhir
  hari ini", atau "lewat N hari" (merah). Dihitung dari tanggal perangkat
  (`daysUntil` + `toIsoDate`); angka otoritatif tetap milik server pada panel
  staf. Dikunci `SubmissionDetailSisaHari.test.tsx`.
- **Alur revisi materi tidak lagi meninggalkan keadaan setengah jadi.** Handler
  `POST /promo/submissions/:id/revision` melakukan tiga tulis berurutan tanpa
  transaksi dengan UPDATE status lebih dulu, sehingga kegagalan di tengah bisa
  memindahkan status dan menimpa materi lama sementara versi/riwayat hilang.
  Urutan kini dibalik agar dapat dikompensasi (versi + riwayat lebih dulu,
  UPDATE status terakhir) dan baris yang telanjur masuk dihapus bila langkah
  gagal, sehingga status `perlu_revisi` tetap utuh. `insertFileVersion` dan
  `insertHistory` mengembalikan `RETURNING id` untuk kompensasi presisi. Ini
  BUKAN transaksi sejati (jendela antar-statement masih ada); transaksi sejati
  tetap butuh izin karena menyentuh `server/src/db.js` dan mock 17 test. Dikunci
  `promo-revision-kompensasi.test.js`. Catatan
  `docs/PLAN_2026-09-24_16-37.md`.
- **Pembulatan uang kini half-up sejati (cermin FE dan BE).** `round2` di
  `src/utils/pricing.ts` dan `server/src/lib/pricing.js` memakai
  `Math.round((n + Number.EPSILON) * 100) / 100`, yang bukan half-up sejati:
  nilai `.xx5` yang representasi float-nya sedikit di bawah `.5` dibulatkan
  TURUN, sehingga mall kurang 1 sen per baris ber-harga-sen (terbukti
  `round2(10.075) = 10.07`, dan PPN atas subtotal 171,50 menjadi 18.86 bukan
  18.87). Keduanya kini memakai `Math.round((n * 100) + 1e-9) / 100`. Dikunci
  `__tests__/api/pricing-round-half-up.test.js`.
- **Kuantitas pada pengajuan cetak batch tidak lagi dapat dikendalikan
  klien.** `POST /promo/submit-batch` mengambil `quantity` apa adanya dari body,
  padahal wizard tidak punya input kuantitas dan selalu menampilkan 1x, sehingga
  pemanggil API langsung bisa ditagih kelipatan tanpa terlihat di layar. Nilai
  selain 1 kini ditolak `400` (`Media ke-N: kuantitas tidak didukung dan harus
  1`) sebelum apa pun ditulis; nilai absen tetap dianggap 1. Dikunci
  `__tests__/api/promo-batch-quantity.test.js`.
- **Hari kalender operasional kini WIB di sisi server.** Opsi `Pool`
  (`server/src/db.js`) ditambah `options: '-c timezone=Asia/Jakarta'` sehingga
  `CURRENT_DATE` dan cast `::date` (pengingat periode berakhir dan filter
  tanggal daftar pengajuan) memakai hari WIB, bukan default UTC container.
  `deploy/vps/docker-compose.yml` juga menyetel `TZ: Asia/Jakarta` pada layanan
  `postgres` dan `api` (proses Node) agar validasi lead time memakai hari WIB.
  Sisi FE (`src/utils/leadTime.ts`) sengaja belum diselaraskan: memaksa WIB di
  sana membuat tanggal perangkat WITA/WIT bisa mundur sehari, jadi itu
  keputusan pemilik.
- **Wizard cetak kini punya afordan lead time.** `PromoCetakWizard` memvalidasi
  tanggal pemasangan per media memakai `rules` katalog (bukan klaim klien),
  menambahkan atribut `min`, pesan galat per baris, dan teks afordan, meniru
  wizard unggah. Sebelumnya tanggal pasang yang mustahil baru ketahuan setelah
  kirim (server menolak).
- **Baris pengingat periode berakhir dapat diklik ke detail pengajuan.**
  Sebelumnya baris hanya menampilkan nomor/tenant dan tautan WhatsApp, tanpa
  jalan ke detail pengajuan terkait.
- **Panel pengingat membedakan "gagal memuat" dari "kosong".** Sebelumnya
  kegagalan pemuatan pengingat tidak terlihat (state-nya sama dengan "belum
  dimuat"), sehingga staf bisa mengira tidak ada pengingat. Kini galat
  ditampilkan eksplisit (`role="alert"`). Keadaan kosong sengaja TIDAK
  ditambahkan karena desain "panel tersembunyi bila kosong" dikunci test lama
  (`AdminDashboardPage.test.tsx`).
- **Tiga skrip verifikasi produksi diselaraskan.** `scripts/verify-e2e.mjs`
  mengklik `a:has-text("Ajukan Materi")` yang cocok dengan kartu cetak (kini
  menuju `/ajukan-cetak`), sehingga timeout menunggu `input#pic-name`; kini
  memilih tautan wizard digital secara eksplisit (`a[href^="/ajukan?"]`).
  `scripts/verify-tenant-upload.mjs` membuka `?media=spanduk` yang kini
  dialihkan ke `/ajukan-cetak`; kini memakai `?media=videotron` (kanal digital,
  format menerima PNG) beserta asersi dan teks pendukung yang menyesuaikan.
  `scripts/verify-cetak.mjs` mengisi tanggal pemasangan H+1, padahal ketiga
  media cetak memuat aturan lead time "paling lambat 2 hari sebelum pemasangan"
  yang SUDAH ditolak server dengan `400`; kini memakai H+2. Ketiga skrip tidak
  dijalankan (menulis ke produksi); hanya diperiksa sintaksnya. Detail di
  `docs/PLAN_2026-09-23_21-13.md` dan `docs/PLAN_2026-09-24_16-16.md`.
- **Pengajuan cetak batch kini menolak 400 bila persetujuan ketentuan tidak
  dicentang.** Handler `POST /promo/submit-batch`
  (`server/src/routes/promo.js`) sebelumnya hanya menyimpan nilai
  `terms_accepted` apa adanya. Kini ia menegakkan persis seperti alur digital
  `POST /promo/submit`, dengan `if (!termsAccepted) errors.push('Persetujuan
  ketentuan wajib dicentang')`, sehingga nilai selain boolean `true` (termasuk
  string `'true'` atau field yang dihilangkan) ditolak 400 sebelum apa pun
  ditulis. Dasar: izin pemilik untuk menyesuaikan dua fixture batch lama yang
  tidak mengirim `terms_accepted` (`__tests__/api/promo-batch.test.js`,
  `__tests__/api/cetak-batch-limits.test.js`). Keduanya HANYA ditambah satu
  field `terms_accepted: true` pada `BASE`, tanpa mengubah assertion apa pun,
  karena payload itu memang valid di bawah kontrak baru. Dikunci
  `__tests__/api/promo-batch-terms.test.js` (4 test perilaku: true -> 201,
  false -> 400, field dihilangkan -> 400, string `'true'` -> 400; tiga kasus
  terakhir juga memastikan tidak ada INSERT). Catatan
  `docs/PLAN_2026-09-24_14-44.md`.
- **Lokasi pemasangan pada unggah bukti tayang kini diambil dari pengajuan,
  bukan dari `req.body` yang selalu kosong.** Handler
  `POST /admin/submissions/:id/installation/proof` (`server/src/routes/admin.js`)
  pada cabang `else` (saat `promo_installations` belum punya baris) mengisi
  `media_location` dari `sanitize(req.body?.media_location || '', 200) ||
  'Belum ditentukan'`. Padahal `readMultipartFile` (`server/src/drive.js`)
  adalah parser multipart streaming yang SENGAJA mengabaikan field non-file,
  dan FE (`src/utils/adminApi.ts: uploadInstallationProof`) hanya mengirim field
  `file`; jadi `media_location` SELALU jatuh ke literal `'Belum ditentukan'`
  meski komentar kode menyatakan "lokasi dari pengajuan". Lokasi kini dibaca
  dari `media_target` pengajuan (query `SELECT media_target FROM
  promo_submissions WHERE id = $1 LIMIT 1`, hasilnya disimpan pada
  `existing.media_target`), dan `$2` menjadi
  `sanitize(existing.media_target || '', 200) || 'Belum ditentukan'`; fallback
  `'Belum ditentukan'` dipertahankan sebagai jaring terakhir bila `media_target`
  kosong. Catatan implementasi: instruksi meminta memperluas SELECT awal
  (`SELECT id, status FROM promo_submissions ...`), tetapi bentuk SELECT itu
  dikunci test lama (`__tests__/api/admin-cetak.test.js`,
  `__tests__/api/admin-flow.test.js`) yang menge-mock lewat substring SQL persis
  - memperluasnya membuat mock jatuh ke `{ rows: [] }` dan handler membalas 404
  (2 test lama pecah, terbukti empiris). Karena test lama tidak boleh disunting,
  sumber lokasi diambil lewat query kedua yang setara; bentuk SELECT pertama
  tetap utuh. **Test lama tidak tersentuh.** Dikunci
  `__tests__/api/admin-installation-proof-location.test.js` (berkas baru,
  4 test, handler sungguhan): `media_target` pengajuan tersimpan pada parameter
  INSERT (bukan `'Belum ditentukan'`), `media_location` dari `req.body`
  diabaikan, dan `media_target` kosong memakai fallback. Catatan
  `docs/PLAN_2026-09-24_12-10.md`.
- **Nama pelaku riwayat revisi tenant tidak lagi kosong.** Handler
  `POST /promo/submissions/:id/revision` (`server/src/routes/promo.js`) memanggil
  `insertHistory({ ..., actorType: 'tenant', actorName: '' })`, sehingga baris
  `promo_submission_history` mencatat nama pelaku kosong, padahal jalur tenant
  lain (`promo.js` sekitar baris 456 dan 947) memakai nama PIC (`actorName:
  picName`). SELECT pengajuan di handler itu kini turut mengambil `pic_name`,
  dan `insertHistory` memakai `actorName: submission.pic_name || ''`. Tidak ada
  perilaku lain yang diubah. Dikunci
  `__tests__/api/promo-revision-actor.test.js` (berkas baru, 3 test, handler
  sungguhan): parameter INSERT `promo_submission_history` memuat nama PIC
  pengajuan, bukan string kosong; `pic_name` kosong tetap aman. Catatan
  `docs/PLAN_2026-09-24_12-10.md`.
- **Persetujuan ketentuan pada pengajuan cetak batch tidak lagi dipalsukan.**
  Handler `POST /promo/submit-batch` (`server/src/routes/promo.js`) menuliskan
  nilai KONSTANTA `true` ke kolom `terms_accepted` tiap baris `promo_submissions`
  dan tidak pernah membaca `body.terms_accepted`, sehingga kolom itu tidak
  membuktikan persetujuan apa pun; sementara alur digital `POST /promo/submit`
  memang menegakkannya (`if (!termsAccepted) errors.push('Persetujuan ketentuan
  wajib dicentang')`). Server kini membaca `const termsAccepted =
  body.terms_accepted === true;` dan menyimpan nilai itu APA ADANYA pada array
  `row` (literal `true` dihapus). `BatchSubmitPayload`
  (`src/utils/promoApi.ts`) menambah `terms_accepted: boolean`, dan
  `PromoCetakWizard.tsx` mengirim `terms_accepted: termsAccepted` di payload
  `submitBatch(...)` pada `handleSubmit` (state itu sudah menggerbang tombol
  kirim). **Penegakan 400 SENGAJA DITUNDA:** menolak 400 saat `terms_accepted`
  bukan `true` akan memecahkan fixture batch lama
  (`__tests__/api/promo-batch.test.js`, `__tests__/api/cetak-batch-limits.test.js`)
  yang tidak mengirim field itu dan masih mengharapkan 201/429, sehingga
  perubahan kontrak itu menunggu keputusan pemilik. **Test lama tidak
  tersentuh.** Dikunci `__tests__/api/promo-batch-terms.test.js` (berkas baru,
  4 test, handler sungguhan): `true` tersimpan boolean `true`, `false` tersimpan
  boolean `false`, field dihilangkan tersimpan boolean `false` (bukan lagi
  `true`), plus penjaga regresi sumber handler. Catatan
  `docs/PLAN_2026-09-24_11-11.md`.
- **Riwayat tenant terpotong 50 secara senyap, dan tombol kembali halaman
  status bergantung pada riwayat perangkat.** (1) `GET /promo/submissions/mine`
  (`server/src/routes/promo.js`) memakai `LIMIT 50` dan membalas `{ success,
  data }` tanpa penanda apa pun, sementara `MySubmissionsPage.tsx` merender
  daftar itu langsung, sehingga tenant dengan lebih dari 50 pengajuan tidak
  bisa melihat pengajuan lamanya dan tidak diberi tahu; akibat lanjutan,
  `status_token` pengajuan ke-51 dan seterusnya tidak terjangkau sehingga jalan
  menuju form revisi hilang. Server kini mendukung paginasi ADITIF lewat
  `?offset=<n>`: tanpa `offset` bentuk query dan parameter tetap sama seperti
  sebelumnya (`LIMIT 50 OFFSET 0`, parameter hanya fingerprint), `offset` cacat
  mundur ke 0, dan respons menambah `total` (jumlah seluruh pengajuan
  perangkat) serta `offset` di samping `data`. Urutan query dijaga (hitungan
  total lebih dulu) dan subquery `batch_item_count` tetap tidak terpotong
  paginasi. `fetchMySubmissions` (`src/utils/promoApi.ts`) mengembalikan
  `{ rows, total }` dan tetap menerima bentuk lama (array polos), jadi pemanggil
  lama tidak berubah. `MySubmissionsPage.tsx` menampilkan penanda jujur
  ("Menampilkan N dari M pengajuan terbaru") beserta tombol "Muat lagi" yang
  memuat halaman berikutnya dan MENAMBAH baris (bukan menggantinya); tanpa
  `total` dari server, halaman penuh (`MY_SUBMISSIONS_PAGE_SIZE`, cermin
  `LIMIT 50`) dianggap mungkin masih ada sisa. (2) `SubmissionStatusPage.tsx`
  dan `BatchStatusPage.tsx` memakai `backTo="/riwayat"`, padahal kedua halaman
  bisa dibuka dari perangkat lain lewat tautan/token dan di perangkat itu
  `/riwayat` kosong ("Belum ada pengajuan dari perangkat ini"), sehingga tenant
  merasa pengajuannya hilang. Dipilih arahkan tombol kembali ke beranda (`/`)
  supaya perilakunya SAMA di setiap cara masuk, termasuk saat tautan dibuka
  langsung tanpa riwayat navigasi. Teks lain di kedua halaman tidak diubah.
  Dikunci empat test baru: `__tests__/api/promo-mine-paginasi.test.js` (8
  test), `src/utils/__tests__/promoApiMinePaginasi.test.ts` (6 test),
  `src/components/promo/__tests__/MySubmissionsPagePaginasi.test.tsx` (5 test),
  dan `src/components/promo/__tests__/StatusPageTombolKembali.test.tsx` (4
  test). Dua arah terbukti: pada kode sebelum perbaikan 20 test merah (3 test
  penjaga aditivitas tetap hijau), sesudah perbaikan 23 test hijau. Catatan
  `docs/PLAN_2026-09-24_10-37.md`.
- **Janji "simpan nomor batch untuk memantau" di layar sukses wizard cetak
  tidak bisa ditepati: `/lacak` hanya melacak nomor pengajuan, bukan nomor
  batch.** Layar sukses `PromoCetakWizard.tsx` menampilkan nomor batch
  `MPB-YYMMDD-XXXXXX` dan menyuruh tenant menyimpannya, tetapi halaman `/lacak`
  (`TrackSubmissionPage.tsx`) hanya memanggil `fetchStatusByNumber` dan server
  menolak format `MPB-` lewat `SUBMISSION_NUMBER_RE`, sehingga tenant yang
  menyimpan NOMOR BATCH (bukan tautan/token) tidak punya jalan melacaknya.
  Endpoint `GET /promo/batches/track?number=&captcha=` (`server/src/routes/promo.js`)
  ternyata SUDAH menerima nomor batch, mengembalikan `batch_token`, dan
  digerbangi captcha Turnstile `action='track-batch'`; jadi tidak ada endpoint
  server baru maupun perubahan skema. `src/utils/promoApi.ts` menambah
  `fetchBatchByNumber(number, captchaToken)` mengikuti pola `fetchStatusByNumber`
  (termasuk token captcha), `BatchRow` (`src/types/promo.ts`) menambah
  `batch_token?`, dan `TrackSubmissionPage.tsx` memilih jalur dari awalan input:
  `MPB-` menuju pelacakan batch lalu diarahkan ke `/batch/<batch_token>` yang
  sudah ada (bila `batch_token` tidak ada, pesan jelas ditampilkan alih-alih
  navigate ke rute kosong), `MP-` tetap ke pelacakan pengajuan. Teks bantuan dan
  placeholder kini menyebut KEDUA format, dan input di luar keduanya ditolak di
  klien tanpa memanggil server. Putaran ini juga memperbaiki BLOCKER captcha:
  widget Turnstile semula mengirim `action='track'` untuk kedua jalur, padahal
  server memverifikasi `action='track-batch'` di `/batches/track` dan menolak
  bila aksi tidak cocok (`turnstile.js`), sehingga pelacakan batch selalu gagal
  saat captcha aktif. `TrackSubmissionPage.tsx` kini menurunkan
  `turnstileAction` dari awalan input (`MPB-` menjadi `track-batch`, selain itu
  `track`) dan mengopernya ke widget. Dikunci test baru
  `TrackSubmissionPageBatch.test.tsx` (8 test, termasuk tiga test aksi captcha).
  Dua arah terbukti: pada kode sebelum perbaikan 4 test merah untuk jalur batch
  dan 1 test merah untuk aksi captcha, sesudah perbaikan 8 test hijau. Catatan
  `docs/PLAN_2026-09-24_09-48.md`.
- **Tiga cacat tampilan sisi tenant: anchor materi mati, galat API disamakan
  dengan "tidak ditemukan", dan teks batch kontradiktif.** (1) Di
  `src/components/promo/SubmissionDetail.tsx`, blok materi dan blok riwayat
  versi materi hanya memisahkan literal `source_type === 'none'`, sehingga
  `source_type` `'link'`/`'upload'` dengan `link_url`/`file_url` kosong tetap
  dirender `<a href="">` dan klik hanya memuat ulang halaman. Kanal kini
  ditentukan dari ADA/TIDAKNYA URL (preseden `src/utils/proof.ts`): URL kosong
  menjadi baris informasi, bukan anchor; perilaku `'none'` dan kasus URL
  terisi tidak berubah. (2) `SubmissionStatusPage.tsx` dan
  `BatchStatusPage.tsx` memakai `catch { setNotFound(true); }`, sehingga galat
  jaringan/503 tampil sebagai "Pengajuan tidak ditemukan". `ApiError`
  (`src/lib/rest.ts`) kini membawa `status` HTTP (properti tambahan, pesan/tipe
  lama utuh), `promoApi.ts` menambah `isNotFoundError`, dan kedua halaman
  memisahkan 404 ("tidak ditemukan") dari galat lain (panel "gagal memuat"
  dengan tombol "Coba lagi" yang memanggil ulang pemuatan). (3)
  `MySubmissionsPage.tsx` selalu menulis "beberapa media (N media dalam
  kiriman ini)", sehingga batch berisi 1 media menampilkan "beberapa media (1
  media...)". Kalimat kini dipilih dari `batch_item_count`: `> 1` menyebut
  "beberapa media" + jumlah, tepat 1 memakai kalimat tanpa kata "beberapa",
  dan tanpa angka tetap kualitatif tanpa mengarang jumlah. Dikunci tiga test
  baru: `SubmissionDetailMateriUrlKosong.test.tsx` (5 test),
  `StatusPageGagalMuat.test.tsx` (7 test), dan
  `MySubmissionsPageBatchSatu.test.tsx` (3 test). Dua arah terbukti: pada kode
  sebelum perbaikan 9 test merah (6 test penjaga perilaku lama tetap hijau),
  sesudah perbaikan 15 test hijau. Catatan `docs/PLAN_2026-09-24_09-41.md`.
- **Nomor batch dibuang UI di kolom "Nomor" tabel daftar pengajuan
  dashboard admin, sehingga staf tidak bisa mengenali baris pengajuan cetak
  (batch) dari daftar.** API daftar `GET /admin/submissions`
  (`server/src/routes/admin.js` baris 143) sudah mengirim `b.batch_number`
  lewat `LEFT JOIN promo_submission_batches`, dan tipe FE
  `AdminSubmissionRow` (`src/types/promo.ts` baris 227) sudah menyediakan
  `batch_number`, tetapi sel kolom "Nomor" di
  `src/components/admin/AdminDashboardPage.tsx` hanya merender
  `submission_number` sehingga data batch menjadi data mati (Sheet detail
  justru sudah menampilkan "Nomor Batch"). Sel itu kini menambah baris kecil
  `{r.batch_number && <p ...>{r.batch_number}</p>}` di bawah nomor pengajuan,
  murni aditif: header kolom, lebar, urutan kolom, dan sel lain tidak diubah,
  dan baris non-batch (`batch_number` null/undefined) tidak merender apa pun.
  Dikunci test baru `src/components/admin/__tests__/AdminDashboardBatchNumber.test.tsx`
  (2 test). Test dibuktikan bermakna lewat uji dua arah: pada kode sebelum
  perubahan 1 test merah (nomor batch tidak dirender), setelah perubahan 2
  test hijau. Perbaikan ini mewujudkan perilaku yang dimaksud asersi lama
  `scripts/verify-admin-flow.mjs` baris 50 (`MPB-\d{6}-[0-9A-Z]{6}`) TANPA
  menyentuh skrip; asersi itu sendiri adalah bawaan lama commit `c901935`
  (2026-09-22) yang selalu gagal sejak lahir karena API saat itu belum
  mengirim `batch_number`.
- **Endpoint pengingat periode berakhir tidak pernah terjangkau sehingga kanal
  pengingat mati total.** Di `server/src/routes/admin.js`,
  `router.get('/submissions/:id', ...)` terdaftar lebih dulu daripada
  `router.get('/submissions/reminders', ...)`. Karena Express 4 mencocokkan
  rute berurutan, `reminders` ditangkap sebagai `:id` (params
  `{ id: 'reminders' }`), lalu `WHERE s.id = 'reminders'` pada kolom UUID
  memicu galat Postgres `22P02` menjadi HTTP 500. Di FE, `loadReminders`
  menelan galat dan memanggil `setReminders(null)`, sehingga panel "Pengingat
  periode berakhir" tidak pernah dirender. Karena integrasi email ditunda
  (`docs/PLAN_2026-09-23_21-18.md`), panel itu satu-satunya kanal pengingat,
  jadi kanal tersebut mati total. Blok handler pengingat kini dipindah utuh ke
  ATAS rute `:id` (mengikuti preseden `GET /submissions/summary` yang juga
  didaftarkan sebelum `:id`), dengan isi handler tidak diubah sedikit pun dan
  path `:id` sengaja tidak diubah bentuknya agar test lama yang mengambil
  handler lewat `adminRouter.stack.find((l) => l.route?.path ===
  '/submissions/:id')` tetap menemukan layer. Dikunci test regresi baru
  `__tests__/api/admin-route-order.test.js` yang memasang `adminRouter` ke
  aplikasi Express sungguhan dan menembaknya lewat HTTP nyata (test lama tidak
  menangkap bug ini karena memanggil handler langsung dari `adminRouter.stack`
  sehingga pencocokan rute Express tidak pernah dieksekusi). Test dibuktikan
  bermakna lewat uji dua arah: pada kode sebelum perbaikan 2 test merah (rute
  tertutup `:id`), setelah perbaikan 3 test hijau.
- **Label "(N media dalam kiriman ini)" di riwayat tenant menghitung angka
  dari baris yang termuat sehingga undercount.** Commit sebelumnya
  (`8c601d6`) menambahkan label itu di `MySubmissionsPage.tsx`, tetapi nilai N
  dihitung DI KLIEN lewat `useMemo` `jumlahPerBatch` yang menurunkan angka dari
  array `rows`, padahal `GET /promo/submissions/mine` memakai `LIMIT 50`.
  Untuk tenant dengan lebih dari 50 pengajuan, sebagian baris batch tidak ikut
  dimuat dan batch berisi 5 media bisa tertulis "1 media dalam kiriman ini".
  Label yang seharusnya membantu justru memberi angka salah. Handler
  `/submissions/mine` (`server/src/routes/promo.js`) kini menambahkan subquery
  eksplisit
  `(SELECT count(*)::int FROM promo_submissions x WHERE x.batch_id = s.batch_id) AS batch_item_count`
  yang TIDAK punya LIMIT sendiri, sehingga tidak terkena `LIMIT 50` milik
  daftar (LIMIT memotong daftar pengajuan per perangkat, bukan isi batch).
  Kolom itu ditambahkan HANYA di query `/mine`; konstanta bersama
  `SUBMISSION_PUBLIC_COLUMNS` dan varian ber-alias `SUBMISSION_PUBLIC_COLUMNS_S`
  sengaja TIDAK diubah supaya jalur publik lain tidak ikut membawanya. Di FE,
  `useMemo` `jumlahPerBatch` dihapus beserta impor `useMemo` yang menjadi tak
  terpakai, dan label kini memakai `r.batch_item_count` dari server; nomor
  batch, tautan status, tautan batch, dan urutan data tidak diubah. Angka total
  yang benar hanya diketahui server karena klien tidak punya informasi baris
  yang terpotong oleh LIMIT. Dikunci 3 test baru di
  `__tests__/api/promo-mine-batch.test.js` (berkas lama yang ditambahi, test
  lama dipertahankan utuh) dan 2 test baru di
  `src/components/promo/__tests__/MySubmissionsPageBatch.test.tsx` (berkas lama
  yang ditambahi, test lama tidak dihapus atau dilemahkan; fixture `ROW_BATCH`
  diberi `batch_item_count: 2` agar test lama tetap bermakna). Test dibuktikan
  bermakna lewat uji dua arah: melepas kolom server menyebabkan 2 test BE
  gagal, mengembalikan hitungan klien menyebabkan 2 test FE gagal, lalu
  keduanya dipulihkan dan hijau.
- **Panel "Pengingat periode berakhir" menyembunyikan item tepat pada kasus
  yang paling butuh perhatian.** Panel itu hanya merender
  `reminders.items.slice(0, 5)` lalu menampilkan teks mati `+N lainnya`,
  sedangkan endpoint `GET /admin/submissions/reminders` mengembalikan hingga
  200 item. Akibatnya staf yang punya lebih dari 5 media mendekati akhir
  periode tidak punya cara melihat sisanya, sehingga informasi yang diminta
  pemilik lewat notifikasi dashboard terpotong senyap. Panel kini dapat dibuka
  lengkap: teks mati itu diganti `<button>` ber-`aria-expanded`,
  `aria-controls="pengingat-daftar"`, dan `min-h-11` (target sentuh 44px)
  dengan label dinamis "Tampilkan N lainnya" / "Sembunyikan", `<ul>` diberi
  `id="pengingat-daftar"` plus kelas kondisional `max-h-80 overflow-y-auto`
  saat terbuka supaya daftar panjang menggulir di dalam panel, dan sumber
  baris menjadi daftar penuh saat terbuka (tetap 5 saat tertutup). Tata letak
  dan isi tiap baris (label sisa hari, tautan "Ingatkan via WhatsApp", warna
  lewat/akan berakhir) tidak diubah, dan bila item <= 5 tidak ada tombol
  sehingga perilaku lama dipertahankan. Dikunci
  `src/components/admin/__tests__/AdminDashboardPengingatLengkap.test.tsx`
  (baru, 3 test: 7 item menghasilkan 5 baris awal plus tombol "Tampilkan 2
  lainnya" ber-`aria-expanded=false`; setelah klik menjadi 7 baris plus tombol
  "Sembunyikan" ber-`aria-expanded=true` dan wadah bergulir; 3 item tanpa
  tombol). Test dibuktikan bermakna lewat uji sementara (perilaku lama
  dipulihkan, 2 test gagal, lalu dipulihkan dan hijau).
- **Kartu katalog media cetak mengarah ke wizard digital yang mewajibkan
  unggah materi.** `PromoLandingPage.tsx` merender kartu untuk SEMUA media
  aktif dan setiap kartu menaut ke `/ajukan` (wizard materi digital), padahal
  tiga media berkanal `cetak` (spanduk, big-banner, umbul-umbul) juga muncul
  di katalog Outdoor/Indoor. Akibatnya kartu media cetak mendarat di wizard
  yang MEWAJIBKAN unggah/tautan materi, sedangkan alur cetak justru tidak
  meminta berkas (materi menyusul lewat revisi) dan punya form sendiri di
  `/ajukan-cetak` (multi-media + perkiraan PPN 11%). Fitur alur cetak jadi
  tidak terjangkau dari katalog, hanya bisa lewat tombol di hero. Tujuan
  tautan kini mengikuti KANAL media: `media_channel === 'cetak'` menuju
  `/ajukan-cetak?media=<slug>`, selainnya tetap `/ajukan?media=<slug>`.
  Label "Ajukan Materi" SENGAJA tidak diubah karena dipakai bersama kartu
  digital di grid yang sama dan sudah dikunci test lama. Dikunci 5 test baru
  di `src/components/promo/__tests__/PromoLandingPage.test.tsx` (berkas lama
  yang ditambahi) yang memakai dua kartu cetak di kategori BERBEDA (spanduk
  outdoor, big-banner indoor) untuk membuktikan kanal, bukan kategori, yang
  menentukan. **PENGECUALIAN yang disengaja:** satu assertion lama di berkas
  yang sama diperbarui dari `'/ajukan?media=spanduk'` menjadi
  `'/ajukan-cetak?media=spanduk'`, karena assertion itu menuntut tujuan wizard
  digital untuk Spanduk yang berkanal cetak sehingga justru **MENGUNCI BUG**,
  bukan perilaku yang diinginkan. Angka tegas: 1 assertion diubah, 0 test
  dihapus, dan assertion lain tidak disentuh.
- **Wizard digital masih menerima media cetak, di dua sisi sekaligus.**
  `PromoUploadWizard.tsx` memanggil `fetchMediaTypes()` tanpa argumen kanal
  sehingga media cetak ikut ditawarkan di langkah 1, dan handler
  `POST /promo/submit` (`server/src/routes/promo.js`) mencari media hanya
  dengan `slug` + `is_active` tanpa memeriksa kanal sehingga server MENERIMA
  pengajuan digital untuk media cetak. Tenant yang tersasar ke wizard digital
  diminta mengunggah materi yang seharusnya menyusul lewat revisi. Daftar
  langkah 1 kini disaring dengan `media_channel !== 'cetak'`, dan server
  menolak `400` dengan pesan yang menuntun ke `/ajukan-cetak`. Penegakan
  server ini adalah cermin yang sepadan dengan `loadCetakMedia` di
  `POST /promo/submit-batch` yang sudah lebih dulu menegakkan
  `media_channel = 'cetak'`. **Keputusan penting:** penyaringan memakai
  `!== 'cetak'` (BUKAN `=== 'digital'`) dan penolakan server memakai
  `=== 'cetak'`, keduanya fail-safe, karena banyak baris katalog dan fixture
  lama tidak mengisi `media_channel` sehingga media warisan harus tetap boleh
  dipilih dan tetap diterima server. Dikunci `__tests__/api/promo-submit-kanal.test.js`
  (baru, 4 test yang memanggil HANDLER SUNGGUHAN: cetak ditolak `400` tanpa
  `INSERT`, digital lolos, media tanpa penanda kanal lolos, dan `SELECT`
  memuat kolom `media_channel`) dan
  `src/components/promo/__tests__/PromoUploadWizardSaringCetak.test.tsx`
  (baru, 3 test).
- **Jalur pintas `?media=` di wizard digital melewati penyaring kanal.**
  Blok `preselect` di `PromoUploadWizard` hanya memeriksa KEBERADAAN slug
  (`rows.some(...)`) lalu langsung `setStep(2)` tanpa memeriksa kanal,
  sehingga membuka `/ajukan?media=spanduk` melompat ke langkah 2 dengan media
  cetak terpilih dan pengguna baru ditolak server di AKHIR form. Server memang
  sudah menangkapnya (tidak gagal senyap), tetapi pengalamannya buruk karena
  pengguna baru tahu setelah mengisi semuanya. Bila slug yang diminta
  berkanal `cetak`, wizard kini mengalihkan ke `/ajukan-cetak?media=<slug>`
  (memakai `useNavigate` dengan `replace: true`) alih-alih melompat ke
  langkah 2; form cetak sudah membaca param yang sama. Penjaga tetap
  `=== 'cetak'` (fail-safe, media tanpa penanda kanal berperilaku lama).
  Dikunci `src/components/promo/__tests__/PromoUploadWizardPreselectCetak.test.tsx`
  (baru, 3 test: cetak dialihkan, digital berperilaku lama, tanpa penanda
  kanal berperilaku lama). Test dibuktikan bermakna lewat uji sementara
  (cabang redirect dinonaktifkan, 1 test gagal, lalu dipulihkan).
- **Header ekspor CSV masih memakai istilah lama `Nama Gerai`.** Repo sudah
  memutuskan mengganti "gerai" menjadi "tenant" di seluruh teks yang dilihat
  pengguna, tetapi kolom ekspor CSV di handler `GET /export`
  (`server/src/routes/admin.js`) masih memakai `'Nama Gerai'`, sehingga berkas
  yang diunduh staf memakai istilah yang sudah tidak dipakai di UI mana pun.
  Kolomnya kini `'Nama Tenant'`. Dikunci assertion baru di
  `__tests__/api/admin-export-csv.test.js` (header memuat `'Nama Tenant'` dan
  tidak memuat `'Nama Gerai'`). Sisa istilah `gerai` di repo hanya ada di
  komentar `scripts/verify-tenant-upload.mjs` dan data uji
  `src/components/promo/__tests__/PromoUploadWizard.test.tsx`, keduanya bukan
  teks UI dan sengaja dibiarkan.
- **Pengajuan cetak tanpa materi dirender sebagai tautan materi kosong.**
  Form cetak (`POST /promo/submit-batch`) sengaja tidak meminta berkas materi
  sehingga pengajuan disimpan `source_type='none'` (materi menyusul lewat alur
  revisi), tetapi kedua UI memperlakukan semua yang bukan `'link'` sebagai
  berkas. Akibatnya pengajuan itu tampil dengan `href=""` yang saat diklik
  hanya memuat ulang halaman: di `SubmissionDetail` (halaman status tenant,
  pelacakan, dan batch) berlabel "Berkas materi" dengan teks "Lihat berkas";
  di `AdminDashboardPage` baris materi berlabel "File", SEL MATERI di tabel
  pengajuan, tombol primer "Buka tautan materi", dan tombol "Salin tautan"
  yang menyalin baris `Tautan: ` kosong. Kanal `none` kini berupa baris
  informasi "Materi menyusul setelah pengajuan disetujui." tanpa anchor, tombol
  buka materi tidak dirender (tombol WA tetap dirender karena tidak bergantung
  materi), sel tabel menampilkan "menyusul" (istilah yang sama dengan ekspor
  CSV), dan "Salin tautan" menyalin keterangan menyusul. Perilaku `link` dan
  `upload` tidak berubah: label, `href`, `target`, dan `rel` diverifikasi tetap
  sama lewat assert. Dikunci
  `src/components/promo/__tests__/SubmissionDetailMateriMenyusul.test.tsx` dan
  `src/components/admin/__tests__/AdminDashboardMateriMenyusul.test.tsx`;
  test baru itu diverifikasi bermakna dengan memulihkan kode lama sementara
  (6 dari 11 test gagal terhadap kode lama).
- **Backfill versi materi bisa menggagalkan `db:migrate` berulang di DB yang
  sudah berisi pengajuan cetak.** `server/schema.sql` bersifat idempotent dan
  dijalankan ulang, sedangkan blok backfill yang menyalin
  `promo_submissions.source_type` ke `promo_submission_files.source_type`
  memakai `WHERE NOT EXISTS` yang **selalu benar** untuk pengajuan cetak:
  pengajuan itu (`source_type='none'`) tidak pernah membuat baris versi materi,
  sehingga backfill menyalin `'none'` ke tabel files yang
  `CHECK (source_type IN ('upload','link'))` dan `npm run db:migrate` gagal
  pada pelanggaran CHECK. Sifatnya deterministik dan berulang setiap migrate,
  dan hanya muncul di DB yang sudah berisi pengajuan cetak (DB baru selalu
  hijau) sehingga tidak tertangkap test DB baru. Ini kelas pitfall #6 yang sama
  dengan urutan migrasi `source_type` untuk `promo_submissions`. Klausa `WHERE`
  backfill kini ditambah `s.source_type <> 'none'`. CHECK tabel files
  **sengaja tidak** dilonggarkan: tabel itu menyimpan **versi materi**, dan
  pengajuan tanpa materi memang tidak punya versi, sehingga melonggarkan CHECK
  akan mengizinkan baris "versi materi" yang tidak bermakna. Dikunci 3 test
  baru di `__tests__/api/schema-migration.test.js` (berkas lama yang ditambahi;
  test lama tidak diubah) yang mengunci pengecualian `none` sekaligus mengunci
  CHECK tetap hanya `('upload','link')`.
- **Baris "Nomor Batch" di Sheet detail staf tidak akan pernah tampil.** Baris
  itu dirender bila `detail.batch_number` ada, tetapi endpoint
  `GET /admin/submissions` dan `GET /admin/submissions/:id` memakai `SELECT
  s.*` tanpa join ke `promo_submission_batches`, sehingga kolomnya tidak
  pernah ikut terkirim dan baris itu hanya lolos di test karena fixture test
  mengarang nilainya. Ini kelas bug "kolom hilang dari SELECT" yang sudah
  pernah terjadi (kasus `media_channel`). Kedua handler kini memakai
  `LEFT JOIN promo_submission_batches b ON b.id = s.batch_id` dan mengambil
  HANYA `b.batch_number` (bukan `b.*`, karena banyak kolom bertabrakan dengan
  `s.*`). Karena join membuat `created_at` ambigu (ada di kedua tabel) dan
  `buildSubmissionFilters` menghasilkan klausa `WHERE` tanpa prefix alias,
  seluruh kolom filter dikualifikasi `s.` dan query COUNT diberi alias `s` agar
  `whereSql` yang sama tetap valid. Dikunci
  `__tests__/api/admin-submission-batch.test.js` (baru) yang memanggil HANDLER
  SUNGGUHAN lewat `router.stack`, bukan mock FE.
- **Label PPN ringkasan batch selalu "Total PPN" walau harganya sudah termasuk
  PPN.** Untuk media ber-`ppn_included`, `ppn_amount` adalah **porsi PPN di
  dalam** subtotal (bukan pajak yang ditambahkan), sehingga labelnya
  menyesatkan dengan cara yang sama seperti label di wizard sebelum
  diperbaiki. Label di `src/components/promo/BatchStatusPage.tsx` kini
  mengikuti data batch: `Total PPN` bila tidak ada item ber-`ppn_included`, dan
  `Termasuk PPN` bila ada, ditambah keterangan kecil hanya untuk kasus
  campuran (kalimatnya sama dengan yang dipakai `PromoCetakWizard.tsx`). Nilai
  angkanya tidak diubah (Sigma `ppn_amount` dan Sigma `total_amount` tetap),
  dan label "Total tagihan" tidak diubah. Label non-included yang berbeda antar
  komponen adalah keputusan sadar, bukan cacat: di wizard kolom itu berdiri di
  antara Subtotal dan Total (baris tarif, "PPN 11%"), sedangkan di halaman
  batch kolom itu berdiri di samping "Total tagihan" (nilai agregat, "Total
  PPN"). Dikunci `src/components/promo/__tests__/BatchStatusPagePpn.test.tsx`
  (baru).
- **Bukti tayang kanal unggahan tidak pernah terlihat tenant.** Staf sudah
  dapat mengunggah bukti tayang ke Google Drive, tetapi halaman status tenant
  hanya merender `proof_url`. Akibatnya berkas tersimpan ke Drive dan DB tanpa
  satu pun tempat yang menampilkannya: tenant tidak melihat apa pun di
  `/status/:token`, `/lacak`, maupun `/batch/:token`, dan blok "Informasi
  pemasangan" di dashboard staf pun hanya merender `proof_url`. Ditambah helper
  baru `src/utils/proof.ts` (`installationProofViews`, `formatProofSize`,
  `proofMimeLabel`) sebagai **satu sumber kebenaran** pemetaan dua kanal bukti
  tayang ke bentuk render, dipakai bersama oleh `SubmissionDetail` (tiga jalur
  publik) dan Sheet detail staf. Kanal ditentukan dari **ada/tidaknya URL**,
  bukan kolom `proof_kind`: baris warisan dapat ber-`proof_kind` `'link'`
  bawaan sekaligus punya berkas tersimpan, dan URL kosong tidak boleh berubah
  menjadi tautan mati. Baris kosong tidak dihasilkan. Dikunci
  `src/utils/__tests__/proof.test.ts`,
  `src/components/promo/__tests__/SubmissionDetailProof.test.tsx`, dan
  `src/components/admin/__tests__/AdminDashboardDetailProof.test.tsx`.
- **Total PPN form cetak dihitung dua kali untuk media ber-`ppn_included`.**
  Ringkasan menjumlahkan `subtotal + ppnAmount`, padahal untuk media yang
  harganya sudah termasuk PPN, PPN berada **di dalam** subtotal
  (`totalAmount === subtotal`). Subtotal Rp 100.000 tampil sebagai Total
  Rp 109.909,91. Total ringkasan kini selalu Sigma `totalAmount` (satu sumber
  kebenaran), label per media mengikuti `ppn_included`, dan baris per media
  berbentuk "Rp X (sudah termasuk PPN Rp Y)" atau "subtotal + PPN = total".
  Label agregat tetap persis "PPN 11%" selama tidak ada media ber-`ppn_included`
  dan menjadi "Termasuk PPN" bila ada. Keterangan "Perkiraan; harga final
  sesuai penawaran Tenant Relations" dipertahankan. Dikunci
  `src/components/promo/__tests__/PromoCetakWizardTotal.test.tsx`.
- **Satu media tidak bisa dipasang di beberapa lokasi.** Baris form di-key oleh
  `slug`, sehingga memilih media yang sama dua kali tidak mungkin, padahal
  permintaan pemilik adalah satu form untuk beberapa media. Baris kini memakai
  `id` unik, ditambah tombol **"Tambah lokasi lain"** per media, dan batas
  `MAX_BATCH_ITEMS` (10) dihitung **per baris** alih-alih per media. Pemulihan
  draf `sessionStorage` dibuat toleran terhadap draf lama tanpa `id`. Dikunci
  `src/components/promo/__tests__/PromoCetakWizardLokasi.test.tsx`.
- **`id` input per baris form cetak memakai UUID acak sehingga kontrak skrip
  verifikasi rusak.** `scripts/verify-cetak.mjs` mengisi
  `input#cetak-target-<slug>` dengan selector deterministik, sedangkan komponen
  membangkitkan UUID acak per baris. `id` kini deterministik berbasis slug
  untuk baris pertama dan bersufiks indeks untuk baris tambahan, sehingga
  kontrak skrip kembali sah. Dikunci
  `src/components/promo/__tests__/PromoCetakWizardIdKontrak.test.tsx`.
- **Daftar media di langkah 2 form cetak belum dikelompokkan Outdoor/Indoor.**
  Media kini ditampilkan berkelompok per kategori katalog
  (`CATEGORY_LABELS`/`CATEGORY_ORDER`), sesuai workflow form media promosi
  outdoor dan indoor.
- **Baris "Deskripsi" di Sheet detail staf hilang saat kosong.** Baris itu
  hanya dirender bila `material_description` berisi, sehingga staf mengira data
  hilang. Ini nyata untuk pengajuan kanal cetak karena `PromoCetakWizard`
  memang tidak punya field deskripsi dan `POST /promo/submit-batch` tidak
  mengisi kolom itu. Baris kini selalu tampil dengan penanda "tidak diisi".
- **Kolom "Harga" katalog (`price_note`) disunting lewat input satu baris.**
  Kolom itu menyimpan tangga tarif **multi-baris** dari deck, sedangkan
  spesifikasi HTML men-strip CR/LF dari nilai `<input type="text">`: staf yang
  membuka Edit lalu menekan Simpan tanpa menyentuh kolom Harga akan
  menggabungkan seluruh tangga tarif menjadi satu baris panjang. Diganti
  `<textarea>`. Sekaligus kolom "Ketentuan" (`rules`) diberi helper text bahwa
  isinya tampil ke tenant di katalog publik dan diparse untuk lead time.
- **Sheet detail staf tidak pernah menampilkan jenis pemohon.** `POST /promo/submit-batch`
  menyimpan `applicant_type` (`tenant`/`non_tenant`) dan `AdminSubmissionRow`
  sudah membawanya, tetapi Sheet detail hanya punya satu baris berlabel
  "Tenant" sehingga pemohon non-tenant tidak bisa dibedakan dan labelnya
  menyesatkan. Sheet kini menampilkan baris **"Jenis Pemohon"** (memakai
  `APPLICANT_TYPE_LABELS`), label baris nama menyesuaikan jenisnya ("Nama
  Tenant" / "Nama Non Tenant", nilainya tetap `tenant_name`), penanda
  "(MID ...)" dan "(manual, tidak tertaut MID)" hanya muncul untuk tenant,
  ditambah baris **"Nomor Batch"** bila ada dan baris **"Perkiraan biaya"**
  (subtotal, PPN, total, format rupiah) yang hanya dirender bila
  `total_amount > 0` supaya pengajuan lama tanpa snapshot tidak menampilkan
  baris nol. Angkanya diberi keterangan perkiraan karena pengajuan ini tidak
  melakukan penagihan. Dikunci
  `src/components/admin/__tests__/AdminDashboardApplicantType.test.tsx`.
- **Selector basi di skrip verifikasi wizard digital.** `verify-e2e.mjs` dan
  `verify-tenant-upload.mjs` mengklik tombol `"Lanjut — Kirim Materi"` yang
  sudah tidak ada sejak label tombol diubah menjadi `"Lanjut ke Kirim Materi"`
  (`PromoUploadWizard.tsx`). Keduanya kini memakai label aktual sehingga
  langkah "Kirim Materi" kembali dapat dilalui. Sekaligus menghabiskan sisa
  em-dash terencana di `scripts/`.

### Dirapikan
- **Assertion baca-sumber yang rapuh dihapus dari test T5 (persetujuan
  ketentuan batch cetak).** `__tests__/api/promo-batch-terms.test.js` memuat
  satu blok `it(...)` terakhir yang membaca TEKS SUMBER handler
  (`String(getHandler('/submit-batch', 'post'))`) lalu mencocokkan regex
  (`toContain('termsAccepted')`, `not.toMatch(/installation_date, true,/)`).
  Assertion itu mengunci detail implementasi/plumbing, bukan perilaku, dan
  rapuh (gagal palsu bila urutan kolom INSERT diubah). Blok itu dihapus; tiga
  assertion perilaku yang tersisa (`true` tersimpan boolean `true`, `false`
  tersimpan boolean `false`, field dihilangkan tersimpan boolean `false`)
  tetap mengunci kontrak, dan revert ke konstanta `true` akan tetap tertangkap
  kasus "field dihilangkan -> false". Test lain tidak disentuh. **Pilihan
  seksi:** ditulis di `### Dirapikan` karena tidak ada perilaku produk yang
  diubah, hanya test yang dibersihkan.
- **Hasil audit field form cetak: semua field yang diminta pemilik sudah ada.**
  Audit read-only memetakan tiap field permintaan pemilik (`docs/PLAN_2026-09-20_16-00.md:299-301`,
  yaitu tanggal pengajuan, nama pemohon, nama tenant/non-tenant, telepon,
  periode, tanggal pemasangan, lokasi) dari form
  (`src/components/promo/PromoCetakWizard.tsx`) ke penyimpanan
  (`server/src/routes/promo.js`, `POST /promo/submit-batch`) dan ke tampilan
  (staf `AdminDashboardPage.tsx`, tenant `SubmissionDetail.tsx`, batch
  `BatchStatusPage.tsx`); seluruh putusan **COCOK**, tidak ada field diminta
  yang hilang. Satu temuan nyata **T5** menunggu keputusan pemilik: pada alur
  cetak, checkbox `#cetak-terms` (`PromoCetakWizard.tsx:910`) tidak dikirim di
  payload (`:389-410`) dan server menulis KONSTANTA `true`
  (`server/src/routes/promo.js:897`), sehingga kolom `terms_accepted` tidak
  membuktikan persetujuan dan API langsung bisa melewatinya; bandingkan alur
  digital `POST /promo/submit` yang menegakkan di `promo.js:333` dan `:355`.
  Perbaikannya terhalang aturan karena fixture lama
  `__tests__/api/promo-batch.test.js:88-98` tidak memuat `terms_accepted`.
  Putaran ini murni dokumentasi dan **TIDAK mengubah kode apa pun**; rincian di
  `docs/PLAN_2026-09-24_10-56.md`. **Pilihan seksi:** diletakkan di
  `### Dirapikan`, bukan `### Diperbaiki` maupun `### Ditambahkan`, karena
  tidak ada perilaku runtime yang berubah dan tidak ada fitur baru; ini catatan
  hasil audit dan satu temuan yang menunggu keputusan.
- **Cakupan temuan zona waktu (C5) diperluas, menunggu keputusan pemilik.**
  Audit lanjutan menemukan ketergantungan pada "hari ini" bukan hanya pada
  `CURRENT_DATE` di query pengingat (`server/src/routes/admin.js:201` dan
  `:217`, C5 awal di `docs/PLAN_2026-09-23_21-34.md`), melainkan juga pada
  cast `::date` filter tanggal daftar pengajuan (`admin.js:113` dan `:118`),
  `toIsoDate()` lead time sisi server (`server/src/lib/leadTime.js:25`,
  dipakai `server/src/routes/promo.js:393` dan `:800`), serta `toIsoDate()`
  sisi FE (`src/utils/leadTime.ts:41`, dipakai
  `src/components/promo/PromoCetakWizard.tsx:153`). Tidak ada `TZ`/`PGTZ`
  di `server/src/db.js:42-47`, `deploy/vps/docker-compose.yml:25-28` dan
  `:57-60`, maupun berkas `.env`. Putaran ini murni dokumentasi dan
  **TIDAK mengubah kode**: usulan kombinasi (opsi pool
  `-c timezone=Asia/Jakarta` untuk sisi database, `TZ=Asia/Jakarta` pada
  proses Node untuk lead time server, catatan bahwa `PGTZ` tidak dibaca
  node-postgres, dan penyelarasan FE) dicatat di
  `docs/PLAN_2026-09-24_08-40.md` untuk diputuskan pemilik. **Pilihan
  seksi:** diletakkan di `### Dirapikan`, bukan `### Diperbaiki` maupun
  `### Ditambahkan`, karena tidak ada perilaku runtime yang berubah dan
  tidak ada fitur baru; ini catatan cakupan temuan yang menunggu keputusan.
- **Tabel cermin `AGENTS.md` tertinggal dari cermin yang sudah dikunci test.**
  Tabel "Cermin FE↔BE yang disengaja" di `AGENTS.md` belum memuat pasangan
  `MAX_BATCH_ITEMS`, padahal commit `414ae35` sudah menguncinya sebagai cermin
  lewat `__tests__/api/cetak-batch-limits.test.js`: `src/constants/promo.ts`
  (dipakai `PromoCetakWizard`) dan `server/src/routes/promo.js` (dipakai
  `POST /promo/submit-batch`) bisa menyimpang tanpa satu pun test gagal.
  Tabel ditambah satu baris `| Batas jumlah media batch | src/constants/promo.ts
  (MAX_BATCH_ITEMS) | server/src/routes/promo.js (MAX_BATCH_ITEMS) |`, dan
  paragraf di bawah tabel diperluas menyebut berkas test penguncinya beserta
  dua cara pengujiannya (membaca sumber server untuk menangkap drift nilai
  konstanta, dan menguji handler sungguhan untuk menangkap penegakan yang
  salah). Diff minimal: 5 insertions, 1 deletion (satu baris lama ikut
  ter-reflow pembungkusan, teksnya identik). **Pilihan seksi:** entri ini
  diletakkan di `### Dirapikan`, bukan `### Diperbaiki` maupun
  `### Ditambahkan`, karena commit `dd55a3b` tidak mengubah perilaku runtime
  dan tidak menambah berkas/API baru; ia menyelaraskan artefak dokumentasi
  yang sudah ada dengan kenyataan kode, persis pola "merapikan" yang sudah
  dipakai seksi ini. (Repo belum punya seksi `### Dokumentasi`.)
- **Audit kecocokan `scripts/verify-cetak.mjs` terhadap komponen terkini:
  28 dari 28 selector COCOK, 0 BASI.** Hasil audit read-only (tanpa perubahan
  kode) atas skrip verifikasi alur cetak, berguna bagi operator sebelum
  deploy. Dua fakta yang menurunkan risiko: (a) skrip menurunkan slug dari
  ATRIBUT ID checkbox (`getAttribute('id')` lalu menghapus prefiks
  `cetak-media-`), BUKAN dari posisi/urutan yang diasumsikan, sehingga
  pengelompokan daftar media per kategori (Outdoor/Indoor) tidak dapat
  memecahkan selector field per baris; (b) asersi `/PPN 11%/` di ringkasan
  sah karena dua media pertama yang dipilih skrip (`spanduk`, `big-banner`)
  keduanya `ppn_included: false` (diturunkan seed dari teks rules "Harga belum
  termasuk PPN."). Sisa risiko yang TIDAK bisa dihilangkan dari sisi kode,
  dicatat sebagai risiko operasional dan bukan cacat: asersi "tanpa console
  error" bergantung pada lingkungan runtime, dan batas anti-spam 5
  pengajuan/24 jam per perangkat bergantung pada konteks peramban segar tiap
  run.
- **Sapuan em-dash dan banner dekoratif di kode aktif.** Seluruh `—`/`–` di
  komentar `src/`, `server/`, `scripts/`, `public/`, `index.html`, dan CSS
  diganti koma, titik dua, atau tanda hubung ASCII; banner komentar
  `───`/`═══` murni dekoratif disederhanakan tanpa menghapus info rute/FR.
  String yang sampai ke UI, pesan error API, teks yang diassert test, dan dua
  marker `server/schema.sql` yang dibaca `schema-migration.test.js` tidak
  diubah. Perilaku runtime sama; `tsc`, 397 test, dan build tetap hijau.
- **Catatan temuan yang BELUM diperbaiki: pemasangan dapat dicatat walau
  materi belum pernah diterima.** Ini catatan keputusan terbuka, bukan
  perubahan perilaku. Pengajuan media cetak (`POST /promo/submit-batch`)
  sengaja tidak meminta berkas materi sehingga tersimpan `source_type='none'`,
  tetapi staf masih dapat mencatat pemasangan
  (`POST /admin/submissions/:id/installation`) dan menetapkan status
  `sudah_dipasang` untuk pengajuan itu, karena satu-satunya penjaga di
  `server/src/routes/admin.js` (baris sekitar 340) hanyalah
  `isInstallableStatus(existing.status)` dan gerbang UI di
  `AdminDashboardPage.tsx` (baris sekitar 1003 dan 1141) juga murni status.
  Klasifikasinya kelalaian, bukan keputusan sadar, dan tidak ada test yang
  mengunci perilaku ini. Dampaknya status `sudah_dipasang` dapat salah dan
  ikut mengalir ke pengingat periode berakhir. Tiga opsi perbaikan beserta
  konsekuensinya dicatat di `docs/PLAN_2026-09-23_19-45.md` bagian
  "Keputusan menunggu pemilik". **Kode sengaja TIDAK diubah** di putaran ini.
  **Pilihan seksi:** tidak ditulis di `### Diperbaiki` maupun `### Ditambahkan`
  karena tidak ada yang diperbaiki dan tidak ada fitur baru; `### Dirapikan`
  dipakai sebagai tempat catatan non fitur yang paling dekat, dan pilihan
  tidak menulis apa pun juga sah.
- **Catatan temuan yang BELUM diperbaiki: dua skrip verifikasi produksi punya
  asumsi basi akibat perubahan routing kanal.** `scripts/verify-e2e.mjs`
  (baris 37 mengklik `a:has-text("Ajukan Materi")` yang kini match pertama
  adalah kartu cetak menuju `/ajukan-cetak`) dan
  `scripts/verify-tenant-upload.mjs` (baris 40 membuka `/ajukan?media=spanduk`
  yang kini dialihkan ke `/ajukan-cetak`) akan MERAH karena keduanya
  mengasumsikan semua kartu katalog menuju wizard digital. Asumsi itu justru
  cacat yang sudah diperbaiki. Perbaikan minimal per baris beserta alasannya
  dicatat di `docs/PLAN_2026-09-23_21-13.md` bagian "Menunggu persetujuan:
  pembaruan dua skrip verifikasi" dan **MENUNGGU PERSETUJUAN**. **Kedua skrip
  sengaja TIDAK diubah** di putaran ini; menyunting aset verifikasi demi
  meloloskan pemeriksaan dilarang.
- **Catatan keputusan pemilik: integrasi email ditunda, cukup notifikasi
  dashboard admin.** Untuk pengingat masa berlaku pajak/reklame, pemilik
  memutuskan integrasi email **DITUNDA ("nanti saja")** dan cukup memakai
  notifikasi di dashboard admin. Keputusan ini **MENUTUP** pertanyaan terbuka
  soal integrasi email, dan **menegaskan** keputusan desain lama **D4** di
  `docs/PLAN_2026-09-20_16-00.md` (baris 41, bagian 3.4, dan bagian 4.5) bahwa
  pengingat adalah query turunan tanpa email/cron. **Tidak ada kode yang
  berubah**: `package.json` tetap tidak memuat dependensi mailer (pencarian
  `nodemailer|sendgrid|mailgun|resend|postmark` menghasilkan 0 kemunculan),
  dan notifikasi dashboard sudah ada di `server/src/routes/admin.js:489`
  (endpoint `GET /admin/submissions/reminders`) serta panel di
  `src/components/admin/AdminDashboardPage.tsx:346` sampai `:349`. Pertanyaan
  lain (sisa hari untuk tenant, celah pemasangan tanpa materi, pembaruan dua
  skrip verifikasi) **TETAP TERBUKA**. Rincian di
  `docs/PLAN_2026-09-23_21-18.md` bagian "Keputusan pemilik: integrasi email
  ditunda". **Pilihan seksi:** ditulis di `### Dirapikan`, bukan
  `### Diperbaiki` maupun `### Ditambahkan`, karena tidak ada perilaku yang
  diperbaiki dan tidak ada fitur baru.
- **Temuan lanjutan pengingat dashboard tercatat dan menunggu keputusan
  pemilik.** Audit notifikasi dashboard menyisakan temuan lanjutan (C2 sampai
  C6: cakupan pengingat terlalu sempit, baris pengingat tidak bisa diklik ke
  detail, tidak ada keadaan kosong/galat eksplisit, zona waktu `CURRENT_DATE`
  default UTC bukan WIB, dan `days` tak sah diperlakukan sebagai default).
  Temuan-temuan itu **BELUM diperbaiki** dan **sengaja tidak diperbaiki** di
  putaran ini karena sebagian mengubah perilaku/produk, sehingga menunggu
  keputusan pemilik. Putaran ini **tidak mengubah kode apa pun**; rincian
  beserta bukti berkas:baris terverifikasi ada di
  `docs/PLAN_2026-09-23_21-34.md`. **Pilihan seksi:** ditulis di
  `### Dirapikan`, bukan `### Diperbaiki` maupun `### Ditambahkan`, karena
  tidak ada perilaku yang diperbaiki dan tidak ada fitur baru (preseden
  catatan non-fitur di seksi ini).
- **Temuan uang dan alur tenant yang tersisa tercatat dan menunggu keputusan
  pemilik.** Dua audit read-only (kebenaran uang/PPN dan alur sisi tenant)
  menyisakan temuan yang **BELUM diperbaiki** karena butuh keputusan pemilik
  atau terhalang aturan: D3 `quantity` dari klien tanpa batas
  (`server/src/routes/promo.js:782`, dipakai `:843` dan disimpan `:901`,
  sementara wizard selalu mengirim 1 di `PromoCetakWizard.tsx:405`), D2
  `duration_days` bisa 0 tanpa CHECK DB (`src/utils/pricing.ts:70`,
  `server/schema.sql:230`), D1 `round2` bukan half-up sejati
  (`src/utils/pricing.ts:25`), D4 admin bisa mengisi harga bersen
  (`server/src/routes/admin.js:77`, `AdminDashboardPage.tsx:1520`), D5
  pengingat menyaring `ppn_amount > 0` (`server/src/routes/admin.js:213`), D6
  dokumen desain usang (`docs/PLAN_2026-09-20_16-00.md:199` dan `:531`),
  ditambah temuan alur tenant #3 (form revisi tampil tanpa cek kepemilikan),
  #4 (alur revisi tidak atomik, terhalang mock test lama), dan #7 (wizard
  cetak tanpa afordan lead time). Rincian beserta bukti berkas:baris
  terverifikasi dan dua opsi perbaikan #4 ada di
  `docs/PLAN_2026-09-24_10-50.md`. **Putaran ini TIDAK mengubah kode**;
  temuan-temuan itu menunggu keputusan. **Pilihan seksi:** ditulis di
  `### Dirapikan`, bukan `### Diperbaiki` maupun `### Ditambahkan`, karena
  tidak ada perilaku yang diperbaiki dan tidak ada fitur baru.


### Ditambahkan
- **Riwayat tenant menampilkan batch pengajuan cetak.** Alur cetak multi-media
  membuat SATU batch berisi N pengajuan, dan layar sukses
  `PromoCetakWizard` menampilkan nomor batch serta tombol menuju
  `/batch/<batch_token>` dengan pesan "Simpan nomor batch ini untuk memantau
  status seluruh media kapan saja." Tetapi setelah tenant meninggalkan layar
  sukses itu TIDAK ADA jalan kembali: `GET /promo/submissions/mine` memakai
  `SUBMISSION_PUBLIC_COLUMNS` yang memuat `batch_id` tetapi TIDAK
  `batch_number`/`batch_token`, sehingga `MySubmissionsPage` hanya menampilkan
  kartu per media tanpa penanda bahwa kartu-kartu itu satu kiriman. Tenant
  yang mengirim 5 media hanya melihat 5 kartu terpisah dan tidak bisa membuka
  tampilan batch lagi. Handler `GET /promo/submissions/mine`
  (`server/src/routes/promo.js`) kini memakai
  `LEFT JOIN promo_submission_batches b ON b.id = s.batch_id` dan mengambil
  HANYA `b.batch_number` dan `b.batch_token` (BUKAN `b.*`, karena 13 kolom
  bertabrakan nama antara kedua tabel: `id`, `tenant_id`, `unit_number`,
  `pic_name`, `pic_phone`, `notes`, `device_fingerprint`, `ip_address`,
  `user_agent`, `created_at`, `updated_at`, `applicant_type`, dan
  `submission_date`). Karena join membuat nama kolom ambigu (khususnya `id`
  dan `created_at`), ditambahkan helper `qualifyColumns(alias, columns)` yang
  membangun varian ber-alias
  `SUBMISSION_PUBLIC_COLUMNS_S = qualifyColumns('s', SUBMISSION_PUBLIC_COLUMNS)`;
  konstanta bersama `SUBMISSION_PUBLIC_COLUMNS` SENGAJA dibiarkan TANPA alias
  dan tidak diubah karena masih dipakai jalur publik satu-tabel
  (`/submissions/status/:token`, `/submissions/track`,
  `/batches/status/:token`, `/batches/track`). **Batas kepercayaan:** karena
  satu batch selalu ditulis oleh satu `device_fingerprint` (`POST
  /promo/submit-batch` mengisi fingerprint batch dari body yang sama dengan
  seluruh item fan-out) dan `/mine` hanya mengembalikan baris yang
  `device_fingerprint = $1` cocok, `batch_token` di `/mine` berada di batas
  kepercayaan yang SAMA PERSIS dengan `status_token` yang memang sudah sengaja
  dikirim endpoint itu; setiap `batch_token` yang keluar pasti milik perangkat
  pemanggil. Scope dijaga: `/submissions/track`,
  `/submissions/status/:token`, dan `/batches/status/:token` TIDAK ikut
  membawa token batch. `MySubmissionRow` (`src/types/promo.ts`) menambah
  `batch_number?: string | null` dan `batch_token?: string | null` dengan
  komentar bahwa keduanya hanya terisi pada `/promo/submissions/mine`. Di
  `MySubmissionsPage.tsx`, baris ber-batch menampilkan nomor batch
  (`font-mono`), keterangan "(N media dalam kiriman ini)", dan tautan "Lihat
  status batch" menuju `/batch/<batch_token>` dengan `min-h-11`; tautan lama
  "Lihat status & kirim revisi" (`/status/<status_token>`) dipertahankan, dan
  baris non-batch tampil PERSIS seperti sebelumnya (blok batch tidak
  dirender). Urutan data dari server tidak diubah. Dikunci
  `__tests__/api/promo-mine-batch.test.js` (baru, 6 test, handler sungguhan
  lewat `router.stack`) dan
  `src/components/promo/__tests__/MySubmissionsPageBatch.test.tsx` (baru,
  5 test); keduanya dibuktikan bermakna lewat uji sementara (render batch
  dilepas, test FE gagal; kolom batch dilepas dari `SELECT`, test BE gagal;
  lalu dipulihkan dan hijau).
- **Verifikasi alur pengajuan cetak (`scripts/verify-cetak.mjs`).** Skrip
  Playwright baru menyisir jalur cetak di produksi: landing → `/ajukan-cetak`
  → langkah data pemohon mode non-tenant → pilih dua media + periode minimal
  7 hari + lokasi/tanggal pemasangan per media → ringkasan (label estimasi dan
  baris PPN 11%) → centang ketentuan → kirim → nomor batch `MPB-YYMMDD-XXXXXX`
  → halaman `/batch/:token` memuat dua media. `verify-admin-flow.mjs` diperluas
  untuk memeriksa baris batch `MPB-` di daftar pengajuan dan respons
  `GET /admin/submissions/reminders?days=14`.
- **Harga numerik katalog dapat disunting staf.** Perhitungan PPN pengajuan
  cetak dan pengingat periode berakhir bergantung pada `price_amount`/
  `price_unit`/`ppn_included`, tetapi sebelumnya kolom itu hanya diisi seed
  sekali sehingga koreksi tarif menuntut akses DB langsung. Kini
  `POST /admin/media-types` menerima ketiganya (`price_amount` angka ≥ 0
  dibulatkan 2 desimal, nilai tak sah → 0 = media gratis; `price_unit` ≤ 60
  karakter; `ppn_included` boolean) dan `POST /admin/media-types/:id`
  menerimanya **hanya bila hadir di body** (kunci absen tidak disentuh, sehingga
  `price_amount: 0` sah sebagai "gratis" dan bukan "tidak dikirim"). Panel
  katalog menambah input **Harga numerik (Rp)**, **Satuan harga**, dan centang
  **Harga sudah termasuk PPN**. Pemanggil lama tanpa field ini tetap bekerja.
- **Form pengajuan "spanduk banner / giant banner / umbul-umbul" (sisi tenant).**
  Rute baru `/ajukan-cetak` menyediakan form ringkas dengan field persis
  permintaan pemilik: **tanggal pengajuan**, **nama pemohon**, **nama
  tenant / nama non tenant**, **telepon**, **periode pemasangan**, **tanggal
  pemasangan**, dan **lokasi pemasangan** per media. Pemohon dapat **tenant
  maupun non-tenant** (sakelar jenis pemohon; non-tenant mengetik namanya
  sendiri tanpa perlu terdaftar di MID). **Beberapa media dapat dipilih
  sekaligus** dalam satu kirim (checkbox, batas 10), masing-masing dengan
  periode, tanggal pemasangan, dan lokasi sendiri. Ringkasan menampilkan
  subtotal, **PPN 11%**, dan total; minimal sewa 7 hari divalidasi di klien
  dan diulang server. Form ini **tidak meminta berkas materi** — materi cetak
  menyusul lewat alur revisi. Halaman status batch baru di `/batch/:token`
  menampilkan seluruh media dalam satu pengajuan, dan beranda mendapat tautan
  "Ajukan Media Cetak".
- **Pengingat periode berakhir & bukti tayang di dashboard staf.**
  `GET /api/v1/admin/submissions/reminders?days=14` adalah notifikasi
  **turunan data** (bukan cron/worker): ia menghitung materi yang sudah
  dipasang dan periodenya berakhir dalam N hari, hanya untuk media ber-pajak.
  Kolom tanggal berakhir disimpan sebagai teks, jadi nilainya dijaga pola
  tanggal sebelum di-cast — satu nilai cacat tidak akan menggagalkan seluruh
  query. Ditambah `POST /api/v1/admin/submissions/:id/installation/proof`
  untuk **bukti tayang kanal unggahan** (berkas ke Google Drive yang sama
  dengan materi; fail-closed `503` bila kredensial Drive belum diisi) di
  samping kanal tautan yang sudah ada; `POST .../installation` kini menerima
  `proof_kind` (`link`/`upload`, bawaan `link` sehingga pemanggil lama tetap
  bekerja). Ekspor CSV menambah kolom **Jenis Pemohon**, **Tanggal
  Pengajuan**, **Nomor Batch**, **Subtotal**, **PPN**, dan **Total**, serta
  menampilkan sumber `none` sebagai "Menyusul".
- **Endpoint batch pengajuan media cetak (multi-media dalam satu kirim).**
  `POST /api/v1/promo/submit-batch` menerima satu pemohon (tenant **atau**
  non-tenant) beserta 1–10 media cetak sekaligus, lalu menulis **satu batch +
  N pengajuan** (fan-out): tiap pengajuan tetap single-media dengan alur
  status, pemasangan, revisi, dan pengingat yang sama seperti sebelumnya.
  Harga & PPN dihitung **di server** dari `price_amount`/`ppn_included` katalog
  dan disnapshot ke baris (`subtotal`, `ppn_amount`, `total_amount`,
  `duration_days`); klien tidak dipercaya. Karena form cetak tidak meminta
  berkas materi, pengajuan disimpan `source_type='none'` — materi menyusul
  lewat alur revisi (tautan/berkas opsional tetap diterima per media).
  Minimal sewa 7 hari dan lead time media divalidasi ulang di server sebelum
  apa pun ditulis. Kuota anti-spam 5/24 jam dihitung **per batch**, bukan per
  baris, sehingga satu kirim berisi banyak media tidak menghabiskan kuota.
  Ditambah `GET /api/v1/promo/batches/status/:token` dan
  `GET /api/v1/promo/batches/track?number=` (captcha Turnstile, action
  `track-batch`) yang mengembalikan seluruh item batch tanpa membocorkan
  fingerprint/IP. Dikunci `__tests__/api/promo-batch.test.js`.
- **Modul harga & PPN cetak (cermin FE↔BE).** `src/utils/pricing.ts` ↔
  `server/src/lib/pricing.js` memuat satu sumber kebenaran perhitungan:
  `PPN_RATE = 0.11` (**tarif efektif** — permintaan pemilik "PPN 11%";
  regulasi 2025 memakai 12% × DPP Nilai Lain 11/12 sehingga beban efektifnya
  tepat 11%), minimal sewa 7 hari, `subtotal = price_amount × quantity ×
  duration_days`, `ppn_amount` dihitung di atas subtotal (atau sebagai porsi
  di dalamnya bila harga sudah termasuk PPN), dan pembulatan 2 desimal seperti
  `NUMERIC(14,2)`. Ditambah `REMINDER_DAYS` untuk ambang pengingat. Kesamaan
  kedua modul dikunci `__tests__/api/cetak-pricing.test.js` (pola sama dengan
  `lead-time`/`status-flow`) — menyimpang = test gagal.
- **Skema & seed untuk alur "media promosi cetak".** Katalog kini punya kolom
  `media_channel` (`cetak`/`digital`) dan harga **numerik** (`price_amount`,
  `price_unit`, `ppn_included`) — `price_note` tetap sebagai teks deck yang
  ditampilkan verbatim, karena isinya (termasuk tangga tarif multi-baris)
  tidak dapat dijumlahkan. Kanal cetak diisi tepat tiga media yang disebut
  pemilik: **spanduk, big-banner, umbul-umbul** (masing-masing bertarif harian
  70.000 / 160.000 / 288.000). `ppn_included` **diturunkan dari teks `rules`**
  ("Harga sudah termasuk PPN." → true), bukan dikarang. Pengajuan juga
  menyiapkan `applicant_type` (tenant/non-tenant), `submission_date`,
  `batch_id`, dan snapshot harga/pajak (`subtotal`, `ppn_amount`,
  `total_amount`, `duration_days`, `quantity`); tabel baru
  `promo_submission_batches` mengelompokkan satu kirim berisi beberapa media;
  `promo_installations` menyiapkan bukti tayang dua kanal (`proof_kind`).
  CHECK `source_type` diperluas dengan `'none'` (pengajuan cetak tidak meminta
  berkas materi) memakai urutan **lepas CHECK → remap → pasang CHECK** —
  urutan ini dikunci `__tests__/api/schema-migration.test.js`. Semua pernyataan
  idempotent dan blok baru diletakkan **setelah** blok migrasi status agar
  heuristik test urutan tetap sah. Seed menambahkan parameter baru **setelah
  `$13`** sehingga indeks parameter yang dikunci test lama tidak bergeser.
  **Operator: jalankan `npm run db:migrate` lalu `npm run db:seed` sebelum
  kode baru dilayani** (kode + skema harus naik bersamaan — pitfall #10).
- **Test pengunci cermin batas jumlah media batch FE↔BE (`MAX_BATCH_ITEMS`).**
  `AGENTS.md` mencantumkan cermin FE↔BE yang wajib diubah berpasangan, dan
  pasangan lead time / status / harga sudah dikunci, tetapi batas
  `MAX_BATCH_ITEMS` belum dikunci test mana pun: `src/constants/promo.ts`
  (dipakai `PromoCetakWizard` untuk menonaktifkan checkbox dan tombol "Tambah
  lokasi lain") dan `server/src/routes/promo.js` (dipakai
  `POST /promo/submit-batch`) bisa menyimpang tanpa ada yang gagal. Akibatnya
  klien mengizinkan jumlah media berbeda dari yang diterima server, dan
  pengguna menerima `400` baru di akhir form setelah mengisi semuanya.
  Ditambah `__tests__/api/cetak-batch-limits.test.js` (baru) yang memakai DUA
  cara, karena `server/src/routes/promo.js` tidak mengekspor konstanta itu:
  membaca sumber server dengan `readFileSync` untuk menangkap drift NILAI
  konstanta walau handler tidak pernah dieksekusi, dan menguji handler
  sungguhan untuk menangkap konstanta yang benar tetapi penegakan yang salah.
  Penegakan sisi server (11 media ditolak `400`) sudah ada dan dikunci
  `__tests__/api/promo-batch.test.js`; yang baru adalah cermin konstanta dan
  sisi "tepat 10 diterima". Test dibuktikan bermakna lewat uji mutasi
  (konstanta FE sementara diubah ke 9, 3 test gagal, lalu dipulihkan).
- **Keadaan "materi belum diterima" kini terlihat staf tepat di fieldset
  "Catat pemasangan".** Sebuah audit menemukan celah integritas: staf dapat
  mencatat pemasangan dan menetapkan status `sudah_dipasang` untuk pengajuan
  yang materinya belum pernah diterima, karena pengajuan cetak disimpan
  `source_type='none'` (form cetak tidak meminta berkas materi; materinya
  menyusul lewat revisi) dan tidak ada penjaga materi di jalur pemasangan.
  Celah itu **SUDAH tercatat sebagai keputusan terbuka** di
  `docs/PLAN_2026-09-23_19-45.md` bagian "Keputusan menunggu pemilik"
  (opsi A tolak, B izinkan dengan peringatan, C tambah jalur staf melampirkan
  materi), dan pemilik **BELUM memilih arah**. Perubahan ini **BUKAN
  pengambilan keputusan atas celah itu dan celahnya MASIH TERBUKA**: ia
  sengaja tidak memblokir, tidak menolak, dan tidak menambah konfirmasi.
  `AdminDashboardPage.tsx` kini merender blok peringatan di dalam fieldset
  "Catat pemasangan" (tepat setelah `</legend>`) HANYA bila
  `detail.source_type === 'none'`, menyatakan materi belum pernah diterima,
  bahwa pengajuan cetak memang tidak melampirkan materi saat diajukan,
  bahwa menyimpan pemasangan akan menetapkan status materi menjadi Sudah
  Dipasang, dan menyarankan memastikan materinya sudah diterima lebih dulu
  (misalnya koordinasi dengan tenant). Gaya memakai pola peringatan
  `leadTimeRisk` yang sudah ada (ikon `AlertTriangle` ber-`aria-hidden`,
  warna amber: `border-amber-300`, `bg-amber-50`, `text-amber-700`/
  `text-amber-800`, varian gelap `dark:border-amber-700`,
  `dark:bg-amber-950/30`, `dark:text-amber-300`/`dark:text-amber-400`),
  **bukan merah** yang dikhususkan untuk galat. Memakai `role="status"`
  (live region polite), **bukan `role="alert"`**, karena peringatan ini
  muncul sebagai bagian dari pembacaan konten Sheet, bukan peristiwa
  mendesak; `role="alert"` akan mengumumkan secara assertive dan menghentikan
  pembacaan judul Sheet padahal staf belum mengisi apa pun. Tombol "Catat
  Pemasangan" **tetap aktif**; kondisi `disabled`-nya tetap
  `saving || !installLocation.trim()` dan TIDAK memuat `source_type`, dan
  tidak ada konfirmasi tambahan. Guard server **TIDAK disentuh** (commit ini
  tidak menyentuh `server/`). Dikunci
  `src/components/admin/__tests__/AdminDashboardPeringatanMateri.test.tsx`
  (baru, 198 baris, 3 test: peringatan tampil untuk `source_type='none'` DAN
  tombol tetap ada serta tidak disabled; peringatan tidak tampil untuk
  `source_type='link'`; tidak tampil untuk `source_type='upload'`). Test
  dibuktikan bermakna lewat uji sementara (render peringatan dilepas, test
  gagal, lalu dipulihkan; hash berkas identik sebelum dan sesudah).

### Diperbaiki
- **Pengingat pajak tidak lagi memuat pengajuan gratis.** Syarat pengingat
  periode berakhir memakai `(ppn_amount > 0 OR ppn_included = false)`.
  Karena `promo_submissions.ppn_included` ber-`DEFAULT false`, klausa `OR` itu
  **selalu benar** — sehingga pengingat menampilkan **setiap** pengajuan
  berstatus Sudah Dipasang, termasuk media digital/gratis yang tidak dikenai
  pajak. Kini syaratnya `ppn_amount > 0` saja: satu-satunya tanda sah "kena
  pajak" adalah PPN yang benar-benar terhitung, bukan kolom yang ber-default
  `false` (deck pun tidak seragam soal PPN). Dikunci
  `__tests__/api/admin-cetak.test.js`.
- **Katalog publik tidak mengirim kanal/harga, sehingga form cetak tampil
  kosong.** `GET /api/v1/promo/media-types` tidak menyertakan `media_channel`,
  `price_amount`, `price_unit`, dan `ppn_included` pada `SELECT` — padahal
  wizard cetak menyaring `media_channel === 'cetak'` dan menghitung PPN dari
  `price_amount`/`ppn_included`. Akibatnya `/ajukan-cetak` menampilkan **0
  media** dan harga/PPN selalu 0. Parameter `?channel=cetak|digital` juga
  diabaikan server (handler masih `_req`). Kini keempat kolom ikut dikirim dan
  filter kanal diterapkan secara **aditif** — tanpa parameter, perilaku
  katalog/landing persis seperti sebelumnya; nilai kanal divalidasi terhadap
  daftar (bukan interpolasi mentah) dan yang tak dikenal dibalas `400` sebelum
  menyentuh DB. Regresi ini tidak tertangkap mock FE karena fixture-nya sudah
  memuat kolom tersebut, jadi ditambahkan **test seam nyata** yang memanggil
  handler `GET /media-types` sungguhan lewat `router.stack` dan meng-assert
  kolom ada di respons serta filter kanal benar-benar menyaring
  (`__tests__/api/catalog-invariants.test.js`). **Plus** kanal katalog kini
  dapat diubah dari dashboard: `POST /admin/media-types` (bawaan `digital`) dan
  `POST /admin/media-types/:id` menerima `media_channel` dengan validasi
  `cetak|digital`, dan `CatalogTab` menampilkan pemilih **Kanal** serta label
  kanal di daftar.
- **Mengosongkan field teks katalog media kini benar-benar tersimpan.**
  `POST /admin/media-types/:id` melewati setiap nilai kosong (`if (!value)
  continue`), sehingga menghapus isi **Ketentuan** (`rules`) — yang tampil
  sebagai deskripsi media di katalog publik dan wizard — tidak pernah
  berpengaruh: nilai lama diam-diam bertahan, dan bila tak ada kolom lain yang
  berubah endpoint membalas `400 "Tidak ada perubahan"`. Handler kini
  membedakan "tidak dikirim" (kunci absen → kolom tidak disentuh) dari "dikirim
  kosong" (kunci hadir bernilai `''` → kolom dikosongkan). Aturan yang tetap
  dijaga: `name` wajib (kosong → `400 "Nama wajib diisi"`), `slug`/`category`
  tidak dapat dikosongkan (NOT NULL/CHECK), dan `image_path` tidak lagi
  diterima lewat endpoint ini — ia dikelola endpoint foto sendiri, sehingga
  menyimpannya di form tidak akan menimpa foto yang baru diunggah dengan nilai
  state lama. Dikunci `__tests__/api/media-type-update.test.js`.

### Diubah
- **Angka PPN di form cetak ditandai sebagai estimasi.** Aplikasi ini tidak
  melakukan penagihan (invoice tetap manual di luar sistem), jadi ringkasan
  langkah 2 dan langkah 3 form media cetak kini menyertakan keterangan
  "Perkiraan; harga final sesuai penawaran Tenant Relations" agar tenant tidak
  membacanya sebagai tagihan final. Rumus tidak berubah.
- **Dashboard staf: panel pengingat + pilihan kanal bukti tayang.** Tab
  Pengajuan kini menampilkan panel **Pengingat periode berakhir** (materi
  ber-pajak yang sudah dipasang dan periodenya mendekat/lewat) dengan tombol
  "Ingatkan via WhatsApp" per baris; panel hanya muncul bila ada yang perlu
  diingatkan. Form catat pemasangan kini punya sakelar kanal bukti
  **Tautan / Unggah Foto**; memilih unggahan menampilkan pemilih berkas
  (JPEG/PNG/PDF/MP4, maks 50MB) dan berkas dikirim ke server setelah baris
  pemasangan tersimpan. Perilaku lama (tautan) tetap menjadi bawaan.
- **`DESIGN.md` diaudit terhadap kode; klaim faktual yang salah diperbaiki.**
  Seluruh dokumen (baris 1-515 saat audit) diperiksa klaim per klaim terhadap
  `src/styles/theme.css`, `src/styles/base.css`, `index.html`,
  `src/constants/promo.ts`, dan komponen terkait. Tabel audit yang dapat
  dihitung ulang ada di `docs/PLAN_2026-09-20_12-15.md`: paruh pertama 30
  bermasalah dari 68 klaim, paruh kedua 21 temuan terdaftar (satuan berbeda,
  tidak dijumlahkan). Klaim faktual (nilai, kelas, ukuran, nama
  token, keberadaan elemen) kini mengikuti kode: antara lain H1
  `text-3xl sm:text-4xl`, H3 kartu `text-lg`, eyebrow `text-xs` (bukan
  `text-[11px]`), leading `1.6`/`1.2`/`1.45`, tabel spasi landing
  (`pt-6 pb-6 sm:pt-10 sm:pb-10`, katalog `pb-10`, admin `max-w-6xl`), dan
  tabel status badge (9 kunci, kelas token `bg-brand-primary-*`). Klaim
  niat/preskriptif dipertahankan; penyimpangan kode terhadapnya ditandai
  eksplisit. Bagian baru **"Catatan Ketidaksesuaian (menunggu keputusan)"**
  ditambahkan di akhir `DESIGN.md` untuk delapan ketidaksesuaian kode-vs-niat
  yang tidak dapat diselesaikan dengan mengubah dokumen saja (lebar kontainer
  admin, `--radius-chip` tak terpakai, jumlah status 7/8/9, ukuran judul kartu,
  tosca sebagai permukaan, `--elevation-fab` tak terpakai, dropdown tenant
  memakai `shadow-lg` alih-alih token elevasi, dan pemindaian Tailwind v4 atas
  berkas dokumen yang membuat kelas terkutip ter-generate ke CSS). Bagian
  "Migrasi dari Pola
  Event" dinyatakan selesai, dan klaim mode gelap dikoreksi (varian `dark:` ada
  di komponen tenant; skeleton pra-mount mengikuti `prefers-color-scheme`).
- **Elevasi app bar tidak lagi digerakkan listener `scroll`.** `TopAppBar` kini
  memakai `IntersectionObserver` atas sentinel setinggi 0 di awal area gulir
  (`root` = elemen gulir, ambang 4px via `rootMargin`), menghapus handler per
  frame saat konten menggulir. Perilaku `data-elevated` tidak berubah. Di
  lingkungan tanpa `IntersectionObserver` (jsdom pada test) elevasi dibiarkan
  `false` dan mount tetap aman.
- **Istilah "gerai" diganti "tenant" di seluruh teks yang dilihat pengguna.**
  Halaman ini mengelola pengajuan *tenant*, tetapi beberapa teks masih memakai
  "gerai": pesan validasi server (`Nama gerai wajib diisi`), judul & deskripsi
  dokumen (`index.html`, `manifest.webmanifest`), dan komentar ops
  (`deploy/vps/.env.example`, `docker-compose.yml`). Semua diseragamkan.
  Pasangan yang wajib ikut berubah: pemetaan galat ke field di
  `src/utils/promoApi.ts` mencocokkan kata kunci `'gerai' || 'tenant'` — kini
  cukup `'tenant'` — dan test `__tests__/api/promo-submit.test.js` yang
  mengunci pesan lama ikut diperbarui (test tetap hijau).
- **Label "Login Staf" disederhanakan menjadi "Login"** pada aksi app bar
  beranda dan judul halaman `/login`.
- **13 em-dash (`—`) dihapus dari seluruh teks yang dilihat pengguna.** Sebelum
  perbaikan, karakter itu muncul di 5 rute (terverifikasi di DOM): subteks
  hero, label kontak, footer, tombol langkah wizard, pesan galat, catatan lead
  time, pesan WhatsApp, judul dokumen/manifest, dan `<title>` konsol staf.
  Diganti kalimat terpisah, koma, atau tanda kurung. **Plus 12 em-dash sebagai
  penanda nilai kosong** (`|| '—'`) yang tidak terlihat saat audit rute karena
  hanya muncul bila suatu field memang kosong: nomor pengajuan, tanggal tayang,
  periode pemasangan, dan ukuran media. Diganti tanda hubung `-`.
  Penemuan ini dari pemeriksaan **bundle produksi** (`dist/*.js`) — komentar
  sudah dibuang terser, jadi setiap em-dash yang tersisa pasti string literal.
  Tidak ada em-dash maupun en-dash tersisa di teks terlihat (0 pada 5 rute ×
  3 viewport, dan 0 pada bundle produksi). Sisa em-dash hanya di komentar kode,
  yang tidak pernah dirender.
- **Katalog `/` memakai label metadata yang terlihat.** `src/components/promo/PromoLandingPage.tsx`
  kini menulis label kata `Ukuran`, `Bahan`, `Harga`, `Lokasi` alih-alih label
  `sr-only`, dan ikon metadata dihapus karena ambigu: `Tag` dipakai untuk
  "Materi" sekaligus "Harga", `Ruler` dipakai untuk "Bahan". Label kecil dan
  muted, bukan huruf besar.
- **`price_note` berbaris-baris dirender sebagai tangga tarif.** Baris berlabel
  (mis. `Mingguan Rp. 10.000.000,-`) jadi dua kolom dengan nominal rata kanan
  supaya durasi berbeda bisa dibandingkan sekilas, sedangkan baris tanpa kata di
  depan dibiarkan rata kiri — sufiksnya (`/hari`, `/30 hari`) lebarnya berbeda,
  jadi memaksa rata kanan hanya membuat angka menggantung tanpa jangkar. Semua
  karakter nominal dipertahankan verbatim.
- **Baris lead time per kartu katalog.** Diturunkan dari teks `rules` lewat
  `parseLeadTime` + `describeLeadTime` (`src/utils/leadTime.ts`), bukan
  diasumsikan per kategori karena ketentuan deck tidak seragam; tidak
  ditampilkan bila media tidak mengatur lead time.
- **Aksi kartu katalog menjadi tautan teks tosca, bukan tombol solid.**
  Sebelumnya setiap kartu memakai `.ui-btn-primary`, sehingga jumlah CTA primer
  solid pada satu halaman jauh melebihi aturan `DESIGN.md` "satu CTA primer per
  viewport" dan "Aksi: link teks tosca (bukan tombol solid)". Kontras terukur
  7.20:1 (`#006260` di putih), target sentuh tetap 44px.
- **Subjudul hero `/` ditulis ulang** (aktif, sentence case, menyebut media
  konkret) tanpa em-dash.
- **Dua kelas radius mati dihapus dari kartu katalog.** `rounded-md` dan
  `rounded-lg` tidak pernah berefek karena tertimpa `border-radius` tak-berlapis
  dari `.ui-btn-primary`/`.ui-control` (`src/styles/base.css`); `DESIGN.md`
  melarang mengandalkan radius dari kelas utilitas.
- **3 test baru mengunci pemecahan harga per baris dan kemunculan baris lead
  time** (`src/components/promo/__tests__/PromoLandingPage.test.tsx`).

### Diperbaiki
- **15 slot pesan galat wizard menggeser konten saat pesan muncul.** Pesan
  `fieldErrors.*`, `linkError`, `fileError`, `submitError` (langkah 2), dan
  `terms_accepted` hanya ada di DOM saat validasi gagal, sehingga kemunculannya
  mendorong field di bawahnya turun tepat ketika pengguna sedang memperbaiki
  isian. Ke-15 slot kini dibungkus satu kelas bersama `.ui-helper-slot`
  (`src/styles/base.css`) yang mencadangkan satu baris tinggi pesan. Memakai
  **`min-height`** (bukan `height`) supaya pesan yang membungkus lebih dari satu
  baris tetap tumbuh utuh, dan sengaja **tanpa `overflow: hidden`** agar tidak
  memotongnya. Satu kelas dipakai bersama, bukan 15 nilai ad-hoc, supaya tinggi
  cadangan ikut berubah otomatis bila tipografi `--text-meta` disesuaikan.
  `id`, `role="alert"`, dan `aria-describedby` tiap pesan tidak berubah, jadi
  pembaca layar tetap mengumumkan galat yang sama.
- **Subteks hero melewati batas panjang dan turun tiga baris.** Teks lama
  ("Kirim materi media promosi — spanduk, LED, videotron, hingga media sosial —
  langsung ke Tim Tenant Relations. Status pengajuan bisa dipantau kapan saja.")
  memuat 23 kata dengan dua em-dash dan membungkus tiga baris di desktop. Kini
  20 kata, dua baris, tanpa em-dash. Terukur di DOM (1280px): H1 satu baris,
  subteks dua baris, CTA primer `bottom` 288px dari viewport 805px — semuanya
  terlihat tanpa menggulir. Padding atas hero 40px (batas aman).
- **Satu aturan lead time katalog masih memuat em-dash**
  (`server/scripts/seed-media-types.mjs`: "Tidak menerima video — materi berupa
  gambar statis"). Teks `rules` dirender apa adanya di kartu katalog, jadi em-dash
  ikut terlihat tenant. Diganti titik. **Jalankan `npm run db:seed` setelah
  deploy** agar baris di DB ikut tersinkron (seed memakai `IS DISTINCT FROM`).
- `CACHE_VERSION` service worker dinaikkan ke `v11` — aset shell berubah.

Verifikasi: `tsc` 0 · **33 berkas / 292 test hijau** · build sukses · **axe 0
pelanggaran** di 5 rute × 3 viewport (1280/375/320) · 0 scroll horizontal ·
0 em-dash / en-dash / "gerai" / "Login Staf" pada teks ter-render.

Audit kepatuhan gate UI/UX (Hallmark 58 gate + ui-ux-pro-max "Common Rules" +
WCAG 2.2) terhadap `DESIGN.md` sebagai sistem terikat. Cakupan 5 rute publik +
konsol staf, viewport 320–1280. Laporan: `docs/PLAN_2026-09-19_16-11.md`.
Setelah perbaikan: **0 pelanggaran axe di 5 rute** (1280px dan 320px), 0
regresi, suite 33 berkas / 292 test hijau.

### Diperbaiki
- **Indikator fokus memudar ~150 ms — seharusnya muncul instan (Gate 15).**
  Utility `transition` Tailwind v4 menyertakan **`outline-color` dan
  `box-shadow`** dalam daftar propertinya (terverifikasi di CSS terkompilasi).
  Akibatnya dua jalur fokus sama-sama beranimasi: cincin `.ui-focus-ring`
  (berbasis `box-shadow`) **dan** outline jaring pengaman (Gate 26) karena
  `outline-color` ikut ditransisikan. Terukur di Chromium dengan fokus keyboard
  sungguhan (`:focus-visible` aktif) pada elemen ber-`transition` telanjang:
  `outline-color` bergerak dari `rgb(0,0,0)` ke `rgb(0,145,142)` frame demi
  frame selama **~150 ms** — pengguna keyboard tidak melihat indikator apa pun
  pada frame pertama. Terbukti pada tombol tab admin
  (`AdminDashboardPage.tsx`), tombol akun demo `/login` (`AdminLoginPage.tsx:141`),
  tombol Logout, dan tautan "Beranda". Diperbaiki dengan mematikan transisi
  **hanya saat `:focus-visible`** (`base.css:268-296`), sehingga transisi
  hover/aktif/disabled tidak tersentuh. Terverifikasi: elemen terfokus
  `transition-duration: 0s`, `outline-color` sudah `rgb(0,145,142)` pada frame
  pertama; 10 elemen yang punya transisi hover tetap `0.12s/0.15s` saat tidak
  fokus; 0 pelanggaran. Elemen ber-`.app-pressable` sebenarnya sudah aman
  (aturan tak berlapisnya menang atas utility Tailwind) — aturan ini menutup
  sisanya dan mencegah regresi.
- **`prefers-reduced-motion` belum menutup seluruh gerakan (Gate 27).** Blok
  `@media (prefers-reduced-motion: reduce)` hanya menangani `.app-pressable`
  dan `.animate-spin`/`.animate-pulse`. Dua gerakan lolos: (a)
  `transition-transform` pada chevron "Ketentuan" (`rotate-180`,
  `PromoLandingPage.tsx:91` + `PromoUploadWizard.tsx:612`); (b) kelas arbitrer
  `animate-[shake_0.4s_ease]` di `AdminLoginPage.tsx`. Ditambahkan kill-switch
  ber-scope (`*, *::before, *::after` → durasi 0.001 ms) plus aturan eksplisit
  `.transition-transform { transition: none }`. Durasi dipangkas, bukan
  `none`, agar event `transitionend` tetap terpicu; `animation-iteration-count:
  1` menghentikan animasi berulang. Terverifikasi di peramban dengan
  `emulateMediaFeatures(reduce)`: transisi maksimum seluruh dokumen = 1e-06 s.
- **Kelas `animate-[shake_0.4s_ease]` ternyata tidak pernah beranimasi.**
  Tailwind mengompilasinya menjadi `animation:.4s shake`, tetapi **tidak ada
  `@keyframes shake` di mana pun** (`git log -S "keyframes shake" --all`
  kosong) — jadi efek getar saat login gagal tidak pernah ada sejak v1.0.0.
  State `shake` + `setTimeout` 500 ms yang mati dihapus agar tidak menyesatkan
  pembaca berikutnya (perilaku visual tidak berubah).
- **Judul display tidak boleh mematahkan kata panjang (Gate 51).** `.ui-title-
  screen`/`.ui-title-section`/`.ui-title-card` belum punya `overflow-wrap`.
  Lebih penting: judul beranda memakai kelas Tailwind langsung
  (`font-display text-3xl sm:text-4xl`), sehingga tidak terjangkau kelas itu.
  Terukur di peramban (320px, kata majemuk panjang pada H1/H2 beranda):
  `scrollWidth` **637px** vs `clientWidth` **273px** — teks meluber dan
  terpotong oleh `overflow-x: clip`. Ditambahkan `overflow-wrap: anywhere;
  min-width: 0` pada ketiga kelas judul **dan** jaring pengaman `h1–h6` di
  `@layer base`. Terverifikasi: `scrollWidth` = `clientWidth` = 273px.
- **Keadaan `disabled` hanya ditandai dua kanal di 5 tombol admin (Gate 39).**
  `disabled:opacity-*` ada, atribut `disabled` ada, tetapi `cursor:
  not-allowed` tidak — hanya `ConfirmDialog` yang punya. Ditambahkan satu
  aturan global `button:disabled, input:disabled, select:disabled,
  textarea:disabled { cursor: not-allowed }`, menutup kelima tombol sekaligus
  mencegah regresi. Terverifikasi: 0 tombol nonaktif tanpa `not-allowed`.
- **51 dari 77 tombol/tautan tanpa cincin fokus bergaya sendiri (Gate 26).**
  Hanya 26 elemen memakai `.ui-focus-ring`/`.ui-btn-primary`; sisanya
  mengandalkan outline bawaan peramban, sehingga indikator fokus berbeda-beda
  antar elemen. Ditambahkan jaring pengaman `a/button/input/select/textarea/
  summary:focus-visible { outline: 2px solid var(--focus-ring-color) }` di
  `@layer base` — lapisan Tailwind menang tanpa peduli spesifisitas, jadi
  elemen yang sudah punya cincin sendiri (`ui-focus-ring`, `focus:ring-2`)
  **tidak berubah** dan tidak ada cincin ganda. Terverifikasi: 0 elemen
  interaktif tanpa cincin di beranda maupun `/login`.
- **Kontras ikon & teks `text-slate-400` di bawah ambang (Gate 40).**
  `slate-400` (`#94a3b8`) hanya **2.56:1** di atas putih — gagal ambang ikon
  3:1 maupun teks 4.5:1. Empat lokasi dinaikkan ke `slate-500` (**4.76:1**):
  label status "Nonaktif" (`AdminDashboardPage.tsx:1396`), ikon `Store` dan
  spinner `TenantSearchSelect`, tombol hapus berkas wizard, tombol hapus
  pilihan tenant, dan tombol intip password `/login`. `placeholder:text-
  slate-400` dibiarkan (placeholder dikecualikan WCAG 1.4.3).
- **Baris ikon+teks tanpa `align-items` eksplisit (Gate 36).** Tiga baris
  (`SubmissionDetail` riwayat status, `PromoLandingPage` daftar ketentuan)
  mewarisi `align-items: stretch`. Diubah ke `items-start` — baris dengan
  ikon ber-`mt-*` memang harus rata atas, bukan tengah. Baris `flex` lain yang
  mengandung ikon sudah memakai `items-center`.
- **Dua `<svg>` Lucide tanpa `aria-hidden` (Gate 33).** Tombol hapus berkas
  wizard dan tombol hapus pilihan tenant — keduanya punya `aria-label`, tetapi
  ikonnya belum tersembunyi dari pembaca layar. Ditambahkan `aria-hidden`.

### Usulan (belum dikerjakan)
- **Hex mentah di luar blok token (Gate 48) — mode gelap.** `base.css`
  memuat ~38 nilai hex/rgb mentah pada aturan `.dark .*` (`#0f172a`, `#1e293b`,
  `#334155`, `#475569`, `#94a3b8`, `#cbd5e1`, `#f1f5f9`, `rgb(15 23 42 / …)`)
  dan satu di mode terang (`.app-sheet-grip { background: #d6d3d1 }`).
  **Sengaja tidak diubah:** mode gelap belum diaudit dan belum aktif publik
  (DESIGN.md), sehingga mengangkatnya jadi token berisiko menimbulkan regresi
  yang tidak dapat diverifikasi. Perlu sesi audit mode gelap tersendiri.
- **Bentuk badge/radius.** Token `--radius-chip: 9999px` (`src/styles/theme.css:59`)
  tidak dipakai di mana pun, dan badge tidak seragam: `rounded-md` di admin
  (`AdminDashboardPage.tsx:68`), `rounded-full` di riwayat/detail
  (`MySubmissionsPage.tsx:28`, `SubmissionDetail.tsx:32`). Pilih satu bentuk
  (dan pakai tokennya) atau hapus tokennya. Keputusannya dicatat sebagai butir 2
  di bagian "Catatan Ketidaksesuaian" `DESIGN.md`.
- **Ukuran judul kartu katalog.** Kartu memakai `text-lg` (18px) yang cocok
  dengan token `--text-title` (`src/styles/theme.css:21`, yang `DESIGN.md`
  sendiri sebut sebagai sumber kebenaran); tabel lama "Skala Tipografi" di
  `DESIGN.md` menulis `text-xl`, dan tabel itu juga menyebut bobot `700`
  sementara bagian "Kartu Media (Landing)" menulis `600`. Tabel `DESIGN.md`
  sudah diperbaiki mengikuti kode (`text-lg`, Fraunces 700); pertanyaan
  terbukanya (bila niat desain sebenarnya `text-xl`/600) kini dicatat sebagai
  butir 4 di bagian "Catatan Ketidaksesuaian" `DESIGN.md`, bukan sebagai usulan
  terbuka di sini.

### Sebelumnya — penyelarasan kebijakan dokumentasi

Penyelarasan kebijakan dokumentasi + perbaikan jalur deploy yang ditemukan saat
verifikasi rilis 1.3.0 di produksi.

### Diperbaiki
- **Target sentuh 44px kini sistemik pada CTA primer/sekunder.** `DESIGN.md` menetapkan setiap kontrol interaktif minimal 44×44px, tetapi aturan `min-height: var(--tap-min)` selama ini hanya ada di `.ui-control`; `.ui-btn-primary` dan `.ui-btn-secondary` mengandalkan padding per pemakaian sehingga CTA jatuh di 36–42px. Aturan dipindah ke kedua kelas tombol (satu sumber kebenaran), menggantikan tambalan `min-h-11` per instance. `min-h-11` per instance yang sudah ada dibiarkan (nilainya identik). Audit dampak: seluruh 20 pemakaian `.ui-btn-primary`/`.ui-btn-secondary` adalah CTA/tombol utuh (bukan tautan inline di tengah kalimat), jadi tidak ada tata letak yang rusak. Terverifikasi di produksi: 0 elemen < 44px di 7 rute, axe 0 di 7 rute + 3 tab admin.
- **Audit navigasi & workflow (2026-09-19) — 8 temuan diperbaiki.** Cakupan 7 rute + 3 tab admin + modal, diukur di peramban terhadap build produksi (Chromium + axe-core 4.10.2). Setelah perbaikan: **0 pelanggaran axe di ketujuh rute** (tidak ada regresi), dan seluruh temuan punya bukti terukur. Rencana: `docs/PLAN_2026-09-19_11-13.md`. (Lanjutan audit yang sama — 4 celah workflow konsol staf — ada di entri di bawah.)
  - **Kritis · `Sheet` merebut fokus setiap render — pengguna hanya bisa mengetik SATU karakter di semua dialog staf.** `onClose` dikirim inline oleh semua pemanggil (`onClose={() => setDetail(null)}`), sehingga identitasnya berubah tiap render dan menjadi dependency efek "buka" — efek berjalan ulang, cleanup mengembalikan fokus ke pemicu, lalu panel merebutnya kembali. Terukur di peramban: mengetik "Spanduk Uji" di form Edit Media hanya menyisakan `"S"`; textarea Catatan Review hanya menyisakan `"M"`. `onClose` kini disimpan di ref dan efek hanya bergantung pada `open`. Terverifikasi: nilai utuh, fokus tetap di input. Bug ini **tak terdeteksi unit test** (`fireEvent.change` tidak memicu render ulang React) — ditambah 1 test regresi.
  - **Major · Wizard tidak mengarahkan fokus/gulir ke field tidak valid pertama (WCAG 3.3.1).** Terukur: pengguna yang menggulir ke bawah lalu menekan "Lanjut" melihat field invalid pertama berada **232px di atas layar**, fokus tetap di tombol. Kini fokus + `scrollIntoView` diarahkan ke field tidak valid pertama menurut urutan DOM (dipicu `focusErrorTick`, bukan `fieldErrors`, agar memperbaiki satu field tidak merampas fokus). Berlaku untuk validasi klien, `linkError`, ketentuan, dan validasi server yang dipetakan ke field. Ditambah 1 test regresi.
  - **Major · `/riwayat` menelan galat API.** `fetchMySubmissions` mengubah setiap `ApiError` (termasuk 503) menjadi daftar kosong, sehingga tenant melihat **"Belum ada pengajuan dari perangkat ini"** padahal pengajuannya ada dan hanya gagal dimuat (terverifikasi: respons 503 → layar kosong, 0 `role="alert"`). Galat kini diteruskan; halaman menampilkan panel "Gagal memuat riwayat pengajuan" + jalan keluar ke `/lacak`, terpisah dari keadaan kosong asli.
  - **Major · Tautan salah label di keadaan kosong `/riwayat`.** CTA "Ajukan Materi" mengarah ke `/` (katalog), bukan `/ajukan`. Tujuan diperbaiki; teks pendamping yang menyebut "dari halaman beranda" ikut diselaraskan.
  - **Major · Tab admin tidak bisa dipindah dengan keyboard.** `role="tablist"` dipasang tanpa dukungan panah — terukur `ArrowRight` tidak memindahkan fokus maupun `aria-selected`. Kini roving `tabIndex` + `onKeyDown` (←/→/↑/↓/Home/End, wrap) + `aria-controls` + `role="tabpanel"`.
  - **Major · `/lacak` tidak memberi umpan balik saat hasil tiba.** Detail dirender di bawah lipatan; terukur `scrollTop` tetap 0, fokus tetap di input, tanpa live region. Kontainer hasil kini fokusable (`tabIndex={-1}`, `aria-label="Hasil pelacakan"`) dan difokuskan saat pengajuan berganti (muat ulang pasca-revisi tidak merampas fokus dari form revisi).
  - **Major · Belasan kontrol di bawah 44px.** Terukur: tab admin non-aktif 36px, tombol Hapus 28px, "Tambah Media/User" 40px, Batal/Simpan 42px, "Kirim Tautan/Unggah File" 38–42px, tombol hapus berkas 28px, CTA 36px. Semua tombol/CTA kini `min-h-11` (tombol ikon `h-11 w-11`). Tersisa hanya tautan inline (<44px) yang dikecualikan WCAG 2.5.8.
  - **Minor · Atribut ARIA error tidak lengkap.** `installation_date`, `air_end_date`, `terms_accepted` tidak punya `aria-invalid`/`aria-describedby`; pesan error pemilihan media tanpa `role="alert"`. Kini ditautkan.
- **Perbaikan mojibake `TopAppBar.tsx`** — komentar baris 2 memuat `â€”` (UTF-8 terbaca sebagai Latin-1) dan diperbaiki menjadi em-dash `—`.

### Ditambahkan
- **Laporan audit navigasi & workflow** — `docs/PLAN_2026-09-19_11-13.md`. Memuat 12 temuan yang diperbaiki (lokasi, tingkat, bukti terukur) dan 3 usulan yang menunggu keputusan user karena mengubah perilaku produk: (U1) tombol Kembali `/status/:token` selalu ke `/riwayat` walau masuk dari `/lacak`; (U2) jalan keluar `/login` hanya satu tautan teks; (U3) judul app bar `/ajukan` dan `nav` langkah tanpa `aria-label` eksplisit.

### Diperbaiki
- **Audit navigasi & workflow (2026-09-19) — lanjutan: 4 celah workflow diperbaiki.** Cakupan konsol staf (3 tab + modal Detail). Semua temuan punya bukti terukur di peramban; axe 0 pelanggaran di 7 rute, 3 tab admin, dan modal Detail setelah perbaikan.
  - **Major · Keadaan kosong hilang di tab Katalog Media dan Pengguna.** Kedua tab merender wadahnya (grid/tabel) tanpa pesan apa pun bila daftar kosong — staf melihat layar kosong tanpa tahu apakah datanya benar-benar kosong atau masih memuat. Kini memakai panel `ui-empty-panel` (pola yang sudah dipakai `/riwayat`) + teks arahan sesuai peran (`canManage`), diumumkan lewat `role="status"`. Tab Pengajuan yang sudah punya pesan "Tidak ada pengajuan." kini juga `role="status"` agar diumumkan pembaca layar.
  - **Major · Aturan "Catatan Review wajib" tidak ditegakkan di klien.** Label UI berbunyi "wajib untuk Perlu Revisi dan Ditolak" dan server menegakkannya (`server/src/routes/admin.js` → 400), tetapi klien tidak: memilih "Perlu Revisi" dengan catatan kosong membuat tombol "Simpan Status" tetap aktif tanpa peringatan — admin baru tahu **setelah** submit. Kini klien menyalin aturan server (`STATUS_WAJIB_CATATAN`/`PESAN_CATATAN_WAJIB`): tombol `disabled` + pesan inline `role="alert"` bertaut `aria-describedby`; server tetap otoritatif dan pesan galat server tidak dihapus.
  - **Major · Tautan "Buka" pada riwayat versi materi di bawah target 24px (WCAG 2.2 AA 2.5.8).** axe `target-size`: tautan 44.5×16px dengan ruang klik aman 20px. Ini temuan **pre-existing** (terbukti muncul juga pada build HEAD), bukan regresi; karena tautan kontrol berdiri sendiri di baris daftar (bukan tautan inline di tengah kalimat), pengecualian 2.5.8 tidak berlaku. Kini `min-h-11`. Modal Detail kini **0 pelanggaran** axe.
  - 5 test regresi ditambahkan (3 keadaan kosong, 2 penegakan catatan wajib). Suite: 33 berkas / 292 test hijau.

### Fixed
- **Audit UI/UX (Hallmark 58 gate + WCAG 2.2/axe-core) — 4 temuan diperbaiki.** Cakupan 7 rute (`/`, `/ajukan`, `/riwayat`, `/lacak`, `/login`, `/admin`, `/status/:token`) di produksi, viewport 320–1280. Setelah perbaikan: **0 pelanggaran axe di ketujuh rute**, 0 elemen meluber di 320px.
  - **Major · `<dl>` tidak valid di kartu katalog** (`definition-list` 13 node + `dlitem` 88 node). Setiap baris membungkus `<dt>`/`<dd>` dalam `<div>` bersarang, sehingga `<dd>` kehilangan induk `<dl>` langsung. Ikon dipindah ke dalam `<dt>`, `<dd>` jadi anak langsung pembungkus. Sekarang `<dl>` hanya berisi `<div>` dengan `<dt>`+`<dd>` di dalamnya.
  - **Major · teks meluber di 320px.** Label nama media (`Feed Instagram/Fanpage/TikTok`) mencapai `right=340px` pada viewport 320px: flex item tanpa `min-w-0` tidak bisa menyusut di bawah lebar min-content kata terpanjang, dan kata bergaris miring tak punya titik putus. Diperbaiki dengan `min-w-0` + `[overflow-wrap:anywhere]`.
  - **Major · kontras chip kategori** (`/ajukan`). `text-slate-500` di atas `bg-slate-100` hanya **4.34:1**, gagal AA 4.5:1 untuk teks 12px. Dinaikkan ke `text-slate-600` (**6.92:1**).
  - **Moderate · landmark & heading hilang.** `/login` tidak punya landmark `<main>` (8 node di luar landmark); `/admin` pada state "sesi berakhir" tidak punya `<main>` maupun `<h1>`. Keduanya diperbaiki.
  - **Jaring pengaman:** `overflow-x: clip` pada `html` + `body` (bukan `hidden`, agar `position: sticky`/`fixed` tetap bekerja).
  - **Dikecualikan dengan alasan:** link inline "Lacak dengan nomor pengajuan" (18px) — WCAG 2.5.8 mengecualikan inline text link; memaksa 44px merusak alur kalimat.

### Fixed
- **Audit dashboard admin (kredensial dev di `/login`) — 4 temuan kontras diperbaiki.** Cakupan: tab Pengajuan, Katalog Media, Pengguna, dan modal Detail, diakses sebagai `super@metmal.co.id`. Setelah perbaikan: **0 pelanggaran axe di ketiga tab + modal**, dan 7 rute publik tetap 0.
  - **Badge status `sudah_dipasang`** memakai `bg-brand-primary-500` (`#00918e`) dengan teks putih = **3.86:1**, gagal AA 4.5:1. Diganti `bg-brand-primary-600` (`#007a78`) = **5.18:1**. Tujuh badge status lain sudah lulus (4.79–9.42).
  - **Kartu media nonaktif memakai `opacity-70`**, yang menurunkan kontras **seluruh** teks di dalamnya: `ui-text-muted` 4.76 → **2.75:1**, `slate-600` di `slate-200` 6.15 → **3.10:1**, `slate-700` → 4.37:1. Opacity dihapus; state nonaktif tetap dibawa badge "Nonaktif" (`slate-600` di `slate-200` = 6.15:1). Terverifikasi visual: kartu "Vertical Banner" tetap terbaca sebagai nonaktif.
  - **`(sekarang)`** di pipeline status memakai `ui-text-muted` di atas `bg-brand-primary-50` = **4.31:1**, gagal AA. Diganti `text-slate-600` = **6.86:1**.
  - **Tautan nav "Beranda"** tinggi 16px. Secara WCAG 2.5.8 ini **lulus** pengecualian jarak (lingkaran 24px tidak bersinggungan dengan target lain) — jadi bukan pelanggaran; disamakan ke `min-h-11` demi konsistensi dengan pola repo.

### Added
- **Laporan audit UI/UX** — `docs/PLAN_2026-09-18_20-18-audit-uiux.md` (mencakup medprom + komunitas).

  **Catatan koreksi metode:** audit pertama melaporkan "0 pelanggaran axe" di `/` dan `/ajukan`; itu **keliru** — katalog media belum ter-render saat axe dijalankan (tunggu 6 detik, kurang dari waktu fetch API). Dengan tunggu 9 detik, pelanggaran muncul dan sudah diperbaiki di atas. Angka "0 pelanggaran" hanya sah bila konten async sudah ter-render.

### Ditambahkan
- **Pelacakan pengajuan dengan nomor — plus captcha Cloudflare Turnstile.**
  Tenant yang kehilangan tautan status kini bisa membuka `/lacak`, memasukkan
  nomor pengajuan (`MP-YYMMDD-XXXXXX`) yang tercetak di layar sukses, dan
  melihat halaman status yang sama persis dengan halaman ber-token (status,
  catatan tim, riwayat status, riwayat versi materi, informasi pemasangan, dan
  form revisi). Endpoint baru `GET /api/v1/promo/submissions/track?number=`.
  Karena pola nomor mudah ditebak, pengiriman dijaga **captcha Cloudflare
  Turnstile**: tombol Lacak terkunci sampai verifikasi selesai, dan server
  memverifikasi token ke Siteverify sebelum data apa pun dibaca (fail-closed
  503 bila Siteverify tak terjangkau), mengikuti kontrak kanonik Cloudflare:
  `success` **dan** `action` cocok (`'track'`) **dan** `hostname` termasuk
  allowlist. Tautan masuk ditambahkan di tab bar
  (tab "Lacak"), hero beranda, layar sukses wizard, dan keadaan kosong Riwayat.
  **Operator: isi `TURNSTILE_SECRET_KEY` + `TURNSTILE_HOSTNAMES` (server) dan
  `VITE_TURNSTILE_SITE_KEY` (frontend, build ulang).** Tanpa secret key,
  verifikasi dilewati dan server menulis peringatan saat boot; secret terisi
  tanpa allowlist hostname membuat verifikasi ditolak `503`.
- **Gambar media promosi kini bisa diganti dari dashboard staf (CRUD).**
  Di form Edit Media ada panel "Foto Katalog": pratinjau, tombol Ganti Foto,
  dan Hapus Foto. Berkas disimpan di volume Docker `medprom_media` (repo
  produksi read-only, jadi gambar tidak bisa ditulis ke sana), disajikan lewat
  `GET /api/v1/media/:nama` dengan cache selamanya karena nama berkas memuat
  sufiks acak. Format: JPEG/PNG/WebP, maks 4MB, diverifikasi magic bytes
  SEBELUM ditulis — berkas yang isinya tidak cocok ditolak. Mengganti foto
  menghapus berkas lama supaya tidak menumpuk.
- `seed-media-types.mjs --reset-gambar` mengembalikan seluruh foto ke bawaan
  deck, sekaligus membersihkan berkas unggahan yang jadi yatim di volume.

- **Foto contoh tiap media promosi, diekspor dari deck 2026.** Deck
  "MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026" sudah memuat foto tiap media
  (hal. 2-14). Foto itu diekstrak per halaman dari deck, dipangkas ke 4:3, dan
  dikonversi ke WebP (14 berkas, ~910 KB) di `public/media/`. Kini tampil di
  kartu katalog (rasio dikunci 4:3 + `width`/`height` agar tidak ada pergeseran
  tata letak) dan sebagai thumbnail di langkah 1 wizard.
- Kolom `image_path` pada `promo_media_types` (migrasi idempotent), ikut
  disinkronkan seed, dan disertakan API publik maupun admin. Media tanpa foto
  tetap dirender tanpa `<img>` kosong.


- **Platform kini PWA yang dapat dipasang** (`display: standalone`).
  `public/manifest.webmanifest` (ikon any 192/512 + maskable 512, pintasan
  Ajukan & Riwayat), `public/icon.svg` + PNG hasil `scripts/gen-icons.mjs`
  (Playwright, tanpa dependensi baru), dan `public/sw.js` — service worker
  tulis tangan: shell + aset di-cache, **permintaan `/api/` tidak pernah
  di-cache** agar status pengajuan tidak pernah basi. Registrasi hanya di
  produksi (`src/main.tsx`). Terverifikasi: SW `activated`, cache
  `medprom-shell-v2` + `medprom-aset-v2` terisi, halaman tetap terbuka saat
  offline, dan nol respons API tersimpan di cache.
- **Kerangka aplikasi (app shell) untuk seluruh layar tenant.**
  `src/components/layout/AppShell.tsx`, `TopAppBar.tsx` (judul kontekstual,
  tombol kembali, terangkat saat konten menggulir), `BottomTabBar.tsx`
  (Katalog · Ajukan · Riwayat, mobile saja), dan `src/components/ui/Sheet.tsx`
  (bottom sheet di mobile, dialog terpusat di desktop; kunci gulir latar,
  tutup via Escape/scrim, jebakan fokus, pemulihan fokus). 17 test mount baru
  untuk keduanya.
- **`scripts/preview-server.mjs`**: server pratinjau lokal yang menyajikan
  `dist/` sekaligus mem-proksikan `/api/*` ke API produksi (meneruskan body,
  cookie, dan `Set-Cookie`). Dipakai untuk verifikasi visual build produksi
  tanpa melonggarkan whitelist CORS produksi.

- **Kebijakan dokumentasi**: rencana/audit eksekusi disimpan di
  `docs/PLAN_YYYY-MM-DD_HH-mm.md`, dan setiap perubahan wajib dicatat di
  `[Unreleased]` (`AGENTS.md` § Commit & Rilis). Rencana pertama:
  `docs/PLAN_2026-09-16_12-04.md` (implementasi + deploy 1.3.0).
- **Petunjuk kredensial akun staf di halaman `/login` (tahap pengembangan).**
  Halaman login menampilkan ketiga akun staf beserta password defaultnya, dan
  tiap akun bisa diklik untuk mengisi form otomatis. Sumber tunggalnya
  `src/constants/devCredentials.ts`; password default seragam `admin123`,
  diset ke produksi lewat `create-admin.mjs --reset`.

  ⚠️ **Ini menampilkan kredensial ke siapa pun yang membuka `/login`.**
  Untuk pengembangan saja. Sebelum dipakai publik: set
  `VITE_PROMO_SHOW_DEV_LOGIN='0'` (Vercel → Settings → Environment Variables),
  **build + deploy ulang** (nilai `VITE_*` di-inline saat build, bukan dibaca
  runtime), lalu ganti password akun nyata. Saat flag mati panelnya tidak
  dirender; kode kredensial tetap ikut ter-bundle (flag hanya menggerbangi
  perenderan).

### Dirapikan
- **Domain API pindah ke `promapi.metmalcommunityspace.web.id`.** Menggantikan
  `promapi.andotherstori.my.id` di Caddyfile, README deploy, dan tiga script
  verifikasi (`verify-admin-flow`, `verify-tenant-upload`, `preview-server`).
  Tidak ada perubahan kode server: base URL ada di env frontend
  (`VITE_API_URL`) dan konfigurasi Caddy, bukan di source.
  `Caddyfile` kini memakai snippet bersama dan **tetap melayani domain lama
  sebagai alias** — frontend yang masih memuat bundle lama (service worker
  menyajikan shell dari cache) memanggil host itu, jadi alias baru boleh
  dihapus setelah beberapa rilis.
- **Contoh `CORS_ORIGIN` di `deploy/vps/.env.example` salah** — tertulis
  `medprom.vercel.app`, padahal domain produksi `medprom-metmal.vercel.app`.
  Contoh yang salah menghasilkan CORS 403 bila disalin apa adanya.

- **Desain visual penuh ditulis ulang — arah Editorial Kontras.**
  Seluruh UI beralih dari pola hangat project event (Bricolage Grotesque + cream
  paper + kartu bulat + tosca merata) ke bahasa editorial: Fraunces serif
  display, putih bersih, garis hairline stone, radius tajam, tosca sangat hemat
  (maks 2 sentuhan/viewport). Token dan utility yang dihapus: `--brand-paper`,
  `--brand-card`, `--brand-card-light`, `--brand-secondary`/pink,
  `ui-dashboard-*`. Token baru: `--surface-page`, `--surface-offset`,
  `--ink-primary`, `--rule-color`, `.ui-number`, `.ui-rule`, `.ui-admin-card`.
  Semua 7 komponen ditulis ulang; 18 berkas / 164 test tetap hijau. Rancangan:
  `DESIGN.md` (baru).

### Diperbaiki
- **Navigasi utama tidak ada sama sekali di desktop.** Tab bar bawah
  menyembunyikan dirinya di `≥640px` (aturan `base.css`) dan tidak punya
  pengganti, padahal `DESIGN.md` menetapkan "di desktop navigasi ada di app
  bar". Akibatnya tujuan seperti `/lacak` hanya bisa dicapai dengan mengetik
  URL — tab keempat hanya muncul di mobile. Daftar tujuan kini satu sumber
  (`navItems.ts`) dan disajikan dua komponen: `BottomTabBar` (mobile) dan
  `TopNav` di dalam app bar (desktop). `AppShell` merender **tepat satu**
  berdasarkan viewport agar tidak ada dua landmark `nav` bernama sama.
  `CACHE_VERSION` service worker dinaikkan ke `v10`.
- **Batas 5 pengajuan/24 jam per perangkat bisa dilewati.** `device_fingerprint`
  bersifat opsional di `POST /promo/submit` dan pengecekan anti-spam dibungkus
  `if (fingerprint)`, sehingga klien cukup mengosongkan field itu untuk
  mengirim tanpa batas. Field kini **wajib** (400 bila kosong), sama seperti
  syarat revisi. Konsekuensi: klien lama yang tidak mengirim fingerprint akan
  ditolak — frontend sudah selalu mengirimnya (`getDeviceFingerprint()`).
- **`GET /promo/submissions/mine` tidak dibatasi laju** padahal responsnya
  memuat `status_token` rahasia tiap pengajuan, sehingga fingerprint perangkat
  bisa ditebak berulang. Kini dibatasi 60 permintaan / 15 menit / IP (sama
  dengan `status/:token`).
- **Ekspor CSV rawan formula injection.** Nilai kiriman tenant (nama campaign,
  judul materi, catatan) dan nomor telepon `+62...` diekspor mentah, sehingga
  sel yang dimulai `=`, `+`, `-`, atau `@` dieksekusi Excel/Sheets sebagai
  rumus. `csvEscape` kini memberi awalan `'` pada sel berbahaya (tanda teks —
  di Excel disembunyikan, teks tampil utuh) dan mengutip sel yang memuat `\r`.
  Akses ekspor (memuat telepon + IP) juga kini dicatat ke `activity_logs`.
- **Test kontrak seed diperketat.** Test lama mengunci perilaku lewat dua
  potongan string SQL, sehingga kolom lain bisa diam-diam tertinggal. Kini
  menguji kesepuluh kolom yang dikelola seed - kolom baru yang lupa
  didaftarkan ke ON CONFLICT akan langsung gagal.

- **Info jumlah unit Boom Gate terbaca sebagai harga.** Baris Harga kartu Boom
  Gate berisi "Total 16 Unit" — itu kapasitas pemasangan, bukan tarif. Kini
  terbaca "Area Parkir Timur dan Parkir Gedung (16 unit tersedia)" pada baris
  Lokasi; kolom Harga dikosongkan karena deck tidak menyebut tarifnya.
- **Seed tidak menyinkronkan sebagian besar kolom media.** Klausa ON CONFLICT
  hanya memperbarui accepted_formats dan rules (lalu price_note), sehingga
  perubahan name/size_spec/material_spec/location_note/is_active/sort_order di
  seed tidak pernah sampai ke DB - edit tampak berhasil tapi katalog tidak
  berubah. Kini seluruh kolom yang dikelola seed disinkronkan.

- **Ganti 38 warna heksadesimal arbitrer di komponen dengan token semantik.**
  `ring-[#007a78]` (27x) → `ring-brand-primary-600`, `text-[#006260]` →
  `text-brand-primary-700`, `ring-[#00918e]/30` → `ring-brand-primary-500/30`,
  `bg-[#e6f7f6]` → `bg-brand-primary-50`, ditambah token baru
  `--color-brand-soft` untuk `dark:ring-[#33a8a5]`. Semua nilai sama persis —
  terukur di peramban: 961 elemen di 5 layar, hasil terhitungnya identik.
- **Hormati `prefers-reduced-motion` untuk spinner dan skeleton.** 17 ikon
  `animate-spin` dan `animate-pulse` sebelumnya berputar tak terbatas walau
  pengguna meminta gerak dikurangi. Kini `animation: none` lewat blok
  `reduced-motion` yang sudah ada di `base.css` — status tetap terbaca karena
  setiap spinner selalu didampingi teks ("Mengirim…", "Memuat riwayat…").

- **Nama layar konsol staf membungkus tiga baris di ponsel.** Setelah judulnya
  dinaikkan ke peran nama layar, "Media Promosi — Admin" memecah jadi tiga baris
  pada lebar 390px dan mendorong header setinggi 130px. Di bawah 640px judul itu
  kini turun satu langkah skala (24 -> 20px) sehingga menjadi dua baris dengan
  header 89px; pada 1440px tetap 24px satu baris. Turunnya ukuran sengaja
  dibatasi pada header konsol staf (`.ui-admin-title`) — judul app bar layar
  tenant tetap 24px agar tidak seri dengan judul bagian 20px.

- **Layar sukses wizard dan judul sheet berbagi ukuran dengan `<h1>`.** Di layar
  "Pengajuan Terkirim", judul app bar dan judul besar di dalam kartu sama-sama
  24px, dan teksnya memang sama persis sehingga terbaca sebagai pengulangan
  tanpa hierarki. Judul sheet pada dashboard staf (Detail Pengajuan, Tambah
  Media, Tambah User) juga 16px - sama dengan `<h1>` layar. Keduanya kini
  memakai peran yang lebih rendah daripada nama layar (20px dan 18px).
- **Nama layar dashboard staf terlalu kecil.** `<h1>` "Media Promosi — Admin"
  hanya 16px, lebih kecil daripada judul sheet di atasnya. Kini memakai peran
  nama layar (24px), sama dengan app bar layar tenant, sehingga konsol staf dan
  sisi tenant akhirnya memakai ukuran judul yang sama.

- **Hierarki judul terbalik / tidak seragam.** Terukur di peramban: `/login`
  memakai `<h1>` 14px (lebih kecil daripada teks isinya), wizard punya `<h1>`
  16px tetapi `<h2>` 20px, dan di halaman katalog `<h1>` dan `<h2>` sama-sama
  24px pada layar kecil sehingga levelnya tidak terbaca. Ditambah satu `<h2>`
  berukuran 24px di antara `<h2>` lain yang 30px pada satu halaman yang sama.
  Kini tiap peran teks punya satu ukuran tetap (`--text-meta` 12 · `--text-dense`
  14 · `--text-body` 16 · `--text-title` 18 · `--text-section` 20 · `--text-screen`
  24). Terverifikasi: setiap layar tepat satu `<h1>`, dan ukuran judul **turun
  monoton** (h1 > h2 > h3) di seluruh rute pada 390px maupun 1440px.
- **Teks di bawah ambang baca.** 13 elemen di wizard berukuran 10px, dan 11px
  dipakai luas untuk label serta lencana. Seluruh teks kini **minimal 12px**;
  teks isi naik ke 16px agar sesuai lantai baca yang nyaman.
- **Lebar baca berlebih.** Paragraf penjelas di halaman riwayat mencapai
  **116ch** dan halaman status **100ch** di desktop — jauh di atas rentang
  nyaman 45–75 karakter, sehingga mata sulit berpindah baris. Keduanya kini
  dibatasi (`--measure`, 65ch), terukur menjadi 33–74ch.
- **Jarak judul ke teks isi tidak seragam.** Jarak 4px, 8px, dan 12px bercampur
  antar-halaman untuk hubungan yang sama. Diseragamkan menjadi satu nilai.
- **Judul panjang menggantung satu kata.** Judul kini memakai `text-wrap:
  balance`, teks isi `text-wrap: pretty`, sehingga baris terakhir tidak lagi
  menyisakan satu kata.

- **Wizard tidak menggulir ke atas saat pindah langkah.** Pengguna yang
  menggulir jauh di langkah 1 mendarat di tengah halaman pada langkah 2 —
  terukur judul langkah 2 berada **639px di atas layar**, sehingga pengguna
  tidak melihat apa yang harus diisi. Fokus juga tetap di `BODY`, jadi pembaca
  layar tidak diberi tahu langkah berganti. Kini setiap perpindahan langkah
  menggulir area konten ke atas dan memindahkan fokus ke judul langkah.
- **Dua `<h1>` tampil bersamaan di wizard.** Judul app bar dan judul langkah
  sama-sama `<h1>`, dan `/admin` justru tidak punya `<h1>` sama sekali.
  Hierarki diseragamkan: judul app bar adalah `<h1>` (nama layar), judul
  konten turun menjadi `<h2>`. Terverifikasi tiap layar kini tepat satu `<h1>`.
- **Pesan error field tidak terhubung ke field-nya.** `aria-describedby`
  tidak dipakai sama sekali, sehingga pembaca layar mengumumkan field tidak
  valid tetapi tidak pernah membacakan alasannya. Delapan field kini menautkan
  `aria-describedby` ke `<p id="err-*" role="alert">`.
- **Safari iOS memperbesar halaman saat input difokuskan.** Seluruh input
  berukuran 14px, di bawah ambang 16px yang memicu zoom otomatis — keyboard
  muncul dengan halaman sudah ter-zoom. Kontrol isian kini 16px pada layar
  `< 640px`, tanpa memakai `maximum-scale=1` (yang akan melanggar WCAG karena
  memblokir pinch-zoom).

- **Kerangka aplikasi tidak benar-benar mengunci gulir** — dokumen ikut
  menggulir dan app bar bergeser saat konten digulir (inti klaim "seperti
  aplikasi"). Akar masalahnya bukan `min-height`, melainkan keturunan
  `position: absolute` (`.sr-only` pada `<dt>` kartu media) yang mengambil
  containing block dari dokumen karena `.app-scroll` tidak terposisi, sehingga
  menambah tinggi gulir dokumen. `.app-shell` kini `height: 100dvh` +
  `overflow: hidden`, `.app-scroll` mendapat `min-height: 0` **dan**
  `position: relative`. Terverifikasi: dokumen tetap 844px, hanya area konten
  yang menggulir, app bar tidak bergeser dan kini benar-benar terangkat.
- **Tiga dialog konsol staf kehilangan perilaku modal.** Detail/review, form
  katalog, dan form pengguna adalah salinan `.app-scrim` + `.app-sheet`
  langsung di JSX, bukan komponen `Sheet` — sehingga tidak mengunci gulir
  latar, tidak menutup dengan `Escape`, dan tidak menjebak fokus. Ketiganya
  kini memakai `Sheet` (bottom sheet di mobile, dialog terpusat di desktop).
- **`ConfirmDialog` mengalami masalah yang sama** — tidak menutup dengan
  `Escape` dan tidak mengunci gulir. Kini memakai `Sheet` juga.
- **Form login terpotong di layar pendek.** `.app-shell` memusatkan konten
  tanpa area gulir; pada viewport 360×420 tombol Login tidak terjangkau. Layar
  tanpa bar/tab bar kini memakai `.app-canvas` (terpusat, tetap dapat
  menggulir). Terverifikasi: tombol Login terjangkau pada 420px.
- **Belasan kontrol interaktif di bawah 44px.** CTA kartu (40px), tombol
  "Ketentuan pemasangan" (20px), tautan "Login Staf" (36px), tombol
  tampilkan-password (24px), tautan WhatsApp (30px), dan seluruh input
  (42px). `--tap-min` kini ditegakkan pada `.ui-control` (satu aturan untuk
  semua input/tombol sekunder) dan tombol-tombol terkait dinaikkan. Kini 0
  kontrol di bawah 44px di halaman publik.
- **Radius tombol tidak seragam.** CTA kartu katalog tertinggal di 6px
  sementara kontrol lain 10px, karena radius bergantung pada kelas utilitas
  per pemakaian. `.ui-btn-primary`/`.ui-btn-secondary` kini mengambil radius
  dari `var(--radius-control)`.


- **Tombol kembali wizard keluar dari alur pengajuan.** `AppShell` hanya
  menerima `backTo`, sehingga langkah 2 dan 3 jatuh ke `navigate(-1)` — yaitu
  kembali di riwayat peramban (meninggalkan wizard), bukan memundurkan langkah.
  Ditambah prop `onBack` pada `TopAppBar`/`AppShell`; wizard memakai
  `setStep(s === 3 ? 2 : 1)` dan hanya keluar ke beranda dari langkah 1.
  Terverifikasi di produksi: langkah 2 → Kembali → tetap `/ajukan`, langkah 1.
- **Atribut `data-tabbar` tidak dibaca CSS.** `AppShell` menandai `.app-scroll`
  dengan `data-tabbar="off"` saat `hideTabBar`, tetapi tidak ada aturan yang
  memakainya, sehingga wizard tetap menyisakan ruang setinggi tab bar di bawah.
  Kini diikat: `[data-tabbar='off']` hanya menyisakan safe area. Terverifikasi:
  wizard padding `0px`, katalog `60px`.
- 3 test regresi ditambahkan (184 → 187) karena `tsc` tidak dapat menangkap
  kedua regresi di atas.

- **Dua kelas CSS dipakai tetapi tidak pernah didefinisikan** — residu migrasi
  `sed` pada redesign Editorial Kontras. `ui-alert-panel` (dipakai
  `AdminDashboardPage` ×3 dan `PromoUploadWizard` ×1) dan `ui-empty-panel`
  (dipakai `MySubmissionsPage`) tidak punya aturan, sehingga panel galat dan
  panel kosong **tampil tanpa gaya apa pun di produksi**. Keduanya kini
  didefinisikan (termasuk varian `.dark`).
- **Tab bar bawah tetap tampil di desktop.** `display: grid` pada `.app-tabbar`
  mengalahkan utilitas `sm:hidden` di komponen, sehingga tab bar muncul di layar
  lebar. Penyembunyian dipindah ke `@media (min-width: 640px)` di CSS dan
  `sm:hidden` dihapus agar hanya ada satu sumber kebenaran. Terverifikasi:
  mobile `grid` + padding bawah 60px, desktop `none` + padding 0.
- **CTA hero landing bentrok dengan tombol per kartu media.** Keduanya bernama
  "Ajukan Materi", sehingga `getAllByRole('link', {name:/Ajukan Materi/i})[0]`
  menangkap CTA hero dan asersi slug media gagal. CTA hero berganti nama
  menjadi "Mulai Pengajuan" — label, bukan test, yang diperbaiki.
- **Judul app bar menduplikasi heading langkah wizard.** Judul app bar dinamis
  (`STEPS[step-1].label`) membuat "Kirim Materi" muncul sebagai dua heading
  sekaligus. Judul app bar kini tetap "Ajukan Materi"; nama langkah hanya di
  indikator progres.
- **`### Diperbaiki` duplikat di `[Unreleased]`** digabung menjadi satu bagian.

- `server/src/routes/admin.js` (`POST /admin/submissions/:id/delete`):
  komentar fallback diperjelas — *tautan* **atau** *legacy R2
  (`source_type='upload'` tanpa `drive_file_id`)* → lewati penghapusan Drive,
  langsung hapus row. Kondisi kode tidak berubah (sudah benar sejak awal),
  kini kejadian `MP-260912-82BFF1` dibuktikan dengan 3 test di
  `admin-flow.test.js` (tautan, legacy R2, unggah-valid). Test naik 164 → 167.
- Env produksi: kunci mati `R2_*` dihapus dari
  `/opt/medprom/deploy/vps/.env` (penyimpanan pindah ke Drive sejak 1.1.0;
  tersisa hanya backup `.env.bak-*`). API restart, healthz OK.

### Diubah
- **Runbook deploy diselaraskan dengan pitfall #10 dan Caddyfile kini ber-versi.**
  Langkah update tidak lagi `up -d` lalu `db-migrate` (API lama + constraint baru
  = tiap pengajuan gagal 400 padahal `/healthz` hijau); urutannya kini
  `stop api` → `run --rm` migrate/seed → `up -d api`. `--exclude .env*` diganti
  exclude `.env` spesifik agar `.env.example` ikut tersalin (memperbaiki
  `cp .env.example .env` di VPS baru). Blok Caddy dipindah ke
  `deploy/vps/Caddyfile` dengan `header_up X-Real-IP {remote_host}` wajib —
  tanpa itu rate limit per-IP bisa dilewati dengan memalsukan header.
- **Seed tidak lagi menimpa `image_path`.** Foto bisa diganti staf, jadi seed
  biasa membiarkan foto hasil unggahan tetap dipakai; hanya `--reset-gambar`
  yang menimpanya. Konsekuensi: suntingan admin atas kolom katalog lain tetap
  ditimpa seed (seed adalah sumber kebenaran katalog dari deck).

- **`DESIGN.md` diselaraskan dengan kode** setelah audit UI/UX. Yang diperbaiki
  bukan hanya uraian yang kurang lengkap, melainkan klaim yang **bertentangan
  dengan kode**:
  - skala tipografi menyebut `text-6xl sm:text-8xl` untuk hero dan "Number XL",
    padahal tidak ada satu pun pemakaian di kode — nilai sebenarnya
    `text-2xl sm:text-4xl` untuk H1;
  - bagian "Nomor & Langkah" menyatakan `01/02/03` adalah penanda langkah
    wizard, padahal wizard memakai indikator progres bersegmen (bagian ini
    diganti menjadi "Angka & Statistik");
  - aturan "maksimal dua sentuhan tosca per viewport" bertabrakan dengan
    katalog yang memakai empat ikon tosca per kartu. Aturan dipecah menjadi
    aksen **struktural** (maksimal satu per viewport) dan aksen **ikon
    berulang** (boleh mengikuti jumlah baris data);
  - struktur hero, CTA primer/sekunder, kartu, tabel admin, mode gelap, dan
    wizard diselaraskan; tiga invarian CSS pengunci gulir didokumentasikan.
  Checklist QA ditambah tujuh butir: penguncian gulir, `--tap-min`, dialog
  wajib `Sheet`, dan keseragaman radius.
- `CACHE_VERSION` service worker dinaikkan `v1` → `v2` karena aset shell
  berubah pada rilis ini.


- **Arah desain bergeser dari Editorial Kontras ke App Produk** (keputusan
  pengguna). Geist memimpin tipografi antarmuka; Fraunces dipertahankan sebagai
  aksen display untuk judul dan angka. Radius naik (`--radius-card` `0.875rem`,
  `--radius-control` `0.625rem`, chip pill, `--radius-sheet` `1.25rem`), dan
  bayangan dipulihkan secara terbatas lewat tiga token elevasi
  (`--elevation-bar|sheet|fab`) — hanya untuk elemen mengapung; kartu statis
  tetap hairline. Token baru: `--tap-min` (44px), `--safe-top`/`--safe-bottom`.
  Utilitas baru: `.app-shell`, `.app-scroll`, `.app-bar`, `.app-tabbar`,
  `.app-tab`, `.app-pressable`, `.app-scrim`, `.app-sheet`, `.app-sheet-grip`.
  `DESIGN.md` diperbarui mengikuti (bagian Kerangka Aplikasi + Permukaan &
  Elevasi + Radius).
- **Seluruh halaman tenant dimigrasikan ke app shell.** `PromoLandingPage`
  (header sendiri dihapus; hero dipadatkan; katalog jadi fokus), 
  `PromoUploadWizard` (header + stepper nomor diganti app bar dan indikator
  progres bersegmen; tab bar disembunyikan agar alur fokus), `MySubmissionsPage`,
  dan `SubmissionStatusPage`. `AdminLoginPage` memakai kanvas `.app-shell`.
- **Tiga dialog tengah di dashboard staf menjadi sheet responsif.**
  Detail/review pengajuan, form katalog, dan form pengguna kini memakai
  `.app-scrim` + `.app-sheet`: menempel bawah di mobile (radius hanya tepi atas,
  maks 92dvh), dialog terpusat 640px di desktop (radius seragam, maks 85dvh).

- `deploy/vps/docker-compose.yml`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REFRESH_TOKEN` dari wajib (`:?`) menjadi opsional (`:-`). Kanal unggah
  memang *fail-closed* (`POST /drive/upload` → `503`), jadi kredensial Drive
  yang belum diisi **tidak boleh** memblokir boot API. Instance tanpa kredensial
  Drive tetap melayani kanal tautan secara penuh.

- **Perintah `rsync` pada panduan deploy menghapus seluruh backup DB.**
  `backup.sh` menulis ke `/opt/medprom/backups`, yaitu **di dalam** tujuan rsync
  `/opt/medprom/`, sementara sumber tidak punya `backups/`; dengan `--delete`
  setiap rilis menghapus semua backup. Kedua perintah di
  `deploy/vps/README-DEPLOY.md` kini memuat `--exclude 'backups/'`. Rilis 1.3.0
  sendiri dideploy dengan merge (tanpa `--delete`) agar backup tetap utuh.
- `AGENTS.md`: pitfall #1 ditandai selesai; ditambah #10 (**kode & skema wajib
  naik bersamaan** — terbukti `violates check constraint` saat API versi lama
  menulis status lama sementara `/healthz` tetap `ok`), #11 (`R2_*` sudah mati di
  `.env` VPS; `GOOGLE_*` sengaja opsional), #12 (klaim docs wajib cocok kode).
- **Line ending dipaksa LF lewat `.gitattributes`** (`* text=auto eol=lf` +
  `*.sh text eol=lf`). Tanpa itu, `core.autocrlf=true` (default Git for Windows)
  membuat checkout menulis CRLF, sementara deploy mengirim working tree apa
  adanya lewat rsync ke VPS Linux — `deploy/vps/backup.sh` ber-CRLF akan gagal
  dieksekusi saat dipanggil cron (`bad interpreter`). Tidak ada berkas yang
  direnormalisasi: seluruh 80 berkas sudah LF, jadi dampaknya hanya mencegah
  masalah di masa depan. Verifikasi: clone bersih menghasilkan 81/81 berkas LF.

## [1.3.0] — 2026-09-16

Penerapan PRD *Tenant Material Management* (MVP) pada platform: alur status 8
tahap, nomor pengajuan + token status, revisi materi berversi, pencatatan
pemasangan, dan dashboard staf dengan ringkasan/pencarian/filter tanggal.

### Ditambahkan

- **Nomor pengajuan** `MP-YYMMDD-XXXXXX` dan **token status** acak 32 karakter
  per pengajuan (FR-016, FR-018). Keduanya unik lewat partial unique index;
  pengajuan lama di-backfill saat migrasi.
- **Halaman status publik** `/status/:token` (FR-019..FR-022): status terkini,
  catatan tim, riwayat perubahan status, riwayat versi materi, dan informasi
  pemasangan. Token adalah satu-satunya kredensial tenant — pesan untuk token
  salah diseragamkan agar tidak membocorkan keberadaan pengajuan.
- **Revisi materi berversi** (FR-015, FR-021, AC 11.3): form unggah ulang hanya
  muncul saat status **Perlu Revisi**; versi baru disimpan sebagai versi
  terbaru, versi lama tetap tersedia untuk staf, status kembali **Menunggu
  Review**. Kepemilikan ditegakkan lewat fingerprint perangkat.
- **Alur status 8 tahap** sesuai PRD §8 (Draft, Menunggu Review, Perlu Revisi,
  Disetujui, Ditolak, Siap Dipasang, Sudah Dipasang, Selesai) beserta penegakan
  transisinya di server (`server/src/lib/statusFlow.js`, cermin
  `src/utils/statusFlow.ts`).
- **Pencatatan pemasangan** (FR-040..FR-046): hanya untuk materi Disetujui/Siap
  Dipasang, wajib menentukan media/lokasi, opsional tanggal + catatan + tautan
  bukti; menyimpan menetapkan status **Sudah Dipasang**.
- **Dashboard staf**: ringkasan jumlah per status (FR-025, klik untuk memfilter),
  pencarian nomor pengajuan/tenant/judul materi (FR-026), filter tenant dan
  rentang tanggal (FR-027), serta detail dengan riwayat versi dan riwayat status
  (FR-028..FR-031).
- **Field form PRD §9.3**: nama campaign, judul materi, deskripsi materi, jenis
  materi, media/lokasi pemasangan, periode tayang, dan persetujuan ketentuan
  (wajib). Snapshot `unit_number` disimpan bersama tenant (PRD §9.2).
- **Unggah berkas sebagai kanal setara** dengan kirim tautan (FR-008..FR-015):
  kanal unggah menyala bawaan, dapat dimatikan operator lewat
  `VITE_PROMO_UPLOAD_MODE='0'`.
- Tabel data model PRD: `promo_submission_files`, `promo_submission_history`,
  `promo_installations` (Data Model: Material File / Review History /
  Installation Record). Migrasi mem-backfill satu baris **versi 1** untuk
  pengajuan lama yang materinya masih hanya di kolom
  `promo_submissions.file_url`/`link_url`, sehingga riwayat versi tidak kosong
  untuk data warisan.
- Kolom **Nomor Pengajuan**, Nomor Unit, Nama Campaign, dan Judul Materi pada
  ekspor CSV.

### Diperbaiki

- **Migrasi status pada DB yang sudah jalan.** `server/schema.sql` melepas CHECK
  lama sebelum baris status diremap. Sebelumnya remap `pending → menunggu_review`
  melanggar CHECK lama (`pending`/`approved`/`rejected`/`installed`), sehingga
  `db:migrate` akan gagal di setiap instance yang sudah berjalan — sementara DB
  baru tetap hijau, jadi bug-nya hanya muncul di produksi. Pengecekan CHECK kini
  berbasis definisi constraint (bukan nama) karena nama constraint lama
  bergantung versi skema.
- `users.role` default `'viewer'` (melanggar CHECK-nya sendiri) diganti
  `'tenant_relation'` (pitfall lama, kini ikut dimigrasikan).
- Pencarian tenant MID juga mencocokkan nomor unit/lot, bukan hanya nama
  (FR-004).

### Catatan rilis

Ada perubahan skema — **wajib** menjalankan migrasi sebelum API baru dipakai:

```bash
node scripts/db-migrate.mjs
```

Migrasi mengubah `status` lama (4 nilai) menjadi 8 nilai PRD, menambah kolom
materi/tenant baru, dan mengisi nomor + token untuk pengajuan lama. Urutan
deploy tetap: API + skema dulu, frontend terakhir. `db:seed` tidak berubah dan
tidak wajib untuk rilis ini.

## [1.2.0] — 2026-09-15

Penyelarasan katalog dengan deck "MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026",
penegakan lead time, dan kanal notifikasi tenant.

### Ditambahkan

- Penegakan lead time materi: tanggal pasang divalidasi terhadap ketentuan tiap
  media di deck ("2 hari sebelum pemasangan" / "3 hari kerja sebelum
  pemasangan"), baik di wizard maupun di server. Pengajuan yang masuk lebih
  lambat dari lead time ditandai di dashboard staf.
- Kanal email materi social media (`marketing@malmetropolitan.com`) sesuai deck
  2026, ditampilkan di langkah kirim materi.
- Tombol kirim pesan WhatsApp di modal detail pengajuan, dengan normalisasi
  nomor ke format `wa.me` (mis. `0812-3456-7890` → `6281234567890`).
- Mode kirim tautan menjadi kanal **kanonis** pada wizard pengajuan. Mode unggah
  file ke Drive mall menjadi jalur legacy di balik flag `VITE_PROMO_UPLOAD_MODE`.

### Diperbaiki

- Keselarasan katalog dengan deck 2026: Digital Poster dibatasi JPEG (deck:
  "tidak menerima materi lain selain JPEG"), dan ketentuan email social media
  yang sebelumnya tidak ikut ter-seed.
- `README` menyebut media yang belum tersedia secara keliru (tertulis Parapet,
  seharusnya Vertical Banner), dan jumlah media dijelaskan: deck memuat 13
  slide media, platform memecah slide social media menjadi dua entri (14 slug).
- Seed kini menyinkronkan kolom `rules`, bukan hanya `accepted_formats`,
  sehingga koreksi ketentuan deck sampai ke instance yang sudah berjalan.
- Pesan validasi server (`errors[]`) kini sampai ke kolom form yang tepat,
  bukan sebagai "Permintaan gagal (HTTP 400)" generik.

### Keamanan

- Perintah `rsync` pada panduan deploy kini mengecualikan `client_secret*.json`
  dan `*-token.json`. Sebelumnya `.gitignore` sudah menutup sisi repo, tetapi
  rsync memakai daftar exclude sendiri sehingga kredensial Google OAuth ikut
  tersalin ke VPS.

### Catatan rilis

Tidak ada perubahan skema. Namun **`db:seed` wajib dijalankan** setelah update:
penegakan lead time dan kanal email membaca kolom `rules`, dan versi seed lama
tidak menyinkronkan kolom itu. Urutan deploy tetap: API dulu, frontend terakhir.

```bash
docker compose exec api node server/scripts/seed-media-types.mjs
```

Verifikasi cepat bahwa katalog sudah tersinkron:

```bash
curl -s https://<api-domain>/api/v1/promo/media-types \
  | grep -c 'marketing@malmetropolitan.com'   # harapan: 2
```

## [1.1.0] — 2026-09-14

Penyempurnaan infrastruktur: migrasi penyimpanan dan perbaikan kritis.

### Perubahan

- Migrasi penyimpanan media dari Cloudflare R2 ke Google Drive (REST v3 via
  fetch, tanpa SDK; autentikasi OAuth refresh token akun storage). Dependensi
  `@aws-sdk/client-s3` dan `@aws-sdk/s3-request-presigner` dihapus.
- Alur unggah baru: browser → `POST /api/v1/drive/upload` (streaming
  multipart, verifikasi magic bytes SEBELUM tulis ke Drive) → `POST
  /api/v1/promo/submit` dengan `drive_file_id`. Metadata nama/mime/ukuran
  diambil dari Drive, bukan klaim klien.
- Anti-klaim duplikat: satu objek Drive = satu pengajuan (guard
  `drive_file_id` + unique index). File diverifikasi ada via `getDriveFile`.
- Perbaikan deteksi magic bytes untuk MP4 (box `ftyp` di offset 4).
- Skrip operasional: `drive-auth.mjs` (produksi refresh token, sekali),
  `drive-sweep.mjs` (bersihkan file yatim + laporan kuota, cron-able).

### Catatan migrasi

Untuk instance yang sudah berjalan sebelum rilis ini:

```bash
# Terapkan skema (kolom drive_file_id), isi env Drive, deploy API + frontend.
node scripts/db-migrate.mjs
```

- Isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` di
  `.env` (refresh token via `node scripts/drive-auth.mjs`), lalu
  `docker compose up -d`. `DRIVE_ROOT_FOLDER_ID` opsional (default root).
- File yang sebelumnya ada di R2 tidak dipindahkan secara otomatis; pengajuan
  lama tetap merujuk ke URL R2 hingga kedaluwarsa.

## [1.0.0] — 2026-09-13

Rilis pertama platform media promosi tenant Metropolitan Mall Bekasi.

### Sisi tenant

- Katalog media promosi per kategori Outdoor, Indoor, dan Media Sosial, memuat
  ukuran, material, harga, serta ketentuan pemasangan. Sumber data: deck
  "MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026" — 14 jenis media, 13 aktif.
- Form pengajuan tiga tahap: pilih media, isi data tenant dan PIC, kirim
  materi.
- Nama tenant dipilih dari API tenant, dengan peralihan otomatis ke isian
  manual bila API tidak dikonfigurasi atau tidak terjangkau.
- Unggah file langsung dari browser ke Cloudflare R2 memakai presigned URL
  (pra-1.1.0; digantikan Google Drive — lihat 1.1.0), mendukung JPEG, PNG,
  PDF, dan MP4 hingga 50MB.
- Kirim tautan sebagai alternatif unggah, untuk materi berukuran besar maupun
  folder berisi banyak file di Google Drive, Dropbox, atau WeTransfer. Hanya
  URL berskema `http` dan `https` yang diterima.
- Nomor tiket setelah pengajuan terkirim, serta halaman Riwayat yang
  menampilkan status dan catatan tim tanpa perlu akun.

### Sisi staf

- Login dengan JWT dan hash bcrypt, memakai cookie lintas origin
  (`SameSite=None; Secure`).
- Daftar pengajuan dengan filter status, paginasi, dan detail per pengajuan.
- Penetapan status Menunggu, Disetujui, Ditolak, atau Terpasang, disertai
  catatan yang langsung terlihat oleh tenant di halaman Riwayat.
- Pengelolaan katalog media: harga, ukuran, ketentuan, dan status aktif.
- Ekspor CSV siap dibuka di Excel, mencakup kolom sumber materi dan URL tautan.
- Pengelolaan akun staf untuk `superadmin`. Role `admin` dan
  `tenant_relation` dibatasi pada tingkat route.

### Validasi dan pengamanan

- Batas 10 pengajuan per jam per IP dan 5 pengajuan per perangkat dalam
  24 jam.
- `file_url` wajib berada di prefix bucket R2 sendiri, sehingga file dari
  luar tidak bisa diklaim.
- Pemeriksaan `HEAD` memastikan objek benar-benar ada dan memverifikasi ulang
  ukuran setelah unggahan selesai.
- Pemeriksaan signature byte terhadap tipe file yang diklaim. Objek yang tidak
  cocok langsung dihapus dari R2.
- Penghapusan pengajuan menghapus objek R2 lebih dulu dan berhenti aman bila
  gagal, sehingga baris data tetap ada dan proses dapat diulang. Pengajuan
  bertautan dilewati karena tidak memiliki objek di penyimpanan.
  (Semua mekanisme di atas pra-1.1.0; pengganti Drive-nya lihat 1.1.0.)

### Operasional

- `scripts/db-migrate.mjs` menerapkan `server/schema.sql` dan aman dijalankan
  berulang.
- `server/scripts/seed-media-types.mjs` mengisi katalog dan menyelaraskan
  daftar format yang diterima, tanpa menimpa harga maupun ketentuan hasil
  penyuntingan admin.
- `server/scripts/create-admin.mjs` membuat atau mereset akun staf dengan
  password melalui variabel lingkungan, bukan argumen perintah.
- Docker Compose untuk Postgres 16 dan API, template konfigurasi lingkungan,
  serta panduan deploy VPS dan Vercel.
- Skrip verifikasi produksi berbasis Playwright: `verify-e2e.mjs`,
  `verify-tenant-upload.mjs`, dan `verify-admin-flow.mjs`.

### Catatan migrasi

Untuk database yang sudah berjalan sebelum rilis ini:

```bash
node scripts/db-migrate.mjs                  # tambah source_type dan link_url
node server/scripts/seed-media-types.mjs     # selaraskan accepted_formats
```

- Migrasi menambahkan kolom `source_type` dan `link_url` pada
  `promo_submissions`, serta membuat `file_url` dan `mime_type` menjadi nullable
  agar pengajuan bertautan dapat disimpan.
- Seed menambahkan PNG pada jenis media yang sebelumnya hanya menerima JPEG.

Tanpa kedua langkah tersebut, katalog produksi masih menampilkan daftar format
lama dan pengajuan mode tautan gagal karena kolomnya belum tersedia.
