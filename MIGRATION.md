# MIGRATION — Prototype HTML → `medprom-metmal`

> **Tujuan.** Memindahkan keputusan UI/UX dari prototype HTML (10 layar, workspace
> Open Design) ke repo React asli ini.
>
> **Sumber kebenaran.** Repo ini. Prototype hanyalah acuan visual/IA. Bila
> prototype dan repo berbeda, **repo menang** (kode, `DESIGN.md`, `AGENTS.md`).
>
> **Direvisi 2026-11-18.** Tabel keputusan di bawah diperbarui setelah
> pengguna memilih eksplisit arah **achromatic** dan cakupan **full** (lihat
> `docs/PLAN_2026-11-18_08-59.md`). Keputusan lama (Rausch final, tanpa
> beranda) **tidak lagi berlaku**.
>
> **Bahasa dokumen & UI:** Indonesia.

---

## 1. Keputusan yang sudah terkunci

| # | Keputusan | Status |
|---|---|---|
| T1 | Theme = **Akromatik Tinta** (`theme.css` 2026-11-18) — diterapkan penuh. | Final, **sudah diterapkan** |
| T2 | Skin shadcn/zinc (oklch) prototype **tidak** dipindah apa adanya; nilainya diterjemahkan ke token repo (putih/abu/tinta). | Final |
| T3 | `DESIGNV2.md` (dusty-rose/Montserrat) **bukan** target — digantikan `DESIGN.md`. | Final, abaikan |
| IA1 | `/` = **onboarding first-launch**, lalu home = **Beranda tenant**; katalog di `/katalog`. | Final, **sudah diterapkan** |
| IA2 | `/admin` di belakang `/login`; **tidak ada** dashboard tenant bergaya konsol staf. Beranda = ringkasan kerja tenant, bukan konsol. | Final |
| IA3 | Logika domain (harga, status, PPN, prorata, identifikasi) = repo, bukan mock. | Final |
| W2 | Nada stempel = **7 nada** (opsi B): wait biru, rev amber, ok hijau, siap teal, pasang ungu, done netral, no merah — semuanya terukur AA. | Final, **sudah diterapkan** |

---

## 2. Non-goal (yang TIDAK boleh dikerjakan)

1. **Jangan** hardcode data prototype: harga (`Rp 70.000`, `Rp 10.000.000/30 hari`,
   `Gratis`), jumlah media (`"14 media"`), PPN, dsb. Sumber data = API + `constants` + `utils/pricing.ts`.
2. **Jangan** bangun ulang layar yang sudah ada (katalog, wizard, riwayat, detail, lacak, login, admin) —
   paritas visual lewat token/kelas, bukan tulis ulang.
3. **Jangan** tambah dark mode (DESIGN.md §Mode Gelap: tidak ada).
4. **Jangan** menaruh tab `Admin` di navigasi tenant.

---

## 3. Work item

> **Catatan 2026-11-18:** bagian ini adalah **sejarah brief** (rencana awal).
> Arah final sudah dieksekusi dan didokumentasikan di
> `docs/PLAN_2026-11-18_08-59.md`: home = **Beranda tenant** (bukan katalog),
> katalog di `/katalog`, dan tema akromatik (bukan Rausch). Bacaan di bawah
> yang menyebut "home = katalog" / `PromoLandingPage` adalah rencana lama.

### W1 — Onboarding gate (sudah dibangun)

**Kondisi awal:** `src/App.tsx` mengarahkan `/` langsung ke
`<PromoLandingPage />`. Belum ada onboarding.

**Target (final):** kunjungan pertama ke `/` menampilkan onboarding; setelah
selesai, flag disimpan dan home = **`BerandaPage`** (`/katalog` tetap katalog).

#### 3.1 Konstanta kunci

Pakai satu kunci localStorage konsisten dengan prototype (`onboarding.html:218`):

```ts
export const ONBOARDING_KEY = 'mmb-onboarded';
```

Letakkan di `src/constants/promo.ts` (dekat konstanta lain) atau modul kecil
`src/constants/onboarding.ts`. Ambang akses lokal harus dibungkus `try/catch`
(incognito yang memblokir `localStorage`), meniru pola `fingerprint.ts`.

#### 3.2 Komponen baru: `src/components/promo/OnboardingPage.tsx`

Fidelity prototype (`onboarding.html`):

