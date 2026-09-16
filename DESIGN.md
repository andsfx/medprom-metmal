# DESIGN — Medprom Metmal

> **Sumber kebenaran:** `src/styles/theme.css`, `src/styles/base.css`, `index.html` (fonts).  
> **Dibuat:** 2026-09-16 · **Direvisi:** 2026-09-16 (arah App Produk + PWA)

## Arah Desain

Medprom Metmal adalah portal operasional tenant — pengajuan, verifikasi, pelacakan —
bukan halaman kampanye komunitas. Desainnya harus terasa presisi, terstruktur,
tipografis, dan tenang.

Arah: **app produk** — kerangka aplikasi tetap (app bar + tab bar), permukaan
putih bersih, garis hairline, aksen tosca hemat, dan sentuhan serif Fraunces
yang dipertahankan untuk judul serta angka.

Arah ini menggantikan **editorial kontras** (revisi sebelumnya). Yang berubah:
tipografi antarmuka dipegang Geist dengan kerapatan lebih tinggi, radius naik,
dan bayangan diizinkan kembali secara terbatas untuk elemen mengapung. Yang
**dipertahankan**: palet tinta-di-kertas, hairline sebagai pemisah utama, dan
tosca sebagai aksen — bukan permukaan.

Platform juga merupakan **PWA yang dapat dipasang** (`display: standalone`),
jadi setiap layar harus masuk akal tanpa chrome browser: tidak boleh ada layar
yang bergantung pada tombol back peramban.

Tidak boleh ada kebocoran pola event ke medprom (warm cream paper, Bricolage
Grotesque, kartu bulat soft-elevation, tosca+pink merata).

## Kata Kunci Visual

- kerangka app tetap · navigasi selalu terjangkau
- tinta di kertas · garis rambut (hairline)
- serif untuk judul & angka · sans untuk kerja
- aksen tosca hemat · monokrom dominan

## Tipografi

### Display — Fraunces

```
Fraunces · variable · opsz 9–144 · wght 300–700
```

Hanya untuk judul, hero, angka besar, dan label section. Pakai `opsz` otomatis:
semakin besar ukuran, semakin tajam kontras serif-nya. Variasi:

| Gaya | Bobot | Konteks |
|------|-------|---------|
| `wght 700, opsz 48+` | Extra Bold | Hero H1, header halaman |
| `wght 600, opsz 24+` | Semi Bold | Judul section, card title |
| `wght 500` | Medium | Sub-judul, label angka besar |
| `wght 400` | Regular | Body pendek editorial (opsional) |

Font body **bukan** Fraunces — Fraunces sebagai body akan terlalu dekoratif dan
mengurangi kontras dengan display.

### Body — Geist

```
Geist · wght 400, 500, 600
```

Body workhorse: form, tabel, deskripsi, metadata, label, error. Geist adalah
sans-serif bersih dengan x-height tinggi — pasangan alami untuk Fraunces karena
kontras bentuk (serif↔sans) tanpa bentrok proporsi.

Tidak perlu font ketiga. Dua saja: Fraunces untuk suara, Geist untuk kerja.

### Skala Tipografi

| Token | Ukuran | Font | Konteks |
|-------|--------|------|---------|
| Hero H1 | `text-4xl sm:text-6xl` | Fraunces 700 | Hanya di `/` |
| H2 section | `text-3xl sm:text-4xl` | Fraunces 600 | Judul section |
| H3 card | `text-xl sm:text-2xl` | Fraunces 600 | Nama media, judul wizard |
| H4 sub | `text-lg` | Fraunces 500 | Sub-judul panel |
| Eyebrow | `text-[11px] tracking-[0.3em]` | Geist 600 UPPER | Label atas judul |
| Body | `text-base leading-relaxed` | Geist 400 | Prose, deskripsi |
| Body-sm | `text-sm` | Geist 400 | Metadata, helper |
| Caption | `text-xs` | Geist 400 | Footer, timestamp |
| Number XL | `text-6xl sm:text-8xl` | Fraunces 700 | Angka statistik / langkah wizard |

