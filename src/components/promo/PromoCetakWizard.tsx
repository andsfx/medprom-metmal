/**
 * Wizard pengajuan media promosi CETAK — 3 langkah:
 *   1. Data Pemohon (tenant ATAU non-tenant)
 *   2. Pilih Media & Periode (beberapa media sekaligus)
 *   3. Ringkasan & Kirim
 *
 * Berbeda dari `PromoUploadWizard` (materi digital, satu media, wajib materi),
 * form ini mengikuti permintaan pemilik: field persis (tanggal pengajuan, nama
 * pemohon, nama tenant/non tenant, telepon, periode pemasangan, tanggal
 * pemasangan, lokasi pemasangan), boleh beberapa media dalam satu kirim, dan
 * TIDAK meminta berkas materi (menyusul lewat alur revisi).
 *
 * Perhitungan harga/PPN memakai cermin `src/utils/pricing.ts`; server
 * menghitung ulang dan menyimpan snapshot (klien tidak dipercaya).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import AppShell from '../layout/AppShell';
import { fetchMediaTypes, searchTenants, submitBatch, errorsFromApiError } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import { APPLICANT_TYPE_LABELS, MAX_BATCH_ITEMS, CATEGORY_LABELS } from '../../constants/promo';
import { cekDurasiMinimal, durationDays, hitungHarga, MIN_DURATION_DAYS, PPN_RATE } from '../../utils/pricing';
import { toIsoDate } from '../../utils/leadTime';
import type { PromoMediaType, TenantOption, BatchSubmitResult } from '../../types/promo';
import { TenantSearchSelect } from './TenantSearchSelect';

type Step = 1 | 2 | 3;
type SubmitState = 'idle' | 'sending' | 'success' | 'error';

const STEPS = [
  { label: 'Data Pemohon' },
  { label: 'Pilih Media & Periode' },
  { label: 'Ringkasan & Kirim' },
];

const DRAFT_KEY = 'metmal_promo_cetak_draft';

/** Satu media terpilih beserta field per-item. */
interface ItemState {
  slug: string;
  media_target: string;
  installation_date: string;
  air_start_date: string;
  air_end_date: string;
}

function rupiah(n: number): string {
  return `Rp. ${Number(n || 0).toLocaleString('id-ID')}`;
}

