/**
 * Express entrypoint — backend REST medprom-metmal.
 *
 * Booting TANPA database tetap jalan (graceful): setiap endpoint yang butuh
 * DB merespons 503 bersih. Envelope respons:
 *   { success: boolean, error?: string, data?: unknown }
 *
 *   POST /api/v1/auth/login|logout     — login staf (bcrypt + JWT cookie)
 *   GET  /api/v1/auth/me               — sesi aktif
 *   GET  /api/v1/promo/media-types      — katalog aktif (publik)
 *   GET  /api/v1/promo/tenants?q=       — cari tenant MID (publik)
 *   POST /api/v1/promo/submit           — kirim pengajuan (publik)
 *   GET  /api/v1/promo/submissions/mine — riwayat per perangkat (publik)
 *   GET  /api/v1/promo/submissions/track — lacak via nomor pengajuan (publik, captcha)
 *   POST /api/v1/drive/upload           — upload file (publik, rate-limited)
 *   POST /api/v1/drive/delete           — hapus file (staff)
 *   GET  /api/v1/media/:nama            — gambar katalog (publik)
 *   GET|POST /api/v1/admin/*           — dashboard staf (requireRole)
 *   GET  /healthz                      — health check (tanpa DB)
 *
 * Env:
 *   PORT           default 3001
 *   DATABASE_URL   pg connection string (wajib utk data; boot tanpa ini aman)
 *   JWT_SECRET     tanda tangan JWT (wajib utk auth; boot tanpa ini aman)
 *   CORS_ORIGIN    daftar origin dipisah koma; tanpa ini → default-deny
 *                  lintas-origin browser (same-origin tidak lewat CORS)
 *   GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN — storage Google Drive (lihat drive.js)
 *   TURNSTILE_SECRET_KEY — captcha endpoint pelacakan (lihat lib/turnstile.js)
 *   COOKIE_SAMESITE / COOKIE_SECURE / COOKIE_DOMAIN — lihat auth.js
 */
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { db, isDbReady } from './db.js';
import authRouter from './routes/auth.js';
import promoRouter from './routes/promo.js';
import adminRouter from './routes/admin.js';
import driveRouter from './drive.js';
import mediaRouter from './routes/media.js';
import { turnstileConfigured } from './lib/turnstile.js';

const app = express();
app.disable('x-powered-by');

app.use(cors({
  origin(origin, cb) {
    // Whitelist strict (CORS_ORIGIN, exact-match). Tanpa konfigurasi →
    // default-deny untuk request lintas origin ber-browser; same-origin
    // (dev server proxy / reverse proxy) tidak lewat CORS.
    const allowed = String(process.env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!origin || allowed.includes(origin)) return cb(null, true);
    const err = new Error('Origin tidak diizinkan');
    err.status = 403;
    return cb(err);
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/promo', promoRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/drive', driveRouter);
app.use('/api/v1/media', mediaRouter);

// Health check tanpa DB.
app.get('/healthz', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', db: isDbReady() } });
});

// 404 JSON (bukan HTML) — konsisten dengan envelope.
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan' });
});

// Error handler terakhir — selalu envelope JSON.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err?.status || err?.statusCode || 500;
  const message = err?.code === 'DB_UNAVAILABLE'
    ? (err.message || 'Database tidak tersedia')
    : (err?.message || 'Terjadi kesalahan server');
  if (status >= 500) console.error('[api] error:', err?.stack || err);
  res.status(status).json({ success: false, error: message });
});

const PORT = Number(process.env.PORT || 3001);

// Boot aman: listen dulu, verifikasi DB di latar belakang (warning saja).
const server = app.listen(PORT, () => {
  console.log(`[api] REST server jalan di http://localhost:${PORT} (db: ${isDbReady() ? 'siap' : 'belum-siap'})`);
  if (!turnstileConfigured()) {
    console.warn('[api] TURNSTILE_SECRET_KEY kosong — verifikasi captcha endpoint pelacakan DILEWATI. Isi sebelum dipakai publik.');
  }
});

db.verify?.();

// Shutdown bersih (SIGTERM dari docker stop).
function shutdown() {
  console.log('[api] shutdown ...');
  server.close(() => {
    db.end().catch(() => {}).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
