/**
 * seed-media-types.mjs: seed katalog media promosi dari deck
 * "MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026".
 *
 *   node server/scripts/seed-media-types.mjs
 *
 * Deck memuat 13 slide media; platform memecah satu slide social media
 * ("Instagram, Fanpage, dan Tiktok") menjadi dua entri: sosmed-feed dan
 * sosmed-story: total 14 slug.
 *
 * Idempotent. Baris yang sudah ada disinkronkan pada SELURUH kolom yang
 * dikelola seed (harga, lokasi, ketentuan, format, urutan, status aktif):
 * seed adalah sumber kebenaran katalog yang berasal dari deck.
 *
 * PENGECUALIAN: `image_path` TIDAK ditimpa, karena foto bisa diganti staf dari
 * dashboard. Pakai `--reset-gambar` untuk mengembalikannya ke foto bawaan deck
 * (sekaligus membersihkan berkas unggahan yang jadi yatim di volume).
 *
 * Env: DATABASE_URL, MEDIA_DIR (default /data/media).
 */
import { resolve, dirname, join, basename } from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';
import { MEDIA_DIR, hapusGambar } from '../src/media.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * rules = catatan Note deck per media, verbatim.
 * is_active=false untuk media yang deck nyatakan belum tersedia.
 */
const MEDIA_TYPES = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    image_path: '/media/spanduk.webp',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 70.000,-/hari',
    // Kanal cetak (Tenant Relations) + harga numerik untuk perhitungan PPN.
    media_channel: 'cetak', price_amount: 70000, price_unit: 'hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat', sort_order: 1,
    rules: [
      'Harga belum termasuk PPN.',
      'Pajak reklame menjadi tanggungjawab Tenant/Penyewa.',
      'Minimal sewa pemasangan media promosi outdoor yakni 1 minggu (7 hari) dan dapat diperpanjang sesuai dengan kebutuhan.',
      'Media promosi akan dipasang oleh pihak pengelola apabila sudah dilakukan pembayaran sewa dan harus mendapat izin dari kecamatan Bekasi Selatan /Instansi yang berwenang.',
      'Pemasangan media promosi yang dilakukan di area Metropolitan Mall Bekasi tanpa ijin pengelola, akan dibongkar tanpa pemberitahuan terlebih dahulu.',
      'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.',
      'Pengambilan materi media promosi maksimal 3 hari setelah pencopotan.',
    ].join('\n'),
  },
  {
    slug: 'big-banner', category: 'outdoor', name: 'Big Banner',
    image_path: '/media/big-banner.webp',
    size_spec: '5 x 10 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 160.000,-/hari',
    media_channel: 'cetak', price_amount: 160000, price_unit: 'hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat', sort_order: 2,
    rules: [
      'Harga belum termasuk PPN.',
      'Pajak reklame menjadi tanggungjawab Tenant/Penyewa.',
      'Minimal sewa pemasangan media promosi outdoor yakni 1 minggu (7 hari) dan dapat diperpanjang sesuai dengan kebutuhan.',
      'Media promosi akan dipasang oleh pihak pengelola apabila sudah dilakukan pembayaran sewa dan harus mendapat izin dari kecamatan Bekasi Selatan /Instansi yang berwenang.',
      'Pemasangan media promosi yang dilakukan di area Metropolitan Mall Bekasi tanpa ijin pengelola, akan dibongkar tanpa pemberitahuan terlebih dahulu.',
      'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.',
      'Pengambilan materi media promosi maksimal 3 hari setelah pencopotan.',
    ].join('\n'),
  },
  {
    slug: 'umbul-umbul', category: 'outdoor', name: 'Umbul-Umbul',
    image_path: '/media/umbul-umbul.webp',
    size_spec: '0.9 x 4.8 M', material_spec: 'Flexi 440gr',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 288.000,-/hari/16 tiang',
    media_channel: 'cetak', price_amount: 288000, price_unit: 'hari/16 tiang',
    location_note: 'Area Parkir Timur, Lobby Utara 2 dan Lobby Utara 1', sort_order: 3,
    rules: [
      'Harga belum termasuk PPN.',
      'Pajak reklame menjadi tanggungjawab Tenant/Penyewa.',
      '1 Tiang memiliki 2 materi (kanan kiri).',
      'Pemasangan umbul-umbul WAJIB MENGGUNAKAN SELURUH TIANG.',
      'Minimal sewa pemasangan media promosi outdoor yakni 1 minggu (7 hari) dan dapat diperpanjang sesuai dengan kebutuhan.',
      'Media promosi akan dipasang oleh pihak pengelola apabila sudah dilakukan pembayaran sewa dan harus mendapat izin dari kecamatan Bekasi Selatan /Instansi yang berwenang.',
      'Pemasangan media promosi yang dilakukan di area Metropolitan Mall Bekasi tanpa ijin pengelola, akan dibongkar tanpa pemberitahuan terlebih dahulu.',
      'Media promosi diterima pengelola paling lambat 2 hari sebelum pemasangan.',
      'Pengambilan materi media promosi maksimal 3 hari setelah pencopotan.',
    ].join('\n'),
  },
  {
    slug: 'boom-gate', category: 'outdoor', name: 'Boom Gate',
    image_path: '/media/boom-gate.webp',
    size_spec: '45 x 100 cm', material_spec: 'Sticker di Impraboard',
    accepted_formats: 'JPEG,PNG,PDF', price_note: '',
    location_note: 'Area Parkir Timur dan Parkir Gedung (16 unit tersedia)', sort_order: 4,
    rules: [
      'Pemasangan dilakukan oleh Tenant.',
      '1 tenant hanya diperkenankan memasang 1 materi.',
      'Materi harus approval kepada Mall.',
      'Apabila ada pajak yang timbul pada saat pemasangan materi promosi, maka ditanggung oleh Tenant.',
      'Media promosi akan dipasang dan dibongkar oleh pihak tenant dengan berkoordinasi dengan pihak Mall 3 hari kerja sebelum pemasangan.',
    ].join('\n'),
  },
  {
    slug: 'led-banner', category: 'outdoor', name: 'LED Banner',
    image_path: '/media/led-banner.webp',
    size_spec: '600 x 1350 pixel', material_spec: 'JPEG',
    accepted_formats: 'JPEG', price_note: 'Gratis (syarat: tenant baru atau peserta program promo)',
    location_note: 'Area depan mall, Jl. AH Yani', sort_order: 5,
    rules: [
      'Fasilitas hanya diberikan kepada Tenant Baru atau tenant yang sedang join promo/join program dengan Mall.',
      '1 tenant hanya diperkenankan memasang 1 materi.',
      'Pemasangan LED Banner sesuai dengan jadwal yang available yang diberikan oleh Mall.',
      'Periode pemasangan ditentukan oleh Mall. Tenant diperkenankan request tanggal namun mall tidak menerima komplain apabila pemasangan tidak sesuai dengan tanggal yang di request karena pemasangan melibatkan pihak ketiga.',
      'Pemasangan dengan periode lebih lama atau tanggal yang tepat sesuai permohonan Tenant, Tenant dapat mengajukan sewa dengan menghubungi pihak ketiga (MING Advertising) dengan Ibu Marli di +62 813-5619-1951.',
    ].join('\n'),
  },
  {
    slug: 'digital-poster', category: 'indoor', name: 'Digital Poster',
    image_path: '/media/digital-poster.webp',
    size_spec: '1920 x 1080 Pixel (Portrait)', material_spec: 'JPEG',
    accepted_formats: 'JPEG', price_note: 'Gratis',
    location_note: 'Atrium 1 (dekat tenant Optik Melawai), Pintu Utara 1 (hadap pintu masuk), Koridor Lantai Dasar (samping Momoiro), Lantai 1 (depan OB Fit), Lantai 1, 2, & 3 (samping eskalator Atrium 2)',
    sort_order: 6,
    rules: [
      'Tidak menerima video. Materi berupa gambar statis (JPEG/PNG).',
      '1 tenant hanya diperkenankan memasang 1 materi.',
      'Materi akan langsung dipasang pada 7 titik.',
      'Image akan looping selama jam operasional mall.',
      'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
      'Pemasangan dan pembongkaran hanya pada hari Jumat.',
      'Tidak dikenakan biaya pajak reklame.',
    ].join('\n'),
  },
  {
    slug: 'sticker-eskalator', category: 'indoor', name: 'Sticker Eskalator',
    image_path: '/media/sticker-eskalator.webp',
    size_spec: '65 x 800 CM', material_spec: 'Sticker Vynil Indoor laminating doff (Transparancy 80%-90%)',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 6.700.000,-/sisi/bulan',
    location_note: '', sort_order: 7,
    rules: [
      'Harga belum termasuk PPN.',
      'Media promosi akan dipasang dan dibongkar oleh pihak tenant dengan berkoordinasi dengan pihak Mall 3 hari kerja sebelum pemasangan.',
      'Pemasangan dilakukan setelah menyelesaikan biaya administrasi.',
      'Vendor percetakan/tenant wajib melakukan pengukuran ulang sebelum cetak dan pemasangan materi promosi.',
      'Pemasangan materi sticker berada di dalam sisi eskalator (lem depan).',
      'Keterlambatan pembongkaran materi promosi akan dikenakan biaya proporsional (hitungan per hari).',
      'Apabila ada pajak yang timbul pada saat pemasangan materi promosi, maka ditanggung oleh Tenant.',
    ].join('\n'),
  },
  {
    slug: 'sticker-lift', category: 'indoor', name: 'Sticker Lift',
    image_path: '/media/sticker-lift.webp',
    size_spec: '90 x 205 CM', material_spec: 'Sticker Vynil',
    accepted_formats: 'JPEG,PNG,PDF', price_note: [
      'Rp. 3.630.000,-/sisi/bulan (Lift Sisi Luar)',
      'Rp. 4.235.000,-/sisi/bulan (Lift Sisi Dalam)',
    ].join('\n'),
    location_note: '', sort_order: 8,
    rules: [
      'Harga belum termasuk PPN.',
      'Media promosi akan dipasang dan dibongkar oleh pihak tenant dengan berkoordinasi dengan pihak Mall 3 hari kerja sebelum pemasangan.',
      'Pemasangan dilakukan setelah menyelesaikan biaya administrasi.',
      'Vendor percetakan/tenant wajib melakukan pengukuran ulang sebelum cetak dan pemasangan materi promosi.',
      'Keterlambatan pembongkaran materi promosi akan dikenakan biaya proporsional (hitungan per hari).',
      'Apabila ada pajak yang timbul pada saat pemasangan materi promosi, maka ditanggung oleh Tenant.',
    ].join('\n'),
  },
  {
    slug: 'vertical-banner', category: 'indoor', name: 'Vertical Banner',
    image_path: '/media/vertical-banner.webp',
    size_spec: '200 x 800 CM', material_spec: 'Flexi Indoor laminating doff',
    accepted_formats: 'JPEG,PNG,PDF', price_note: '- (Belum tersedia)',
    location_note: '', sort_order: 9, is_active: false,
    rules: [
      'Untuk saat ini belum bisa digunakan, masih digunakan Mall.',
      'Fasilitas hanya diberikan kepada Tenant Baru atau tenant yang sedang join promo/join program dengan Mall.',
      '1 tenant hanya diperkenankan memasang 1 materi.',
      'Media promosi akan dipasang dan dibongkar oleh pihak Mall.',
      'Apabila ada pajak yang timbul pada saat pemasangan materi promosi, maka ditanggung oleh Tenant.',
    ].join('\n'),
  },
  {
    slug: 'videotron', category: 'indoor', name: 'Videotron',
    image_path: '/media/videotron.webp',
    size_spec: '800 x 600 Pixel (Landscape)', material_spec: 'JPEG/MP4, durasi 30 detik',
    accepted_formats: 'JPEG,PNG,MP4',
    price_note: [
      'Rp. 600.000,-/hari',
      'Rp. 4.200.000,-/7 hari',
      'Rp. 5.100.000,-/14 hari',
      'Rp. 10.000.000,-/30 hari',
    ].join('\n'),
    location_note: '', sort_order: 10,
    rules: [
      'Harga sudah termasuk PPN.',
      'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
      'Pemasangan dilakukan setelah menyelesaikan biaya administrasi.',
      'Pemasangan dan pembongkaran hanya pada hari kerja.',
      'Tidak dikenakan biaya pajak reklame.',
    ].join('\n'),
  },
  {
    slug: 'parapet', category: 'indoor', name: 'Parapet',
    image_path: '/media/parapet.webp',
    size_spec: '512 x 2.624 Pixel (Landscape)', material_spec: 'JPEG/MP4, durasi 30 detik',
    accepted_formats: 'JPEG,PNG,MP4', price_note: 'Gratis (sementara, khusus tenant baru)',
    location_note: '', sort_order: 11,
    rules: [
      'Harga sudah termasuk PPN.',
      'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
      'Pemasangan dilakukan setelah menyelesaikan biaya administrasi.',
      'Pemasangan dan pembongkaran hanya pada hari kerja.',
      'Tidak dikenakan biaya pajak reklame.',
    ].join('\n'),
  },
  {
    slug: 'videotron-integrasia', category: 'indoor', name: 'Videotron Integrasia',
    image_path: '/media/videotron-integrasia.webp',
    size_spec: '4 x 8m Horizontal (Resolusi 1025 x 1025)', material_spec: 'JPEG/MP4, durasi 15 detik',
    accepted_formats: 'JPEG,PNG,MP4',
    price_note: [
      'Hari kerja Rp. 1.800.000,-',
      'Akhir pekan Rp. 2.500.000,-',
      'Mingguan Rp. 10.000.000,-',
      'Bulanan Rp. 35.000.000,-',
    ].join('\n'),
    location_note: '', sort_order: 12,
    rules: [
      'Harga belum termasuk PPN, biaya admin Rp. 10.000 dan materai Rp. 10.000.',
      'Diskon range dari pricelist 5-10%.',
      'Materi promosi akan diberikan oleh Tenant kepada Mall 3 hari kerja sebelum pemasangan.',
      'Pemasangan dilakukan setelah menyelesaikan biaya administrasi.',
      'Pemasangan dan pembongkaran hanya pada hari kerja.',
      'Tidak dikenakan biaya pajak reklame.',
    ].join('\n'),
  },
  {
    slug: 'sosmed-feed', category: 'social', name: 'Feed Instagram/Fanpage/TikTok',
    image_path: '/media/sosmed-feed.webp',
    size_spec: '800 x 800 Pixel (Square)', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', price_note: 'Gratis',
    location_note: '', sort_order: 13,
    rules: [
      'Materi promosi harus clean image dan image promo, dilengkapi dengan caption (tulis di catatan pengajuan).',
      'Materi juga dapat dikirim via email ke marketing@malmetropolitan.com.',
      'Semua materi akan di posting juga di Fanpage dan Twitter.',
      'Materi dengan format IG Reels akan di posting juga di Tiktok.',
      'Tidak diperkenankan ada logo atau nama mall lain dalam image atau caption.',
      'Tidak mempromosikan pembelanjaan online.',
      'Materi tidak melanggar norma yang berlaku di masyarakat dan menyinggung SARA.',
      'Menyebutkan detail lokasi Lantai tenant dengan detail pada caption.',
      'Mengirimkan materi tidak sesuai dengan ukuran yang ditentukan, hanya akan di post di IG Story.',
      'Mohon mengirimkan materi promosi pada hari dan jam kerja.',
      'Mengirimkan materi promosi diluar hari dan jam kerja akan di respon sesuai dengan ketersediaan waktu admin.',
    ].join('\n'),
  },
  {
    slug: 'sosmed-story', category: 'social', name: 'IG Story/Reels',
    image_path: '/media/sosmed-story.webp',
    size_spec: '1080 x 1920 Pixel', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', price_note: 'Gratis',
    location_note: '', sort_order: 14,
    rules: [
      'Materi promosi harus clean image dan image promo, dilengkapi dengan caption (tulis di catatan pengajuan).',
      'Materi juga dapat dikirim via email ke marketing@malmetropolitan.com.',
      'Semua materi akan di posting juga di Fanpage dan Twitter.',
      'Materi dengan format IG Reels akan di posting juga di Tiktok.',
      'Tidak diperkenankan ada logo atau nama mall lain dalam image atau caption.',
      'Tidak mempromosikan pembelanjaan online.',
      'Materi tidak melanggar norma yang berlaku di masyarakat dan menyinggung SARA.',
      'Menyebutkan detail lokasi Lantai tenant dengan detail pada caption.',
      'Mohon mengirimkan materi promosi pada hari dan jam kerja.',
      'Mengirimkan materi promosi diluar hari dan jam kerja akan di respon sesuai dengan ketersediaan waktu admin.',
    ].join('\n'),
  },
];

