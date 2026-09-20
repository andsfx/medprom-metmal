# DESIGN — Medprom Metmal

> **Sumber kebenaran:** `src/styles/theme.css`, `src/styles/base.css`, `index.html` (fonts).  
> **Tata kelola:** klaim faktual di dokumen ini (nilai, kelas, ukuran, nama token,
> keberadaan elemen) diaudit terhadap kode. Bila dokumen dan kode berbeda,
> **kode menang** dan dokumen wajib diperbaiki. Klaim niat/preskriptif tetap
> berlaku sebagai arahan; penyimpangan kode terhadapnya dicatat di bagian
> "Catatan Ketidaksesuaian", bukan dihapus diam-diam.  
> **Dibuat:** 2026-09-16 · **Direvisi:** 2026-09-20 (audit akurasi terhadap kode)

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

Tidak boleh ada kebocoran pola event ke medprom (kertas krem hangat, tipografi
grotesque dekoratif, kartu bulat soft-elevation, tosca+pink merata).

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

Hanya untuk judul halaman, judul section, dan angka statistik. Pakai `opsz`
otomatis:
semakin besar ukuran, semakin tajam kontras serif-nya. Variasi:

| Gaya | Bobot | Konteks |
|------|-------|---------|
| `wght 700, opsz 24+` | Bold | H1 halaman, nama media di kartu, angka |
| `wght 600` | Semi Bold | Judul section katalog (Fraunces) |
| `wght 500` | Medium | Sub-judul, label pendamping |
| `wght 400` | Regular | Body pendek editorial (opsional) |

Font body **bukan** Fraunces — Fraunces sebagai body akan terlalu dekoratif dan
mengurangi kontras dengan display.

### Body — Geist

```
Geist · wght 400, 500, 600, 700
```

Body workhorse: form, tabel, deskripsi, metadata, label, error. Geist adalah
sans-serif bersih dengan x-height tinggi — pasangan alami untuk Fraunces karena
kontras bentuk (serif↔sans) tanpa bentrok proporsi.

Tidak perlu font ketiga. Dua saja: Fraunces untuk suara, Geist untuk kerja.

### Skala Tipografi

| Token | Ukuran | Font | Konteks |
|-------|--------|------|---------|
| H1 hero `/` | `text-3xl sm:text-4xl` | Fraunces 700 | Hero `/` (kekhususan landing); satu per layar |
| H2 section landing | `text-2xl sm:text-3xl` | Fraunces 600 | Judul section katalog (kekhususan landing) |
| H3 card | `text-lg` | Fraunces 700 | Nama media di kartu katalog |
| H1 app bar tiap layar | `.ui-title-screen` → `24px` | Fraunces 700 | Judul layar (`TopAppBar`) — `--text-screen` |
| H2 bagian (wizard/dll.) | `.ui-title-section` → `20px` | Fraunces 700 | Judul bagian — `--text-section` |
| Judul panel/sheet | `.ui-title-card` → `18px` | Geist 600 | Judul panel, sheet, kartu; tidak ada elemen `<h4>` di repo — `--text-title` |
| Angka | `text-xl` + `.ui-number` | Fraunces 700 tosca | Angka ringkasan dashboard |
| Eyebrow | `text-xs tracking-[0.2em]` | Geist 700 UPPER | Label atas judul |
| Body | `text-base` (leading 1.6) | Geist 400 | Prose, deskripsi |
| Body-dense | `text-sm` | Geist 400/500 | Baris data, lencana, sel tabel (`.ui-dense`, `.app-nav-link`) |
| Body-sm | `text-sm` | Geist 400 | Metadata, helper |
| Caption | `text-xs` | Geist 400 | Footer, timestamp |

**Kelas peran vs utilitas landing.** `text-3xl`/`text-2xl`/`text-lg` adalah
**kekhususan halaman landing `/`** (dan hero), bukan pola umum. Setiap layar
tenant merender h1 lewat kelas peran `.ui-title-screen` (24px) dan h2 lewat
`.ui-title-section` (20px); judul kartu/panel memakai `.ui-title-card` (18px).
Menambah layar baru dengan `text-3xl`/`text-2xl` akan merusak hierarki. Kelas
peran ada justru karena nilai ad-hoc pernah membuat hierarki terbalik — h1 app
bar 16px sementara isi 20px (`theme.css:12-16`), dan h1 app bar harus tetap
24px di atas h2 20px (`base.css:200-206`).

