import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Stamp, { stampTone } from '../Stamp';
import { STATUS_LABELS } from '../../../constants/promo';

describe('Stamp', () => {
  it('menampilkan label Indonesia untuk tiap status PRD', () => {
    render(<Stamp status="perlu_revisi" />);
    expect(screen.getByText('Perlu Revisi')).toBeInTheDocument();
  });

  it('memberi nada warna yang membedakan tiap hasil akhir', () => {
    // Disetujui = hijau, perlu revisi = amber, ditolak = merah, menunggu = biru;
    // siap/terpasang/selesai punya nada sendiri (MIGRATION.md W2 opsi B).
    expect(stampTone('disetujui')).toBe('ok');
    expect(stampTone('siap_dipasang')).toBe('siap');
    expect(stampTone('sudah_dipasang')).toBe('pasang');
    expect(stampTone('selesai')).toBe('done');
    expect(stampTone('perlu_revisi')).toBe('rev');
    expect(stampTone('ditolak')).toBe('no');
    expect(stampTone('menunggu_review')).toBe('wait');
    expect(stampTone('draft')).toBe('wait');
  });

  it('menandai nada lewat data-tone supaya gaya bisa dipetakan CSS', () => {
    const { container } = render(<Stamp status="ditolak" />);
    expect(container.querySelector('[data-tone="no"]')).not.toBeNull();
  });

  it('status tak dikenal tidak pecah: label jatuh ke nilai mentah', () => {
    render(<Stamp status="status_baru" />);
    expect(screen.getByText('status_baru')).toBeInTheDocument();
    expect(stampTone('status_baru')).toBe('wait');
  });

  it('setiap status PRD punya label dan nada', () => {
    for (const [kode, label] of Object.entries(STATUS_LABELS)) {
      const { unmount } = render(<Stamp status={kode} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(['ok', 'rev', 'no', 'wait', 'siap', 'pasang', 'done']).toContain(stampTone(kode));
      unmount();
    }
  });
});
