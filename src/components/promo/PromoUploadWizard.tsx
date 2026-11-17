/**
 * Wizard pengajuan media promosi - 3 langkah:
 *   1. Pilih media (spesifikasi + rules)
 *   2. Data tenant (pemilih dari API tenant) + PIC + data materi PRD
 *   3. Kirim materi - dua kanal resmi: kirim tautan penyimpanan tenant
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
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, FileText, Film,
  ImageIcon, Info, Link2, Loader2, ShieldCheck, Upload, X,
} from 'lucide-react';
import { fetchMediaTypes, uploadFile, submitPromo, errorsFromApiError, mapSubmitErrors } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { MAX_FILE_BYTES, MIME_LABELS, CATEGORY_LABELS, MATERIAL_TYPES, isUploadModeEnabled } from '../../constants/promo';
import { checkInstallationDate, toIsoDate, describeLeadTime, parseLeadTime, parseMaterialEmail } from '../../utils/leadTime';
import { TenantSearchSelect } from './TenantSearchSelect';
import AppShell from '../layout/AppShell';
import MediaPriceTag from './MediaPriceTag';
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

/**
 * Urutan field formulir menurut urutan DOM - dipakai saat memindahkan fokus ke
 * field tidak valid pertama. Urutannya sengaja tidak mengikuti urutan
 * pemeriksaan di `goStep3()`, agar pengguna diarahkan ke field paling atas yang
 * bermasalah (sesuai urutan yang mereka lihat), bukan ke pemeriksaan yang
 * kebetulan dijalankan lebih dulu.
 */
const FIELD_ORDER = [
  'media', 'tenant', 'pic_name', 'pic_phone', 'installation_date',
  'campaign_name', 'material_title', 'material_description', 'material_type',
  'media_target', 'air_end_date', 'terms_accepted', 'link_url',
] as const;

/** Nama field → id elemen di DOM (pemetaan yang tidak 1:1). */
const FIELD_ID: Record<string, string> = {
  tenant: 'tenant-search',
  media: 'media-0',
};

/**
 * Fokuskan field tidak valid pertama dan gulirkan ia ke tengah layar.
 *
 * Dipakai dua jalur: validasi klien (`goStep2`/`goStep3`) dan validasi server
 * yang dipetakan ke field (`handleSubmit`). Tanpa ini pengguna yang sudah
 * menggulir jauh ke bawah tidak melihat apa pun berubah saat menekan tombol
 * lanjut/kirim.
 */