Lantai tipografi `--text-meta` adalah `0.75rem` (12px); tidak ada teks di bawah
ukuran itu dan tidak ada eyebrow berukuran 11px di repo.

Admin memakai skala yang sama; judul halaman maksimal `text-2xl`.

Tidak ada teks display di atas `text-4xl`. Arah **App Produk** menukar hero
raksasa arah editorial dengan judul yang lebih rapat: kerapatan informasi
lebih penting daripada drama tipografis, terutama karena layar ini dipakai
berulang oleh staf dan tenant, bukan dibaca sekali seperti halaman kampanye.

### Leading & measure

- Prose: leading `1.6` (`.ui-body`), max-width `.ui-prose` (`65ch`, `--measure`)
- Judul: leading `1.2` (`--leading-tight`)
- Data/tabel: leading `1.45` (`.ui-dense`)
- Form label: ukuran mengikuti konteks (`text-sm` di wizard/`/login`, `text-xs`
  di admin); tidak ada aturan leading khusus. Lihat bagian Form (Wizard & Admin).

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
| CTA primer (solid fill) | Border dekoratif |
| Ikon kecil pendamping teks | Background hover baris tabel |
| Angka statistik (`.ui-number`) | Teks body / prose |
| Checkmark / status sukses | Placeholder / disabled state |

Pengecualian yang disengaja: badge status sukses "Sudah Dipasang" memang
memakai tosca sebagai permukaan (`bg-brand-primary-600 text-white`). Status
aktif adalah momen yang berarti, jadi chip solid diizinkan di sana.

Aksen tosca dipakai secara hemat dengan satu aturan utama:

- **Aksen struktural** — CTA, tautan aktif, focus ring, angka statistik.
  Niatnya: sesedikit mungkin pada satu waktu, idealnya satu per viewport, agar
  halaman tidak terasa ramai. Jumlah ini tidak dapat dibuktikan dari kode
  (bergantung data dan viewport), jadi ia arahan, bukan angka yang diuji.

Di luar itu, baris metadata kartu media **tidak memakai ikon**: label teks
(Ukuran/Bahan/Harga/Lokasi) sudah cukup dan ikon metadata dihapus, sehingga
baris metadata kini `<dl>` dengan `<dt>` label + `<dd>` nilai. Tosca di kartu
muncul pada ikon tautan aksi "Ajukan Materi" (`ArrowRight`, `h-4 w-4`), pada
ikon `ChevronDown` tombol "Ketentuan pemasangan" (mewarisi tosca tombolnya),
dan pada bullet butir ketentuan (`h-1 w-1`, `bg-brand-primary-500`). Semuanya
mendampingi teks, bukan berdiri sendiri.

Batasnya bukan angka mati, melainkan: **tosca tidak pernah mewarnai teks
paragraf, dan tidak pernah menghias section secara menyeluruh.** Bedakan dua
tingkat:

- **Permukaan tosca penuh** (teks putih di atas tosca): CTA primer, badge
  "Sudah Dipasang" (`bg-brand-primary-600 text-white`), tab admin aktif, dan
  mark logo.
- **Tint tosca** (tosca sebagai latar pucat, teks tetap tosca/gelap): badge
  `siap_dipasang`/`sedang_dipasang` (`bg-brand-primary-50`), opsi tenant
  ter-highlight (`TenantSearchSelect.tsx:209`), label status terpilih di form
  review admin (`AdminDashboardPage.tsx:748`), area unggah
  (`SubmissionDetail.tsx:288`), dan badge "sudah_dipasang" di riwayat/detail
  (`bg-brand-primary-100`). Tint tosca **diizinkan** — bukan pelanggaran aturan
  permukaan.

Aturan lama "maksimal dua sentuhan per viewport" ditulis untuk tata letak
editorial tanpa kartu data; katalog media kini punya banyak baris data per
kartu, jadi angka itu tidak lagi dapat ditegakkan.

CTA primer: latar `--brand-tosca-600` (`#007a78`), ditetapkan di CSS
`.ui-btn-primary` (`base.css`), bukan kelas hex literal — solid, bukan
outline, karena ini bukan elemen dekoratif.

### Skala slate (Tailwind)

Untuk gradasi abu-abu: `slate-50` sampai `slate-950`. Slate dipilih karena
nuansa biru netral yang tidak hangat (berbeda dari stone/warm-gray project
event), memperkuat kesan presisi.

