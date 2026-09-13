/**
 * REST client — akses FE ke backend Express/Postgres (pola schedule-event-v2
 * src/lib/rest.ts, disalin utuh).
 */

const ACCESS_TOKEN_COOKIE = 'sb-access-token';

const API_V1_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '')
  .replace(/\/+$/, '') + '/api/v1';

/** URL absolut ke REST — untuk kebutuhan non-JSON (download blob/CSV). */
export function apiUrl(path: string): string {
  return `${API_V1_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Error terstruktur dari REST (message + code + flag aplikasi opsional). */
export class ApiError extends Error {
  code: string;
  payload: Record<string, unknown> | undefined;

  constructor(message: string, code: string, payload?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.payload = payload;
  }
}

export interface RestOptions {
  errorMessageFallback?: (status: number) => string;
}

/** Ambil access token dari cookie sb-access-token ('' bila HttpOnly tak terbaca JS). */
export function getAccessToken(): string {
  const prefix = `${ACCESS_TOKEN_COOKIE}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return '';
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  options: RestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_V1_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'Gagal terhubung ke server',
      'NETWORK',
    );
  }

  if (!response.ok) {
    let message: string | null = null;
    let code: string | undefined;
    let payload: Record<string, unknown> | undefined;
    try {
      const parsed = (await response.json()) as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
        errors?: unknown;
      } & Record<string, unknown>;
      if (typeof parsed.error === 'string' && parsed.error) message = parsed.error;
      else if (typeof parsed.message === 'string' && parsed.message) message = parsed.message;
      if (typeof parsed.code === 'string') code = parsed.code;
      else if (typeof parsed.code === 'number') code = String(parsed.code);
      // Flag aplikasi (errors) diteruskan agar pemanggil bisa bedakan
      // 400-validasi vs lainnya tanpa baca body manual.
      const { error: _e, message: _m, code: _c, success: _s, ...rest } = parsed;
      if (Object.keys(rest).length > 0) payload = rest;
    } catch {
      // body bukan JSON — pakai fallback
    }
    const fallback =
      options.errorMessageFallback?.(response.status) ?? `Permintaan gagal (HTTP ${response.status})`;
    throw new ApiError(message ?? fallback, code ?? String(response.status), payload);
  }

  return (await response.json()) as T;
}

/**
 * GET publik (tanpa auth): unwrap envelope — kembalikan `data`.
 * Saat body `{ success: false }` di HTTP 200 → lempar ApiError.
 */
export async function apiGet<T>(path: string, options: RestOptions = {}): Promise<T> {
  const body = await request<{ success: boolean; data?: T; error?: string }>('GET', path, undefined, options);
  if (body && body.success === false) {
    throw new ApiError(body.error || 'Permintaan gagal', 'APP');
  }
  return body.data as T;
}

/**
 * GET respons penuh TANPA unwrap `data` — untuk endpoint non-envelope
 * seperti /auth/me yang membalas { success, user } langsung.
 */
export async function apiGetRaw<T>(path: string, options: RestOptions = {}): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

/**
 * POST (admin/auth/submit): kembalikan seluruh body JSON apa adanya (flat).
 * Pemanggil membaca `success`/`data`/`id` sesuai kebutuhan.
 */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: RestOptions = {},
): Promise<T> {
  return request<T>('POST', path, body, options);
}