function fokusKeField(key: string): void {
  const id = FIELD_ID[key] ?? key.replace(/_/g, '-');
  const el = document.getElementById(id);
  if (!el) return;
  el.focus({ preventScroll: true });
  // `scrollIntoView` tidak ada di jsdom (unit test) - panggil opsional agar
  // jalur fokus tetap teruji tanpa memaksa lingkungan test menyediakannya.
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

/** Kunci sessionStorage draf pengajuan (link-only). */
const DRAFT_KEY = 'metmal_promo_draft';

/** Tautan materi harus http(s) - cerminan LINK_RE di server. */
function isValidLink(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

function FileIcon({ mime }: { mime: string }) {
  if (mime === 'video/mp4') return <Film className="h-8 w-8 text-[color:var(--ink-secondary)]" aria-hidden="true" />;
  if (mime === 'application/pdf') return <FileText className="h-8 w-8 text-[color:var(--ink-secondary)]" aria-hidden="true" />;
  return <ImageIcon className="h-8 w-8 text-[color:var(--ink-secondary)]" aria-hidden="true" />;
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
  /** Dinaikkan setiap validasi klien gagal - memicu pemindahan fokus ke field
   *  tidak valid pertama (lihat efek di bawah). Sengaja BUKAN state turunan
   *  dari `fieldErrors`: mengandalkan perubahan `fieldErrors` akan merebut
   *  fokus setiap kali pengguna memperbaiki satu field, karena tiap ketikan
   *  membuat objek error baru. */
  const [focusErrorTick, setFocusErrorTick] = useState(0);

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

  // Validasi klien gagal → pindahkan fokus ke field tidak valid pertama dan
  // gulirkan ia ke layar. Tanpa ini, pengguna yang sudah menggulir jauh ke
  // bawah menekan "Lanjut" dan tidak melihat apa pun berubah (terukur: field
  // tidak valid pertama 232px DI ATAS layar, fokus tetap di tombol). WCAG
  // 3.3.1 (error identification) mensyaratkan kesalahan teridentifikasi.
  useEffect(() => {
    if (focusErrorTick === 0) return;
    const key = FIELD_ORDER.find((k) => fieldErrors[k]);
    if (!key) return;
    fokusKeField(key);
    // Hanya bergantung pada tick: `fieldErrors` sengaja tidak menjadi
    // dependency agar memperbaiki satu field tidak memindahkan fokus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusErrorTick]);

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

  // Langkah 1 hanya menawarkan media NON-cetak: media berkanal 'cetak'
  // (spanduk, big-banner, umbul-umbul) diajukan lewat form Media Promosi Cetak
  // `/ajukan-cetak` karena materinya menyusul lewat revisi, bukan diunggah di
  // sini. Sengaja memakai `!== 'cetak'`, BUKAN `=== 'digital'`: banyak baris
  // katalog lama tidak mengisi `media_channel`, dan media tanpa penanda kanal
  // harus tetap bisa dipilih seperti perilaku sebelumnya.
  const mediaTypesNonCetak = useMemo(
    () => mediaTypes.filter((m) => m.media_channel !== 'cetak'),
    [mediaTypes],
  );

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
  // dipulihkan (bukan File - objek itu tak bisa diserialisasi).
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
    } catch { /* storage penuh / diblokir - draf opsional, jangan gagalkan submit */ }
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
        const match = preselectSlug
          ? rows.find((m) => m.slug === preselectSlug)
          : undefined;
        if (match) {
          // Media berkanal 'cetak' (spanduk, big-banner, umbul-umbul) BUKAN
          // urusan wizard digital: materinya menyusul lewat revisi, bukan
          // diunggah di sini, dan langkah 1 pun menyaringnya. Kalau slug cetak
          // datang lewat `?media=`, alihkan ke form cetak yang memang membaca
          // param yang sama - jangan melompat ke langkah 2 lalu ditolak server
          // di akhir. Cek `=== 'cetak'` (fail-safe sama dengan penyaring di
          // langkah 1): media tanpa `media_channel` atau berkanal 'digital'
          // tetap memakai perilaku lama.
          if (match.media_channel === 'cetak') {
            navigate(`/ajukan-cetak?media=${encodeURIComponent(match.slug)}`, { replace: true });
            return;
          }
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
      setFocusErrorTick((t) => t + 1);
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
      setFocusErrorTick((t) => t + 1);
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
      fokusKeField('link_url');
      return;
    }
    // Persetujuan ketentuan wajib (PRD §9.3) - ditegakkan juga di server.
    if (!termsAccepted) {
      setSubmitError('Centang persetujuan ketentuan sebelum mengirim.');
      fokusKeField('terms_accepted');
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
      setTicketId(result.submission_number || '-');
      setStatusToken(result.status_token || '');
      setSubmitState('success');
      clearDraft();
    } catch (err) {
      setSubmitState('error');
      // Validasi server datang sebagai errors[] tanpa nama field - petakan agar
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
        // Setelah langkah yang tepat dirender, arahkan fokus ke field yang
        // bermasalah (efek `focusErrorTick` berjalan pada render berikutnya,
        // ketika field itu sudah ada di DOM).
        setFocusErrorTick((t) => t + 1);
      }
      setSubmitError(mapped.general.length > 0 ? mapped.general.join('; ') : '');
      if (mapped.general.length === 0 && Object.keys(mapped.fields).length === 0) {
        // Tak ada yang bisa dipetakan (mis. error jaringan) - tampilkan pesannya.
        setSubmitError(err instanceof Error ? err.message : 'Gagal mengirim pengajuan. Coba lagi.');
      }
    }
  }

  // ─── Layar sukses: tiket pekerjaan ───
  if (submitState === 'success') {
    return (
      <AppShell title="Pengajuan Terkirim" hideTabBar>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="ui-card">
            <div className="px-6 pt-8 pb-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[color:var(--stamp-ok)]" aria-hidden="true" />
              <h2 className="ui-title-section mt-3">Pengajuan Terkirim!</h2>
              <p className="ui-body ui-text-muted mt-2">
                Materi <span className="font-semibold">{selectedMedia?.name}</span> dari tenant{' '}
                <span className="font-semibold">{tenant?.name}</span> sudah kami terima.
                Tim Tenant Relations akan meninjau pengajuan Anda.
              </p>

              {/* Nomor pengajuan = nomor job: data, jadi mono besar. Labelnya
               * ditulis huruf kecil seperti semula: skrip verifikasi produksi
               * mencocokkan /Nomor pengajuan\s*(MP-...)/ persis. */}
              <div className="mt-5 border-y border-[color:var(--rule-color)] py-4">
                <p className="ui-label">Nomor pengajuan</p>
                <p className="ui-number mt-1 text-2xl">{ticketId}</p>
              </div>

              <p className="ui-meta ui-text-muted mt-4">
                Simpan nomor ini untuk memantau status kapan saja, tanpa perlu akun.
              </p>
              <p className="ui-meta ui-text-muted mt-2">
                Status juga dapat dipantau di halaman Riwayat dari perangkat ini.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {statusToken && (
                  <Link to={`/status/${statusToken}`} className="ui-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                    Lihat Status Pengajuan
                  </Link>
                )}
                <Link to="/lacak" className="ui-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                  Lacak dengan Nomor
                </Link>
                <Link to="/riwayat" className="ui-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                  Lihat Riwayat
                </Link>
                <Link to="/" className="ui-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                  Kembali ke Beranda
                </Link>
              </div>
            </div>

            <p className="ui-rule ui-meta ui-text-muted px-6 py-4 text-center">
              Metropolitan Mall Bekasi · Kanal Materi Digital
            </p>
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
{/* Pip langkah: nomor mono + label, bukan pil membulat. */}
        <nav className="mb-6" aria-label="Langkah pengajuan">
          <ol className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[color:var(--rule-color)]">
            {STEPS.map((s, i) => {
              const nomorLangkah = i + 1;
              const aktif = nomorLangkah === step;
              const selesai = nomorLangkah < step;
              return (
                <li key={s.label} className="flex items-baseline gap-2 pb-2">
                  <span
                    className={`ui-number text-xs ${
                      aktif || selesai ? 'ui-text-strong' : 'ui-text-muted'
                    }`}
                  >
                    {String(nomorLangkah).padStart(2, '0')}
                  </span>
                  <span
                    className={`ui-dense font-semibold ${
                      aktif || selesai ? 'ui-text-strong' : 'ui-text-muted'
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
            <li className="ml-auto pb-2">
              <span className="ui-meta ui-text-muted">
                Langkah {step} dari {STEPS.length}
              </span>
            </li>
          </ol>
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
                className={`h-[6px] flex-1 border ${
                  i < step
                    ? 'border-[color:var(--ink-primary)] bg-[color:var(--ink-primary)]'
                    : 'border-[color:var(--rule-strong)] bg-[var(--surface-offset)]'
                }`}
              />
            ))}
          </div>
        </nav>

        {loading && (
          <div className="ui-card flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ink-secondary)]" aria-hidden="true" />
            <span className="ui-dense ui-text-muted">Memuat katalog media…</span>
          </div>
        )}
        {loadError && (
          <div className="ui-alert flex items-start gap-3 p-4" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--stamp-no)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[color:var(--stamp-no)]">Gagal memuat katalog media.</p>
              <p className="mt-1 text-xs ui-text-muted">Muat ulang halaman atau coba lagi sebentar.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && (
          <div className="ui-card overflow-hidden">
            {/* ─── Langkah 1: Pilih media ─── */}
            {step === 1 && (
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[color:var(--rule-strong)] pb-2">
                  <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section">Pilih Jenis Media Promosi</h2>
                  <span className="ui-meta ui-text-muted ml-auto shrink-0">{mediaTypesNonCetak.length} media</span>
                </div>
                <p className="ui-body ui-text-muted mt-3">Pilih media tempat materi Anda akan dipasang.</p>

                {/* Pilihan media = DAFTAR BARIS, bukan kartu berbingkai: satu
                 * `ui-row` per media, dipisah garis rambut. Baris terpilih
                 * ditandai blok tenang + garis kontrol di kiri, bukan warna
                 * aksen. */}
                <ul className="mt-5 border-t border-[color:var(--rule-color)]">
                  {mediaTypesNonCetak.map((m, i) => {
                    const terpilih = selectedSlug === m.slug;
                    return (
                      <li
                        key={m.slug}
                        className={`ui-row border-l-2 ${
                          terpilih
                            ? 'border-l-[color:var(--rule-strong)] bg-[var(--surface-offset)]'
                            : 'border-l-transparent hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {/* Foto contoh - dekoratif: nama media sudah ada di sebelahnya,
                         * jadi sengaja alt="" agar pembaca layar tidak mengulang. */}
                        {m.image_path && (
                          <img
                            src={m.image_path}
                            alt=""
                            width={800}
                            height={600}
                            loading="lazy"
                            decoding="async"
                            className="ui-row-lead"
                          />
                        )}
                        <div className="ui-row-main">
                          <div className="ui-row-head">
                            <div className="flex min-w-0 items-center gap-2">
                              {/* Target tap = tinggi penuh baris (44px, `min-h-11`),
                               * bukan hanya teks nama (21px). Konvensi yang sama
                               * dipakai AdminDashboardPage untuk WCAG 2.2 AA
                               * `target-size`. Label tetap membungkus radio + nama
                               * saja: tombol "Ketentuan pemasangan" ada di luar
                               * label supaya tidak ada kontrol bersarang. */}
                              <label
                                htmlFor={`media-${i}`}
                                className="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5"
                              >
                                <input
                                  id={`media-${i}`}
                                  type="radio"
                                  name="media_type"
                                  value={m.slug}
                                  checked={terpilih}
                                  onChange={() => { setSelectedSlug(m.slug); setRulesOpen(false); setFile(null); setFileError(''); }}
                                  aria-describedby={fieldErrors.media ? 'err-media' : undefined}
                                  className="h-4 w-4 shrink-0 rounded-none accent-[var(--action)]"
                                />
                                {/* `overflow-wrap: anywhere`: nama media bisa memuat
                                 * kata majemuk tanpa titik putus (mis. "Feed
                                 * Instagram/Fanpage/TikTok"), yang meluber keluar
                                 * baris pada viewport 320px tanpa pematah kata. */}
                                <span className="ui-title-row">{m.name}</span>
                              </label>
                            </div>
                            <MediaPriceTag media={m} />
                          </div>

                          <dl className="ui-specs mt-2">
                            {/* Ukuran dulu berdiri sebagai chip di sebelah nama.
                             * Chip itu `shrink-0` dan mengambil ~130px dari
                             * kepala baris, sehingga di 320px nama media
                             * terpepet sampai 10px dan membungkus satu huruf
                             * per baris. Sebagai baris spesifikasi, ukurannya
                             * terbaca sama dan nama tidak lagi berebut ruang -
                             * pola yang sama dengan wizard cetak. */}
                            <div className="ui-spec">
                              <dt>Ukuran</dt>
                              <dd>{m.size_spec || '-'}</dd>
                            </div>
                            <div className="ui-spec">
                              <dt>Material</dt>
                              <dd>{m.material_spec || '-'}</dd>
                            </div>
                            <div className="ui-spec">
                              <dt>Kanal</dt>
                              <dd>{CATEGORY_LABELS[m.category] ?? m.category}</dd>
                            </div>
                          </dl>

                          {terpilih && m.rules && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setRulesOpen((v) => !v)}
                                aria-expanded={rulesOpen}
                                className="inline-flex items-center gap-1 border-b border-[color:var(--rule-strong)] pb-0.5 ui-meta font-semibold ui-text-strong"
                              >
                                Ketentuan
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${rulesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                              </button>
                              {rulesOpen && (
                                <ul className="mt-1.5 space-y-1">
                                  {m.rules.split('\n').filter(Boolean).map((line, idx) => (
                                    <li key={idx} className="ui-meta ui-text-muted flex items-start gap-2">
                                      <span aria-hidden="true" className="ui-num mt-0.5 shrink-0 font-medium">
                                        {String(idx + 1).padStart(2, '0')}
                                      </span>
                                      <span>{line}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="ui-helper-slot mt-3">
                  {fieldErrors.media && <p id="err-media" role="alert" className="ui-meta font-medium text-[color:var(--stamp-no)]">{fieldErrors.media}</p>}
                </div>

                <button
                  type="button"
                  onClick={goStep2}
                  disabled={!selectedSlug}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 ui-dense font-semibold"
                >
                  Lanjut ke Data Tenant
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 2: Data tenant ─── */}
            {step === 2 && (
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[color:var(--rule-strong)] pb-2">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section">Data Tenant &amp; PIC</h2>
                  <span className="ui-meta ui-text-muted ml-auto shrink-0">Bagian 02</span>
                </div>
                <p className="ui-body ui-text-muted mt-3">
                  Materi untuk <span className="font-semibold ui-text-strong">{selectedMedia?.name}</span>.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="tenant-search" className="ui-label mb-1.5 block" data-tone="strong">
                      Nama Tenant <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                    </label>
                    <p className="mb-1.5 text-xs ui-text-muted">
                      {manualMode
                        ? 'Daftar tenant tidak tersedia. Isi nama tenant secara manual.'
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
                      <label htmlFor="pic-name" className="ui-label mb-1.5 block" data-tone="strong">
                        Nama PIC <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                      </label>
                      <input
                        id="pic-name"
                        name="pic_name"
                        type="text"
                        value={picName}
                        maxLength={100}
                        autoComplete="name"
                        onChange={(e) => { setPicName(e.target.value); setFieldErrors((er) => ({ ...er, pic_name: '' })); }}
                        className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.pic_name ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                        aria-invalid={fieldErrors.pic_name ? true : undefined}
                        aria-describedby={fieldErrors.pic_name ? 'err-pic_name' : undefined}
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.pic_name && <p id="err-pic_name" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.pic_name}</p>}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="pic-phone" className="ui-label mb-1.5 block" data-tone="strong">
                        Nomor Telepon PIC <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                      </label>
                      <input
                        id="pic-phone"
                        name="pic_phone"
                        type="tel"
                        inputMode="tel"
                        value={picPhone}
                        maxLength={20}
                        autoComplete="tel"
                        placeholder="08xx xxxx xxxx"
                        onChange={(e) => { setPicPhone(e.target.value); setFieldErrors((er) => ({ ...er, pic_phone: '' })); }}
                        className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.pic_phone ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                        aria-invalid={fieldErrors.pic_phone ? true : undefined}
                        aria-describedby={fieldErrors.pic_phone ? 'err-pic_phone' : undefined}
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.pic_phone && <p id="err-pic_phone" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.pic_phone}</p>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="installation-date" className="ui-label mb-1.5 block" data-tone="strong">
                      Tanggal Pemasangan yang Diharapkan <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                    </label>
                    <input
                      id="installation-date"
                      type="date"
                      value={installationDate}
                      min={leadInfo.earliest || undefined}
                      onChange={(e) => { setInstallationDate(e.target.value); setFieldErrors((er) => ({ ...er, installation_date: '' })); }}
                      className="ui-control w-full px-3 py-2.5 text-sm sm:max-w-xs"
                      aria-invalid={fieldErrors.installation_date ? true : undefined}
                      aria-describedby={fieldErrors.installation_date ? 'err-installation_date' : undefined}
                    />
                    <p className="mt-1 text-xs ui-text-muted">
                      Permintaan tanggal bersifat harapan. Jadwal final ditentukan Mall (lihat ketentuan media).
                    </p>
                    {leadInfo.lead && (
                      <p className="mt-1 text-xs font-medium text-[color:var(--action)]">
                        Materi harus diterima paling lambat {leadInfo.label}, tanggal paling awal {leadInfo.earliest}.
                      </p>
                    )}
                    <div className="ui-helper-slot mt-1">
                      {fieldErrors.installation_date && <p id="err-installation_date" className="text-xs font-medium text-[color:var(--stamp-no)]" role="alert">{fieldErrors.installation_date}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="campaign-name" className="ui-label mb-1.5 block" data-tone="strong">
                      Nama Campaign <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                    </label>
                    <input
                      id="campaign-name"
                      type="text"
                      value={campaignName}
                      maxLength={150}
                      placeholder="Contoh: Promo Akhir Tahun"
                      onChange={(e) => { setCampaignName(e.target.value); setFieldErrors((er) => ({ ...er, campaign_name: '' })); }}
                      className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.campaign_name ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                      aria-invalid={fieldErrors.campaign_name ? true : undefined}
                      aria-describedby={fieldErrors.campaign_name ? 'err-campaign_name' : undefined}
                    />
                    <div className="ui-helper-slot mt-1">
                      {fieldErrors.campaign_name && <p id="err-campaign_name" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.campaign_name}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="material-title" className="ui-label mb-1.5 block" data-tone="strong">
                      Judul Materi <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                    </label>
                    <input
                      id="material-title"
                      type="text"
                      value={materialTitle}
                      maxLength={200}
                      placeholder="Contoh: Spanduk Diskon 50%"
                      onChange={(e) => { setMaterialTitle(e.target.value); setFieldErrors((er) => ({ ...er, material_title: '' })); }}
                      className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.material_title ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                      aria-invalid={fieldErrors.material_title ? true : undefined}
                      aria-describedby={fieldErrors.material_title ? 'err-material_title' : undefined}
                    />
                    <div className="ui-helper-slot mt-1">
                      {fieldErrors.material_title && <p id="err-material_title" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.material_title}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="material-description" className="ui-label mb-1.5 block" data-tone="strong">
                      Deskripsi Materi <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                    </label>
                    <textarea
                      id="material-description"
                      value={materialDescription}
                      maxLength={2000}
                      rows={3}
                      placeholder="Penjelasan singkat isi materi promosi Anda."
                      onChange={(e) => { setMaterialDescription(e.target.value); setFieldErrors((er) => ({ ...er, material_description: '' })); }}
                      className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.material_description ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                      aria-invalid={fieldErrors.material_description ? true : undefined}
                      aria-describedby={fieldErrors.material_description ? 'err-material_description' : undefined}
                    />
                    <div className="ui-helper-slot mt-1">
                      {fieldErrors.material_description && <p id="err-material_description" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.material_description}</p>}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="material-type" className="ui-label mb-1.5 block" data-tone="strong">
                        Jenis Materi <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                      </label>
                      <select
                        id="material-type"
                        value={materialType}
                        onChange={(e) => { setMaterialType(e.target.value); setFieldErrors((er) => ({ ...er, material_type: '' })); }}
                        className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.material_type ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                        aria-invalid={fieldErrors.material_type ? true : undefined}
                        aria-describedby={fieldErrors.material_type ? 'err-material_type' : undefined}
                      >
                        <option value="">Pilih jenis materi…</option>
                        {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.material_type && <p id="err-material_type" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.material_type}</p>}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="media-target" className="ui-label mb-1.5 block" data-tone="strong">
                        Media / Lokasi Pemasangan <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                      </label>
                      <input
                        id="media-target"
                        name="media_target"
                        type="text"
                        value={mediaTarget}
                        maxLength={200}
                        placeholder={selectedMedia?.location_note || 'Contoh: Atrium 1'}
                        onChange={(e) => { setMediaTarget(e.target.value); setFieldErrors((er) => ({ ...er, media_target: '' })); }}
                        className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.media_target ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                        aria-invalid={fieldErrors.media_target ? true : undefined}
                        aria-describedby={fieldErrors.media_target ? 'err-media_target' : undefined}
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.media_target && <p id="err-media_target" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.media_target}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="air-start-date" className="ui-label mb-1.5 block" data-tone="strong">
                        Mulai Tayang <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                      </label>
                      <input
                        id="air-start-date"
                        type="date"
                        value={airStartDate}
                        onChange={(e) => { setAirStartDate(e.target.value); setFieldErrors((er) => ({ ...er, air_start_date: '', air_end_date: '' })); }}
                        className="ui-control w-full px-3 py-2.5 text-sm"
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.air_start_date && <p className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.air_start_date}</p>}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="air-end-date" className="ui-label mb-1.5 block" data-tone="strong">
                        Berakhir Tayang <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                      </label>
                      <input
                        id="air-end-date"
                        type="date"
                        value={airEndDate}
                        onChange={(e) => { setAirEndDate(e.target.value); setFieldErrors((er) => ({ ...er, air_end_date: '' })); }}
                        className="ui-control w-full px-3 py-2.5 text-sm"
                        aria-invalid={fieldErrors.air_end_date ? true : undefined}
                        aria-describedby={fieldErrors.air_end_date ? 'err-air_end_date' : undefined}
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.air_end_date && <p id="err-air_end_date" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.air_end_date}</p>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="notes" className="ui-label mb-1.5 block" data-tone="strong">
                      Catatan untuk Tim Tenant Relations <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                    </label>
                    <textarea
                      id="notes"
                      value={notes}
                      maxLength={1000}
                      rows={4}
                      placeholder={selectedMedia?.category === 'social' ? 'Tulis caption media sosial Anda di sini…' : 'Permintaan atau keterangan tambahan…'}
                      onChange={(e) => setNotes(e.target.value)}
                      className="ui-control w-full px-3 py-2.5 text-sm"
                    />
                    {selectedMedia?.category === 'social' && (
                      <p className="mt-1 text-xs ui-text-muted">Caption wajib menyebutkan lokasi lantai tenant Anda.</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goStep3}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold"
                >
                  Lanjut ke Kirim Materi
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="ui-helper-slot mt-3">
                  {submitError && (
                    <p className="text-xs font-medium text-[color:var(--stamp-no)]" role="alert">{submitError}</p>
                  )}
                </div>
              </div>
            )}

            {/* ─── Langkah 3: Kirim materi (unggah / tautan) ─── */}
            {step === 3 && selectedMedia && (
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[color:var(--rule-strong)] pb-2.5">
                  <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section focus-visible:outline-none">Kirim Materi</h2>
                  <span className="ui-label ml-auto shrink-0">Bagian 03</span>
                </div>
                <p className="ui-body ui-text-muted mt-3">
                  Kirim materi untuk <span className="font-semibold">{selectedMedia.name}</span>
                  {formatsLabel && <> (format {formatsLabel}{selectedMedia.size_spec ? ` · ukuran ${selectedMedia.size_spec}` : ''})</>}.
                  Pilih salah satu cara: unggah berkas ke penyimpanan Mall, atau kirim tautan milik Anda.
                </p>

                {/* Ringkasan sebagai tabel titik penghubung: nilainya data. */}
                <div className="mt-4 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-4">
                  <p className="ui-label">Ringkasan Lembar</p>
                  <dl className="ui-specs mt-2.5">
                    <div className="ui-spec">
                      <dt>Tenant</dt>

                      <dd>{tenant?.name}</dd>
                    </div>
                    <div className="ui-spec">
                      <dt>PIC</dt>

                      <dd>{picName} · {picPhone}</dd>
                    </div>
                    <div className="ui-spec">
                      <dt>Media</dt>

                      <dd>{selectedMedia.name}</dd>
                    </div>
                    <div className="ui-spec">
                      <dt>Campaign</dt>

                      <dd>{campaignName}</dd>
                    </div>
                    <div className="ui-spec">
                      <dt>Lokasi</dt>

                      <dd>{mediaTarget}</dd>
                    </div>
                    {installationDate && (
                      <div className="ui-spec">
                        <dt>Tgl pasang</dt>

                        <dd>{installationDate}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Pemilih sumber materi - dua kanal resmi (tautan kanonis, unggah berkas).
                    Kanal unggah disembunyikan bila operator menonaktifkannya
                    (VITE_PROMO_UPLOAD_MODE='0', instance tanpa kredensial Drive). */}
                {isUploadModeEnabled() ? (
                <div className="mt-5 flex gap-2" role="group" aria-label="Cara mengirim materi">
                  <button
                    type="button"
                    aria-pressed={sourceMode === 'link'}
                    onClick={() => { setSourceMode('link'); setFileError(''); }}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-2 border px-3 py-2.5 text-sm font-semibold ${
                      sourceMode === 'link'
                        ? 'border-[color:var(--action)] bg-[var(--action-soft)] text-[color:var(--action)]'
                        : 'border-[color:var(--rule-color)] text-slate-600 hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Kirim Tautan
                  </button>
                  <button
                    type="button"
                    aria-pressed={sourceMode === 'upload'}
                    onClick={() => { setSourceMode('upload'); setLinkError(''); }}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-2 border px-3 py-2.5 text-sm font-semibold ${
                      sourceMode === 'upload'
                        ? 'border-[color:var(--action)] bg-[var(--action-soft)] text-[color:var(--action)]'
                        : 'border-[color:var(--rule-color)] text-slate-600 hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Unggah File
                  </button>
                </div>
                ) : (
                  <p className="mt-5 flex items-start gap-1.5 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-3 text-xs ui-text-muted">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Kanal unggah berkas sedang tidak diaktifkan pada instance ini. Silakan kirim
                    tautan materi Anda.
                  </p>
                )}

                {/* Tautan materi - untuk file besar / folder Drive */}
                {sourceMode === 'link' && (
                  <div className="mt-4">
                    <label htmlFor="link-input" className="ui-label mb-1.5 block" data-tone="strong">
                      Tautan Materi <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                    </label>
                    <p className="mb-1.5 text-xs ui-text-muted">
                      Tempel tautan Google Drive, Dropbox, atau WeTransfer. Buka menu <span className="font-medium">Share</span> →
                      <span className="font-medium"> Anyone with the link can view</span>. Tautan yang masih
                      <span className="font-medium"> restricted</span> akan ditolak saat verifikasi.
                    </p>
                    <input
                      id="link-input"
                      name="material_link"
                      type="url"
                      inputMode="url"
                      value={linkUrl}
                      maxLength={500}
                      placeholder="https://drive.google.com/…"
                      onChange={(e) => { setLinkUrl(e.target.value); setLinkError(''); setFieldErrors((er) => ({ ...er, link_url: '' })); }}
                      className={`ui-control w-full px-3 py-2.5 text-sm ${linkError || fieldErrors.link_url ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                      aria-invalid={linkError || fieldErrors.link_url ? true : undefined}
                      aria-describedby={linkError || fieldErrors.link_url ? 'err-link_url' : undefined}
                    />
                    <div className="ui-helper-slot mt-2">
                      {(linkError || fieldErrors.link_url) && (
                        <p id="err-link_url" className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--stamp-no)]" role="alert">
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          {linkError || fieldErrors.link_url}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* File picker */}
                {sourceMode === 'upload' && (
                <div className="mt-5">
                  <label htmlFor="file-input" className="ui-label mb-1.5 block" data-tone="strong">
                    File Materi <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                  </label>
                  <label
                    htmlFor="file-input"
                    className={`flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center ${
                      fileError
                        ? 'border-[color:var(--stamp-no)] bg-[var(--stamp-no-soft)]'
                        : 'border-[color:var(--rule-strong)] bg-[var(--surface-offset)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <Upload className="h-8 w-8 text-[color:var(--action)]" aria-hidden="true" />
                    <span className="text-sm font-medium text-slate-700">
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

                  <div className="ui-helper-slot mt-2">
                    {fileError && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--stamp-no)]" role="alert">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {fileError}
                      </p>
                    )}
                  </div>

                  {file && !fileError && (
                    <div className="mt-3 flex items-center gap-3 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-3">
                      <FileIcon mime={file.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                        <p className="ui-num text-xs ui-text-muted">
                          {MIME_LABELS[file.type] ?? file.type} · {formatBytes(file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        aria-label="Hapus file"
                        className="inline-flex h-11 w-11 items-center justify-center text-slate-500 hover:bg-[var(--surface-hover)] hover:text-slate-700"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
                )}

                {/* Kanal email - deck mengarahkan materi social media ke email
                    marketing; tautan pengajuan tetap dipakai untuk verifikasi. */}
                {materialEmail && (
                  <div className="mt-4 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-4">
                    <p className="ui-label">Kanal Email</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      Materi social media juga dapat dikirim via email
                    </p>
                    <p className="mt-1 text-xs ui-text-muted">
                      Kirim berkas materi ke{' '}
                      <a
                        href={`mailto:${materialEmail}?subject=${encodeURIComponent(`Materi Promosi ${selectedMedia.name} - ${tenant?.name ?? ''}`)}`}
                        className="underline underline-offset-[3px] font-medium"
                      >
                        {materialEmail}
                      </a>
                      . Tetap isi tautan di atas agar tim Tenant Relations dapat memverifikasi materinya.
                    </p>
                  </div>
                )}

                {submitState === 'error' && (
                  <div className="mt-4 border-2 border-[color:var(--stamp-no)] bg-[var(--stamp-no-soft)] p-4" role="alert">
                    <p className="text-sm font-semibold text-[color:var(--stamp-no)]">Pengajuan gagal.</p>
                    <p className="mt-1 text-xs text-[color:var(--stamp-no)]">{submitError}</p>
                  </div>
                )}

                {/* Persetujuan ketentuan - wajib sebelum kirim (PRD §9.3). */}
                <label className="mt-5 flex items-start gap-2.5 text-sm text-slate-700">
                  <input
                    id="terms-accepted"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => { setTermsAccepted(e.target.checked); setFieldErrors((er) => ({ ...er, terms_accepted: '' })); }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-none accent-[var(--action)]"
                    aria-invalid={fieldErrors.terms_accepted ? true : undefined}
                    aria-describedby={fieldErrors.terms_accepted ? 'err-terms_accepted' : undefined}
                  />
                  <span>
                    Saya menyatakan materi ini benar milik/kewenangan tenant saya dan menyetujui
                    ketentuan pemasangan media promosi Metropolitan Mall Bekasi.
                  </span>
                </label>
                <div className="ui-helper-slot mt-1">
                  {fieldErrors.terms_accepted && (
                    <p id="err-terms_accepted" className="text-xs font-medium text-[color:var(--stamp-no)]" role="alert">{fieldErrors.terms_accepted}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!materialReady || !termsAccepted || submitState === 'uploading'}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold"
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
