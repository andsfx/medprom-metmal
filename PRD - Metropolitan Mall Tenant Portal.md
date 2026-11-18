web application/stitch/projects/9908852065336016669/screens/1d3c55a38b014fc78ac022b6b8cd1cd1
# Product Requirement Document (PRD): Portal Media Promosi Tenant Metropolitan Mall Bekasi (MetMal)

**Dokumen Versi:** 1.0  
**Status:** Approved / Design Baseline  
**Target Rilis:** Siklus Operasional 2026  
**Target Platform:** Mobile Web & Responsive Web App (Tenant Portal)  
**Stakeholder Utama:** Divisi Tenant Relations & Marketing Mall, Tenant Operasional MetMal, Vendor Reklame & Produksi  

---

## 1. Executive Summary & Latar Belakang

Metropolitan Mall Bekasi (MetMal) menaungi ratusan tenant ritel, F&B, dan layanan komersial. Sebelumnya, alur koordinasi pengajuan media promosi (spanduk koridor luar, baliho jalan boulevard, videotron atrium dalam mall, hingga banner etalase toko) dilakukan secara semi-manual melalui formulir cetak, email, dan percakapan chat. Hal ini memicu beberapa kendala operasional:
1. **Inefisiensi Koordinasi**: Tenant tidak memiliki visibilitas *real-time* terkait slot tayang kosong, antrean booking, maupun kepastian SLA verifikasi.
2. **Keterlambatan Produksi & Kepatuhan Regulasi**: Kerap terjadi kesalahan teknis file (resolusi rendah, warna RGB non-cetak, tidak mematuhi safe zone regulasi reklame Bapenda Pemkot Bekasi).
3. **Pelacakan Tiket Tersebar**: Tenant kesulitan memantau tahapan verifikasi berkas izin tayang atau penanganan revisi konten.

**Solusi**: Membangun portal terpusat (*MetMal Tenant Media Promosi*) berbasis mobile-first yang memfasilitasi penelusuran katalog media resmi, pengajuan mandiri dengan validasi teknis otomatis, pelacakan tiket verifikasi bertahap, dan akses unduhan aset guideline mall.

---

## 2. Sasaran & Key Performance Indicators (KPI)

* **Efisiensi Waktu Pengajuan**: Memangkas siklus pengajuan dari rata-rata 3–5 hari kerja menjadi maksimal 1×24 jam (SLA Tenant Relations).
* **Penurunan Angka Penolakan / Revisi Teknis**: Menurunkan tingkat revisi materi grafis sebesar 60% melalui penyediaan template resmi (`.PSD`, `.AI`, `.MOGRT`) dan validasi profil warna saat upload.
* **Transparansi Hak Sewa Tenant**: Pemanfaatan kuota gratis (fasilitas hak kontrak toko seperti *Roll Banner Storefront*) termonitor 100% tanpa tumpang tindih area demarkasi.
* **User Adoption**: 95%+ tenant aktif mengelola perizinan dan booking slot promosi secara mandiri melalui portal.

---

## 3. Profil Pengguna (User Persona)

### Persona 1: Tim Marketing / Store Manager Tenant (e.g., H&M, Uniqlo, FnB Brands)
* **Kebutuhan**: Melihat slot promosi yang tersedia, mengetahui tarif sewa resmi, mengunggah materi visual promosi tepat waktu, dan mengetahui status persetujuan secara cepat.
* **Pain Point**: Tidak tahu spesifikasi teknis resolusi billboard/videotron dan sering terlambat mendapat izin tayang dari manajemen mall.

### Persona 2: Kurator & Tim Compliance Tenant Relations (TR MetMal)
* **Kebutuhan**: Memeriksa kesesuaian materi promosi terhadap SOP Mall (bebas unsur SARA/politik, safe zone logo, kontras visual) dan menerbitkan Surat Perjanjian Kerja (SPK) izin tayang.
* **Pain Point**: Menerima file desain yang salah format atau komplain antrean slot dari tenant.

---

## 4. Arsitektur Informasi & Pemetaan Alur Pengguna (User Journey)

Alur pengguna dirancang dengan navigasi global persisten 4-Tab:
1. **Tab 1: Katalog** (`Katalog Resmi 2026`)
   - Header & profil tenant terautentikasi.
   - Ringkasan statistik cepat: Total media (13), Hak Kuota Gratis (5•), Minimal sewa (7 hari).
   - Pengelompokan kategori: *Semua*, *Outdoor*, *Indoor Atrium*, *Digital LED*, *Hak Tenant*.
   - Detail kartu media: Feed visual foto nyata lokasi, estimasi traffic harian, indikator sisa slot, spesifikasi teknis, harga sewa transparan, dan tombol CTA langsung (*Ajukan Materi / Booking Antrean / Klaim Kuota*).
