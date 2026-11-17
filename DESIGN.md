# DESIGN — Medprom Metmal

> **Sumber kebenaran:** `src/styles/theme.css`, `src/styles/base.css`, `index.html` (font).
> **Tata kelola:** klaim faktual di dokumen ini (nilai, kelas, ukuran, nama token,
> keberadaan elemen) diaudit terhadap kode. Bila dokumen dan kode berbeda,
> **kode menang** dan dokumen wajib diperbaiki.
> **Dibuat:** 2026-09-16 · **Ditulis ulang:** 2026-09-24 (dokumen kerja) ·
> **Ditulis ulang:** 2026-09-30 (daftar kerja seluler) ·
> **Ditulis ulang:** 2026-11-17 (Airbnb Rausch, **diterapkan ke kode**).

## Arah Desain

Medprom adalah **katalog dan alur kerja**, bukan dokumen kerja. Tenant membuka
ponsel untuk menjawab tiga hal: media apa saja yang ada, berapa harganya, dan
sudah sampai mana pengajuannya.

Arah: **Airbnb — kanvas putih bersih dengan satu tegangan warna.** Kontrak
mengikuti DESIGN.md Airbnb (awesome-design-md): putih murni `#ffffff` sebagai
lantai setiap halaman, tinta nyaris hitam `#222222` untuk judul dan isi, dan
**Rausch `#ff385c`** sebagai satu-satunya warna aksen — setiap CTA primer,
orb pencarian, hati tersimpan, dan tautan merek. Tidak ada warna aksen kedua.
Sebagian besar halaman adalah 90% putih + tinta dengan satu-dua momen Rausch.

Bentuk bahasa: **lunak**. Tombol 8px, kartu ~14px, pencarian pil penuh
(`9999px`), tanpa sudut keras di mana pun kecuali kisi isi. Elevasi hanya
**satu tier bayangan** (`rgba(0,0,0,.02) 0 0 0 1px, rgba(0,0,0,.04) 0 2px 6px,
rgba(0,0,0,.1) 0 4px 8px`) — kedalaman datang dari fotografi, pemisahan
putih-di-atas-putih, dan pembulatan, bukan bayangan berlapis.

**Menggantikan** arah "Daftar Kerja Seluler" (2026-09-30, akromatik, garis
rambut, angka memimpin). Alasan penggantian: dunia akromatik tidak punya satu
pun momen warna untuk menandai aksi — CTA hitam tidak bisa dibedakan dari teks
tebal, dan "di mana saya menekan?" adalah pertanyaan yang harus dijawab tanpa
membaca. Rausch menjawabnya sekali lihat.

**Kalimat uji dunia.** Kalau seluruh teks halaman dihapus, yang tersisa harus
tetap terbaca sebagai **marketplace lunak**: kartu putih dengan sudut membulat,
satu titik Rausch pada setiap tindakan utama, dan bayangan tipis pada elemen
yang melayang. Bukan dokumen kerja, bukan kartu abu.

## Kata Kunci Visual

- putih bersih · tinta `#222222` · **satu Rausch**
- pil penuh untuk pencarian dan lencana
- sudut lunak berjenjang: 8px kontrol, 14px kartu, 20px sheet
- satu tier bayangan · tidak ada bayangan berlapis
- momen Rausch: CTA primer, tab aktif, titik "sekarang"

## Tipografi

Satu rupa untuk semua peran: **Inter** (substitusi resmi Airbnb untuk
Cereal VF yang berlisensi; fallback system stack).

```
Inter · wght 400;500;600;700
```

Bobot: **600** untuk judul layar/bagian/nama media; **500** untuk tombol,
label kuat, dan angka besar; **400** untuk isi dan metadata. Bobot **700**
dipakai hemat (angka KPI). Tracking negatif hanya pada judul besar
(`-0.035em` hero, `-0.02em` section); kontrol netral.

Angka yang dibaca sebagai data (harga, tanggal, jumlah, nomor pengajuan)
memakai `font-variant-numeric: tabular-nums` — kolom sejajar tanpa font mono
terpisah.

### Skala per peran

| Token | Ukuran | Konteks |
|---|---|---|
| `--text-sheet` | 32px (40px di ≥640px) | Judul hero (khusus landing) |
| `--text-screen` | 24px | h1 layar (`.ui-title-screen`), total biaya |
| `--text-section` | 20px | h2 bagian (`.ui-title-section`) |
| `--text-title` | 18px | Judul kartu, harga baris |
| `--text-body` | 16px | Teks isi |
| `--text-dense` | 14px | Baris data, lencana, sel tabel |
| `--text-meta` | 12px | Label, cap; **batas bawah** |

Tidak ada teks di bawah 12px. Judul memakai kelas peran (`.ui-title-*`),
bukan `text-3xl` ad-hoc.

## Warna

Palet **putih + tinta + Rausch**, plus stempel keadaan.

| Peran | Token | Nilai | Catatan |
|---|---|---|---|
| Kanvas | `--surface-page` | `#ffffff` | lantai setiap halaman |
| Kartu | `--surface-card` | `#ffffff` | kartu di atas kanvas |
| Blok tenang | `--surface-offset` | `#f7f7f7` | catatan, baris terpilih |
| Blok isian | `--surface-tint` | `#f2f2f2` | placeholder, lencana netral |
| Tinta | `--ink-primary` | `#222222` | judul, isi, nav aktif |
| Sekunder | `--ink-secondary` | `#3f3f3f` | teks panjang |
| Muted | `--ink-muted` | `#6a6a6a` | label; 5,4:1 di atas putih |
| Hairline | `--rule-color` | `#ebebeb` | pemisah editorial |
| Tepi kontrol | `--rule-strong` | `#929292` | **3,11:1** (WCAG 1.4.11) |
| **Aksi** | `--action` | `#e00b41` | Rausch Active; teks putih di atasnya 4,9:1 |
| Aksi tekan | `--action-strong` | `#b30026` | hover/active |
| Aksi lembut | `--action-soft` | `#ffd1da` | halo titik "sekarang" |

