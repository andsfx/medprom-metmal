/**
 * Lead time materi - kapan materi harus diterima sebelum tanggal pasang.
 *
 * Sumber aturan adalah teks `rules` katalog (verbatim deck 2026), yang TIDAK
 * seragam:
 *   - "paling lambat 2 hari sebelum pemasangan"  → 2 hari kalender
 *   - "3 hari kerja sebelum pemasangan"          → 3 hari KERJA
 *   - tanpa kalimat lead time (sosmed, LED Banner) → tanpa batas
 *
 * Karena itu aturan diturunkan dengan mem-parse teks, bukan diasumsikan
 * "outdoor = 2, indoor = 3" - `boom-gate` adalah outdoor yang memakai hari
 * kerja. Parse juga menjaga aturan tetap sinkron bila admin mengedit `rules`.
 *
 * CATATAN PENTING: hari kerja di sini hanya mengecualikan Sabtu/Minggu; libur
 * nasional TIDAK diperhitungkan (proyek tanpa dependensi kalender). Saat libur
 * panjang, batas ini lebih longgar daripada kenyataan.
 *
 * Duplikat cermin: server/src/lib/leadTime.js - jaga keduanya sinkron.
 */

export interface LeadTime {
  days: number;
  /** true bila "hari kerja" (Sabtu/Minggu dilewati). */
  businessDays: boolean;
}

/** Cocokkan "2 hari sebelum pemasangan" / "3 hari kerja sebelum pemasangan". */
const LEAD_RE = /(\d+)\s*hari(\s+kerja)?\s+sebelum\s+pemasangan/i;

/** Turunkan aturan lead time dari teks `rules`; null bila media tak mengatur. */
export function parseLeadTime(rules: string): LeadTime | null {
  const match = LEAD_RE.exec(rules || '');
  if (!match) return null;
  const days = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return { days, businessDays: Boolean(match[2]) };
}

/** Tanggal sebagai YYYY-MM-DD (waktu lokal) - dipakai untuk "hari ini" dan
 *  untuk menormalkan `created_at` pengajuan. */
export function toIsoDate(date: Date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Tanggal pasang paling awal yang diizinkan bila dihitung dari `fromIso`.
 * Tanpa aturan lead time, batasnya adalah `fromIso` itu sendiri (tanggal lalu
 * tetap ditolak di tempat lain).
 */
export function earliestInstallationDate(fromIso: string, lead: LeadTime | null): string {
  const cursor = parseIso(fromIso);
  if (!cursor || !lead) return fromIso;

  if (!lead.businessDays) {
    cursor.setDate(cursor.getDate() + lead.days);
    return toIso(cursor);
  }

  let remaining = lead.days;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return toIso(cursor);
}

/** Deskripsi aturan untuk ditampilkan ke tenant/admin. */
export function describeLeadTime(lead: LeadTime): string {
  return `${lead.days} hari ${lead.businessDays ? 'kerja ' : ''}sebelum pemasangan`.replace('  ', ' ');
}

/** Alamat email kanal materi - sumbernya teks `rules` katalog (deck 2026). */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/**
 * Kanal email materi, bila `rules` media menyebutkannya.
 * Deck 2026 mengarahkan materi social media ke email marketing; media lain
 * tidak menyebut email sama sekali, jadi `null` berarti "tidak ada kanal email".
 */
export function parseMaterialEmail(rules: string): string | null {
  const match = EMAIL_RE.exec(rules || '');
  return match ? match[0] : null;
}

export interface LeadCheck {
  ok: boolean;
  /** null bila media tidak mengatur lead time. */
  lead: LeadTime | null;
  /** Tanggal paling awal yang diizinkan ('' bila tanggal tak valid). */
  earliest: string;
  message: string;
}

/**
 * Periksa tanggal pasang terhadap lead time media.
 * `fromIso` = tanggal acuan (hari ini saat submit; tanggal pengajuan saat audit).
 */
export function checkInstallationDate(
  installationDate: string,
  rules: string,
  fromIso: string,
): LeadCheck {
  const lead = parseLeadTime(rules);
  const earliest = earliestInstallationDate(fromIso, lead);

  if (!installationDate) return { ok: true, lead, earliest, message: '' };
  if (!parseIso(installationDate)) {
    return { ok: false, lead, earliest, message: 'Tanggal pasang harus berformat YYYY-MM-DD.' };
  }
  if (installationDate < earliest) {
    const suffix = lead ? ` (${describeLeadTime(lead)})` : '';
    return {
      ok: false,
      lead,
      earliest,
      message: `Tanggal pasang terlalu dekat. Materi harus diterima paling lambat ${earliest}${suffix}.`,
    };
  }
  return { ok: true, lead, earliest, message: '' };
}
