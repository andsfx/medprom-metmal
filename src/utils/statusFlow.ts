/**
 * Alur status pengajuan — cermin server/src/lib/statusFlow.js.
 *
 * Delapan status PRD beserta transisi yang diizinkan. Duplikasi ini disengaja
 * (proyek tanpa paket bersama); kesamaannya dikunci
 * __tests__/api/status-flow.test.js.
 */

export const SUBMISSION_STATUSES: string[] = [
  'draft',
  'menunggu_review',
  'perlu_revisi',
  'disetujui',
  'ditolak',
  'siap_dipasang',
  'sudah_dipasang',
  'selesai',
];

/** Status awal setiap pengajuan yang dikirim tenant. */
export const INITIAL_STATUS = 'menunggu_review';

/** Transisi yang diizinkan (PRD §8 + FR-040). */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['menunggu_review'],
  menunggu_review: ['perlu_revisi', 'disetujui', 'ditolak'],
  perlu_revisi: ['menunggu_review'],
  disetujui: ['siap_dipasang', 'sudah_dipasang'],
  ditolak: [],
  siap_dipasang: ['sudah_dipasang'],
  sudah_dipasang: ['selesai'],
  selesai: [],
};

/** Status materi yang boleh dipasang (FR-040). */
export const INSTALLABLE_STATUSES: string[] = ['disetujui', 'siap_dipasang'];

export function isSubmissionStatus(value: unknown): boolean {
  return SUBMISSION_STATUSES.includes(String(value ?? ''));
}

/** Boleh pindah dari `from` ke `to`? */
export function canTransition(from: string, to: string): boolean {
  const allowed = STATUS_TRANSITIONS[String(from ?? '')];
  if (!allowed) return false;
  return allowed.includes(String(to ?? ''));
}

export function isInstallableStatus(status: string): boolean {
  return INSTALLABLE_STATUSES.includes(String(status ?? ''));
}
