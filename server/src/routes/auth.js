/**
 * Routes auth - POST /api/v1/auth/*
 *
 *   POST /auth/login   - login email+password (bcrypt compare users.password_hash)
 *   POST /auth/logout  - hapus cookie
 *   GET  /auth/me      - sesi aktif ({ success, user } | { success, user: null })
 *
 * Respons mengikuti bentuk useAuth (FE membaca data.user / data.error):
 *   login → { success: true, user: {...} }
 *   me    → { success: true, user: {...} } | { success: true, user: null }
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { db } from '../db.js';
import {
  setAuthCookies,
  clearAuthCookies,
  authenticate,
  publicUser,
  logActivity,
  signAccess,
  signRefresh,
} from '../auth.js';
import { enforceRateLimit } from '../lib/rateLimit.js';

const router = Router();

// POST /auth/login.
router.post('/login', async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ success: false, error: 'Autentikasi belum dikonfigurasi (JWT_SECRET)' });
  }
  // 20 attempts / 15 min per IP.
  if (!enforceRateLimit(req, res, 'auth-login', 20, 15 * 60 * 1000)) return;

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email dan password harus diisi' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, email, display_name, role, is_active, password_hash FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
    const row = rows[0] || null;

    // Compare selalu jalan (anti user-enumeration timing).
    const hash = row?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const match = await bcrypt.compare(password, hash);

    if (!row || !row.is_active || !row.password_hash || !match) {
      return res.status(401).json({ success: false, error: 'Email atau password salah' });
    }

    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);

    const user = publicUser(row);
    const accessToken = await signAccess(row);
    const refreshToken = await signRefresh(row.id);
    setAuthCookies(res, accessToken, refreshToken);

    logActivity(user, 'login', 'user', row.id, null, req);

    return res.json({ success: true, user });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/logout.
router.post('/logout', async (req, res) => {
  const session = await authenticate(req, res).catch(() => null);
  if (session) logActivity(session.user, 'logout', 'user', session.user.id, null, req);
  clearAuthCookies(res);
  res.json({ success: true });
});

// GET /auth/me.
router.get('/me', async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ success: false, error: 'Autentikasi belum dikonfigurasi (JWT_SECRET)' });
    }
    const session = await authenticate(req, res);
    return res.json({ success: true, user: session ? publicUser(session.user) : null });
  } catch (err) {
    return next(err);
  }
});

export default router;