2. **Tab 2: Formulir Pengajuan** (`3-Step Stepper Flow`)
   - **Step 1**: Pemilihan Titik Media (Spanduk, Baliho, Videotron, Roll Banner).
   - **Step 2**: Penentuan Jadwal & Durasi Masa Tayang.
   - **Step 3**: Unggah Dokumen Artwork & Konfigurasi Produksi:
     - Area drag-and-drop file (kapasitas maks. 150MB).
     - Validasi file otomatis (Color Space: CMYK Fogra39 / Rec.709, Rasio Dimensi, Resolusi 300 DPI).
     - Pilihan fasilitas vendor: Cetak mandiri vs Fasilitas Rekanan Mall (+biaya cetak resmi).
     - Catatan spesifik penempatan & finishing (jarak mata ayam, finishing outdoor).
     - Deklarasi persetujuan kepatuhan regulasi Bapenda & safe zone logo MetMal.
     - Estimasi total biaya (*Billing Tenant*) dan tombol *Simpan Draf* serta *Kirim Pengajuan*.
3. **Tab 3: Pelacakan Tiket** (`Tracking Status & Compliance TR`)
   - Filter status: *Semua*, *Dalam Review (1)*, *Disetujui (1)*, *Perlu Revisi (1)*.
   - Kartu Aktif Berjalan (Status Stepper Vertikal):
     - Step 1: *Pengajuan Terkirim* (Stempel waktu).
     - Step 2: *Review Teknis & Compliance Mall* (Penanggung jawab kurator/TR, estimasi selesai).
     - Step 3: *Penerbitan Izin Tayang & Rekanan* (Penerbitan SPK operasional).
     - Step 4: *Materi Tayang di Titik Lokasi*.
   - Quick Action: *Lihat File Berkas* dan *Chat Tim TR via WhatsApp*.
   - Modul Revisi Terpadu: Penjelasan catatan kurasi mall yang jelas dengan CTA *Unggah Ulang Revisi Materi*.
4. **Tab 4: Riwayat & Arsip**
   - Riwayat pengajuan periode sebelumnya, bukti tayang, dan dokumen persetujuan/SPK yang dapat diunduh ulang.
5. **Aksesori Modal / Bottom Sheet**:
   - Lembar *Unduh Template & Panduan Teknis* interaktif: Paket asset siap pakai (.PSD, .AI, .MOGRT, PDF Regulasi 2026).

---

## 5. Kebutuhan Fungsional & Spesifikasi Teknis

| ID | Fitur | Deskripsi Spesifikasi |
|---|---|---|
| **FR-01** | **Autentikasi Tenant** | Integrasi akun terdaftar unit toko MetMal (misal: "GF Unit 12-14 - H&M Indonesia"). |
| **FR-02** | **Katalog Slot Real-time** | Menampilkan ketersediaan slot (misal: "Slot 2 / 5") dan status antrean ("Antrean H-7" / "Tersedia"). |
| **FR-03** | **Pre-Flight Validasi Berkas** | Pengecekan otomatis metadata file unggahan: CMYK Fogra39 untuk cetak flexi, format H.264 1080p MP4 untuk videotron, limit file 150MB. |
| **FR-04** | **Perhitungan Biaya Otomatis** | Menghitung durasi tayang × tarif sewa + opsi tambahan vendor cetak rekanan secara instan ke dalam *Tenant Billing*. |
| **FR-05** | **Sistem Tiketing & SLA** | Penomoran tiket unik (`#TKT-YYYY-XXXX`), SLA penghitung mundur 1×24 jam, serta integrasi eskalasi WhatsApp Tenant Relations. |
| **FR-06** | **Manajemen Kuota Hak Tenant** | Validasi kuota sewa gratis (maks. 1 unit roll banner per storefront aktif) sesuai kontrak sewa unit mall. |

---

## 6. Fondasi Desain & Brand Identity

* **Design System**: *Metropolitan Mall Tenant Portal (Design System)*
* **Palet Warna Utama**:
  - Warna Primer / Aksen Brand: Burgundy / Crimson Red (`#b9586c`) mencerminkan estetika elegan MetMal.
  - Warna Latar & Kontainer: Neutral Warm Off-White (`#fbf9f9`, `#f5f3f3`, `#ffffff`).
  - Status Indicators: Amber/Oranye untuk *Dalam Verifikasi*, Hijau untuk *Disetujui*, Rose/Merah untuk *Perlu Revisi*.
* **Tipografi**:
  - Pilihan Primer: **Montserrat / Plus Jakarta Sans** untuk kejernihan hierarki, legibilitas tabular, dan kenyamanan visual di layar mobile.
  - Alternatif Branding: Varian Display Editorial untuk citra premium ritel modern.
* **Komponen & Pola Interaksi**:
  - Mobile bottom navigation bar tetap (*sticky footer*).
  - Floating status pills & horizontal filter scroll.
  - Card-based layout dengan visual bleed 100% pada banner feed.

---

## 7. Roadmap Pelaksanaan & Rencana Rilis

1. **Sprint 1 (Fondasi & Desain UI/UX)**: Finalisasi prototipe 4 layar inti (Katalog Feed, Form 3-Step, Tracker Tiket, Bottom Sheet Template). *(Selesai di Canvas)*
2. **Sprint 2 (Integrasi File Uploader & Validasi Client-side)**: Implementasi library inspeksi dimensi gambar, profil warna, dan chunk upload 150MB.
3. **Sprint 3 (Backend Portal TR & Notifikasi)**: Pembangunan dashboard kurasi internal untuk tim Tenant Relations, integrasi notifikasi push & webhook WhatsApp.
4. **Sprint 4 (UAT & Rollout Tenant)**: Uji coba perizinan promosi bersama perwakilan tenant utama Mall, sosialisasi katalog revisi 2026.
