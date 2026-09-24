# DESIGN — Medprom Metmal

> **Sumber kebenaran:** `src/styles/theme.css`, `src/styles/base.css`, `index.html` (font).
> **Tata kelola:** klaim faktual di dokumen ini (nilai, kelas, ukuran, nama token,
> keberadaan elemen) diaudit terhadap kode. Bila dokumen dan kode berbeda,
> **kode menang** dan dokumen wajib diperbaiki.
> **Dibuat:** 2026-09-16 · **Ditulis ulang:** 2026-09-24 (penggantian dunia visual).

## Arah Desain

Medprom adalah **berkas pekerjaan percetakan**, bukan katalog pemasaran. Setiap
permukaan harus terbaca seperti dokumen kerja yang presisi: lembar spesifikasi,
tiket pekerjaan, meja kerja.

Arah: **lembar spesifikasi & tiket pekerjaan**. Kertas kerja abu-netral dengan
lembar yang lebih terang di atasnya, tinta hampir hitam, satu warna proses
(process blue) sebagai satu-satunya warna aksi, dan stempel untuk keadaan
pekerjaan. Kedalaman datang dari **garis dan kertas**, bukan bayangan.

**Menggantikan** arah "App Produk" (Fraunces + Geist, aksen tosca, kartu
membulat berbayang, blur pada bar). Alasan penggantian: pemilik menilai tampilan
terasa generik, hierarki kurang tegas, konsol staf sulit dipindai, dan pola
antar layar belum seragam.

Yang **dipertahankan** dari arah lama: kerangka app tetap (app bar + tab bar
mobile), prinsip aksen hemat, bahasa Indonesia, dan seluruh kebenaran produk
(katalog deck, alur status, cermin FE-BE).

**Kalimat uji dunia.** Kalau seluruh teks halaman dihapus, orang masih harus
bisa mengenalinya sebagai dokumen teknis percetakan dari tanda potong, garis
dimensi, nomor plate, tabel titik penghubung, dan stempel.

Platform adalah **PWA yang dapat dipasang** (`display: standalone`), jadi tidak
boleh ada layar yang bergantung pada tombol back peramban.

## Kata Kunci Visual

- lembar di atas meja kerja · tinta di atas kertas
- garis sebagai kedalaman · siku, bukan membulat
- angka adalah data (monospace tabular) · teks adalah kerja (Archivo)
- satu warna proses · stempel untuk keadaan

## Tipografi

Dua rupa, keduanya memikul peran yang jelas.

### Kerja & display — Archivo

```
Archivo · wght 400;500;600;700;800
```

Memimpin judul **dan** teks isi. Dipilih karena Archivo adalah grotesque yang
memang dirancang untuk kinerja cetak — cocok dengan dunia dokumen percetakan,
dan tidak termasuk daftar rupa default yang klise. Bobot 800 untuk judul layar
dan judul bagian (kapital ber-track), 600 untuk judul kartu, 400/500 untuk isi.

### Data — Spline Sans Mono

```
Spline Sans Mono · wght 400;500;600;700
```

Untuk **setiap angka yang dibaca sebagai nilai**: harga, ukuran, tanggal,
jumlah, nomor pengajuan/batch, nomor plate, subtotal/PPN/total. Selalu
`font-variant-numeric: tabular-nums` supaya kolom sejajar dan bisa dibandingkan
sekilas. Bukan kostum "teknis": hanya data, ukuran, dan kode.

### Skala per peran

| Token | Ukuran | Konteks |
|---|---|---|
| `--text-sheet` | 32px | Judul lembar (khusus landing) |
| `--text-screen` | 24px | h1 layar (`.ui-title-screen`) |
| `--text-section` | 20px | h2 bagian (`.ui-title-section`) |
| `--text-title` | 18px | Judul kartu/panel (`.ui-title-card`) |
| `--text-body` | 16px | Teks isi |
| `--text-dense` | 14px | Baris data, lencana, sel tabel |
| `--text-meta` | 12px | Label, cap; **batas bawah** |

Tidak ada teks di bawah 12px. Judul di dalam aplikasi memakai kelas peran
(`.ui-title-*`), bukan `text-3xl`/`text-4xl` (itu kekhususan landing).

## Warna

Palet **Restrained**: netral kertas-tinta dominan, satu warna proses sebagai
aksen, dan warna stempel yang muncul hanya saat menyatakan keadaan.

| Peran | Token | Nilai | Catatan |
|---|---|---|---|
| Meja kerja | `--surface-page` | `#f2f2ef` | latar halaman |
| Blok tenang | `--surface-offset` | `#ebebe7` | blok biaya, baris bergantian |
| Lembar | `--surface-card` | `#fbfbf9` | kartu/panel/lembar |
| Hover | `--surface-hover` | `#f0f0ec` | baris tabel, opsi |
| Tinta | `--ink-primary` | `#101010` | judul, isi utama |
| Tinta sekunder | `--ink-secondary` | `#4b4b48` | isi pendamping |
| Tinta redup | `--ink-muted` | `#66665f` | helper, metadata, cap |
| Garis | `--rule-color` | `#d3d3cc` | pemisah utama |
| Garis kuat | `--rule-strong` | `#b4b4ac` | tepi lembar, kotak isian |
| Garis tinta | `--rule-ink` | `#101010` | kepala bagian, tepi sheet |
| Aksi | `--process` | `#1440d6` | satu-satunya warna aksi |
| Aksi gelap | `--process-strong` | `#0f33ad` | hover aksi |
| Aksi muda | `--process-soft` | `#e7ebfb` | latar keadaan aktif |
| Stempel setuju | `--stamp-ok` | `#0d6b3f` | disetujui, siap, terpasang, selesai |
| Stempel revisi | `--stamp-rev` | `#a15c00` | perlu revisi |
| Stempel tolak | `--stamp-no` | `#b3261e` | ditolak, galat |

