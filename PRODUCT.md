# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Tenant Metropolitan Mall Bekasi (utama, publik tanpa login).** Pemilik gerai
yang ingin memasang materi promosi di area mall. Mereka bekerja cepat dari
ponsel, sering di sela jam operasional gerai, dan tidak selalu paham istilah
teknis media (ukuran, substrat, lead time). Sebagian sudah punya akun tenant di
sistem mall; sebagian **bukan tenant** (mis. penyelenggara acara) tetapi tetap
boleh mengajukan media cetak.

**Staf Tenant Relations / Marcom (login).** Tim mall yang menerima, menilai,
meminta revisi, menyetujui, dan mencatat pemasangan materi. Tiga tingkat akses:
`superadmin` (semua), `admin` (proses + katalog, tanpa kelola akun),
`tenant_relation` (lihat saja). Bekerja harian di dashboard dan sering memindai
banyak pengajuan sekaligus.

## Product Purpose

Satu tempat bagi tenant untuk mengajukan materi media promosi (cetak maupun
digital) dan bagi tim mall untuk memprosesnya, sehingga permintaan yang dulu
lewat WhatsApp/email kini punya katalog resmi, nomor pengajuan, status yang
dapat dilacak, dan riwayat yang tidak hilang.

## Positioning

Katalog media dan seluruh ketentuannya (ukuran, material, harga, format, lead
time) bersumber dari deck resmi "MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026",
dan platform **menegakkan** ketentuan itu di server, bukan sekadar
menampilkannya. Pengajuan media cetak dapat berisi beberapa media sekaligus
dalam satu kirim (satu nomor batch), terbuka untuk tenant maupun non-tenant,
dan materinya menyusul lewat alur revisi.

## Operating Context

- Tenant mengajukan dari ponsel; alur harus masuk akal tanpa chrome browser
  (PWA yang dapat dipasang, `display: standalone`).
- Materi besar dikirim sebagai tautan (Drive/Dropbox/WeTransfer) atau diunggah
  (maks 50MB) ke Drive mall.
- Tim TR/Marcom memproses di desktop; alur status 8 tahap PRD.
- Pengingat periode berakhir adalah query turunan di dashboard (tanpa email,
  tanpa cron); tindak lanjut lewat WhatsApp.
- Bahasa Indonesia untuk seluruh UI, pesan error, dan komentar.

## Capabilities and Constraints

- 14 media (13 aktif; `vertical-banner` nonaktif). Kanal `cetak` (spanduk, big
  banner, umbul-umbul) memakai form khusus; sisanya kanal `digital`.
- Media cetak: minimal sewa 7 hari, PPN 11% efektif, harga dihitung server.
- Alur status: Menunggu Review, Perlu Revisi, Disetujui, Ditolak, Siap
  Dipasang, Sudah Dipasang, Selesai. Transisi ditegakkan server.
- Tanpa akun tenant: akses status lewat token atau nomor pengajuan (digerbangi
  captcha Turnstile); riwayat terikat fingerprint perangkat.
- Tanpa dependensi baru tanpa persetujuan; tanpa Redux/React Query/Context.
- Cermin FE-BE dikunci test (lead time, status flow, pricing, batas batch).

## Brand Commitments

- Nama: **Metropolitan Mall Bekasi** (sebutan internal "Metmal").
- Bahasa Indonesia sebagai bahasa produk.
- Katalog dan ketentuan bersumber dari deck resmi 2026; jangan mengarang
  kebijakan yang tidak dinyatakan deck.
- Identitas visual lama **tidak** mengikat. Pemilik meminta penggantian total
  dunia visual (keputusan sesi 2026-09-24). Warna, tipografi, dan sistem
  permukaan lama diperlakukan sebagai bukti, bukan acuan.

## Evidence on Hand

- Deck "MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026" (13 slide) sebagai sumber
  katalog; foto contoh media diekspor dari deck dan dipakai di kartu katalog.
- 14 foto media di `public/media/`.
- Data produksi nyata: katalog 14 media, 3 akun staf.
- **Belum ada:** logo resmi format vektor (hanya ikon PWA), foto suasana mall,
  dan materi brand lain. Jangan mengarang klaim komersial (harga di luar deck,
  jumlah tenant, testimoni).

## Product Principles

1. **Ketentuan deck adalah kebenaran.** Setiap angka dan aturan dapat
   ditelusuri ke deck atau ke kebijakan operasional yang dinyatakan.
2. **Server yang memutuskan.** Validasi, harga, lead time, dan transisi status
   ditegakkan di server; UI hanya mencerminkan.
3. **Tenant tidak boleh tersesat.** Setiap kirim menghasilkan nomor dan status
   yang dapat dilacak tanpa akun, dari perangkat mana pun.
4. **Staf harus cepat.** Dashboard dioptimalkan untuk memindai dan memutuskan
   banyak pengajuan, bukan untuk kesan visual.
5. **Materi menyusul itu normal.** Alur cetak memang tidak meminta berkas di
   awal; sistem harus jujur tentang keadaan "materi belum diterima".

## Accessibility & Inclusion

- Target sentuh minimum 44px; kontras teks kecil memenuhi AA.
- Alur publik harus berfungsi tanpa login dan tanpa pemasangan dari app store.
- PWA standalone: tidak ada layar yang bergantung pada tombol back peramban.
