# DESIGN — Medprom Metmal

> **Sumber kebenaran:** `src/styles/theme.css`, `src/styles/base.css`, `index.html` (font).
> **Tata kelola:** klaim faktual di dokumen ini (nilai, kelas, ukuran, nama token,
> keberadaan elemen) diaudit terhadap kode. Bila dokumen dan kode berbeda,
> **kode menang** dan dokumen wajib diperbaiki.
> **Dibuat:** 2026-09-16 · **Ditulis ulang:** 2026-09-24 (dokumen kerja) ·
> **Ditulis ulang:** 2026-09-30 (daftar kerja seluler, **diterapkan ke kode**).

## Arah Desain

Medprom adalah **daftar kerja**, bukan katalog pemasaran. Tenant membuka ponsel
untuk menjawab tiga hal: media apa saja yang ada, berapa harganya, dan sudah
sampai mana pengajuannya. Setiap permukaan harus menjawab ketiganya secepat
mungkin.

Arah: **daftar kerja seluler — angka memimpin, kertas hilang.** Kertas putih,
tinta hampir hitam, pemisah berupa garis rambut, dan **angka selalu elemen
terbesar di barisnya**. Karakter datang dari tipografi dan skala, bukan dari
warna: produk ini **akromatik**, kecuali warna stempel keadaan.

**Menggantikan** arah "Lembar Spesifikasi & Tiket Pekerjaan" (Archivo + perabot
dokumen: tanda potong, nomor plate, garis dimensi, kertas abu-netral, process
blue). Alasan penggantian: metafora kertas itu memakan ruang dan terbaca sebagai
noise di layar 6 inci — tepat perangkat yang paling sering dipakai. Nomor plate
dan tanda potong adalah perabot dunia cetak yang tidak memberi informasi apa pun
kepada tenant.

**Menggantikan** pula arah "App Produk" (2026-09-20) dan "editorial kontras"
(2026-09-16). Ketiganya kalah pada masalah yang sama: hierarki tidak tegas saat
dipindai cepat.

Yang **dipertahankan** dari ketiga arah sebelumnya: kerangka app tetap (app bar +
satu area menggulir + tab bar mobile), disiplin warna yang ketat (kini diperketat
menjadi nol warna aksen), bahasa Indonesia, PWA standalone, dan seluruh kebenaran
produk (katalog deck, alur status 8 tahap, cermin FE-BE).

**Kalimat uji dunia.** Kalau seluruh teks halaman dihapus, yang tersisa harus
tetap terbaca sebagai **daftar kerja yang bisa dipindai**: garis rambut yang
memisahkan baris, dan **angka yang selalu lebih besar dari labelnya**. Bukan
kertas, bukan kartu berbayang, bukan katalog.

## Kata Kunci Visual

- daftar, bukan kartu · garis rambut, bukan kotak
- angka memimpin · label mengalah
- putih bersih · tinta hampir hitam · **tanpa warna aksen**
- ruang sebagai pemisah kedua setelah garis
- sudut membulat sedang (10–12px), bukan siku cetak dan bukan pil

## Tipografi

Dua rupa, keduanya memikul peran yang jelas.

### Kerja & display — Instrument Sans

```
Instrument Sans · wght 400;500;600;700
```

Memimpin judul **dan** teks isi. Grotesque modern dengan terminal sedikit
berwatak — cukup untuk memberi karakter tanpa menjadi kostum. Dipilih
menggantikan Archivo, yang dinilai terlalu netral sehingga hierarki terasa
hambar.

Bobot: **600** untuk judul layar, judul bagian, nama media, dan tombol; **500**
untuk angka mono berukuran besar; **400** untuk isi dan metadata. Bobot **700**
dipakai sangat hemat (angka KPI konsol staf).

**Tracking negatif adalah bagian dari rupa ini**, bukan hiasan: makin besar
ukurannya, makin rapat. Nilainya tetap: `-0.035em` pada hero, `-0.03em` pada
judul bagian, `-0.02em` pada nama/angka baris, `-0.01em` pada kontrol.

### Data — Spline Sans Mono

```
Spline Sans Mono · wght 400;500;600
```

Untuk **setiap angka yang dibaca sebagai nilai**: harga, ukuran, tanggal,
jumlah, nomor pengajuan/batch, subtotal/PPN/total, KPI. Selalu
`font-variant-numeric: tabular-nums` supaya kolom sejajar dan bisa dibandingkan
sekilas. Bukan kostum "teknis": hanya angka dan kode. Nomor pengajuan dan token
adalah kode, jadi ikut mono.

### Skala per peran

| Token | Ukuran | Konteks |
|---|---|---|
| `--text-sheet` | 32px | Judul hero (khusus landing) |
| `--text-screen` | 24px | h1 layar (`.ui-title-screen`), total biaya |
| `--text-section` | 20px | h2 bagian (`.ui-title-section`) |
| `--text-title` | 18px | Judul kartu, **harga baris**, nama media di baris |
| `--text-body` | 16px | Teks isi, nama media di kepala detail |
| `--text-dense` | 14px | Baris data, lencana, sel tabel |
| `--text-meta` | 12px | Label, cap; **batas bawah** |

