/**
 * Lead time materi — CERMIN dari src/utils/leadTime.ts (jaga keduanya sinkron).
 *
 * Aturan diturunkan dari teks `rules` katalog karena tidak seragam:
 * "2 hari sebelum pemasangan" (kalender) vs "3 hari kerja sebelum pemasangan",
 * dan beberapa media tanpa aturan sama sekali. Jangan diasumsikan per kategori.
 *
 * Keterbatasan: hari kerja hanya mengecualikan Sabtu/Minggu; libur nasional
 * tidak diperhitungkan.
 */

/** Cocokkan "2 hari sebelum pemasangan" / "3 hari kerja sebelum pemasangan". */
const LEAD_RE = /(\d+)\s*hari(\s+kerja)?\s+sebelum\s+pemasangan/i;

/** Turunkan aturan lead time dari teks `rules`; null bila media tak mengatur. */
export function parseLeadTime(rules) {
  const match = LEAD_RE.exec(rules || '');
  if (!match) return null;
  const days = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return { days, businessDays: Boolean(match[2]) };
}

/** Tanggal sebagai YYYY-MM-DD (waktu lokal). */
export function toIsoDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIso(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Tanggal pasang paling awal yang diizinkan bila dihitung dari `fromIso`. */
export function earliestInstallationDate(fromIso, lead) {
  const cursor = parseIso(fromIso);
  if (!cursor || !lead) return fromIso;

  if (!lead.businessDays) {
    cursor.setDate(cursor.getDate() + lead.days);
    return formatIso(cursor);
  }

  let remaining = lead.days;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return formatIso(cursor);
}

/** Deskripsi aturan untuk pesan ke tenant. */
export function describeLeadTime(lead) {
  return `${lead.days} hari ${lead.businessDays ? 'kerja ' : ''}sebelum pemasangan`;
}

/** Alamat email kanal materi — sumbernya teks `rules` katalog (deck 2026). */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Kanal email materi bila `rules` menyebutkannya; null bila tidak. */
export function parseMaterialEmail(rules) {
  const match = EMAIL_RE.exec(rules || '');
  return match ? match[0] : null;
}

/**
 * Periksa tanggal pasang terhadap lead time media.
 * `fromIso` = tanggal acuan (hari ini saat submit).
 */
export function checkInstallationDate(installationDate, rules, fromIso) {
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
