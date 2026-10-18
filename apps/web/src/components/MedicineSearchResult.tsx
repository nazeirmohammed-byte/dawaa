import type { KeyboardEvent, ReactNode } from 'react';
import { MedicineIllustration } from './MedicineIllustration';

export function MedicineSearchResult({
  primary,
  secondary,
  meta,
  price,
  stockLabel,
  dosageForm,
  nameEn,
  nameAr,
  photoUrl,
  active,
  onPick,
}: {
  primary: string;
  secondary?: string;
  meta?: string;
  price?: ReactNode;
  stockLabel?: string;
  dosageForm?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  photoUrl?: string | null;
  active?: boolean;
  onPick: () => void;
}) {
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter') onPick();
  }
  return (
    <button
      type="button"
      className={['med-search-row', active ? 'active' : ''].filter(Boolean).join(' ')}
      onClick={onPick}
      onKeyDown={onKey}
    >
      <MedicineIllustration dosageForm={dosageForm} nameEn={nameEn} nameAr={nameAr} photoUrl={photoUrl} size={40} alt="" />
      <span className="med-search-body">
        <strong>{primary}</strong>
        {secondary ? <span className="med-search-sub">{secondary}</span> : null}
        {meta ? <small>{meta}</small> : null}
      </span>
      <span className="med-search-end">
        {stockLabel ? <span className="ds-badge ds-badge-success">{stockLabel}</span> : null}
        {price ? <em className="med-search-price">{price}</em> : null}
      </span>
    </button>
  );
}