Admin memakai skala yang sama tetapi dibatasi: maksimal H3 (`text-2xl`) untuk
judul halaman; tidak ada Hero H1 di dashboard.

### Leading & measure

- Prose: `leading-relaxed` (`1.625`), max-width `prose` (`65ch`)
- Judul: `leading-tight` (`1.25`)
- Data/tabel: `leading-normal` (`1.5`)
- Form label: `leading-snug` (`1.375`)

## Warna

### Prinsip

Monokrom tinta sebagai tulang punggung; tosca hanya di momen yang berarti.
Tidak ada warna ketiga di palet utama — pink event tidak dibawa.

| Peran | Warna |
|-------|-------|
| Teks utama / tinta | near-black (`#11151a`) |
| Teks sekunder | slate-700 / slate-600 |
| Teks tersier / muted | slate-500 / slate-400 |
| Latar utama | putih (`#ffffff`) |
| Latar offset | `#fafaf9` (stone-50, netral-dingin — bukan cream) |
| Latar terangkat | `#ffffff` (kartu di atas offset) |
| Border / rule | `#e7e5e4` (stone-200, hairline) |
| Aksen | tosca `#00918e` |

### Tosca — hemat dan presisi

Tosca (`#00918e`) adalah warna brand Metmal. Di medprom, penggunaannya
**sangat dibatasi** dibanding project event:

| ✅ Pakai di | ❌ Jangan di |
|------------|-------------|
| Link & navigasi aktif | Latar section penuh |
| Focus ring | Badge lebar / chip solid |
| Icon accent (1 per area) | Border dekoratif |
| Angka besar (01, 02, …) | Background hover baris tabel |
| CTA primer (solid fill) | Teks body / prose |
| Checkmark / status sukses | Placeholder / disabled state |

Satu area pandang (viewport) maksimal **dua** sentuhan tosca: satu struktural
(link/focus/CTA) dan satu dekoratif (angka/icon). Lebih dari itu = terlalu
ramai; editorial mengandalkan tinta, bukan warna.

CTA primer: `bg-[#007a78]` (tosca-600, AA 5.18:1 dengan putih) — solid, bukan
outline, karena ini bukan elemen dekoratif.

### Skala slate (Tailwind)

Untuk gradasi abu-abu: `slate-50` sampai `slate-950`. Slate dipilih karena
nuansa biru netral yang tidak hangat (berbeda dari stone/warm-gray project
event), memperkuat kesan presisi.

### Mode gelap — konsol staf saja

Sisi tenant (katalog, wizard, riwayat, status) selalu terang: arah "tinta di
atas kertas" kehilangan kontras serif/tinta bila dibalik. Konsol staf
(`/login`, `/admin`) menyediakan varian gelap melalui kelas `.dark` pada
`<html>` (dipasang manual, bukan mengikuti `prefers-color-scheme`), karena
staf bekerja lama di depan layar.

Mode gelap **belum diaktifkan secara publik** — saklar pemilih tema belum
ada. Varian gelap hanya boleh dipakai setelah audit kontras tersendiri.

## Permukaan & Elevasi

| Token | CSS | Konteks |
|-------|-----|---------|
| `--surface-page` | `#ffffff` | Latar halaman |
| `--surface-offset` | `#fafaf9` | Latar section bergantian |
| `--surface-card` | `#ffffff` | Kartu, panel, form |
| `--surface-hover` | `#f5f5f4` | Hover baris/opsi |

Kartu statis **tidak** punya bayangan. Pembedaan dari latar: border hairline
`1px solid #e7e5e4`. Perbedaan kedalaman antar-permukaan dibuat dengan warna
latar, bukan bayangan.

### Elevasi — hanya untuk elemen mengapung