### Mode gelap

Varian gelap aktif melalui kelas `.dark` pada `<html>`, dipasang manual (bukan
mengikuti `prefers-color-scheme`). Token dan kelasnya ada di `base.css`
(`.dark .ui-*`, `.dark .app-*`) dan `@variant dark` di `index.css`.

Kenyataannya varian `dark:` **bukan** hanya di konsol staf: komponen tenant
(kartu katalog, riwayat, detail pengajuan) juga membawa kelas `dark:`. Jadi
persiapan mode gelap sudah menyeluruh, tetapi belum ada satu pun kode yang
menambah atau melepas kelas `.dark` (tidak ada saklar pemilih tema), sehingga
mode gelap **belum aktif secara publik**. Varian gelap hanya boleh dinyalakan
setelah audit kontras tersendiri.

Catatan: skeleton pra-mount di `index.html` (sebelum React mount) memang
mengikuti `prefers-color-scheme`, termasuk `theme-color` gelap. Itu satu-satunya
bagian yang reaktif terhadap preferensi sistem.

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
| `--elevation-fab` | Tombol aksi mengapung | Token tersedia di `theme.css`, tetapi belum ada elemen FAB yang memakainya (0 pemakaian) |

Di luar tiga konteks itu, bayangan **dilarang** untuk kartu statis: kartu
katalog, panel form, dan baris tabel tetap hairline. Satu elemen mengapung
belum bertoken: dropdown daftar tenant memakai `shadow-lg` (Tailwind mentah),
bukan token elevasi (`TenantSearchSelect.tsx:197`). Lihat "Catatan
Ketidaksesuaian" butir 7.

### Radius

| Elemen | Radius | Token |
|--------|--------|-------|
| Kartu, panel | `0.875rem` | `--radius-card` |
| Tombol, input | `0.625rem` | `--radius-control` |
| Chip, badge | tidak seragam | `--radius-chip` (pill) didefinisikan tetapi **tidak dipakai di mana pun** |
| Sheet (tepi atas) | `1.25rem` | `--radius-sheet` |

Lebih lunak daripada arah editorial sebelumnya (`0.5rem`/`0.375rem`/`0.25rem`):
aplikasi terasa dapat disentuh, cetakan terasa tajam.

Badge status tidak seragam: badge admin (`StatusBadge` di
`AdminDashboardPage.tsx`) memakai `rounded-md`, sedangkan badge riwayat/detail
memakai `rounded-full`. Token `--radius-chip: 9999px` ada di `theme.css` tetapi
tidak dirujuk kelas mana pun. Keseragaman bentuk badge menunggu keputusan
(lihat "Catatan Ketidaksesuaian").

## Aturan Garis (Rule)

Garis pemisah = `1px solid #e7e5e4` (hairline). Digunakan sebagai:

- Separator antar-section
- Batas bawah header
- Batas atas/bawah card (opsional — hanya bila perlu)
- Garis di bawah judul section (opsional, dekoratif bila whitespace cukup)

Garis pemisah/hairline selalu 1px. Tidak ada garis pemisah tebal, tidak ada
double-line, tidak ada border dekoratif. Satu pengecualian yang sah: batas
**putus-putus 2px** (`border-2 border-dashed`) sebagai penanda area unggah
(`PromoUploadWizard.tsx:1034`, `SubmissionDetail.tsx:288`), bukan sebagai
pemisah.

## Spasi & Irama Vertikal

| Konteks | Padding Y |
|---------|-----------|
| Hero landing | `pt-6 pb-6 sm:pt-10 sm:pb-10` |
| Section katalog | `pb-10` |
| Section sempit (kontak/footer) | `py-12` (kontak) / `py-8` (footer) |
| Form section wizard | padding `1.25rem`; `1.5rem` sejak `sm` |
| Admin content area | `px-4 py-5` |

Gutter horizontal: `px-4`.

Max-width landing: `max-w-6xl` (72rem, lebih sempit dari event untuk menjaga
measure teks tetap nyaman dengan serif display besar).

Max-width admin: `max-w-6xl` (72rem). Header, nav, dan main admin semuanya
`max-w-6xl`; tabel lebar (`min-w-[760px]`) mengandalkan scroll horizontal di
dalam kontainernya, bukan kontainer yang lebih lebar.

## Angka & Statistik

Angka besar bernomor (`01`, `02`, `03`) **tidak dipakai lagi** — itu peninggalan
arah editorial, dan sudah tidak ada satu pun di kode. Yang tersisa hanyalah
angka statistik:

