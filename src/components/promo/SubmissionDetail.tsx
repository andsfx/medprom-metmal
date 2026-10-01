/**
 * Detail pengajuan - dipakai bersama halaman status ber-token, halaman
 * pelacakan nomor, dan daftar item batch cetak, supaya ketiga jalur publik
 * menampilkan bentuk yang identik.
 *
 * Bentuknya SATU BLOK RINGKAS, bukan tiket: nomor pengajuan mono dan stempel
 * status di kepala, data pengajuan sebagai pasangan label/nilai (`.ui-specs`,
 * tanpa titik penghubung), riwayat status sebagai garis waktu (`.ui-timeline`),
 * dan riwayat versi materi sebagai baris-baris bergaris. Tidak mengambil data
 * sendiri - pemanggil yang memuat.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle, ExternalLink, Info, Loader2, Send, Upload, X,
} from 'lucide-react';
import Stamp from './Stamp';
import { STATUS_LABELS } from '../../constants/promo';
import { submitRevision, uploadFile, errorsFromApiError } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { installationProofViews } from '../../utils/proof';
import { daysUntil } from '../../utils/pricing';
import { toIsoDate } from '../../utils/leadTime';
import type { StatusPageData } from '../../types/promo';

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
      {/* Blok ringkas: nomor pengajuan mono + stempel status, lalu data
       * pengajuan sebagai pasangan label/nilai tanpa titik penghubung. */}
      <article className="ui-card overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="ui-label">Tiket pengajuan</span>
              <p className="ui-num mt-1 text-sm font-medium">
                {data.submission.submission_number}
              </p>
              <h2 className="ui-title-card mt-1">
                {data.submission.material_title || data.submission.media_type_slug}
              </h2>
              <p className="ui-meta ui-text-muted mt-0.5">
                {data.submission.tenant_name}
                {data.submission.unit_number ? ` · Unit ${data.submission.unit_number}` : ''}
              </p>
            </div>
            <Stamp status={data.submission.status} className="shrink-0" />
          </div>
        </div>

        {/* Data pengajuan: label redup di kiri, nilai di kanan. */}
        <div className="px-5 pb-4">
          <dl className="ui-specs">
            <div className="ui-spec">
              <dt>Media</dt>
              <dd>{data.submission.media_type_slug}</dd>
            </div>
            {data.submission.campaign_name && (
              <div className="ui-spec">
                <dt>Campaign</dt>
                <dd>{data.submission.campaign_name}</dd>
              </div>
            )}
            {data.submission.media_target && (
              <div className="ui-spec">
                <dt>Lokasi</dt>
                <dd>{data.submission.media_target}</dd>
              </div>
            )}
            {(data.submission.air_start_date || data.submission.air_end_date) && (
              <div className="ui-spec">
                <dt>Periode</dt>
                <dd data-numeric="true">
                  {data.submission.air_start_date || '-'} s/d {data.submission.air_end_date || '-'}
                  {sisaHari !== null && (
                    <span className={`ml-1.5 ui-meta font-semibold ${sisaHari < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                      ({sisaHari > 0 ? `${sisaHari} hari lagi` : sisaHari === 0 ? 'berakhir hari ini' : `lewat ${Math.abs(sisaHari)} hari`})
                    </span>
                  )}
                </dd>
              </div>
            )}
            {data.submission.installation_date && (
              <div className="ui-spec">
                <dt>Tgl pasang</dt>
                <dd data-numeric="true">{data.submission.installation_date}</dd>
              </div>
            )}
            <div className="ui-spec">
              <dt>Diajukan</dt>
              <dd data-numeric="true">{formatDateTime(data.submission.created_at)}</dd>
            </div>
            {data.submission.material_description && (
              <div className="ui-spec">
                <dt>Deskripsi</dt>
                <dd>{data.submission.material_description}</dd>
              </div>
            )}
          </dl>
        </div>

        {data.submission.review_notes && (
          <>
            <div className="ui-rule" />
            <div className="px-5 py-4">
              <span className="ui-label">Catatan Tim Tenant Relations</span>
              <p className="mt-1.5 rounded-[var(--radius-control)] bg-[var(--surface-offset)] p-3 ui-dense leading-relaxed text-slate-700">
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
        <div className="ui-rule" />
        <div className="px-5 py-4">
          <span className="ui-label">
            {data.submission.source_type === 'link'
              ? 'Tautan materi'
              : data.submission.source_type === 'upload' ? 'Berkas materi' : 'Materi'}
          </span>
          {data.submission.source_type === 'none' ? (
            <p className="mt-1.5 ui-dense text-slate-700">
              Materi menyusul setelah pengajuan disetujui.
            </p>
          ) : materiUrl ? (
            <a
              href={materiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="app-pressable ui-focus-ring mt-1.5 inline-flex min-h-11 items-center gap-1.5 break-all ui-dense font-medium underline underline-offset-[3px] ui-text-strong"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {data.submission.source_type === 'link'
                ? materiUrl
                : (data.submission.file_name || 'Lihat berkas')}
            </a>
          ) : (
            <p className="mt-1.5 ui-dense text-slate-700">
              {data.submission.source_type === 'link'
                ? 'Tautan materi belum tersedia.'
                : 'Berkas materi belum tersedia.'}
            </p>
          )}
        </div>

        {/* Bukti pembayaran pajak (media cetak ber-PPN). Hanya muncul bila ada
         * bukti - baik yang diunggah tenant saat mengajukan maupun yang
         * ditambahkan staf dari dashboard. */}
        {data.submission.tax_proof_file_url && (
          <>
            <div className="ui-rule" />
            <div className="px-5 py-4">
              <span className="ui-label">Bukti pembayaran pajak</span>
              <a
                href={data.submission.tax_proof_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="app-pressable ui-focus-ring mt-1.5 inline-flex min-h-11 items-center gap-1.5 break-all ui-dense font-medium underline underline-offset-[3px] ui-text-strong"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {data.submission.tax_proof_file_name || 'Lihat bukti pajak'}
              </a>
            </div>
          </>
        )}
      </article>

      {/* Pemasangan (FR-047) - lembar terpisah, data sebagai titik penghubung. */}
      {data.installation && (
        <div className="ui-card p-5">
          <h2 className="ui-title-section">Informasi Pemasangan</h2>
          <dl className="ui-specs mt-3">
            <div className="ui-spec">
              <dt>Lokasi</dt>
              <dd>{data.installation.media_location}</dd>
            </div>
            {(data.installation.start_date || data.installation.end_date) && (
              <div className="ui-spec">
                <dt>Periode</dt>
                <dd data-numeric="true">
                  {data.installation.start_date || '-'} s/d {data.installation.end_date || '-'}
                </dd>
              </div>
            )}
            {data.installation.notes && (
              <div className="ui-spec">
                <dt>Catatan</dt>
                <dd>{data.installation.notes}</dd>
              </div>
            )}
            {/* Bukti tayang (FR-047): DUA kanal - tautan dan berkas unggahan
             * staf. Sebelumnya hanya kolom tautan yang dirender, sehingga bukti
             * hasil unggah tidak pernah terlihat tenant. Baris hanya muncul bila
             * kanalnya benar-benar berisi. */}
            {installationProofViews(data.installation).map((p) => (
              <div key={p.kind} className="ui-spec">
                <dt>{p.label}</dt>
                <dd>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="app-pressable ui-focus-ring inline-flex min-h-11 items-center gap-1.5 break-all ui-dense font-medium underline underline-offset-[3px] ui-text-strong"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {p.linkLabel}
                  </a>
                  {p.fileName && <p className="break-all ui-meta ui-text-muted">{p.fileName}</p>}
                  {(p.meta || p.uploaded) && (
                    <p className="ui-meta ui-text-muted">
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
        <div className="ui-card p-5">
          <h2 className="ui-title-section">Materi Revisi</h2>
          <p className="mt-2 ui-body text-slate-700">
            Materi ini perlu diperbaiki, tetapi revisi hanya dapat dikirim dari perangkat yang
            mengirim pengajuan. Buka halaman ini di perangkat tersebut, atau hubungi Tim Tenant
            Relations untuk bantuan.
          </p>
        </div>
      )}
      {data.submission.status === 'perlu_revisi' && data.is_owner === true && (
        <div className="ui-card p-5">
          <h2 className="ui-title-section">Kirim Materi Revisi</h2>
          <p className="ui-meta ui-text-muted mt-2">
            Perbaiki materi sesuai catatan di atas, lalu kirim ulang. Materi lama tetap tersimpan
            sebagai versi sebelumnya.
          </p>

          <div className="mt-3 flex gap-2" role="group" aria-label="Cara mengirim revisi">
            <button
              type="button"
              aria-pressed={revMode === 'link'}
              onClick={() => { setRevMode('link'); setRevError(''); }}
              className={`app-pressable ui-focus-ring min-h-11 flex-1 rounded-[var(--radius-control)] border px-3 py-2 ui-dense font-semibold transition ${
                revMode === 'link'
                  ? 'border-[color:var(--ink-primary)] bg-[var(--surface-offset)] ui-text-strong'
                  : 'border-[color:var(--rule-strong)] ui-text-muted'
              }`}
            >
              Kirim Tautan
            </button>
            <button
              type="button"
              aria-pressed={revMode === 'upload'}
              onClick={() => { setRevMode('upload'); setRevError(''); }}
              className={`app-pressable ui-focus-ring min-h-11 flex-1 rounded-[var(--radius-control)] border px-3 py-2 ui-dense font-semibold transition ${
                revMode === 'upload'
                  ? 'border-[color:var(--ink-primary)] bg-[var(--surface-offset)] ui-text-strong'
                  : 'border-[color:var(--rule-strong)] ui-text-muted'
              }`}
            >
              Unggah File
            </button>
          </div>

{revMode === 'link' ? (
            <div className="mt-3">
              <label htmlFor="rev-link" className="mb-1.5 block ui-dense font-semibold text-slate-800">
                Tautan Materi Revisi
              </label>
              <input
                id="rev-link"
                type="url"
                inputMode="url"
                value={revLink}
                maxLength={500}
                placeholder="https://drive.google.com/..."
                onChange={(e) => { setRevLink(e.target.value); setRevError(''); }}
                className="ui-control ui-focus-ring w-full px-3 py-2.5 text-slate-900 placeholder:text-slate-400"
              />
            </div>
          ) : (
            <div className="mt-3">
              <label htmlFor="rev-file" className="mb-1.5 block ui-dense font-semibold text-slate-800">
                Berkas Materi Revisi
              </label>
              <label
                htmlFor="rev-file"
                className="app-pressable flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-dashed border-[color:var(--rule-strong)] bg-[var(--surface-offset)] p-5 ui-dense font-medium text-slate-700 transition hover:border-[color:var(--ink-primary)]"
              >
                <Upload className="h-5 w-5 text-slate-500" aria-hidden="true" />
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
                <p className="ui-num ui-meta ui-text-muted mt-1.5">
                  {(revFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              )}
            </div>
          )}

          <div className="mt-3">
            <label htmlFor="rev-notes" className="mb-1.5 block ui-dense font-semibold text-slate-800">
              Catatan <span className="ui-meta font-normal ui-text-muted">(opsional)</span>
            </label>
            <textarea
              id="rev-notes"
              rows={3}
              maxLength={1000}
              value={revNotes}
              onChange={(e) => setRevNotes(e.target.value)}
              className="ui-control ui-focus-ring w-full px-3 py-2.5 text-slate-900"
            />
          </div>

          {revError && (
            <p className="mt-2 flex items-center gap-1.5 ui-meta font-medium text-red-600" role="alert">
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
        <p className="ui-meta ui-text-muted flex items-start gap-1.5 rounded-[var(--radius-control)] bg-[var(--surface-offset)] p-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Materi Anda telah disetujui dan menunggu proses pemasangan oleh tim Mall.
        </p>
      )}

      {/* Riwayat status (FR-020) - garis waktu: titik + garis, bukan baris
       * bertanggal. Kejadian terakhir ditandai titik berongga agar "sekarang"
       * terbaca tanpa warna tambahan. */}
      <div className="ui-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="ui-title-section">Riwayat Status</h2>
          <span className="ui-meta ui-text-muted">{data.history.length} baris</span>
        </div>
        <ol className="ui-timeline mt-4">
          {data.history.map((h, i) => (
            <li
              key={h.id}
              className="ui-timeline-item"
              data-current={i === data.history.length - 1 ? 'true' : undefined}
            >
              <b>{STATUS_LABELS[h.to_status] ?? h.to_status}</b>
              <time dateTime={h.created_at}>{formatDateTime(h.created_at)}</time>
              <p className="ui-meta ui-text-muted">{actorLabel(h.actor_type, h.actor_name)}</p>
              {h.comment && <p>{h.comment}</p>}
            </li>
          ))}
        </ol>
      </div>

      {/* Riwayat versi materi (FR-030) - baris bergaris, bukan kartu bersarang. */}
      {data.files.length > 0 && (
        <div className="ui-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="ui-title-section">Riwayat Versi Materi</h2>
            <span className="ui-meta ui-text-muted">{data.files.length} versi</span>
          </div>
          <ul className="mt-1">
            {data.files.map((f) => {
              // Sama seperti blok materi: kanal versi ditentukan dari
              // ADA/TIDAKNYA URL, agar versi tanpa URL tidak menjadi tautan
              // mati `href=""`.
              const versiUrl = String(f.source_type === 'link' ? f.link_url : f.file_url).trim();
              return (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-3 border-b border-[color:var(--rule-color)] py-3 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="ui-num ui-dense font-semibold text-slate-800">
                      Versi {f.version}{f.version === 1 ? ' (awal)' : ''}
                    </p>
                    <p className="ui-meta ui-text-muted mt-0.5">{formatDateTime(f.created_at)}</p>
                    {f.notes && <p className="ui-meta ui-text-muted mt-0.5">{f.notes}</p>}
                  </div>
                  {versiUrl ? (
                    <a
                      href={versiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-pressable ui-focus-ring inline-flex min-h-11 shrink-0 items-center gap-1 ui-dense font-medium underline underline-offset-[3px] ui-text-strong"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Buka
                    </a>
                  ) : (
                    <span className="shrink-0 ui-meta ui-text-muted">Tautan belum tersedia</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="ui-prose ui-body flex items-start gap-1.5 px-1 text-slate-600">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Simpan nomor pengajuan dan tautan status Anda. Siapa pun yang memiliki keduanya dapat
        melihat status pengajuan, jadi jangan bagikan ke pihak yang tidak berkepentingan.
      </p>

      {!onTrackPage && (
        <p className="px-1 ui-meta ui-text-muted">
          Kehilangan tautan?{' '}
          <Link to="/lacak" className="font-semibold underline underline-offset-[3px] ui-text-strong">
            Lacak dengan nomor pengajuan
          </Link>
          .
        </p>
      )}
    </div>
  );
}