Sejak arah **App Produk**, tiga token bayangan dipakai — dan **hanya** untuk
elemen yang benar-benar mengapung di atas konten yang bergulir. Tanpa ini,
app bar sticky dan bottom sheet tidak terbaca sebagai lapisan terpisah.

| Token | Konteks | Catatan |
|-------|---------|---------|
| `--elevation-bar` | Top app bar saat konten tergulir | Aktif via `data-elevated="true"`; garis bawah diganti bayangan |
| `--elevation-sheet` | Bottom sheet / dialog | Bayangan mengarah ke atas |
| `--elevation-fab` | Tombol aksi mengapung | Berwarna tosca, bukan netral |

Di luar tiga konteks itu, bayangan **dilarang**. Kartu katalog, panel form, dan
baris tabel tetap hairline.

### Radius

| Elemen | Radius | Token |
|--------|--------|-------|
| Kartu, panel | `0.875rem` | `--radius-card` |
| Tombol, input | `0.625rem` | `--radius-control` |
| Chip, badge | pill penuh | `--radius-chip` |
| Sheet (tepi atas) | `1.25rem` | `--radius-sheet` |

Lebih lunak daripada arah editorial sebelumnya (`0.5rem`/`0.375rem`/`0.25rem`):
aplikasi terasa dapat disentuh, cetakan terasa tajam. Chip memakai pill karena
badge status dibaca sebagai label, bukan potongan kertas.

## Aturan Garis (Rule)

Garis pemisah = `1px solid #e7e5e4` (hairline). Digunakan sebagai:

- Separator antar-section
- Batas bawah header
- Batas atas/bawah card (opsional — hanya bila perlu)
- Garis di bawah judul section (opsional, dekoratif bila whitespace cukup)

Ketebalan selalu 1px. Tidak ada garis tebal, tidak ada double-line, tidak ada
border dekoratif.

## Spasi & Irama Vertikal

| Konteks | Padding Y |
|---------|-----------|
| Section landing | `py-20 sm:py-28 lg:py-32` |
| Section konten | `py-16 sm:py-24` |
| Section sempit (FAQ, footer) | `py-12 sm:py-16` |
| Form section | `py-8 sm:py-12` |
| Admin content area | `p-6 sm:p-8` |

Gutter horizontal: `px-4 sm:px-6 lg:px-8`.

Max-width landing: `max-w-6xl` (72rem, lebih sempit dari event untuk menjaga
measure teks tetap nyaman dengan serif display besar).

Max-width admin: `max-w-7xl` (80rem, untuk mengakomodasi tabel lebar).

## Nomor & Langkah

Nomor (`01`, `02`, `03`) adalah elemen visual kunci dalam arah editorial:

- Fraunces 700, besar (`text-6xl sm:text-8xl`), tosca
- Dipakai sebagai penanda langkah wizard, indeks kartu media, atau statistik
- Bukan dekorasi kosong — selalu punya makna (urutan, jumlah, progres)
- Dipasangkan dengan label kecil di bawahnya

## Tipografi sebagai Hero

Halaman landing (`/`) tidak punya ilustrasi, foto, atau gradien — hanya
tipografi dan whitespace. Struktur hero:

```
EYEBROW (Geist 600 UPPER, tosca)
──────────────────────────────────  ← rule hairline
H1 (Fraunces 700, text-4xl → sm:text-6xl)
Subhead (Geist 400, text-base → sm:text-lg, slate-700, max-w-prose)
[spasi]
CTA primer + CTA sekunder (dua tombol)
```

Tidak ada hero image, illustration, atau background color selain putih. Tosca
hanya di eyebrow teks + rule, bukan sebagai blok warna.

## Kerangka Aplikasi (App Shell)

Setiap layar tenant dirender di dalam `AppShell`
(`src/components/layout/AppShell.tsx`). Tidak ada halaman yang membuat header
atau pembungkus `min-h-screen` sendiri — itu sumber duplikasi dan inkonsistensi.

