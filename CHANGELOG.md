# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
penomoran versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

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
- Unggah file langsung dari browser ke Cloudflare R2 memakai presigned URL,
  mendukung JPEG, PNG, PDF, dan MP4 hingga 50MB.
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
- `file_url` wajib berada di prefix bucket sendiri, sehingga file dari luar
  tidak bisa diklaim.
- Pemeriksaan `HEAD` untuk memastikan objek benar-benar ada dan memverifikasi
  ulang ukuran setelah unggahan selesai.
- Pemeriksaan signature byte terhadap tipe file yang diklaim. Objek yang tidak
  cocok langsung dihapus dari R2.
- Penghapusan pengajuan menghapus objek R2 lebih dulu dan berhenti aman bila
  gagal, sehingga baris data tetap ada dan proses dapat diulang. Pengajuan
  bertautan dilewati karena tidak memiliki objek di penyimpanan.

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
