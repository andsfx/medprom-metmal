/**
 * Wizard pengajuan media promosi CETAK - 3 langkah:
 *   1. Data Pemohon (tenant ATAU non-tenant)
 *   2. Pilih Media & Periode (beberapa media sekaligus, dikelompokkan per
 *      kategori Outdoor / Indoor; satu media boleh dipasang di beberapa lokasi)
 *   3. Ringkasan & Kirim
 *
 * Berbeda dari `PromoUploadWizard` (materi digital, satu media, wajib materi),
 * form ini mengikuti permintaan pemilik: field persis (tanggal pengajuan, nama
 * pemohon, nama tenant/non tenant, telepon, periode pemasangan, tanggal
 * pemasangan, lokasi pemasangan), boleh beberapa media dalam satu kirim, dan
 * TIDAK meminta berkas materi (menyusul lewat alur revisi).
 *
 * Tiap BARIS terpilih punya `id` unik sendiri (bukan `slug`), sehingga media
 * yang sama boleh dipasang di beberapa lokasi dalam satu pengajuan; `slug`
 * tetap menjadi referensi katalog. Server (`POST /promo/submit-batch`) memang
 * sudah menerima slug duplikat dan mem-fan-out satu pengajuan per baris.
 *
 * Perhitungan harga/PPN memakai cermin `src/utils/pricing.ts`; server
 * menghitung ulang dan menyimpan snapshot (klien tidak dipercaya). Karena itu
 * Total ringkasan SELALU = Σ `totalAmount` (satu sumber kebenaran) - untuk
 * media yang harganya SUDAH termasuk PPN, menambahkan `ppnAmount` di atas
 * `subtotal` akan menghitung PPN dua kali.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import AppShell from '../layout/AppShell';
import { fetchMediaTypes, searchTenants, submitBatch, errorsFromApiError, uploadFile, fetchPublicSettings } from '../../utils/promoApi';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import {
  APPLICANT_TYPE_LABELS, CATEGORY_LABELS, CATEGORY_ORDER, MAX_BATCH_ITEMS, MAX_FILE_BYTES,
} from '../../constants/promo';
import { cekDurasiMinimal, durationDays, hitungHarga, MIN_DURATION_DAYS, PPN_RATE } from '../../utils/pricing';
import { checkInstallationDate, toIsoDate } from '../../utils/leadTime';
import type { PromoMediaType, TenantOption, BatchSubmitResult } from '../../types/promo';
import type { UploadResult } from '../../utils/promoApi';
import { TenantSearchSelect } from './TenantSearchSelect';

type Step = 1 | 2 | 3;
type SubmitState = 'idle' | 'sending' | 'success' | 'error';

const STEPS = [
  { label: 'Data Pemohon' },
  { label: 'Pilih Media & Periode' },
  { label: 'Ringkasan & Kirim' },
];

const DRAFT_KEY = 'metmal_promo_cetak_draft';

/**
 * Satu baris media terpilih beserta field per-item.
 * `id` unik per baris (media yang sama boleh muncul beberapa kali);
 * `slug` hanya referensi katalog.
 */
interface ItemState {
  id: string;
  slug: string;
  media_target: string;
  installation_date: string;
  air_start_date: string;
  air_end_date: string;
}

/** Draf `sessionStorage` - bentuk lama (baris tanpa `id`) tetap dipulihkan. */
interface DraftState {
  applicantType?: unknown;
  nonTenantName?: unknown;
  picName?: unknown;
  picPhone?: unknown;
  submissionDate?: unknown;
  notes?: unknown;
  items?: unknown;
  tenantName?: unknown;
  tenantId?: unknown;
  unitNumber?: unknown;
}

function rupiah(n: number): string {
  return `Rp. ${Number(n || 0).toLocaleString('id-ID')}`;
}

/** Id unik baris; `crypto.randomUUID` bila tersedia (konteks aman/HTTPS). */
function buatIdBaris(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID(); } catch { /* jatuh ke fallback */ }
  }
  return `baris-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Basis id elemen untuk satu baris pada satu media.
 *
 * Baris PERTAMA sebuah media memakai basis `<slug>` polos, baris KEDUA dan
 * seterusnya memakai sufiks indeks baris (`<slug>-2`, `<slug>-3`, ...). Kontrak
 * ini dipakai skrip verifikasi produksi `scripts/verify-cetak.mjs`, yang
 * mengisi field lewat selector deterministik `input#cetak-target-<slug>`.
 *
 * Unik karena `slug` unik per blok media di dalam satu dokumen dan indeks baris
 * unik di dalam blok tersebut. Dipakai untuk id input DAN kunci `fieldErrors`,
 * sehingga keduanya tidak mungkin bertabrakan antar baris.
 */
function basisIdBaris(slug: string, idx: number): string {
  return idx === 0 ? slug : `${slug}-${idx + 1}`;
}

/** Baris baru untuk satu media katalog. */
function buatBaris(slug: string): ItemState {
  return {
    id: buatIdBaris(),
    slug,
    media_target: '',
    installation_date: '',
    air_start_date: '',
    air_end_date: '',
  };
}

/**
 * Label PPN standar (media belum termasuk PPN). Angka mengikuti `PPN_RATE`
 * efektif; label ini juga dipakai ringkasan agregat selama tidak ada media
 * yang harganya sudah termasuk PPN.
 */