```
┌─────────────────────────────┐
│ TopAppBar  (sticky, blur)   │  ← judul kontekstual + back + aksi
├─────────────────────────────┤
│                             │
│  <main class="app-scroll">  │  ← HANYA area ini yang menggulir
│                             │
├─────────────────────────────┤
│ BottomTabBar (mobile saja)  │  ← Katalog · Ajukan · Riwayat
└─────────────────────────────┘
```

**Aturan:**

- Hanya `.app-scroll` yang menggulir; bar tidak pernah bergeser. Ini yang
  membedakan aplikasi dari dokumen. Tiga deklarasi CSS wajib untuk itu —
  menghapus salah satunya akan membuat seluruh dokumen menggulir lagi dan
  bar ikut bergeser:
  1. `.app-shell { height: 100dvh; overflow: hidden }` — mengunci kanvas.
  2. `.app-scroll { min-height: 0 }` — anak flex menolak menyusut tanpa ini.
  3. `.app-scroll { position: relative }` — keturunan `position: absolute`
     (mis. `.sr-only`) harus mengambil containing block dari area gulir.
     Tanpa ini, elemen tersebut menambah tinggi gulir **dokumen** dan
     membatalkan penguncian di atas.
- Top app bar **wajib** punya judul. Layar tanpa judul membingungkan saat
  dibuka sebagai PWA standalone (tidak ada title bar browser).
- Tombol kembali hanya muncul bila layar memang punya induk (`back`).
  Alur wizard memakai `back` yang memundurkan langkah, bukan riwayat browser.
- Tab bar **hanya mobile** (`< 640px`). Di desktop navigasi ada di app bar.
- Layar tanpa bar dan tanpa tab bar (mis. `/login`) memakai `.app-canvas`:
  terpusat, tetapi tetap dapat menggulir bila konten lebih tinggi daripada
  viewport — form login tidak boleh terpotong di layar pendek.
- Konten menyisakan ruang bawah `calc(var(--app-tabbar-h) + var(--safe-bottom))`
  agar aksi terakhir tidak tertutup tab bar atau home indicator.

### Sheet — pengganti dialog tengah

Di mobile, dialog terpusat terasa asing. Satu kelas `.app-sheet` beradaptasi:

| Viewport | Perilaku |
|----------|----------|
| `< 640px` | Menempel bawah, lebar penuh, radius hanya di tepi atas (`1.25rem`), maks `92dvh`, ada pegangan geser |
| `≥ 640px` | Dialog terpusat, lebar `min(40rem, 100vw - 3rem)`, radius seragam, maks `85dvh` |

Komponen `src/components/ui/Sheet.tsx` menangani kunci gulir latar, tutup dengan
`Escape`/scrim, jebakan fokus, dan pemulihan fokus ke pemicu.

**Semua dialog wajib memakai komponen ini** — termasuk dialog konfirmasi
(`ConfirmDialog`) dan tiga dialog konsol staf. Menyalin `.app-scrim` +
`.app-sheet` langsung di JSX menghasilkan dialog yang tampak benar tetapi
kehilangan kunci gulir, tutup `Escape`, dan jebakan fokus; itu pernah terjadi
dan baru ketahuan lewat uji peramban, bukan `tsc`.

### Target sentuh

Setiap kontrol interaktif minimal **44×44 px** (`--tap-min`), mengikuti
WCAG 2.2 AA (2.5.8). Umpan balik tekan memakai `.app-pressable` (`scale(0.97)`)
karena `:hover` tidak ada di layar sentuh.

### PWA

- `display: standalone`, `theme_color #00918E`, `lang id`.
- Ikon: `any` 192/512 + `maskable` 512 (safe zone 80%).
- Service worker: shell + aset di-cache; **permintaan `/api/` tidak pernah
  di-cache** — status pengajuan yang basi lebih buruk daripada gagal terang-terangan.
