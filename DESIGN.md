# DESIGN — Medprom Metmal

> **Sumber kebenaran:** `src/styles/theme.css`, `src/styles/base.css`, `index.html` (font).
> **Tata kelola:** klaim faktual di dokumen ini (nilai, kelas, ukuran, nama token,
> keberadaan elemen) diaudit terhadap kode. Bila dokumen dan kode berbeda,
> **kode menang** dan dokumen wajib diperbaiki.
> **Dibuat:** 2026-09-16 · **Ditulis ulang:** 2026-09-24 (dokumen kerja) ·
> **Ditulis ulang:** 2026-09-30 (daftar kerja seluler) ·
> **Ditulis ulang:** 2026-11-17 (Airbnb Rausch) ·
> **Ditulis ulang:** 2026-11-18 (Akromatik Tinta, **diterapkan ke kode**).

## Arah Desain

Medprom adalah **katalog dan alur kerja**, bukan dokumen kerja. Tenant membuka
ponsel untuk menjawab tiga hal: media apa saja yang ada, berapa harganya, dan
sudah sampai mana pengajuannya.

Arah: **Akromatik Tinta — kertas putih, garis rambut, dan tinta sebagai aksen.**
Kanvas putih `#ffffff`, tinta nyaris hitam `#222222` untuk judul dan isi, dan
**tidak ada warna aksen kedua**: CTA primer adalah blok tinta (teks putih di
atasnya), tab aktif bertinta, FAB bertinta. Satu-satunya warna di antarmuka
datang dari **tujuh stempel keadaan pekerjaan** — kebenaran produk, bukan
dekorasi. Sebagian besar halaman adalah putih + tinta + garis rambut.

**Menggantikan** arah "Airbnb Rausch" (2026-11-17). Alasan penggantian:
keputusan migrasi prototype Open Design (visual achromatic) — jawaban pengguna
atas konflik arah Rausch vs palet tinta prototype. Prototype adalah acuan
visual; repo tetap sumber kebenaran.

**Kalimat uji dunia.** Kalau seluruh teks halaman dihapus, yang tersisa harus
tetap terbaca sebagai **daftar kerja yang tenang**: kertas putih dengan garis
rambut, angka sebagai elemen terbesar di barisnya, blok tinta pada setiap
tindakan utama, dan warna hanya pada stempel keadaan.

## Kata Kunci Visual

- kertas putih · tinta `#222222` · tanpa warna aksen kedua
- garis rambut sebagai pemisah · bukan kartu berbingkai di ponsel
- angka memimpin baris (ukuran, bukan warna)
- momen tinta: CTA primer, tab aktif, FAB, titik "sekarang"
- warna = stempel keadaan pekerjaan (tujuh nada terukur AA)

## Tipografi

Satu rupa untuk semua peran: **Inter** (fallback system stack).

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
| `--text-sheet` | 32px | Judul hero (khusus landing) |
| `--text-hero-lg` | 40px | Judul hero di `>=640px` |
| `--text-screen` | 24px | h1 layar (`.ui-title-screen`), total biaya |
| `--text-section` | 20px | h2 bagian (`.ui-title-section`) |
| `--text-title` | 18px | Judul kartu, harga baris |
| `--text-body` | 16px | Teks isi |
| `--text-dense` | 14px | Baris data, lencana, sel tabel |
| `--text-meta` | 12px | Label, cap; **batas bawah** |

Tidak ada teks di bawah 12px. Judul memakai kelas peran (`.ui-title-*`),
bukan `text-3xl` ad-hoc.

## Warna

Palet **kertas + tinta**, plus tujuh stempel keadaan.

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
| **Aksi** | `--action` | `#222222` | blok tinta; teks putih di atasnya 15,9:1 |
| Aksi tekan | `--action-strong` | `#111111` | hover/active |
| Aksi lembut | `--action-soft` | `#f2f2f2` | halo/latar tenang |

Ramp `--color-brand-primary-*` diremap ke ramp tinta (putih→hitam) supaya
utilitas `text-brand-primary-*` lama otomatis mengikuti dunia akromatik
tanpa menyentuh komponen.

### Stempel keadaan (semantik)

Warna stempel adalah **kebenaran produk**, bukan dekorasi. Tujuh nada
(keputusan MIGRATION.md W2 opsi B). Semua pasangan teks/latar terukur AA
(≥4,5:1):

| Keadaan | Teks | Latar | Rasio |
|---|---|---|---|
| Menunggu | `--stamp-wait` `#00579a` | `#e8f2fb` | 6,55 |
| Perlu revisi | `--stamp-rev` `#92600a` | `#fef3c7` | 4,84 |
| Disetujui | `--stamp-ok` `#007204` | `#e8f5e9` | 5,48 |
| Siap dipasang | `--stamp-siap` `#006871` | `#e0f2f1` | 5,64 |
| Sudah dipasang | `--stamp-pasang` `#5740a1` | `#ece9f7` | 6,62 |
| Selesai | `--stamp-done` `#6a6a6a` | `#f2f2f2` | 4,83 |
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
  (tanpa glow).

## Komponen

### Tombol

- **`.ui-btn-primary`** — isi **tinta** (`--action`), teks putih, radius 8px,
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
  nama → harga → spesifikasi mengalir vertikal, aksi dipatok ke dasar kartu.
  Hover memakai tier `--elevation-bar`. Hanya landing yang memakai grid ini.

### Bar & navigasi

- **`.app-bar`** — putih, tier bayangan tunggal (tidak ada garis bawah).
- **`.app-tabbar`** — putih, lift halus ke atas; FAB tinta di tengah.
- **Tab aktif (`aria-current`)** — teks tinta + indikator tinta. Satu-satunya
  titik warna navigasi adalah FAB yang tetap tinta.

### Sheet

- Bottom sheet mobile, dialog terpusat desktop. Radius 20px, `--elevation-sheet`,
  isi `overscroll-contain` (pantulan tidak diteruskan ke halaman).

### Stempel & lencana

- `.ui-stamp` + `data-tone` — tujuh nada semantik terukur AA di atas.
- `.ui-tag` — pil `9999px` di atas `--surface-tint`; `data-tone="ink"`
  membalik menjadi tinta penuh.

### Timeline

- Titik lampau: tinta; titik "sekarang": titik berongga dengan halo
  `--action-soft`.

## Mode Gelap

Tidak ada. Keputusan produk baru bila diinginkan.

## Riwayat

- 2026-09-16 — dokumen dibuat untuk arah "editorial kontras".
- 2026-09-20 — direvisi untuk arah "App Produk" (Geist + Fraunces, tosca).
- 2026-09-24 — ditulis ulang untuk arah "Lembar Spesifikasi & Tiket Pekerjaan".
- 2026-09-30 — ditulis ulang untuk arah "Daftar Kerja Seluler" (akromatik).
- 2026-11-17 — ditulis ulang untuk arah "Airbnb Rausch" (Inter, #ff385c/#e00b41).
- 2026-11-18 — **ditulis ulang** untuk arah "Akromatik Tinta" (keputusan
  migrasi prototype Open Design). Diterapkan ke kode: `theme.css` (token +
  remap ramp), `DESIGN.md`, tab bar + FAB, halaman beranda baru.