/** `--reset-gambar` mengembalikan image_path ke foto bawaan deck. Tanpa flag
 *  ini, foto hasil unggahan staf TIDAK ditimpa seed. */
const RESET_GAMBAR = process.argv.includes('--reset-gambar');

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL belum dikonfigurasi (salin .env.example → .env).');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

try {
  let inserted = 0;
  let synced = 0;
  for (const m of MEDIA_TYPES) {
    const { rows } = await pool.query(
      `INSERT INTO promo_media_types
        (slug, category, name, size_spec, material_spec, accepted_formats,
         price_note, location_note, rules, image_path, is_active, sort_order,
         media_channel, price_amount, price_unit, ppn_included)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$14,$15,$16,$17)
       ON CONFLICT (slug) DO UPDATE
         SET image_path = CASE WHEN $13 THEN EXCLUDED.image_path
                               ELSE promo_media_types.image_path END,
             category = EXCLUDED.category,
             name = EXCLUDED.name,
             size_spec = EXCLUDED.size_spec,
             material_spec = EXCLUDED.material_spec,
             accepted_formats = EXCLUDED.accepted_formats,
             price_note = EXCLUDED.price_note,
             location_note = EXCLUDED.location_note,
             rules = EXCLUDED.rules,
             is_active = EXCLUDED.is_active,
             sort_order = EXCLUDED.sort_order,
             media_channel = EXCLUDED.media_channel,
             price_amount = EXCLUDED.price_amount,
             price_unit = EXCLUDED.price_unit,
             ppn_included = EXCLUDED.ppn_included,
             updated_at = now()
         WHERE (promo_media_types.category, promo_media_types.name,
                promo_media_types.size_spec, promo_media_types.material_spec,
                promo_media_types.accepted_formats, promo_media_types.price_note,
                promo_media_types.location_note, promo_media_types.rules,
                promo_media_types.is_active, promo_media_types.sort_order,
                promo_media_types.media_channel, promo_media_types.price_amount,
                promo_media_types.price_unit, promo_media_types.ppn_included)
               IS DISTINCT FROM
               (EXCLUDED.category, EXCLUDED.name,
                EXCLUDED.size_spec, EXCLUDED.material_spec,
                EXCLUDED.accepted_formats, EXCLUDED.price_note,
                EXCLUDED.location_note, EXCLUDED.rules,
                EXCLUDED.is_active, EXCLUDED.sort_order,
                EXCLUDED.media_channel, EXCLUDED.price_amount,
                EXCLUDED.price_unit, EXCLUDED.ppn_included)
            OR ($13 AND promo_media_types.image_path IS DISTINCT FROM EXCLUDED.image_path)
       RETURNING id, (xmax = 0) AS is_insert`,
      [
        m.slug, m.category, m.name, m.size_spec, m.material_spec,
        m.accepted_formats, m.price_note, m.location_note, m.rules, m.image_path,
        m.is_active === false ? false : true, m.sort_order, RESET_GAMBAR,
        // Parameter baru di-append SETELAH $13 (RESET_GAMBAR) supaya indeks
        // parameter yang dikunci test lama tidak bergeser.
        m.media_channel || 'digital', m.price_amount || 0, m.price_unit || '',
        // ppn_included diturunkan dari teks `rules` (sumber yang sama dengan
        // blok migrasi schema.sql), bukan ditulis manual per entri.
        /harga sudah termasuk ppn/i.test(m.rules || ''),
      ],
    );
    if (rows[0]?.is_insert) inserted += 1;
    else if (rows[0]) synced += 1;
  }
  const { rows: total } = await pool.query('SELECT COUNT(*)::int AS n FROM promo_media_types');

  // --reset-gambar memindahkan penunjuk kembali ke foto deck, sehingga berkas
  // unggahan lama menjadi yatim di volume. Bersihkan supaya volume tidak
  // menumpuk gambar yang sudah tidak dirujuk siapa pun.
  let dibersihkan = 0;
  if (RESET_GAMBAR) {
    const { rows: masihUnggahan } = await pool.query(
      `SELECT image_path FROM promo_media_types WHERE image_path LIKE '/api/v1/media/%'`,
    );
    const dirujuk = new Set(masihUnggahan.map((r) => basename(r.image_path)));
    let berkas = [];
    try { berkas = await readdir(MEDIA_DIR); } catch { berkas = []; }
    for (const nama of berkas) {
      if (!dirujuk.has(nama)) {
        await hapusGambar(nama);
        dibersihkan += 1;
      }
    }
  }

  console.log(
    `✓ seed selesai: ${inserted} baru, ${synced} format disinkronkan, ` +
    `${dibersihkan} gambar yatim dibersihkan, total ${total[0].n} media type (${MEDIA_TYPES.length} didefinisikan).`,
  );
} catch (err) {
  console.error('✗ gagal seed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
