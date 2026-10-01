/**
 * Dashboard admin - 3 tab: Pengajuan (list/filter/review/hapus/export),
 * Katalog Media (CRUD), Pengguna (superadmin).
 * tenant_relation = read-only (tanpa aksi tulis).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, Film,
  ImageIcon, Link2, Loader2, LogOut, Megaphone, MessageCircle, Plus, Save, Trash2, Upload,
  Users as UsersIcon, Wrench, X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useConfirmDialog } from '../ConfirmDialog';
import Sheet from '../ui/Sheet';
import Stamp from '../promo/Stamp';
import {
  STATUS_LABELS, STATUS_ORDER, CATEGORY_LABELS, CHANNEL_LABELS, APPLICANT_TYPE_LABELS,
} from '../../constants/promo';
import { submissionWaLink } from '../../utils/whatsapp';
import { checkInstallationDate, toIsoDate } from '../../utils/leadTime';
import { STATUS_TRANSITIONS, isInstallableStatus } from '../../utils/statusFlow';
import { installationProofViews } from '../../utils/proof';
import {
  fetchAdminSubmissions, fetchAdminSummary, fetchAdminSubmissionDetail,
  updateSubmissionStatus, recordInstallation, deleteSubmission,
  fetchAdminMediaTypes, createMediaType, updateMediaType, deleteMediaType,
  uploadMediaImage, deleteMediaImage,
  downloadExportCsv, fetchAdminUsers, createUser, updateUser, deleteUser,
  type MediaTypeInput,
  fetchAdminReminders, uploadInstallationProof,
  fetchAdminSettings, updateAdminSettings, uploadTaxProof,
} from '../../utils/adminApi';
import type {
  PromoMediaType, AdminSubmissionRow, AdminUserRow, StatusPageData, RemindersData,
} from '../../types/promo';

type Tab = 'submissions' | 'catalog' | 'users' | 'settings';

const STATUS_OPTIONS = ['', ...STATUS_ORDER];
const ROLE_OPTIONS = ['admin', 'tenant_relation', 'superadmin'];

/**
 * Status yang mewajibkan Catatan Review - **cermin** aturan server di
 * `server/src/routes/admin.js` (POST /admin/submissions/:id/status):
 * `perlu_revisi` → "Komentar wajib diisi ketika meminta revisi",
 * `ditolak` → "Alasan wajib diisi ketika menolak materi".
 *
 * Klien menegakkannya lebih awal supaya admin tidak baru tahu setelah submit
 * (dulu tombol tetap aktif, lalu server membalas 400). Server tetap otoritatif
 * - pesan galat server di bawah tidak dihapus.
 */
const STATUS_WAJIB_CATATAN: readonly string[] = ['perlu_revisi', 'ditolak'];

/** Pesan yang ditampilkan di klien; teks server tetap dipakai bila ia menolak. */
const PESAN_CATATAN_WAJIB: Record<string, string> = {
  perlu_revisi: 'Catatan wajib diisi saat meminta revisi materi.',
  ditolak: 'Alasan wajib diisi saat menolak materi.',
};

/**
 * Format rupiah ringkas untuk snapshot harga pengajuan cetak.
 * Sama dengan `rupiah()` di `src/components/promo/PromoCetakWizard.tsx`
 * ("Rp. 1.100.000") supaya angka di dashboard staf dan di form tenant
 * terbaca identik.
 */
function rupiah(n: number): string {
  return `Rp. ${Number(n || 0).toLocaleString('id-ID')}`;
}

/** Ikon materi: tautan eksternal punya ikon sendiri (mime kosong). */
function FileIcon({ mime, source }: { mime: string; source?: string }) {
  if (source === 'link') return <Link2 className="h-4 w-4" aria-hidden="true" />;
  if (mime === 'video/mp4') return <Film className="h-4 w-4" aria-hidden="true" />;
  if (mime === 'application/pdf') return <FileText className="h-4 w-4" aria-hidden="true" />;
  return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
}

// ══════════ Tab: Pengajuan ══════════

