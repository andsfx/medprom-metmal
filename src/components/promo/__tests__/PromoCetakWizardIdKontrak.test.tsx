/**
 * Test kontrak ID elemen wizard pengajuan cetak.
 *
 * Skrip verifikasi produksi `scripts/verify-cetak.mjs` (JANGAN diubah)
 * mengandalkan id DETERMINISTIK berbasis slug:
 *
 *   const id = await boxes.nth(i).getAttribute('id');
 *   slugs.push(String(id).replace('cetak-media-', ''));
 *   await page.fill(`input#cetak-target-${slug}`, ...);
 *
 * Jadi baris PERTAMA sebuah media wajib memakai id persis `<slug>` (tanpa
 * sufiks), sedangkan baris KEDUA dan seterusnya memakai sufiks indeks baris
 * (`<slug>-2`, `<slug>-3`, ...) agar tidak ada id duplikat di dokumen (id
 * duplikat merusak `page.fill` dan invalid HTML).
 *
 * Kontrak yang dikunci di sini:
 *  - satu media terpilih → id persis `cetak-target-spanduk`, `cetak-start-spanduk`,
 *    `cetak-end-spanduk`, `cetak-install-spanduk`;
 *  - "Tambah lokasi lain" → baris kedua memakai sufiks (`cetak-target-spanduk-2`);
 *  - tidak ada id duplikat di seluruh dokumen;
 *  - checkbox media tetap satu per media dan ber-id `cetak-media-<slug>`;
 *  - `htmlFor` tiap label cocok dengan id input yang bersangkutan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PromoCetakWizard from '../PromoCetakWizard';
import type { PromoMediaType } from '../../../types/promo';

vi.mock('../../../utils/promoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/promoApi')>();
  return {
    ...actual,
    fetchMediaTypes: vi.fn(),
    searchTenants: vi.fn(),
    submitBatch: vi.fn(),
  };
});

import { fetchMediaTypes, searchTenants, submitBatch } from '../../../utils/promoApi';

const mockedFetchMediaTypes = vi.mocked(fetchMediaTypes);
const mockedSearchTenants = vi.mocked(searchTenants);
const mockedSubmitBatch = vi.mocked(submitBatch);

const MEDIA: PromoMediaType[] = [
  {
    slug: 'spanduk', category: 'outdoor', name: 'Spanduk',
    size_spec: '0.9 M x 6.0 M', material_spec: 'Flexi 280gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 70.000,-/hari',
    location_note: 'Sisi Pintu Tol Bekasi Barat', rules: '', sort_order: 1,
    media_channel: 'cetak', price_amount: 70000, price_unit: 'hari', ppn_included: false,
  },
  {
    slug: 'umbul-umbul', category: 'outdoor', name: 'Umbul-Umbul',
    size_spec: '0.9 x 4.8 M', material_spec: 'Flexi 440gr',
    accepted_formats: 'JPEG,PNG,PDF', image_path: '', price_note: 'Rp. 288.000,-/hari/16 tiang',
    location_note: '', rules: '', sort_order: 3,
    media_channel: 'cetak', price_amount: 288000, price_unit: 'hari/16 tiang', ppn_included: false,
  },
];

beforeEach(() => {
  localStorage.setItem('metmal_device_fp', 'testfp-cetak-id');
  sessionStorage.clear();
  vi.clearAllMocks();
  mockedFetchMediaTypes.mockResolvedValue(MEDIA);
  mockedSearchTenants.mockResolvedValue({ available: true, tenants: [] });
  mockedSubmitBatch.mockResolvedValue({
    batch_id: 'b1', batch_number: 'MPB-260920-ABC234', batch_token: 'btok',
    applicant_type: 'non_tenant', created_at: '2026-09-20T00:00:00Z', items: [],
  });
});

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/ajukan-cetak']}>
      <PromoCetakWizard />
    </MemoryRouter>,
  );
}

async function masukLangkah2() {
  fireEvent.click(await screen.findByRole('button', { name: 'Non-tenant' }));
  fireEvent.change(screen.getByLabelText(/Nama Non Tenant/i), { target: { value: 'PT Contoh' } });
  fireEvent.change(screen.getByLabelText(/Nama Pemohon/i), { target: { value: 'Andi' } });
  fireEvent.change(screen.getByLabelText(/Nomor Telepon/i), { target: { value: '081234567890' } });
  fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Pilih Media/i }));
  await screen.findByRole('heading', { name: /Pilih Media & Periode/i });
}

/**
 * Assert tidak ada id duplikat di dokumen (id duplikat = invalid HTML dan
 * merusak `page.fill` di skrip verifikasi).
 */
