# Medprom Metmal — Platform Media Promosi Tenant

Platform pengajuan materi media promosi untuk tenant **Metropolitan Mall
Bekasi**. Tenant mengisi form pengajuan materi promosi, tim **Tenant
Relations** mengecek dan memproses materi promosinya.

Katalog media beserta ukuran, material, harga, dan ketentuannya bersumber dari
deck *"MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026"*: 14 jenis media, 13 di
antaranya aktif (Parapet belum tersedia).

## Kemampuan

### Sisi tenant — publik, tanpa login

- Katalog media per kategori Outdoor, Indoor, dan Media Sosial, memuat ukuran,
  material, harga, serta ketentuan pemasangan tiap media.
- Form pengajuan tiga tahap: pilih media, isi data tenant dan PIC, kirim
  materi.
- Nama tenant dipilih dari API tenant. Bila API tidak tersedia, form beralih ke
  isian nama manual.
- Dua cara mengirim materi:
  - **Unggah file** — file dikirim langsung dari browser ke penyimpanan objek,
    lalu diverifikasi server.
  - **Kirim tautan** — Google Drive, Dropbox, atau WeTransfer untuk materi
    berukuran besar maupun folder berisi banyak file. Tidak ada file yang
    tersimpan di server.
- Nomor tiket setelah pengajuan terkirim, plus halaman Riwayat yang menampilkan
  status dan catatan tim tanpa perlu akun.

### Sisi staf — perlu login

- Daftar pengajuan dengan filter status, paginasi, dan detail per pengajuan.
- Penetapan status: Menunggu, Disetujui, Ditolak, atau Terpasang, disertai
  catatan yang langsung terlihat oleh tenant.
- Pengelolaan katalog media: harga, ukuran, ketentuan, dan status aktif.
- Ekspor CSV siap dibuka di Excel.
- Pengelolaan akun staf.

### Hak akses

| Role | Lihat pengajuan | Proses & katalog | Kelola akun |
|---|---|---|---|
| `superadmin` | Ya | Ya | Ya |
| `admin` | Ya | Ya | Tidak |
| `tenant_relation` | Ya | Tidak | Tidak |

## Arsitektur

```mermaid
flowchart LR
  T[Tenant / Browser] -->|HTTPS| V["Frontend — Vercel<br/>React 19 + Vite"]
  V -->|"REST /api/v1"| A["API — VPS<br/>Express 4"]
  T -->|"PUT presigned URL"| R[("Cloudflare R2")]
  A --> P[("Postgres 16")]
  A -->|"presign / HEAD / delete"| R
  A -->|"lookup tenant"| M["API tenant"]
```

- Frontend berjalan di Vercel sebagai SPA; seluruh path di-rewrite ke
  `index.html`.
- API dan Postgres berjalan di VPS melalui Docker Compose, diproksi Caddy ke
  `127.0.0.1:3002`.
- File materi disimpan di Cloudflare R2. Unggahan memakai presigned URL
  sehingga file berukuran besar tidak melewati API.
- Sesi staf memakai JWT pada cookie lintas origin (`SameSite=None; Secure`).

### Validasi pengajuan

Untuk mode unggah, server memeriksa berurutan:

1. Batas 10 pengajuan per jam per IP.
2. Kelengkapan field, format nomor telepon, dan format tanggal.
3. Jenis media harus terdaftar dan berstatus aktif.
4. `file_url` harus berada di prefix bucket sendiri, sehingga file dari luar
   tidak bisa diklaim.
5. Permintaan `HEAD` ke objek untuk memastikan file benar-benar ada dan
   memeriksa ulang ukurannya (maksimal 50MB), karena ukuran yang dikirim klien
   tidak ditandatangani.
6. Kecocokan signature byte dengan tipe file yang diklaim. Bila tidak cocok,
   objek langsung dihapus dari R2.
7. Batas 5 pengajuan per perangkat dalam 24 jam.

Mode tautan melewati langkah 4 sampai 6 karena tidak ada objek milik sendiri
yang perlu diperiksa, dan hanya menerima URL berskema `http` atau `https`.

## Struktur

```
src/                      Frontend React (Vite + Tailwind v4)
  components/promo/       Katalog, form pengajuan, riwayat, pemilih tenant
  components/admin/       Login dan dashboard staf
  utils/                  promoApi, adminApi, fingerprint
  lib/rest.ts             Klien REST
server/
  schema.sql              Skema database
  src/routes/             promo (publik), admin (staf), auth
  src/r2.js               Presign, HEAD, delete, verifikasi signature byte
  src/auth.js             JWT, bcrypt, kontrol role
  scripts/                seed-media-types, create-admin
scripts/                  db-migrate, verifikasi produksi (Playwright)
__tests__/api/            Test route server
deploy/vps/               docker-compose, .env.example, panduan deploy
```

## Menjalankan di lokal

Prasyarat: Node 20 atau lebih baru, Postgres 16, dan bucket R2 bila ingin
menguji unggahan file.

```bash
npm ci
cp .env.example .env          # isi DATABASE_URL, JWT_SECRET, R2_*
npm run db:migrate            # buat atau perbarui skema
npm run db:seed               # isi katalog media

# Akun staf pertama
ADMIN_PASSWORD='Password-Kuat' node server/scripts/create-admin.mjs \
  admin@metmal.co.id '' 'Admin Medprom'

npm run dev:api               # API      → http://localhost:3001
npm run dev                   # Frontend → http://localhost:5173
```

`db:migrate` dan `db:seed` aman dijalankan berulang. Seed hanya menyelaraskan
daftar format yang diterima; harga dan ketentuan hasil penyuntingan admin tidak
ditimpa.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan frontend mode pengembangan |
| `npm run dev:api` | Menjalankan API dengan reload otomatis |
| `npm test` | Menjalankan test route server dan komponen |
| `npm run build` | Type check dan build produksi |
| `npm run db:migrate` | Menerapkan `server/schema.sql` |
| `npm run db:seed` | Mengisi dan menyelaraskan katalog media |

Verifikasi produksi lewat browser sungguhan, membutuhkan `VERIFY_PASSWORD`:

```bash
node scripts/verify-e2e.mjs            # katalog → form → dashboard → riwayat
node scripts/verify-tenant-upload.mjs  # unggah file nyata hingga muncul di dashboard
node scripts/verify-admin-flow.mjs     # penetapan status staf hingga terlihat tenant
```

## Format materi

Format yang diterima diatur per jenis media pada kolom `accepted_formats`, dan
dipakai baik oleh pemilih file di frontend maupun daftar izin MIME di server.

| Kelompok media | Format |
|---|---|
| Cetak: spanduk, big banner, umbul-umbul, boom gate, sticker, vertical banner | JPEG, PNG, PDF |
| LED Banner, Digital Poster | JPEG, PNG |
| Videotron, Integrasia, Media Sosial | JPEG, PNG, MP4 |

Batas unggahan 50MB. Untuk materi yang lebih besar, gunakan mode kirim tautan.

## Deploy

Langkah lengkap Docker Compose, migrasi, seed, konfigurasi Caddy, dan deploy
Vercel ada di [`deploy/vps/README-DEPLOY.md`](deploy/vps/README-DEPLOY.md).

## Lisensi

Proprietary — penggunaan internal Metropolitan Mall Bekasi.
