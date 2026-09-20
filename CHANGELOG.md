# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
penomoran versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

### Ditambahkan
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

### Diperbaiki
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