Tidak ada teks di bawah 12px. Judul di dalam aplikasi memakai kelas peran
(`.ui-title-*`), bukan `text-3xl`/`text-4xl`.

**Aturan hierarki baris** — inilah yang membuat arah ini bekerja, dan yang
paling mudah dirusak:

1. **Angka memimpin.** Di setiap baris daftar, elemen terbesar adalah angkanya
   (harga, total, KPI), bukan namanya.
2. **Nama mengalah.** Nama media/tenant maksimal satu tingkat di bawah angka.
3. **Label mengecil.** Label spec dan satuan memakai `--text-meta` dengan
   `--ink-muted`, bukan tinta penuh.
4. **Satu baris, satu angka.** Bila sebuah baris punya dua angka yang bersaing,
   salah satunya turun jadi label.

## Warna

Palet **akromatik + stempel**. Tidak ada warna aksen: aksi utama adalah **tinta
penuh**, bukan warna merek. Warna hanya muncul untuk menyatakan keadaan
pekerjaan.

| Peran | Token | Nilai | Catatan |
|---|---|---|---|
| Lembar | `--surface-page` | `#ffffff` | latar utama (kertas) |
| Kartu | `--surface-card` | `#ffffff` | permukaan kartu/lembar |
| Blok tenang | `--surface-offset` | `#fafafa` | blok catatan, baris terpilih, kepala tabel |
| Blok isian | `--surface-tint` | `#f4f4f5` | placeholder foto, lencana netral |
| Hover | `--surface-hover` | `#f4f4f5` | hover baris dan opsi |
| Tinta | `--ink-primary` | `#09090b` | judul, isi utama, tombol utama |
| Tinta sekunder | `--ink-secondary` | `#52525b` | isi pendamping |
| Tinta redup | `--ink-muted` | `#65656e` | label, metadata, cap |
| Garis rambut | `--rule-color` | `#e4e4e7` | pemisah baris dan daftar |
| Garis kontrol | `--rule-strong` | `#8a8a90` | tepi input, tepi tombol sekunder |
| Stempel setuju | `--stamp-ok` | `#0d6b3f` | disetujui, siap, terpasang, selesai |
| Stempel revisi | `--stamp-rev` | `#8a5a0a` | perlu revisi |
| Stempel tolak | `--stamp-no` | `#b91c1c` | ditolak, galat |
| Latar setuju | `--stamp-ok-soft` | `#f1f8f3` | lencana |
| Latar revisi | `--stamp-rev-soft` | `#fbf6ec` | lencana |
| Latar tolak | `--stamp-no-soft` | `#fdf3f3` | lencana |

### Kontras terukur (terverifikasi, bukan diklaim)

Ambang: **4,5:1** untuk teks normal, **3:1** untuk tepi kontrol (WCAG 1.4.11).
Semua pasangan berikut dihitung dengan rumus kontras WCAG 2.1.

| Pasangan | Rasio | Ambang |
|---|---|---|
| tinta / lembar | 19,90:1 | 4,5 |
| tinta / blok tenang | 19,06:1 | 4,5 |
| tinta sekunder / lembar | 7,73:1 | 4,5 |
| tinta sekunder / blok tenang | 7,41:1 | 4,5 |
| tinta redup / lembar | 5,77:1 | 4,5 |
| tinta redup / blok tenang | 5,53:1 | 4,5 |
| tinta redup / blok isian | 5,25:1 | 4,5 |
| stempel setuju / latarnya | 6,10:1 | 4,5 |
| stempel revisi / latarnya | 5,50:1 | 4,5 |
| stempel tolak / latarnya | 5,94:1 | 4,5 |
| ketiga stempel / blok isian | 5,39:1 – 5,99:1 | 4,5 |
| putih / tombol tinta | 19,90:1 | 4,5 |
| **garis kontrol / lembar** | **3,43:1** | **3** |

Tiga nilai sengaja **tidak** memakai angka mockup, karena mockup gagal ambang:

- `--ink-muted` `#71717a` → **`#65656e`**. Nilai mockup hanya 4,40:1 di atas
  blok isian `#f4f4f5` — di bawah AA, padahal kelas ini dipakai untuk label di
  dalam baris terpilih.
- `--stamp-rev` `#a16207` → **`#8a5a0a`**. Nilai mockup 4,48:1 di atas blok
  isian. Nilai baru 5,39:1.
- `--rule-strong` `#d4d4d8` → **`#8a8a90`**. Nilai mockup 1,48:1 — tepi input
  nyaris tak terlihat dan gagal ambang komponen. Nilai baru 3,43:1.

`--rule-color` `#e4e4e7` (1,27:1) memang **dekoratif** — ia memisahkan baris,
bukan menandai kontrol — sehingga tidak tunduk pada ambang 3:1.