**Kenapa `--action` bukan `#ff385c` persis.** Rausch asli hanya 3,5:1 di atas
putih — gagal AA untuk teks tombol. `#e00b41` (dokumen Airbnb sendiri menyebut
"Rausch Active") mempertahankan identitas hue yang sama pada 4,9:1. Ramp
`--color-brand-primary-*` tetap berisi `#ff385c` pada langkah 400 (dipakai
hanya sebagai **border hover** — 3,5:1 lolos ambang tepi 3:1).

### Stempel keadaan (semantik)

Warna stempel adalah **kebenaran produk**, bukan dekorasi. Semua pasangan
teks/latar terukur AA (≥4,5:1):

| Keadaan | Teks | Latar | Rasio |
|---|---|---|---|
| Menunggu | `--stamp-wait` `#545454` | `#f2f2f2` | 6,76 |
| Disetujui | `--stamp-ok` `#007204` | `#e8f5e9` | 5,48 |
| Perlu revisi | `--stamp-rev` `#92600a` | `#fef3c7` | 4,84 |
| Ditolak | `--stamp-no` `#b02a0c` | `#fdecea` | 5,77 |

## Bentuk & Elevasi

- **Radius:** kontrol 8px, thumb 12px, kartu 14px, sheet 20px, chip `9999px`.
  Tidak ada `rounded-none` pada elemen interaktif.
- **Elevasi:** satu tier `--elevation-bar` untuk kartu saat hover dan app bar;
  `--elevation-sheet` untuk sheet (tier sama + lift lebih panjang). Tidak ada
  tier progresif.
- **Garis:** hairline `#ebebeb` tetap untuk pemisah baris daftar; tepi kontrol
  memakai `#929292` (3,11:1).
- **Fokus:** jaring pengaman global memberi outline tinta 2px pada
  `:focus-visible`. Input `.ui-control` membalik border ke tinta saat fokus
  (pola text-input Airbnb) tanpa glow.

## Komponen

### Tombol

- **`.ui-btn-primary`** — isi Rausch (`--action`), teks putih, radius 8px,
  tinggi sentuh 44px. Hover menggelap ke `--action-strong` (pointer halus);
  `:active` skala 0.97.
- **`.ui-btn-secondary`** — isi putih, **outline tinta 1px** (bukan abu),
  teks tinta.
- Teks tombol tidak bisa diseleksi; umpan balik tekan adalah transform,
  bukan warna saja.

### Kartu & baris

- **`.ui-card`** — putih, hairline 1px, radius 14px. Hover (pointer halus)
  memakai tier bayangan tunggal — satu-satunya bayangan kartu di sistem.
- **Baris daftar (`.ui-row`)** — di ponsel tetap bergaris hairline, bukan
  kartu berbingkai: 14 kotak berbingkai di layar 6 inci terbaca sebagai
  dinding. Baris yang sama dipakai pemilih wizard, riwayat, dan batch.
- **Katalog landing (`.catalog-grid`)** — di `>=640px` baris katalog berubah
  menjadi **kartu kisi** (2 kolom; 3 kolom di `>=1024px`): foto 4:3 memimpin,
  nama → harga → spesifikasi mengalir vertikal, aksi dipatok ke dasar kartu
  (`.catalog-actions`) sehingga tombol sebaris antar kartu. Hover memakai tier
  `--elevation-bar`. Hanya landing yang memakai grid ini.

### Bar & navigasi

- **`.app-bar`** — putih, tier bayangan tunggal (tidak ada garis bawah).
- **`.app-tabbar`** — putih, lift halus ke atas.
- **Tab aktif (`aria-current`)** — teks + indikator **Rausch**. Satu-satunya
  titik warna navigasi.

### Sheet

- Bottom sheet mobile, dialog terpusat desktop. Radius 20px, `--elevation-sheet`,
  isi `overscroll-contain` (pantulan tidak diteruskan ke halaman).

### Stempel & lencana

- `.ui-stamp` + `data-tone` — empat nada semantik terukur AA di atas.
- `.ui-tag` — pil `9999px` di atas `--surface-tint`; `data-tone="ink"`
  membalik menjadi tinta penuh.

### Timeline

- Titik lampau: tinta; **titik "sekarang": Rausch dengan halo
  `--action-soft`** — momen Rausch kedua di layar status.

## Mode Gelap

Tidak ada. Kanvas Airbnb publik juga tidak punya dark mode; keputusan produk
baru bila diinginkan.

## Riwayat

- 2026-09-16 — dokumen dibuat untuk arah "editorial kontras".
- 2026-09-20 — direvisi untuk arah "App Produk" (Geist + Fraunces, tosca).
- 2026-09-24 — ditulis ulang untuk arah "Lembar Spesifikasi & Tiket Pekerjaan".
- 2026-09-30 — ditulis ulang untuk arah "Daftar Kerja Seluler" (akromatik).
- 2026-11-17 — **ditulis ulang** untuk arah "Airbnb Rausch" (Inter, #ff385c/
  #e00b41, satu tier bayangan, bentuk lunak). Diterapkan ke kode: `theme.css`,
  `base.css`, `index.html`, plus remap ramp Tailwind sehingga utilitas lama
  mengikuti tanpa menyentuh komponen.
