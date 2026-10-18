import { medicineArtKey, medicineArtSrc, type MedicineArtKey } from '../design-system/medicine-art';

type Props = {
  dosageForm?: string | null;
  itemType?: string | null;
  packaging?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  /** Verified product image URL from existing data — shown when present. */
  photoUrl?: string | null;
  size?: number;
  className?: string;
  alt?: string;
};

export function MedicineIllustration({
  dosageForm,
  itemType,
  packaging,
  nameEn,
  nameAr,
  photoUrl,
  size = 48,
  className = '',
  alt = '',
}: Props) {
  const key: MedicineArtKey = medicineArtKey({ dosageForm, itemType, packaging, nameEn, nameAr });
  const src = photoUrl?.trim() || medicineArtSrc(key);
  return (
    <img
      className={`med-art med-art-${key} ${className}`.trim()}
      src={src}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      alt={alt}
      onError={(event) => {
        const img = event.currentTarget;
        if (img.dataset.fallback === '1') return;
        img.dataset.fallback = '1';
        img.src = medicineArtSrc('generic');
      }}
    />
  );
}