### Pemetaan ulang skala Tailwind

Dua pemetaan di `@theme` membuat seluruh komponen lama mengikuti dunia ini tanpa
disentuh satu per satu:

1. **`slate-*` dan `stone-*`** dipetakan ke skala tinta (`slate-900` = tinta,
   `slate-100` = blok isian, dst).
2. **`red-*`, `amber-*`, `green-*`, `emerald-*`** dipetakan ke ramp warna
   stempel. Ratusan utilitas galat/peringatan/sukses kini diderivasi dari warna
   yang sama dengan `Stamp`, sehingga tidak ada merah Tailwind yang melawan
   palet.

### Mode gelap

Varian gelap ("meja malam") **dihapus** dari `theme.css`. Sebelumnya ia
didefinisikan tetapi tidak pernah aktif (tidak ada kode yang memasang kelas
`.dark`), sementara 192 utilitas `dark:` tersebar di komponen — kode mati yang
membebani pembacaan tanpa memberi manfaat.

Dunia ini akromatik dan bergantung pada kontras tinta-terhadap-kertas. Membalik
kontras menuntut audit tersendiri, bukan sekadar inversi token. Karena itu:
**tidak ada `dark:` di komponen, tidak ada blok `.dark` di CSS.** Bila mode
gelap diinginkan, itu keputusan produk baru yang membawa audit kontrasnya
sendiri.

## Permukaan & Elevasi

**Bayangan dilarang di seluruh produk.** Kedalaman datang dari **garis** dan
perbedaan kecerahan permukaan. Token `--elevation-*` masih ada (bernilai `none`)
hanya supaya pemanggil lama tidak pecah.

Bar sticky dipisah garis bawah; CTA sticky dipisah garis atas; daftar dropdown
dipisah garis; sheet dipisah garis. Tidak ada blur pada bar.

### Radius

| Elemen | Radius | Token |
|---|---|---|
| Baris daftar, kartu, panel | 12px | `--radius-card` |
| Tombol, input | 10px | `--radius-control` |
| Thumbnail media | 10px | `--radius-thumb` |
| Lencana, tag | 6px | `--radius-chip` |
| Sheet (tepi atas) | 16px | `--radius-sheet` |

Skala Tailwind dipetakan ulang: `rounded-md` = 6px, `lg` = 8px, `xl` = 10px,
`2xl` = 12px, `3xl` = 16px.

## Aturan Garis

Garis tetap alat kedalaman utama, tetapi kini **hanya dua bobot**:

- `1px var(--rule-color)` — pemisah baris daftar, kepala tabel, tepi kartu.
- `1px var(--rule-strong)` — tepi kontrol (input, tombol sekunder) dan tepi
  kotak area unggah.

Garis tinta `2px` dan garis putus-putus **dihapus**: keduanya perabot dunia
cetak. Batas putus-putus masih dipakai di **satu** tempat — kotak area unggah —
karena di sana ia menyatakan "area ini menerima berkas", bukan dekorasi.

## Perabot

**Satu awalan: `ui-*`.** Dunia lama butuh awalan terpisah (`doc-*`) karena ia
sebuah metafora. Dunia ini tidak; ia hanya aplikasi. Menyatukan awalan
menghapus seluruh kelas yang ada semata-mata untuk mempertahankan metafora.

| Kelas | Fungsi |
|---|---|
| `.ui-row` > `.ui-row-lead` + `.ui-row-main` + `.ui-row-head` + `.ui-row-num` | **Perabot inti.** Baris daftar: garis rambut di bawah, thumbnail opsional di kiri, teks di tengah, angka rata kanan |
| `.ui-row-num` (`[data-kind="money\|text"]`) | Angka baris: HARGA. `money` = mono 18px + `<small>` satuan di bawahnya; `text` = teks 18px yang turun ke barisnya sendiri |
| `.ui-price-ladder` | Tangga tarif multi-baris (`price_note` dengan 2 baris atau lebih) |
| `.ui-title-row` | Nama item DI DALAM baris (16px/600) — satu langkah di bawah harga |
| `.ui-number` | Angka tabular monospace (menggantikan `.doc-num`) |
| `.ui-num` | Alias tabular mono untuk nilai inline (tarif di daftar, nomor) |
| `.ui-specs` > `.ui-spec` (`<dt>`, `<dd>`, `dd[data-numeric]`) | Pasangan label/nilai (menggantikan `.doc-rows`). **Tanpa titik penghubung**; ditumpuk di bawah 640px |
| `.ui-calc` > `.ui-calc-k` / `.ui-calc-v` (`[data-emphasis]`) | Blok perhitungan biaya; total = angka terbesar di layar |
| `.ui-timeline` > `.ui-timeline-item` (`[data-current]`) | Riwayat status: titik + garis, bukan baris bertanggal |
| `.ui-stat` > `.ui-stat-v` + `.ui-stat-k` | Angka besar + label (KPI konsol staf) |
| `.ui-figure` | Angka terbesar satu layar (24px mono) |
| `.ui-tag` (`[data-tone="ink"]`) | Lencana kanal/jenis |
| `.ui-label` (`[data-tone="strong"]`) | Kapital ber-track 12px. **Satu-satunya tempat kapital masih sah.** Dua nada: redup (default) dan tinta penuh (`strong`) |
| `.ui-alert`, `.ui-alert-panel`, `.ui-empty`, `.ui-empty-panel` | Blok galat/kosong |
| `.ui-card` | Permukaan kartu berbingkai — dipakai **hemat**; baris daftar tidak berbingkai |
| `.ui-title-hero` (32px) / `-screen` (24px) / `-section` (20px) / `-card` (18px) / `-row` (16px) | Kelas peran judul — **wajib**, bukan `text-xl font-extrabold` |
| `.ui-body` / `.ui-dense` (14px) / `.ui-meta` (12px) / `.ui-prose` / `.ui-text-muted` / `.ui-text-strong` | Peran teks |
| `.ui-btn-primary` (tinta penuh) / `.ui-btn-secondary` / `.ui-control` | Kontrol |
| `.ui-focus-ring` / `.app-pressable` / `.ui-rule` | Cincin fokus / umpan tekan / pemisah |