- Fraunces 700, `text-xl`, tosca, lewat kelas `.ui-number`; sifat tabular dari
  utilitas `tabular-nums` di pemanggil (`AdminDashboardPage.tsx:293`), bukan
  dari `.ui-number` (`base.css:345-349` hanya mengatur family/weight/warna)
- Hanya di kartu ringkasan dashboard staf (jumlah pengajuan per status)
- Selalu berpasangan dengan label kecil di bawahnya
- Bukan dekorasi: angkanya adalah data yang dibaca staf

Progres langkah wizard **bukan** angka besar, melainkan indikator bersegmen
(lihat bagian Halaman/Layout Spesifik). Bila menambah elemen bernomor baru,
ikuti pola `.ui-number` + label, jangan menghidupkan kembali angka display
raksasa.

## Tipografi sebagai Hero

Halaman landing (`/`) tidak punya ilustrasi dekoratif, foto latar, atau gradien
— hanya tipografi dan whitespace. Di landing `/`, satu-satunya gambar adalah
**foto contoh media** pada kartu katalog (dan thumbnail di langkah 1 wizard),
yang diekspor dari deck 2026: gambar informatif, bukan hiasan. Rasio dikunci
4:3 dengan `width`/`height` eksplisit agar tidak ada pergeseran tata letak.
Satu-satunya elemen `<img>` lain yang dirender di repo adalah pratinjau foto di
form katalog konsol staf (`AdminDashboardPage.tsx:1169`). Struktur hero:

```
EYEBROW (Geist 700 UPPER, tosca, text-xs)
H1 (Fraunces 700, text-3xl → sm:text-4xl)
Subhead (Geist 400, text-base, muted, max-w-lg)
[spasi]
CTA primer + CTA sekunder (dua tombol)
```

Tidak ada hero image atau background color selain putih. Tidak ada rule
hairline di hero; `.ui-rule` hanya dipakai di bawah `h2` section katalog. Tosca
di hero hanya pada teks eyebrow dan CTA primer, bukan sebagai blok warna.

## Kerangka Aplikasi (App Shell)

Setiap layar tenant dirender di dalam `AppShell`
(`src/components/layout/AppShell.tsx`). Layar tenant tidak membuat header atau
pembungkus `min-h-screen` sendiri — itu sumber duplikasi dan inkonsistensi.
Konsol staf (`/admin`) adalah pengecualian: ia memakai `min-h-screen` dan
`<header className="ui-chrome sticky top-0 …">` sendiri
(`AdminDashboardPage.tsx:1582`, `:1584`), di luar `AppShell`.

```
┌─────────────────────────────┐
│ TopAppBar  (sticky, blur)   │  ← judul kontekstual + back + aksi
├─────────────────────────────┤
│                             │
│  <main class="app-scroll">  │  ← HANYA area ini yang menggulir
│                             │
├─────────────────────────────┤
│ BottomTabBar (mobile saja)  │  ← Katalog · Ajukan · Lacak · Riwayat
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
- Top app bar menampilkan judul kontekstual bila `title` diisi; bila kosong ia
  menampilkan wordmark "Media Promosi" (`TopAppBar.tsx`), bukan bar tanpa isi.
- Tujuan navigasi (tab bar mobile dan nav desktop) berasal dari satu sumber,
  `src/components/layout/navItems.ts`: Katalog · Ajukan · Lacak · Riwayat.
  Jangan duplikasi daftar ini di komponen.
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
WCAG 2.2 AA (2.5.8). Pengecualian sesuai 2.5.8: tautan teks inline di tengah
kalimat tidak memakai `min-h` (mis. `SubmissionDetail.tsx:421`,
`TrackSubmissionPage.tsx:170`, `AdminDashboardPage.tsx:674`) — tautan seperti
itu dikecualikan WCAG, jadi aturan 44px berlaku untuk kontrol/tombol/tautan
berdiri sendiri. Umpan balik tekan memakai `.app-pressable` (`scale(0.97)`)
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
.ui-btn-primary  →  bg var(--brand-tosca-600) (#007a78), teks putih,
                    radius var(--radius-control), Geist 600
```

Solid tosca-600, Geist 600. Tidak memakai sudut pill penuh dan tidak memakai
gradien. Hanya satu CTA primer per viewport (arahan; tidak diuji dari kode).

