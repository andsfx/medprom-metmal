/**
 * db-migrate.mjs: eksekusi server/schema.sql (multi-statement, idempotent).
 *
 *   node scripts/db-migrate.mjs
 *
 * Env: DATABASE_URL (dibaca dari .env root bila ada).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCHEMA_PATH = resolve(ROOT, 'server/schema.sql');

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL belum dikonfigurasi (salin .env.example → .env).');
  process.exit(1);
}

const sql = readFileSync(SCHEMA_PATH, 'utf8');
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

try {
  await pool.query(sql);
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('promo_media_types','promo_submissions','users','activity_logs')
     ORDER BY table_name`,
  );
  console.log(`✓ schema applied (${rows.length} tabel): ${rows.map((r) => r.table_name).join(', ')}`);
} catch (err) {
  console.error('✗ gagal apply schema:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
