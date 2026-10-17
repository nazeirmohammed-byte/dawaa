/** Fold Arabic and Latin text so mixed-language catalog search shares one key. */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function searchTokens(value: string): string[] {
  const folded = foldSearchText(value).slice(0, 80);
  if (!folded) return [];
  const words = folded.split(' ').filter((word) => word.length >= 2);
  return [...new Set([folded, ...words])].slice(0, 24);
}

export function ingredientParts(value: string): string[] {
  return [...new Set(value.split(/[/+,;]| and /i).map((part) => part.trim()).filter((part) => part.length > 1))];
}

/** Verified INN aliases. Brand names stay on the commercial product, not here. */
export const INN_ALIASES: { inn: string; ar: string; aliases: string[] }[] = [
  { inn: 'paracetamol', ar: 'باراسيتامول', aliases: ['acetaminophen', 'paracetemol', 'paracetomol', 'اسيتامينوفين', 'باراسيتامول'] },
  { inn: 'ibuprofen', ar: 'ايبوبروفين', aliases: ['ايبوبروفين', 'ايبوبروفين'] },
  { inn: 'amoxicillin', ar: 'أموكسيسيلين', aliases: ['amoxycillin', 'أموكسيسيلين', 'اموكسيسيلين'] },
  { inn: 'metformin', ar: 'ميتفورمين', aliases: ['ميتفورمين'] },
  { inn: 'omeprazole', ar: 'أوميبرازول', aliases: ['أوميبرازول', 'اوميبرازول'] },
  { inn: 'salbutamol', ar: 'سالبوتامول', aliases: ['albuterol', 'سالبوتامول'] },
  { inn: 'acetylsalicylic acid', ar: 'حمض الأسيتيل ساليسيليك', aliases: ['aspirin', 'أسبرين', 'اسبرين'] },
  { inn: 'clavulanic acid', ar: 'حمض clavulanic', aliases: ['clavulanate', 'كلافولانيك'] },
];

export function expandQuery(query: string): string[] {
  const folded = foldSearchText(query);
  const found = new Set<string>([query.trim(), folded].filter(Boolean));
  for (const entry of INN_ALIASES) {
    const names = [entry.inn, entry.ar, ...entry.aliases].map(foldSearchText);
    const hit = names.some((name) => name === folded || (folded.length >= 4 && (name.startsWith(folded) || folded.startsWith(name))));
    if (hit) {
      found.add(entry.inn);
      found.add(entry.ar);
      for (const alias of entry.aliases) found.add(alias);
    }
  }
  return [...found];
}

export function canonicalInns(query: string): string[] {
  const folded = foldSearchText(query);
  return INN_ALIASES.filter((entry) => {
    const names = [entry.inn, entry.ar, ...entry.aliases].map(foldSearchText);
    return names.some((name) => name === folded || (folded.length >= 4 && (name.startsWith(folded) || folded.startsWith(name))));
  }).map((entry) => entry.inn);
}

export type CommercialIdentity = {
  nameEn: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  brandNameEn?: string;
  barcode?: string;
};

export function commercialFingerprint(row: CommercialIdentity): string {
  const brand = foldSearchText(row.brandNameEn || row.nameEn);
  return [
    foldSearchText(row.genericName),
    foldSearchText(row.strength),
    foldSearchText(row.dosageForm),
    foldSearchText(row.manufacturer),
    brand,
  ].join('|');
}

export function isSameCommercial(left: CommercialIdentity, right: CommercialIdentity): boolean {
  if (left.barcode && right.barcode && foldSearchText(left.barcode) === foldSearchText(right.barcode)) return true;
  return commercialFingerprint(left) === commercialFingerprint(right);
}

export type DuplicateGroup = { key: string; ids: string[]; codes: string[] };

export function duplicateGroups(rows: (CommercialIdentity & { id: string; code: string })[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    const key = commercialFingerprint(row);
    if (!key.replace(/\|/g, '')) continue;
    const group = groups.get(key) ?? { key, ids: [], codes: [] };
    group.ids.push(row.id);
    group.codes.push(row.code);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.ids.length > 1);
}

export type ScoreRow = CommercialIdentity & {
  code: string;
  nameAr: string;
  brandNameAr?: string;
  modelNumber?: string;
  aliases?: string[];
  ingredients?: string[];
};

export function scoreLibraryRow(query: string, row: ScoreRow): number {
  const foldedQuery = foldSearchText(query);
  if (!foldedQuery) return 1;
  const words = foldedQuery.split(' ').filter((word) => word.length >= 2 || /^\d{2,}$/.test(word));
  if (words.length === 0) return 0;
  const expansions = new Set(expandQuery(query).map(foldSearchText).filter(Boolean));
  const fields = [
    row.code,
    row.nameEn,
    row.nameAr,
    row.genericName,
    row.brandNameEn ?? '',
    row.brandNameAr ?? '',
    row.manufacturer,
    row.strength,
    row.dosageForm,
    row.modelNumber ?? '',
    row.barcode ?? '',
    ...(row.aliases ?? []),
    ...(row.ingredients ?? []),
  ].map(foldSearchText);
  const blob = fields.join(' ');
  if (row.barcode && foldSearchText(row.barcode) === foldedQuery) return 100;
  let score = 0;
  for (const word of words) {
    const forms = [word, ...[...expansions].filter((value) => value.includes(word) || word.includes(value))];
    const direct = forms.some((form) => fields.some((field) => field === form || field.includes(form)));
    const expanded = [...expansions].some((value) => value.length >= 4 && blob.includes(value));
    if (!direct && !expanded) return 0;
    score += fields.some((field) => field === word) ? 30 : 10;
  }
  if (fields.some((field) => field === foldedQuery)) score += 40;
  return score;
}
