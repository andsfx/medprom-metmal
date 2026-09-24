---
version: 1
slug: "src-components-promo-promolandingpage-tsx"
primary_target: "src/components/promo/PromoLandingPage.tsx"
related_targets: []
---

# Surface brief — seluruh produk Medprom Metmal

Mode: **Operate** (portal kerja: tenant menyelesaikan pengajuan, staf memproses).

## Scope

Seluruh permukaan produk: landing/katalog `/`, wizard materi digital `/ajukan`,
form media cetak `/ajukan-cetak`, halaman status `/status/:token`, status batch
`/batch/:token`, pelacakan `/lacak`, riwayat `/riwayat`, login `/login`, dan
konsol staf `/admin`.

## Audience, job, action

- **Tenant (publik, tanpa login):** memilih media dari katalog deck, mengajukan,
  lalu memantau status. Berhasil = pengajuan terkirim dengan nomor yang dapat
  dilacak, tanpa tersesat soal ukuran/format/lead time.
- **Staf TR/Marcom (login):** memindai banyak pengajuan, memutuskan, mencatat
  pemasangan. Berhasil = keputusan berikutnya diambil dalam hitungan detik.

## Proof / content

Katalog 14 media dari deck resmi 2026 (ukuran, material, format, tarif,
ketentuan, foto asli di `public/media/`). Nomor pengajuan `MP-YYMMDD-XXXXXX`,
nomor batch `MPB-YYMMDD-XXXXXX`. Harga dihitung server dengan PPN 11%.

## Constraints

Bahasa Indonesia. Cermin FE-BE yang dikunci test tidak boleh berubah
(`pricing`, `leadTime`, `statusFlow`, `MAX_BATCH_ITEMS`). Tanpa dependensi baru.
Alur status 8 tahap. Semua alur & test yang ada harus tetap lulus.

## Direction contract

**THESIS.** Medprom adalah **berkas pekerjaan**, bukan katalog pemasaran. Dunia
visualnya: lembar spesifikasi teknis dan tiket pekerjaan percetakan. Yang
ditolak: bahasa "SaaS katalog" (kartu bulat berbayang, eyebrow kecil di atas
judul, angka besar sebagai hiasan) dan bahasa signage mall (panel arah, pip
level) — keduanya sudah dipakai atau dipertimbangkan dan tidak dipilih.

**OWN-WORLD.** Kertas kerja `#f2f2ef` dengan lembar `#fbfbf9` bertepi 1px;
tinta `#101010`; process blue `#1440d6` sebagai satu-satunya warna aksi;
merah stempel `#b3261e` untuk penolakan/revisi, hijau `#0d6b3f` untuk
persetujuan, amber `#a15c00` untuk keadaan menunggu. Perabot yang mengenali
dunia ini tanpa satu kata pun: tanda potong di sudut lembar, nomor plate,
garis dimensi berpanah, tabel dengan titik penghubung, nomor job monospace,
stempel status, tepi perforasi pada tiket. Tanpa sudut membulat besar: radius
2–3px. Tanpa bayangan: kedalaman dari garis dan kertas, bukan blur.

**STORY.** Pengunjung paham tiga hal dalam satu viewport: ini portal resmi mall,
katalognya 14 media yang ketentuannya ditetapkan deck, dan langkah berikutnya
jelas. Staf paham bahwa daftar ini adalah antrean pekerjaan, bukan feed.

**FIRST VIEWPORT.** Lembar penuh dengan tanda potong di empat sudut dan
"PLATE 01 / 14" di kanan atas. Di dalamnya: judul besar di kiri, satu garis
dimensi di bawahnya yang mengukur "14 media — 13 aktif", paragraf pengantar
yang mengutip deck sebagai sumber, dan tiga aksi (proses blue solid, garis
tinta, garis tinta). Nol eyebrow, nol badge, nol gambar di viewport pertama:
yang menjual adalah ketepatan, bukan foto.

**FORM.** Lembar spesifikasi = katalog (setiap media satu lembar spesifikasi
dengan garis dimensi pada fotonya dan tabel titik penghubung). Tiket pekerjaan
= setiap pengajuan (nomor job, stempel status, blok subtotal/PPN/total, tepi
perforasi). Wizard = mengisi satu lembar, tiga bagian bernomor, dengan pip
bagian di atas. Konsol staf = meja kerja: daftar antrean padat, sel angka
tabular, filter sebagai baris kontrol.

**SIGNATURE.** Tiket pekerjaan: satu kartu yang menggabungkan nomor job,
stempel status, dan perhitungan biaya dalam satu dokumen yang bisa dipindai
dalam sekali lihat.

Seed key: `bf6dc38c` (kind: pick — Lembar Spesifikasi & Tiket Pekerjaan).

## Unresolved

- Logo resmi format vektor belum ada; wordmark tetap tipografis.
- Mode gelap: belum diputuskan untuk dunia ini (kertas gelap = "meja malam").