- Naikkan `CACHE_VERSION` di `public/sw.js` setiap rilis yang mengubah aset shell.

## Komponen

### CTA Button — Primer

```
.ui-btn-primary  →  bg #007a78, teks putih, radius var(--radius-control)
                    px-6 py-3, Geist 600
```

Solid tosca-600, Geist 600. Tidak pakai rounded-full, tidak ada gradien.
Hanya satu CTA primer per viewport.

Radius diambil dari token di CSS (`.ui-btn-primary`), bukan dari kelas
utilitas di tiap pemakaian — dengan begitu tombol yang lupa membawa kelas
radius tetap seragam dengan kontrol lain (pernah terjadi: CTA kartu katalog
tertinggal di 6px saat kontrol lain 10px).

### CTA Button — Sekunder

```
.ui-btn-secondary  →  border 1px var(--rule-color), teks var(--ink-secondary),
                      radius var(--radius-control), px-6 py-3, Geist 500
```

Outline netral, kontras rendah — penunjang, bukan saingan CTA primer.

### Kartu Media (Landing)

```
.ui-card  →  background var(--surface-card), border 1px var(--rule-color),
             radius var(--radius-card), p-6
```

- Judul: Fraunces 600, `text-xl`
- Metadata: Geist 400, `text-sm`, slate-600
- Rules: ikon kecil tosca + teks Geist, `text-sm`
- Aksi: link teks tosca (bukan tombol solid)
- Posisi dalam grid editorial 2–3 kolom

Tidak pakai bayangan, tidak pakai background berwarna, tidak pakai border tebal.

### Form (Wizard & Admin)

```
label: Geist 500, text-sm, slate-800, mb-1
input: border border-stone-300, rounded-md, px-3 py-2, text-sm
focus: ring-2 ring-[#00918e] ring-offset-0 (tosca, bukan blue)
error: border-red-400, text-xs red-600 di bawah input
```

Form wizard memakai **indikator progres bersegmen** (tiga batang tipis yang
terisi seiring langkah) plus teks "Langkah N dari 3" — bukan angka besar
`01/02/03` maupun stepper bergaris.

### Tabel (Admin)

```
border-collapse, lebar penuh, dibungkus .overflow-x-auto
header: Geist 600, text-xs, UPPER, slate-500, border-b hairline
row: border-b hairline, hover latar
cell: Geist 400, text-sm, px-3 py-3
```

Horizontal scroll bila overflow (tabel memakai `min-w-[640px]`) — teks tidak
dikecilkan. Tidak ada zebra striping, tidak ada header lengket di dashboard.

### Status Badge

8 status dipetakan ke 3 warna saja:

| Status | Warna | Tailwind |
|--------|-------|----------|
| `menunggu_review` | stone | `bg-stone-100 text-stone-700` |
| `sedang_ditinjau` | blue | `bg-blue-50 text-blue-700` |
| `disetujui` | green | `bg-green-50 text-green-700` |
| `siap_dipasang` | tosca | `bg-[#e6f7f6] text-[#006260]` |
| `sedang_dipasang` | tosca | `bg-[#e6f7f6] text-[#006260]` (garis tepi) |
| `sudah_dipasang` | tosca | `bg-[#00918e] text-white` (solid) |
| `ditolak` | red | `bg-red-50 text-red-700` |
| `selesai` | gray | `bg-stone-100 text-stone-600` |
| `perlu_revisi` | amber | `bg-amber-50 text-amber-700` |

Tosca hanya di 3 status "aktif/dipasang" — itulah momen yang berarti.
Sisanya netral.

## Halaman / Layout Spesifik

### `/` — Landing Katalog

- Dirender di dalam `AppShell` (app bar + tab bar), bukan header sendiri
- Hero ringkas (tipografi saja)
- Angka statistik: `13 media · 3 kategori · spesifikasi lengkap`
- Katalog: 3 section per kategori (Outdoor, Indoor, Digital)
- Masing-masing section: judul section (Fraunces) + grid kartu
- Kontak TR di bawah, bukan sidebar
- Footer minimal: copyright + "Metland Coloring Life"

