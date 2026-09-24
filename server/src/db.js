/**
 * PostgreSQL connection pool (pg) - pola schedule-event-v2/server/src/db.js.
 *
 * Graceful degradation: bila DATABASE_URL tidak ada / DB tidak terjangkau,
 * server TETAP BOOT (warning saat start), dan setiap permintaan yang butuh DB
 * mendapat 503 bersih dengan pesan Indonesia (middleware error handler
 * menerjemahkan code DB_UNAVAILABLE).
 */
import pg from 'pg';

const { Pool } = pg;

// Kolom DATE (OID 1082) dikirim sebagai string 'YYYY-MM-DD' - JSON.stringify
// tidak boleh mengubahnya jadi UTC-midnight ISO (pola app lama).
pg.types.setTypeParser(1082, (val) => val);

const DATABASE_URL = process.env.DATABASE_URL || '';
const POOL_MAX = Number(process.env.DB_POOL_MAX || 10);

/** Error bertanda DB tak tersedia - middleware mengubahnya jadi 503. */
export class DbUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DbUnavailableError';
    this.code = 'DB_UNAVAILABLE';
    this.status = 503;
  }
}

function connectionStringMissing() {
  return {
    ready: false,
    lastError: 'DATABASE_URL belum dikonfigurasi',
    async query() {
      throw new DbUnavailableError('Database belum dikonfigurasi (DATABASE_URL kosong)');
    },
    async end() {},
  };
}

function createPool() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    idleTimeoutMillis: 300_000,
    connectionTimeoutMillis: 5_000,
    max: POOL_MAX,
    // Zona sesi untuk seluruh query: `CURRENT_DATE` dan cast `::date` di
    // server/src/routes/admin.js (pengingat, filter tanggal daftar) memakai
    // hari kalender WIB, bukan default UTC container. `options` diteruskan
    // ke server oleh node-postgres (bukan `PGTZ`, yang tidak dibaca pg).
    options: '-c timezone=Asia/Jakarta',
  });

  // pg me-emit error untuk idle client yang mati - jangan crash server.
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });

  let verified = false;
  let verifying = null;

  return {
    get ready() { return verified; },
    get lastError() { return verified ? null : 'Koneksi database belum terverifikasi'; },
    verify() {
      // Satu flight: panggilan berikutnya menunggu promise yang sama.
      if (!verifying) {
        verifying = pool.query('SELECT 1').then(() => {
          verified = true;
          console.log('[db] terhubung');
        }).catch((err) => {
          console.error('[db] GAGAL terhubung:', err.message);
          process.exitCode = 0; // boot tetap jalan; endpoint data → 503
        }).finally(() => {
          verifying = null;
        });
      }
      return verifying;
    },
    query(...args) {
      if (!verified) throw new DbUnavailableError('Database belum siap. Coba lagi sebentar.');
      return pool.query(...args);
    },
    async end() {
      await pool.end().catch(() => {});
    },
  };
}

export const db = DATABASE_URL ? createPool() : connectionStringMissing();

// Boot: verifikasi di latar belakang (tidak memblokir listen).

export function isDbReady() {
  return db.ready === true;
}
