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
 * Konfigurasi: `TURNSTILE_SECRET_KEY` (wajib di produksi). Bila kosong,
 * verifikasi DILEWATI dengan peringatan saat boot — instance lama tetap jalan,
 * tetapi gerbang captcha tidak aktif. Isi kuncinya sebelum dipakai publik.
 *
 * Secret key TIDAK boleh sampai ke browser; pasangan sisi-kliennya adalah
 * `VITE_TURNSTILE_SITE_KEY` (sitekey publik, aman di-bundle).
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Timeout panggilan Siteverify — jangan biarkan pengguna menunggu tanpa batas. */
const VERIFY_TIMEOUT_MS = 8000;

function secretKey() {
  return String(process.env.TURNSTILE_SECRET_KEY || '').trim();
}

/** true bila secret key tersedia → verifikasi benar-benar ditegakkan. */
export function turnstileConfigured() {
  return Boolean(secretKey());
}

/**
 * Verifikasi token Turnstile.
 *
 * @param {string} token  Token dari widget (`cf-turnstile-response`).
 * @param {string} [remoteip] IP pengunjung (opsional, memperkuat validasi).
 * @returns {Promise<{ok: true, skipped?: boolean} | {ok: false, status?: number, error: string}>}
 */
export async function verifyTurnstile(token, remoteip) {
  const secret = secretKey();
  // Belum dikonfigurasi → jangan blokir (keputusan sadar, lihat catatan modul).
  if (!secret) return { ok: true, skipped: true };

  const response = String(token || '').trim();
  if (!response) {
    return { ok: false, error: 'Verifikasi captcha wajib diselesaikan.' };
  }

  try {
    const resp = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response, ...(remoteip ? { remoteip } : {}) }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const json = await resp.json().catch(() => null);
    if (json?.success) return { ok: true };

    // Token kedaluwarsa/terpakai/forged — semuanya ditolak dengan pesan sama
    // agar tidak membocorkan kode kegagalan ke penyerang.
    return { ok: false, error: 'Verifikasi captcha gagal. Muat ulang halaman lalu coba lagi.' };
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
