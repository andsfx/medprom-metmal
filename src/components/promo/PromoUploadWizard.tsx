/**
 * Wizard pengajuan media promosi — 3 langkah:
 *   1. Pilih media (spesifikasi + rules)
 *   2. Data tenant (pemilih dari API tenant) + PIC + data materi PRD
 *   3. Kirim materi — dua kanal resmi: kirim tautan penyimpanan tenant
 *      (Google Drive/Dropbox/WeTransfer; kanonis) atau unggah berkas ke Drive
 *      mall. Kanal unggah dapat dimatikan operator lewat
 *      isUploadModeEnabled() (VITE_PROMO_UPLOAD_MODE='0').
 *
 * Status: idle → uploading → success | error. Pesan validasi server dipetakan
 * ke field terkait; sisanya ditampilkan verbatim.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, FileText, Film,
  ImageIcon, Info, Link2, Loader2, ShieldCheck, Upload, X,
} from 'lucide-react';
import { fetchMediaTypes, uploadFile, submitPromo, errorsFromApiError, mapSubmitErrors } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { MAX_FILE_BYTES, MIME_LABELS, CATEGORY_LABELS, MATERIAL_TYPES, isUploadModeEnabled } from '../../constants/promo';
import { checkInstallationDate, toIsoDate, describeLeadTime, parseLeadTime, parseMaterialEmail } from '../../utils/leadTime';
import { TenantSearchSelect } from './TenantSearchSelect';
import AppShell from '../layout/AppShell';
import type { PromoMediaType, TenantOption } from '../../types/promo';

type Step = 1 | 2 | 3;
type SubmitState = 'idle' | 'uploading' | 'success' | 'error';
/** Sumber materi: unggah ke Drive kami, atau tautan penyimpanan tenant. */
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

