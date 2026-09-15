# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
penomoran versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

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
