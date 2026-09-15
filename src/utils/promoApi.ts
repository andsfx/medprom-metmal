/**
 * Client API media promosi — pola surveysApi.ts app lama
 * (ApiError → degradasi list kosong sesuai konteks; error diteruskan bila
 * UI butuh menampilkan pesan/tombol coba lagi).
 */
import { apiGet, apiPost, apiUrl, ApiError } from '../lib/rest';
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

// ─── Upload file (publik) ───────────────────────────────────────

export interface UploadResult {
  /** ID file di Google Drive (dipakai submit). */
  file_id: string;
  web_view_link: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
}

/** Upload satu file ke API (streaming multipart) — server verifikasi magic
 *  bytes sebelum menyimpan ke Drive, lalu mengembalikan metadata terverifikasi. */
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<UploadResult> {
  const { promise, resolve, reject } = Promise.withResolvers<UploadResult>();

  const xhr = new XMLHttpRequest();
  xhr.open('POST', apiUrl('/drive/upload'));
  xhr.withCredentials = true;

  if (onProgress) {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
  }

  xhr.onload = () => {
    let parsed: {
      success?: boolean; error?: string;
      file_id?: string; web_view_link?: string; file_name?: string; mime_type?: string; file_size_bytes?: number;
    } = {};
    try { parsed = JSON.parse(xhr.responseText); } catch { /* body non-JSON */ }
    if (xhr.status >= 200 && xhr.status < 300 && parsed.success && parsed.file_id) {
      resolve({
        file_id: parsed.file_id,
        web_view_link: parsed.web_view_link || '',
        file_name: parsed.file_name || file.name,
        mime_type: parsed.mime_type || file.type,
        file_size_bytes: parsed.file_size_bytes || file.size,
      });
    } else {
      reject(new ApiError(parsed.error || `Gagal mengunggah file (HTTP ${xhr.status})`, 'UPLOAD'));
    }
  };
  xhr.onerror = () => reject(new ApiError('Gagal terhubung ke server', 'NETWORK'));
  xhr.onabort = () => reject(new ApiError('Unggahan dibatalkan', 'ABORT'));

  const form = new FormData();
  form.append('file', file);
  xhr.send(form);

  return promise;
}

// ─── Submit pengajuan (publik) ──────────────────────────────────

/**
 * Ambil daftar pesan validasi dari ApiError.
 *
 * Server membalas 400 `{ success: false, errors: [...] }`; `request()` melempar
 * ApiError pada HTTP non-2xx dan menyisakan `errors` di `payload`. Tanpa helper
 * ini pemanggil hanya melihat pesan generik "Permintaan gagal (HTTP 400)".
 */
export function errorsFromApiError(err: unknown): string[] {
  if (err instanceof ApiError && err.payload) {
    const raw = err.payload.errors;
    if (Array.isArray(raw)) return raw.filter((e): e is string => typeof e === 'string' && e.trim() !== '');
  }
  return [];
}

/**
 * Petakan pesan validasi server ke field form wizard.
 *
 * Server mengembalikan `errors[]` sebagai teks tanpa nama field, jadi
 * pencocokan berbasis kata kunci. Urutan penting: 'telepon' dicek sebelum
 * 'pic' karena "Nomor telepon PIC wajib diisi" memuat keduanya.
 */
export function mapSubmitErrors(errors: string[]): { fields: Record<string, string>; general: string[] } {
  const fields: Record<string, string> = {};
  const general: string[] = [];

  for (const raw of errors) {
    const msg = String(raw || '').trim();
    if (!msg) continue;
    const low = msg.toLowerCase();

    let field: string | null = null;
    if (low.includes('telepon')) field = 'pic_phone';
    else if (low.includes('tautan')) field = 'link_url';
    else if (low.includes('installation_date') || low.includes('tanggal')) field = 'installation_date';
    else if (low.includes('pic')) field = 'pic_name';
    else if (low.includes('gerai') || low.includes('tenant')) field = 'tenant';
    else if (low.includes('media')) field = 'media';

    if (field && !fields[field]) fields[field] = msg;
    else general.push(msg);
  }

  return { fields, general };
}

export async function submitPromo(payload: PromoSubmissionPayload): Promise<{ id: string; created_at: string }> {
  interface SubmitResponse {
    success: boolean; error?: string; id?: string; created_at?: string; errors?: string[];
  }
  let result: SubmitResponse;
  try {
    result = await apiPost<SubmitResponse>('/promo/submit', payload);
  } catch (err) {
    // HTTP 400 → errors[] tersimpan di ApiError.payload; angkat ke pesan agar
    // UI bisa menampilkan sebabnya (dan memetakan ke field), bukan 400 generik.
    if (err instanceof ApiError) {
      const errors = errorsFromApiError(err);
      const message = errors.length > 0 ? errors.join('; ') : err.message;
      throw new ApiError(message, err.code, { ...(err.payload || {}), errors });
    }
    throw err;
  }

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