- **Brand bar:** badge `MMB` (pakai `AppShell` + `hideTabBar` agar tanpa tab bar).
- **Hero:** `h1` "Pengajuan materi promosi Metropolitan Mall Bekasi" + subjudul
  "Pilih media, isi kampanye dan periode tayang, unggah berkas, lalu pantau
  statusnya sampai terpasang."
- **Cara mengajukan** — 3 langkah statis (teks boleh hardcode; bukan data):
  1. Pilih media — katalog + tarif deck.
  2. Isi kampanye & periode — perkiraan biaya otomatis.
  3. Unggah berkas — sebelum masuk antrean review.
- **Alur status** — render dari `STATUS_ORDER` + `STATUS_LABELS` + komponen
  `Stamp` (JANGAN tulis HTML/teks status sendiri; sumbernya `constants/promo.ts`).
  Urutan mengikuti `STATUS_ORDER` repo (bukan urutan ulang prototype).
- **CTA** `Buka Beranda` — tombol `.ui-btn-primary`, min-height 44px, memanggil
  `onFinish()`.

> **PENTING — sumber data.** Bagian "Media & tarif" prototype berisi harga
> hardcode. JANGAN disalin. Opsional: tampilkan teaser katalog dengan
> `fetchMediaTypes()` + `MediaPriceTag` (data hidup), atau lewati sama sekali.
> Klaim PPN prototype ("videotron sudah termasuk PPN") wajib diverifikasi ke
> `utils/pricing.ts` sebelum dicantumkan — bila ragu, lewati.

#### 3.3 Gate di `src/App.tsx`

Ganti rute `/` (baris 55) dengan gate yang memiliki state sendiri (menghindari
masalah `navigate` ke path yang sama):

```tsx
import OnboardingPage from './components/promo/OnboardingPage';
import { ONBOARDING_KEY } from './constants/onboarding';

function isOnboarded(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === '1'; }
  catch { return true; }
}

function HomeGate() {
  const [onboarded, setOnboarded] = useState(() => isOnboarded());
  if (!onboarded) {
    return <OnboardingPage onFinish={() => {
      try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
      setOnboarded(true);
    }} />;
  }
  return <PromoLandingPage />;
}
```

Lalu `<Route path="/" element={<HomeGate />} />`. `PromoLandingPage` tetap
lazy; `OnboardingPage` juga lazy (`lazy(() => import(...))`) agar tidak
membengkakkan bundel awal — pola bundle-splitting yang sama seperti rute lain.

> `OnboardingPage` boleh dipakai di luar `AppShell` (layar penuh sendiri) atau
> di dalam `AppShell hideTabBar`. Pilih yang konsisten dengan `onboarding.html`
> (tanpa tab bar). Uji `useDocumentTitle` (judul dokumen "Selamat Datang" atau
> nama produk).

#### 3.4 Test (sudah ada)

`src/components/promo/__tests__/OnboardingPage.test.tsx` mengunci:

- `localStorage` kosong → render onboarding.
- klik `Buka Beranda` → set `mmb-onboarded=1` + render **`BerandaPage`**
  (heading "Selamat datang").
- `localStorage` sudah `1` → langsung beranda.
- `localStorage` dilempar (mock) → fallback ke beranda (tidak crash).

---

### W2 — Nada status `Stamp` (keputusan, lalu eksekusi 1 baris)

**Kondisi sekarang:** `src/components/promo/Stamp.tsx:16-25`.

`TONE_BY_STATUS` memetakan `siap_dipasang`, `sudah_dipasang`, `selesai` → `'ok'`
(hijau), sedangkan komentar header-nya menyatakan **"disetujui hijau, perlu
revisi amber, ditolak merah, sisanya tinta"**. Ada inkonsistensi antara maksud
dan kode. `DESIGN.md` §Warna juga mendokumentasikan hanya 4 keadaan (Menunggu,
Disetujui, Perlu revisi, Ditolak), semua terukur AA.

Prototype `onboarding.html` justru mengusulkan **7 warna** (menambah `siap`
teal, `pasang` ungu, `done` netral).

**Pilih satu (konfirmasi ke user — mengubah apa yang tenant lihat):**

