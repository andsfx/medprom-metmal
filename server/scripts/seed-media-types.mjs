/**
 * seed-media-types.mjs — seed katalog media promosi dari deck
 * "MEDIA PROMOSI METROPOLITAN MALL BEKASI 2026" (14 media).
 *
 *   node server/scripts/seed-media-types.mjs
 *
 * Idempotent. Baris yang sudah ada HANYA disinkronkan pada kolom
 * accepted_formats (daftar format yang diterima platform); harga, lokasi,
 * dan aturan yang sudah diedit admin TIDAK ditimpa. Env: DATABASE_URL.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * rules = catatan Note deck per media, verbatim.
 * is_active=false untuk media yang deck nyatakan belum tersedia.
 */
const MEDIA_TYPES = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 70.000,-/hari',
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
    size_spec: '5 x 10 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 160.000,-/hari',
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
    size_spec: '0.9 x 4.8 M', material_spec: 'Flexi 440gr',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 288.000,-/hari/16 tiang',
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
    size_spec: '45 x 100 cm', material_spec: 'Sticker di Impraboard',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Total 16 Unit',
    location_note: 'Area Parkir Timur dan Parkir Gedung', sort_order: 4,
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
    size_spec: '600 x 1350 pixel', material_spec: 'JPEG',
    accepted_formats: 'JPEG,PNG', price_note: 'Gratis (syarat tenant baru/join promo)',
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
    size_spec: '1920 x 1080 Pixel (Portrait)', material_spec: 'JPEG',
    accepted_formats: 'JPEG,PNG', price_note: 'Free',
    location_note: 'Atrium 1 (dekat tenant Optik Melawai), Pintu Utara 1 (hadap pintu masuk), Koridor Lantai Dasar (samping Momoiro), Lantai 1 (depan OB Fit), Lantai 1, 2, & 3 (samping eskalator Atrium 2)',
    sort_order: 6,
    rules: [
      'Tidak menerima video — materi berupa gambar statis (JPEG/PNG).',
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
    size_spec: '90 x 205 CM', material_spec: 'Sticker Vynil',
    accepted_formats: 'JPEG,PNG,PDF', price_note: 'Rp. 3.630.000,-/sisi/bulan (Lift Sisi Luar); Rp. 4.235.000,-/sisi/bulan (Lift Sisi Dalam)',
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
    size_spec: '800 x 600 Pixel (Landscape)', material_spec: 'JPEG/MP4, durasi 30 detik',
    accepted_formats: 'JPEG,PNG,MP4',
    price_note: 'Rp. 600.000,-/hari; Rp. 4.200.000,-/7 hari; Rp. 5.100.000,-/14 hari; Rp. 10.000.000,-/30 hari',
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
    size_spec: '512 x 2.624 Pixel (Landscape)', material_spec: 'JPEG/MP4, durasi 30 detik',
    accepted_formats: 'JPEG,PNG,MP4', price_note: 'Free (Sementara khusus tenant baru)',
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
    size_spec: '4 x 8m Horizontal (Resolusi 1025 x 1025)', material_spec: 'JPEG/MP4, durasi 15 detik',
    accepted_formats: 'JPEG,PNG,MP4',
    price_note: 'Weekday Rp. 1.800.000,-; Weekend Rp. 2.500.000,-; Weekly Rp. 10.000.000,-; Monthly Rp. 35.000.000,-',
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
    size_spec: '800 x 800 Pixel (Square)', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', price_note: 'Free',
    location_note: '', sort_order: 13,
    rules: [
      'Materi promosi harus clean image dan image promo, dilengkapi dengan caption (tulis di catatan pengajuan).',
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
    size_spec: '1080 x 1920 Pixel', material_spec: 'JPEG/MP4',
    accepted_formats: 'JPEG,PNG,MP4', price_note: 'Free',
    location_note: '', sort_order: 14,
    rules: [
      'Materi promosi harus clean image dan image promo, dilengkapi dengan caption (tulis di catatan pengajuan).',
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
         price_note, location_note, rules, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE
         SET accepted_formats = EXCLUDED.accepted_formats, updated_at = now()
         WHERE promo_media_types.accepted_formats IS DISTINCT FROM EXCLUDED.accepted_formats
       RETURNING id, (xmax = 0) AS is_insert`,
      [
        m.slug, m.category, m.name, m.size_spec, m.material_spec,
        m.accepted_formats, m.price_note, m.location_note, m.rules,
        m.is_active === false ? false : true, m.sort_order,
      ],
    );
    if (rows[0]?.is_insert) inserted += 1;
    else if (rows[0]) synced += 1;
  }
  const { rows: total } = await pool.query('SELECT COUNT(*)::int AS n FROM promo_media_types');
  console.log(`✓ seed selesai: ${inserted} baru, ${synced} format disinkronkan, total ${total[0].n} media type (${MEDIA_TYPES.length} didefinisikan).`);
} catch (err) {
  console.error('✗ gagal seed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
