/**
 * Harga satu media katalog - satu render untuk landing dan kedua wizard.
 *
 * Ketiga permukaan menampilkan harga dari sumber yang sama
 * (`src/utils/mediaPrice.ts`), dan bentuknya harus identik: kalau landing
 * menampilkan tangga tarif terpisah per baris sementara wizard menggabungkannya
 * jadi satu kalimat, tenant melihat dua harga berbeda untuk media yang sama.
 *
 * Dua bentuk:
 *
 * 1. **Satu baris** -> angka besar di samping nama (`data-kind="money"`), atau
 *    tanpa angka ("Gratis", "Hubungi Marcom") yang duduk di barisnya sendiri.
 * 2. **Tangga tarif** -> daftar di bawah nama, satu baris per tarif. Baris
 *    berlabel jadi dua kolom (nominal rata kanan) supaya nominal berbagai
 *    durasi sejajar; baris tanpa label dibiarkan satu baris.
 */
import { mediaPrice, pecahBarisTarif } from '../../utils/mediaPrice';
import type { PromoMediaType } from '../../types/promo';

export default function MediaPriceTag({ media }: { media: PromoMediaType }) {
  const price = mediaPrice(media);

  if (price.mode === 'single') {
    return (
      <span className="ui-row-num" data-kind={price.kind}>
        {price.text}
        {price.unit ? <small>{price.unit}</small> : null}
      </span>
    );
  }

  return (
    <div className="ui-price-ladder">
      {price.lines.map((line, i) => {
        const { label, nominal } = pecahBarisTarif(line);
        if (label === null) {
          return (
            <span key={i} className="ui-num block ui-dense font-medium ui-text-strong">
              {nominal}
            </span>
          );
        }
        return (
          <span key={i} className="flex items-baseline justify-between gap-3">
            <span className="ui-dense ui-text-muted">{label}</span>
            <span className="ui-dense ui-num tabular-nums whitespace-nowrap font-medium ui-text-strong">
              {nominal}
            </span>
          </span>
        );
      })}
    </div>
  );
}