function SubmissionsTab({ canManage, onConfirmDelete }: { canManage: boolean; onConfirmDelete: (id: string, subject: string) => Promise<boolean> }) {
  // Dialog konfirmasi generik (pola `schedule-event-v2`) untuk keputusan yang
  // butuh penegasan staf, mis. mencatat pemasangan saat materi belum diterima.
  const { confirm, dialog } = useConfirmDialog();
  const [rows, setRows] = useState<AdminSubmissionRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [mediaFilter, setMediaFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [mediaTypes, setMediaTypes] = useState<PromoMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [summaryTotal, setSummaryTotal] = useState(0);
  // Pengingat periode berakhir (query turunan, bukan cron).
  const [reminders, setReminders] = useState<RemindersData | null>(null);
  // `reminders === null` juga berarti "belum dimuat", jadi galat dilacak
  // terpisah agar staf dapat membedakan "kosong" dari "gagal memuat".
  const [remindersError, setRemindersError] = useState(false);
  // Panel ringkas 5 item; tombol "Tampilkan N lainnya" membuka daftar penuh.
  const [pengingatTerbuka, setPengingatTerbuka] = useState(false);

  const [detail, setDetail] = useState<AdminSubmissionRow | null>(null);
  const [detailData, setDetailData] = useState<StatusPageData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newStatus, setNewStatus] = useState('disetujui');
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Form pemasangan (FR-041..FR-045).
  const [installLocation, setInstallLocation] = useState('');
  const [installStart, setInstallStart] = useState('');
  const [installEnd, setInstallEnd] = useState('');
  const [installNotes, setInstallNotes] = useState('');
  const [installProof, setInstallProof] = useState('');
  const [proofKind, setProofKind] = useState<'link' | 'upload'>('link');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [unggahBukti, setUnggahBukti] = useState(false);

  // Bukti pembayaran pajak (staf). Fitur hanya berlaku bila admin menyalakannya.
  const [taxProofEnabled, setTaxProofEnabled] = useState(false);
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [taxUploading, setTaxUploading] = useState(false);
  const [taxError, setTaxError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAdminSubmissions({
        status: statusFilter || undefined,
        media_type: mediaFilter || undefined,
        tenant: tenantFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        q: search || undefined,
        page,
      });
      setRows(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengajuan.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mediaFilter, tenantFilter, dateFrom, dateTo, search, page]);

  const loadSummary = useCallback(async () => {
    try {
      const s = await fetchAdminSummary();
      setSummary(s.counts);
      setSummaryTotal(s.total);
    } catch {
      // Ringkasan bersifat informatif - kegagalan tidak menghalangi daftar.
      setSummary({});
      setSummaryTotal(0);
    }
  }, []);

  const loadReminders = useCallback(async () => {
    try {
      setReminders(await fetchAdminReminders());
      setRemindersError(false);
    } catch {
      // Pengingat bersifat informatif - kegagalan tidak menghalangi daftar,
      // tetapi harus TERLIHAT agar staf tidak mengira tidak ada pengingat.
      setReminders(null);
      setRemindersError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadReminders(); }, [loadReminders]);

  useEffect(() => {
    fetchAdminMediaTypes()
      .then((rows) => setMediaTypes(rows))
      .catch(() => setMediaTypes([]));
  }, []);

  // Saklar pajak (dibaca dari server) - menentukan apakah blok bukti pajak
  // muncul di sheet detail. Gagal baca = tetap MATI.
  useEffect(() => {
    fetchAdminSettings()
      .then((s) => setTaxProofEnabled(s.tax_proof_enabled))
      .catch(() => setTaxProofEnabled(false));
  }, []);

  const mediaRulesBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of mediaTypes) map[m.slug] = m.rules;
    return map;
  }, [mediaTypes]);

  /**
   * Apakah materi masuk lebih lambat dari lead time medianya?
   * Diukur dari tanggal pengajuan dibuat (`created_at`), bukan hari ini -
   * jadi pengajuan lama yang sudah telat tetap ditandai, bukan hilang.
   */
  function leadTimeRisk(row: AdminSubmissionRow): string {
    if (!row.installation_date) return '';
    const submittedAt = new Date(row.created_at);
    if (Number.isNaN(submittedAt.getTime())) return '';
    const check = checkInstallationDate(
      row.installation_date,
      mediaRulesBySlug[row.media_type_slug] || '',
      toIsoDate(submittedAt),
    );
    return check.ok ? '' : check.message;
  }

  function openDetail(row: AdminSubmissionRow) {
    setDetail(row);
    setDetailData(null);
    setNewStatus(row.status === 'menunggu_review' ? 'disetujui' : row.status);
    setReviewNotes(row.review_notes || '');
    setSaveError('');
    setInstallLocation('');
    setInstallStart('');
    setInstallEnd('');
    setInstallNotes('');
    setInstallProof('');
    setProofKind('link');
    setProofFile(null);
    setTaxFile(null);
    setTaxError('');
    setDetailLoading(true);
    fetchAdminSubmissionDetail(row.id)
      .then((data) => setDetailData(data))
      .catch(() => setDetailData(null))
      .finally(() => setDetailLoading(false));
  }

  /** Status tujuan yang sah dari status saat ini (FR-032..FR-034). */
  const allowedStatuses = useMemo(() => {
    if (!detail) return [];
    const allowed = STATUS_TRANSITIONS[detail.status] || [];
    // Status saat ini boleh "disimpan ulang" tanpa mengubah apa pun.
    return [detail.status, ...allowed];
  }, [detail]);

  /**
   * Apakah pilihan status mewajibkan catatan tetapi catatannya masih kosong?
   * Dipakai untuk menonaktifkan tombol Simpan Status + menampilkan pesannya
   * lebih awal (cermin aturan server, lihat `STATUS_WAJIB_CATATAN`).
   */
  const catatanWajibKosong =
    detail !== null
    && STATUS_WAJIB_CATATAN.includes(newStatus)
    && newStatus !== detail.status
    && !reviewNotes.trim();

  /**
   * Sheet detail: jenis pemohon menentukan label baris nama dan apakah penanda
   * MID bermakna. Pemohon non-tenant tidak punya MID sama sekali, jadi label
   * "Tenant"/"(manual, tidak tertaut MID)" akan menyesatkan staf.
   */
  const detailNonTenant = detail?.applicant_type === 'non_tenant';

  async function saveStatus() {
    if (!detail) return;
    if (catatanWajibKosong) return;
    setSaving(true);
    setSaveError('');
    try {
      await updateSubmissionStatus(detail.id, newStatus, reviewNotes.trim());
      setDetail(null);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan status.');
    } finally {
      setSaving(false);
    }
  }

  async function saveInstallation() {
    if (!detail) return;
    // Opsi B (docs/PLAN_2026-09-23_19-45.md): pengajuan kanal cetak
    // (`source_type === 'none'`) memang tidak melampirkan materi saat
    // diajukan. Staf TETAP boleh mencatat pemasangan (materi bisa diterima di
    // luar aplikasi), tetapi harus mengonfirmasi lebih dulu bahwa materinya
    // sudah benar-benar diterima - supaya status Sudah Dipasang tidak
    // ditetapkan tanpa kesadaran dan pengingat periode tidak menerima data
    // yang keliru.
    if (detail.source_type === 'none') {
      const lanjut = await confirm({
        title: 'Materi belum diterima. Tetap catat pemasangan?',
        message: 'Pengajuan ini belum pernah menerima materi. Menyimpan pemasangan akan menetapkan '
          + 'status materi menjadi Sudah Dipasang dan memasukkannya ke pengingat periode berakhir. '
          + 'Lanjutkan hanya bila materinya sudah benar-benar diterima.',
        subject: detail.submission_number,
        confirmLabel: 'Tetap Catat',
        cancelLabel: 'Batal',
      });
      if (!lanjut) return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await recordInstallation(detail.id, {
        media_location: installLocation.trim(),
        start_date: installStart,
        end_date: installEnd,
        notes: installNotes.trim(),
        proof_url: installProof.trim(),
        proof_kind: proofKind,
      });
      // Kanal unggahan: berkas dikirim setelah baris pemasangan ada.
      if (proofKind === 'upload' && proofFile) {
        await uploadInstallationProof(detail.id, proofFile);
      }
      setDetail(null);
      await Promise.all([load(), loadSummary(), loadReminders()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal mencatat pemasangan.');
    } finally {
      setSaving(false);
    }
  }

  /** Unggah/ganti bukti pembayaran pajak untuk pengajuan yang sedang dibuka. */
  async function uploadTaxProofNow() {
    if (!detail || !taxFile) return;
    setTaxUploading(true);
    setTaxError('');
    try {
      const res = await uploadTaxProof(detail.id, taxFile);
      // Segarkan sheet agar bukti yang baru langsung terlihat.
      setDetailData((d) => (d ? {
        ...d,
        submission: { ...d.submission, tax_proof_file_url: res.tax_proof_file_url, tax_proof_file_name: taxFile.name },
      } : d));
      setTaxFile(null);
    } catch (err) {
      setTaxError(err instanceof Error ? err.message : 'Gagal mengunggah bukti pajak.');
    } finally {
      setTaxUploading(false);
    }
  }

  async function handleDelete(row: AdminSubmissionRow) {
    const ok = await onConfirmDelete(row.id, `${row.tenant_name} - ${row.media_type_slug}`);
    if (!ok) return;
    try {
      await deleteSubmission(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus pengajuan.');
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadExportCsv();
    } finally {
      setExporting(false);
    }
  }
  return (

    <div>
      {/* Ringkasan jumlah per status - baris angka mono besar (`.ui-stat`) di
       * atas garis, bukan kartu. Angka memimpin lewat UKURANNYA; filter aktif
       * ditandai tinta (blok tenang + garis bawah), bukan warna aksen. */}
      <div className="grid grid-cols-2 border-t border-[color:var(--rule-color)] sm:grid-cols-4 lg:grid-cols-7">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatusFilter(statusFilter === s ? '' : s); setPage(1); }}
            aria-pressed={statusFilter === s}
            aria-label={`${STATUS_LABELS[s]} ${summary[s] ?? 0}`}
            className={`ui-stat border-b border-r border-[color:var(--rule-color)] px-3 py-2.5 text-left transition hover:bg-[var(--surface-hover)] ${
              statusFilter === s ? 'bg-[var(--surface-hover)]' : ''
            }`}
          >
            <span className="ui-stat-k">
              {STATUS_LABELS[s]}
            </span>
            <span
              className={`ui-stat-v ${statusFilter === s ? 'underline decoration-2 underline-offset-4' : ''}`}
            >
              {summary[s] ?? 0}
            </span>
          </button>
        ))}
      </div>
      <p className="mb-4 mt-2 text-xs ui-text-muted">Total {summaryTotal} pengajuan tercatat.</p>

      {/* Pengingat periode berakhir - query turunan (bukan cron/email).
       * Hanya media ber-pajak yang sudah dipasang; muncul bila ada yang
       * mendekati/melewati akhir periode. */}
      {/* Keadaan galat eksplisit: tanpa ini staf mengira tidak ada pengingat.
       * Keadaan KOSONG sengaja TIDAK dirender (panel tetap tersembunyi bila
       * tidak ada item) karena desain itu dikunci test lama
       * (`AdminDashboardPage.test.tsx` "tidak menampilkan panel bila tidak ada
       * pengingat"). Yang ditambahkan hanya pembeda "gagal memuat". */}
      {remindersError && (
        <section className="ui-alert-panel mb-4 flex items-start gap-2 p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-red-800">Gagal memuat pengingat periode berakhir.</p>
            <p className="mt-1 text-xs text-red-700">Muat ulang halaman untuk mencoba lagi.</p>
          </div>
        </section>
      )}
      {reminders && reminders.items.length > 0 && (
        <section
          className="ui-card mb-4 p-3"
          aria-labelledby="pengingat-judul"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--rule-color)] pb-2">
            <h2 id="pengingat-judul" className="ui-title-section">
              Pengingat periode berakhir
            </h2>
            <p className="text-xs ui-text-muted">
              {reminders.overdue > 0 && <span className="ui-num font-semibold text-red-600">{reminders.overdue} sudah lewat</span>}
              {reminders.overdue > 0 && reminders.due_soon > 0 && ' · '}
              {reminders.due_soon > 0 && <span className="ui-num">{reminders.due_soon} dalam {reminders.days} hari</span>}
              {(reminders.belum_terpasang ?? 0) > 0 && (
                <>
                  {(reminders.overdue > 0 || reminders.due_soon > 0) && ' · '}
                  <span className="ui-num font-semibold text-amber-700">{reminders.belum_terpasang} belum tercatat terpasang</span>
                </>
              )}
            </p>
          </div>
          <ul
            id="pengingat-daftar"
            className={`mt-2 space-y-1.5 ${pengingatTerbuka ? 'max-h-80 overflow-y-auto' : ''}`}
          >
            {(pengingatTerbuka ? reminders.items : reminders.items.slice(0, 5)).map((r) => {
              const wa = submissionWaLink({
                pic_phone: r.pic_phone, tenant_name: r.tenant_name,
                media_type_slug: r.media_type_slug, status: r.status,
              });
              // Pengingat adalah daftar aksi: staf harus bisa langsung membuka
              // detail pengajuan yang diingatkan. Bila baris itu ada di daftar
              // yang termuat, pakai `openDetail` (muat riwayat/versi materi);
              // bila tidak (di luar 20 teratas), buka dari baris ringkas.
              const barisDaftar = rows.find((x) => x.id === r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--rule-color)] pb-1.5 text-xs last:border-b-0 last:pb-0">
                  <span className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openDetail(barisDaftar ?? ({
                        id: r.id,
                        submission_number: r.submission_number,
                        tenant_name: r.tenant_name,
                        pic_name: '', pic_phone: r.pic_phone,
                        media_type_slug: r.media_type_slug,
                        status: r.status,
                        air_end_date: r.air_end_date,
                        created_at: '',
                      } as AdminSubmissionRow))}
                      className="ui-num min-h-11 font-semibold text-slate-700 underline-offset-2 transition hover:underline"
                    >
                      {r.submission_number}
                    </button>
                    <span className="ml-1.5 ui-text-muted">{r.tenant_name} · {r.media_type_slug}</span>
                    {r.category === 'belum_terpasang' && (
                      <span className="ui-tag ml-1.5 shrink-0">
                        belum tercatat terpasang
                      </span>
                    )}
                  </span>
                  <span className={`ui-num shrink-0 font-semibold ${r.days_left !== null && r.days_left < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    {r.days_left === null ? r.end_date || '-' : r.days_left < 0 ? `lewat ${Math.abs(r.days_left)} hari` : `${r.days_left} hari lagi`}
                  </span>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium underline underline-offset-[3px]">
                      Ingatkan via WhatsApp
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {reminders.items.length > 5 && (
            <button
              type="button"
              onClick={() => setPengingatTerbuka((v) => !v)}
              aria-expanded={pengingatTerbuka}
              aria-controls="pengingat-daftar"
              className="ui-label ui-control mt-2 inline-flex min-h-11 items-center border border-[color:var(--rule-color)] px-3 py-2 transition hover:" data-tone="strong"
            >
              {pengingatTerbuka
                ? 'Sembunyikan'
                : `Tampilkan ${reminders.items.length - 5} lainnya`}
            </button>
          )}
        </section>
      )}

      {/* Baris kontrol dokumen: pencarian, filter, jumlah, ekspor. */}
      <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-2 border-y border-[color:var(--rule-color)] py-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="filter-search" className="ui-label mb-1 block">Cari</label>
          <input
            id="filter-search"
            type="search"
            value={search}
            placeholder="Nomor pengajuan, tenant, atau judul materi"
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <div>
          <label htmlFor="filter-status" className="ui-label mb-1 block">Status</label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="ui-control border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === '' ? 'Semua' : STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-media" className="ui-label mb-1 block">Media</label>
          <select
            id="filter-media"
            value={mediaFilter}
            onChange={(e) => { setMediaFilter(e.target.value); setPage(1); }}
            className="ui-control max-w-48 border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Semua</option>
            {mediaTypes.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="filter-tenant" className="ui-label mb-1 block">Tenant</label>
          <input
            id="filter-tenant"
            type="text"
            value={tenantFilter}
            placeholder="Nama tenant"
            onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
            className="ui-control w-40 border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <div>
          <label htmlFor="filter-date-from" className="ui-label mb-1 block">Dari tanggal</label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="ui-control border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <div>
          <label htmlFor="filter-date-to" className="ui-label mb-1 block">Sampai tanggal</label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="ui-control border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <span className="ui-num ml-auto text-xs ui-text-muted">{total} pengajuan</span>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="ui-control inline-flex min-h-11 items-center gap-1.5 border border-[color:var(--rule-color)] px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-[color:var(--action)] disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          Unduh CSV
        </button>
      </div>

      {error && (
        <div className="ui-alert-panel mb-4 flex items-start gap-2 p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Tabel pengajuan: baris dipisah garis rambut 1px, tanpa kartu
       * bersarang dan tanpa bingkai tinta. Sel angka memakai `.ui-num` rata
       * kanan agar kolom bisa dibandingkan.
       * Petunjuk geser diletakkan DI LUAR wadah bergulir: di dalam, ia ikut
       * tergulir dan justru hilang saat paling dibutuhkan. */}
      <p className="px-3 pb-1 text-xs ui-text-muted lg:hidden">
        Geser tabel ke samping untuk melihat kolom lain.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[color:var(--rule-color)]">
              <th className="px-3 py-2 ui-label">Nomor</th>
              <th className="px-3 py-2 text-right ui-label">Tanggal</th>
              <th className="px-3 py-2 ui-label">Tenant</th>
              <th className="px-3 py-2 ui-label">Materi</th>
              <th className="px-3 py-2 ui-label">File</th>
              <th className="px-3 py-2 ui-label">Status</th>
              <th className="px-3 py-2 text-right ui-label">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-10 text-center" role="status">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" aria-hidden="true" />
                <span className="sr-only">Memuat pengajuan…</span>
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm ui-text-muted" role="status">
                  Tidak ada pengajuan.
                </td>
              </tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--rule-color)] transition hover:bg-[var(--surface-hover)]">
                <td className="px-3 py-3">
                  <span className="ui-num whitespace-nowrap text-xs font-semibold text-slate-900">
                    {r.submission_number || '-'}
                  </span>
                  {/* Nomor batch pengajuan cetak: satu kirim form cetak memuat
                   * beberapa pengajuan, jadi nomor batch membantu staf mengenali
                   * baris kiriman yang sama. Baris non-batch tidak menambah apa pun. */}
                  {r.batch_number && (
                    <p className="ui-num mt-0.5 text-xs ui-text-muted">{r.batch_number}</p>
                  )}
                </td>
                <td className="ui-num whitespace-nowrap px-3 py-3 text-right text-xs text-slate-600">
                  {r.created_at ? new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-900">{r.tenant_name}</p>
                  <p className="text-xs ui-text-muted">
                    {r.unit_number ? `Unit ${r.unit_number} · ` : ''}{r.pic_name} · {r.pic_phone}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="text-slate-800">{r.material_title || r.media_type_slug}</p>
                  <p className="text-xs ui-text-muted">{r.media_type_slug}</p>
                  {r.installation_date && <p className="ui-num text-xs ui-text-muted">pasang: {r.installation_date}</p>}
                  {leadTimeRisk(r) && (
                    <span
                      className="mt-1 inline-flex items-center gap-1 border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-800"
                      title={leadTimeRisk(r)}
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      &lt; lead time
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {/* Pengajuan cetak tanpa materi (`source_type` 'none') tidak
                   * punya berkas maupun tautan: jangan render tautan kosong,
                   * cukup keterangan "menyusul" seperti di ekspor CSV. */}
                  {r.source_type === 'none' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs ui-text-muted">menyusul</span>
                  ) : (
                    <a
                      href={r.source_type === 'link' ? r.link_url : r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-40 items-center gap-1.5 truncate text-xs font-medium underline underline-offset-[3px]"
                    >
                      <FileIcon mime={r.mime_type} source={r.source_type} />
                      <span className="truncate">
                        {r.source_type === 'link' ? 'tautan materi' : (r.file_name || 'file')}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  )}
                </td>
                <td className="px-3 py-3"><Stamp status={r.status} /></td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openDetail(r)}
                      className="ui-control inline-flex min-h-11 items-center border border-[color:var(--rule-color)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-slate-900"
                    >
                      Detail
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(r)}
                        aria-label={`Hapus pengajuan ${r.tenant_name}`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginasi */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 border-t border-[color:var(--rule-color)] pt-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Halaman sebelumnya"
            className="ui-control inline-flex min-h-11 min-w-11 items-center justify-center border border-[color:var(--rule-color)] px-2.5 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="ui-num text-xs font-semibold ui-text-muted">Halaman {page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Halaman berikutnya"
            className="ui-control inline-flex min-h-11 min-w-11 items-center justify-center border border-[color:var(--rule-color)] px-2.5 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Modal detail/review - lembar spesifikasi + tiket pekerjaan. Isinya
       * memakai perabot dokumen: kepala bergaris tinta, tabel titik
       * penghubung, blok perhitungan, dan stempel status. */}
      <Sheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? detail.material_title || detail.tenant_name || 'Detail Pengajuan' : ''}
      >
        {detail && (
          <>
            <div className="border-b border-[color:var(--rule-strong)] pb-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="ui-label ui-text-strong">{detail.submission_number || '-'}</p>
                <Stamp status={detail.status} />
              </div>
              <p className="mt-1 text-xs ui-text-muted">
                {detail.tenant_name} · {detail.media_type_slug} · <span className="ui-num">{detail.created_at ? new Date(detail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
              </p>
            </div>

            <dl className="ui-specs mt-3">
              {/* Jenis pemohon menentukan label baris nama di bawah. Pengajuan
               * cetak boleh diajukan tenant maupun non-tenant; tanpa baris ini
               * staf tidak bisa membedakannya dan label "Tenant" menyesatkan
               * untuk pemohon non-tenant. */}
              <div className="ui-spec">
                <dt>Jenis Pemohon</dt>

                <dd>
                  {APPLICANT_TYPE_LABELS[detail.applicant_type ?? 'tenant'] ?? APPLICANT_TYPE_LABELS.tenant}
                </dd>
              </div>
              <div className="ui-spec"><dt>PIC</dt><dd>{detail.pic_name} · {detail.pic_phone}</dd></div>
              <div className="ui-spec">
                <dt>{detailNonTenant ? 'Nama Non Tenant' : 'Nama Tenant'}</dt>

                <dd>
                  {detail.tenant_name}
                  {/* Penanda MID hanya bermakna untuk tenant: non-tenant memang
                   * tidak pernah punya MID, jadi tidak boleh ditandai
                   * "manual, tidak tertaut MID". */}
                  {!detailNonTenant && detail.unit_number && <span className="ml-1.5 font-sans text-xs normal-case ui-text-muted">Unit {detail.unit_number}</span>}
                  {!detailNonTenant && (detail.tenant_id
                    ? <span className="ml-1.5 font-sans text-xs normal-case ui-text-muted">(MID {detail.tenant_id})</span>
                    : <span className="ml-1.5 font-sans text-xs font-medium normal-case text-amber-700">(manual, tidak tertaut MID)</span>)}
                </dd>
              </div>
              {/* Nomor batch: satu kirim form cetak bisa memuat beberapa media. */}
              {detail.batch_number && (
                <div className="ui-spec">
                  <dt>Nomor Batch</dt>

                  <dd>{detail.batch_number}</dd>
                </div>
              )}
              {detail.campaign_name && <div className="ui-spec"><dt>Campaign</dt><dd className="font-sans font-normal normal-case">{detail.campaign_name}</dd></div>}
              {/* Baris Deskripsi SELALU tampil. Dulu baris ini hilang saat
               * `material_description` kosong, sehingga staf mengira data
               * hilang padahal field-nya memang tidak diisi - khususnya
               * pengajuan kanal cetak, yang form-nya tidak meminta deskripsi.
               * Kini kekosongan dinyatakan eksplisit, bukan disembunyikan. */}
              <div className="ui-spec items-start">
                <dt className="pt-0.5">Deskripsi</dt>

                <dd className="font-sans font-normal normal-case">
                  {detail.material_description || <span className="ui-text-muted">tidak diisi</span>}
                </dd>
              </div>
              {detail.material_type && <div className="ui-spec"><dt>Jenis materi</dt><dd className="font-sans font-normal normal-case">{detail.material_type}</dd></div>}
              {detail.media_target && <div className="ui-spec"><dt>Media/lokasi</dt><dd className="font-sans font-normal normal-case">{detail.media_target}</dd></div>}
              {(detail.air_start_date || detail.air_end_date) && (
                <div className="ui-spec">
                  <dt>Periode tayang</dt>

                  <dd>{detail.air_start_date || '-'} s/d {detail.air_end_date || '-'}</dd>
                </div>
              )}
              {detail.installation_date && <div className="ui-spec"><dt>Tgl pasang</dt><dd>{detail.installation_date}</dd></div>}
              {leadTimeRisk(detail) && (
                <div className="ui-spec items-start">
                  <dt className="pt-0.5 text-amber-700">Lead time</dt>

                  <dd className="flex items-start justify-end gap-1.5 font-sans font-normal normal-case text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{leadTimeRisk(detail)}</span>
                  </dd>
                </div>
              )}
              {/* Materi: 'none' = pengajuan cetak yang formnya tidak meminta
               * berkas (materi menyusul lewat revisi). Dulu kanal ini ikut
               * dirender sebagai berkas, sehingga staf melihat tautan
               * `href=""` yang memuat ulang halaman saat diklik. Kanal tanpa
               * materi kini baris informasi biasa, bukan tautan. */}
              <div className="ui-spec items-start">
                <dt className="pt-0.5">
                  {detail.source_type === 'link'
                    ? 'Tautan'
                    : detail.source_type === 'upload' ? 'File' : 'Materi'}
                </dt>

                <dd className="min-w-0 font-sans font-normal normal-case">
                  {detail.source_type === 'none' ? (
                    <span className="text-slate-900">
                      Materi menyusul setelah pengajuan disetujui.
                    </span>
                  ) : (
                    <>
                      <a
                        href={detail.source_type === 'link' ? detail.link_url : detail.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-[3px] inline-flex items-center gap-1.5 break-all font-medium"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {detail.source_type === 'link' ? detail.link_url : (detail.file_name || 'file')}
                      </a>
                      {detail.source_type === 'link' && (
                        <p className="mt-1 text-xs ui-text-muted">
                          Materi ada di penyimpanan tenant. Unduh sendiri, tidak tersimpan di server kami.
                        </p>
                      )}
                    </>
                  )}
                </dd>
              </div>
              {detail.notes && <div className="ui-spec items-start"><dt className="pt-0.5">Catatan tenant</dt><dd className="font-sans font-normal normal-case">{detail.notes}</dd></div>}
              {detail.reviewed_by_name && <div className="ui-spec"><dt>Direview oleh</dt><dd className="font-sans font-normal normal-case">{detail.reviewed_by_name}</dd></div>}
            </dl>

            {/* Snapshot harga hanya dimiliki pengajuan hasil form cetak.
             * Dirender HANYA bila totalnya > 0, supaya pengajuan lama tanpa
             * snapshot tidak menampilkan baris nol yang menyesatkan.
             * Ketiga angka ditulis terpisah (bukan "subtotal + PPN = total")
             * karena untuk media ber-`ppn_included` PPN sudah berada DI DALAM
             * subtotal sehingga penjumlahan itu keliru. */}
            {(detail.total_amount ?? 0) > 0 && (
              <div className="mt-4 border border-[color:var(--rule-color)] border-t-2 border-t-[color:var(--rule-strong)] bg-[var(--surface-card)] px-3.5 py-3">
                <p className="ui-label">Perkiraan biaya</p>
                {/* Tiap baris adalah SATU simpul teks ("Subtotal Rp. ...") yang
                 * diratakan kanan, sehingga ekor nominalnya sejajar dan bisa
                 * dibandingkan sekilas. Ketiganya ditulis terpisah (bukan
                 * "subtotal + PPN = total") karena untuk media ber-`ppn_included`
                 * PPN sudah berada DI DALAM subtotal. */}
                <div className="mt-2 text-right">
                  <p className="ui-num border-b border-[color:var(--rule-color)] py-1 text-xs">{`Subtotal ${rupiah(detail.subtotal ?? 0)}`}</p>
                  <p className="ui-num border-b border-[color:var(--rule-color)] py-1 text-xs">{`${detail.ppn_included ? 'Termasuk PPN' : 'PPN'} ${rupiah(detail.ppn_amount ?? 0)}`}</p>
                  <p className="ui-num py-1 text-sm font-bold text-slate-900">{`Total ${rupiah(detail.total_amount ?? 0)}`}</p>
                </div>
                <p className="mt-1.5 border-t border-[color:var(--rule-color)] pt-1.5 text-xs ui-text-muted">
                  Angka perkiraan; pengajuan ini tidak melakukan penagihan.
                </p>
              </div>
            )}

            {/* Riwayat versi materi (FR-030) */}
            {detailLoading && (
              <p className="mt-4 flex items-center gap-2 text-xs ui-text-muted" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Memuat riwayat versi…
              </p>
            )}
            {!detailLoading && detailData && detailData.files.length > 0 && (
              <div className="mt-4 border-t border-[color:var(--rule-color)] pt-3">
                <p className="ui-label">Versi materi</p>
                <ul className="mt-1.5">
                  {detailData.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 border-b border-[color:var(--rule-color)] py-1 text-xs last:border-b-0">
                      <span className="min-w-0">
                        <span className="ui-num font-semibold text-slate-900">Versi {f.version}</span>
                        <span className="ui-num ml-1.5 ui-text-muted">
                          {f.created_at ? new Date(f.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        </span>
                      </span>
                      <a
                        href={f.source_type === 'link' ? f.link_url : f.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        /* `min-h-11` (44px) - axe `target-size` (WCAG 2.2 AA 2.5.8)
                         * menandai tautan ini 44.5×16px dengan ruang klik aman
                         * 20px ke tetangga terdekat; ini tautan kontrol berdiri
                         * sendiri di dalam baris daftar, bukan tautan inline di
                         * tengah kalimat, jadi pengecualian 2.5.8 tidak berlaku. */
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 font-medium text-[color:var(--action)]"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        Buka
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Riwayat status (FR-031, FR-037) - log tiket, satu baris per cap. */}
            {!detailLoading && detailData && detailData.history.length > 0 && (
              <div className="mt-4 border-t border-[color:var(--rule-color)] pt-3">
                <p className="ui-label">Riwayat status</p>
                <ol className="mt-1.5">
                  {detailData.history.map((h) => (
                    <li key={h.id} className="border-b border-[color:var(--rule-color)] py-1.5 text-xs last:border-b-0">
                      <p className="font-semibold text-slate-900">
                        {STATUS_LABELS[h.to_status] ?? h.to_status}
                        <span className="ui-num ml-1.5 font-normal ui-text-muted">
                          {h.created_at ? new Date(h.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                          {h.actor_type === 'admin' && h.actor_name ? ` · ${h.actor_name}` : ''}
                        </span>
                      </p>
                      {h.comment && <p className="mt-0.5 leading-relaxed text-slate-600">{h.comment}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Informasi pemasangan (FR-047) */}
            {!detailLoading && detailData?.installation && (
              <div className="mt-4 border-t border-[color:var(--rule-color)] pt-3">
                <p className="ui-label">Informasi pemasangan</p>
                <dl className="ui-specs mt-2">
                  <div className="ui-spec"><dt>Lokasi</dt><dd className="font-sans font-normal normal-case">{detailData.installation.media_location}</dd></div>
                  {(detailData.installation.start_date || detailData.installation.end_date) && (
                    <div className="ui-spec">
                      <dt>Periode</dt>

                      <dd>
                        {detailData.installation.start_date || '-'} s/d {detailData.installation.end_date || '-'}
                      </dd>
                    </div>
                  )}
                  {detailData.installation.notes && <div className="ui-spec items-start"><dt className="pt-0.5">Catatan</dt><dd className="font-sans font-normal normal-case">{detailData.installation.notes}</dd></div>}
                  {/* Bukti tayang dua kanal (tautan + berkas unggahan). Sebelumnya
                   * hanya `proof_url` yang dirender, sehingga staf yang baru saja
                   * mengunggah berkas tidak melihat buktinya di tempat yang sama. */}
                  {installationProofViews(detailData.installation).map((p) => (
                    <div key={p.kind} className="ui-spec items-start">
                      <dt className="pt-0.5">{p.label}</dt>

                      <dd className="min-w-0 font-sans font-normal normal-case">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-[3px] inline-flex min-h-11 items-center gap-1.5 break-all font-medium"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {p.linkLabel}
                        </a>
                        {p.fileName && <p className="break-all text-xs ui-text-muted">{p.fileName}</p>}
                        {(p.meta || p.uploaded) && (
                          <p className="ui-num text-xs ui-text-muted">
                            {[p.meta, p.uploaded].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </dd>
                    </div>
                  ))}
                  {detailData.installation.installed_by && <div className="ui-spec"><dt>Dicatat oleh</dt><dd className="font-sans font-normal normal-case">{detailData.installation.installed_by}</dd></div>}
                </dl>
              </div>
            )}

            {/* Aksi cepat: buka materi (verifikasi manual) + teruskan status via WA.
                wa.me butuh digit + kode negara; normalizer menangani format
                "08xx xxxx xxxx" yang diajarkan form.
                Tombol buka materi HANYA muncul bila materinya memang ada:
                pengajuan cetak ber-`source_type` 'none' tidak punya berkas,
                dan dulu tombolnya menaut ke `href=""` (memuat ulang halaman). */}
            <div className="mt-4 flex flex-wrap gap-2 border-y border-[color:var(--rule-color)] py-3">
              {detail.source_type !== 'none' && (
                <a
                  href={detail.source_type === 'link' ? detail.link_url : detail.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn-primary inline-flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Buka tautan materi
                </a>
              )}
              {(() => {
                // Pakai status TERSIMPAN (bukan newStatus yang belum disimpan) -
                // view TR read-only pun takkan salah menyebut "Disetujui" untuk
                // baris yang masih Menunggu.
                const wa = submissionWaLink({
                  pic_phone: detail.pic_phone,
                  tenant_name: detail.tenant_name,
                  media_type_slug: detail.media_type_slug,
                  status: detail.status,
                  review_notes: detail.review_notes,
                });
                if (!wa) return null;
                return (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-control inline-flex min-h-11 items-center gap-1.5 border border-[color:var(--rule-color)] px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-[color:var(--action)]"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Kirim pesan WA
                  </a>
                );
              })()}
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(
                  // Kanal 'none' tidak punya URL: menyalin "Tautan: " kosong
                  // hanya menghasilkan baris menyesatkan di pesan staf.
                  `${detail.tenant_name} - ${detail.media_type_slug}\n${
                    detail.source_type === 'none'
                      ? 'Materi: menyusul setelah pengajuan disetujui.'
                      : `Tautan: ${detail.source_type === 'link' ? detail.link_url : detail.file_url}`
                  }`,
                ); }}
                className="ui-control inline-flex min-h-11 items-center gap-1.5 border border-[color:var(--rule-color)] px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-[color:var(--action)]"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Salin tautan
              </button>
            </div>

            {/* Bukti pembayaran pajak (media cetak ber-PPN, bila fitur menyala).
                Menampilkan bukti yang sudah ada dan memungkinkan staf
                menambah/menggantinya. */}
            {taxProofEnabled && Number(detail.ppn_rate) > 0 && (
              <div className="mt-4 border-t border-[color:var(--rule-color)] pt-3">
                <p className="ui-label">Bukti Pembayaran Pajak</p>
                {detailData?.submission?.tax_proof_file_url ? (
                  <dl className="ui-specs mt-2">
                    <div className="ui-spec items-start">
                      <dt className="pt-0.5">Berkas</dt>

                      <dd className="min-w-0 font-sans font-normal normal-case">
                        <a
                          href={detailData.submission.tax_proof_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-[3px] inline-flex min-h-11 items-center gap-1.5 break-all font-medium"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Buka bukti pajak
                        </a>
                        {detailData.submission.tax_proof_file_name && (
                          <p className="break-all text-xs ui-text-muted">{detailData.submission.tax_proof_file_name}</p>
                        )}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-1.5 text-xs ui-text-muted">Belum ada bukti pembayaran pajak.</p>
                )}
                {canManage && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label htmlFor="tax-proof-file" className="ui-control inline-flex min-h-11 cursor-pointer items-center gap-1.5 border border-[color:var(--rule-color)] px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-[color:var(--action)]">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {taxFile ? taxFile.name : 'Pilih berkas pajak'}
                      <input
                        id="tax-proof-file"
                        type="file"
                        accept="image/jpeg,image/png,application/pdf,video/mp4"
                        className="sr-only"
                        disabled={taxUploading}
                        onChange={(e) => { setTaxFile(e.target.files?.[0] ?? null); setTaxError(''); e.target.value = ''; }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void uploadTaxProofNow()}
                      disabled={!taxFile || taxUploading}
                      className="ui-btn-primary inline-flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
                    >
                      {taxUploading
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Upload className="h-4 w-4" aria-hidden="true" />}
                      {taxUploading ? 'Mengunggah…' : 'Unggah bukti pajak'}
                    </button>
                  </div>
                )}
                {taxError && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[color:var(--stamp-no)]" role="alert">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {taxError}
                  </p>
                )}
              </div>
            )}

            {canManage ? (
              <div className="mt-4 border-t border-[color:var(--rule-color)] pt-4">
                <fieldset>
                  <legend className="ui-label mb-2 ui-text-strong">
                    Ubah status
                  </legend>
                  {/* Hanya transisi yang sah dari status saat ini (PRD §8) -
                      server tetap memvalidasi ulang. */}
                  <div className="flex flex-wrap gap-1.5">
                    {allowedStatuses.map((s) => (
                      <label
                        key={s}
                        className={`cursor-pointer border px-3 py-2 text-sm font-semibold transition ${
                          newStatus === s
                            ? 'border-[color:var(--action)] bg-[var(--action-soft)] text-[color:var(--action-strong)]'
                            : 'border-[color:var(--rule-color)] text-slate-600 hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="new-status"
                          value={s}
                          checked={newStatus === s}
                          onChange={() => setNewStatus(s)}
                          className="sr-only"
                        />
                        {STATUS_LABELS[s] ?? s}
                        {s === detail.status && <span className="ml-1 text-xs font-normal text-slate-600">(sekarang)</span>}
                      </label>
                    ))}
                  </div>
                  {STATUS_TRANSITIONS[detail.status]?.length === 0 && (
                    <p className="mt-1.5 text-xs ui-text-muted">
                      Status ini bersifat final, tidak ada perubahan status lanjutan.
                    </p>
                  )}
                </fieldset>

                <label htmlFor="review-notes" className="ui-label mb-1.5 mt-4 block">
                  Catatan Review <span className="text-xs font-normal normal-case tracking-normal ui-text-muted">
                    (wajib untuk Perlu Revisi dan Ditolak)
                  </span>
                </label>
                <textarea
                  id="review-notes"
                  rows={3}
                  maxLength={2000}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2.5 text-sm text-slate-900"
                  aria-invalid={catatanWajibKosong ? true : undefined}
                  aria-describedby={catatanWajibKosong ? 'err-review-notes' : undefined}
                />
                {catatanWajibKosong && (
                  <p id="err-review-notes" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                    {PESAN_CATATAN_WAJIB[newStatus]}
                  </p>
                )}

                {/* Catat pemasangan - hanya bila materi boleh dipasang (FR-040). */}
                {isInstallableStatus(detail.status) && (
                  <fieldset className="mt-4 border-t border-[color:var(--rule-color)] pt-4">
                    <legend className="ui-label mb-2 ui-text-strong">
                      Catat pemasangan
                    </legend>
                    {/* Peringatan materi belum diterima - HANYA informasi, bukan
                     * penjaga di titik ini. Pengajuan kanal cetak
                     * (`source_type` 'none') memang tidak melampirkan materi
                     * saat diajukan; materinya menyusul lewat revisi. Staf
                     * TETAP boleh mencatat pemasangan (opsi B di
                     * `docs/PLAN_2026-09-23_19-45.md`), tetapi tombol simpan
                     * meminta konfirmasi eksplisit lebih dulu. Warna memakai
                     * pola peringatan `leadTimeRisk` (amber), bukan merah yang
                     * dikhususkan untuk galat. */}
                    {detail.source_type === 'none' && (
                      <div
                        className="mb-3 flex items-start gap-2 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 p-3"
                        role="status"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                        <p className="text-xs text-amber-800">
                          Materi belum pernah diterima untuk pengajuan ini. Pengajuan cetak memang tidak
                          melampirkan materi saat diajukan, materinya menyusul lewat revisi. Menyimpan pemasangan
                          akan menetapkan status materi menjadi Sudah Dipasang. Pastikan materinya sudah
                          benar-benar diterima lebih dulu, misalnya lewat koordinasi dengan tenant.
                        </p>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label htmlFor="install-location" className="ui-label mb-1 block">
                          Media / lokasi pemasangan <span className="text-red-600">*</span>
                        </label>
                        <input
                          id="install-location"
                          type="text"
                          value={installLocation}
                          maxLength={200}
                          placeholder={detail.media_target || 'Contoh: Atrium 1'}
                          onChange={(e) => setInstallLocation(e.target.value)}
                          className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                      <div>
                        <label htmlFor="install-start" className="ui-label mb-1 block">Tanggal mulai</label>
                        <input
                          id="install-start"
                          type="date"
                          value={installStart}
                          onChange={(e) => setInstallStart(e.target.value)}
                          className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                        />
                      </div>
                      <div>
                        <label htmlFor="install-end" className="ui-label mb-1 block">Tanggal berakhir</label>
                        <input
                          id="install-end"
                          type="date"
                          value={installEnd}
                          onChange={(e) => setInstallEnd(e.target.value)}
                          className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="install-notes" className="ui-label mb-1 block">Catatan pemasangan</label>
                        <input
                          id="install-notes"
                          type="text"
                          value={installNotes}
                          maxLength={1000}
                          onChange={(e) => setInstallNotes(e.target.value)}
                          className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <span className="ui-label mb-1 block">
                          Bukti pemasangan <span className="text-xs font-normal normal-case tracking-normal ui-text-muted">(opsional)</span>
                        </span>
                        <div className="flex gap-1.5" role="group" aria-label="Cara memberi bukti pemasangan">
                          <button
                            type="button"
                            aria-pressed={proofKind === 'link'}
                            onClick={() => setProofKind('link')}
                            className={`min-h-11 flex-1 border px-3 py-2 ui-label transition ${
                              proofKind === 'link'
                                ? 'border-[color:var(--action)] bg-[var(--action-soft)] text-[color:var(--action-strong)]'
                                : 'border-[color:var(--rule-color)] text-slate-600 hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            Tautan
                          </button>
                          <button
                            type="button"
                            aria-pressed={proofKind === 'upload'}
                            onClick={() => setProofKind('upload')}
                            className={`min-h-11 flex-1 border px-3 py-2 ui-label transition ${
                              proofKind === 'upload'
                                ? 'border-[color:var(--action)] bg-[var(--action-soft)] text-[color:var(--action-strong)]'
                                : 'border-[color:var(--rule-color)] text-slate-600 hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            Unggah Foto
                          </button>
                        </div>
                      </div>

                      {proofKind === 'link' ? (
                        <div className="sm:col-span-2">
                          <label htmlFor="install-proof" className="ui-label mb-1 block">
                            Tautan bukti pemasangan
                          </label>
                          <input
                            id="install-proof"
                            type="url"
                            inputMode="url"
                            value={installProof}
                            maxLength={500}
                            placeholder="https://drive.google.com/…"
                            onChange={(e) => setInstallProof(e.target.value)}
                            className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                          />
                        </div>
                      ) : (
                        <div className="sm:col-span-2">
                          <label htmlFor="install-proof-file" className="ui-label mb-1 block">
                            Berkas bukti (JPEG, PNG, PDF, atau MP4; maks 50MB)
                          </label>
                          <label
                            htmlFor="install-proof-file"
                            className="flex cursor-pointer items-center justify-center gap-2 border-2 border-dashed border-[color:var(--rule-strong)] bg-[var(--surface-offset)] p-4 text-xs font-medium text-slate-700 transition hover:border-[color:var(--action)]"
                          >
                            <Upload className="h-4 w-4 text-[color:var(--action)]" aria-hidden="true" />
                            {proofFile ? proofFile.name : 'Klik untuk memilih berkas bukti'}
                            <input
                              id="install-proof-file"
                              type="file"
                              accept="image/jpeg,image/png,application/pdf,video/mp4"
                              className="sr-only"
                              disabled={unggahBukti}
                              onChange={(e) => {
                                setProofFile(e.target.files?.[0] ?? null);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <p className="mt-1 text-xs ui-text-muted">
                            Berkas diunggah ke penyimpanan materi Mall setelah pemasangan dicatat.
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs ui-text-muted">
                      Menyimpan pemasangan menetapkan status materi menjadi Sudah Dipasang.
                    </p>
                  </fieldset>
                )}

                {saveError && <p className="mt-2 text-xs font-medium text-red-600" role="alert">{saveError}</p>}

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[color:var(--rule-color)] pt-3">
                  <button type="button" onClick={() => setDetail(null)} className="ui-btn-secondary inline-flex min-h-11 items-center px-4 py-2.5 text-sm font-semibold transition">Batal</button>
                  {isInstallableStatus(detail.status) && (
                    <button
                      type="button"
                      onClick={() => void saveInstallation()}
                      disabled={saving || !installLocation.trim()}
                      className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
                    >
                      <Wrench className="h-4 w-4" aria-hidden="true" />
                      Catat Pemasangan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void saveStatus()}
                    disabled={saving || catatanWajibKosong}
                    title={catatanWajibKosong ? PESAN_CATATAN_WAJIB[newStatus] : undefined}
                    className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    Simpan Status
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 border border-[color:var(--rule-color)] bg-[var(--surface-offset)] p-3 text-xs ui-text-muted">
                Akun Tenant Relations hanya dapat melihat dan mengunduh. Perubahan status dilakukan Admin.
              </p>
            )}
          </>
        )}
      </Sheet>
      {dialog}
    </div>
  );
}

// ══════════ Tab: Katalog Media ══════════

interface CatalogFormState {
  id: string;
  slug: string;
  category: string;
  /** Kanal katalog - dipisahkan deck lewat blok Contact Person. */
  media_channel: 'cetak' | 'digital';
  name: string;
  size_spec: string;
  material_spec: string;
  accepted_formats: string;
  price_note: string;
  location_note: string;
  rules: string;
  image_path: string;
  /** Harga numerik (Rp) - dipakai perhitungan PPN; 0 = gratis. */
  price_amount: number;
  price_unit: string;
  ppn_included: boolean;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_CATALOG_FORM: CatalogFormState = {
  id: '', slug: '', category: 'outdoor', media_channel: 'digital', name: '',
  size_spec: '', material_spec: '',
  accepted_formats: 'JPEG', price_note: '', location_note: '', rules: '',
  image_path: '', price_amount: 0, price_unit: '', ppn_included: false,
  is_active: true, sort_order: 0,
};

function CatalogTab({ canManage, onConfirmDelete }: { canManage: boolean; onConfirmDelete: (id: string, subject: string) => Promise<boolean> }) {
  const [rows, setRows] = useState<PromoMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<CatalogFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [unggahGambar, setUnggahGambar] = useState(false);
  const [galatGambar, setGalatGambar] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchAdminMediaTypes());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat katalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveCatalog(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError('');
    try {
      const input: MediaTypeInput = {
        slug: form.slug, category: form.category, name: form.name,
        media_channel: form.media_channel,
        size_spec: form.size_spec, material_spec: form.material_spec,
        accepted_formats: form.accepted_formats, price_note: form.price_note,
        location_note: form.location_note, rules: form.rules,
        // `image_path` sengaja TIDAK dikirim: field ini dikelola endpoint foto
        // (unggah/hapus) dan tidak dapat disunting di form. Mengirimkannya di
        // sini akan menimpa foto yang baru diunggah dengan nilai state lama.
        price_amount: form.price_amount, price_unit: form.price_unit,
        ppn_included: form.ppn_included,
        is_active: form.is_active, sort_order: form.sort_order,
      };
      if (form.id) await updateMediaType(form.id, input);
      else await createMediaType(input);
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan media type.');
    } finally {
      setSaving(false);
    }
  }

  /** Unggah foto baru untuk media yang sedang dibuka (butuh id yang sudah ada). */
  async function handleGantiGambar(berkas: File) {
    if (!form?.id) return;
    setUnggahGambar(true);
    setGalatGambar('');
    try {
      const imagePath = await uploadMediaImage(form.id, berkas);
      setForm((f) => (f ? { ...f, image_path: imagePath } : f));
      await load();
    } catch (err) {
      setGalatGambar(err instanceof Error ? err.message : 'Gagal mengunggah gambar.');
    } finally {
      setUnggahGambar(false);
    }
  }

  /** Hapus foto katalog - kartu kembali tanpa gambar. */
  async function handleHapusGambar() {
    if (!form?.id) return;
    setUnggahGambar(true);
    setGalatGambar('');
    try {
      await deleteMediaImage(form.id);
      setForm((f) => (f ? { ...f, image_path: '' } : f));
      await load();
    } catch (err) {
      setGalatGambar(err instanceof Error ? err.message : 'Gagal menghapus gambar.');
    } finally {
      setUnggahGambar(false);
    }
  }

  async function handleDelete(m: PromoMediaType) {
    const ok = await onConfirmDelete(m.id ?? m.slug, m.name);
    if (!ok) return;
    try {
      await deleteMediaType(m.id || '');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus media type.');
    }
  }

  /**
   * Input teks katalog. `multiline` untuk kolom yang isinya boleh berbaris
   * banyak (`price_note` menyimpan tangga tarif dari deck, mis.
   * "Rp. 600.000,-/hari\nRp. 4.200.000,-/7 hari").
   *
   * `<input type="text">` MEMBUANG karakter baris baru (spesifikasi HTML:
   * nilai input disanitasi dengan men-strip CR/LF), jadi mengedit kolom itu
   * lewat input satu baris akan menggabungkan seluruh tarif menjadi satu baris
   * panjang begitu disimpan. `<textarea>` mempertahankan baris baru.
   */
  const textInput = (label: string, field: keyof CatalogFormState, placeholder = '', multiline = false) => (
    <div>
      <label htmlFor={`cf-${field}`} className="mb-1 block text-xs font-semibold text-slate-700">{label}</label>
      {multiline ? (
        <textarea
          id={`cf-${field}`}
          rows={3}
          value={String(form?.[field] ?? '')}
          placeholder={placeholder}
          onChange={(e) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f))}
          className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary-600"
        />
      ) : (
        <input
          id={`cf-${field}`}
          type="text"
          value={String(form?.[field] ?? '')}
          placeholder={placeholder}
          onChange={(e) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f))}
          className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600"
        />
      )}
    </div>
  );

  return (
    <div>
      {/* Kepala seksi dokumen: nomor plate, jumlah baris, dan aksi utama. */}
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[color:var(--rule-strong)] pb-2.5">
        <h2 className="ui-label" data-tone="strong">
          Katalog Media
        </h2>
        <span className="ui-label ml-auto">{rows.length} media</span>
        {canManage && (
          <button
            type="button"
            onClick={() => { setForm({ ...EMPTY_CATALOG_FORM }); setFormError(''); }}
            className="ui-btn-primary inline-flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tambah Media
          </button>
        )}
      </div>

      {error && (
        <div className="ui-alert-panel mb-4 flex items-start gap-2 p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-10" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-hidden="true" />
          <span className="text-sm ui-text-muted">Memuat katalog…</span>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="ui-empty-panel px-6 py-10" role="status">
          <p className="text-sm font-semibold text-slate-700">Belum ada media di katalog.</p>
          <p className="mt-1 text-xs ui-text-muted">
            {canManage
              ? 'Tambahkan media pertama dengan tombol "Tambah Media" di atas.'
              : 'Katalog masih kosong. Hubungi Admin untuk menambahkan media.'}
          </p>
        </div>
      )}

      {/* Daftar katalog sebagai tabel dokumen: satu baris per media, dipisah
       * garis 1px. Nomor plate di kiri adalah posisi media di deck 2026. */}
      {!loading && rows.length > 0 && (
        <>
          <p className="px-3 pb-1 text-xs ui-text-muted lg:hidden">
            Geser tabel ke samping untuk melihat kolom lain.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--rule-strong)]">
                  <th className="ui-label px-3 py-2">Plate</th>
                  <th className="ui-label px-3 py-2">Media</th>
                  <th className="ui-label px-3 py-2">Kategori</th>
                  <th className="ui-label px-3 py-2">Kanal</th>
                  <th className="ui-label px-3 py-2">Status</th>
                  <th className="ui-label px-3 py-2 text-right">Ukuran / tarif</th>
                  <th className="ui-label px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id ?? m.slug} className="border-b border-[color:var(--rule-color)] transition hover:bg-[var(--surface-hover)]">
                    <td className="ui-num px-3 py-3 text-xs ui-text-muted">
                      {String(m.sort_order ?? 0).padStart(2, '0')}
                    </td>
                    <td className="px-3 py-3">
                      <p className="truncate font-semibold text-slate-900">{m.name}</p>
                      <p className="ui-num text-xs ui-text-muted">/{m.slug}</p>
                    </td>
                    <td className="px-3 py-3 text-xs ui-text-muted">{CATEGORY_LABELS[m.category] ?? m.category}</td>
                    <td className="px-3 py-3">
                      <span className="ui-tag" data-tone={m.media_channel === 'cetak' ? 'ink' : undefined}>
                        {CHANNEL_LABELS[m.media_channel ?? 'digital']}
                      </span>
                    </td>
                    {/* State nonaktif dibawa lencana "Nonaktif", bukan opacity-70:
                     * opacity menurunkan kontras SEMUA teks di dalam baris. */}
                    <td className="px-3 py-3">
                      <span className="ui-tag" data-tone={m.is_active === false ? undefined : 'ink'}>
                        {m.is_active === false ? 'Nonaktif' : 'Aktif'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="ui-num text-xs text-slate-800">{m.size_spec || '-'}</p>
                      {m.price_note && (
                        <p className="ui-num mt-0.5 whitespace-pre-line text-xs ui-text-muted">{m.price_note}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setForm({
                                id: m.id || '', slug: m.slug, category: m.category, name: m.name,
                                size_spec: m.size_spec, material_spec: m.material_spec,
                                accepted_formats: m.accepted_formats, price_note: m.price_note,
                                location_note: m.location_note, rules: m.rules,
                                media_channel: m.media_channel === 'cetak' ? 'cetak' : 'digital',
                                price_amount: m.price_amount ?? 0,
                                price_unit: m.price_unit ?? '',
                                ppn_included: Boolean(m.ppn_included),
                                image_path: m.image_path || '',
                                is_active: m.is_active !== false, sort_order: m.sort_order,
                              });
                              setFormError('');
                            }}
                            className="ui-control inline-flex min-h-11 items-center border border-[color:var(--rule-color)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-[color:var(--action)]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(m)}
                            aria-label={`Hapus ${m.name}`}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Form create/edit - lembar spesifikasi media. */}
      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        title={form ? (form.id ? 'Edit Media' : 'Tambah Media') : ''}
      >
        {form && (
          <form onSubmit={saveCatalog}>

            <div className="grid gap-3 sm:grid-cols-2">
              {textInput('Slug (unik, huruf kecil)', 'slug', 'spanduk')}
              {textInput('Nama', 'name', 'Spanduk')}
              <div>
                <label htmlFor="cf-category" className="ui-label mb-1 block">Kategori</label>
                <select
                  id="cf-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => (f ? { ...f, category: e.target.value } : f))}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                >
                  <option value="outdoor">Outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="social">Media Sosial</option>
                </select>
              </div>
              <div>
                <label htmlFor="cf-channel" className="ui-label mb-1 block">Kanal</label>
                <select
                  id="cf-channel"
                  value={form.media_channel}
                  onChange={(e) => setForm((f) => (f ? { ...f, media_channel: e.target.value as 'cetak' | 'digital' } : f))}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                >
                  <option value="cetak">Media Promosi Cetak</option>
                  <option value="digital">Media Promosi Digital</option>
                </select>
              </div>
              {textInput('Format diterima', 'accepted_formats', 'JPEG,PDF')}
              {textInput('Ukuran', 'size_spec', '0.9 M x 6.0 M')}
              {textInput('Materi', 'material_spec', 'Flexi 280gr')}
              {textInput('Harga', 'price_note', 'Rp. 70.000,-/hari', true)}
              {textInput('Lokasi', 'location_note', 'Sisi Pintu Tol Bekasi Barat')}

              {/* Harga numerik - dipakai menghitung PPN pengajuan cetak dan
               * pengingat periode berakhir. Seed hanya mengisinya sekali, jadi
               * staf harus bisa mengoreksi tanpa menyentuh DB. */}
              <div>
                <label htmlFor="cf-price-amount" className="ui-label mb-1 block">
                  Harga numerik (Rp)
                </label>
                <input
                  id="cf-price-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price_amount}
                  onChange={(e) => setForm((f) => (f ? { ...f, price_amount: Number(e.target.value) || 0 } : f))}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-right text-sm text-slate-900"
                />
                <p className="ui-num mt-1 text-xs ui-text-muted">0 = media gratis. Dipakai untuk menghitung PPN.</p>
              </div>
              {textInput('Satuan harga', 'price_unit', 'hari')}
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  id="cf-ppn-included"
                  checked={form.ppn_included}
                  onChange={(e) => setForm((f) => (f ? { ...f, ppn_included: e.target.checked } : f))}
                  className="h-4 w-4 accent-[var(--action)]"
                />
                Harga sudah termasuk PPN
              </label>

              {/* Foto katalog - hanya untuk media yang sudah tersimpan, karena
               * unggahan butuh id. Media baru: simpan dulu, lalu ganti foto. */}
              <div>
                <span className="ui-label mb-1 block">Foto Katalog</span>
                {form.id ? (
                  <div className="border border-[color:var(--rule-color)] p-3">
                    {form.image_path ? (
                      <img
                        src={form.image_path}
                        alt={`Pratinjau foto ${form.name || 'media'}`}
                        loading="lazy"
                        decoding="async"
                        className="mb-2.5 aspect-[4/3] w-full max-w-[220px] border border-[color:var(--rule-color)] object-cover"
                      />
                    ) : (
                      <p className="mb-2.5 text-xs ui-text-muted">Belum ada foto. Kartu katalog tampil tanpa gambar.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="cf-image"
                        className={`ui-control inline-flex min-h-11 cursor-pointer items-center gap-1.5 border border-[color:var(--rule-color)] px-3 py-2 text-xs font-semibold text-slate-700 ${unggahGambar ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {form.image_path ? 'Ganti Foto' : 'Unggah Foto'}
                      </label>
                      <input
                        id="cf-image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={unggahGambar}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void handleGantiGambar(f);
                        }}
                      />
                      {form.image_path && (
                        <button
                          type="button"
                          onClick={() => void handleHapusGambar()}
                          disabled={unggahGambar}
                          className="ui-control inline-flex min-h-11 items-center gap-1.5 border border-[color:var(--rule-color)] px-3 py-2 text-xs font-semibold text-slate-700 transition disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Hapus Foto
                        </button>
                      )}
                      {unggahGambar && <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden="true" />}
                    </div>
                    <p className="mt-1.5 text-xs ui-text-muted">JPEG, PNG, atau WebP, maks 4MB. Disarankan lanskap 4:3.</p>
                    {galatGambar && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{galatGambar}</p>}
                  </div>
                ) : (
                  <p className="text-xs ui-text-muted">Simpan media terlebih dahulu untuk mengunggah foto.</p>
                )}
              </div>

              <div>
                <label htmlFor="cf-sort" className="ui-label mb-1 block">Urutan</label>
                <input
                  id="cf-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => (f ? { ...f, sort_order: parseInt(e.target.value, 10) || 0 } : f))}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-right text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor="cf-rules" className="ui-label mb-1 block">Ketentuan (satu per baris)</label>
              <textarea
                id="cf-rules"
                rows={5}
                value={form.rules}
                onChange={(e) => setForm((f) => (f ? { ...f, rules: e.target.value } : f))}
                aria-describedby="cf-rules-hint"
                className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
              />
              {/* Isi kolom ini bukan sekadar catatan internal: tenant membacanya
               * di katalog publik, dan sistem mem-parse kalimat batas waktu di
               * dalamnya untuk menghitung lead time. Tanpa keterangan ini staf
               * mengira kolomnya hanya untuk arsip. */}
              <p id="cf-rules-hint" className="mt-1 text-xs ui-text-muted">
                Tampil ke tenant di katalog publik sebagai Ketentuan pemasangan. Kalimat batas waktu
                seperti &quot;3 hari kerja sebelum pemasangan&quot; dipakai menghitung lead time pengajuan.
              </p>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => (f ? { ...f, is_active: e.target.checked } : f))}
                className="h-4 w-4 accent-[var(--action)]"
              />
              Aktif (tampil di halaman publik)
            </label>

            {formError && <p className="mt-3 text-xs font-medium text-red-600" role="alert">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2 border-t border-[color:var(--rule-color)] pt-3">
              <button type="button" onClick={() => setForm(null)} className="ui-btn-secondary inline-flex min-h-11 items-center px-4 py-2.5 text-sm font-semibold transition">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Simpan
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}


// ══════════ Tab: Pengguna (superadmin) ══════════

interface UserFormState {
  id: string;
  email: string;
  display_name: string;
  role: string;
  password: string;
  is_active: boolean;
}

function UsersTab({ onConfirmDelete }: { onConfirmDelete: (id: string, subject: string) => Promise<boolean> }) {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<UserFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchAdminUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengguna.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError('');
    try {
      if (form.id) {
        await updateUser(form.id, {
          display_name: form.display_name, role: form.role,
          password: form.password || undefined, is_active: form.is_active,
        });
      } else {
        await createUser({
          email: form.email, display_name: form.display_name,
          role: form.role, password: form.password,
        });
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: AdminUserRow) {
    const ok = await onConfirmDelete(u.id, `${u.email} (${u.role})`);
    if (!ok) return;
    try {
      await deleteUser(u.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus user.');
    }
  }

  return (
    <div>
      {/* Kepala seksi dokumen: jumlah akun + aksi utama. */}
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[color:var(--rule-strong)] pb-2.5">
        <h2 className="ui-label" data-tone="strong">
          Akun Staf
        </h2>
        <span className="ui-label ml-auto">{rows.length} akun</span>
        <button
          type="button"
          onClick={() => { setForm({ id: '', email: '', display_name: '', role: 'admin', password: '', is_active: true }); setFormError(''); }}
          className="ui-btn-primary inline-flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah User
        </button>
      </div>

      {error && (
        <div className="ui-alert-panel mb-4 flex items-start gap-2 p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-10" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-hidden="true" />
          <span className="text-sm ui-text-muted">Memuat pengguna…</span>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="ui-empty-panel px-6 py-10" role="status">
          <p className="text-sm font-semibold text-slate-700">Belum ada akun staf.</p>
          <p className="mt-1 text-xs ui-text-muted">
            Tambahkan akun pertama dengan tombol "Tambah User" di atas.
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <p className="px-3 pb-1 text-xs ui-text-muted lg:hidden">
            Geser tabel ke samping untuk melihat kolom lain.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--rule-strong)]">
                  <th className="ui-label px-3 py-2">Nama</th>
                  <th className="ui-label px-3 py-2">Email</th>
                  <th className="ui-label px-3 py-2">Role</th>
                  <th className="ui-label px-3 py-2">Status</th>
                  <th className="ui-label px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-[color:var(--rule-color)] transition hover:bg-[var(--surface-hover)]">
                    <td className="px-3 py-3 font-semibold text-slate-900">{u.display_name}</td>
                    <td className="break-all px-3 py-3 text-slate-700">{u.email}</td>
                    <td className="px-3 py-3">
                      <span className="ui-tag">{u.role}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="ui-tag" data-tone={u.is_active ? 'ink' : undefined}>
                        {u.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setForm({ id: u.id, email: u.email, display_name: u.display_name, role: u.role, password: '', is_active: u.is_active }); setFormError(''); }}
                          className="ui-control inline-flex min-h-11 items-center border border-[color:var(--rule-color)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-[color:var(--action)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(u)}
                          aria-label={`Hapus user ${u.email}`}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        title={form ? (form.id ? 'Edit User' : 'Tambah User') : ''}
      >
        {form && (
          <form onSubmit={saveUser}>

            <div className="space-y-3">
              {!form.id && (
                <div>
                  <label htmlFor="uf-email" className="ui-label mb-1 block">Email</label>
                  <input
                    id="uf-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))}
                    className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              )}
              <div>
                <label htmlFor="uf-name" className="ui-label mb-1 block">Nama</label>
                <input
                  id="uf-name"
                  type="text"
                  required
                  value={form.display_name}
                  onChange={(e) => setForm((f) => (f ? { ...f, display_name: e.target.value } : f))}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="uf-role" className="ui-label mb-1 block">Role</label>
                <select
                  id="uf-role"
                  value={form.role}
                  onChange={(e) => setForm((f) => (f ? { ...f, role: e.target.value } : f))}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                >
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="uf-password" className="ui-label mb-1 block">
                  {form.id ? 'Password baru (kosongkan bila tetap)' : 'Password (min. 8 karakter)'}
                </label>
                <input
                  id="uf-password"
                  type="password"
                  required={!form.id}
                  minLength={form.password ? 8 : undefined}
                  value={form.password}
                  onChange={(e) => setForm((f) => (f ? { ...f, password: e.target.value } : f))}
                  className="ui-control w-full border border-[color:var(--rule-color)] px-3 py-2 text-sm text-slate-900"
                />
              </div>
              {form.id && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => (f ? { ...f, is_active: e.target.checked } : f))}
                    className="h-4 w-4 accent-[var(--action)]"
                  />
                  Aktif (boleh login)
                </label>
              )}
            </div>

            {formError && <p className="mt-3 text-xs font-medium text-red-600" role="alert">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2 border-t border-[color:var(--rule-color)] pt-3">
              <button type="button" onClick={() => setForm(null)} className="ui-btn-secondary inline-flex min-h-11 items-center px-4 py-2.5 text-sm font-semibold transition">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Simpan
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}


// ══════════ Tab: Pengaturan (staf) ══════════

/**
 * Saklar fitur yang disimpan di server (tabel `app_settings`), sehingga
 * menyalakan/mematikan berlaku LANGSUNG tanpa deploy ulang - berbeda dari
 * flag build-time `VITE_*` yang di-inline saat build.
 */
function SettingsTab({ canManage }: { canManage: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdminSettings()
      .then((s) => setEnabled(s.tax_proof_enabled))
      .catch(() => setError('Gagal memuat pengaturan.'))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setError('');
    try {
      const s = await updateAdminSettings({ tax_proof_enabled: next });
      setEnabled(s.tax_proof_enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[color:var(--rule-strong)] pb-2.5">
        <h2 className="ui-title-section">Pengaturan</h2>
        <span className="ui-label ml-auto shrink-0">Bagian 04</span>
      </div>
      <p className="ui-body ui-text-muted mt-3">
        Saklar fitur yang berlaku untuk seluruh pengajuan media cetak. Perubahan langsung aktif.
      </p>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm ui-text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Memuat…
        </p>
      ) : (
        <div className="mt-5 border border-[color:var(--rule-color)] p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              id="setting-tax-proof"
              checked={enabled}
              disabled={!canManage || saving}
              onChange={(e) => void toggle(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--action)]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                Bukti pembayaran pajak (media cetak)
              </span>
              <span className="mt-0.5 block text-xs ui-text-muted">
                Bila menyala, wizard pengajuan cetak menampilkan field unggah bukti
                pembayaran PPN (opsional) dan staf dapat menambah/mengganti bukti dari
                detail pengajuan. Bila mati, field tidak muncul dan server mengabaikan
                data pajak dari klien.
              </span>
            </span>
          </label>
          {!canManage && (
            <p className="mt-2 text-xs ui-text-muted">Hanya Admin dan Superadmin yang dapat mengubah pengaturan ini.</p>
          )}
          {saving && <p className="mt-2 text-xs ui-text-muted" role="status">Menyimpan…</p>}
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[color:var(--stamp-no)]" role="alert">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ══════════ Dashboard shell ══════════

export default function AdminDashboardPage() {
  const { user, isLoading, logout } = useAuth();
  const permissions = usePermission(user);
  const [tab, setTab] = useState<Tab>('submissions');
  const { confirm, dialog } = useConfirmDialog();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const onConfirmDelete = useCallback(
    async (id: string, subject: string) => {
      return confirm({
        title: 'Hapus data ini?',
        message: 'Tindakan ini tidak dapat dibatalkan. File terkait juga akan dihapus dari storage.',
        subject,
      });
    },
    [confirm],
  );

  const tabs = useMemo(() => {
    const list: Array<{ key: Tab; label: string }> = [
      { key: 'submissions', label: 'Pengajuan' },
      { key: 'catalog', label: 'Katalog Media' },
    ];
    if (permissions.canManageUsers) list.push({ key: 'users', label: 'Pengguna' });
    // Tab Pengaturan untuk staf (tenant_relation hanya baca). Tenant relation
    // bukan staf, jadi tidak melihat tab ini.
    if (permissions.canManage || permissions.canManageUsers) {
      list.push({ key: 'settings', label: 'Pengaturan' });
    }
    return list;
  }, [permissions.canManageUsers, permissions.canManage]);

  // Judul dokumen mengikuti tab yang aktif (lihat useDocumentTitle). Sebelumnya
  // seluruh rute berjudul sama, sehingga riwayat peramban tidak bisa dibedakan.
  const tabLabel = tabs.find((t) => t.key === tab)?.label ?? '';
  useDocumentTitle(tabLabel ? `Admin · ${tabLabel}` : 'Admin');

  /**
   * Panah kiri/kanan/Home/End pada tablist (pola ARIA "tabs with automatic
   * activation"). Sebelum ini `role="tablist"` dipasang tanpa dukungan panah,
   * sehingga pengguna keyboard tidak bisa berpindah tab sama sekali - tombol
   * panah tidak melakukan apa pun (terverifikasi di peramban).
   */
  function onTabListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = tabs.map((t) => t.key);
    const i = keys.indexOf(tab);
    let next: Tab | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = keys[(i + 1) % keys.length] ?? null;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = keys[(i - 1 + keys.length) % keys.length] ?? null;
    else if (e.key === 'Home') next = keys[0] ?? null;
    else if (e.key === 'End') next = keys[keys.length - 1] ?? null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  if (isLoading) {
    return (
      <div className="ui-admin-page flex min-h-screen items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-brand-primary-600" aria-hidden="true" />
        <span className="sr-only">Memuat…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="ui-admin-page flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <Megaphone className="h-10 w-10 text-brand-primary-500" aria-hidden="true" />
        <h1 className="text-sm font-semibold text-slate-800">Sesi berakhir atau belum login.</h1>
        <Link to="/login" className="ui-btn-primary rounded-md px-5 py-2.5 text-sm font-semibold transition">Login</Link>
      </main>
    );
  }

  return (
    <div className="ui-admin-page min-h-screen">
      {/* Header */}
      <header className="ui-chrome sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-primary-600">
              <Megaphone className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <h1 className="ui-title-screen ui-admin-title text-slate-900">Media Promosi Admin</h1>
              <p className="text-xs ui-text-muted">Metropolitan Mall Bekasi</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-900">{user.display_name}</p>
              <p className="text-xs ui-text-muted">{user.role}</p>
            </div>
            {/* `min-h-11`: menyamakan dengan pola tautan lain di repo (mis.
             * "Kembali ke halaman publik" di /login). Tinggi 16px lolos
             * pengecualian jarak WCAG 2.5.8, tapi konsistensi target lebih baik. */}
            <Link to="/" className="ui-focus-ring inline-flex min-h-11 items-center text-xs font-medium text-slate-600 transition hover:text-brand-primary-700">Beranda</Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="ui-control inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-slate-700 transition hover:text-red-600"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="mx-auto max-w-6xl px-4 pt-4" aria-label="Bagian dashboard">
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          onKeyDown={onTabListKeyDown}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              // Roving tabindex (pola ARIA tablist): hanya tab aktif yang masuk
              // urutan Tab; panah kiri/kanan memindahkan pilihan.
              tabIndex={tab === t.key ? 0 : -1}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              onClick={() => setTab(t.key)}
              className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition ${
                tab === t.key
                  ? 'bg-brand-primary-600 text-white'
                  : 'ui-control text-slate-600 hover:text-brand-primary-700'
              }`}
            >
              {t.key === 'users' && <UsersIcon className="mr-1.5 inline h-4 w-4" aria-hidden="true" />}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-5">
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'submissions' && <SubmissionsTab canManage={permissions.canManage} onConfirmDelete={onConfirmDelete} />}
          {tab === 'catalog' && <CatalogTab canManage={permissions.canManage} onConfirmDelete={onConfirmDelete} />}
          {tab === 'users' && permissions.canManageUsers && <UsersTab onConfirmDelete={onConfirmDelete} />}
          {tab === 'settings' && (permissions.canManage || permissions.canManageUsers) && (
            <SettingsTab canManage={permissions.canManage} />
          )}
        </div>
      </main>

      {dialog}
    </div>
  );
}
