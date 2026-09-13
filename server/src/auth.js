/**
 * Auth — JWT (jose HS256) + cookie sb-access-token / sb-refresh-token.
 * Pola schedule-event-v2/server/src/auth.js.
 *
 * Cookie produksi cross-site (Vercel FE → API domain lain): COOKIE_SAMESITE=none
 * + Secure (keduanya wajib — browser menolak SameSite=None tanpa Secure).
 */
import { SignJWT, jwtVerify } from 'jose';
import { db } from './db.js';
import { clientIp } from './lib/rateLimit.js';

export const ACCESS_TOKEN_TTL = 60 * 60;          // 1 jam
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30;      // 30 hari
const ACCESS_COOKIE = 'sb-access-token';
const REFRESH_COOKIE = 'sb-refresh-token';

export const STAFF_ROLES = ['superadmin', 'admin'];
export const READ_ROLES = ['superadmin', 'admin', 'tenant_relation'];

function secretKey() {
  const secret = process.env.JWT_SECRET || '';
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/** Cookie flags: HttpOnly selalu; Secure kecuali COOKIE_SECURE=false di non-prod.
 *  SameSite: 'lax' default. 'none' wajib untuk frontend cross-site (Vercel →
 *  api domain lain) — hanya valid bersama Secure. */
function cookieBase() {
  const isSecure = process.env.COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === 'production'
    : process.env.COOKIE_SECURE === 'true';
  const sameSite = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  const valid = ['lax', 'strict', 'none'];
  return {
    httpOnly: true,
    sameSite: valid.includes(sameSite) ? sameSite : 'lax',
    secure: isSecure,
    domain: process.env.COOKIE_DOMAIN ? process.env.COOKIE_DOMAIN.replace(/^\./, '') : undefined,
  };
}

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase(), maxAge: ACCESS_TOKEN_TTL * 1000, path: '/' });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieBase(), maxAge: REFRESH_TOKEN_TTL * 1000, path: '/' });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: '/' });
}

/** Baca header cookie manual (fallback bila cookie-parser tidak terpasang). */
export function getCookie(req, name) {
  const header = req?.headers?.cookie;
  if (!header) return '';
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return '';
}

function extractAccessToken(req) {
  const auth = String(req?.headers?.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return getCookie(req, ACCESS_COOKIE);
}

/** Payload user publik (tanpa hash/PII). */
export function publicUser(row) {
  return {
    id: String(row.id || ''),
    email: String(row.email || ''),
    display_name: String(row.display_name || ''),
    role: String(row.role || 'viewer'),
  };
}

export async function signAccess(user) {
  return new SignJWT({ typ: 'access', ...publicUser(user) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .sign(secretKey());
}

export async function signRefresh(userId) {
  return new SignJWT({ typ: 'refresh', sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL}s`)
    .sign(secretKey());
}

async function verifyToken(token, expectedTyp) {
  if (!token) return null;
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.typ !== expectedTyp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function loadUser(id) {
  const { rows } = await db.query(
    'SELECT id, email, display_name, role, is_active FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  const row = rows[0] || null;
  if (!row || !row.is_active) return null;
  return row;
}

/**
 * Verifikasi sesi: access token (Bearer/cookie) → refresh token bila access
 * kedaluwarsa (rotasi + set cookie baru).
 * @returns {Promise<{ user: object } | null>}
 */
export async function authenticate(req, res) {
  if (!process.env.JWT_SECRET) return null;

  const access = extractAccessToken(req);
  const accessPayload = await verifyToken(access, 'access');
  if (accessPayload?.id) {
    const user = await loadUser(accessPayload.id);
    if (user) return { user };
  }

  // Refresh path: rotasi token.
  const refresh = getCookie(req, REFRESH_COOKIE);
  const refreshPayload = await verifyToken(refresh, 'refresh');
  if (refreshPayload?.sub) {
    const user = await loadUser(refreshPayload.sub);
    if (user) {
      const accessToken = await signAccess(user);
      const refreshToken = await signRefresh(user.id);
      setAuthCookies(res, accessToken, refreshToken);
      return { user };
    }
  }
  return null;
}

/**
 * Middleware requireRole — default STAFF_ROLES (superadmin/admin).
 * 401 tanpa sesi; 403 bila role tidak diizinkan.
 */
export function requireRole(allowedRoles = STAFF_ROLES) {
  return async (req, res, next) => {
    try {
      const session = await authenticate(req, res);
      if (!session) {
        return res.status(401).json({ success: false, error: 'Sesi berakhir. Silakan login kembali.' });
      }
      const role = session.user.role;
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke aksi ini.' });
      }
      req.auth = session;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Catat aktivitas staf — fire-and-forget (tidak menggagalkan request).
 */
export async function logActivity(user, action, resourceType, resourceId, details, req) {
  try {
    await db.query(
      `INSERT INTO activity_logs (user_id, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user?.id || null,
        String(action || ''),
        String(resourceType || ''),
        String(resourceId || ''),
        details && typeof details === 'object' ? JSON.stringify(details) : details,
        clientIp(req || null),
      ],
    );
  } catch (err) {
    console.error('[logActivity] gagal (diabaikan):', err.message);
  }
}