const LABEL_PPN_STANDAR = `PPN ${(PPN_RATE * 100).toFixed(0)}%`;

function formatTanggal(iso: string): string {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

/** Sudut tanda potong lembar: murni dekoratif, jadi tidak dibaca pembaca layar. */
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

  // Bukti pembayaran pajak (opsional). Hanya ditampilkan bila admin menyalakan
  // fiturnya lewat dashboard (dibaca dari /promo/settings, bukan build-time).
  const [taxProofEnabled, setTaxProofEnabled] = useState(false);
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [taxUploaded, setTaxUploaded] = useState<UploadResult | null>(null);
  const [taxUploading, setTaxUploading] = useState(false);
  const [taxError, setTaxError] = useState('');

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
  // Baris terpilih dikelompokkan per slug: satu media boleh punya banyak baris.
  const barisPerSlug = useMemo<Record<string, ItemState[]>>(() => {
    const map: Record<string, ItemState[]> = {};
    for (const it of items) (map[it.slug] ??= []).push(it);
    return map;
  }, [items]);
  // Daftar media di langkah 2 dikelompokkan per kategori katalog (outdoor/indoor).
  const kelompokMedia = useMemo(() => {
    const perKategori = new Map<string, PromoMediaType[]>();
    for (const m of cetakMedia) {
      const key = m.category || 'lainnya';
      const arr = perKategori.get(key);
      if (arr) arr.push(m);
      else perKategori.set(key, [m]);
    }
    const urutan = [
      ...CATEGORY_ORDER.filter((k) => perKategori.has(k)),
      ...[...perKategori.keys()].filter((k) => !CATEGORY_ORDER.includes(k)),
    ];
    return urutan.map((kategori) => ({ kategori, media: perKategori.get(kategori) ?? [] }));
  }, [cetakMedia]);

  // Harga per baris: satu tempat menghitung, dipakai langkah 2 dan 3.
  const barisHarga = useMemo(
    () => items.map((it) => {
      const m = mediaBySlug[it.slug];
      const dur = durationDays(it.air_start_date, it.air_end_date);
      const harga = m
        ? hitungHarga({ priceAmount: m.price_amount || 0, ppnIncluded: Boolean(m.ppn_included), durationDays: dur })
        : null;
      return { it, m, dur, harga };
    }),
    [items, mediaBySlug],
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
          // Media dari katalog ditandai terpilih lebih awal, tetapi wizard cetak
          // selalu dimulai dari langkah Data Pemohon (pilih Tenant/Non-tenant).
          // Jangan lompat ke langkah Pilih Media: pemohon belum ditentukan.
          setItems([buatBaris(preselect)]);
        }
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [preselect]);

  // Saklar fitur pajak dari server (dinamis, bukan build-time). Gagal baca =
  // tetap MATI, jadi field pajak tidak muncul saat server bermasalah.
  useEffect(() => {
    let cancelled = false;
    fetchPublicSettings()
      .then((s) => { if (!cancelled) setTaxProofEnabled(s.tax_proof_enabled); })
      .catch(() => { if (!cancelled) setTaxProofEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  // Pulihkan draf saat katalog siap (sekali). Toleran terhadap draf lama:
  // baris tanpa `id` diberi id baru, slug yang tak ada di katalog dibuang.
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current || mediaTypes.length === 0) return;
    draftRestoredRef.current = true;
    let draft: DraftState | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as DraftState;
    } catch { draft = null; }
    if (!draft || typeof draft !== 'object') return;
    if (draft.applicantType === 'tenant' || draft.applicantType === 'non_tenant') {
      setApplicantType(draft.applicantType);
    }
    if (typeof draft.nonTenantName === 'string') setNonTenantName(draft.nonTenantName);
    if (typeof draft.picName === 'string') setPicName(draft.picName);
    if (typeof draft.picPhone === 'string') setPicPhone(draft.picPhone);
    if (typeof draft.submissionDate === 'string' && draft.submissionDate) setSubmissionDate(draft.submissionDate);
    if (typeof draft.notes === 'string') setNotes(draft.notes);
    if (typeof draft.tenantName === 'string' && draft.tenantName) {
      setTenant({
        id: typeof draft.tenantId === 'string' ? draft.tenantId : '',
        name: draft.tenantName,
        floor: '',
        lot: typeof draft.unitNumber === 'string' ? draft.unitNumber : '',
        category: '',
      });
    }
    if (Array.isArray(draft.items)) {
      const rows: ItemState[] = [];
      for (const raw of draft.items) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        const slug = typeof r.slug === 'string' ? r.slug : '';
        if (!slug || !mediaBySlug[slug]) continue;
        rows.push({
          id: typeof r.id === 'string' && r.id ? r.id : buatIdBaris(),
          slug,
          media_target: typeof r.media_target === 'string' ? r.media_target : '',
          installation_date: typeof r.installation_date === 'string' ? r.installation_date : '',
          air_start_date: typeof r.air_start_date === 'string' ? r.air_start_date : '',
          air_end_date: typeof r.air_end_date === 'string' ? r.air_end_date : '',
        });
        if (rows.length >= MAX_BATCH_ITEMS) break;
      }
      if (rows.length > 0) setItems(rows);
    }
  }, [mediaTypes, mediaBySlug]);

  // Draf sessionStorage (teks saja).
  useEffect(() => {
    if (mediaTypes.length === 0) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        applicantType, nonTenantName, picName, picPhone, submissionDate, notes, items,
        tenantName: tenant?.name ?? '', tenantId: tenant?.id ?? '', unitNumber: tenant?.lot ?? '',
      }));
    } catch { /* storage diblokir - draf opsional */ }
  }, [mediaTypes, applicantType, nonTenantName, picName, picPhone, submissionDate, notes, items, tenant]);

  const dipilih = items.length;
  // Total ringkasan = Σ totalAmount (satu sumber kebenaran). Untuk media
  // `ppn_included`, subtotal SUDAH memuat PPN sehingga tidak boleh ditambah lagi.
  const totalSubtotal = barisHarga.reduce((sum, b) => sum + (b.harga?.subtotal ?? 0), 0);
  const totalPpn = barisHarga.reduce((sum, b) => sum + (b.harga?.ppnAmount ?? 0), 0);
  const totalTagihan = barisHarga.reduce((sum, b) => sum + (b.harga?.totalAmount ?? 0), 0);
  const adaTermasukPpn = barisHarga.some((b) => Boolean(b.m?.ppn_included));
  const adaBelumTermasukPpn = barisHarga.some((b) => Boolean(b.m) && !b.m?.ppn_included);
  // Label agregat: selama tidak ada media yang sudah termasuk PPN, label tetap
  // "PPN 11%" (angka = PPN yang ditambahkan ke subtotal).
  const labelAgregatPpn = adaTermasukPpn ? 'Termasuk PPN' : LABEL_PPN_STANDAR;

  function toggleMedia(slug: string) {
    setItems((prev) => {
      const ada = prev.some((it) => it.slug === slug);
      // Menghapus centang = menghapus SEMUA baris media itu.
      if (ada) return prev.filter((it) => it.slug !== slug);
      if (prev.length >= MAX_BATCH_ITEMS) return prev;
      // Mencentang = menambah SATU baris lokasi baru.
      return [...prev, buatBaris(slug)];
    });
  }

  /** Tambah satu baris lokasi lagi untuk media yang sudah terpilih. */
  function tambahLokasi(slug: string) {
    setItems((prev) => (prev.length >= MAX_BATCH_ITEMS ? prev : [...prev, buatBaris(slug)]));
  }

  function hapusBaris(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function updateItem(id: string, patch: Partial<ItemState>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function bersihkanError(key: string) {
    setFieldErrors((er) => ({ ...er, [key]: '' }));
  }

  /**
   * Pilih lalu unggah berkas bukti pembayaran pajak (satu berkas untuk seluruh
   * batch). Diunggah segera setelah dipilih supaya file_id sudah tersedia saat
   * kirim; fitur ini opsional.
   */
  async function pilihBerkasPajak(f: File | null) {
    setTaxError('');
    setTaxUploaded(null);
    setTaxFile(f);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setTaxError('Berkas melebihi 50MB.');
      setTaxFile(null);
      return;
    }
    setTaxUploading(true);
    try {
      setTaxUploaded(await uploadFile(f));
    } catch (err) {
      setTaxError(err instanceof Error ? err.message : 'Gagal mengunggah berkas pajak.');
    } finally {
      setTaxUploading(false);
    }
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
    // Kunci error memakai basis id baris yang SAMA dengan id input di langkah 2
    // (`<slug>` untuk baris pertama, `<slug>-<n>` untuk berikutnya) supaya tidak
    // bertabrakan antar baris dan pesan galat bisa ditampilkan per baris.
    const urutPerSlug: Record<string, number> = {};
    for (const [i, it] of items.entries()) {
      const idxBaris = urutPerSlug[it.slug] ?? 0;
      urutPerSlug[it.slug] = idxBaris + 1;
      const key = basisIdBaris(it.slug, idxBaris);
      const label = `Media ke-${i + 1}`;
      if (!it.media_target.trim()) errs[`target_${key}`] = `${label}: lokasi pemasangan wajib diisi.`;
      const cek = cekDurasiMinimal(it.air_start_date, it.air_end_date);
      if (!cek.ok) errs[`periode_${key}`] = `${label}: ${cek.message}`;
      // Lead time media: cegah tanggal pasang yang mustahil dipenuhi Mall,
      // diturunkan dari teks `rules` media (bukan klaim klien).
      const media = mediaBySlug[it.slug];
      const lead = checkInstallationDate(it.installation_date, media?.rules || '', toIsoDate());
      if (!lead.ok) errs[`lead_${key}`] = `${label}: ${lead.message}`;
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
      // Bukti pajak dikirim hanya bila fitur menyala DAN berkas sudah selesai
      // diunggah. Server tetap mengabaikannya bila fitur sedang dimatikan.
      const pajak = taxProofEnabled && taxUploaded
        ? {
            tax_proof_file_id: taxUploaded.file_id,
            tax_proof_file_url: taxUploaded.web_view_link,
            tax_proof_file_name: taxUploaded.file_name,
            tax_proof_mime: taxUploaded.mime_type,
            tax_proof_size_bytes: taxUploaded.file_size_bytes,
          }
        : {};
      const res = await submitBatch({
        applicant_type: applicantType,
        tenant_id: applicantType === 'tenant' ? (tenant?.id ?? '') : '',
        tenant_name: applicantType === 'tenant' ? (tenant?.name ?? '') : nonTenantName.trim(),
        unit_number: applicantType === 'tenant' ? (tenant?.lot ?? '') : '',
        pic_name: picName.trim(),
        pic_phone: picPhone.trim(),
        submission_date: submissionDate,
        notes: notes.trim(),
        terms_accepted: termsAccepted,
        device_fingerprint: getDeviceFingerprint(),
        items: items.map((it) => ({
          media_type_slug: it.slug,
          media_target: it.media_target.trim(),
          installation_date: it.installation_date,
          air_start_date: it.air_start_date,
          air_end_date: it.air_end_date,
          quantity: 1,
          ...pajak,
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

  // ─── Layar sukses: tiket pekerjaan ───
  if (submitState === 'success' && result) {
    return (
      <AppShell title="Pengajuan Terkirim" hideTabBar>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="doc-sheet overflow-hidden">
            <CropMarks />
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-[color:var(--rule-ink)] px-6 pt-6 pb-2.5">
              <span className="doc-plate-no">Tiket Pekerjaan</span>
              <span className="doc-plate-no ml-auto shrink-0">Batch Cetak</span>
            </div>

            <div className="px-6 pt-6 pb-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[color:var(--stamp-ok)]" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">Pengajuan Terkirim!</h2>
              <p className="ui-body ui-text-muted mt-2">
                Pengajuan media promosi cetak untuk{' '}
                <span className="font-semibold">{applicantType === 'tenant' ? tenant?.name : nonTenantName}</span>{' '}
                sudah kami terima ({result.items.length} media).
              </p>

              {/* Nomor batch = nomor job: data, jadi mono besar. */}
              <div className="mt-5 border-y border-[color:var(--rule-color)] py-4">
                <p className="doc-plate-no">Nomor batch</p>
                <p className="doc-num mt-1 text-2xl font-bold tracking-[0.1em] text-slate-900 dark:text-white">{result.batch_number}</p>
              </div>

              {/* Nomor per media: satu baris per pekerjaan, dipisah garis. */}
              <dl className="doc-rows mt-5 text-left">
                {result.items.map((it) => (
                  <div key={it.id} className="doc-row">
                    <dt className="doc-num">{it.submission_number}</dt>
                    <span className="doc-leader" aria-hidden="true" />
                    <dd className="font-sans">{mediaBySlug[it.media_type_slug]?.name ?? it.media_type_slug}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 text-xs ui-text-muted">
                Simpan nomor batch ini untuk memantau status seluruh media kapan saja.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {result.batch_token && (
                  <button
                    type="button"
                    onClick={() => navigate(`/batch/${result.batch_token}`)}
                    className="ui-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
                  >
                    Lihat Status Pengajuan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="ui-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
                >
                  Kembali ke Beranda
                </button>
              </div>
            </div>

            {/* Tepi perforasi: batas yang bisa disobek, tanda tiket. */}
            <div className="doc-perf mx-6" aria-hidden="true" />
            <p className="doc-plate-no px-6 py-4 text-center">
              Metropolitan Mall Bekasi · Kanal Media Cetak
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  /** Blok satu media di langkah 2 (checkbox + satu baris field per lokasi). */
  function renderBlokMedia(m: PromoMediaType) {
    const barisMedia = barisPerSlug[m.slug] ?? [];
    const terpilih = barisMedia.length > 0;
    // Basis id per baris (deterministik, berbasis slug): `<slug>` untuk baris
    // pertama, `<slug>-<n>` untuk baris berikutnya. `row.id` (UUID) tetap
    // dipakai sebagai `key` React dan identitas baris di state.
    const basisIdPerBaris: Record<string, string> = {};
    barisMedia.forEach((row, idx) => { basisIdPerBaris[row.id] = basisIdBaris(m.slug, idx); });
    return (
      <div
        key={m.slug}
        className={`border-b border-[color:var(--rule-color)] py-3.5 pl-3 ${
          terpilih ? 'bg-[var(--process-soft)]' : ''
        }`}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id={`cetak-media-${m.slug}`}
            type="checkbox"
            checked={terpilih}
            disabled={!terpilih && items.length >= MAX_BATCH_ITEMS}
            onChange={() => toggleMedia(m.slug)}
            className="mt-1 h-4 w-4 rounded-none accent-[var(--process)]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="doc-plate-no">
                Plate {String(m.sort_order ?? 0).padStart(2, '0')}
              </span>
              <span className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-white">{m.name}</span>
              <span className="doc-tag" data-tone="none">
                {CATEGORY_LABELS[m.category] ?? m.category}
              </span>
            </span>
            {m.price_note && (
              <span className="mt-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                {m.price_note} {m.ppn_included ? '(sudah termasuk PPN)' : '(belum termasuk PPN)'}
              </span>
            )}
          </span>
        </label>

        {/* Ukuran & material sebagai tabel titik penghubung: nilainya data,
         * jadi rata kanan dan monospace. Diletakkan di luar `<label>` karena
         * `<label>` hanya menerima konten phrasing. */}
        <dl className="doc-rows mt-2.5">
          {m.size_spec && (
            <div className="doc-row">
              <dt>Ukuran</dt>
              <span className="doc-leader" aria-hidden="true" />
              <dd>{m.size_spec}</dd>
            </div>
          )}
          {m.material_spec && (
            <div className="doc-row">
              <dt>Material</dt>
              <span className="doc-leader" aria-hidden="true" />
              <dd>{m.material_spec}</dd>
            </div>
          )}
        </dl>

        {terpilih && (
          <div className="mt-3 border-t border-[color:var(--rule-color)]">
            {barisMedia.map((row, idx) => {
              const dur = durationDays(row.air_start_date, row.air_end_date);
              const harga = m.price_amount
                ? hitungHarga({ priceAmount: m.price_amount, ppnIncluded: Boolean(m.ppn_included), durationDays: dur })
                : null;
              // Basis id/kunci error baris ini (lihat `basisIdBaris`).
              const basis = basisIdPerBaris[row.id] ?? basisIdBaris(m.slug, idx);
              return (
                <fieldset key={row.id} className="border-b border-[color:var(--rule-color)] py-3 last:border-b-0">
                  <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
                    Lokasi ke-{idx + 1}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor={`cetak-target-${basis}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
                        Lokasi Pemasangan <span className="text-[color:var(--stamp-no)]">*</span>
                      </label>
                      <input
                        id={`cetak-target-${basis}`}
                        type="text"
                        value={row.media_target}
                        maxLength={200}
                        placeholder={m.location_note || 'Contoh: Sisi Pintu Tol Bekasi Barat'}
                        onChange={(e) => { updateItem(row.id, { media_target: e.target.value }); bersihkanError(`target_${basis}`); }}
                        className="ui-control w-full px-3 py-2 text-sm"
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors[`target_${basis}`] && <p role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors[`target_${basis}`]}</p>}
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`cetak-start-${basis}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">Periode Mulai</label>
                      <input
                        id={`cetak-start-${basis}`}
                        type="date"
                        value={row.air_start_date}
                        onChange={(e) => { updateItem(row.id, { air_start_date: e.target.value }); bersihkanError(`periode_${basis}`); }}
                        className="ui-control w-full px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor={`cetak-end-${basis}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">Periode Selesai</label>
                      <input
                        id={`cetak-end-${basis}`}
                        type="date"
                        value={row.air_end_date}
                        onChange={(e) => { updateItem(row.id, { air_end_date: e.target.value }); bersihkanError(`periode_${basis}`); }}
                        className="ui-control w-full px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`cetak-install-${basis}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">Tanggal Pemasangan</label>
                      <input
                        id={`cetak-install-${basis}`}
                        type="date"
                        value={row.installation_date}
                        min={checkInstallationDate('', m.rules || '', toIsoDate()).earliest || undefined}
                        onChange={(e) => { updateItem(row.id, { installation_date: e.target.value }); bersihkanError(`lead_${basis}`); }}
                        className={`ui-control w-full px-3 py-2 text-sm sm:max-w-xs ${fieldErrors[`lead_${basis}`] ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                        aria-invalid={fieldErrors[`lead_${basis}`] ? true : undefined}
                        aria-describedby={fieldErrors[`lead_${basis}`] ? `err-lead-${basis}` : undefined}
                      />
                      <p className="mt-1 text-xs ui-text-muted">
                        Tanggal paling awal menyesuaikan ketentuan media; jadwal final ditentukan Mall.
                      </p>
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors[`lead_${basis}`] && <p id={`err-lead-${basis}`} role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors[`lead_${basis}`]}</p>}
                      </div>
                    </div>
                    {fieldErrors[`periode_${basis}`] && (
                      <p role="alert" className="text-xs font-medium text-[color:var(--stamp-no)] sm:col-span-2">{fieldErrors[`periode_${basis}`]}</p>
                    )}
                    {harga && dur > 0 && (
                      <>
                        {/* Perhitungan baris ini: blok biaya dokumen, bukan kartu. */}
                        <div className="doc-calc sm:col-span-2">
                          <div>
                            <div className="doc-calc-k">Durasi</div>
                            <div className="doc-calc-v">{dur} hari</div>
                          </div>
                          <div>
                            <div className="doc-calc-k">Subtotal</div>
                            <div className="doc-calc-v">{rupiah(harga.subtotal)}</div>
                          </div>
                          <div>
                            <div className="doc-calc-k">{m.ppn_included ? 'Termasuk PPN' : LABEL_PPN_STANDAR}</div>
                            <div className="doc-calc-v">{rupiah(harga.ppnAmount)}</div>
                          </div>
                        </div>
                        <p className="text-xs ui-text-muted sm:col-span-2">
                          Perkiraan; harga final sesuai penawaran Tenant Relations.
                        </p>
                      </>
                    )}
                  </div>
                  {barisMedia.length > 1 && (
                    <button
                      type="button"
                      onClick={() => hapusBaris(row.id)}
                      className="mt-3 inline-flex items-center gap-1.5 border-b border-[color:var(--stamp-no)] pb-0.5 text-xs font-semibold text-[color:var(--stamp-no)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Hapus lokasi ke-{idx + 1}
                    </button>
                  )}
                </fieldset>
              );
            })}

            <button
              type="button"
              onClick={() => tambahLokasi(m.slug)}
              disabled={items.length >= MAX_BATCH_ITEMS}
              title={`Tambah lokasi lain untuk ${m.name}`}
              className="ui-btn-secondary my-3 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tambah lokasi lain
            </button>
          </div>
        )}
      </div>
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
        {/* Pip bagian dokumen: label langkah kapital ber-track + bilah segmen
         * bergaris. Bukan pil membulat - ini lembar kerja, bukan aplikasi. */}
        <nav className="mb-6" aria-label="Langkah pengajuan">
          <ol className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[color:var(--rule-color)]">
            {STEPS.map((s, i) => {
              const nomorLangkah = i + 1;
              const aktif = nomorLangkah === step;
              const selesai = nomorLangkah < step;
              return (
                <li key={s.label} className="flex items-baseline gap-2 pb-2">
                  <span
                    className={`doc-num text-[11px] font-bold ${
                      aktif ? 'text-[color:var(--process)]' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {String(nomorLangkah).padStart(2, '0')}
                  </span>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      aktif
                        ? 'text-[color:var(--process)]'
                        : selesai
                          ? 'text-slate-700 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
            <li className="ml-auto pb-2">
              <span className="doc-plate-no">
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
                    ? 'border-[color:var(--process)] bg-[color:var(--process)]'
                    : 'border-[color:var(--rule-strong)] bg-[var(--surface-offset)]'
                }`}
              />
            ))}
          </div>
        </nav>

        {loading && (
          <div className="doc-sheet flex items-center justify-center gap-3 p-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-[color:var(--process)]" aria-hidden="true" />
            <span className="text-sm ui-text-muted">Memuat katalog media cetak…</span>
          </div>
        )}
        {loadError && (
          <div className="ui-alert flex items-start gap-3 p-4" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--stamp-no)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[color:var(--stamp-no)]">Gagal memuat katalog media cetak.</p>
              <p className="mt-1 text-xs ui-text-muted">Muat ulang halaman atau coba lagi sebentar.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && (
          <div className="doc-sheet overflow-hidden">
            <CropMarks />
            {/* ─── Langkah 1: Data Pemohon ─── */}
            {step === 1 && (
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
                  <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-extrabold uppercase tracking-wide text-slate-900 focus:outline-none dark:text-white">Data Pemohon</h2>
                  <span className="doc-plate-no ml-auto shrink-0">Bagian 01</span>
                </div>
                <p className="ui-body ui-text-muted mt-3">Isi data pemohon dan kontak yang dapat dihubungi.</p>
                {items.length > 0 && (
                  <p className="mt-3 border-l-2 border-[color:var(--process)] bg-[var(--process-soft)] px-3 py-2 text-xs font-medium text-[color:var(--process)]">
                    Media terpilih: {items.map((it) => mediaBySlug[it.slug]?.name ?? it.slug).join(', ')}. Bisa diubah di langkah Pilih Media.
                  </p>
                )}

                <div className="mt-5 space-y-4">
                  <fieldset>
                    <legend className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">Jenis Pemohon</legend>
                    <div className="flex gap-2" role="group" aria-label="Jenis pemohon">
                      {(['tenant', 'non_tenant'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={applicantType === t}
                          onClick={() => { setApplicantType(t); setFieldErrors({}); }}
                          className={`min-h-11 flex-1 border px-3 py-2 text-sm font-semibold ${
                            applicantType === t
                              ? 'border-[color:var(--process)] bg-[var(--process-soft)] text-[color:var(--process)]'
                              : 'border-[color:var(--rule-color)] text-slate-600 hover:bg-[var(--surface-hover)] dark:text-slate-300'
                          }`}
                        >
                          {APPLICANT_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {applicantType === 'tenant' ? (
                    <div>
                      <label htmlFor="cetak-tenant" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">
                        Nama Tenant <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
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
                      <label htmlFor="cetak-non-tenant" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">
                        Nama Non Tenant <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                      </label>
                      <p className="mb-1.5 text-xs ui-text-muted">Nama badan usaha atau perorangan yang mengajukan.</p>
                      <input
                        id="cetak-non-tenant"
                        type="text"
                        value={nonTenantName}
                        maxLength={100}
                        onChange={(e) => { setNonTenantName(e.target.value); setFieldErrors((er) => ({ ...er, non_tenant: '' })); }}
                        className={`ui-control w-full px-3 py-2.5 text-sm ${fieldErrors.non_tenant ? 'ring-1 ring-[color:var(--stamp-no)]' : ''}`}
                        aria-invalid={fieldErrors.non_tenant ? true : undefined}
                        aria-describedby={fieldErrors.non_tenant ? 'err-non_tenant' : undefined}
                      />
                      <div className="ui-helper-slot mt-1">
                        {fieldErrors.non_tenant && <p id="err-non_tenant" role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.non_tenant}</p>}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="cetak-pic" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">
                        Nama Pemohon <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
                      </label>
                      <input
                        id="cetak-pic"
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
                      <label htmlFor="cetak-phone" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">
                        Nomor Telepon <span aria-hidden="true" className="text-[color:var(--stamp-no)]">*</span>
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
                    <label htmlFor="cetak-date" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">Tanggal Pengajuan</label>
                    <input
                      id="cetak-date"
                      type="date"
                      value={submissionDate}
                      onChange={(e) => setSubmissionDate(e.target.value)}
                      className="ui-control w-full px-3 py-2.5 text-sm sm:max-w-xs"
                    />
                  </div>

                  <div>
                    <label htmlFor="cetak-notes" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">
                      Catatan <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                    </label>
                    <textarea
                      id="cetak-notes"
                      rows={3}
                      maxLength={1000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="ui-control w-full px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goStep2}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold"
                >
                  Lanjut ke Pilih Media
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 2: Pilih Media & Periode ─── */}
            {step === 2 && (
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
                  <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-extrabold uppercase tracking-wide text-slate-900 focus:outline-none dark:text-white">Pilih Media &amp; Periode</h2>
                  <span className="doc-plate-no ml-auto shrink-0">{dipilih} baris</span>
                </div>
                <p className="ui-body ui-text-muted mt-3">
                  Pilih satu atau beberapa media promosi cetak outdoor dan indoor. Minimal sewa {MIN_DURATION_DAYS} hari.
                  Media yang sama boleh dipasang di beberapa lokasi: centang sekali, lalu tekan "Tambah lokasi lain".
                </p>

                <div className="mt-5 space-y-6">
                  {cetakMedia.length === 0 && (
                    <p className="ui-text-muted text-sm">Belum ada media promosi cetak yang aktif.</p>
                  )}
                  {kelompokMedia.map((grup) => (
                    <section key={grup.kategori} aria-labelledby={`cetak-kategori-${grup.kategori}`}>
                      {/* Header seksi: judul kapital + garis 2px tinta. */}
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-[color:var(--rule-ink)] pb-2">
                        <h3
                          id={`cetak-kategori-${grup.kategori}`}
                          className="text-base font-extrabold uppercase tracking-wide text-slate-900 dark:text-white"
                        >
                          {CATEGORY_LABELS[grup.kategori] ?? grup.kategori}
                        </h3>
                        <span className="doc-plate-no ml-auto shrink-0">{grup.media.length} media</span>
                      </div>
                      <div className="mt-3 border-t border-[color:var(--rule-color)]">
                        {grup.media.map((m) => renderBlokMedia(m))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="ui-helper-slot mt-3">
                  {fieldErrors.media && <p role="alert" className="text-xs font-medium text-[color:var(--stamp-no)]">{fieldErrors.media}</p>}
                </div>
                {items.length >= MAX_BATCH_ITEMS && (
                  <p className="mt-2 text-xs ui-text-muted">
                    Batas maksimal {MAX_BATCH_ITEMS} baris media per pengajuan sudah tercapai.
                  </p>
                )}

                <button
                  type="button"
                  onClick={goStep3}
                  disabled={items.length === 0}
                  className="ui-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold"
                >
                  Lanjut ke Ringkasan
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ─── Langkah 3: Ringkasan & Kirim ─── */}
            {step === 3 && (
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-[color:var(--rule-ink)] pb-2.5">
                  <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-extrabold uppercase tracking-wide text-slate-900 focus:outline-none dark:text-white">Ringkasan &amp; Kirim</h2>
                  <span className="doc-plate-no ml-auto shrink-0">Bagian 03</span>
                </div>
                <p className="ui-body ui-text-muted mt-3">Periksa kembali data sebelum mengirim.</p>

                {/* Data pemohon sebagai tabel titik penghubung. */}
                <div className="mt-4 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-4">
                  <p className="doc-plate-no">Data Pemohon</p>
                  <dl className="doc-rows mt-2.5">
                    <div className="doc-row"><dt>Jenis Pemohon</dt><span className="doc-leader" aria-hidden="true" /><dd className="font-sans">{APPLICANT_TYPE_LABELS[applicantType]}</dd></div>
                    <div className="doc-row"><dt>{applicantType === 'tenant' ? 'Nama Tenant' : 'Nama Non Tenant'}</dt><span className="doc-leader" aria-hidden="true" /><dd className="font-sans">{applicantType === 'tenant' ? tenant?.name : nonTenantName}</dd></div>
                    <div className="doc-row"><dt>Nama Pemohon</dt><span className="doc-leader" aria-hidden="true" /><dd className="font-sans">{picName}</dd></div>
                    <div className="doc-row"><dt>Telepon</dt><span className="doc-leader" aria-hidden="true" /><dd>{picPhone}</dd></div>
                    <div className="doc-row"><dt>Tanggal Pengajuan</dt><span className="doc-leader" aria-hidden="true" /><dd>{formatTanggal(submissionDate)}</dd></div>
                    {notes && <div className="doc-row items-start"><dt className="pt-0.5">Catatan</dt><span className="doc-leader mt-2.5" aria-hidden="true" /><dd className="text-left font-sans text-xs leading-snug font-normal">{notes}</dd></div>}
                  </dl>
                </div>

                {/* Baris per media: satu pekerjaan per baris, dipisah garis. */}
                <div className="mt-4 border border-[color:var(--rule-color)]">
                  <p className="doc-plate-no border-b border-[color:var(--rule-color)] bg-[var(--surface-offset)] px-3 py-2">
                    Media dipilih ({dipilih})
                  </p>
                  <ul>
                    {barisHarga.map(({ it, m, dur, harga }) => (
                      <li key={it.id} className="border-b border-[color:var(--rule-color)] px-3 py-3 text-xs last:border-b-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{m?.name ?? it.slug}</p>
                        <dl className="doc-rows mt-1.5">
                          <div className="doc-row">
                            <dt>Lokasi</dt>
                            <span className="doc-leader" aria-hidden="true" />
                            <dd className="font-sans">{it.media_target || '-'}</dd>
                          </div>
                          <div className="doc-row">
                            <dt>Periode</dt>
                            <span className="doc-leader" aria-hidden="true" />
                            <dd className="font-sans">{formatTanggal(it.air_start_date)} s/d {formatTanggal(it.air_end_date)} ({dur} hari)</dd>
                          </div>
                          {it.installation_date && (
                            <div className="doc-row">
                              <dt>Tanggal pemasangan</dt>
                              <span className="doc-leader" aria-hidden="true" />
                              <dd className="font-sans">{formatTanggal(it.installation_date)}</dd>
                            </div>
                          )}
                        </dl>
                        {harga && (
                          <p className="doc-num mt-1.5 font-semibold text-slate-800 dark:text-slate-100">
                            {m?.ppn_included
                              ? `${rupiah(harga.totalAmount)} (sudah termasuk PPN ${rupiah(harga.ppnAmount)})`
                              : `${rupiah(harga.subtotal)} + PPN ${rupiah(harga.ppnAmount)} = ${rupiah(harga.totalAmount)}`}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Blok perhitungan agregat: subtotal / PPN / total. */}
                <div className="doc-calc mt-4">
                  <div>
                    <div className="doc-calc-k">Subtotal</div>
                    <div className="doc-calc-v">{rupiah(totalSubtotal)}</div>
                  </div>
                  <div>
                    <div className="doc-calc-k">{labelAgregatPpn}</div>
                    <div className="doc-calc-v">{rupiah(totalPpn)}</div>
                  </div>
                  <div>
                    <div className="doc-calc-k">Total</div>
                    <div className="doc-calc-v" data-emphasis="true">{rupiah(totalTagihan)}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs ui-text-muted">
                  Perkiraan; harga final sesuai penawaran Tenant Relations. Penagihan
                  dilakukan di luar aplikasi ini.
                </p>
                {adaTermasukPpn && adaBelumTermasukPpn && (
                  <p className="mt-1 text-xs ui-text-muted">
                    Sebagian media harganya sudah termasuk PPN dan sebagian belum; angka PPN di atas adalah
                    porsi PPN dari seluruh baris.
                  </p>
                )}

                {/* Bukti pembayaran pajak (opsional). Hanya bila admin menyalakan
                    fiturnya di dashboard. Satu berkas untuk seluruh batch. */}
                {taxProofEnabled && (
                  <div className="mt-4 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-4">
                    <p className="doc-plate-no">Bukti Pembayaran Pajak (opsional)</p>
                    <p className="mt-1.5 text-xs ui-text-muted">
                      Unggah bukti pembayaran PPN (JPEG, PNG, PDF, atau MP4, maks 50MB). Boleh
                      dikosongkan dan dilengkapi menyusul lewat Tenant Relations.
                    </p>
                    <label
                      htmlFor="cetak-tax-proof"
                      className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-5 text-center ${
                        taxError
                          ? 'border-[color:var(--stamp-no)] bg-[var(--stamp-no-soft)]'
                          : 'border-[color:var(--rule-strong)] bg-[var(--surface-offset)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {taxUploading
                        ? <Loader2 className="h-7 w-7 animate-spin text-[color:var(--process)]" aria-hidden="true" />
                        : <Upload className="h-7 w-7 text-[color:var(--process)]" aria-hidden="true" />}
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {taxUploading ? 'Mengunggah…' : (taxFile ? 'Ganti berkas' : 'Klik untuk memilih berkas')}
                      </span>
                      <span className="text-xs ui-text-muted">JPEG, PNG, PDF, MP4 · maks 50MB</span>
                      <input
                        id="cetak-tax-proof"
                        type="file"
                        accept="image/jpeg,image/png,application/pdf,video/mp4"
                        className="sr-only"
                        disabled={taxUploading}
                        onChange={(e) => { void pilihBerkasPajak(e.target.files?.[0] ?? null); e.target.value = ''; }}
                      />
                    </label>
                    {taxFile && taxUploaded && !taxError && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[color:var(--stamp-ok)]">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {taxFile.name} siap dikirim.
                      </p>
                    )}
                    {taxError && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[color:var(--stamp-no)]" role="alert">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {taxError}
                      </p>
                    )}
                  </div>
                )}

                <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    id="cetak-terms"
                    checked={termsAccepted}
                    onChange={(e) => { setTermsAccepted(e.target.checked); setSubmitError(''); }}
                    className="mt-0.5 h-4 w-4 accent-[var(--process)]"
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
                  <p className="mt-3 text-xs font-medium text-[color:var(--stamp-no)]" role="alert">{submitError}</p>
                )}

                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitState === 'sending' || !termsAccepted}
                  className="ui-btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:opacity-50"
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
