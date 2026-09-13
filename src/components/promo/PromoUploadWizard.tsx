/**
 * Wizard pengajuan media promosi — 3 langkah:
 *   1. Pilih media (spesifikasi + rules)
 *   2. Data tenant (pemilih dari API tenant) + PIC + tanggal pasang + catatan
 *   3. Kirim materi — unggah file (presign R2 → PUT → submit DB) ATAU
 *      kirim tautan (Google Drive/Dropbox/WeTransfer) untuk file besar.
 *
 * Status: idle → uploading → success | error. Pesan error server verbatim.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronDown, FileText, Film,
  ImageIcon, Link2, Loader2, ShieldCheck, Store, Upload, X,
} from 'lucide-react';
import { fetchMediaTypes, presignUpload, putFile, submitPromo } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { MAX_FILE_BYTES, MIME_LABELS, CATEGORY_LABELS } from '../../constants/promo';
import { TenantSearchSelect } from './TenantSearchSelect';
import type { PromoMediaType, TenantOption } from '../../types/promo';

type Step = 1 | 2 | 3;
type SubmitState = 'idle' | 'uploading' | 'success' | 'error';
/** Sumber materi: unggah langsung ke R2, atau tautan penyimpanan tenant. */
type SourceMode = 'upload' | 'link';