**Komponen bersama (jangan disalin):**

| Berkas | Fungsi |
|---|---|
| `Stamp.tsx` | Lencana status — memetakan delapan status PRD ke nada warna dan label Indonesia. Dipakai halaman status, batch, riwayat, detail, dan konsol staf. **Jangan** membuat lencana status sendiri |
| `MediaPriceTag.tsx` | Harga satu media, ketiga bentuknya (angka / teks turun baris / tangga tarif) |
| `src/utils/mediaPrice.ts` | Logika harga dari `price_amount` + `price_note`. **Satu sumber untuk landing dan kedua wizard** — salinan ganda pernah membuat wizard menggabungkan tangga tarif menjadi satu kalimat |

**Dihapus tanpa pengganti:** `.doc-crop`, `.doc-plate-no`, `.doc-dim`,
`.doc-perf`, `.doc-stamp`, `.doc-leader`, `.doc-link`. Lihat bagian Migrasi.

## Kerangka Aplikasi

Setiap layar tenant dirender di dalam `AppShell` (`src/components/layout/`).
Konsol staf (`/admin`) memakai kerangkanya sendiri di luar `AppShell`.

```
┌─────────────────────────────┐
│ TopAppBar  (sticky)         │  ← judul kontekstual + back + aksi + nav desktop
├─────────────────────────────┤
│  <main class="app-scroll">  │  ← HANYA area ini yang menggulir
├─────────────────────────────┤
│ BottomTabBar (mobile saja)  │  ← Katalog · Ajukan · Lacak · Riwayat
└─────────────────────────────┘
```

- Hanya `.app-scroll` yang menggulir. Tiga deklarasi wajib: `.app-shell`
  `height:100dvh; overflow:hidden`, `.app-scroll` `min-height:0`, dan
  `.app-scroll` `position:relative`.
- Bar **tidak** memakai blur: permukaan penuh dipisah garis.
- Navigasi (tab bar mobile dan nav desktop) berasal dari satu sumber,
  `navItems.ts`. Tujuan aktif ditandai **tinta penuh** (teks + garis bawah),
  bukan pil berwarna.
- Tombol kembali hanya muncul bila layar punya induk. Alur wizard memakai
  `back` yang memundurkan langkah.
- Tab bar hanya mobile (`< 640px`); di desktop navigasi ada di app bar.
- Sheet (`.app-sheet`) adalah pengganti dialog tengah: menempel bawah di mobile,
  dialog terpusat di desktop. Semua dialog wajib memakai komponen `Sheet`.
- CTA di kepala halaman **tidak** melebar penuh di desktop — batasi lebarnya,
  karena tombol selebar 720px terbaca sebagai kesalahan tata letak.

## Pola Layar

### Landing `/` — katalog

Kepala: judul hero 32px, satu paragraf pengantar, lalu **baris fakta** tiga kolom
— **jumlah media aktif dari API** (bukan angka yang ditulis di kode; katalog
memuat 14 slug dengan 13 aktif karena `vertical-banner` nonaktif), **7 hari sewa
minimal**, dan **gratis media sosial**. Angkanya mono. Tidak ada eyebrow, tidak
ada badge, tidak ada tanda potong, tidak ada garis dimensi.

Katalognya satu bagian per **kategori deck** (`outdoor`, `indoor`, `social`) —
bukan per kanal. Hanya **3** dari 14 slug berkanal `cetak`
(`spanduk`, `big-banner`, `umbul-umbul`), jadi mengelompokkan per kanal akan
memecah katalog menjadi "3 cetak" dan "11 sisanya" dan menghapus struktur
outdoor/indoor/social yang justru dipakai deck. Kanal tetap dipakai, tetapi
sebagai **tag pada baris** dan **penentu rute**: kanal `cetak` mengarah ke
`/ajukan-cetak`, sisanya ke `/ajukan`.

