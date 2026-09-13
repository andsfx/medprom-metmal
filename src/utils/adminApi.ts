/**
 * Client API admin — submissions, media-types CRUD, users, export.
 * Semua butuh sesi login (cookie sb-access-token via credentials: include).
 */
import { apiGet, apiGetRaw, apiPost, apiUrl, ApiError } from '../lib/rest';
import type { PromoMediaType, AdminSubmissionRow, AdminUserRow } from '../types/promo';

export interface SubmissionsPage {
  data: AdminSubmissionRow[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export async function fetchAdminSubmissions(params: {
  status?: string; media_type?: string; page?: number;
}): Promise<SubmissionsPage> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.media_type) qs.set('media_type', params.media_type);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  return apiGetRaw<SubmissionsPage>(`/admin/submissions?${qs.toString()}`);
}

export async function updateSubmissionStatus(
  id: string, status: string, reviewNotes: string,
): Promise<void> {
  const result = await apiPost<{ success: boolean; error?: string }>(`/admin/submissions/${id}/status`, {
    status, review_notes: reviewNotes,
  });
  if (!result.success) throw new ApiError(result.error || 'Gagal menyimpan status', 'APP');
}

export async function deleteSubmission(id: string): Promise<void> {
  const result = await apiPost<{ success: boolean; error?: string }>(`/admin/submissions/${id}/delete`);
  if (!result.success) throw new ApiError(result.error || 'Gagal menghapus pengajuan', 'APP');
}

// ─── Media types (katalog) ─────────────────────────────────────

export async function fetchAdminMediaTypes(): Promise<PromoMediaType[]> {
  const data = await apiGet<unknown>('/admin/media-types');
  return Array.isArray(data) ? (data as PromoMediaType[]) : [];
}

export interface MediaTypeInput {
  slug?: string;
  category?: string;
  name?: string;
  size_spec?: string;
  material_spec?: string;
  accepted_formats?: string;
  price_note?: string;
  location_note?: string;
  rules?: string;
  is_active?: boolean;
  sort_order?: number;
}

export async function createMediaType(input: MediaTypeInput): Promise<string> {
  const result = await apiPost<{ success: boolean; error?: string; id?: string }>('/admin/media-types', input);
  if (!result.success) throw new ApiError(result.error || 'Gagal membuat media type', 'APP');
  return result.id || '';
}

export async function updateMediaType(id: string, input: MediaTypeInput): Promise<void> {
  const result = await apiPost<{ success: boolean; error?: string }>(`/admin/media-types/${id}`, input);
  if (!result.success) throw new ApiError(result.error || 'Gagal menyimpan media type', 'APP');
}

export async function deleteMediaType(id: string): Promise<void> {
  const result = await apiPost<{ success: boolean; error?: string }>(`/admin/media-types/${id}/delete`);
  if (!result.success) throw new ApiError(result.error || 'Gagal menghapus media type', 'APP');
}

// ─── Export CSV ─────────────────────────────────────────────────

export async function downloadExportCsv(): Promise<void> {
  const response = await fetch(apiUrl('/admin/export'), {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!response.ok) throw new ApiError('Gagal mengunduh CSV', 'EXPORT');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pengajuan-media-promosi.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Users (superadmin) ─────────────────────────────────────────

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const data = await apiGet<unknown>('/admin/users');
  return Array.isArray(data) ? (data as AdminUserRow[]) : [];
}

export interface UserInput {
  email?: string;
  display_name?: string;
  role?: string;
  password?: string;
  is_active?: boolean;
}

export async function createUser(input: UserInput): Promise<void> {
  const result = await apiPost<{ success: boolean; error?: string }>('/admin/users', input);
  if (!result.success) throw new ApiError(result.error || 'Gagal membuat user', 'APP');
}

export async function updateUser(id: string, input: UserInput): Promise<void> {
  const result = await apiPost<{ success: boolean; error?: string }>(`/admin/users/${id}`, input);
  if (!result.success) throw new ApiError(result.error || 'Gagal menyimpan user', 'APP');
}

export async function deleteUser(id: string): Promise<void> {
  const result = await apiPost<{ success: boolean; error?: string }>(`/admin/users/${id}/delete`);
  if (!result.success) throw new ApiError(result.error || 'Gagal menghapus user', 'APP');
}