/** Format diterima ('JPEG,MP4') → mime map FE. */
function acceptedMimes(media: PromoMediaType | null): string[] {
  if (!media?.accepted_formats) return [];
  return media.accepted_formats
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .flatMap((label) => {
      if (label === 'JPEG') return ['image/jpeg'];
      if (label === 'PNG') return ['image/png'];
      if (label === 'PDF') return ['application/pdf'];
      if (label === 'MP4') return ['video/mp4'];
      return [];
    });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const STEPS: Array<{ label: string }> = [
  { label: 'Pilih Media' },
  { label: 'Data Tenant' },
  { label: 'Kirim Materi' },
];

/** Tautan materi harus http(s) — cerminan LINK_RE di server. */
function isValidLink(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

function FileIcon({ mime }: { mime: string }) {
  if (mime === 'video/mp4') return <Film className="h-8 w-8 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />;
  if (mime === 'application/pdf') return <FileText className="h-8 w-8 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />;
  return <ImageIcon className="h-8 w-8 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />;
}

export default function PromoUploadWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectSlug = searchParams.get('media') || '';

  const [mediaTypes, setMediaTypes] = useState<PromoMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [picName, setPicName] = useState('');
  const [picPhone, setPicPhone] = useState('');
  const [installationDate, setInstallationDate] = useState('');
  const [notes, setNotes] = useState('');

  const [sourceMode, setSourceMode] = useState<SourceMode>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [ticketId, setTicketId] = useState('');

  const selectedMedia = useMemo(
    () => mediaTypes.find((m) => m.slug === selectedSlug) ?? null,
    [mediaTypes, selectedSlug],
  );
  const mimes = useMemo(() => acceptedMimes(selectedMedia), [selectedMedia]);
  const formatsLabel = selectedMedia?.accepted_formats || '';

  // Load katalog aktif; pre-select dari query param.
  useEffect(() => {
    let cancelled = false;
    fetchMediaTypes()
      .then((rows) => {
        if (cancelled) return;
        setMediaTypes(rows);
        if (preselectSlug && rows.some((m) => m.slug === preselectSlug)) {
          setSelectedSlug(preselectSlug);
          setStep(2);
        }
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [preselectSlug]);

  function validateFile(f: File): string {
    if (!mimes.includes(f.type)) {
      return `Format file tidak didukung. Gunakan ${formatsLabel}.`;
    }
    if (f.size > MAX_FILE_BYTES) {
      return `File melebihi 50MB (${formatBytes(f.size)}). Kompres atau potong durasi video Anda.`;
    }
    return '';
  }

  function onFileChange(f: File | null) {
    setFileError('');
    if (!f) { setFile(null); return; }
    const err = validateFile(f);
    if (err) { setFileError(err); setFile(null); return; }
    setFile(f);
  }

  function goStep2() {
    if (!selectedSlug) {
      setFieldErrors({ media: 'Pilih salah satu jenis media promosi dulu.' });
      return;
    }
    setFieldErrors({});
    setStep(2);
  }

  function goStep3() {
    const errs: Record<string, string> = {};
    if (!tenant) {
      errs.tenant = manualMode
        ? 'Nama tenant wajib diisi.'
        : 'Pilih tenant dari daftar, bukan ketik bebas.';
    }
    if (!picName.trim()) errs.pic_name = 'Nama PIC wajib diisi.';
    if (!picPhone.trim()) errs.pic_phone = 'Nomor telepon PIC wajib diisi.';
    else if (!/^[+0-9][0-9\s-]{7,19}$/.test(picPhone.trim())) errs.pic_phone = 'Format nomor telepon tidak valid.';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setStep(3);
  }

  /** Materi siap dikirim: file valid (mode unggah) atau tautan valid (mode tautan). */
  const materialReady = sourceMode === 'upload' ? Boolean(file) : isValidLink(linkUrl);

  async function handleSubmit() {
    if (!selectedMedia || !tenant) return;
    if (sourceMode === 'upload' ? !file : !isValidLink(linkUrl)) {
      if (sourceMode === 'link') setLinkError('Tautan harus dimulai dengan http:// atau https://');
      return;
    }
    setSubmitState('uploading');
    setSubmitError('');
    try {
      // Mode unggah: presign → PUT ke R2 → insert row. Mode tautan: insert saja.
      let fileUrl = '';
      if (sourceMode === 'upload' && file) {
        const { uploadUrl, publicUrl } = await presignUpload(file);
        await putFile(uploadUrl, file);
        fileUrl = publicUrl;
      }
      const result = await submitPromo({
        media_type_slug: selectedMedia.slug,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        pic_name: picName.trim(),
        pic_phone: picPhone.trim(),
        installation_date: installationDate,
        notes: notes.trim(),
        file_url: fileUrl,
        file_name: sourceMode === 'upload' && file ? file.name : '',
        mime_type: sourceMode === 'upload' && file ? file.type : '',
        file_size_bytes: sourceMode === 'upload' && file ? file.size : 0,
        link_url: sourceMode === 'link' ? linkUrl.trim() : '',
        device_fingerprint: getDeviceFingerprint(),
      });
      setTicketId(result.id.replace(/-/g, '').slice(0, 8).toUpperCase() || '—');
      setSubmitState('success');
    } catch (err) {
      setSubmitState('error');
      setSubmitError(err instanceof Error ? err.message : 'Gagal mengirim pengajuan. Coba lagi.');
    }
  }

  // ─── Layar sukses ───
  if (submitState === 'success') {
    return (
      <div className="ui-dashboard-page min-h-screen">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
          <div className="ui-dashboard-surface p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600 dark:text-green-400" aria-hidden="true" />
            <h1 className="font-display mt-4 text-2xl font-bold text-slate-900 dark:text-white">Pengajuan Terkirim!</h1>
            <p className="ui-text-muted mt-2 text-sm">
              Materi <span className="font-semibold">{selectedMedia?.name}</span> dari tenant{' '}
              <span className="font-semibold">{tenant?.name}</span> sudah kami terima.
              Tim Tenant Relations akan meninjau pengajuan Anda.
            </p>
            <div className="ui-dashboard-control mx-auto mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5">
              <span className="text-xs ui-text-muted">Nomor tiket</span>
              <span className="font-mono text-sm font-bold tracking-widest text-brand-primary-700 dark:text-brand-primary-300">{ticketId}</span>
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Simpan nomor tiket ini. Status pengajuan dapat dipantau di halaman Riwayat dari perangkat ini.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/riwayat" className="ui-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition">
                Lihat Riwayat
              </Link>
              <Link to="/" className="ui-dashboard-control inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-dashboard-page min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => (step === 1 ? navigate('/') : setStep((s) => (s === 3 ? 2 : 1) as Step))}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary-700 transition hover:text-brand-primary-800 dark:text-brand-primary-300"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {step === 1 ? 'Beranda' : 'Sebelumnya'}
          </button>
          <span className="text-xs font-semibold text-brand-primary-600 dark:text-brand-primary-400">
            Metropolitan Mall Bekasi
          </span>
        </div>

        {/* Stepper */}
        <ol className="mb-6 flex items-center gap-2" aria-label="Langkah pengajuan">
          {STEPS.map((s, i) => {
            const n = (i + 1) as Step;
            const active = n === step;
            const done = n < step;
            return (
              <li key={s.label} className="flex flex-1 items-center gap-2">
                <span
                  aria-current={active ? 'step' : undefined}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? 'bg-brand-primary-600 text-white'
                      : active
                        ? 'border-2 border-brand-primary-600 text-brand-primary-700 dark:text-brand-primary-300'
                        : 'border border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : n}
                </span>
                <span className={`hidden text-xs font-semibold sm:block ${active ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        {loading && (
          <div className="ui-dashboard-surface flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
            <span className="text-sm ui-text-muted">Memuat katalog media…</span>
          </div>
        )}
        {loadError && (
          <div className="ui-alert-panel p-4" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Gagal memuat katalog media.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">Muat ulang halaman atau coba lagi sebentar.</p>
          </div>
        )}

        {!loading && !loadError && (
          <div className="ui-dashboard-surface overflow-hidden">
            {/* ─── Langkah 1: Pilih media ─── */}
            {step === 1 && (
              <div className="p-5 sm:p-6">
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Pilih Jenis Media Promosi</h1>
                <p className="ui-text-muted mt-1 text-sm">Pilih media tempat materi Anda akan dipasang.</p>

                <div className="mt-5 space-y-2">
                  {mediaTypes.map((m) => (
                    <label
                      key={m.slug}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                        selectedSlug === m.slug
                          ? 'border-brand-primary-500 bg-brand-primary-50 dark:border-brand-primary-400 dark:bg-brand-primary-950/40'
                          : 'border-slate-200 hover:border-brand-primary-300 dark:border-slate-700 dark:hover:border-brand-primary-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="media_type"
                        value={m.slug}
                        checked={selectedSlug === m.slug}
                        onChange={() => { setSelectedSlug(m.slug); setRulesOpen(false); setFile(null); setFileError(''); }}
                        className="mt-1 h-4 w-4 accent-[var(--brand-tosca)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{m.name}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {CATEGORY_LABELS[m.category] ?? m.category}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs ui-text-muted">
                          {[m.size_spec, m.material_spec].filter(Boolean).join(' · ') || 'Lihat ketentuan'}
                        </span>
                        {selectedSlug === m.slug && m.rules && (
                          <span className="mt-2 block">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); setRulesOpen((v) => !v); }}
                              aria-expanded={rulesOpen}
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary-700 dark:text-brand-primary-300"
                            >
                              Ketentuan
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${rulesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                            </button>
                            {rulesOpen && (
                              <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                                {m.rules.split('\n').filter(Boolean).map((line, i) => (
                                  <li key={i}>• {line}</li>
                                ))}
                              </ul>
                            )}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>

                {fieldErrors.media && <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.media}</p>}

                <button
                  type="button"
                  onClick={goStep2}
                  disabled={!selectedSlug}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition"
                >
                  Lanjut — Data Tenant
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 2: Data tenant ─── */}
            {step === 2 && (
              <div className="p-5 sm:p-6">
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Data Tenant & PIC</h1>
                <p className="ui-text-muted mt-1 text-sm">
                  Materi untuk <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedMedia?.name}</span>.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="tenant-search" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Nama Tenant <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <p className="mb-1.5 text-xs ui-text-muted">
                      {manualMode
                        ? 'Daftar tenant tidak tersedia — isi nama tenant secara manual.'
                        : 'Pilih dari daftar tenant aktif Metropolitan Mall Bekasi.'}
                    </p>
                    <TenantSearchSelect
                      id="tenant-search"
                      value={tenant?.name ?? ''}
                      onTenantSelect={(t) => { setTenant(t); setFieldErrors((e) => ({ ...e, tenant: '' })); }}
                      onManualModeChange={setManualMode}
                      error={fieldErrors.tenant}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="pic-name" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Nama PIC <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <input
                        id="pic-name"
                        type="text"
                        value={picName}
                        maxLength={100}
                        autoComplete="name"
                        onChange={(e) => { setPicName(e.target.value); setFieldErrors((er) => ({ ...er, pic_name: '' })); }}
                        className={`ui-dashboard-control w-full rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.pic_name ? 'border-red-300 dark:border-red-700' : ''}`}
                        aria-invalid={fieldErrors.pic_name ? true : undefined}
                      />
                      {fieldErrors.pic_name && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.pic_name}</p>}
                    </div>
                    <div>
                      <label htmlFor="pic-phone" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Nomor Telepon PIC <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <input
                        id="pic-phone"
                        type="tel"
                        inputMode="tel"
                        value={picPhone}
                        maxLength={20}
                        autoComplete="tel"
                        placeholder="08xx xxxx xxxx"
                        onChange={(e) => { setPicPhone(e.target.value); setFieldErrors((er) => ({ ...er, pic_phone: '' })); }}
                        className={`ui-dashboard-control w-full rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.pic_phone ? 'border-red-300 dark:border-red-700' : ''}`}
                        aria-invalid={fieldErrors.pic_phone ? true : undefined}
                      />
                      {fieldErrors.pic_phone && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.pic_phone}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="installation-date" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Tanggal Pemasangan yang Diharapkan <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                    </label>
                    <input
                      id="installation-date"
                      type="date"
                      value={installationDate}
                      onChange={(e) => setInstallationDate(e.target.value)}
                      className="ui-dashboard-control w-full rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100 sm:max-w-xs"
                    />
                    <p className="mt-1 text-xs ui-text-muted">
                      Permintaan tanggal bersifat harapan — jadwal final ditentukan Mall (lihat ketentuan media).
                    </p>
                  </div>

                  <div>
                    <label htmlFor="notes" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Catatan untuk Tim Tenant Relations <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                    </label>
                    <textarea
                      id="notes"
                      value={notes}
                      maxLength={1000}
                      rows={4}
                      placeholder={selectedMedia?.category === 'social' ? 'Tulis caption media sosial Anda di sini…' : 'Permintaan atau keterangan tambahan…'}
                      onChange={(e) => setNotes(e.target.value)}
                      className="ui-dashboard-control w-full rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100"
                    />
                    {selectedMedia?.category === 'social' && (
                      <p className="mt-1 text-xs ui-text-muted">Caption wajib menyebutkan lokasi lantai tenant Anda.</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goStep3}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition"
                >
                  Lanjut — Kirim Materi
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 3: Kirim materi (unggah / tautan) ─── */}
            {step === 3 && selectedMedia && (
              <div className="p-5 sm:p-6">
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Kirim Materi</h1>
                <p className="ui-text-muted mt-1 text-sm">
                  {selectedMedia.name} menerima <span className="font-semibold">{formatsLabel}</span>
                  {selectedMedia.size_spec && <> — ukuran {selectedMedia.size_spec}</>}.
                </p>

                {/* Ringkasan */}
                <dl className="ui-dashboard-control mt-4 grid gap-x-6 gap-y-2 rounded-xl p-4 text-xs sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold ui-text-muted">Tenant:</dt>
                    <dd className="text-slate-900 dark:text-white">{tenant?.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold ui-text-muted">PIC:</dt>
                    <dd className="text-slate-900 dark:text-white">{picName} · {picPhone}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold ui-text-muted">Media:</dt>
                    <dd className="text-slate-900 dark:text-white">{selectedMedia.name}</dd>
                  </div>
                  {installationDate && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-semibold ui-text-muted">Tgl pasang:</dt>
                      <dd className="text-slate-900 dark:text-white">{installationDate}</dd>
                    </div>
                  )}
                </dl>

                {/* Pemilih sumber materi */}
                <div className="mt-5 flex gap-2" role="group" aria-label="Cara mengirim materi">
                  <button
                    type="button"
                    aria-pressed={sourceMode === 'upload'}
                    onClick={() => { setSourceMode('upload'); setLinkError(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      sourceMode === 'upload'
                        ? 'border-brand-primary-500 bg-brand-primary-50 text-brand-primary-800 dark:border-brand-primary-400 dark:bg-brand-primary-950/40 dark:text-brand-primary-200'
                        : 'border-slate-200 text-slate-600 hover:border-brand-primary-300 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Unggah File
                  </button>
                  <button
                    type="button"
                    aria-pressed={sourceMode === 'link'}
                    onClick={() => { setSourceMode('link'); setFileError(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      sourceMode === 'link'
                        ? 'border-brand-primary-500 bg-brand-primary-50 text-brand-primary-800 dark:border-brand-primary-400 dark:bg-brand-primary-950/40 dark:text-brand-primary-200'
                        : 'border-slate-200 text-slate-600 hover:border-brand-primary-300 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Kirim Tautan
                  </button>
                </div>

                {/* Tautan materi — untuk file besar / folder Drive */}
                {sourceMode === 'link' && (
                  <div className="mt-4">
                    <label htmlFor="link-input" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Tautan Materi <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <p className="mb-1.5 text-xs ui-text-muted">
                      Tempel tautan Google Drive, Dropbox, atau WeTransfer. Pastikan aksesnya
                      terbuka untuk tim Tenant Relations (bukan “restricted”).
                    </p>
                    <input
                      id="link-input"
                      type="url"
                      inputMode="url"
                      value={linkUrl}
                      maxLength={500}
                      placeholder="https://drive.google.com/…"
                      onChange={(e) => { setLinkUrl(e.target.value); setLinkError(''); }}
                      className={`ui-dashboard-control w-full rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100 ${linkError ? 'border-red-300 dark:border-red-700' : ''}`}
                      aria-invalid={linkError ? true : undefined}
                    />
                    {linkError && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {linkError}
                      </p>
                    )}
                  </div>
                )}

                {/* File picker */}
                {sourceMode === 'upload' && (
                <div className="mt-5">
                  <label htmlFor="file-input" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                    File Materi <span aria-hidden="true" className="text-red-500">*</span>
                  </label>
                  <label
                    htmlFor="file-input"
                    className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition ${
                      fileError
                        ? 'border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-950/20'
                        : 'border-brand-primary-300 bg-brand-primary-50/40 hover:border-brand-primary-400 dark:border-brand-primary-700 dark:bg-brand-primary-950/20'
                    }`}
                  >
                    <Upload className="h-8 w-8 text-brand-primary-600 dark:text-brand-primary-400" aria-hidden="true" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {file ? 'Ganti file' : 'Klik untuk memilih file'}
                    </span>
                    <span className="text-xs ui-text-muted">{formatsLabel} · maks 50MB</span>
                    <input
                      id="file-input"
                      type="file"
                      accept={mimes.join(',')}
                      className="sr-only"
                      onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                    />
                  </label>

                  {fileError && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      {fileError}
                    </p>
                  )}

                  {file && !fileError && (
                    <div className="ui-dashboard-control mt-3 flex items-center gap-3 rounded-xl p-3">
                      <FileIcon mime={file.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{file.name}</p>
                        <p className="text-xs ui-text-muted">
                          {MIME_LABELS[file.type] ?? file.type} · {formatBytes(file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        aria-label="Hapus file"
                        className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                )}

                {submitState === 'error' && (
                  <div className="ui-alert-panel mt-4 p-4" role="alert">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200">Pengajuan gagal.</p>
                    <p className="mt-1 text-xs text-red-700 dark:text-red-300">{submitError}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!materialReady || submitState === 'uploading'}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition"
                >
                  {submitState === 'uploading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {sourceMode === 'upload' ? 'Mengunggah & Mengirim…' : 'Mengirim…'}
                    </>
                  ) : (
                    <>
                      <Send_ />
                      Kirim Pengajuan
                    </>
                  )}
                </button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] ui-text-muted">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {sourceMode === 'upload'
                    ? 'File tersimpan aman dan hanya dilihat tim Tenant Relations.'
                    : 'Tautan hanya dilihat tim Tenant Relations.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Ikon kirim lokal (dipisah agar render helper tidak berulang). */
function Send_() {
  return <ArrowRight className="h-4 w-4" aria-hidden="true" />;
}