Warna latar, radius, dan tinggi minimum ditetapkan di CSS (`.ui-btn-primary`,
`background: var(--brand-tosca-600)` di `base.css`), bukan sebagai kelas
utilitas hex di tiap pemakaian. Padding dan bobot teks ditulis per pemakaian;
varian padding yang paling sering `px-5 py-3` (7 pemakaian), diikuti
`px-4 py-2.5` (6), `px-4 py-2` (3), `px-5 py-2.5` (2), dan `px-4 py-3` (1) —
padding **bukan** aturan kelas. Radius dari token membuat tombol yang lupa
membawa kelas radius tetap seragam dengan kontrol lain (pernah terjadi: CTA
kartu katalog tertinggal di 6px saat kontrol lain 10px).

### CTA Button — Sekunder

```
.ui-btn-secondary  →  border 1px var(--rule-color), teks var(--ink-secondary),
                      radius var(--radius-control), Geist 500
                      (padding per pemakaian; lihat catatan di atas)
```

Outline netral, kontras rendah — penunjang, bukan saingan CTA primer.

### Kartu Media (Landing)

```
.ui-card  →  background var(--surface-card), border 1px var(--rule-color),
             radius var(--radius-card), tanpa padding
```

`.ui-card` tidak membawa padding; padding ditulis per pemakaian (`p-5` di kartu
katalog landing).

- Judul: Fraunces 700, `text-lg`
- Metadata: baris `<dl>` `text-sm`; label `<dt>` memakai `.ui-meta`
  (12px, `slate-500` muted) dan nilai `<dd>` memakai `.ui-text-muted`
- Ketentuan: panel terlipat "Ketentuan pemasangan" (`text-sm`, brand-700, ikon
  `ChevronDown` mewarisi tosca) yang membuka daftar butir `text-xs` slate-600,
  tiap butir didahului bullet tosca `h-1 w-1` (`bg-brand-primary-500`)
- Aksi: link teks tosca (bukan tombol solid)
- Posisi dalam grid 2–3 kolom

Tidak pakai bayangan, tidak pakai background berwarna, tidak pakai border tebal.

### Form (Wizard & Admin)

