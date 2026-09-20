/**
 * Alur status pengajuan materi - sumber kebenaran transisi.
 *
 * Delapan status PRD:
 *   draft            - belum dikirim (disimpan sementara di klien)
 *   menunggu_review  - terkirim, menunggu pemeriksaan admin
 *   perlu_revisi     - admin meminta PIC memperbaiki/mengunggah ulang materi
 *   disetujui        - materi lolos review
 *   ditolak          - materi tidak dapat digunakan
 *   siap_dipasang    - disetujui dan menunggu proses pemasangan
 *   sudah_dipasang   - materi telah dipasang tim operasional
 *   selesai          - periode pemasangan berakhir
 *
 * Catatan FR-040/AC 11.4: pemasangan hanya untuk materi **disetujui**, sehingga
 * `disetujui` boleh langsung ke `sudah_dipasang`. `siap_dipasang` adalah langkah
 * opsional yang tetap disediakan agar tabel transisi PRD terpenuhi.
 *
 * Duplikat cermin: src/utils/statusFlow.ts - jaga keduanya sinkron
 * (dikunci __tests__/api/status-flow.test.js).
 */

export const SUBMISSION_STATUSES = [
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
export const STATUS_TRANSITIONS = {
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
export const INSTALLABLE_STATUSES = ['disetujui', 'siap_dipasang'];

export function isSubmissionStatus(value) {
  return SUBMISSION_STATUSES.includes(String(value || ''));
}

/** Boleh pindah dari `from` ke `to`? */
export function canTransition(from, to) {
  const allowed = STATUS_TRANSITIONS[String(from || '')];
  if (!allowed) return false;
  return allowed.includes(String(to || ''));
}

export function isInstallableStatus(status) {
  return INSTALLABLE_STATUSES.includes(String(status || ''));
}
