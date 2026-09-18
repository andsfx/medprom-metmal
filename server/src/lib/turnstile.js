/**
 * Verifikasi Cloudflare Turnstile — captcha untuk endpoint publik.
 *
 * Dipakai endpoint pelacakan pengajuan (dan bisa dipakai endpoint publik lain):
 * widget Turnstile di browser menghasilkan token sekali pakai, server
 * memverifikasinya ke Siteverify sebelum permintaan diproses.
 *
 * Tanpa dependensi baru — cukup `fetch` bawaan Node 20 (pola yang sama dengan
 * drive.js dan pencarian tenant MID).
 *
 * Verifikasi mengikuti kontrak kanonik Cloudflare: token harus ada, panjangnya
 * wajar, `success` benar, `action` cocok dengan permukaan yang dilindungi, dan
 * `hostname` termasuk daftar yang disetujui. Tanpa cek `action`/`hostname`,
 * token dari widget mana pun (mis. milik situs lain yang memakai sitekey sama)
 * bisa dipakai ulang di sini.
 *
 * Konfigurasi:
 *   TURNSTILE_SECRET_KEY  — wajib di produksi; kosong = verifikasi dilewati.
 *   TURNSTILE_HOSTNAMES   — daftar hostname frontend dipisah koma. Wajib bila
 *                           secret terisi; produksi TIDAK boleh memuat
 *                           localhost/127.0.0.1.
 *
 * Secret key TIDAK boleh sampai ke browser; pasangan sisi-kliennya adalah
 * `VITE_TURNSTILE_SITE_KEY` (sitekey publik, aman di-bundle).
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Timeout panggilan Siteverify — jangan biarkan pengguna menunggu tanpa batas. */
const VERIFY_TIMEOUT_MS = 8000;

/** Batas panjang token menurut Cloudflare; token lebih panjang pasti palsu. */
const MAX_TOKEN_LENGTH = 2048;

function secretKey() {
  return String(process.env.TURNSTILE_SECRET_KEY || '').trim();
}

/** Daftar hostname frontend yang boleh memakai widget ini. */
function allowedHostnames() {
  return String(process.env.TURNSTILE_HOSTNAMES || '')
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean);
}

/** true bila secret key tersedia → verifikasi benar-benar ditegakkan. */
export function turnstileConfigured() {
  return Boolean(secretKey());
}

/** true bila allowlist hostname terisi → cek hostname bisa dijalankan. */
export function turnstileHostnamesConfigured() {
  return allowedHostnames().length > 0;
}

/**
 * Verifikasi token Turnstile.
 *
 * @param {string} token Token dari widget (`cf-turnstile-response`).
 * @param {{remoteip?: string, action?: string}} [options]
 *   `action` = nilai `action` yang dipasang widget; wajib cocok bila diisi.
 * @returns {Promise<{ok: true, skipped?: boolean} | {ok: false, status?: number, error: string}>}
 */
export async function verifyTurnstile(token, { remoteip = '', action = '' } = {}) {
  const secret = secretKey();
  // Belum dikonfigurasi → jangan blokir (keputusan sadar, lihat catatan modul).
  if (!secret) return { ok: true, skipped: true };

  const response = String(token || '').trim();
  if (!response) {
    return { ok: false, error: 'Verifikasi captcha wajib diselesaikan.' };
  }
  if (response.length > MAX_TOKEN_LENGTH) {
    return { ok: false, error: 'Verifikasi captcha tidak valid. Muat ulang halaman lalu coba lagi.' };
  }

  // Fail-closed: secret ada tetapi allowlist hostname kosong berarti cek hostname
  // tidak bisa dijalankan — jangan diam-diam melewatinya.
  const expectedHostnames = allowedHostnames();
  if (expectedHostnames.length === 0) {
    console.error('[turnstile] TURNSTILE_HOSTNAMES kosong — verifikasi ditolak (fail-closed).');
    return {
      ok: false,
      status: 503,
      error: 'Layanan verifikasi captcha belum dikonfigurasi lengkap.',
    };
  }

  try {
    const resp = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response,
        ...(remoteip ? { remoteip } : {}),
      }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error(`siteverify ${resp.status}`);
    const result = await resp.json().catch(() => null);

    const actionMatches = !action || result?.action === action;
    const hostnameAllowed = expectedHostnames.includes(result?.hostname);
    if (!result?.success || !actionMatches || !hostnameAllowed) {
      // Semua sebab ditolak dengan pesan sama agar tidak membocorkan kode
      // kegagalan (atau hostname yang terdaftar) ke penyerang.
      if (result?.success && !hostnameAllowed) {
        console.error('[turnstile] hostname tidak diizinkan:', result?.hostname);
      }
      return { ok: false, error: 'Verifikasi captcha gagal. Muat ulang halaman lalu coba lagi.' };
    }
    return { ok: true };
  } catch (err) {
    // Cloudflare tak terjangkau / timeout — fail-closed: ini gerbang anti-bot,
    // jangan diam-diam melepasnya saat gangguan jaringan.
    console.error('[turnstile]', err);
    return {
      ok: false,
      status: 503,
      error: 'Layanan verifikasi captcha sedang tidak tersedia. Coba lagi sebentar lagi.',
    };
  }
}
