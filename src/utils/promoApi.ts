/**
 * Client API media promosi — pola surveysApi.ts app lama
 * (ApiError → degradasi list kosong sesuai konteks; error diteruskan bila
 * UI butuh menampilkan pesan/tombol coba lagi).
 */
import { apiGet, apiPost, ApiError } from '../lib/rest';
import type {
  PromoMediaType, TenantOption, PromoSubmissionPayload, MySubmissionRow,
} from '../types/promo';

// ─── Katalog (publik) ───────────────────────────────────────────

export async function fetchMediaTypes(): Promise<PromoMediaType[]> {
  const data = await apiGet<unknown>('/promo/media-types');
  return Array.isArray(data) ? (data as PromoMediaType[]) : [];
}

// ─── Pencarian tenant MID (publik) ───────────────────────────────

export interface TenantSearchResult {
  /** false bila server MID tidak dikonfigurasi / tidak terjangkau → wizard
   *  beralih ke isian nama tenant manual. */
  available: boolean;
  tenants: TenantOption[];
}

export async function searchTenants(query: string): Promise<TenantSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { available: true, tenants: [] };
  try {
    const data = await apiGet<unknown>(`/promo/tenants?q=${encodeURIComponent(q)}`);
    return { available: true, tenants: Array.isArray(data) ? (data as TenantOption[]) : [] };
  } catch (err) {
    // 500 (MID_API_KEY kosong) / 502 (upstream mati) / 429 → daftar tak tersedia.
    if (err instanceof ApiError) return { available: false, tenants: [] };
    return { available: false, tenants: [] };
  }
}

// ─── Upload R2 (publik) ─────────────────────────────────────────

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  fileName: string;
}

export async function presignUpload(file: File): Promise<PresignResult> {
  const result = await apiPost<{
    success: boolean; error?: string; uploadUrl?: string; publicUrl?: string; fileName?: string;
  }>('/r2/presign-public', { originalName: file.name, contentType: file.type });

  if (!result.success) throw new ApiError(result.error || 'Gagal menyiapkan upload', 'APP');
  if (!result.uploadUrl || !result.publicUrl) throw new ApiError('Gagal menyiapkan upload', 'APP');
  return { uploadUrl: result.uploadUrl, publicUrl: result.publicUrl, fileName: result.fileName || '' };
}

export async function putFile(uploadUrl: string, file: File): Promise<void> {
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new ApiError('Gagal mengunggah file', 'UPLOAD');
}

// ─── Submit pengajuan (publik) ──────────────────────────────────

export async function submitPromo(payload: PromoSubmissionPayload): Promise<{ id: string; created_at: string }> {
  const result = await apiPost<{
    success: boolean; error?: string; id?: string; created_at?: string; errors?: string[];
  }>('/promo/submit', payload);

  if (!result.success) {
    const message = Array.isArray(result.errors) && result.errors.length > 0
      ? result.errors.join('; ')
      : (result.error || 'Gagal mengirim pengajuan');
    throw new ApiError(message, 'APP', result.errors ? { errors: result.errors } : undefined);
  }
  return { id: result.id || '', created_at: result.created_at || '' };
}

// ─── Riwayat per perangkat (publik) ─────────────────────────────

export async function fetchMySubmissions(fingerprint: string): Promise<MySubmissionRow[]> {
  try {
    const data = await apiGet<unknown>(`/promo/submissions/mine?fingerprint=${encodeURIComponent(fingerprint)}`);
    return Array.isArray(data) ? (data as MySubmissionRow[]) : [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    throw err;
  }
}
