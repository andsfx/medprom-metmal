/**
 * Bukti tayang pemasangan: dua kanal, satu bentuk tampilan.
 *
 * Tabel `promo_installations` menyimpan bukti tayang lewat DUA kanal resmi:
 *   - kanal tautan  : kolom `proof_url`;
 *   - kanal unggahan: kolom `proof_file_url` + metadata (`proof_file_name`,
 *     `proof_mime`, `proof_size_bytes`, `proof_uploaded_by`, `proof_uploaded_at`).
 *
 * Halaman status tenant (`SubmissionDetail`, dipakai juga oleh pelacakan nomor
 * dan halaman batch cetak) dan Sheet detail staf (`AdminDashboardPage`) memakai
 * helper ini supaya kedua kanal dirender dengan bentuk yang sama dan tidak
 * menyimpang lagi.
 *
 * Kanal ditentukan dari ADA/TIDAKNYA URL, bukan dari kolom `proof_kind`: baris
 * warisan dapat punya `proof_kind` bawaan 'link' sekaligus berkas unggahan yang
 * sudah tersimpan, dan URL kosong tidak boleh berubah menjadi tautan mati.
 */
import { MIME_LABELS } from '../constants/promo';
import type { InstallationRow } from '../types/promo';

/** Satu baris bukti tayang siap render. */
export interface ProofView {
  /** Kanal bukti: 'link' (tautan) atau 'upload' (berkas terunggah staf). */
  kind: 'link' | 'upload';
  /** Label baris (`dt`), mis. "Bukti" atau "Bukti tayang". */
  label: string;
  /** Teks tautan yang dilihat pengguna. */
  linkLabel: string;
  /** Tujuan tautan (selalu tidak kosong). */
  url: string;
  /** Nama berkas asli - kanal unggahan saja, '' bila tidak ada. */
  fileName: string;
  /** "JPEG · 1.5 MB" - jenis + ukuran, '' bila tidak ada. */
  meta: string;
  /** "Diunggah oleh Admin · 1 Okt 2026 09.30", '' bila tidak ada. */
  uploaded: string;
}

/** Ukuran berkas untuk tampilan; '' bila tidak diketahui atau nol. */
export function formatProofSize(bytes?: number | null): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Label jenis berkas dari MIME; '' bila MIME tidak ada. */
export function proofMimeLabel(mime?: string | null): string {
  const key = String(mime || '').trim().toLowerCase();
  if (!key) return '';
  return MIME_LABELS[key] ?? key;
}

function formatWaktu(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Baris bukti tayang yang boleh dirender untuk satu baris pemasangan.
 * Baris kosong TIDAK dihasilkan: tidak ada data berarti tidak ada baris.
 */
export function installationProofViews(inst?: InstallationRow | null): ProofView[] {
  const views: ProofView[] = [];

  const tautan = String(inst?.proof_url || '').trim();
  if (tautan) {
    views.push({
      kind: 'link',
      label: 'Bukti',
      linkLabel: 'Buka bukti pemasangan',
      url: tautan,
      fileName: '',
      meta: '',
      uploaded: '',
    });
  }

  const berkas = String(inst?.proof_file_url || '').trim();
  if (berkas) {
    const meta = [
      proofMimeLabel(inst?.proof_mime),
      formatProofSize(inst?.proof_size_bytes),
    ].filter(Boolean).join(' · ');
    const oleh = String(inst?.proof_uploaded_by || '').trim();
    const waktu = formatWaktu(inst?.proof_uploaded_at);
    views.push({
      kind: 'upload',
      label: 'Bukti tayang',
      linkLabel: 'Buka bukti tayang',
      url: berkas,
      fileName: String(inst?.proof_file_name || '').trim(),
      meta,
      uploaded: oleh
        ? (waktu ? `Diunggah oleh ${oleh} · ${waktu}` : `Diunggah oleh ${oleh}`)
        : (waktu ? `Diunggah ${waktu}` : ''),
    });
  }

  return views;
}