function formatTanggal(iso: string): string {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

export default function PromoCetakWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselect = searchParams.get('media') || '';

  const [mediaTypes, setMediaTypes] = useState<PromoMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const lewatiResetPertama = useRef(true);

  const [applicantType, setApplicantType] = useState<'tenant' | 'non_tenant'>('tenant');
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [nonTenantName, setNonTenantName] = useState('');
  const [picName, setPicName] = useState('');
  const [picPhone, setPicPhone] = useState('');
  const [submissionDate, setSubmissionDate] = useState(toIsoDate());
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<ItemState[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<BatchSubmitResult | null>(null);

  const cetakMedia = useMemo(
    () => mediaTypes.filter((m) => m.media_channel === 'cetak'),
    [mediaTypes],
  );
  // Peta slug → media. Kunci statis (slug katalog) dan hanya dibaca → Record.
  const mediaBySlug = useMemo<Record<string, PromoMediaType>>(
    () => Object.fromEntries(cetakMedia.map((m) => [m.slug, m])),
    [cetakMedia],
  );

  // Pindah langkah: gulir ke atas + fokus judul langkah (pola wizard lama).
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

  // Muat katalog kanal cetak; pra-pilih dari query param.
  useEffect(() => {
    let cancelled = false;
    fetchMediaTypes('cetak')
      .then((rows) => {
        if (cancelled) return;
        setMediaTypes(rows);
        if (preselect && rows.some((m) => m.slug === preselect)) {
          setItems([{ slug: preselect, media_target: '', installation_date: '', air_start_date: '', air_end_date: '' }]);
          setStep(2);
        }
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [preselect]);

  // Draf sessionStorage (teks saja).
  useEffect(() => {
    if (mediaTypes.length === 0) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        applicantType, nonTenantName, picName, picPhone, submissionDate, notes, items,
        tenantName: tenant?.name ?? '', tenantId: tenant?.id ?? '', unitNumber: tenant?.lot ?? '',
      }));
    } catch { /* storage diblokir — draf opsional */ }
  }, [mediaTypes, applicantType, nonTenantName, picName, picPhone, submissionDate, notes, items, tenant]);

  const dipilih = items.length;
  const totalSubtotal = items.reduce((sum, it) => {
    const m = mediaBySlug[it.slug];
    if (!m) return sum;
    const dur = durationDays(it.air_start_date, it.air_end_date);
    return sum + hitungHarga({ priceAmount: m.price_amount || 0, ppnIncluded: Boolean(m.ppn_included), durationDays: dur }).subtotal;
  }, 0);
  const totalPpn = items.reduce((sum, it) => {
    const m = mediaBySlug[it.slug];
    if (!m) return sum;
    const dur = durationDays(it.air_start_date, it.air_end_date);
    return sum + hitungHarga({ priceAmount: m.price_amount || 0, ppnIncluded: Boolean(m.ppn_included), durationDays: dur }).ppnAmount;
  }, 0);

  function toggleMedia(slug: string) {
    setItems((prev) => {
      const ada = prev.some((it) => it.slug === slug);
      if (ada) return prev.filter((it) => it.slug !== slug);
      if (prev.length >= MAX_BATCH_ITEMS) return prev;
      return [...prev, { slug, media_target: '', installation_date: '', air_start_date: '', air_end_date: '' }];
    });
  }

  function updateItem(slug: string, patch: Partial<ItemState>) {
    setItems((prev) => prev.map((it) => (it.slug === slug ? { ...it, ...patch } : it)));
  }

  function goStep2() {
    const errs: Record<string, string> = {};
    if (applicantType === 'tenant') {
      if (!tenant) errs.tenant = manualMode ? 'Nama tenant wajib diisi.' : 'Pilih tenant dari daftar, bukan ketik bebas.';
    } else if (!nonTenantName.trim()) {
      errs.non_tenant = 'Nama non tenant wajib diisi.';
    }
    if (!picName.trim()) errs.pic_name = 'Nama pemohon wajib diisi.';
    if (!picPhone.trim()) errs.pic_phone = 'Nomor telepon wajib diisi.';
    else if (!/^[+0-9][0-9\s-]{7,19}$/.test(picPhone.trim())) errs.pic_phone = 'Format nomor telepon tidak valid.';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setStep(2);
  }

  function goStep3() {
    const errs: Record<string, string> = {};
    if (items.length === 0) errs.media = 'Pilih minimal satu media promosi cetak.';
    for (const [i, it] of items.entries()) {
      const label = `Media ke-${i + 1}`;
      if (!it.media_target.trim()) errs[`target_${it.slug}`] = `${label}: lokasi pemasangan wajib diisi.`;
      const cek = cekDurasiMinimal(it.air_start_date, it.air_end_date);
      if (!cek.ok) errs[`periode_${it.slug}`] = `${label}: ${cek.message}`;
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setStep(3);
  }

  async function handleSubmit() {
    if (!termsAccepted) {
      setSubmitError('Centang persetujuan ketentuan sebelum mengirim.');
      return;
    }
    setSubmitState('sending');
    setSubmitError('');
    try {
      const res = await submitBatch({
        applicant_type: applicantType,
        tenant_id: applicantType === 'tenant' ? (tenant?.id ?? '') : '',
        tenant_name: applicantType === 'tenant' ? (tenant?.name ?? '') : nonTenantName.trim(),
        unit_number: applicantType === 'tenant' ? (tenant?.lot ?? '') : '',
        pic_name: picName.trim(),
        pic_phone: picPhone.trim(),
        submission_date: submissionDate,
        notes: notes.trim(),
        device_fingerprint: getDeviceFingerprint(),
        items: items.map((it) => ({
          media_type_slug: it.slug,
          media_target: it.media_target.trim(),
          installation_date: it.installation_date,
          air_start_date: it.air_start_date,
          air_end_date: it.air_end_date,
          quantity: 1,
        })),
      });
      setResult(res);
      setSubmitState('success');
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* abaikan */ }
    } catch (err) {
      setSubmitState('error');
      const msgs = errorsFromApiError(err);
      setSubmitError(msgs.length > 0 ? msgs.join('; ') : (err instanceof Error ? err.message : 'Gagal mengirim pengajuan. Coba lagi.'));
    }
  }

  // ─── Layar sukses ───
  if (submitState === 'success' && result) {
    return (
      <AppShell title="Pengajuan Terkirim" hideTabBar>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="ui-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600 dark:text-green-400" aria-hidden="true" />
            <h2 className="ui-title-section mt-4 text-slate-900 dark:text-white">Pengajuan Terkirim!</h2>
            <p className="ui-body ui-text-muted mt-2">
              Pengajuan media promosi cetak untuk{' '}
              <span className="font-semibold">{applicantType === 'tenant' ? tenant?.name : nonTenantName}</span>{' '}
              sudah kami terima ({result.items.length} media).
            </p>
            <div className="ui-control mx-auto mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2.5">
              <span className="text-xs ui-text-muted">Nomor batch</span>
              <span className="font-mono text-sm font-bold tracking-widest text-brand-primary-700 dark:text-brand-primary-300">{result.batch_number}</span>
            </div>
            <ul className="mx-auto mt-5 max-w-md space-y-1.5 text-left text-xs">
              {result.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{it.submission_number}</span>
                  <span className="ui-text-muted">{mediaBySlug[it.media_type_slug]?.name ?? it.media_type_slug}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Simpan nomor batch ini untuk memantau status seluruh media kapan saja.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {result.batch_token && (
                <button
                  type="button"
                  onClick={() => navigate(`/batch/${result.batch_token}`)}
                  className="ui-btn-primary inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition"
                >
                  Lihat Status Pengajuan
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="ui-control inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Kembali ke Beranda
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Ajukan Media Cetak"
      back
      onBack={() => (step === 1 ? navigate('/') : setStep((s) => (s === 3 ? 2 : 1) as Step))}
      hideTabBar
    >
      <div className="mx-auto max-w-2xl px-4 py-5">
        <nav className="mb-6" aria-label="Langkah pengajuan">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{STEPS[step - 1]?.label}</p>
            <p className="text-xs ui-text-muted tabular-nums">Langkah {step} dari {STEPS.length}</p>
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
              <span key={s.label} className={`h-1 flex-1 rounded-full transition-colors ${i < step ? 'bg-brand-primary-600' : 'bg-stone-200 dark:bg-slate-700'}`} />
            ))}
          </div>
        </nav>

        {loading && (
          <div className="ui-card flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
            <span className="text-sm ui-text-muted">Memuat katalog media cetak…</span>
          </div>
        )}
        {loadError && (
          <div className="ui-alert p-4" role="alert">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Gagal memuat katalog media cetak.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">Muat ulang halaman atau coba lagi sebentar.</p>
          </div>
        )}

        {!loading && !loadError && (
          <div className="ui-card overflow-hidden">
            {/* ─── Langkah 1: Data Pemohon ─── */}
            {step === 1 && (
              <div className="p-5 sm:p-6">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section text-slate-900 focus:outline-none dark:text-white">Data Pemohon</h2>
                <p className="ui-body ui-text-muted mt-2">Isi data pemohon dan kontak yang dapat dihubungi.</p>

                <div className="mt-5 space-y-4">
                  <fieldset>
                    <legend className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Jenis Pemohon</legend>
                    <div className="flex gap-2" role="group" aria-label="Jenis pemohon">
                      {(['tenant', 'non_tenant'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={applicantType === t}
                          onClick={() => { setApplicantType(t); setFieldErrors({}); }}
                          className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                            applicantType === t
                              ? 'border-brand-primary-500 bg-brand-primary-50 text-brand-primary-800 dark:border-brand-primary-400 dark:bg-brand-primary-950/40 dark:text-brand-primary-200'
                              : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {APPLICANT_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {applicantType === 'tenant' ? (
                    <div>
                      <label htmlFor="cetak-tenant" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Nama Tenant <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <p className="mb-1.5 text-xs ui-text-muted">
                        {manualMode ? 'Daftar tenant tidak tersedia. Isi nama tenant secara manual.' : 'Pilih dari daftar tenant aktif Metropolitan Mall Bekasi.'}
                      </p>
                      <TenantSearchSelect
                        id="cetak-tenant"
                        value={tenant?.name ?? ''}
                        onTenantSelect={(t) => { setTenant(t); setFieldErrors((e) => ({ ...e, tenant: '' })); }}
                        onManualModeChange={setManualMode}
                        error={fieldErrors.tenant}
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="cetak-non-tenant" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Nama Non Tenant <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <p className="mb-1.5 text-xs ui-text-muted">Nama badan usaha atau perorangan yang mengajukan.</p>
                      <input
                        id="cetak-non-tenant"
                        type="text"
                        value={nonTenantName}
                        maxLength={100}
                        onChange={(e) => { setNonTenantName(e.target.value); setFieldErrors((er) => ({ ...er, non_tenant: '' })); }}
                        className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.non_tenant ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                        aria-invalid={fieldErrors.non_tenant ? true : undefined}
                        aria-describedby={fieldErrors.non_tenant ? 'err-non_tenant' : undefined}
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.non_tenant && <p id="err-non_tenant" role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.non_tenant}</p>}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="cetak-pic" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Nama Pemohon <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <input
                        id="cetak-pic"
                        type="text"
                        value={picName}
                        maxLength={100}
                        autoComplete="name"
                        onChange={(e) => { setPicName(e.target.value); setFieldErrors((er) => ({ ...er, pic_name: '' })); }}
                        className={`ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 ${fieldErrors.pic_name ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}
                        aria-invalid={fieldErrors.pic_name ? true : undefined}
                        aria-describedby={fieldErrors.pic_name ? 'err-pic_name' : undefined}
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.pic_name && <p id="err-pic_name" role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.pic_name}</p>}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="cetak-phone" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Nomor Telepon <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <input
                        id="cetak-phone"
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
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.pic_phone && <p id="err-pic_phone" role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.pic_phone}</p>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="cetak-date" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Tanggal Pengajuan</label>
                    <input
                      id="cetak-date"
                      type="date"
                      value={submissionDate}
                      onChange={(e) => setSubmissionDate(e.target.value)}
                      className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-xs"
                    />
                  </div>

                  <div>
                    <label htmlFor="cetak-notes" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Catatan <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                    </label>
                    <textarea
                      id="cetak-notes"
                      rows={3}
                      maxLength={1000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goStep2}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition"
                >
                  Lanjut ke Pilih Media
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 2: Pilih Media & Periode ─── */}
            {step === 2 && (
              <div className="p-5 sm:p-6">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section text-slate-900 focus:outline-none dark:text-white">Pilih Media &amp; Periode</h2>
                <p className="ui-body ui-text-muted mt-2">
                  Pilih satu atau beberapa media promosi cetak. Minimal sewa {MIN_DURATION_DAYS} hari.
                </p>

                <div className="mt-5 space-y-2">
                  {cetakMedia.length === 0 && (
                    <p className="ui-text-muted text-sm">Belum ada media promosi cetak yang aktif.</p>
                  )}
                  {cetakMedia.map((m) => {
                    const it = items.find((x) => x.slug === m.slug);
                    const terpilih = Boolean(it);
                    const dur = it ? durationDays(it.air_start_date, it.air_end_date) : 0;
                    const harga = it && m.price_amount
                      ? hitungHarga({ priceAmount: m.price_amount, ppnIncluded: Boolean(m.ppn_included), durationDays: dur })
                      : null;
                    return (
                      <div key={m.slug} className={`rounded-md border p-3.5 transition ${terpilih ? 'border-brand-primary-500 bg-brand-primary-50/40 dark:border-brand-primary-400 dark:bg-brand-primary-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            id={`cetak-media-${m.slug}`}
                            type="checkbox"
                            checked={terpilih}
                            onChange={() => toggleMedia(m.slug)}
                            className="mt-1 h-4 w-4 accent-[var(--brand-tosca)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-white">{m.name}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                {CATEGORY_LABELS[m.category] ?? m.category}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs ui-text-muted">
                              {[m.size_spec, m.material_spec].filter(Boolean).join(' · ')}
                            </span>
                            {m.price_note && (
                              <span className="mt-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                                {m.price_note} {m.ppn_included ? '(sudah termasuk PPN)' : '(belum termasuk PPN)'}
                              </span>
                            )}
                          </span>
                        </label>

                        {terpilih && it && (
                          <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2 dark:border-slate-700">
                            <div className="sm:col-span-2">
                              <label htmlFor={`cetak-target-${m.slug}`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                                Lokasi Pemasangan <span className="text-red-500">*</span>
                              </label>
                              <input
                                id={`cetak-target-${m.slug}`}
                                type="text"
                                value={it.media_target}
                                maxLength={200}
                                placeholder={m.location_note || 'Contoh: Sisi Pintu Tol Bekasi Barat'}
                                onChange={(e) => { updateItem(m.slug, { media_target: e.target.value }); setFieldErrors((er) => ({ ...er, [`target_${m.slug}`]: '' })); }}
                                className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100"
                              />
                              <div className="ui-helper-slot mt-1">
                                {fieldErrors[`target_${m.slug}`] && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors[`target_${m.slug}`]}</p>}
                              </div>
                            </div>
                            <div>
                              <label htmlFor={`cetak-start-${m.slug}`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Periode Mulai</label>
                              <input
                                id={`cetak-start-${m.slug}`}
                                type="date"
                                value={it.air_start_date}
                                onChange={(e) => { updateItem(m.slug, { air_start_date: e.target.value }); setFieldErrors((er) => ({ ...er, [`periode_${m.slug}`]: '' })); }}
                                className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                              />
                            </div>
                            <div>
                              <label htmlFor={`cetak-end-${m.slug}`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Periode Selesai</label>
                              <input
                                id={`cetak-end-${m.slug}`}
                                type="date"
                                value={it.air_end_date}
                                onChange={(e) => { updateItem(m.slug, { air_end_date: e.target.value }); setFieldErrors((er) => ({ ...er, [`periode_${m.slug}`]: '' })); }}
                                className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label htmlFor={`cetak-install-${m.slug}`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Tanggal Pemasangan</label>
                              <input
                                id={`cetak-install-${m.slug}`}
                                type="date"
                                value={it.installation_date}
                                onChange={(e) => updateItem(m.slug, { installation_date: e.target.value })}
                                className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100 sm:max-w-xs"
                              />
                            </div>
                            {fieldErrors[`periode_${m.slug}`] && (
                              <p role="alert" className="text-xs font-medium text-red-600 sm:col-span-2 dark:text-red-400">{fieldErrors[`periode_${m.slug}`]}</p>
                            )}
                            {harga && dur > 0 && (
                              <dl className="grid grid-cols-3 gap-2 rounded-md bg-white p-2.5 text-xs sm:col-span-2 dark:bg-slate-800/60">
                                <div><dt className="ui-text-muted">Durasi</dt><dd className="font-semibold text-slate-800 dark:text-slate-100">{dur} hari</dd></div>
                                <div><dt className="ui-text-muted">Subtotal</dt><dd className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{rupiah(harga.subtotal)}</dd></div>
                                <div><dt className="ui-text-muted">PPN 11%</dt><dd className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{rupiah(harga.ppnAmount)}</dd></div>
                              </dl>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="ui-helper-slot mt-3">
                  {fieldErrors.media && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.media}</p>}
                </div>

                <button
                  type="button"
                  onClick={goStep3}
                  disabled={items.length === 0}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition"
                >
                  Lanjut ke Ringkasan
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 3: Ringkasan & Kirim ─── */}
            {step === 3 && (
              <div className="p-5 sm:p-6">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="ui-title-section text-slate-900 focus:outline-none dark:text-white">Ringkasan &amp; Kirim</h2>
                <p className="ui-body ui-text-muted mt-2">Periksa kembali data sebelum mengirim.</p>

                <dl className="mt-5 space-y-2.5 text-sm">
                  <div className="flex gap-2"><dt className="w-36 shrink-0 font-semibold ui-text-muted">Jenis Pemohon</dt><dd className="text-slate-900 dark:text-white">{APPLICANT_TYPE_LABELS[applicantType]}</dd></div>
                  <div className="flex gap-2"><dt className="w-36 shrink-0 font-semibold ui-text-muted">{applicantType === 'tenant' ? 'Nama Tenant' : 'Nama Non Tenant'}</dt><dd className="text-slate-900 dark:text-white">{applicantType === 'tenant' ? tenant?.name : nonTenantName}</dd></div>
                  <div className="flex gap-2"><dt className="w-36 shrink-0 font-semibold ui-text-muted">Nama Pemohon</dt><dd className="text-slate-900 dark:text-white">{picName}</dd></div>
                  <div className="flex gap-2"><dt className="w-36 shrink-0 font-semibold ui-text-muted">Telepon</dt><dd className="text-slate-900 dark:text-white">{picPhone}</dd></div>
                  <div className="flex gap-2"><dt className="w-36 shrink-0 font-semibold ui-text-muted">Tanggal Pengajuan</dt><dd className="text-slate-900 dark:text-white">{formatTanggal(submissionDate)}</dd></div>
                  {notes && <div className="flex gap-2"><dt className="w-36 shrink-0 font-semibold ui-text-muted">Catatan</dt><dd className="text-slate-900 dark:text-white">{notes}</dd></div>}
                </dl>

                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                  <p className="text-xs font-semibold ui-text-muted">Media dipilih ({dipilih})</p>
                  <ul className="mt-1.5 space-y-2">
                    {items.map((it) => {
                      const m = mediaBySlug[it.slug];
                      const dur = durationDays(it.air_start_date, it.air_end_date);
                      const harga = m ? hitungHarga({ priceAmount: m.price_amount || 0, ppnIncluded: Boolean(m.ppn_included), durationDays: dur }) : null;
                      return (
                        <li key={it.slug} className="rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{m?.name ?? it.slug}</p>
                          <p className="mt-0.5 ui-text-muted">Lokasi: {it.media_target || '-'}</p>
                          <p className="ui-text-muted">Periode: {formatTanggal(it.air_start_date)} s/d {formatTanggal(it.air_end_date)} ({dur} hari)</p>
                          {it.installation_date && <p className="ui-text-muted">Tanggal pemasangan: {formatTanggal(it.installation_date)}</p>}
                          {harga && (
                            <p className="mt-1 font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                              {rupiah(harga.subtotal)} + PPN {rupiah(harga.ppnAmount)} = {rupiah(harga.totalAmount)}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="mt-4 rounded-md bg-brand-primary-50/60 p-3 dark:bg-brand-primary-950/30">
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="ui-text-muted">Subtotal</dt><dd className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{rupiah(totalSubtotal)}</dd></div>
                    <div><dt className="ui-text-muted">PPN {(PPN_RATE * 100).toFixed(0)}%</dt><dd className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{rupiah(totalPpn)}</dd></div>
                    <div><dt className="ui-text-muted">Total</dt><dd className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{rupiah(totalSubtotal + totalPpn)}</dd></div>
                  </dl>
                </div>

                <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    id="cetak-terms"
                    checked={termsAccepted}
                    onChange={(e) => { setTermsAccepted(e.target.checked); setSubmitError(''); }}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand-tosca)]"
                  />
                  <span>
                    Saya menyatakan materi dan data yang saya ajukan benar, dan menyetujui ketentuan
                    pemasangan media promosi Metropolitan Mall Bekasi.
                  </span>
                </label>

                <p className="mt-3 flex items-start gap-1.5 text-xs ui-text-muted">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Materi cetak dapat dikirim menyusul setelah pengajuan ini disetujui (tim akan menghubungi Anda).
                </p>

                {submitError && (
                  <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{submitError}</p>
                )}

                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitState === 'sending' || !termsAccepted}
                  className="ui-btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition disabled:opacity-50"
                >
                  {submitState === 'sending' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Mengirim…
                    </>
                  ) : (
                    <>Kirim Pengajuan ({dipilih} media)</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