**Kontras terukur (AA teks normal >= 4,5:1, di atas lembar `#fbfbf9`):** tinta
18,4:1 · tinta sekunder 8,5:1 · tinta redup 5,6:1 · process 7,4:1 · stempel
setuju 6,4:1 · stempel revisi 5,0:1 · stempel tolak 6,3:1 · putih di atas
process 7,7:1. Tinta redup dinaikkan dari `#7a7a74` (3,85:1 di meja kerja)
menjadi `#66665f` justru karena ambang ini.

### Pemetaan ulang skala Tailwind

Dua pemetaan di `@theme` membuat seluruh komponen lama mengikuti dunia ini
tanpa disentuh satu per satu:

1. **`slate-*` dan `stone-*`** dipetakan ke skala kertas-tinta (`slate-900` =
   tinta, `slate-100` = kertas muda, dst).
2. **`red-*`, `amber-*`, `green-*`, `emerald-*`** dipetakan ke ramp warna
   stempel. Ratusan utilitas galat/peringatan/sukses kini diderivasi dari warna
   yang sama dengan `.doc-stamp`, sehingga tidak ada merah Tailwind yang
   melawan palet.

### Mode gelap

Varian gelap ("meja malam") hanya didefinisikan di `theme.css` (`.dark`), dan
**belum aktif**: tidak ada kode yang memasang kelas `.dark`. Pemetaan Tailwind
di `@theme` bersifat statis, jadi utilitas `slate-*` tidak ikut berubah saat
`.dark` dipasang; menyalakan mode gelap menuntut audit kontras tersendiri dan
penyesuaian pemetaan itu. Jangan aktifkan sebelum audit dilakukan.

## Permukaan & Elevasi

Kartu statis **tidak** punya bayangan. Pembedaan dari latar: garis `1px` dan
perbedaan kecerahan permukaan (meja kerja -> lembar).

**Bayangan dilarang di seluruh produk.** Bar sticky dipisah garis bawah; sheet
dipisah garis atas tinta 2px; daftar dropdown dipisah garis. Token
`--elevation-*` masih ada (bernilai `none`) hanya supaya pemanggil lama tidak
pecah.

### Radius

| Elemen | Radius | Token |
|---|---|---|
| Lembar, kartu, panel | 3px | `--radius-card` |
| Tombol, input | 3px | `--radius-control` |
| Lencana | 2px | `--radius-chip` |
| Sheet (tepi atas) | 6px | `--radius-sheet` |

Skala Tailwind dipetakan ulang: `rounded-md` = 3px, `lg` = 4px, `xl` = 5px,
`2xl` = 6px, `3xl` = 8px. Dunia ini **siku**; sudut membulat besar adalah
ciri dunia yang digantikan.

## Aturan Garis

Garis adalah alat kedalaman utama, dalam tiga bobot:

- `1px var(--rule-color)` — pemisah baris tabel, daftar, tepi lembar.
- `1px var(--rule-strong)` — kotak isian, tepi lembar, titik penghubung.
- `2px var(--rule-ink)` — kepala bagian dan tepi sheet: penanda struktur.

Satu pengecualian yang sah: batas **putus-putus** (`--doc-perf`,
`border-dashed`) sebagai tepi perforasi tiket dan penanda area unggah.

## Perabot Dokumen

Kelas siap pakai di `base.css`. Inilah kosakata dunia ini; pakai ini alih-alih
mengarang gaya baru.

| Kelas | Fungsi |
|---|---|
| `.doc-sheet` | permukaan lembar (latar lembar + garis 1px + radius 3px) |
| `.doc-crop` + `data-corner` | tanda potong di sudut lembar (dekoratif, `aria-hidden`) |
| `.doc-plate-no` | nomor plate/job: mono, kapital, ber-track |
| `.doc-dim` > `.doc-dim-val` + `.doc-dim-line` | garis dimensi berujung (mengukur sesuatu yang nyata) |
| `.doc-rows` > `.doc-row` (`<dt>`, `.doc-leader`, `<dd>`) | tabel spesifikasi bertitik penghubung |
| `.doc-perf` | tepi perforasi tiket |
| `.doc-stamp` + `data-tone="ok\|rev\|no\|wait"` | stempel status |
| `.doc-tag` + `data-tone="process\|ink\|none"` | lencana kanal/jenis |
| `.doc-num` | angka tabular monospace |
| `.doc-calc` > `.doc-calc-k` / `.doc-calc-v` | blok perhitungan biaya (garis tinta atas-bawah) |
| `.doc-alert` + `data-tone` | blok galat/peringatan (bingkai penuh, **bukan** garis kiri berwarna) |
| `.doc-link` | tautan dalam prosa (garis bawah ber-offset) |

