# DESIGN — Medprom Metmal

> **Sumber kebenaran:** `src/styles/theme.css`, `src/styles/base.css`, `index.html` (fonts).  
> **Dibuat:** 2026-09-16

## Arah Desain

Medprom Metmal adalah portal operasional tenant — pengajuan, verifikasi, pelacakan —
bukan halaman kampanye komunitas. Desainnya harus terasa presisi, terstruktur,
tipografis, dan tenang.

Arah: **editorial kontras** — serif display sebagai hero, tinta pekat di atas
kertas putih bersih, whitespace luas, garis hairline, dan aksen tosca yang
sangat hemat.

Ini adalah keberangkatan fundamental dari project event Metmal (warm cream
paper, Bricolage Grotesque, kartu bulat soft-elevation, tosca+pink merata).
Tidak boleh ada kebocoran pola event ke medprom; tiap komponen ditulis ulang
dalam bahasa desain editorial.

## Kata Kunci Visual

- serif display · tinta di kertas
- whitespace lebar · garis rambut (hairline)
- nomor besar · hierarki jelas
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

### Tidak ada dark mode di v1

Desain editorial mengandalkan tinta di atas kertas putih — inversinya kehilangan
kontras serif/tinta. Dark mode ditunda sampai fondasi terang mantap.

## Permukaan & Elevasi

| Token | CSS | Konteks |
|-------|-----|---------|
| `--surface-page` | `#ffffff` | Latar halaman |
| `--surface-offset` | `#fafaf9` | Latar section bergantian |
| `--surface-card` | `#ffffff` | Kartu, panel, form |
| `--surface-hover` | `#f5f5f4` | Hover baris/opsi |

Kartu **tidak** punya bayangan (`box-shadow: none`). Pembedaan dari latar:
border hairline `1px solid #e7e5e4`. Elevasi dibuat dengan perbedaan warna
latar, bukan dengan bayangan — karena arah editorial = cetak, bukan material.

### Radius

| Elemen | Radius | Tailwind |
|--------|--------|----------|
| Kartu, panel | `0.5rem` | `rounded-lg` |
| Tombol, input | `0.375rem` | `rounded-md` |
| Chip, badge | `0.25rem` | `rounded` |
| Modal | `0.5rem` | `rounded-lg` |

Tajam, presisi, bersih. Tidak ada `rounded-2xl`/`rounded-3xl` (kampanye event).

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

## Komponen

### CTA Button — Primer

```
bg-[#007a78]  text-white  rounded-md  px-6 py-3  font-semibold
```

Solid tosca-600, Geist 600. Tidak pakai rounded-full, tidak ada gradien.
Hanya satu CTA primer per viewport.

### CTA Button — Sekunder

```
border border-stone-300  text-slate-800  rounded-md  px-6 py-3  font-medium
```

Outline netral, kontras rendah — penunjang, bukan saingan CTA primer.

### Kartu Media (Landing)

```
surface-card  border border-stone-200  rounded-lg  p-6
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

Form wizard memakai langkah bernomor besar (`01`, `02`, `03`) sebagai navigasi
visual — bukan stepper linear dengan garis.

### Tabel (Admin)

```
border-collapse, lebar penuh
header: Geist 600, text-xs, UPPER, slate-500, border-b hairline stone-200
row: border-b hairline stone-100, hover bg-stone-50
cell: Geist 400, text-sm, px-4 py-3
```

Sticky header, horizontal scroll bila overflow. Tidak ada zebra striping.

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

- Hero editorial (tipografi saja)
- Angka statistik: `13 media · 3 kategori · spesifikasi lengkap`
- Katalog: 3 section per kategori (Outdoor, Indoor, Digital)
- Masing-masing section: judul section (Fraunces) + grid kartu
- Kontak TR di bawah, bukan sidebar
- Footer minimal: copyright + "Metland Coloring Life"

### `/ajukan` — Wizard

- 3 langkah bernomor: `01 Pilih Media` · `02 Isi Detail` · `03 Kirim`
- Angka langkah besar, warna tosca hanya di langkah aktif
- Form bersih, satu kolom, whitespace di antara field group
- Tidak ada progress bar — angka + label sebagai pengganti
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
- [ ] Form wizard langkah bernomor tampil di mobile dan desktop
- [ ] Tabel admin scroll horizontal, bukan mengecilkan teks
- [ ] Tab navigasi admin berfungsi di mobile
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