Setiap media satu **baris daftar**: thumbnail 64×64 bulat 10px, nama
(`.ui-title-row`, 16px), **harga 18px sebagai angka terbesar di barisnya**,
lalu spesifikasi dan lokasi sebagai label redup 12–14px. Kanal ditulis sebagai
teks di baris lokasi (`Sisi Pintu Tol Bekasi Barat · Cetak, min. 7 hari`),
bukan chip tersendiri — chip memakan satu baris penuh di 392px untuk satu kata.

#### Aturan harga — deck adalah sumber kebenaran

Harga **tidak boleh dikarang maupun disederhanakan**, karena katalog deck tidak
seragam: hanya **3** media punya `price_amount` terstruktur, sedangkan **11**
lainnya hanya punya `price_note` bebas teks. Urutan yang benar:

1. **`price_amount` ada** → tampilkan sebagai angka mono (`Rp 70.000`) dengan
   satuan (`/hari`). Hanya berlaku untuk `spanduk`, `big-banner`,
   `umbul-umbul`.
2. **`price_amount` kosong, `price_note` ada** → tampilkan `price_note`
   **verbatim**, **satu baris per `\n`**. Ini berlaku untuk mayoritas katalog
   dan memuat informasi terkuat yang dimiliki deck:
   `Gratis` (`digital-poster`, `sosmed-feed`, `sosmed-story`),
   `Gratis (syarat: tenant baru atau peserta program promo)` (`led-banner`),
   `Gratis (sementara, khusus tenant baru)` (`parapet`),
   `Rp. 6.700.000,-/sisi/bulan` (`sticker-eskalator`), dan
   `- (Belum tersedia)` (`vertical-banner`). Produksi sudah melakukan ini
   (`PromoLandingPage.tsx:102-132` di dunia lama); aturan ini mengunci perilaku
   itu supaya tidak hilang saat permukaan ditulis ulang.
3. **Keduanya kosong** → **"Hubungi TR"** (kanal `cetak`) atau
   **"Hubungi Marcom"** (kanal lain). Berlaku untuk `boom-gate`, `sticker-lift`,
   `videotron`, dan `videotron-integrasia`.

**Kesalahan yang harus dihindari:** menyimpulkan "tidak ada `price_amount`"
berarti "tidak ada harga". Dengan aturan itu `led-banner` akan tampil sebagai
"Hubungi Marcom", padahal deck menyatakannya **gratis dengan syarat** — dan
`parapet`, `digital-poster`, serta kedua media sosial juga kehilangan label
"Gratis". Itu kehilangan informasi, bukan sekadar detail.

#### Tangga tarif

`price_note` sering memuat **beberapa tarif sekaligus** (Videotron 4 baris,
Sticker Lift 2 baris dengan keterangan sisi, Videotron Integrasia 4 baris
berlabel). Aturannya:

- **Satu baris** → dirender `.ui-row-num` dengan `data-kind` `money` atau
  `text`. Yang `text` ("Gratis", "Hubungi Marcom", dan kalimat panjang
  `Gratis (syarat: …)`) turun ke barisnya sendiri lewat CSS — ukurannya tetap
  `--text-title` dan warnanya tetap tinta, karena "Gratis" adalah penawaran
  terkuat di katalog ini dan tidak boleh tampil sebagai catatan kaki kelabu.
- **Dua baris atau lebih** → `.ui-price-ladder`: daftar di bawah nama, satu
  baris per tarif. Baris berlabel (`Bulanan Rp. 35.000.000,-`) jadi dua kolom
  supaya nominal berbagai durasi sejajar dan bisa dibandingkan sekilas; baris
  tanpa label (`Rp. 600.000,-/hari`) dibiarkan satu baris, karena sufiksnya
  berbeda lebar dan memaksanya dua kolom hanya membuat nominal menggantung
  tanpa jangkar.