### `/ajukan` — Wizard

- 3 langkah: `Pilih Media` · `Data Tenant & PIC` · `Kirim`
- Indikator progres bersegmen di atas + teks "Langkah N dari 3"
- Form bersih, satu kolom, whitespace di antara field group
- Tab bar disembunyikan (`hideTabBar`) agar alur fokus
- Tombol kembali memundurkan langkah (`onBack`), bukan riwayat peramban
- Submit: CTA primer solid tosca

### `/admin` — Dashboard

- Header: nama platform + info user + logout
- Tidak ada sidebar — layout horizontal: tab navigasi di atas konten
- Tab: Pengajuan · Katalog Media · Pengguna (berdasarkan role)
- Status summary: 8 kartu kecil dengan angka besar + label
- Tabel pengajuan: kolom ringkas, filter di atas

### `/login` — Login Staf

- Terpusat, minimal
- Judul Fraunces, tidak ada logo besar
- Form compact di tengah halaman
- Tidak ada ilustrasi / hero / card color

## Font Loading Strategy

```html
<!-- Preconnect + preload kritis: Fraunces display + Geist -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Geist:wght@400;500;600;700&display=swap" />
```

Fallback: `Fraunces` → `Georgia, serif`. `Geist` → `system-ui, -apple-system, sans-serif`.

## Checklist QA

Sebelum mengirim perubahan UI publik:

- [ ] `npm run build` hijau
- [ ] Fraunces termuat di `/`, `/ajukan`, `/riwayat`, `/login`
- [ ] Tidak ada `Bricolage Grotesque` tersisa di CSS/JSX
- [ ] Tidak ada `rounded-2xl`/`rounded-3xl` di komponen publik
- [ ] Tidak ada `brand-secondary`/`brand-pink` di komponen medprom
- [ ] Tidak ada `--brand-paper` (cream) — semua latar `white`/`stone-50`
- [ ] Tosca hanya muncul sebagai aksen (maks 2 sentuhan/viewport non-admin)
- [ ] Indikator progres wizard tampil di mobile dan desktop
- [ ] Tabel admin scroll horizontal, bukan mengecilkan teks
- [ ] Tab navigasi admin berfungsi di mobile
- [ ] Dokumen tidak menggulir: `documentElement.scrollHeight === innerHeight`
- [ ] Hanya `.app-scroll` yang menggulir dan app bar tidak bergeser
- [ ] Setiap kontrol interaktif minimal 44px tingginya (`--tap-min`)
- [ ] Setiap dialog memakai komponen `Sheet` (Escape, kunci gulir, jebakan fokus)
- [ ] Radius seragam: kontrol 10px, kartu 14px
- [ ] `ui-dashboard-*` class dari project event TIDAK dipakai di komponen publik baru

## Migrasi dari Pola Event

Proyek ini **sedang** memakai `ui-dashboard-*`, `--brand-paper`, Bricolage
Grotesque, `rounded-xl`/`rounded-2xl`, dan `shadow-card-*` yang disalin dari
project event. Semua itu adalah peninggalan yang HARUS dihapus saat
mengimplementasikan desain editorial ini.

Migrasi bertahap:

1. Ganti font di `index.html` (Fraunces masuk, Bricolage keluar).
2. Tulis ulang `theme.css` (buang token event, tambahkan token editorial).
3. Tulis ulang `base.css` (buang `ui-dashboard-*`, tambahkan `ui-editorial-*`).
4. Implementasi per halaman: Landing → Wizard → Status → Login → Admin.
5. Hapus `--brand-paper`, `--brand-card`, `--brand-secondary`, `shadow-*` dari `:root`.

Jangan setengah-setengah — mencampur dua bahasa desain akan menghasilkan UI
yang tidak koheren.