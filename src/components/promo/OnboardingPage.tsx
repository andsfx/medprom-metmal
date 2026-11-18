/**
 * Onboarding first-launch untuk tenant (prototype `onboarding.html`).
 *
 * Ditampilkan sekali sebelum tenant masuk katalog. Fidelity prototype:
 * badge merek, hero, tiga langkah "Cara mengajukan", dan alur status.
 *
 * Bagian "Media & tarif" prototype berisi HARGA HARDCODE — sengaja TIDAK
 * disalin (MIGRATION.md W1). Alur status dirender dari sumber kebenaran repo
 * (`STATUS_ORDER` + `STATUS_LABELS` + komponen `Stamp`), bukan teks ulang,
 * dengan urutan mengikuti `STATUS_ORDER` (bukan urutan prototype).
 */
import { Check } from 'lucide-react';
import Stamp from './Stamp';
import { STATUS_ORDER, STATUS_LABELS } from '../../constants/promo';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/** Langkah "Cara mengajukan" — teks onboarding statis (bukan data katalog). */
const STEPS: ReadonlyArray<{ judul: string; isi: string }> = [
  { judul: 'Pilih media', isi: 'Katalog media cetak & digital lengkap dengan tarif deck 2026.' },
  { judul: 'Isi kampanye & periode', isi: 'Nama kampanye, jumlah, dan rentang tanggal tayang. Perkiraan biaya dihitung otomatis.' },
  { judul: 'Unggah berkas', isi: 'Materi dikirim ke Drive mall sebelum pengajuan masuk antrean review.' },
];

/** Keterangan alur status — salinan penjelas onboarding (bukan label status). */
const FLOW_DESCRIPTIONS: Record<string, string> = {
  menunggu_review: 'Menunggu tindakan Tenant Relations / Marcom',
  perlu_revisi: 'Ada bagian materi yang harus diperbaiki',
  disetujui: 'Pengajuan lolos review',
  siap_dipasang: 'Materi disiapkan untuk pemasangan',
  sudah_dipasang: 'Media terpasang di lokasi',
  selesai: 'Periode tayang berakhir',
  ditolak: 'Pengajuan ditolak beserta alasannya',
};

export default function OnboardingPage({ onFinish }: { onFinish: () => void }) {
  useDocumentTitle('Selamat Datang');

  return (
    <div className="app-shell">
      <main className="app-scroll" data-tabbar="off">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:pt-12">
          {/* Brand bar: badge MMB saja — bukan app bar, tanpa tab bar. */}
          <span className="inline-grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--ink-primary)] text-[13px] font-bold tracking-[-0.02em] text-[var(--ink-invert)]" aria-hidden="true">
            MMB
          </span>

          <header className="mt-5">
            <h1 className="ui-title-hero text-balance">
              Pengajuan materi promosi Metropolitan Mall Bekasi
            </h1>
            <p className="ui-body ui-text-muted mt-3 max-w-[52ch]">
              Pilih media, isi kampanye dan periode tayang, unggah berkas, lalu
              pantau statusnya sampai terpasang.
            </p>
          </header>

          <section className="mt-10" aria-labelledby="ob-cara">
            <h2 id="ob-cara" className="ui-title-section">Cara mengajukan</h2>
            <ol className="mt-4 list-none space-y-5">
              {STEPS.map((langkah, i) => (
                <li key={langkah.judul} className="flex gap-4">
                  <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--ink-primary)] text-[13px] font-semibold tabular-nums text-[var(--ink-invert)]" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="ui-title-card">{langkah.judul}</p>
                    <p className="ui-dense ui-text-muted mt-0.5">{langkah.isi}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-10" aria-labelledby="ob-status">
            <h2 id="ob-status" className="ui-title-section">Alur status</h2>
            {/* Sumber kebenaran: STATUS_ORDER repo. Satu status per baris,
             * keterangan di kiri, stempel di kanan. */}
            <ol className="mt-4 list-none divide-y divide-[color:var(--rule-color)] border-y border-[color:var(--rule-color)]">
              {STATUS_ORDER.map((kode) => (
                <li key={kode} className="flex items-center justify-between gap-4 py-3">
                  <span className="ui-dense ui-text-muted">{FLOW_DESCRIPTIONS[kode] ?? STATUS_LABELS[kode]}</span>
                  <Stamp status={kode} />
                </li>
              ))}
            </ol>
          </section>

          <button
            type="button"
            onClick={onFinish}
            className="ui-btn-primary app-pressable mt-10 inline-flex w-full items-center justify-center gap-2 px-5 text-base font-semibold sm:w-auto"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Buka Beranda
          </button>
        </div>
      </main>
    </div>
  );
}