| Opsi | Isi | Implikasi |
|---|---|---|
| **A (rekomendasi)** | Sejajarkan kode ke maksud: `siap_dipasang`/`sudah_dipasang`/`selesai` → `'wait'` (tinta). Hanya `disetujui` hijau. | Konsisten `DESIGN.md` + komentar. Tanpa token baru. |
| B (prototype) | Tambah 3 pasang token `--stamp-siap/pasang/done` + perluas union tone. | Lebih berwarna, tapi menentang "akromatik kecuali keadaan pekerjaan" dan butuh ukur AA untuk 3 pasang baru. |
| C (status quo) | Biarkan 4 hijau. | Tanpa kerja, tapi komentar header berbohong. |

**Eksekusi Opsi A** (1 perubahan):

```ts
const TONE_BY_STATUS: Record<string, 'ok' | 'rev' | 'no' | 'wait'> = {
  draft: 'wait',
  menunggu_review: 'wait',
  perlu_revisi: 'rev',
  disetujui: 'ok',
  ditolak: 'no',
  siap_dipasang: 'wait',
  sudah_dipasang: 'wait',
  selesai: 'wait',
};
```

Bila user memilih B, token baru wajib diukur kontras (≥4,5:1 teks/latar) dan
`DESIGN.md` §Warna diperbarui.

**Keputusan: B (prototype).** `wait` diubah dari abu (`#545454`) ke biru
(`#00579a`) supaya "Menunggu Review" tidak tabrakan dengan "Selesai"; `siap`
teal (`#006871`), `pasang` ungu (`#5740a1`), `done` netral (`#6a6a6a`). Tujuh
pasangan terukur AA (4,83–6,94) dan `DESIGN.md` §Warna diperbarui.

---

### W3 — Parity spot-check (tanpa rebuild)

Layar repo sudah lengkap + ARIA (`aria-invalid`, `aria-describedby`,
`role="alert"` tersebar di wizard, admin, status). Verifikasi saja terhadap
prototype, **bukan** implement ulang:

| Prototype | Rute repo | Komponen | Cek |
|---|---|---|---|
| `beranda.html` | `/` | `PromoLandingPage.tsx` | kategori deck outdoor/indoor/social, blok kontak TR/Marcom, baris→kartu ≥640px |
| `katalog.html` | `/` | (sama) | harga angka terbesar di baris, ketentuan buka-tutup |
| `ajukan.html` | `/ajukan`, `/ajukan-cetak` | `PromoUploadWizard` / `PromoCetakWizard` | validasi + ARIA, prorata dari `utils/pricing` |
| `riwayat.html` | `/riwayat` | `MySubmissionsPage.tsx` | daftar + batch + paginasi |
| `detail.html` | `/status/:token` | `SubmissionStatusPage` / `SubmissionDetail` | timeline, stempel, proof |
| `login.html` | `/login` | `AdminLoginPage.tsx` | Turnstile, error `role="alert"` |
| `admin.html` / `dashboard.html` | `/admin` | `AdminDashboardPage.tsx` | 4 tab, review notes wajib, status tone |

Temuan parity (bila ada) ditulis sebagai issue terpisah, bukan kerja inline.

---

## 4. Verifikasi

```bash
npm test          # vitest run — termasuk OnboardingPage.test.tsx baru
npm run build     # tsc && vite build — pastikan tidak ada error tipe
```

Tidak ada script `lint`; typecheck ditanggung `tsc` dalam `build`.

---

## 5. Risiko & rollback

| Risiko | Mitigasi / rollback |
|---|---|
| Onboarding mengunci pengguna (flag gagal set) | `isOnboarded()` fallback `true` saat `localStorage` diblokir; tombol selalu jalan. |
| Nada status berubah tampilan tenant | Opsi A hanya menyusutkan 3 status ke tinta; rollback = kembalikan `TONE_BY_STATUS` lama. |
| Teaser media hardcode bocor harga salah | Jangan hardcode; gunakan API/`MediaPriceTag`, atau lewati. |
| `mmb-onboarded` bentrok dengan kunci lain | Grep konfirmasi: tidak ada `mmb-onboard` lain di `src` (hanya `metmal_device_fp`). |

---

## 6. Ringkasan kerja minimum

1. Tambah `ONBOARDING_KEY` + `OnboardingPage.tsx` + gate di `App.tsx` (W1).
2. Konfirmasi + terapkan keputusan nada status (W2).
3. Jalankan `npm test` + `npm run build` (verifikasi).
4. Spot-check parity (W3), catat temuan terpisah bila ada.