/** Kunci sessionStorage draf pengajuan (link-only). */
const DRAFT_KEY = 'metmal_promo_draft';

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
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const lewatiResetPertama = useRef(true);

  const [selectedSlug, setSelectedSlug] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [picName, setPicName] = useState('');
  const [picPhone, setPicPhone] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialDescription, setMaterialDescription] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [mediaTarget, setMediaTarget] = useState('');
  const [airStartDate, setAirStartDate] = useState('');
  const [airEndDate, setAirEndDate] = useState('');
  const [installationDate, setInstallationDate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notes, setNotes] = useState('');

  // Dua kanal materi (keduanya resmi): tautan penyimpanan tenant (kanonis) atau
  // unggah berkas ke Drive mall (FR-008..FR-015).
  const [sourceMode, setSourceMode] = useState<SourceMode>('link');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');

  // Setiap pindah langkah: gulir kembali ke atas dan pindahkan fokus ke judul
  // langkah baru. Tanpa ini, pengguna yang menggulir jauh di langkah
  // sebelumnya mendarat di tengah halaman dan tidak melihat judul langkahnya
  // (pernah terukur: judul langkah 2 berada 639px di atas layar).
  useEffect(() => {
    if (lewatiResetPertama.current) {
      lewatiResetPertama.current = false;
      return;
    }
    const judul = stepHeadingRef.current;
    if (!judul) return;
    const area = judul.closest('.app-scroll');
    if (area) area.scrollTop = 0;
    judul.focus();
  }, [step]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [statusToken, setStatusToken] = useState('');
  const [uploadPct, setUploadPct] = useState(0);

  const selectedMedia = useMemo(
    () => mediaTypes.find((m) => m.slug === selectedSlug) ?? null,
    [mediaTypes, selectedSlug],
  );
  const mimes = useMemo(() => acceptedMimes(selectedMedia), [selectedMedia]);
  const formatsLabel = selectedMedia?.accepted_formats || '';

  // Lead time media terpilih (diturunkan dari teks `rules` katalog).
  const leadInfo = useMemo(() => {
    const rules = selectedMedia?.rules || '';
    const lead = parseLeadTime(rules);
    return {
      lead,
      earliest: checkInstallationDate('', rules, toIsoDate()).earliest,
      label: lead ? describeLeadTime(lead) : '',
    };
  }, [selectedMedia]);

  // Kanal email materi (deck mengarahkan social media ke email marketing).
  const materialEmail = useMemo(
    () => parseMaterialEmail(selectedMedia?.rules || ''),
    [selectedMedia],
  );

  // ─── Draf link-only (sessionStorage) ───
  // Reload tak boleh memaksa tenant mengulang dari nol: hanya field teks yang
  // dipulihkan (bukan File — objek itu tak bisa diserialisasi).
  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage diblokir */ }
  }

  function persistDraft() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        selectedSlug, tenantName: tenant?.name ?? '', tenantId: tenant?.id ?? '',
        unitNumber: tenant?.lot ?? '',
        picName, picPhone, campaignName, materialTitle, materialDescription,
        materialType, mediaTarget, airStartDate, airEndDate,
        installationDate, notes, linkUrl,
      }));
    } catch { /* storage penuh / diblokir — draf opsional, jangan gagalkan submit */ }
  }

  // Pulihkan draf saat katalog siap (sekali, setelah mediaTypes termuat).
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current || mediaTypes.length === 0) return;
    draftRestoredRef.current = true;
    let draft: {
      selectedSlug?: string; tenantName?: string; tenantId?: string; unitNumber?: string;
      picName?: string; picPhone?: string; campaignName?: string; materialTitle?: string;
      materialDescription?: string; materialType?: string; mediaTarget?: string;
      airStartDate?: string; airEndDate?: string; installationDate?: string;
      notes?: string; linkUrl?: string;
    } | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch { draft = null; }
    if (!draft) return;
    if (draft.selectedSlug && mediaTypes.some((m) => m.slug === draft!.selectedSlug)) {
      setSelectedSlug(draft.selectedSlug);
      setStep(2);
    }
    if (draft.tenantName) {
      setTenant({
        id: draft.tenantId ?? '', name: draft.tenantName,
        floor: '', lot: draft.unitNumber ?? '', category: '',
      });
    }
    if (draft.picName) setPicName(draft.picName);
    if (draft.picPhone) setPicPhone(draft.picPhone);
    if (draft.campaignName) setCampaignName(draft.campaignName);
    if (draft.materialTitle) setMaterialTitle(draft.materialTitle);
    if (draft.materialDescription) setMaterialDescription(draft.materialDescription);
    if (draft.materialType) setMaterialType(draft.materialType);
    if (draft.mediaTarget) setMediaTarget(draft.mediaTarget);
    if (draft.airStartDate) setAirStartDate(draft.airStartDate);
    if (draft.airEndDate) setAirEndDate(draft.airEndDate);
    if (draft.installationDate) setInstallationDate(draft.installationDate);
    if (draft.notes) setNotes(draft.notes);
    if (draft.linkUrl) setLinkUrl(draft.linkUrl);
  }, [mediaTypes]);

  // Simpan draf saat field berubah (hanya setelah katalog termuat).
  useEffect(() => {
    if (mediaTypes.length === 0) return;
    persistDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mediaTypes, selectedSlug, tenant, picName, picPhone, campaignName, materialTitle,
    materialDescription, materialType, mediaTarget, airStartDate, airEndDate,
    installationDate, notes, linkUrl,
  ]);

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
    if (!campaignName.trim()) errs.campaign_name = 'Nama campaign wajib diisi.';
    if (!materialTitle.trim()) errs.material_title = 'Judul materi wajib diisi.';
    if (!materialDescription.trim()) errs.material_description = 'Deskripsi materi wajib diisi.';
    if (!materialType) errs.material_type = 'Jenis materi wajib dipilih.';
    if (!mediaTarget.trim()) errs.media_target = 'Media atau lokasi pemasangan wajib diisi.';
    if (airStartDate && airEndDate && airEndDate < airStartDate) {
      errs.air_end_date = 'Periode tayang berakhir sebelum tanggal mulai.';
    }
    // Lead time media: cegah tanggal pasang yang mustahil dipenuhi Mall.
    const leadCheck = checkInstallationDate(
      installationDate, selectedMedia?.rules || '', toIsoDate(),
    );
    if (!leadCheck.ok) errs.installation_date = leadCheck.message;
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
    // Persetujuan ketentuan wajib (PRD §9.3) — ditegakkan juga di server.
    if (!termsAccepted) {
      setSubmitError('Centang persetujuan ketentuan sebelum mengirim.');
      return;
    }
    setSubmitState('uploading');
    setSubmitError('');
    setUploadPct(0);
    try {
      // Mode unggah: berkas dikirim ke API lebih dulu → id Drive. Mode tautan: insert saja.
      let driveFileId = '';
      if (sourceMode === 'upload' && file) {
        const uploaded = await uploadFile(file, setUploadPct);
        driveFileId = uploaded.file_id;
      }
      const result = await submitPromo({
        media_type_slug: selectedMedia.slug,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        unit_number: tenant.lot || '',
        pic_name: picName.trim(),
        pic_phone: picPhone.trim(),
        campaign_name: campaignName.trim(),
        material_title: materialTitle.trim(),
        material_description: materialDescription.trim(),
        material_type: materialType,
        media_target: mediaTarget.trim(),
        air_start_date: airStartDate,
        air_end_date: airEndDate,
        installation_date: installationDate,
        terms_accepted: termsAccepted,
        notes: notes.trim(),
        drive_file_id: driveFileId,
        file_name: sourceMode === 'upload' && file ? file.name : '',
        mime_type: sourceMode === 'upload' && file ? file.type : '',
        file_size_bytes: sourceMode === 'upload' && file ? file.size : 0,
        link_url: sourceMode === 'link' ? linkUrl.trim() : '',
        device_fingerprint: getDeviceFingerprint(),
      });
      // FR-016/FR-017: nomor pengajuan dari server; token untuk halaman status.
      setTicketId(result.submission_number || '—');
      setStatusToken(result.status_token || '');
      setSubmitState('success');
      clearDraft();
    } catch (err) {
      setSubmitState('error');
      // Validasi server datang sebagai errors[] tanpa nama field — petakan agar
      // tenant melihat masalahnya di kolom yang tepat, bukan satu alert generik.
      const mapped = mapSubmitErrors(errorsFromApiError(err));
      if (Object.keys(mapped.fields).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...mapped.fields }));
        const stepForField: Record<string, Step> = {
          media: 1, tenant: 2, pic_name: 2, pic_phone: 2, campaign_name: 2,
          material_title: 2, material_description: 2, material_type: 2,
          media_target: 2, air_start_date: 2, air_end_date: 2,
          installation_date: 2, terms_accepted: 2, link_url: 3,
        };
        const target = Object.keys(mapped.fields).map((f) => stepForField[f]).filter(Boolean)[0];
        if (target && target !== 3) setStep(target);
      }
      setSubmitError(mapped.general.length > 0 ? mapped.general.join('; ') : '');
      if (mapped.general.length === 0 && Object.keys(mapped.fields).length === 0) {
        // Tak ada yang bisa dipetakan (mis. error jaringan) — tampilkan pesannya.
        setSubmitError(err instanceof Error ? err.message : 'Gagal mengirim pengajuan. Coba lagi.');
      }
    }
  }

  // ─── Layar sukses ───
  if (submitState === 'success') {
    return (
      <AppShell title="Pengajuan Terkirim" hideTabBar>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="ui-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600 dark:text-green-400" aria-hidden="true" />
            <h2 className="ui-title-section mt-4 text-slate-900 dark:text-white">Pengajuan Terkirim!</h2>
            <p className="ui-body ui-text-muted mt-2">
              Materi <span className="font-semibold">{selectedMedia?.name}</span> dari tenant{' '}
              <span className="font-semibold">{tenant?.name}</span> sudah kami terima.
              Tim Tenant Relations akan meninjau pengajuan Anda.
            </p>
            <div className="ui-control mx-auto mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2.5">
              <span className="text-xs ui-text-muted">Nomor pengajuan</span>
              <span className="font-mono text-sm font-bold tracking-widest text-brand-primary-700 dark:text-brand-primary-300">{ticketId}</span>
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Simpan nomor ini — pakai untuk memantau status kapan saja, tidak perlu akun.
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Status juga dapat dipantau di halaman Riwayat dari perangkat ini.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {statusToken && (
                <Link to={`/status/${statusToken}`} className="ui-btn-primary inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition">
                  Lihat Status Pengajuan
                </Link>
              )}
              <Link to="/lacak" className="ui-control inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Lacak dengan Nomor
              </Link>
              <Link to="/riwayat" className="ui-control inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Lihat Riwayat
              </Link>
              <Link to="/" className="ui-control inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Ajukan Materi"
      back
      onBack={() => (step === 1 ? navigate('/') : setStep((s) => (s === 3 ? 2 : 1) as Step))}
      hideTabBar
    >
      <div className="mx-auto max-w-2xl px-4 py-5">
        {/* Progres langkah — indikator tipis khas aplikasi berlangkah */}
        <nav className="mb-6" aria-label="Langkah pengajuan">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {STEPS[step - 1]?.label}
            </p>
            <p className="text-xs ui-text-muted tabular-nums">
              Langkah {step} dari {STEPS.length}
            </p>
          </div>
          <div
            className="mt-2 flex gap-1.5"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step}
            aria-label="Progres pengajuan"
          >
            {STEPS.map((s, i) => (
              <span
                key={s.label}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < step ? 'bg-brand-primary-600' : 'bg-stone-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </nav>

        {loading && (
          <div className="ui-card flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
            <span className="text-sm ui-text-muted">Memuat katalog media…</span>
          </div>
        )}
        {loadError && (
          <div className="ui-alert p-4" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Gagal memuat katalog media.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">Muat ulang halaman atau coba lagi sebentar.</p>
          </div>
        )}

        {!loading && !loadError && (
          <div className="ui-card overflow-hidden">
            {/* ─── Langkah 1: Pilih media ─── */}
            {step === 1 && (
              <div className="p-5 sm:p-6">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section text-slate-900 focus:outline-none dark:text-white">Pilih Jenis Media Promosi</h2>
                <p className="ui-body ui-text-muted mt-2">Pilih media tempat materi Anda akan dipasang.</p>

                <div className="mt-5 space-y-2">
                  {mediaTypes.map((m) => (
                    <label
                      key={m.slug}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition ${
                        selectedSlug === m.slug
                          ? 'ring-2 ring-brand-primary-600 bg-white dark:ring-1 dark:ring-brand-soft dark:bg-slate-800'
                          : 'border-slate-200 hover:border-stone-400 dark:border-slate-700 dark:hover:border-slate-500'
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
                      {/* Foto contoh — dekoratif: nama media sudah ada di sebelahnya,
                       * jadi sengaja alt="" agar pembaca layar tidak mengulang. */}
                      {m.image_path && (
                        <img
                          src={m.image_path}
                          alt=""
                          width={800}
                          height={600}
                          loading="lazy"
                          decoding="async"
                          className="h-12 w-16 shrink-0 rounded-[var(--radius-control)] object-cover sm:h-14 sm:w-[74px]"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          {/* `min-w-0` + `overflow-wrap: anywhere`: nama media bisa
                           * memuat kata majemuk tanpa titik putus (mis.
                           * "Feed Instagram/Fanpage/TikTok"). Tanpa keduanya,
                           * flex item ini menolak menyusut di bawah lebar
                           * min-content kata terpanjang dan meluber keluar
                           * kartu pada viewport 320px. */}
                          <span className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-white">{m.name}</span>
                          {/* `text-slate-600` (bukan slate-500): di atas latar
                           * `bg-slate-100`, slate-500 hanya 4.34:1 — gagal AA
                           * untuk teks 12px. slate-600 = 6.92:1. */}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
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
                              <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
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
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition"
                >
                  Lanjut — Data Tenant
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 2: Data tenant ─── */}
            {step === 2 && (
              <div className="p-5 sm:p-6">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section text-slate-900 focus:outline-none dark:text-white">Data Tenant &amp; PIC</h2>
                <p className="ui-body ui-text-muted mt-2">
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
                        className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.pic_name ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                        aria-invalid={fieldErrors.pic_name ? true : undefined}
                        aria-describedby={fieldErrors.pic_name ? 'err-pic_name' : undefined}
                      />
                      {fieldErrors.pic_name && <p id="err-pic_name" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.pic_name}</p>}
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
                        className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.pic_phone ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                        aria-invalid={fieldErrors.pic_phone ? true : undefined}
                        aria-describedby={fieldErrors.pic_phone ? 'err-pic_phone' : undefined}
                      />
                      {fieldErrors.pic_phone && <p id="err-pic_phone" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.pic_phone}</p>}
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
                      min={leadInfo.earliest || undefined}
                      onChange={(e) => { setInstallationDate(e.target.value); setFieldErrors((er) => ({ ...er, installation_date: '' })); }}
                      className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-xs"
                    />
                    <p className="mt-1 text-xs ui-text-muted">
                      Permintaan tanggal bersifat harapan — jadwal final ditentukan Mall (lihat ketentuan media).
                    </p>
                    {leadInfo.lead && (
                      <p className="mt-1 text-xs font-medium text-brand-primary-700 dark:text-brand-primary-300">
                        Materi harus diterima paling lambat {leadInfo.label} — tanggal paling awal {leadInfo.earliest}.
                      </p>
                    )}
                    {fieldErrors.installation_date && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{fieldErrors.installation_date}</p>}
                  </div>

                  <div>
                    <label htmlFor="campaign-name" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Nama Campaign <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <input
                      id="campaign-name"
                      type="text"
                      value={campaignName}
                      maxLength={150}
                      placeholder="Contoh: Promo Akhir Tahun"
                      onChange={(e) => { setCampaignName(e.target.value); setFieldErrors((er) => ({ ...er, campaign_name: '' })); }}
                      className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.campaign_name ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                      aria-invalid={fieldErrors.campaign_name ? true : undefined}
                      aria-describedby={fieldErrors.campaign_name ? 'err-campaign_name' : undefined}
                    />
                    {fieldErrors.campaign_name && <p id="err-campaign_name" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.campaign_name}</p>}
                  </div>

                  <div>
                    <label htmlFor="material-title" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Judul Materi <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <input
                      id="material-title"
                      type="text"
                      value={materialTitle}
                      maxLength={200}
                      placeholder="Contoh: Spanduk Diskon 50%"
                      onChange={(e) => { setMaterialTitle(e.target.value); setFieldErrors((er) => ({ ...er, material_title: '' })); }}
                      className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.material_title ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                      aria-invalid={fieldErrors.material_title ? true : undefined}
                      aria-describedby={fieldErrors.material_title ? 'err-material_title' : undefined}
                    />
                    {fieldErrors.material_title && <p id="err-material_title" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.material_title}</p>}
                  </div>

                  <div>
                    <label htmlFor="material-description" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Deskripsi Materi <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="material-description"
                      value={materialDescription}
                      maxLength={2000}
                      rows={3}
                      placeholder="Penjelasan singkat isi materi promosi Anda."
                      onChange={(e) => { setMaterialDescription(e.target.value); setFieldErrors((er) => ({ ...er, material_description: '' })); }}
                      className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.material_description ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                      aria-invalid={fieldErrors.material_description ? true : undefined}
                      aria-describedby={fieldErrors.material_description ? 'err-material_description' : undefined}
                    />
                    {fieldErrors.material_description && <p id="err-material_description" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.material_description}</p>}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="material-type" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Jenis Materi <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <select
                        id="material-type"
                        value={materialType}
                        onChange={(e) => { setMaterialType(e.target.value); setFieldErrors((er) => ({ ...er, material_type: '' })); }}
                        className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.material_type ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                        aria-invalid={fieldErrors.material_type ? true : undefined}
                        aria-describedby={fieldErrors.material_type ? 'err-material_type' : undefined}
                      >
                        <option value="">Pilih jenis materi…</option>
                        {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {fieldErrors.material_type && <p id="err-material_type" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.material_type}</p>}
                    </div>
                    <div>
                      <label htmlFor="media-target" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Media / Lokasi Pemasangan <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <input
                        id="media-target"
                        type="text"
                        value={mediaTarget}
                        maxLength={200}
                        placeholder={selectedMedia?.location_note || 'Contoh: Atrium 1'}
                        onChange={(e) => { setMediaTarget(e.target.value); setFieldErrors((er) => ({ ...er, media_target: '' })); }}
                        className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.media_target ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                        aria-invalid={fieldErrors.media_target ? true : undefined}
                        aria-describedby={fieldErrors.media_target ? 'err-media_target' : undefined}
                      />
                      {fieldErrors.media_target && <p id="err-media_target" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.media_target}</p>}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="air-start-date" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Mulai Tayang <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                      </label>
                      <input
                        id="air-start-date"
                        type="date"
                        value={airStartDate}
                        onChange={(e) => { setAirStartDate(e.target.value); setFieldErrors((er) => ({ ...er, air_start_date: '', air_end_date: '' })); }}
                        className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                      {fieldErrors.air_start_date && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.air_start_date}</p>}
                    </div>
                    <div>
                      <label htmlFor="air-end-date" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Berakhir Tayang <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                      </label>
                      <input
                        id="air-end-date"
                        type="date"
                        value={airEndDate}
                        onChange={(e) => { setAirEndDate(e.target.value); setFieldErrors((er) => ({ ...er, air_end_date: '' })); }}
                        className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                      {fieldErrors.air_end_date && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.air_end_date}</p>}
                    </div>
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
                      className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    {selectedMedia?.category === 'social' && (
                      <p className="mt-1 text-xs ui-text-muted">Caption wajib menyebutkan lokasi lantai tenant Anda.</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goStep3}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition"
                >
                  Lanjut — Kirim Materi
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                {submitError && (
                  <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{submitError}</p>
                )}
              </div>
            )}

            {/* ─── Langkah 3: Kirim materi (unggah / tautan) ─── */}
            {step === 3 && selectedMedia && (
              <div className="p-5 sm:p-6">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section text-slate-900 focus:outline-none dark:text-white">Kirim Materi</h2>
                <p className="ui-body ui-text-muted mt-2">
                  Kirim materi untuk <span className="font-semibold">{selectedMedia.name}</span>
                  {formatsLabel && <> (format {formatsLabel}{selectedMedia.size_spec ? ` · ukuran ${selectedMedia.size_spec}` : ''})</>}.
                  Pilih salah satu cara: unggah berkas ke penyimpanan Mall, atau kirim tautan milik Anda.
                </p>

                {/* Ringkasan */}
                <dl className="ui-control mt-4 grid gap-x-6 gap-y-2 rounded-md p-4 text-xs sm:grid-cols-2">
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
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold ui-text-muted">Campaign:</dt>
                    <dd className="text-slate-900 dark:text-white">{campaignName}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold ui-text-muted">Lokasi:</dt>
                    <dd className="text-slate-900 dark:text-white">{mediaTarget}</dd>
                  </div>
                  {installationDate && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-semibold ui-text-muted">Tgl pasang:</dt>
                      <dd className="text-slate-900 dark:text-white">{installationDate}</dd>
                    </div>
                  )}
                </dl>

                {/* Pemilih sumber materi — dua kanal resmi (tautan kanonis, unggah berkas).
                    Kanal unggah disembunyikan bila operator menonaktifkannya
                    (VITE_PROMO_UPLOAD_MODE='0', instance tanpa kredensial Drive). */}
                {isUploadModeEnabled() ? (
                <div className="mt-5 flex gap-2" role="group" aria-label="Cara mengirim materi">
                  <button
                    type="button"
                    aria-pressed={sourceMode === 'link'}
                    onClick={() => { setSourceMode('link'); setFileError(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                      sourceMode === 'link'
                        ? 'ring-2 ring-brand-primary-600 bg-white text-brand-primary-700 dark:ring-1 dark:ring-brand-soft dark:bg-slate-800 dark:text-brand-primary-400'
                        : 'border-slate-200 text-slate-600 hover:border-stone-400 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Kirim Tautan
                  </button>
                  <button
                    type="button"
                    aria-pressed={sourceMode === 'upload'}
                    onClick={() => { setSourceMode('upload'); setLinkError(''); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                      sourceMode === 'upload'
                        ? 'ring-2 ring-brand-primary-600 bg-white text-brand-primary-700 dark:ring-1 dark:ring-brand-soft dark:bg-slate-800 dark:text-brand-primary-400'
                        : 'border-slate-200 text-slate-600 hover:border-stone-400 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Unggah File
                  </button>
                </div>
                ) : (
                  <p className="mt-5 flex items-start gap-1.5 rounded-md bg-slate-50 p-3 text-xs ui-text-muted dark:bg-slate-800/60">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Kanal unggah berkas sedang tidak diaktifkan pada instance ini — silakan kirim
                    tautan materi Anda.
                  </p>
                )}

                {/* Tautan materi — untuk file besar / folder Drive */}
                {sourceMode === 'link' && (
                  <div className="mt-4">
                    <label htmlFor="link-input" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Tautan Materi <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <p className="mb-1.5 text-xs ui-text-muted">
                      Tempel tautan Google Drive, Dropbox, atau WeTransfer. Buka menu <span className="font-medium">Share</span> →
                      <span className="font-medium"> Anyone with the link can view</span>. Tautan yang masih
                      <span className="font-medium"> restricted</span> akan ditolak saat verifikasi.
                    </p>
                    <input
                      id="link-input"
                      type="url"
                      inputMode="url"
                      value={linkUrl}
                      maxLength={500}
                      placeholder="https://drive.google.com/…"
                      onChange={(e) => { setLinkUrl(e.target.value); setLinkError(''); setFieldErrors((er) => ({ ...er, link_url: '' })); }}
                      className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${linkError || fieldErrors.link_url ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                      aria-invalid={linkError || fieldErrors.link_url ? true : undefined}
                      aria-describedby={linkError || fieldErrors.link_url ? 'err-link_url' : undefined}
                    />
                    {(linkError || fieldErrors.link_url) && (
                      <p id="err-link_url" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {linkError || fieldErrors.link_url}
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
                    className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-8 text-center transition ${
                      fileError
                        ? 'border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-950/20'
                        : ''
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
                      onChange={(e) => {
                        onFileChange(e.target.files?.[0] ?? null);
                        // Reset value supaya memilih file yang sama lagi tetap
                        // memicu onChange (input value tidak menahan pilihan lama).
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {fileError && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      {fileError}
                    </p>
                  )}

                  {file && !fileError && (
                    <div className="ui-control mt-3 flex items-center gap-3 rounded-md p-3">
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

                {/* Kanal email — deck mengarahkan materi social media ke email
                    marketing; tautan pengajuan tetap dipakai untuk verifikasi. */}
                {materialEmail && (
                  <div className="ui-control mt-4 rounded-md p-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Materi social media juga dapat dikirim via email
                    </p>
                    <p className="mt-1 text-xs ui-text-muted">
                      Kirim berkas materi ke{' '}
                      <a
                        href={`mailto:${materialEmail}?subject=${encodeURIComponent(`Materi Promosi ${selectedMedia.name} — ${tenant?.name ?? ''}`)}`}
                        className="font-medium text-brand-primary-700 underline dark:text-brand-primary-300"
                      >
                        {materialEmail}
                      </a>
                      . Tetap isi tautan di atas agar tim Tenant Relations dapat memverifikasi materinya.
                    </p>
                  </div>
                )}

                {submitState === 'error' && (
                  <div className="ui-alert-panel mt-4 p-4" role="alert">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200">Pengajuan gagal.</p>
                    <p className="mt-1 text-xs text-red-700 dark:text-red-300">{submitError}</p>
                  </div>
                )}

                {/* Persetujuan ketentuan — wajib sebelum kirim (PRD §9.3). */}
                <label className="mt-5 flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => { setTermsAccepted(e.target.checked); setFieldErrors((er) => ({ ...er, terms_accepted: '' })); }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-tosca)]"
                  />
                  <span>
                    Saya menyatakan materi ini benar milik/kewenangan tenant saya dan menyetujui
                    ketentuan pemasangan media promosi Metropolitan Mall Bekasi.
                  </span>
                </label>
                {fieldErrors.terms_accepted && (
                  <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.terms_accepted}</p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!materialReady || !termsAccepted || submitState === 'uploading'}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition"
                >
                  {submitState === 'uploading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {sourceMode === 'upload'
                        ? `Mengunggah & Mengirim… ${uploadPct > 0 ? `${uploadPct}%` : ''}`
                        : 'Mengirim…'}
                    </>
                  ) : (
                    <>
                      <Send_ />
                      Kirim Pengajuan
                    </>
                  )}
                </button>
                <p className="ui-body mt-3 flex items-center justify-center gap-1.5 text-center ui-text-muted">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {sourceMode === 'upload'
                    ? 'File tersimpan aman dan hanya dilihat tim Tenant Relations.'
                    : 'Tautan milik Anda. Tim Tenant Relations membukanya untuk verifikasi manual; berkas tidak disalin ke server kami.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

/** Ikon kirim lokal (dipisah agar render helper tidak berulang). */
function Send_() {
  return <ArrowRight className="h-4 w-4" aria-hidden="true" />;
}
