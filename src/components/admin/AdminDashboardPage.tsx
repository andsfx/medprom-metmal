/**
 * Dashboard admin — 3 tab: Pengajuan (list/filter/review/hapus/export),
 * Katalog Media (CRUD), Pengguna (superadmin).
 * tenant_relation = read-only (tanpa aksi tulis).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, Film,
  ImageIcon, Link2, Loader2, LogOut, Megaphone, MessageCircle, Plus, Save, Trash2, Users as UsersIcon, Wrench, X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import { useConfirmDialog } from '../ConfirmDialog';
import Sheet from '../ui/Sheet';
import { STATUS_LABELS, STATUS_ORDER, CATEGORY_LABELS } from '../../constants/promo';
import { submissionWaLink } from '../../utils/whatsapp';
import { checkInstallationDate, toIsoDate } from '../../utils/leadTime';
import { STATUS_TRANSITIONS, isInstallableStatus } from '../../utils/statusFlow';
import {
  fetchAdminSubmissions, fetchAdminSummary, fetchAdminSubmissionDetail,
  updateSubmissionStatus, recordInstallation, deleteSubmission,
  fetchAdminMediaTypes, createMediaType, updateMediaType, deleteMediaType,
  uploadMediaImage, deleteMediaImage,
  downloadExportCsv, fetchAdminUsers, createUser, updateUser, deleteUser,
  type MediaTypeInput,
} from '../../utils/adminApi';
import type {
  PromoMediaType, AdminSubmissionRow, AdminUserRow, StatusPageData,
} from '../../types/promo';

type Tab = 'submissions' | 'catalog' | 'users';

const STATUS_OPTIONS = ['', ...STATUS_ORDER];
const ROLE_OPTIONS = ['admin', 'tenant_relation', 'superadmin'];

/**
 * Status yang mewajibkan Catatan Review — **cermin** aturan server di
 * `server/src/routes/admin.js` (POST /admin/submissions/:id/status):
 * `perlu_revisi` → "Komentar wajib diisi ketika meminta revisi",
 * `ditolak` → "Alasan wajib diisi ketika menolak materi".
 *
 * Klien menegakkannya lebih awal supaya admin tidak baru tahu setelah submit
 * (dulu tombol tetap aktif, lalu server membalas 400). Server tetap otoritatif
 * — pesan galat server di bawah tidak dihapus.
 */
const STATUS_WAJIB_CATATAN: readonly string[] = ['perlu_revisi', 'ditolak'];

