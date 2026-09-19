/**
 * Detail pengajuan — dipakai bersama halaman status ber-token dan halaman
 * pelacakan nomor, supaya kedua jalur publik menampilkan bentuk yang identik.
 *
 * Isinya: ringkasan pengajuan, catatan tim, materi terkini, informasi
 * pemasangan, form revisi (bila Perlu Revisi), riwayat status, dan riwayat
 * versi materi. Tidak mengambil data sendiri — pemanggil yang memuat.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ExternalLink, Info, Loader2, Send, Upload, X,
} from 'lucide-react';
import { submitRevision, uploadFile, errorsFromApiError } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { STATUS_LABELS } from '../../constants/promo';
import type { StatusPageData } from '../../types/promo';

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  menunggu_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  perlu_revisi: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  disetujui: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ditolak: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  siap_dipasang: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  sudah_dipasang: 'bg-brand-primary-100 text-brand-primary-800 dark:bg-brand-primary-950/50 dark:text-brand-primary-300',
  selesai: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[status] ?? STATUS_TONE.draft}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Label pelaku riwayat — admin memakai display_name, tenant/system generik. */
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
  // Halaman pelacakan sudah menampilkan formulir nomor — jangan tautkan ke
  // dirinya sendiri dari catatan di bawah.
  const onTrackPage = useLocation().pathname.startsWith('/lacak');
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
      <div className="ui-card overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-brand-primary-50/60 to-transparent px-5 py-4 dark:border-slate-700 dark:from-brand-primary-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold tracking-wide text-brand-primary-700 dark:text-brand-primary-300">
                {data.submission.submission_number}
              </p>
              <h2 className="ui-title-card mt-1 text-slate-900 dark:text-white">
                {data.submission.material_title || data.submission.media_type_slug}
              </h2>
              <p className="mt-0.5 text-xs ui-text-muted">
                {data.submission.tenant_name}
                {data.submission.unit_number ? ` · Unit ${data.submission.unit_number}` : ''}
              </p>
            </div>
            <StatusBadge status={data.submission.status} />
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-2.5 px-5 py-4 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold ui-text-muted">Media</dt>
            <dd className="text-slate-900 dark:text-white">{data.submission.media_type_slug}</dd>
          </div>
          {data.submission.campaign_name && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold ui-text-muted">Campaign</dt>
              <dd className="text-slate-900 dark:text-white">{data.submission.campaign_name}</dd>
            </div>
          )}
          {data.submission.media_target && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold ui-text-muted">Lokasi</dt>
              <dd className="text-slate-900 dark:text-white">{data.submission.media_target}</dd>
            </div>
          )}
          {(data.submission.air_start_date || data.submission.air_end_date) && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold ui-text-muted">Periode</dt>
              <dd className="text-slate-900 dark:text-white">
                {data.submission.air_start_date || '-'} s/d {data.submission.air_end_date || '-'}
              </dd>
            </div>
          )}
          {data.submission.installation_date && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold ui-text-muted">Tgl pasang</dt>
              <dd className="text-slate-900 dark:text-white">{data.submission.installation_date}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold ui-text-muted">Diajukan</dt>
            <dd className="text-slate-900 dark:text-white">{formatDateTime(data.submission.created_at)}</dd>
          </div>
          {data.submission.material_description && (
            <div className="flex gap-2 sm:col-span-2">
              <dt className="shrink-0 font-semibold ui-text-muted">Deskripsi</dt>
              <dd className="text-slate-900 dark:text-white">{data.submission.material_description}</dd>
            </div>
          )}
        </dl>

        {data.submission.review_notes && (
          <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
            <p className="text-xs font-semibold ui-text-muted">Catatan Tim Tenant Relations</p>
            <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              {data.submission.review_notes}
            </p>
          </div>
        )}

        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          <p className="text-xs font-semibold ui-text-muted">
            {data.submission.source_type === 'link' ? 'Tautan materi' : 'Berkas materi'}
          </p>
          <a
            href={data.submission.source_type === 'link' ? data.submission.link_url : data.submission.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 break-all text-sm font-medium text-brand-primary-700 dark:text-brand-primary-300"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {data.submission.source_type === 'link'
              ? data.submission.link_url
              : (data.submission.file_name || 'Lihat berkas')}
          </a>
        </div>
      </div>

      {/* Pemasangan (FR-047) */}
      {data.installation && (
        <div className="ui-card p-5">
          <h2 className="ui-title-card text-slate-900 dark:text-white">Informasi Pemasangan</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold ui-text-muted">Lokasi</dt>
              <dd className="text-slate-900 dark:text-white">{data.installation.media_location}</dd>
            </div>
            {(data.installation.start_date || data.installation.end_date) && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold ui-text-muted">Periode</dt>
                <dd className="text-slate-900 dark:text-white">
                  {data.installation.start_date || '-'} s/d {data.installation.end_date || '-'}
                </dd>
              </div>
            )}
            {data.installation.notes && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold ui-text-muted">Catatan</dt>
                <dd className="text-slate-900 dark:text-white">{data.installation.notes}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Form revisi — hanya saat status Perlu Revisi (FR-021) */}
      {data.submission.status === 'perlu_revisi' && (
        <div className="ui-card p-5">
          <h2 className="ui-title-card text-slate-900 dark:text-white">Kirim Materi Revisi</h2>
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
                <p className="mt-1.5 text-xs ui-text-muted">
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
            className="ui-btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition"
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

      {/* Riwayat status (FR-020) */}
      <div className="ui-card p-5">
        <h2 className="ui-title-card text-slate-900 dark:text-white">Riwayat Status</h2>
        <ol className="mt-3 space-y-3">
          {data.history.map((h) => (
            <li key={h.id} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {STATUS_LABELS[h.to_status] ?? h.to_status}
                </p>
                <p className="text-xs ui-text-muted">
                  {formatDateTime(h.created_at)} · {actorLabel(h.actor_type, h.actor_name)}
                </p>
                {h.comment && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{h.comment}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Riwayat versi materi (FR-030) */}
      {data.files.length > 0 && (
        <div className="ui-card p-5">
          <h2 className="ui-title-card text-slate-900 dark:text-white">Riwayat Versi Materi</h2>
          <ul className="mt-3 space-y-2">
            {data.files.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    Versi {f.version}{f.version === 1 ? ' (awal)' : ''}
                  </p>
                  <p className="mt-0.5 ui-text-muted">{formatDateTime(f.created_at)}</p>
                  {f.notes && <p className="mt-0.5 ui-text-muted">{f.notes}</p>}
                </div>
                <a
                  href={f.source_type === 'link' ? f.link_url : f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-primary-700 dark:text-brand-primary-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Buka
                </a>
              </li>
            ))}
          </ul>
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
