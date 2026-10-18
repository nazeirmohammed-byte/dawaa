/** Maps product metadata to deterministic category illustration assets (non-branded). */

export type MedicineArtKey =
  | 'tablets'
  | 'capsules'
  | 'syrup'
  | 'suspension'
  | 'ointment'
  | 'cream'
  | 'gel'
  | 'eye-drops'
  | 'ear-drops'
  | 'nasal-spray'
  | 'injection'
  | 'prefilled-syringe'
  | 'powder'
  | 'sachet'
  | 'inhaler'
  | 'suppository'
  | 'infusion'
  | 'equipment'
  | 'consumable'
  | 'generic';

const BASE = '/assets/medicine-illustrations';

export function medicineArtSrc(key: MedicineArtKey): string {
  return `${BASE}/${key}.svg`;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

export function medicineArtKey(input: {
  dosageForm?: string | null;
  itemType?: string | null;
  packaging?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
}): MedicineArtKey {
  const blob = normalize(
    [input.dosageForm, input.itemType, input.packaging, input.nameEn, input.nameAr].filter(Boolean).join(' '),
  );
  if (/equipment|device|meter|monitor|glucometer|sphygmomanometer|جهاز|معدات/.test(blob)) return 'equipment';
  if (/consumable|gauze|glove|mask|مستهل/.test(blob)) return 'consumable';
  if (/inhaler|بخاخ رئ|حباب/.test(blob)) return 'inhaler';
  if (/infusion|iv drip|محلول وري|تسريب/.test(blob)) return 'infusion';
  if (/suppositor|تحاميل/.test(blob)) return 'suppository';
  if (/prefill|syringe|حقن جاه|سرنج/.test(blob)) return 'prefilled-syringe';
  if (/injection|ampoule|vial|ampoule|حقن|امبول|فيال/.test(blob)) return 'injection';
  if (/nasal spray|بخاخ انف|بخاخ الأنف/.test(blob)) return 'nasal-spray';
  if (/ear drop|قطرة اذن|أذن/.test(blob)) return 'ear-drops';
  if (/eye drop|ophthalm|قطرة عين|عيون/.test(blob)) return 'eye-drops';
  if (/gel|جل/.test(blob)) return 'gel';
  if (/cream|كريم/.test(blob)) return 'cream';
  if (/ointment|مرهم/.test(blob)) return 'ointment';
  if (/suspension|معلق/.test(blob)) return 'suspension';
  if (/syrup|susp oral|شراب/.test(blob)) return 'syrup';
  if (/sachet|كيس/.test(blob)) return 'sachet';
  if (/powder|مسحوق/.test(blob)) return 'powder';
  if (/capsule|كبسول/.test(blob)) return 'capsules';
  if (/tablet|tab\.|قرص|حب/.test(blob)) return 'tablets';
  return 'generic';
}