```
label (wizard & /login): Geist 600 (font-semibold), text-sm, slate-800, mb-1.5
label (admin): Geist 600 (font-semibold), text-xs, mb-1, warna muted
               (ui-text-muted) atau slate-700
input: .ui-control → border 1px var(--rule-color) (stone-200),
       radius var(--radius-control), px-3 py-2.5, text-sm
focus: ring-2 ring-brand-primary-600 (#007a78, tosca)
error: input ring-1 ring-red-300; teks text-xs font-medium text-red-600
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

Horizontal scroll bila overflow (tabel pengajuan `min-w-[760px]`, tabel pengguna
`min-w-[640px]`) — teks tidak dikecilkan. Tidak ada zebra striping, tidak ada
header lengket di dashboard.

### Status Badge

`StatusBadge` (`AdminDashboardPage.tsx`) memetakan **9 kunci status** ke
beberapa warna (stone, blue, green, tosca, red, amber) — bukan 3 warna. Kelas
memakai **token** (`bg-brand-primary-*`), bukan hex mentah. Wadahnya
`rounded-md px-2 py-0.5 text-xs font-medium`.

| Status | Warna | Tailwind |
|--------|-------|----------|
| `menunggu_review` | stone | `bg-stone-100 text-stone-700` |
| `sedang_ditinjau` | blue | `bg-blue-50 text-blue-700` |
| `disetujui` | green | `bg-green-50 text-green-700` |
| `siap_dipasang` | tosca | `bg-brand-primary-50 text-brand-primary-700` |
| `sedang_dipasang` | tosca | `bg-brand-primary-50 text-brand-primary-700` + `ring-1 ring-inset ring-brand-primary-500/30` |
| `sudah_dipasang` | tosca | `bg-brand-primary-600 text-white` (solid) |
| `ditolak` | red | `bg-red-50 text-red-700` |
| `selesai` | gray | `bg-stone-100 text-stone-600` |
| `perlu_revisi` | amber | `bg-amber-50 text-amber-700` |

Tosca hanya di 3 status "aktif/dipasang" — itulah momen yang berarti.
Sisanya netral.

Catatan: jumlah status tidak selaras antar sumber. `STATUS_ORDER` di
`src/constants/promo.ts` memuat 7 entri, `STATUS_LABELS` memuat 8, `StatusBadge`
memetakan 9 kunci, dan `AGENTS.md` menyebut 8 tahap PRD §8. Lihat "Catatan
Ketidaksesuaian".

## Halaman / Layout Spesifik

### `/` — Landing Katalog

- Dirender di dalam `AppShell` (app bar + tab bar), bukan header sendiri
- Hero ringkas (tipografi saja): eyebrow tosca "Tenant Relations · 2026",
  H1 "Ajukan Materi Promosi Tenant Anda", subhead, lalu dua CTA
  ("Mulai Pengajuan" primer + "Lihat Katalog" sekunder)
- Katalog: 3 section per kategori (Outdoor, Indoor, Media Sosial)
- Masing-masing section: judul section (Fraunces) + rule hairline + grid kartu
- Kontak TR di bawah, bukan sidebar
- Footer minimal: copyright + "Metland Coloring Life"

### `/ajukan` — Wizard

- 3 langkah: `Pilih Media` · `Data Tenant` · `Kirim Materi`
- Indikator progres bersegmen di atas + teks "Langkah N dari 3"
- Form wizard satu kolom secara bawaan, dengan beberapa grup field berdampingan
  dua kolom sejak `sm` (`grid gap-4 sm:grid-cols-2`)
- Tab bar disembunyikan (`hideTabBar`) agar alur fokus
- Tombol kembali memundurkan langkah (`onBack`), bukan riwayat peramban
- Submit: CTA primer solid tosca

### `/admin` — Dashboard

- Header: nama platform + info user + logout
- Tidak ada sidebar — layout horizontal: tab navigasi di atas konten
- Tab: Pengajuan · Katalog Media · Pengguna (berdasarkan role)
- Ringkasan status: kartu kecil dengan angka (`.ui-number`) + label
- Tabel pengajuan: kolom ringkas, filter di atas

### `/login` — Login Staf

- Terpusat, minimal
- Ada mark tosca 48px (ikon Megaphone, `bg-brand-primary-600`) di atas judul
- Judul Fraunces `text-xl` (bukan ukuran display besar)
- Form compact di tengah halaman
- Tidak ada ilustrasi / hero / card color

## Font Loading Strategy

```html
<!-- Preconnect + preload kritis: Fraunces display + Geist -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Geist:wght@400;500;600;700&display=swap" />
<!-- Stylesheet dimuat non-blocking, lalu diaktifkan saat load -->
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Geist:wght@400;500;600;700&display=swap" /></noscript>
```

Fallback: `Fraunces` → `Georgia, serif`. `Geist` → `system-ui, -apple-system, sans-serif`.

## Checklist QA

Sebelum mengirim perubahan UI publik:

- [ ] `npm run build` hijau
- [ ] Fraunces termuat di `/`, `/ajukan`, `/riwayat`, `/login`
- [ ] Tidak ada font display lain selain Fraunces di CSS/JSX
- [ ] Tidak ada `rounded-2xl`/`rounded-3xl` di komponen publik
- [ ] Tidak ada `brand-secondary`/`brand-pink` di komponen medprom
- [ ] Tidak ada `--brand-paper` (cream) — semua latar `white`/`stone-50`
- [ ] Tosca tidak mewarnai teks paragraf; permukaan tosca penuh (teks putih di
      atas tosca) hanya di CTA primer, badge "Sudah Dipasang", tab admin aktif,
      dan mark logo; tint tosca (`bg-brand-primary-50/100`) diizinkan
- [ ] Aksen struktural (CTA/link/angka) sesedikit mungkin, idealnya satu per viewport
- [ ] Indikator progres wizard tampil di mobile dan desktop
- [ ] Tabel admin scroll horizontal, bukan mengecilkan teks
- [ ] Tab navigasi admin berfungsi di mobile
- [ ] Dokumen tidak menggulir: `documentElement.scrollHeight === innerHeight`
- [ ] Hanya `.app-scroll` yang menggulir dan app bar tidak bergeser
- [ ] Setiap kontrol interaktif minimal 44px tingginya (`--tap-min`)
- [ ] Setiap dialog memakai komponen `Sheet` (Escape, kunci gulir, jebakan fokus)
- [ ] Radius seragam: kontrol 10px, kartu 14px (badge masih tidak seragam:
      admin `rounded-md`, riwayat/detail `rounded-full` — lihat Catatan Ketidaksesuaian)
- [ ] Kelas warisan project event (prefix dashboard) TIDAK dipakai di komponen publik baru

## Migrasi dari Pola Event (selesai)

Migrasi dari pola project event **sudah selesai**. Kelas warisan project event
(prefix `dashboard`), token kertas krem, font display grotesque, radius
`xl`/`2xl`, dan token bayangan kartu tidak lagi ada di kode (grep nol hasil di
`src/`). Langkah yang dijalankan:

1. Ganti font di `index.html` (Fraunces masuk, font event keluar).
2. Tulis ulang `theme.css` (buang token event, tambahkan token editorial).
3. Tulis ulang `base.css` (buang kelas warisan, tambahkan `.ui-*`/`.app-*`).
4. Implementasi per halaman: Landing → Wizard → Status → Login → Admin.
5. Hapus token kertas/sekunder/bayangan warisan dari `:root`.

Jangan setengah-setengah — mencampur dua bahasa desain akan menghasilkan UI
yang tidak koheren.

## Catatan Ketidaksesuaian (menunggu keputusan)

Butir-butir berikut adalah ketidaksesuaian antara kode dan niat desain yang
**tidak boleh** diselesaikan dengan mengubah dokumen saja. Kode sengaja tidak
diubah sampai ada keputusan pemilik produk.

1. **Admin `max-w-6xl` vs kebutuhan tabel lebar.** Header, nav, dan main admin
   memakai `max-w-6xl` (72rem), sedangkan tabel pengajuan `min-w-[760px]`.
   Kontainer admin perlu dilebarkan, atau scroll horizontal di dalam tabel
   sudah cukup?
2. **`--radius-chip: 9999px` tidak dipakai di mana pun.** Badge tidak seragam:
   `rounded-md` di admin, `rounded-full` di riwayat/detail. Pilih satu bentuk
   (dan pakai tokennya), atau hapus tokennya.
3. **Jumlah status tidak selaras.** `STATUS_ORDER` (`src/constants/promo.ts`)
   memuat 7 entri, `STATUS_LABELS` 8, `StatusBadge` (`AdminDashboardPage.tsx`)
   memetakan 9 kunci, dan `AGENTS.md` menyebut 8 tahap PRD §8. Selaraskan
   ketiganya.
4. **Judul kartu `text-lg`/700.** Dokumen kini mengikuti kode (`text-lg`,
   Fraunces 700). Bila niat desain sebenarnya `text-xl`/600, kode yang perlu
   diubah, bukan dokumen.
5. **Tosca sebagai permukaan.** Badge status sukses (`bg-brand-primary-600
   text-white`) dan tab admin aktif memakai tosca sebagai permukaan. Sengaja,
   atau sebaiknya netral?
6. **`--elevation-fab` tidak terpakai.** Dipertahankan sebagai cadangan untuk
   FAB yang akan datang, atau dihapus?
7. **Dropdown tenant memakai `shadow-lg`, bukan token elevasi.** Dropdown daftar
   tenant (`TenantSearchSelect.tsx:197`) adalah elemen mengapung nyata tetapi
   memakai `shadow-lg` (Tailwind mentah), sehingga menyimpang dari sistem tiga
   token elevasi. Beri token elevasi sendiri (mis. `--elevation-dropdown`),
   atau terima `shadow-lg` sebagai pengecualian resmi?
8. **Tailwind v4 memindai berkas dokumen (`docs/*.md`) saat membangun CSS.**
   Karena tidak ada `tailwind.config`/`content`, pemindai menyapu seluruh repo,
   termasuk dokumen. Akibatnya setiap kelas Tailwind yang **dikutip** di dokumen
   (termasuk yang sedang dinyatakan tidak dipakai, mis. `py` `-20`,
   `max-w` `-7xl`, `bg` `-[#007a78]`) ikut ter-generate ke CSS produksi. Bukti
   (terukur saat build pra-audit): bundle naik 53,01 → 54,07 kB (gzip 10,44 →
   10,62 kB) setelah dokumen audit ditambahkan; reproduksi angka ini perlu
   menjalankan build pada revisi sebelum dokumen audit masuk. Perilaku ini
   **pra-ada**: bundle sebelum audit pun sudah memuat
   kelas yang dikutip di `DESIGN.md`. Keputusan: tambahkan
   `@source not "../docs/**"` pada CSS Tailwind, atau biarkan. Dampaknya kecil
   (~1 kB), jadi tidak mendesak.