/** Pesan yang ditampilkan di klien; teks server tetap dipakai bila ia menolak. */
const PESAN_CATATAN_WAJIB: Record<string, string> = {
  perlu_revisi: 'Catatan wajib diisi saat meminta revisi materi.',
  ditolak: 'Alasan wajib diisi saat menolak materi.',
};

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    menunggu_review: 'bg-stone-100 text-stone-700',
    sedang_ditinjau: 'bg-blue-50 text-blue-700',
    disetujui: 'bg-green-50 text-green-700',
    siap_dipasang: 'bg-brand-primary-50 text-brand-primary-700',
    sedang_dipasang: 'bg-brand-primary-50 text-brand-primary-700 ring-1 ring-inset ring-brand-primary-500/30',
    sudah_dipasang: 'bg-brand-primary-600 text-white',
    ditolak: 'bg-red-50 text-red-700',
    selesai: 'bg-stone-100 text-stone-600',
    perlu_revisi: 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls[status] ?? 'bg-stone-100 text-stone-700'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
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
      // Ringkasan bersifat informatif — kegagalan tidak menghalangi daftar.
      setSummary({});
      setSummaryTotal(0);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  useEffect(() => {
    fetchAdminMediaTypes()
      .then((rows) => setMediaTypes(rows))
      .catch(() => setMediaTypes([]));
  }, []);

  const mediaRulesBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of mediaTypes) map[m.slug] = m.rules;
    return map;
  }, [mediaTypes]);

  /**
   * Apakah materi masuk lebih lambat dari lead time medianya?
   * Diukur dari tanggal pengajuan dibuat (`created_at`), bukan hari ini —
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
    setSaving(true);
    setSaveError('');
    try {
      await recordInstallation(detail.id, {
        media_location: installLocation.trim(),
        start_date: installStart,
        end_date: installEnd,
        notes: installNotes.trim(),
        proof_url: installProof.trim(),
      });
      setDetail(null);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal mencatat pemasangan.');
    } finally {
      setSaving(false);
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
      {/* Ringkasan jumlah per status */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatusFilter(statusFilter === s ? '' : s); setPage(1); }}
            aria-pressed={statusFilter === s}
            className={`ui-admin-card text-left p-3 transition ${
              statusFilter === s ? 'ring-2 ring-brand-primary-600' : ''
            }`}
            aria-label={`${STATUS_LABELS[s]} ${summary[s] ?? 0}`}
          >
            <p className="ui-number text-xl tabular-nums">{summary[s] ?? 0}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{STATUS_LABELS[s]}</p>
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs ui-text-muted">Total {summaryTotal} pengajuan tercatat.</p>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="filter-search" className="mb-1 block text-xs font-semibold ui-text-muted">Cari</label>
          <input
            id="filter-search"
            type="search"
            value={search}
            placeholder="Nomor pengajuan, tenant, atau judul materi"
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label htmlFor="filter-status" className="mb-1 block text-xs font-semibold ui-text-muted">Status</label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="ui-control rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === '' ? 'Semua' : STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-media" className="mb-1 block text-xs font-semibold ui-text-muted">Media</label>
          <select
            id="filter-media"
            value={mediaFilter}
            onChange={(e) => { setMediaFilter(e.target.value); setPage(1); }}
            className="ui-control max-w-48 rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Semua</option>
            {mediaTypes.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="filter-tenant" className="mb-1 block text-xs font-semibold ui-text-muted">Tenant</label>
          <input
            id="filter-tenant"
            type="text"
            value={tenantFilter}
            placeholder="Nama tenant"
            onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
            className="ui-control w-40 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label htmlFor="filter-date-from" className="mb-1 block text-xs font-semibold ui-text-muted">Dari tanggal</label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="ui-control rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label htmlFor="filter-date-to" className="mb-1 block text-xs font-semibold ui-text-muted">Sampai tanggal</label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="ui-control rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <span className="ml-auto text-xs ui-text-muted">{total} pengajuan</span>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="ui-control inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-brand-primary-700 disabled:opacity-60 dark:text-slate-200"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          Unduh CSV
        </button>
      </div>

      {error && (
        <div className="ui-alert-panel mb-4 flex items-start gap-2 p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Tabel (desktop) */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="px-3 py-2.5 font-semibold">Nomor</th>
              <th className="px-3 py-2.5 font-semibold">Tanggal</th>
              <th className="px-3 py-2.5 font-semibold">Tenant</th>
              <th className="px-3 py-2.5 font-semibold">Materi</th>
              <th className="px-3 py-2.5 font-semibold">File</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-10 text-center" role="status">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
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
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3">
                  <span className="font-mono text-xs font-semibold text-brand-primary-700 dark:text-brand-primary-300">
                    {r.submission_number || '-'}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs ui-text-muted">
                  {r.created_at ? new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-900 dark:text-white">{r.tenant_name}</p>
                  <p className="text-xs ui-text-muted">
                    {r.unit_number ? `Unit ${r.unit_number} · ` : ''}{r.pic_name} · {r.pic_phone}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="text-slate-800 dark:text-slate-200">{r.material_title || r.media_type_slug}</p>
                  <p className="text-xs ui-text-muted">{r.media_type_slug}</p>
                  {r.installation_date && <p className="text-xs ui-text-muted">pasang: {r.installation_date}</p>}
                  {leadTimeRisk(r) && (
                    <span
                      className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      title={leadTimeRisk(r)}
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      &lt; lead time
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <a
                    href={r.source_type === 'link' ? r.link_url : r.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-40 items-center gap-1.5 truncate text-xs font-medium text-brand-primary-700 hover:text-brand-primary-800 dark:text-brand-primary-300"
                  >
                    <FileIcon mime={r.mime_type} source={r.source_type} />
                    <span className="truncate">
                      {r.source_type === 'link' ? 'tautan materi' : (r.file_name || 'file')}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                </td>
                <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openDetail(r)}
                      className="ui-control inline-flex min-h-11 items-center rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
                    >
                      Detail
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(r)}
                        aria-label={`Hapus pengajuan ${r.tenant_name}`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
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
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Halaman sebelumnya"
            className="ui-control inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2.5 py-1.5 text-sm disabled:opacity-40 dark:text-slate-200"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-semibold ui-text-muted">Halaman {page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Halaman berikutnya"
            className="ui-control inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2.5 py-1.5 text-sm disabled:opacity-40 dark:text-slate-200"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Modal detail/review */}
      <Sheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? detail.material_title || detail.tenant_name || 'Detail Pengajuan' : ''}
      >
        {detail && (
          <>
            <div className="mb-4">
              <p className="font-mono text-xs font-bold tracking-wide text-brand-primary-700 dark:text-brand-primary-300">
                {detail.submission_number || '-'}
              </p>
              <p className="mt-1 text-xs ui-text-muted">
                {detail.tenant_name} · {detail.media_type_slug} · {detail.created_at ? new Date(detail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
              </p>
              <div className="mt-2"><StatusBadge status={detail.status} /></div>
            </div>

            <dl className="space-y-2.5 text-sm">
              <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">PIC</dt><dd className="text-slate-900 dark:text-white">{detail.pic_name} · {detail.pic_phone}</dd></div>
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 font-semibold ui-text-muted">Tenant</dt>
                <dd className="text-slate-900 dark:text-white">
                  {detail.tenant_name}
                  {detail.unit_number && <span className="ml-1.5 text-xs ui-text-muted">Unit {detail.unit_number}</span>}
                  {detail.tenant_id
                    ? <span className="ml-1.5 text-xs ui-text-muted">(MID {detail.tenant_id})</span>
                    : <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">(manual, tidak tertaut MID)</span>}
                </dd>
              </div>
              {detail.campaign_name && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Campaign</dt><dd className="text-slate-900 dark:text-white">{detail.campaign_name}</dd></div>}
              {detail.material_description && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Deskripsi</dt><dd className="text-slate-900 dark:text-white">{detail.material_description}</dd></div>}
              {detail.material_type && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Jenis materi</dt><dd className="text-slate-900 dark:text-white">{detail.material_type}</dd></div>}
              {detail.media_target && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Media/lokasi</dt><dd className="text-slate-900 dark:text-white">{detail.media_target}</dd></div>}
              {(detail.air_start_date || detail.air_end_date) && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 font-semibold ui-text-muted">Periode tayang</dt>
                  <dd className="text-slate-900 dark:text-white">{detail.air_start_date || '-'} s/d {detail.air_end_date || '-'}</dd>
                </div>
              )}
              {detail.installation_date && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Tgl pasang</dt><dd className="text-slate-900 dark:text-white">{detail.installation_date}</dd></div>}
              {leadTimeRisk(detail) && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 font-semibold text-amber-700 dark:text-amber-400">Lead time</dt>
                  <dd className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{leadTimeRisk(detail)}</span>
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 font-semibold ui-text-muted">
                  {detail.source_type === 'link' ? 'Tautan' : 'File'}
                </dt>
                <dd className="min-w-0">
                  <a
                    href={detail.source_type === 'link' ? detail.link_url : detail.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 break-all font-medium text-brand-primary-700 dark:text-brand-primary-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {detail.source_type === 'link' ? detail.link_url : (detail.file_name || 'file')}
                  </a>
                  {detail.source_type === 'link' && (
                    <p className="mt-1 text-xs ui-text-muted">
                      Materi ada di penyimpanan tenant. Unduh sendiri, tidak tersimpan di server kami.
                    </p>
                  )}
                </dd>
              </div>
              {detail.notes && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Catatan tenant</dt><dd className="text-slate-900 dark:text-white">{detail.notes}</dd></div>}
              {detail.reviewed_by_name && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Direview oleh</dt><dd className="text-slate-900 dark:text-white">{detail.reviewed_by_name}</dd></div>}
            </dl>

            {/* Riwayat versi materi (FR-030) */}
            {detailLoading && (
              <p className="mt-4 flex items-center gap-2 text-xs ui-text-muted" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Memuat riwayat versi…
              </p>
            )}
            {!detailLoading && detailData && detailData.files.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                <p className="text-xs font-semibold ui-text-muted">Versi materi</p>
                <ul className="mt-1.5 space-y-1.5">
                  {detailData.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">Versi {f.version}</span>
                        <span className="ml-1.5 ui-text-muted">
                          {f.created_at ? new Date(f.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        </span>
                      </span>
                      <a
                        href={f.source_type === 'link' ? f.link_url : f.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        /* `min-h-11` (44px) — axe `target-size` (WCAG 2.2 AA 2.5.8)
                         * menandai tautan ini 44.5×16px dengan ruang klik aman
                         * 20px ke tetangga terdekat; ini tautan kontrol berdiri
                         * sendiri di dalam baris daftar, bukan tautan inline di
                         * tengah kalimat, jadi pengecualian 2.5.8 tidak berlaku. */
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 font-medium text-brand-primary-700 dark:text-brand-primary-300"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        Buka
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Riwayat status (FR-031, FR-037) */}
            {!detailLoading && detailData && detailData.history.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                <p className="text-xs font-semibold ui-text-muted">Riwayat status</p>
                <ol className="mt-1.5 space-y-2">
                  {detailData.history.map((h) => (
                    <li key={h.id} className="text-xs">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        {STATUS_LABELS[h.to_status] ?? h.to_status}
                        <span className="ml-1.5 font-normal ui-text-muted">
                          {h.created_at ? new Date(h.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                          {h.actor_type === 'admin' && h.actor_name ? ` · ${h.actor_name}` : ''}
                        </span>
                      </p>
                      {h.comment && <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">{h.comment}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Informasi pemasangan (FR-047) */}
            {!detailLoading && detailData?.installation && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                <p className="text-xs font-semibold ui-text-muted">Informasi pemasangan</p>
                <dl className="mt-1.5 space-y-1.5 text-xs">
                  <div className="flex gap-2"><dt className="w-28 shrink-0 ui-text-muted">Lokasi</dt><dd className="text-slate-900 dark:text-white">{detailData.installation.media_location}</dd></div>
                  {(detailData.installation.start_date || detailData.installation.end_date) && (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 ui-text-muted">Periode</dt>
                      <dd className="text-slate-900 dark:text-white">
                        {detailData.installation.start_date || '-'} s/d {detailData.installation.end_date || '-'}
                      </dd>
                    </div>
                  )}
                  {detailData.installation.notes && <div className="flex gap-2"><dt className="w-28 shrink-0 ui-text-muted">Catatan</dt><dd className="text-slate-900 dark:text-white">{detailData.installation.notes}</dd></div>}
                  {detailData.installation.proof_url && (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 ui-text-muted">Bukti</dt>
                      <dd>
                        <a href={detailData.installation.proof_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-primary-700 dark:text-brand-primary-300">
                          Buka bukti pemasangan
                        </a>
                      </dd>
                    </div>
                  )}
                  {detailData.installation.installed_by && <div className="flex gap-2"><dt className="w-28 shrink-0 ui-text-muted">Dicatat oleh</dt><dd className="text-slate-900 dark:text-white">{detailData.installation.installed_by}</dd></div>}
                </dl>
              </div>
            )}

            {/* Aksi cepat: buka materi (verifikasi manual) + teruskan status via WA.
                wa.me butuh digit + kode negara; normalizer menangani format
                "08xx xxxx xxxx" yang diajarkan form. */}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={detail.source_type === 'link' ? detail.link_url : detail.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Buka tautan materi
              </a>
              {(() => {
                // Pakai status TERSIMPAN (bukan newStatus yang belum disimpan) —
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
                    className="ui-control inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Kirim pesan WA
                  </a>
                );
              })()}
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(
                  `${detail.tenant_name} - ${detail.media_type_slug}\nTautan: ${detail.source_type === 'link' ? detail.link_url : detail.file_url}`,
                ); }}
                className="ui-control inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Salin tautan
              </button>
            </div>

            {canManage ? (
              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Ubah status
                  </legend>
                  {/* Hanya transisi yang sah dari status saat ini (PRD §8) —
                      server tetap memvalidasi ulang. */}
                  <div className="flex flex-wrap gap-2">
                    {allowedStatuses.map((s) => (
                      <label
                        key={s}
                        className={`cursor-pointer rounded-md border px-3.5 py-2 text-sm font-semibold transition ${
                          newStatus === s
                            ? 'border-brand-primary-500 bg-brand-primary-50 text-brand-primary-800 dark:border-brand-primary-400 dark:bg-brand-primary-950/40 dark:text-brand-primary-200'
                            : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
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
                        {/* `text-slate-600` (bukan ui-text-muted): di atas
                         * `bg-brand-primary-50` (label terpilih), muted hanya
                         * 4.31:1 — gagal AA untuk teks 12px. slate-600 = 6.86:1. */}
                        {s === detail.status && <span className="ml-1 text-xs font-normal text-slate-600 dark:text-slate-300">(sekarang)</span>}
                      </label>
                    ))}
                  </div>
                  {STATUS_TRANSITIONS[detail.status]?.length === 0 && (
                    <p className="mt-1.5 text-xs ui-text-muted">
                      Status ini bersifat final, tidak ada perubahan status lanjutan.
                    </p>
                  )}
                </fieldset>

                <label htmlFor="review-notes" className="mb-1.5 mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Catatan Review <span className="text-xs font-normal ui-text-muted">
                    (wajib untuk Perlu Revisi dan Ditolak)
                  </span>
                </label>
                <textarea
                  id="review-notes"
                  rows={3}
                  maxLength={2000}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="ui-control w-full rounded-md px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                  aria-invalid={catatanWajibKosong ? true : undefined}
                  aria-describedby={catatanWajibKosong ? 'err-review-notes' : undefined}
                />
                {catatanWajibKosong && (
                  <p id="err-review-notes" role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                    {PESAN_CATATAN_WAJIB[newStatus]}
                  </p>
                )}

                {/* Catat pemasangan — hanya bila materi boleh dipasang (FR-040). */}
                {isInstallableStatus(detail.status) && (
                  <fieldset className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
                    <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Catat pemasangan
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label htmlFor="install-location" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Media / lokasi pemasangan <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="install-location"
                          type="text"
                          value={installLocation}
                          maxLength={200}
                          placeholder={detail.media_target || 'Contoh: Atrium 1'}
                          onChange={(e) => setInstallLocation(e.target.value)}
                          className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label htmlFor="install-start" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Tanggal mulai</label>
                        <input
                          id="install-start"
                          type="date"
                          value={installStart}
                          onChange={(e) => setInstallStart(e.target.value)}
                          className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label htmlFor="install-end" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Tanggal berakhir</label>
                        <input
                          id="install-end"
                          type="date"
                          value={installEnd}
                          onChange={(e) => setInstallEnd(e.target.value)}
                          className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="install-notes" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Catatan pemasangan</label>
                        <input
                          id="install-notes"
                          type="text"
                          value={installNotes}
                          maxLength={1000}
                          onChange={(e) => setInstallNotes(e.target.value)}
                          className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="install-proof" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Tautan bukti pemasangan <span className="text-xs font-normal ui-text-muted">(opsional)</span>
                        </label>
                        <input
                          id="install-proof"
                          type="url"
                          inputMode="url"
                          value={installProof}
                          maxLength={500}
                          placeholder="https://drive.google.com/…"
                          onChange={(e) => setInstallProof(e.target.value)}
                          className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs ui-text-muted">
                      Menyimpan pemasangan menetapkan status materi menjadi Sudah Dipasang.
                    </p>
                  </fieldset>
                )}

                {saveError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{saveError}</p>}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setDetail(null)} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Batal</button>
                  {isInstallableStatus(detail.status) && (
                    <button
                      type="button"
                      onClick={() => void saveInstallation()}
                      disabled={saving || !installLocation.trim()}
                      className="ui-control inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-brand-primary-700 disabled:opacity-50 dark:text-slate-200"
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
                    className="ui-btn-primary inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    Simpan Status
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs ui-text-muted dark:bg-slate-800/60">
                Akun Tenant Relations hanya dapat melihat dan mengunduh. Perubahan status dilakukan Admin.
              </p>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}

// ══════════ Tab: Katalog Media ══════════

interface CatalogFormState {
  id: string;
  slug: string;
  category: string;
  name: string;
  size_spec: string;
  material_spec: string;
  accepted_formats: string;
  price_note: string;
  location_note: string;
  rules: string;
  image_path: string;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_CATALOG_FORM: CatalogFormState = {
  id: '', slug: '', category: 'outdoor', name: '', size_spec: '', material_spec: '',
  accepted_formats: 'JPEG', price_note: '', location_note: '', rules: '',
  image_path: '', is_active: true, sort_order: 0,
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
        size_spec: form.size_spec, material_spec: form.material_spec,
        accepted_formats: form.accepted_formats, price_note: form.price_note,
        location_note: form.location_note, rules: form.rules,
        image_path: form.image_path,
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

  /** Hapus foto katalog — kartu kembali tanpa gambar. */
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

  const textInput = (label: string, field: keyof CatalogFormState, placeholder = '') => (
    <div>
      <label htmlFor={`cf-${field}`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</label>
      <input
        id={`cf-${field}`}
        type="text"
        value={String(form?.[field] ?? '')}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f))}
        className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
      />
    </div>
  );

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => { setForm({ ...EMPTY_CATALOG_FORM }); setFormError(''); }}
            className="ui-btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tambah Media
          </button>
        </div>
      )}

      {error && (
        <div className="ui-alert-panel mb-4 flex items-start gap-2 p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-10" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
          <span className="text-sm ui-text-muted">Memuat katalog…</span>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="ui-empty-panel px-6 py-10" role="status">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Belum ada media di katalog.</p>
          <p className="mt-1 text-xs ui-text-muted">
            {canManage
              ? 'Tambahkan media pertama dengan tombol "Tambah Media" di atas.'
              : 'Katalog masih kosong. Hubungi Admin untuk menambahkan media.'}
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <div key={m.id ?? m.slug} className="ui-admin-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{m.name}</p>
                  <p className="text-xs ui-text-muted">{CATEGORY_LABELS[m.category] ?? m.category} · /{m.slug}</p>
                </div>
                {/* State nonaktif dibawa badge "Nonaktif", bukan opacity-70:
                 * opacity menurunkan kontras SEMUA teks di dalam kartu
                 * (ui-text-muted 4.76 -> 2.75:1, gagal AA). Badge pakai
                 * slate-600 di slate-200 = 6.15:1, lulus AA. */}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${m.is_active === false ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                  {m.is_active === false ? 'Nonaktif' : 'Aktif'}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs ui-text-muted">{m.size_spec || '-'} {m.price_note ? `· ${m.price_note}` : ''}</p>
              {canManage && (
                <div className="mt-3 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setForm({
                        id: m.id || '', slug: m.slug, category: m.category, name: m.name,
                        size_spec: m.size_spec, material_spec: m.material_spec,
                        accepted_formats: m.accepted_formats, price_note: m.price_note,
                        location_note: m.location_note, rules: m.rules,
                        image_path: m.image_path || '',
                        is_active: m.is_active !== false, sort_order: m.sort_order,
                      });
                      setFormError('');
                    }}
                    className="ui-control inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(m)}
                    aria-label={`Hapus ${m.name}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form create/edit */}
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
                <label htmlFor="cf-category" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Kategori</label>
                <select
                  id="cf-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => (f ? { ...f, category: e.target.value } : f))}
                  className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="outdoor">Outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="social">Media Sosial</option>
                </select>
              </div>
              {textInput('Format diterima', 'accepted_formats', 'JPEG,PDF')}
              {textInput('Ukuran', 'size_spec', '0.9 M x 6.0 M')}
              {textInput('Materi', 'material_spec', 'Flexi 280gr')}
              {textInput('Harga', 'price_note', 'Rp. 70.000,-/hari')}
              {textInput('Lokasi', 'location_note', 'Sisi Pintu Tol Bekasi Barat')}

              {/* Foto katalog — hanya untuk media yang sudah tersimpan, karena
               * unggahan butuh id. Media baru: simpan dulu, lalu ganti foto. */}
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Foto Katalog</span>
                {form.id ? (
                  <div className="rounded-md border border-[var(--rule-color)] p-3 dark:border-slate-700">
                    {form.image_path ? (
                      <img
                        src={form.image_path}
                        alt={`Pratinjau foto ${form.name || 'media'}`}
                        className="mb-2.5 aspect-[4/3] w-full max-w-[220px] rounded-[var(--radius-control)] object-cover"
                      />
                    ) : (
                      <p className="mb-2.5 text-xs ui-text-muted">Belum ada foto. Kartu katalog tampil tanpa gambar.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="cf-image"
                        className={`ui-control inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 ${unggahGambar ? 'pointer-events-none opacity-50' : ''}`}
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
                          className="ui-control inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-slate-700 transition disabled:opacity-50 dark:text-slate-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Hapus Foto
                        </button>
                      )}
                      {unggahGambar && <Loader2 className="h-4 w-4 animate-spin text-brand-primary-600" aria-hidden="true" />}
                    </div>
                    <p className="mt-1.5 text-xs ui-text-muted">JPEG, PNG, atau WebP, maks 4MB. Disarankan lanskap 4:3.</p>
                    {galatGambar && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{galatGambar}</p>}
                  </div>
                ) : (
                  <p className="text-xs ui-text-muted">Simpan media terlebih dahulu untuk mengunggah foto.</p>
                )}
              </div>

              <div>
                <label htmlFor="cf-sort" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Urutan</label>
                <input
                  id="cf-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => (f ? { ...f, sort_order: parseInt(e.target.value, 10) || 0 } : f))}
                  className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor="cf-rules" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Ketentuan (satu per baris)</label>
              <textarea
                id="cf-rules"
                rows={5}
                value={form.rules}
                onChange={(e) => setForm((f) => (f ? { ...f, rules: e.target.value } : f))}
                className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => (f ? { ...f, is_active: e.target.checked } : f))}
                className="h-4 w-4 accent-[var(--brand-tosca)]"
              />
              Aktif (tampil di halaman publik)
            </label>

            {formError && <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn-primary inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition">
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
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => { setForm({ id: '', email: '', display_name: '', role: 'admin', password: '', is_active: true }); setFormError(''); }}
          className="ui-btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah User
        </button>
      </div>

      {error && (
        <div className="ui-alert-panel mb-4 flex items-start gap-2 p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-10" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
          <span className="text-sm ui-text-muted">Memuat pengguna…</span>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="ui-empty-panel px-6 py-10" role="status">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Belum ada akun staf.</p>
          <p className="mt-1 text-xs ui-text-muted">
            Tambahkan akun pertama dengan tombol "Tambah User" di atas.
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Nama</th>
                <th className="px-3 py-2.5 font-semibold">Email</th>
                <th className="px-3 py-2.5 font-semibold">Role</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">{u.display_name}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{u.email}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold ${u.is_active ? 'text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {u.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setForm({ id: u.id, email: u.email, display_name: u.display_name, role: u.role, password: '', is_active: u.is_active }); setFormError(''); }}
                        className="ui-control inline-flex min-h-11 items-center rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(u)}
                        aria-label={`Hapus user ${u.email}`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
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
                  <label htmlFor="uf-email" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Email</label>
                  <input
                    id="uf-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))}
                    className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              )}
              <div>
                <label htmlFor="uf-name" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Nama</label>
                <input
                  id="uf-name"
                  type="text"
                  required
                  value={form.display_name}
                  onChange={(e) => setForm((f) => (f ? { ...f, display_name: e.target.value } : f))}
                  className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="uf-role" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Role</label>
                <select
                  id="uf-role"
                  value={form.role}
                  onChange={(e) => setForm((f) => (f ? { ...f, role: e.target.value } : f))}
                  className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                >
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="uf-password" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {form.id ? 'Password baru (kosongkan bila tetap)' : 'Password (min. 8 karakter)'}
                </label>
                <input
                  id="uf-password"
                  type="password"
                  required={!form.id}
                  minLength={form.password ? 8 : undefined}
                  value={form.password}
                  onChange={(e) => setForm((f) => (f ? { ...f, password: e.target.value } : f))}
                  className="ui-control w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              {form.id && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => (f ? { ...f, is_active: e.target.checked } : f))}
                    className="h-4 w-4 accent-[var(--brand-tosca)]"
                  />
                  Aktif (boleh login)
                </label>
              )}
            </div>

            {formError && <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn-primary inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition">
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
    return list;
  }, [permissions.canManageUsers]);

  /**
   * Panah kiri/kanan/Home/End pada tablist (pola ARIA "tabs with automatic
   * activation"). Sebelum ini `role="tablist"` dipasang tanpa dukungan panah,
   * sehingga pengguna keyboard tidak bisa berpindah tab sama sekali — tombol
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
        <h1 className="text-sm font-semibold text-slate-800 dark:text-white">Sesi berakhir atau belum login.</h1>
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
              <h1 className="ui-title-screen ui-admin-title text-slate-900 dark:text-white">Media Promosi Admin</h1>
              <p className="text-xs ui-text-muted">Metropolitan Mall Bekasi</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">{user.display_name}</p>
              <p className="text-xs ui-text-muted">{user.role}</p>
            </div>
            {/* `min-h-11`: menyamakan dengan pola tautan lain di repo (mis.
             * "Kembali ke halaman publik" di /login). Tinggi 16px lolos
             * pengecualian jarak WCAG 2.5.8, tapi konsistensi target lebih baik. */}
            <Link to="/" className="ui-focus-ring inline-flex min-h-11 items-center text-xs font-medium text-slate-600 transition hover:text-brand-primary-700 dark:text-slate-300">Beranda</Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="ui-control inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-slate-700 transition hover:text-red-600 dark:text-slate-200"
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
                  : 'ui-control text-slate-600 hover:text-brand-primary-700 dark:text-slate-300'
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
        </div>
      </main>

      {dialog}
    </div>
  );
}
