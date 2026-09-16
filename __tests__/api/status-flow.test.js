/**
 * Kontrak: alur status harus identik antara FE (src/utils/statusFlow.ts) dan
 * server (server/src/lib/statusFlow.js). Duplikasi ini disengaja (proyek tanpa
 * paket bersama), jadi test ini yang menjaganya tidak menyimpang.
 */
import { describe, it, expect } from 'vitest';
import * as fe from '../../src/utils/statusFlow';
import * as be from '../../server/src/lib/statusFlow.js';

describe('status flow FE ≡ server', () => {
  it('daftar status sama persis', () => {
    expect(be.SUBMISSION_STATUSES).toEqual(fe.SUBMISSION_STATUSES);
    expect(be.SUBMISSION_STATUSES).toHaveLength(8);
  });

  it('status awal sama', () => {
    expect(be.INITIAL_STATUS).toBe(fe.INITIAL_STATUS);
    expect(be.INITIAL_STATUS).toBe('menunggu_review');
  });

  it('tabel transisi sama persis', () => {
    expect(be.STATUS_TRANSITIONS).toEqual(fe.STATUS_TRANSITIONS);
  });

  it('canTransition sepakat untuk seluruh pasangan status', () => {
    for (const from of be.SUBMISSION_STATUSES) {
      for (const to of be.SUBMISSION_STATUSES) {
        expect(be.canTransition(from, to)).toBe(fe.canTransition(from, to));
      }
    }
  });

  it('status dapat dipasang sama (FR-040)', () => {
    expect(be.INSTALLABLE_STATUSES).toEqual(fe.INSTALLABLE_STATUSES);
    for (const s of be.SUBMISSION_STATUSES) {
      expect(be.isInstallableStatus(s)).toBe(fe.isInstallableStatus(s));
    }
  });

  it('setiap status baru muncul di tabel transisi (kecuali status akhir)', () => {
    for (const s of be.SUBMISSION_STATUSES) {
      expect(be.STATUS_TRANSITIONS[s]).toBeDefined();
    }
    // Status akhir tidak punya tujuan.
    expect(be.STATUS_TRANSITIONS.ditolak).toEqual([]);
    expect(be.STATUS_TRANSITIONS.selesai).toEqual([]);
  });

  it('transisi PRD §8 terpenuhi', () => {
    expect(be.canTransition('menunggu_review', 'perlu_revisi')).toBe(true);
    expect(be.canTransition('menunggu_review', 'disetujui')).toBe(true);
    expect(be.canTransition('menunggu_review', 'ditolak')).toBe(true);
    expect(be.canTransition('perlu_revisi', 'menunggu_review')).toBe(true);
    expect(be.canTransition('disetujui', 'siap_dipasang')).toBe(true);
    expect(be.canTransition('siap_dipasang', 'sudah_dipasang')).toBe(true);
    expect(be.canTransition('sudah_dipasang', 'selesai')).toBe(true);
    // Lompatan status tidak diizinkan.
    expect(be.canTransition('menunggu_review', 'sudah_dipasang')).toBe(false);
    expect(be.canTransition('ditolak', 'disetujui')).toBe(false);
  });
});
