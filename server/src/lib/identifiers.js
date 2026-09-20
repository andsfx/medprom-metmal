/**
 * Pembuat nomor pengajuan dan token status (FR-016, FR-018).
 *
 *   nomor  : MP-YYMMDD-XXXXXX  (mis. MP-260916-7Q4K2B, mudah dibacakan tenant)
 *   token  : 32 karakter base64url dari 24 byte acak (tidak dapat ditebak)
 *
 * Keduanya acak (bukan berurutan) agar tidak membocorkan volume pengajuan;
 * keunikan ditegakkan unique index di DB, pemanggil mengulang bila bentrok.
 */
import { randomBytes } from 'node:crypto';

/** Alfabet tanpa karakter rancu (0/O, 1/I/L) untuk nomor yang dibacakan. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(length) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Nomor pengajuan: MP-YYMMDD-XXXXXX. */
export function generateSubmissionNumber(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `MP-${yy}${mm}${dd}-${randomCode(6)}`;
}

/** Nomor batch pengajuan cetak: MPB-YYMMDD-XXXXXX (varian nomor pengajuan). */
export function generateBatchNumber(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `MPB-${yy}${mm}${dd}-${randomCode(6)}`;
}

/** Token status: 32 karakter base64url (aman untuk URL). */
export function generateStatusToken() {
  return randomBytes(24).toString('base64url');
}
