/**
 * Detail pengajuan - dipakai bersama halaman status ber-token, halaman
 * pelacakan nomor, dan daftar item batch cetak, supaya ketiga jalur publik
 * menampilkan bentuk yang identik.
 *
 * Bentuknya TIKET PEKERJAAN, bukan kartu: kepala tiket memuat nomor job
 * monospace dan stempel status, tepi perforasi memisahkan kepala dari isi,
 * data pengajuan disajikan sebagai tabel titik penghubung, dan riwayat
 * (status maupun versi materi) sebagai daftar bergaris - bukan kartu
 * bersarang. Tidak mengambil data sendiri - pemanggil yang memuat.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle, ExternalLink, Info, Loader2, Send, Upload, X,
} from 'lucide-react';
import Stamp from './Stamp';
import { submitRevision, uploadFile, errorsFromApiError } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { installationProofViews } from '../../utils/proof';
import { daysUntil } from '../../utils/pricing';
import { toIsoDate } from '../../utils/leadTime';
import type { StatusPageData } from '../../types/promo';

/** Tanda potong di empat sudut lembar - murni dekoratif, jadi aria-hidden. */
function CropMarks() {
  return (
    <>
      <span className="doc-crop" data-corner="tl" aria-hidden="true" />
      <span className="doc-crop" data-corner="tr" aria-hidden="true" />
      <span className="doc-crop" data-corner="bl" aria-hidden="true" />
      <span className="doc-crop" data-corner="br" aria-hidden="true" />
    </>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Label pelaku riwayat - admin memakai display_name, tenant/system generik. */
function actorLabel(actorType: string, actorName: string): string {
  if (actorType === 'admin') return actorName || 'Tim Tenant Relations';
  if (actorType === 'tenant') return 'Anda (tenant)';
  return 'Sistem';
}

interface SubmissionDetailProps {
  data: StatusPageData;
  /** Dipanggil setelah revisi terkirim agar pemanggil memuat ulang data. */
  onReload: () => Promise<void> | void;
}

export default function SubmissionDetail({ data, onReload }: SubmissionDetailProps) {
  // Halaman pelacakan sudah menampilkan formulir nomor - jangan tautkan ke
  // dirinya sendiri dari catatan di bawah.
  const onTrackPage = useLocation().pathname.startsWith('/lacak');
  // Kanal materi ditentukan dari ADA/TIDAKNYA URL, bukan hanya `source_type`
  // (preseden `src/utils/proof.ts`): `source_type` 'link'/'upload' dengan URL
  // kosong tidak boleh menjadi tautan mati `href=""`.
  const materiUrl = String(
    data.submission.source_type === 'link'
      ? data.submission.link_url
      : data.submission.file_url,
  ).trim();
  // Sisa hari periode (tenant dapat melihat sendiri kapan periodenya berakhir).
  // `null` bila tanggal berakhir kosong/tidak valid. Dihitung dari tanggal
  // perangkat; angka otoritatif tetap milik server pada panel staf.
  const sisaHari = data.submission.air_end_date
    ? daysUntil(data.submission.air_end_date, toIsoDate())
    : null;
  // Form revisi.
  const [revLink, setRevLink] = useState('');
  const [revFile, setRevFile] = useState<File | null>(null);
  const [revMode, setRevMode] = useState<'link' | 'upload'>('link');
  const [revNotes, setRevNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revError, setRevError] = useState('');

  async function handleRevision() {
    setRevError('');
    if (revMode === 'link' && !/^https?:\/\/[^\s]+$/i.test(revLink.trim())) {
      setRevError('Tautan harus dimulai dengan http:// atau https://');
      return;
    }
    if (revMode === 'upload' && !revFile) {
      setRevError('Pilih berkas materi revisi terlebih dahulu.');
      return;
    }

    setSaving(true);
    setProgress(0);
    try {
      let driveFileId = '';
      if (revMode === 'upload' && revFile) {
        const uploaded = await uploadFile(revFile, setProgress);
        driveFileId = uploaded.file_id;
      }
      await submitRevision(data.submission.id, {
        link_url: revMode === 'link' ? revLink.trim() : '',
        drive_file_id: driveFileId,
        file_name: revMode === 'upload' && revFile ? revFile.name : '',
        mime_type: revMode === 'upload' && revFile ? revFile.type : '',
        notes: revNotes.trim(),
        device_fingerprint: getDeviceFingerprint(),
      });
      setRevLink('');
      setRevFile(null);
      setRevNotes('');
      await onReload();
    } catch (err) {
      const messages = errorsFromApiError(err);
      setRevError(messages.length > 0 ? messages.join('; ') : (err instanceof Error ? err.message : 'Gagal mengirim revisi.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tiket pekerjaan: kepala (nomor job + stempel) dipisahkan tepi
       * perforasi dari isi tiket. */}
      <article className="doc-sheet overflow-hidden">
        <CropMarks />

        <div className="px-7 pt-7 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="doc-plate-no">Tiket pengajuan</span>
              <p className="doc-num mt-1 text-sm font-bold tracking-wide text-slate-900">
                {data.submission.submission_number}
              </p>
              <h2 className="ui-title-card mt-1 text-slate-900">
                {data.submission.material_title || data.submission.media_type_slug}
              </h2>
              <p className="mt-0.5 text-xs ui-text-muted">
                {data.submission.tenant_name}
                {data.submission.unit_number ? ` · Unit ${data.submission.unit_number}` : ''}
              </p>
            </div>
            <Stamp status={data.submission.status} className="shrink-0" />
          </div>
        </div>

        <div className="doc-perf" />

        {/* Tabel data pengajuan: label kiri, nilai kanan, dihubungkan titik. */}
        <div className="px-7 py-4">
          <dl className="doc-rows">
            <div className="doc-row">
              <dt>Media</dt>
              <span className="doc-leader" aria-hidden="true" />
              <dd>{data.submission.media_type_slug}</dd>
            </div>
            {data.submission.campaign_name && (
              <div className="doc-row">
                <dt>Campaign</dt>
                <span className="doc-leader" aria-hidden="true" />
                <dd>{data.submission.campaign_name}</dd>
              </div>
            )}
            {data.submission.media_target && (
              <div className="doc-row">
                <dt>Lokasi</dt>
                <span className="doc-leader" aria-hidden="true" />
                <dd>{data.submission.media_target}</dd>
              </div>
            )}
            {(data.submission.air_start_date || data.submission.air_end_date) && (
              <div className="doc-row">
                <dt>Periode</dt>
                <span className="doc-leader" aria-hidden="true" />
                <dd>
                  {data.submission.air_start_date || '-'} s/d {data.submission.air_end_date || '-'}
                  {sisaHari !== null && (
                    <span className={`ml-1.5 text-xs font-semibold ${sisaHari < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      ({sisaHari > 0 ? `${sisaHari} hari lagi` : sisaHari === 0 ? 'berakhir hari ini' : `lewat ${Math.abs(sisaHari)} hari`})
                    </span>
                  )}
                </dd>
              </div>
            )}
            {data.submission.installation_date && (
              <div className="doc-row">
                <dt>Tgl pasang</dt>
                <span className="doc-leader" aria-hidden="true" />
                <dd>{data.submission.installation_date}</dd>
              </div>
            )}
            <div className="doc-row">
              <dt>Diajukan</dt>
              <span className="doc-leader" aria-hidden="true" />
              <dd>{formatDateTime(data.submission.created_at)}</dd>
            </div>
            {data.submission.material_description && (
              <div className="doc-row items-start">
                <dt className="pt-0.5">Deskripsi</dt>
                <span className="doc-leader mt-2.5" aria-hidden="true" />
                <dd className="text-left font-sans text-xs leading-snug font-normal">
                  {data.submission.material_description}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {data.submission.review_notes && (
          <>
            <div className="doc-perf" />
            <div className="px-7 py-4">
              <p className="doc-plate-no">Catatan Tim Tenant Relations</p>
              <p className="mt-1.5 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {data.submission.review_notes}
              </p>
            </div>
          </>
        )}

        {/* Materi: tiga kanal. 'none' berasal dari pengajuan cetak yang formnya
         * tidak meminta berkas (materi menyusul lewat alur revisi); dulu kanal
         * ini ikut dirender sebagai berkas, sehingga tenant melihat tautan
         * `href=""` pada pengajuan yang baru saja ia kirim. Kanal tanpa materi
         * kini dinyatakan sebagai baris informasi, bukan tautan. Kanal
         * 'link'/'upload' yang URL-nya kosong diperlakukan sama: baris
         * informasi, bukan anchor mati (kunci dari ADA/TIDAKNYA URL). */}
        <div className="doc-perf" />
        <div className="px-7 py-4">
          <p className="doc-plate-no">
            {data.submission.source_type === 'link'
              ? 'Tautan materi'
              : data.submission.source_type === 'upload' ? 'Berkas materi' : 'Materi'}
          </p>
          {data.submission.source_type === 'none' ? (
            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">
              Materi menyusul setelah pengajuan disetujui.
            </p>
          ) : materiUrl ? (
            <a
              href={materiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 break-all text-sm font-medium text-brand-primary-700 dark:text-brand-primary-300"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {data.submission.source_type === 'link'
                ? materiUrl
                : (data.submission.file_name || 'Lihat berkas')}
            </a>
          ) : (
            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">
              {data.submission.source_type === 'link'
                ? 'Tautan materi belum tersedia.'
                : 'Berkas materi belum tersedia.'}
            </p>
          )}
        </div>
      </article>

      {/* Pemasangan (FR-047) - lembar terpisah, data sebagai titik penghubung. */}
      {data.installation && (
        <div className="doc-sheet p-5">
          <h2 className="ui-title-card text-slate-900">Informasi Pemasangan</h2>
          <dl className="doc-rows mt-3">
            <div className="doc-row">
              <dt>Lokasi</dt>
              <span className="doc-leader" aria-hidden="true" />
              <dd>{data.installation.media_location}</dd>
            </div>
            {(data.installation.start_date || data.installation.end_date) && (
              <div className="doc-row">
                <dt>Periode</dt>
                <span className="doc-leader" aria-hidden="true" />
                <dd>
                  {data.installation.start_date || '-'} s/d {data.installation.end_date || '-'}
                </dd>
              </div>
            )}
            {data.installation.notes && (
              <div className="doc-row items-start">
                <dt className="pt-0.5">Catatan</dt>
                <span className="doc-leader mt-2.5" aria-hidden="true" />
                <dd className="text-left font-sans text-xs leading-snug font-normal">
                  {data.installation.notes}
                </dd>
              </div>
            )}
            {/* Bukti tayang (FR-047): DUA kanal - tautan dan berkas unggahan
             * staf. Sebelumnya hanya kolom tautan yang dirender, sehingga bukti
             * hasil unggah tidak pernah terlihat tenant. Baris hanya muncul bila
             * kanalnya benar-benar berisi. */}
            {installationProofViews(data.installation).map((p) => (
              <div key={p.kind} className="doc-row items-start">
                <dt className="pt-0.5">{p.label}</dt>
                <span className="doc-leader mt-2.5" aria-hidden="true" />
                <dd className="min-w-0 text-left">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 break-all text-sm font-medium text-brand-primary-700 dark:text-brand-primary-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {p.linkLabel}
                  </a>
                  {p.fileName && <p className="break-all text-xs ui-text-muted">{p.fileName}</p>}
                  {(p.meta || p.uploaded) && (
                    <p className="text-xs ui-text-muted">
                      {[p.meta, p.uploaded].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Form revisi - hanya saat status Perlu Revisi (FR-021) DAN perangkat
       * ini adalah pengirimnya. `is_owner` dihitung server dari fingerprint
       * perangkat (boolean saja; fingerprint mentah tidak dikirim). Tanpa
       * gerbang ini, form tampil di perangkat yang tidak berhak lalu kiriman
       * ditolak server. Penegakan sebenarnya tetap di server. */}
      {data.submission.status === 'perlu_revisi' && data.is_owner !== true && (
        <div className="doc-sheet p-5">
          <h2 className="ui-title-card text-slate-900">Materi Revisi</h2>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            Materi ini perlu diperbaiki, tetapi revisi hanya dapat dikirim dari perangkat yang
            mengirim pengajuan. Buka halaman ini di perangkat tersebut, atau hubungi Tim Tenant
            Relations untuk bantuan.
          </p>
        </div>
      )}
      {data.submission.status === 'perlu_revisi' && data.is_owner === true && (
        <div className="doc-sheet p-5">
          <h2 className="ui-title-card text-slate-900">Kirim Materi Revisi</h2>
          <p className="mt-2 text-xs ui-text-muted">
            Perbaiki materi sesuai catatan di atas, lalu kirim ulang. Materi lama tetap tersimpan
            sebagai versi sebelumnya.
          </p>

          <div className="mt-3 flex gap-2" role="group" aria-label="Cara mengirim revisi">
            <button
              type="button"
              aria-pressed={revMode === 'link'}
              onClick={() => { setRevMode('link'); setRevError(''); }}
              className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                revMode === 'link'
                  ? 'border-brand-primary-500 bg-brand-primary-50 text-brand-primary-800 dark:border-brand-primary-400 dark:bg-brand-primary-950/40 dark:text-brand-primary-200'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              Kirim Tautan
            </button>
            <button
              type="button"
              aria-pressed={revMode === 'upload'}
              onClick={() => { setRevMode('upload'); setRevError(''); }}
              className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                revMode === 'upload'
                  ? 'border-brand-primary-500 bg-brand-primary-50 text-brand-primary-800 dark:border-brand-primary-400 dark:bg-brand-primary-950/40 dark:text-brand-primary-200'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              Unggah File
            </button>
          </div>

          {revMode === 'link' ? (
            <div className="mt-3">
              <label htmlFor="rev-link" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Tautan Materi Revisi
              </label>
              <input
                id="rev-link"
                type="url"
                inputMode="url"
                value={revLink}
                maxLength={500}
                placeholder="https://drive.google.com/…"
                onChange={(e) => { setRevLink(e.target.value); setRevError(''); }}
                className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          ) : (
            <div className="mt-3">
              <label htmlFor="rev-file" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Berkas Materi Revisi
              </label>
              <label
                htmlFor="rev-file"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-brand-primary-300 bg-brand-primary-50/40 p-5 text-sm font-medium text-slate-700 transition hover:border-brand-primary-400 dark:border-brand-primary-700 dark:bg-brand-primary-950/20 dark:text-slate-200"
              >
                <Upload className="h-5 w-5 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />
                {revFile ? revFile.name : 'Klik untuk memilih berkas'}
                <input
                  id="rev-file"
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    setRevFile(e.target.files?.[0] ?? null);
                    setRevError('');
                    e.target.value = '';
                  }}
                />
              </label>
              {revFile && (
                <p className="doc-num mt-1.5 text-xs ui-text-muted">
                  {(revFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              )}
            </div>
          )}

          <div className="mt-3">
            <label htmlFor="rev-notes" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Catatan <span className="text-xs font-normal ui-text-muted">(opsional)</span>
            </label>
            <textarea
              id="rev-notes"
              rows={3}
              maxLength={1000}
              value={revNotes}
              onChange={(e) => setRevNotes(e.target.value)}
              className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {revError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {revError}
            </p>
          )}

          <button
            type="button"
            onClick={handleRevision}
            disabled={saving}
            className="ui-btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {revMode === 'upload' && progress > 0 ? `Mengirim… ${progress}%` : 'Mengirim…'}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Kirim Revisi
              </>
            )}
          </button>
        </div>
      )}

      {data.submission.status === 'disetujui' && !data.installation && (
        <p className="ui-control flex items-start gap-1.5 rounded-md p-3 text-xs ui-text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Materi Anda telah disetujui dan menunggu proses pemasangan oleh tim Mall.
        </p>
      )}

      {/* Riwayat status (FR-020) - baris bertanggal, dipisahkan garis. */}
      <div className="doc-sheet">
        <CropMarks />
        <div className="px-7 py-4">
          <div className="flex items-baseline gap-4 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
            <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">Riwayat Status</h2>
            <span className="doc-plate-no ml-auto">{data.history.length} baris</span>
          </div>
          <ol className="mt-3">
            {data.history.map((h) => (
              <li key={h.id} className="border-b border-[color:var(--rule-color)] py-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <Stamp status={h.to_status} />
                  <span className="doc-num text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {formatDateTime(h.created_at)}
                  </span>
                  <span className="text-xs ui-text-muted">{actorLabel(h.actor_type, h.actor_name)}</span>
                </div>
                {h.comment && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{h.comment}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Riwayat versi materi (FR-030) - daftar bergaris, bukan kartu bersarang. */}
      {data.files.length > 0 && (
        <div className="doc-sheet">
          <CropMarks />
          <div className="px-7 py-4">
            <div className="flex items-baseline gap-4 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
              <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">Riwayat Versi Materi</h2>
              <span className="doc-plate-no ml-auto">{data.files.length} versi</span>
            </div>
            <ul className="mt-3">
              {data.files.map((f) => {
                // Sama seperti blok materi: kanal versi ditentukan dari
                // ADA/TIDAKNYA URL, agar versi tanpa URL tidak menjadi tautan
                // mati `href=""`.
                const versiUrl = String(f.source_type === 'link' ? f.link_url : f.file_url).trim();
                return (
                  <li
                    key={f.id}
                    className="flex items-start justify-between gap-3 border-b border-[color:var(--rule-color)] py-3 text-xs last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="doc-num font-semibold text-slate-800 dark:text-slate-100">
                        Versi {f.version}{f.version === 1 ? ' (awal)' : ''}
                      </p>
                      <p className="mt-0.5 ui-text-muted">{formatDateTime(f.created_at)}</p>
                      {f.notes && <p className="mt-0.5 ui-text-muted">{f.notes}</p>}
                    </div>
                    {versiUrl ? (
                      <a
                        href={versiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 font-medium text-brand-primary-700 dark:text-brand-primary-300"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Buka
                      </a>
                    ) : (
                      <span className="shrink-0 ui-text-muted">Tautan belum tersedia</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <p className="ui-prose ui-body flex items-start gap-1.5 px-1 text-slate-600 dark:text-slate-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Simpan nomor pengajuan dan tautan status Anda. Siapa pun yang memiliki keduanya dapat
        melihat status pengajuan, jadi jangan bagikan ke pihak yang tidak berkepentingan.
      </p>

      {!onTrackPage && (
        <p className="px-1 text-xs ui-text-muted">
          Kehilangan tautan?{' '}
          <Link to="/lacak" className="font-semibold text-brand-primary-700 dark:text-brand-primary-300">
            Lacak dengan nomor pengajuan
          </Link>
          .
        </p>
      )}
    </div>
  );
}
