/**
 * Pengaturan aplikasi (tabel `app_settings`) - pasangan key-value yang diubah
 * admin dari dashboard saat berjalan. Berbeda dari flag build-time `VITE_*`
 * (di-inline saat build, tidak bisa diubah tanpa deploy ulang), nilai di sini
 * dibaca dari DB tiap permintaan sehingga saklar on/off benar-benar dinamis.
 */
import { db } from '../db.js';

export const TAX_PROOF_ENABLED_KEY = 'tax_proof_enabled';

/** Baca satu pengaturan; kembalikan `fallback` bila baris belum ada. */
export async function getSetting(key, fallback = '') {
  const { rows } = await db.query(
    'SELECT value FROM app_settings WHERE key = $1 LIMIT 1',
    [key],
  );
  return rows[0]?.value ?? fallback;
}

/** Tulis satu pengaturan (upsert), menyegarkan `updated_at`. */
export async function setSetting(key, value) {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, String(value)],
  );
}

/**
 * Apakah unggah bukti pembayaran pajak diaktifkan admin. Bawaan: MATI
 * (fail-safe: fitur baru tidak menyala sendiri di instance yang belum
 * menjalankan seed/migrasi).
 *
 * Kegagalan baca (mis. tabel `app_settings` belum ada karena migrasi belum
 * dijalankan, atau DB sedang bermasalah) DIANGGAP MATI, bukan dilempar ke
 * pemanggil: tanpa ini, `POST /promo/submit-batch` yang memanggilnya akan
 * membalas 500 dan MEMATIKAN seluruh pengajuan cetak pada jendela antara
 * deploy kode dan migrasi skema.
 */
export async function isTaxProofEnabled() {
  try {
    return (await getSetting(TAX_PROOF_ENABLED_KEY, 'false')) === 'true';
  } catch {
    return false;
  }
}