Setiap karakter `price_note` dipertahankan verbatim, termasuk format `Rp.`
bertitik dan spasi aslinya. Pemecahan string ini rapuh, jadi dikunci test
(`PromoLandingPage.test.tsx` — "kartu Videotron menampilkan tiap nominal tarif
verbatim di baris terpisah").

**Satu sumber, tiga permukaan.** Logika harga hidup di
`src/utils/mediaPrice.ts` dan dirender oleh `MediaPriceTag.tsx`; landing serta
kedua wizard memakai keduanya. Sebelumnya tiap permukaan menyalin logikanya
sendiri, dan kedua wizard **menggabungkan** `price_note` multi-baris menjadi
satu kalimat — sehingga Sticker Lift tampil sebagai
`Rp. 3.630.000,-/sisi/bulan (Lift Sisi Luar) Rp. 4.235.000,-/…` dalam satu
baris. Salinan ganda itulah yang membuat cacat ini hanya muncul di wizard.

#### Kepala baris di ponsel

Di bawah 640px `.ui-row-head` **selalu** ditumpuk. Terukur di 320px: harga
`Rp. 6.700.000,-/sisi/bulan` butuh 168px dari lebar baris ~272px (setelah
thumbnail 64px + celah). Karena angka wajib `white-space: nowrap` dan
`flex: none` — kalau ia boleh membungkus, nominalnya pecah dan tidak lagi bisa
dibandingkan — yang mengalah adalah **nama**: "Digital Poster" terpepet sampai
10px dan membungkus satu huruf per baris. Ditumpuk, nama selalu dapat lebar
penuh; hierarki "angka memimpin" tetap utuh karena ukurannya tidak berubah,
hanya posisinya.

Konsekuensinya, ukuran media menjadi **baris spesifikasi**, bukan chip di
samping nama: chip `shrink-0` mengambil ~130px dan mengembalikan persoalan yang
sama. Wizard cetak sudah memakai bentuk ini sejak awal.

#### Target tap pemilihan

**44px (`min-h-11`), bukan setinggi teks.** Label pemilihan media di kedua
wizard semula hanya membungkus teks nama, jadi tingginya **21px** — terukur di
375px. Secara WCAG 2.2 AA 2.5.8 ini sebenarnya masih lolos lewat *pengecualian
jarak*: tidak ada target lain dalam 24px, dan radio itu berada di dalam baris
yang dipisah garis rambut. Tetapi memilih media adalah aksi utama wizard ini di
ponsel, dan proyek sudah punya konvensi 44px — `AdminDashboardPage` memakainya
dengan komentar yang menyebut `target-size` secara eksplisit. Jadi label
dinaikkan ke tinggi penuh baris (223x44px di `PromoUploadWizard`, 197x44px di
`PromoCetakWizard`).

Yang **tidak** berubah: label tetap membungkus kontrol dan nama saja. Tombol
"Ketentuan pemasangan" dan checkbox persetujuan tetap di luar label, supaya
tidak ada kontrol bersarang di dalam label (diverifikasi: 0 `label label`).
Radio 16px yang terlihat di dalam label itu benar — targetnya label, bukan
lingkarannya.

CTA sticky di kaki layar: satu tombol utama tinta penuh + satu tombol sekunder.

### Wizard `/ajukan` dan `/ajukan-cetak`

Satu kartu per langkah. Pip langkah bernomor (`01`, `02`, `03`) dengan bilah
segmen, bukan pil membulat. Pilihan media di langkah 1 adalah **daftar pilihan**
(`.ui-row` dengan radio): thumbnail, nama, tag kanal, ukuran/format, dan tarif
mono. Baris terpilih ditandai blok tenang + garis kontrol, bukan warna aksen.

Ringkasan biaya memakai `.ui-calc` dengan angka mono dan **total sebagai angka
terbesar di layar**.

### Status `/status/:token`, `/batch/:token`, riwayat `/riwayat`

Setiap pengajuan adalah **tiket ringkas**: nomor mono, `Stamp` untuk status,
`.ui-specs` untuk pemohon/media/periode, `.ui-calc` untuk biaya, dan riwayat
sebagai **`.ui-timeline`** — titik dan garis waktu, bukan baris bertanggal.
Total biaya adalah elemen terbesar di layar. Halaman batch menampilkan tiap media
sebagai baris daftar dengan stempelnya sendiri.

### Pelacakan `/lacak`

Satu isian, satu widget captcha Turnstile, satu tombol. Tanpa dekorasi: gerbang
captcha adalah satu-satunya isi layar.

### Konsol staf `/admin` — meja kerja

Kepadatan dan kecepatan pindai di atas kesan visual. Ringkasan jumlah per status
adalah **baris angka mono besar** (`.ui-stat`) di atas garis, bukan kartu. Daftar
pengajuan adalah **tabel** dengan baris dipisah garis rambut (tanpa kartu
bersarang), kepala kolom kapital ber-track 11,5px redup, sel angka mono rata
kanan, dan `Stamp` untuk status. Sheet detail memakai `.ui-specs` dan `.ui-calc`.

## Gerak

Satu momen yang disengaja, bukan efek tersebar: transisi warna/garis **150ms**
pada hover baris, opsi, dan tautan; `.app-pressable` menekan tombol 0,97 saat
sentuh; chevron "Ketentuan" berputar 180 derajat. Tidak ada animasi masuk per
section, tidak ada parallax, tidak ada animasi tinggi. Semua gerak patuh
`prefers-reduced-motion: reduce`.

## Permukaan Peramban

Ikut didesain, karena ini sinyal termurah bahwa halaman dibangun:
`::selection` memakai tinta 12%, `caret-color` tinta, scrollbar tipis dari palet
tinta, `text-underline-offset: 3px` untuk tautan dalam prosa, dan cincin fokus
2px tinta dengan offset 2px.

## Migrasi dari Dunia Sebelumnya

Perintah `redesign` mewajibkan sistem dikunci lebih dulu. Berikut peta
penggantiannya. Semua angka diukur dengan `grep -ro` atas `src/`; totalnya
**394 kemunculan** kelas `doc-*`.

### Kelas yang diganti nama — 213 kemunculan

| Lama | Baru | Kemunculan |
|---|---|---|
| `.doc-num` | `.ui-number` | 54 |
| `.doc-rows` / `.doc-row` | `.ui-specs` / `.ui-spec` | 79 (17 / 62) |
| `.doc-sheet` | `.ui-card` | 27 |
| `.doc-calc` (+ `-k`, `-v`) | `.ui-calc` (+ `-k`, `-v`) | 26 (7 / 9 / 10) |
| `.doc-tag` | `.ui-tag` | 11 |
| `.doc-alert` | `.ui-alert` | 9 |
| `.doc-link` | `.ui-prose a` | 7 |

### Perabot yang dihapus tanpa pengganti — 181 kemunculan

| Kelas | Kemunculan | Alasan |
|---|---|---|
| `.doc-leader` | 57 | Titik penghubung adalah konvensi formulir cetak; nilai rata kanan lebih ringkas |
| `.doc-plate-no` | 51 | Nomor plate = urutan deck. Tidak bermakna bagi tenant; urutan tetap terjaga oleh urutan daftar |
| `.doc-crop` | 37 | Tanda potong, murni dekoratif (`aria-hidden`) |
| `.doc-dim` (+ `-line`, `-val`) | 17 (8 / 6 / 3) | Garis dimensi mengukur hal yang sudah tertulis sebagai teks |
| `.doc-perf` | 11 | Perforasi tiket |
| `.doc-stamp` | 8 | Digantikan komponen `Stamp` (sudah ada dan sudah dipakai) |

213 + 181 = **394**, cocok dengan total pengukuran.

### Token yang berubah nilai

`--surface-page`, `--surface-offset`, `--surface-card`, `--surface-hover`,
`--ink-primary`, `--ink-secondary`, `--ink-muted`, `--rule-color`,
`--rule-strong`, `--stamp-*`, `--radius-*`, `--font-display`, `--font-body`.

Token yang **dihapus**: `--brand-tosca*` (7 kemunculan, sudah tidak menyimpan
nilai tosca), `--surface-ink*` (`--surface-ink` 0 pemakaian di kode),
`--rule-ink` (garis tinta 2px tidak ada di dunia ini), dan `--process*` (aksi
memakai tinta). Token baru: `--surface-tint`, `--action`/`--action-strong`/
`--action-soft`, `--stamp-wait`/`--stamp-wait-soft`, `--radius-thumb`,
`--track-hero`/`--track-section`/`--track-row`/`--track-control`.

### Yang harus lahir baru

- `.ui-row` + `.ui-row-lead` + `.ui-row-main` + `.ui-row-num` — perabot inti
  dunia ini; belum ada padanannya.
- `.ui-specs` / `.ui-spec`, `.ui-calc`, `.ui-timeline`, `.ui-stat`, `.ui-tag` —
  belum ada.
- **`--radius-thumb`** dan skala radius baru.
- Font `Instrument Sans` di `index.html` (preload + `display=swap` + `<noscript>`),
  menggantikan Archivo. Spline Sans Mono tetap, tetapi bobot 700 tidak lagi
  dipakai (cukup 400/500/600).

### Sudah ada tetapi wajib diperbaiki nilainya

Tiga kelas sudah dideklarasikan di `base.css` dan tidak perlu dibuat dari nol,
tetapi isinya masih dunia lama:

- **`.ui-number`** — `font-weight: 700` dan `color: var(--process)` (biru).
  Dunia baru: bobot `500`, warna `var(--ink-primary)`. Kelas ini **0 kemunculan
  di JSX**, jadi memperbaikinya tidak berisiko.
- **`.ui-card`** — `background: var(--surface-card)` kini benar (putih), tetapi
  masih memakai `border: var(--rule)`; dunia baru hanya memberi kartu **garis
  rambut bawah** lewat `.ui-row`, bukan bingkai penuh. Kelas ini **0 kemunculan
  di JSX**, jadi aman disesuaikan.
- **`.ui-alert`** — sudah dipakai 6×; hanya perlu mengikuti palet stempel baru.

### Drift yang wajib diperbaiki sekalian

Ditemukan saat audit 2026-09-30 dan **belum diperbaiki di kode**:

1. **`D1`** — `.ui-title-screen` dan `.ui-title-section` berbobot `700`, padahal
   dokumen lama menyatakan `800`. Sekaligus keduanya **tidak memuat
   `text-transform` maupun `letter-spacing`**, padahal "kapital ber-track" adalah
   bagian definisi dunia lama. Di dunia baru: judul bagian **bukan** kapital,
   tetapi **wajib** memuat tracking negatif `-0.03em` dari kelas perannya, dan
   bobotnya **600** — bukan 700, bukan 800.
2. **`D2`** — `.ui-title-section` **didefinisikan tetapi dipakai 0 kali** di
   JSX (1 kemunculan = definisinya sendiri di `base.css`); akibatnya **14
   `<h2>`** (dari 23 total) menduplikasi string kelas yang sama persis secara
   verbatim (`text-xl font-extrabold uppercase tracking-wide text-slate-900`) di
   `AdminDashboardPage`, `BatchStatusPage`, `PromoCetakWizard`,
   `PromoLandingPage`, `PromoUploadWizard`, dan `SubmissionDetail`. Ini konvensi
   kedua di lapisan judul — dilarang AGENTS.md. Semuanya wajib pindah ke kelas
   peran.
3. **`D3`** — **192 utilitas `dark:`** adalah kode mati. Hapus seluruhnya;
   lihat bagian Mode gelap.
4. **`D4`** — **Hero landing melewati kelas peran.** `PromoLandingPage.tsx:233`
   memakai `text-3xl ... sm:text-5xl` ad-hoc, bukan kelas peran. Akibatnya
   `--text-sheet` (32px) dideklarasikan tetapi **dipakai 0 kali**, dan ukuran
   hero di produksi sebenarnya 30px/48px — bukan 32px seperti yang diklaim
   dokumen lama. Di dunia baru hero wajib memakai kelas peran berukuran
   `--text-sheet`, dan `--text-sheet` disetel ke **32px** dengan tracking
   `-0.035em`.

## Catatan Ketidaksesuaian

Sistem sudah **diterapkan** ke kode (2026-09-30). Butir di bawah adalah sisa
yang diketahui, bukan lagi daftar tunggakan besar.

1. **`D1`–`D4` sudah diperbaiki.** Kelas peran judul kini 600 + tracking
   negatif; `.ui-title-section` dipakai di seluruh h2 (0 sisa judul ad-hoc);
   192 `dark:` dan seluruh blok `.dark` dihapus; hero landing memakai
   `.ui-title-hero` (`--text-sheet` 32px) dan `--text-sheet` benar-benar dipakai.
2. **Perabot `doc-*` sudah 0** di `src/`, termasuk `CropMarks`, `.doc-crop`,
   `.doc-plate-no`, `.doc-dim`, `.doc-perf`, `.doc-leader`, `.doc-link`.
   `scripts/verify-mobile.mjs` ikut disesuaikan agar memeriksa invarian yang
   sama pada kelas baru (kalau tidak, pemeriksaannya jadi no-op palsu).
3. **`--elevation-*`** masih dideklarasikan tetapi dipakai 0 kali; dipertahankan
   sengaja agar pemanggil lama tidak pecah.
4. **Logo resmi format vektor belum ada**; wordmark tetap tipografis. Ikon PWA
   (`public/icon.svg` + PNG turunannya) adalah lambang sementara, **sudah**
   diselaraskan ke tinta `#09090B`.
5. **`.ui-card` dan `.ui-number`** kini dipakai; `.ui-number` sudah diperbaiki
   nilainya (bobot 500, warna tinta).

### Catatan pemisahan yang masih ada

**Tidak ada yang terbuka.** 68 label yang sebelumnya memakai utilitas kapital
ber-track langsung sudah disatukan ke `.ui-label` dengan nada
`data-tone="strong"`. Nada itu **mempertahankan warna tiap label**, sehingga
kontrasnya tidak berubah — 36 label yang tadinya `slate-500..900` tetap di
nilai warnanya semula, bukan diturunkan ke `--ink-muted`.

Yang tersisa hanyalah keputusan produk yang memang belum diambil:

- **Mode gelap** belum ada dan tidak direncanakan; dunia ini akromatik dan
  membalik kontrasnya menuntut audit tersendiri (lihat bagian Mode gelap).
- **Logo resmi mall** belum ada dalam format vektor; ikon PWA adalah lambang
  sementara yang sudah diselaraskan ke tinta.

## Riwayat

- 2026-09-16 — dokumen dibuat untuk arah "editorial kontras".
- 2026-09-20 — direvisi untuk arah "App Produk" (Geist + Fraunces, tosca).
- 2026-09-24 — ditulis ulang untuk arah "Lembar Spesifikasi & Tiket Pekerjaan"
  (Archivo + Spline Sans Mono, process blue, perabot dokumen).
- 2026-09-30 — **ditulis ulang** untuk arah "Daftar Kerja Seluler" (Instrument
  Sans + Spline Sans Mono, akromatik + stempel, garis rambut, angka memimpin).
  Dunia cetak dibuang karena metafora kertas memakan ruang di layar 6 inci.
  Empat drift judul (`D1`–`D4`) ditemukan saat audit dan **diperbaiki sekalian**.
- 2026-09-30 — **diterapkan ke kode**: `theme.css`, `base.css`, `index.html`,
  manifest, ikon PWA, dan 12 berkas komponen. Verifikasi: `tsc` bersih,
  `npm run build` hijau, `vitest` **655/655**, kontras **19/19 lolos AA**,
  0 scroll horizontal pada 6 rute x 6 lebar.
