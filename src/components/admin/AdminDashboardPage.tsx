/**
 * Dashboard admin — 3 tab: Pengajuan (list/filter/review/hapus/export),
 * Katalog Media (CRUD), Pengguna (superadmin).
 * tenant_relation = read-only (tanpa aksi tulis).
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Film,
  ImageIcon, Link2, Loader2, LogOut, Megaphone, Plus, Save, Trash2, Users as UsersIcon, X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import { useConfirmDialog } from '../ConfirmDialog';
import { STATUS_LABELS, CATEGORY_LABELS } from '../../constants/promo';
import {
  fetchAdminSubmissions, updateSubmissionStatus, deleteSubmission,
  fetchAdminMediaTypes, createMediaType, updateMediaType, deleteMediaType,
  downloadExportCsv, fetchAdminUsers, createUser, updateUser, deleteUser,
  type MediaTypeInput,
} from '../../utils/adminApi';
import type {
  PromoMediaType, AdminSubmissionRow, AdminUserRow,
} from '../../types/promo';

type Tab = 'submissions' | 'catalog' | 'users';

const STATUS_OPTIONS = ['', 'pending', 'approved', 'rejected', 'installed'];
const ROLE_OPTIONS = ['admin', 'tenant_relation', 'superadmin'];

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    installed: 'bg-brand-primary-100 text-brand-primary-800 dark:bg-brand-primary-950/50 dark:text-brand-primary-300',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${cls[status] ?? cls.pending}`}>
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
  const [mediaTypes, setMediaTypes] = useState<PromoMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState<AdminSubmissionRow | null>(null);
  const [newStatus, setNewStatus] = useState('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAdminSubmissions({
        status: statusFilter || undefined,
        media_type: mediaFilter || undefined,
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
  }, [statusFilter, mediaFilter, page]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetchAdminMediaTypes()
      .then((rows) => setMediaTypes(rows))
      .catch(() => setMediaTypes([]));
  }, []);

  function openDetail(row: AdminSubmissionRow) {
    setDetail(row);
    setNewStatus(row.status === 'pending' ? 'approved' : row.status);
    setReviewNotes(row.review_notes || '');
    setSaveError('');
  }

  async function saveStatus() {
    if (!detail) return;
    setSaving(true);
    setSaveError('');
    try {
      await updateSubmissionStatus(detail.id, newStatus, reviewNotes.trim());
      setDetail(null);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan status.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: AdminSubmissionRow) {
    const ok = await onConfirmDelete(row.id, `${row.tenant_name} — ${row.media_type_slug}`);
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
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="filter-status" className="text-xs font-semibold ui-text-muted">Status</label>
        <select
          id="filter-status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="ui-dashboard-control rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === '' ? 'Semua' : STATUS_LABELS[s]}</option>
          ))}
        </select>

        <label htmlFor="filter-media" className="ml-2 text-xs font-semibold ui-text-muted">Media</label>
        <select
          id="filter-media"
          value={mediaFilter}
          onChange={(e) => { setMediaFilter(e.target.value); setPage(1); }}
          className="ui-dashboard-control max-w-48 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Semua</option>
          {mediaTypes.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
        </select>

        <span className="ml-auto text-xs ui-text-muted">{total} pengajuan</span>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="ui-dashboard-control inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-brand-primary-700 disabled:opacity-60 dark:text-slate-200"
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
              <th className="px-3 py-2.5 font-semibold">Tanggal</th>
              <th className="px-3 py-2.5 font-semibold">Tenant</th>
              <th className="px-3 py-2.5 font-semibold">Media</th>
              <th className="px-3 py-2.5 font-semibold">File</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-10 text-center" role="status">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-primary-600" aria-hidden="true" />
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm ui-text-muted">Tidak ada pengajuan.</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3 text-xs ui-text-muted">
                  {r.created_at ? new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-900 dark:text-white">{r.tenant_name}</p>
                  <p className="text-xs ui-text-muted">{r.pic_name} · {r.pic_phone}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="text-slate-800 dark:text-slate-200">{r.media_type_slug}</p>
                  {r.installation_date && <p className="text-xs ui-text-muted">pasang: {r.installation_date}</p>}
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
                      className="ui-dashboard-control rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
                    >
                      Detail
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(r)}
                        aria-label={`Hapus pengajuan ${r.tenant_name}`}
                        className="inline-flex items-center rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
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
            className="ui-dashboard-control inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-40 dark:text-slate-200"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-semibold ui-text-muted">Halaman {page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Halaman berikutnya"
            className="ui-dashboard-control inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-40 dark:text-slate-200"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Modal detail/review */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
          onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}
        >
          <div className="ui-dashboard-surface max-h-[85vh] w-full max-w-lg overflow-auto p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="detail-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  {detail.tenant_name}
                </h2>
                <p className="mt-0.5 text-xs ui-text-muted">
                  {detail.media_type_slug} · {detail.created_at ? new Date(detail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="space-y-2.5 text-sm">
              <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">PIC</dt><dd className="text-slate-900 dark:text-white">{detail.pic_name} · {detail.pic_phone}</dd></div>
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 font-semibold ui-text-muted">Tenant</dt>
                <dd className="text-slate-900 dark:text-white">
                  {detail.tenant_name}
                  {detail.tenant_id
                    ? <span className="ml-1.5 text-xs ui-text-muted">(MID {detail.tenant_id})</span>
                    : <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">(manual — tidak tertaut MID)</span>}
                </dd>
              </div>
              {detail.installation_date && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Tgl pasang</dt><dd className="text-slate-900 dark:text-white">{detail.installation_date}</dd></div>}
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
                      Materi ada di penyimpanan tenant — unduh sendiri, tidak tersimpan di server kami.
                    </p>
                  )}
                </dd>
              </div>
              {detail.notes && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Catatan tenant</dt><dd className="text-slate-900 dark:text-white">{detail.notes}</dd></div>}
              {detail.reviewed_by_name && <div className="flex gap-2"><dt className="w-32 shrink-0 font-semibold ui-text-muted">Direview oleh</dt><dd className="text-slate-900 dark:text-white">{detail.reviewed_by_name}</dd></div>}
            </dl>

            {canManage ? (
              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Set status</legend>
                  <div className="flex flex-wrap gap-2">
                    {(['approved', 'rejected', 'installed'] as const).map((s) => (
                      <label
                        key={s}
                        className={`cursor-pointer rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
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
                        {STATUS_LABELS[s]}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label htmlFor="review-notes" className="mb-1.5 mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Catatan Review <span className="text-xs font-normal ui-text-muted">(untuk tenant)</span>
                </label>
                <textarea
                  id="review-notes"
                  rows={3}
                  maxLength={2000}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="ui-dashboard-control w-full rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100"
                />

                {saveError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{saveError}</p>}

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setDetail(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Batal</button>
                  <button
                    type="button"
                    onClick={() => void saveStatus()}
                    disabled={saving}
                    className="ui-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    Simpan
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs ui-text-muted dark:bg-slate-800/60">
                Akun Tenant Relations hanya dapat melihat dan mengunduh — perubahan status oleh Admin.
              </p>
            )}
          </div>
        </div>
      )}
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
  is_active: boolean;
  sort_order: number;
}

const EMPTY_CATALOG_FORM: CatalogFormState = {
  id: '', slug: '', category: 'outdoor', name: '', size_spec: '', material_spec: '',
  accepted_formats: 'JPEG', price_note: '', location_note: '', rules: '',
  is_active: true, sort_order: 0,
};

function CatalogTab({ canManage, onConfirmDelete }: { canManage: boolean; onConfirmDelete: (id: string, subject: string) => Promise<boolean> }) {
  const [rows, setRows] = useState<PromoMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<CatalogFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

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
        className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100"
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
            className="ui-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
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

      {!loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <div key={m.id ?? m.slug} className={`ui-dashboard-surface p-4 ${m.is_active === false ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{m.name}</p>
                  <p className="text-[11px] ui-text-muted">{CATEGORY_LABELS[m.category] ?? m.category} · /{m.slug}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.is_active === false ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                  {m.is_active === false ? 'Nonaktif' : 'Aktif'}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs ui-text-muted">{m.size_spec || '—'} {m.price_note ? `· ${m.price_note}` : ''}</p>
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
                        is_active: m.is_active !== false, sort_order: m.sort_order,
                      });
                      setFormError('');
                    }}
                    className="ui-dashboard-control flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(m)}
                    aria-label={`Hapus ${m.name}`}
                    className="inline-flex items-center rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
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
      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="catalog-form-title"
          onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}
        >
          <form onSubmit={saveCatalog} className="ui-dashboard-surface max-h-[85vh] w-full max-w-2xl overflow-auto p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="catalog-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {form.id ? 'Edit Media' : 'Tambah Media'}
              </h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {textInput('Slug (unik, huruf kecil)', 'slug', 'spanduk')}
              {textInput('Nama', 'name', 'Spanduk')}
              <div>
                <label htmlFor="cf-category" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Kategori</label>
                <select
                  id="cf-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => (f ? { ...f, category: e.target.value } : f))}
                  className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
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
              <div>
                <label htmlFor="cf-sort" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Urutan</label>
                <input
                  id="cf-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => (f ? { ...f, sort_order: parseInt(e.target.value, 10) || 0 } : f))}
                  className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
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
                className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100"
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
              <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}
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
          className="ui-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
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

      {!loading && (
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
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold ${u.is_active ? 'text-green-700 dark:text-green-400' : 'text-slate-400'}`}>
                      {u.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setForm({ id: u.id, email: u.email, display_name: u.display_name, role: u.role, password: '', is_active: u.is_active }); setFormError(''); }}
                        className="ui-dashboard-control rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-brand-primary-700 dark:text-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(u)}
                        aria-label={`Hapus user ${u.email}`}
                        className="inline-flex items-center rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
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

      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-form-title"
          onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}
        >
          <form onSubmit={saveUser} className="ui-dashboard-surface w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="user-form-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {form.id ? 'Edit User' : 'Tambah User'}
              </h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

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
                    className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100"
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
                  className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="uf-role" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Role</label>
                <select
                  id="uf-role"
                  value={form.role}
                  onChange={(e) => setForm((f) => (f ? { ...f, role: e.target.value } : f))}
                  className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
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
                  className="ui-dashboard-control w-full rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary-500 dark:bg-slate-800 dark:text-slate-100"
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
              <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Simpan
              </button>
            </div>
          </form>
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

  if (isLoading) {
    return (
      <div className="ui-dashboard-page flex min-h-screen items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-brand-primary-600" aria-hidden="true" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="ui-dashboard-page flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <Megaphone className="h-10 w-10 text-brand-primary-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-800 dark:text-white">Sesi berakhir atau belum login.</p>
        <Link to="/login" className="ui-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold transition">Login</Link>
      </div>
    );
  }

  return (
    <div className="ui-dashboard-page min-h-screen">
      {/* Header */}
      <header className="ui-dashboard-chrome sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary-600">
              <Megaphone className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Media Promosi — Admin</p>
              <p className="text-[11px] ui-text-muted">Metropolitan Mall Bekasi</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">{user.display_name}</p>
              <p className="text-[11px] ui-text-muted">{user.role}</p>
            </div>
            <Link to="/" className="text-xs font-medium text-slate-600 transition hover:text-brand-primary-700 dark:text-slate-300">Beranda</Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="ui-dashboard-control inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 transition hover:text-red-600 dark:text-slate-200"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="mx-auto max-w-6xl px-4 pt-4" aria-label="Bagian dashboard">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === t.key
                  ? 'bg-brand-primary-600 text-white'
                  : 'ui-dashboard-control text-slate-600 hover:text-brand-primary-700 dark:text-slate-300'
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
        {tab === 'submissions' && <SubmissionsTab canManage={permissions.canManage} onConfirmDelete={onConfirmDelete} />}
        {tab === 'catalog' && <CatalogTab canManage={permissions.canManage} onConfirmDelete={onConfirmDelete} />}
        {tab === 'users' && permissions.canManageUsers && <UsersTab onConfirmDelete={onConfirmDelete} />}
      </main>

      {dialog}
    </div>
  );
}