**Komponen stempel:** `src/components/promo/Stamp.tsx`. Memetakan delapan status
PRD ke nada warna dan label Indonesia. Dipakai di halaman status, status batch,
riwayat, detail pengajuan, dan konsol staf. **Jangan** membuat lencana status
sendiri.

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
  `navItems.ts`. Labelnya kapital ber-track; tujuan aktif ditandai garis bawah
  process blue, bukan pil.
- Tombol kembali hanya muncul bila layar punya induk. Alur wizard memakai `back`
  yang memundurkan langkah.
- Tab bar hanya mobile (`< 640px`); di desktop navigasi ada di app bar.
- Sheet (`.app-sheet`) adalah pengganti dialog tengah: menempel bawah di mobile,
  dialog terpusat di desktop. Semua dialog wajib memakai komponen `Sheet`.

## Pola Layar

### Landing `/` — lembar pertama

Lembar dengan tanda potong di empat sudut dan "PLATE 01 / KATALOG" di kanan
atas. Judul kapital besar, **garis dimensi** di bawahnya yang mengukur jumlah
katalog nyata dari API ("14 media — 13 aktif"), paragraf pengantar, lalu tiga
aksi. Tanpa eyebrow, tanpa badge, tanpa gambar di viewport pertama.

Katalognya satu bagian per kategori deck. Setiap media satu **lembar
spesifikasi**: nomor plate (urutan deck), garis dimensi ukuran di atas fotonya,
lencana kanal, tabel titik penghubung (material/format/tarif/lokasi), baris lead
time, dan tombol "Ketentuan pemasangan" yang membuka daftar bernomor.

### Wizard `/ajukan` dan `/ajukan-cetak`

Satu lembar per langkah. Pip langkah bernomor (`01`, `02`, `03`) dengan bilah
segmen, bukan pil membulat. Judul bagian kapital dengan garis tinta 2px dan
"BAGIAN 01" di kanan. Pilihan media di langkah 1 adalah daftar lembar
spesifikasi (nomor plate, nama, tag kanal, ukuran/format). Ringkasan biaya
memakai `.doc-calc` dengan angka mono.

### Status `/status/:token`, `/batch/:token`, riwayat `/riwayat`

Setiap pengajuan adalah **tiket pekerjaan**: nomor mono tebal, `Stamp` untuk
status, `.doc-perf` memisahkan kepala tiket dari isi, biaya sebagai `.doc-calc`,
dan riwayat status sebagai baris bertanggal mono. Halaman batch menampilkan
tiap media sebagai baris bergaris dengan stempelnya sendiri.

### Konsol staf `/admin` — meja kerja

Kepadatan dan kecepatan pindai di atas kesan visual. Ringkasan jumlah per status
adalah blok angka mono besar di atas garis, bukan kartu. Daftar pengajuan adalah
**tabel** dengan baris dipisah garis `1px` (tanpa kartu bersarang), kepala kolom
kapital ber-track, sel angka mono rata kanan, dan `Stamp` untuk status. Sheet
detail berisi lembar spesifikasi/tiket.

## Gerak

Satu momen yang disengaja, bukan efek tersebar: transisi warna/garis 150ms pada
hover baris, opsi, dan tautan; `app-pressable` menekan tombol 0,97 saat sentuh.
Chevron "Ketentuan" berputar 180 derajat. Tidak ada animasi masuk per section,
tidak ada parallax. Semua gerak patuh `prefers-reduced-motion`.

## Permukaan Peramban

Ikut didesain, karena ini sinyal termurah bahwa halaman dibangun:
`::selection` memakai process blue 24%, `caret-color` process blue, scrollbar
tipis siku dari palet kertas-tinta, `text-underline-offset: 3px` untuk tautan
dalam prosa, dan cincin fokus 2px process blue dengan offset 2px.

## Catatan Ketidaksesuaian

1. **Mode gelap belum aktif** dan pemetaan `slate-*` belum ikut gelap; lihat
   bagian Mode gelap.
2. **`bg-white`** masih dipakai di beberapa keadaan terpilih (mis. opsi media
   aktif) alih-alih `var(--surface-card)`; bedanya 1 tingkat kecerahan.
3. **Logo resmi format vektor belum ada**; wordmark tetap tipografis. Ikon PWA
   (`public/icon.svg` + PNG turunannya) adalah lambang sementara yang sudah
   diselaraskan ke process blue, bukan logo resmi mall.

## Riwayat

- 2026-09-16 — dokumen dibuat untuk arah "editorial kontras".
- 2026-09-20 — direvisi untuk arah "App Produk" (Geist + Fraunces, tosca).
- 2026-09-24 — **ditulis ulang** untuk arah "Lembar Spesifikasi & Tiket
  Pekerjaan" (Archivo + Spline Sans Mono, process blue, perabot dokumen).