function expectTanpaIdDuplikat() {
  const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
  expect(ids.length).toBe(new Set(ids).size);
}

describe('PromoCetakWizard - kontrak id deterministik berbasis slug', () => {
  it('baris pertama satu media memakai id persis tanpa sufiks', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));

    // Elemen NYATA harus ada (bukan sekadar string di kode).
    const target = document.getElementById('cetak-target-spanduk');
    const start = document.getElementById('cetak-start-spanduk');
    const end = document.getElementById('cetak-end-spanduk');
    const install = document.getElementById('cetak-install-spanduk');
    expect(target).toBeInstanceOf(HTMLInputElement);
    expect(start).toBeInstanceOf(HTMLInputElement);
    expect(end).toBeInstanceOf(HTMLInputElement);
    expect(install).toBeInstanceOf(HTMLInputElement);
    expect((target as HTMLInputElement).type).toBe('text');
    expect((start as HTMLInputElement).type).toBe('date');
    expect((end as HTMLInputElement).type).toBe('date');
    expect((install as HTMLInputElement).type).toBe('date');

    // Tidak ada varian bersufiks untuk baris pertama.
    expect(document.querySelectorAll('[id^="cetak-target-spanduk-"]')).toHaveLength(0);
    expectTanpaIdDuplikat();
  });

  it('label terhubung ke input lewat htmlFor yang cocok', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));

    for (const basis of ['cetak-target-spanduk', 'cetak-start-spanduk', 'cetak-end-spanduk', 'cetak-install-spanduk']) {
      const label = document.querySelector(`label[for="${basis}"]`);
      expect(label, `label[for="${basis}"] harus ada`).not.toBeNull();
      expect(document.getElementById(basis)).not.toBeNull();
    }
  });

  it('baris kedua memakai sufiks dan tidak ada id duplikat di dokumen', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tambah lokasi lain/i }));

    // Baris pertama tetap tanpa sufiks, baris kedua bersufiks -2.
    expect(document.getElementById('cetak-target-spanduk')).not.toBeNull();
    expect(document.getElementById('cetak-start-spanduk')).not.toBeNull();
    expect(document.getElementById('cetak-end-spanduk')).not.toBeNull();
    expect(document.getElementById('cetak-install-spanduk')).not.toBeNull();
    expect(document.getElementById('cetak-target-spanduk-2')).not.toBeNull();
    expect(document.getElementById('cetak-start-spanduk-2')).not.toBeNull();
    expect(document.getElementById('cetak-end-spanduk-2')).not.toBeNull();
    expect(document.getElementById('cetak-install-spanduk-2')).not.toBeNull();

    // Dua baris nyata untuk media yang sama.
    expect(screen.getAllByLabelText(/Lokasi Pemasangan/i)).toHaveLength(2);
    expectTanpaIdDuplikat();
  });

  it('baris ketiga memakai sufiks -3 (bukan menimpa baris kedua)', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    const tambah = screen.getByRole('button', { name: /Tambah lokasi lain/i });
    fireEvent.click(tambah);
    fireEvent.click(tambah);

    expect(document.getElementById('cetak-target-spanduk-3')).not.toBeNull();
    expect(document.getElementById('cetak-target-spanduk-2')).not.toBeNull();
    expect(document.getElementById('cetak-target-spanduk')).not.toBeNull();
    expectTanpaIdDuplikat();
  });

  it('checkbox media tetap satu per media dan ber-id cetak-media-<slug>', async () => {
    renderWizard();
    await masukLangkah2();

    const checkbox = document.getElementById('cetak-media-spanduk');
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    expect((checkbox as HTMLInputElement).type).toBe('checkbox');

    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tambah lokasi lain/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tambah lokasi lain/i }));

    // Tetap SATU checkbox meski ada tiga baris lokasi.
    expect(document.querySelectorAll('#cetak-media-spanduk')).toHaveLength(1);
    expect(screen.getAllByRole('checkbox', { name: /Spanduk/ })).toHaveLength(1);
    expectTanpaIdDuplikat();
  });

  it('dua media berbeda memakai id berbasis slug masing-masing tanpa tabrakan', async () => {
    renderWizard();
    await masukLangkah2();
    fireEvent.click(screen.getByRole('checkbox', { name: /Spanduk/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Umbul-Umbul/ }));

    expect(document.getElementById('cetak-target-spanduk')).not.toBeNull();
    expect(document.getElementById('cetak-target-umbul-umbul')).not.toBeNull();
    expect(document.getElementById('cetak-media-spanduk')).not.toBeNull();
    expect(document.getElementById('cetak-media-umbul-umbul')).not.toBeNull();
    expectTanpaIdDuplikat();
  });
});
