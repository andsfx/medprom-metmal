import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Sheet from '../Sheet';

function renderSheet(props: Partial<React.ComponentProps<typeof Sheet>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <Sheet open={props.open ?? true} onClose={onClose} title={props.title ?? 'Detail Pengajuan'} footer={props.footer}>
      <button type="button">Aksi pertama</button>
      <button type="button">Aksi terakhir</button>
    </Sheet>,
  );
  return { ...view, onClose };
}

describe('Sheet', () => {
  it('open=false → tidak merender apa pun', () => {
    renderSheet({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('open → dialog modal dengan judul terbaca pembaca layar', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Detail Pengajuan' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Escape → menutup sheet', () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('tombol tutup → menutup sheet', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Tab dari elemen terakhir → fokus melingkar ke elemen pertama (fokus terjebak)', () => {
    renderSheet();
    const last = screen.getByRole('button', { name: 'Aksi terakhir' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Tutup' })).toHaveFocus();
  });

  it('sheet terbuka → gulir latar dikunci agar tidak ikut bergeser', () => {
    renderSheet();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('sheet ditutup → gulir latar dipulihkan', () => {
    const { unmount } = renderSheet();
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('footer diberikan → aksi dasar sheet dirender', () => {
    renderSheet({ footer: <button type="button">Simpan</button> });
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeInTheDocument();
  });

  it('onClose identitas baru tiap render → fokus tidak direbut dari input', () => {
    // Regresi: `onClose` inline (`() => setX(null)`) berubah identitas tiap
    // render, jadi ia TIDAK boleh menjadi dependency efek "buka". Bila menjadi
    // dependency, cleanup mengembalikan fokus ke pemicu lalu panel merebutnya
    // kembali — pengguna hanya bisa mengetik satu karakter per fokus.
    function Harness() {
      const [nilai, setNilai] = useState('');
      return (
        <Sheet open onClose={() => { /* identitas baru tiap render */ }} title="Uji">
          <input
            aria-label="catatan"
            value={nilai}
            onChange={(e) => setNilai(e.target.value)}
          />
        </Sheet>
      );
    }
    render(<Harness />);

    const input = screen.getByLabelText('catatan');
    input.focus();
    fireEvent.change(input, { target: { value: 'halo' } });

    expect(input).toHaveValue('halo');
    expect(input).toHaveFocus();
  });
});
