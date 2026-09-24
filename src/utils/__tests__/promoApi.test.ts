/**
 * Regresi kontrak submit pengajuan:
 * Server membalas HTTP 400 `{ success: false, errors: [...] }`. `request()`
 * melempar ApiError pada non-2xx, jadi tanpa penanganan khusus UI hanya
 * melihat "Permintaan gagal (HTTP 400)" dan kehilangan sebab validasinya.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { submitPromo, errorsFromApiError, mapSubmitErrors, fetchStatusByNumber } from '../promoApi';
import { ApiError } from '../../lib/rest';

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => { global.fetch = originalFetch; });
beforeEach(() => { vi.restoreAllMocks(); });

const PAYLOAD = {
  media_type_slug: 'spanduk', tenant_id: '', tenant_name: 'Optik Melawai',
  unit_number: 'A-01', pic_name: 'Andi', pic_phone: '08123456789',
  campaign_name: 'Promo', material_title: 'Spanduk Promo',
  material_description: 'Keterangan.', material_type: 'Promosi',
  media_target: 'Atrium 1', air_start_date: '', air_end_date: '',
  installation_date: '', terms_accepted: true, notes: '',
  drive_file_id: '', file_name: '', mime_type: '', file_size_bytes: 0,
  link_url: 'https://drive.google.com/file/d/x/view', device_fingerprint: 'fp1',
};

describe('submitPromo — propagasi errors[] dari HTTP 400', () => {
  it('mengangkat errors[] ke message, bukan 400 generik', async () => {
    global.fetch = vi.fn(async () => jsonResponse(
      { success: false, errors: ['Tautan materi harus berupa URL http/https yang valid'] },
      400,
    )) as unknown as typeof fetch;

    await expect(submitPromo(PAYLOAD)).rejects.toThrow(/Tautan materi harus berupa URL/);
  });

  it('menyisakan errors[] di payload ApiError untuk pemetaan field', async () => {
    global.fetch = vi.fn(async () => jsonResponse(
      { success: false, errors: ['Format nomor telepon tidak valid'] },
      400,
    )) as unknown as typeof fetch;

    try {
      await submitPromo(PAYLOAD);
      throw new Error('seharusnya throw');
    } catch (err) {
      expect(errorsFromApiError(err)).toEqual(['Format nomor telepon tidak valid']);
    }
  });

  it('jatuh ke pesan fallback bila 400 tanpa errors[]', async () => {
    global.fetch = vi.fn(async () => jsonResponse({ success: false }, 400)) as unknown as typeof fetch;
    await expect(submitPromo(PAYLOAD)).rejects.toThrow(/HTTP 400/);
  });

  it('sukses mengembalikan id + nomor pengajuan + token status', async () => {
    global.fetch = vi.fn(async () => jsonResponse(
      {
        success: true, id: 'abc-123', submission_number: 'MP-260916-ABC234',
        status_token: 'tok-1', status: 'menunggu_review', created_at: '2026-09-15T00:00:00Z',
      },
    )) as unknown as typeof fetch;

    await expect(submitPromo(PAYLOAD)).resolves.toEqual({
      id: 'abc-123',
      submission_number: 'MP-260916-ABC234',
      status_token: 'tok-1',
      status: 'menunggu_review',
      created_at: '2026-09-15T00:00:00Z',
    });
  });
});

describe('fetchStatusByNumber — pelacakan via nomor + captcha', () => {
  const DATA = {
    submission: { id: 'sub-1', submission_number: 'MP-260918-A7K2QX' },
    history: [], files: [], installation: null,
  };

  it('mengirim nomor, token captcha, dan fingerprint sebagai query', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, data: DATA }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    // Bentuk hasil kini memuat `is_owner` (kepemilikan ditandai server dari
    // fingerprint pemanggil). Nilai `undefined` dari server menjadi `false`.
    await expect(fetchStatusByNumber('MP-260918-A7K2QX', 'tok-cf')).resolves.toEqual({
      ...DATA,
      is_owner: false,
    });

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('/promo/submissions/track');
    expect(url).toContain('number=MP-260918-A7K2QX');
    expect(url).toContain('captcha=tok-cf');
    // Fingerprint ikut dikirim supaya server bisa menandai kepemilikan.
    expect(url).toContain('fingerprint=');
  });

  it('meneruskan is_owner true dari server apa adanya', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, data: { ...DATA, is_owner: true } }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const hasil = await fetchStatusByNumber('MP-260918-A7K2QX', 'tok-cf');
    expect(hasil.is_owner).toBe(true);
  });

  it('tanpa token captcha → parameter captcha tidak dikirim', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ success: true, data: DATA }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await fetchStatusByNumber('MP-260918-A7K2QX', '');

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).not.toContain('captcha=');
  });

  it('meneruskan 404 dari server sebagai ApiError', async () => {
    global.fetch = vi.fn(async () => jsonResponse(
      { success: false, error: 'Pengajuan tidak ditemukan.' }, 404,
    )) as unknown as typeof fetch;

    await expect(fetchStatusByNumber('MP-260918-ZZZZZZ', 'tok')).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe('errorsFromApiError', () => {
  it('mengabaikan non-string dan entri kosong', () => {
    const err = new ApiError('x', '400', { errors: ['pesan valid', '', 42, '  '] });
    expect(errorsFromApiError(err)).toEqual(['pesan valid']);
  });

  it('mengembalikan [] untuk error tanpa payload errors', () => {
    expect(errorsFromApiError(new ApiError('boom', 'NETWORK'))).toEqual([]);
    expect(errorsFromApiError(new Error('biasa'))).toEqual([]);
  });
});

describe('mapSubmitErrors', () => {
  it('memetakan pesan telepon ke pic_phone, bukan pic_name', () => {
    const { fields, general } = mapSubmitErrors(['Nomor telepon PIC wajib diisi']);
    expect(fields.pic_phone).toBe('Nomor telepon PIC wajib diisi');
    expect(fields.pic_name).toBeUndefined();
    expect(general).toEqual([]);
  });

  it('memetakan pesan tautan ke link_url', () => {
    const { fields } = mapSubmitErrors(['Tautan materi harus berupa URL http/https yang valid']);
    expect(fields.link_url).toMatch(/Tautan materi/);
  });

  it('menaruh pesan tak dikenal ke general', () => {
    const { fields, general } = mapSubmitErrors(['Terjadi kesalahan tak terduga']);
    expect(fields).toEqual({});
    expect(general).toEqual(['Terjadi kesalahan tak terduga']);
  });
});
