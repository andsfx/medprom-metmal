/**
 * Buat / reset akun staf — jalankan manual:
 *   ADMIN_PASSWORD='...' node server/scripts/create-admin.mjs <email> '' [display_name] [--reset]
 *
 * Password boleh lewat argv (arg ke-2) ATAU env `ADMIN_PASSWORD` — produksi
 * pakai env (argv bocor ke shell history + ps).
 *
 *   1. baca env (DATABASE_URL wajib)
 *   2. bcrypt hash password (min 8 karakter)
 *   3. INSERT users (role admin default; env ADMIN_ROLE untuk superadmin/
 *      tenant_relation) — atau, dengan --reset, UPDATE password_hash user lama.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL belum diset (salin .env.example → .env).');
  process.exit(1);
}

const args = process.argv.slice(2);
const isReset = args.includes('--reset');
const positional = args.filter((a) => a !== '--reset');

const email = String(positional[0] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = positional[1] || process.env.ADMIN_PASSWORD || '';
const displayName = positional[2] || process.env.ADMIN_NAME || 'Admin Medprom';
const role = String(process.env.ADMIN_ROLE || 'admin');

const USER_ROLES = ['superadmin', 'admin', 'tenant_relation'];
if (!USER_ROLES.includes(role)) {
  console.error(`ERROR: ADMIN_ROLE tidak valid (${USER_ROLES.join(', ')})`);
  process.exit(1);
}

if (!email || !password) {
  console.error('Pemakaian: node server/scripts/create-admin.mjs <email> <password> [display_name] [--reset]');
  console.error('           (atau env ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME / ADMIN_ROLE)');
  process.exit(1);
}
if (password.length < 8) {
  console.error('ERROR: password minimal 8 karakter.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

try {
  const hash = await bcrypt.hash(password, 10);

  if (isReset) {
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1, is_active = true, updated_at = now()
       WHERE email = $2 RETURNING id, email, role`,
      [hash, email],
    );
    if (!rows[0]) {
      console.error(`✗ user ${email} tidak ditemukan — buat dulu tanpa --reset.`);
      process.exitCode = 1;
    } else {
      console.log(`✓ password direset utk ${rows[0].email} (role: ${rows[0].role}).`);
    }
  } else {
    const { rows } = await pool.query(
      `INSERT INTO users (email, display_name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()
       RETURNING id, email, role`,
      [email, displayName, role, hash],
    );
    console.log(`✓ akun siap: ${rows[0].email} (role: ${rows[0].role}).`);
  }
} catch (err) {
  console.error('✗ gagal:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
