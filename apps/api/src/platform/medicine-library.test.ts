import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOSAGE_FORMS, MEDICINE_LIBRARY, WORLD_CATEGORIES, libraryCoverage } from './medicine-library';

describe('medicine library', () => {
  it('covers every dosage form and every world category', () => {
    const coverage = libraryCoverage(MEDICINE_LIBRARY);
    expect(coverage.missingForms).toEqual([]);
    expect(coverage.missingCategories).toEqual([]);
    expect(new Set(MEDICINE_LIBRARY.map((row) => row.form)).size).toBe(DOSAGE_FORMS.length);
    expect(new Set(MEDICINE_LIBRARY.map((row) => row.atcCode.charAt(0))).size).toBe(WORLD_CATEGORIES.length);
  });

  it('ships the international substance list with Arabic names where published', () => {
    const rows = JSON.parse(readFileSync(join(process.cwd(), 'src/platform/data/medicine-catalog.json'), 'utf8')) as {
      nameEn: string;
      nameAr: string;
      genericName: string;
    }[];
    const arabic = rows.filter((row) => /[\u0600-\u06FF]/.test(row.nameAr)).length;
    expect(rows.length).toBeGreaterThan(3000);
    expect(arabic).toBeGreaterThan(2000);
    expect(rows.every((row) => row.nameEn.length > 1 && row.genericName.length > 1)).toBe(true);
  });

  it('keeps a scientific name, manufacturer, dose, and ingredients on every row', () => {
    for (const row of MEDICINE_LIBRARY) {
      expect(row.genericName.length).toBeGreaterThan(1);
      expect(row.manufacturer.length).toBeGreaterThan(1);
      expect(row.strength.length).toBeGreaterThan(0);
      expect(row.ingredients.length).toBeGreaterThan(1);
      expect(row.code.startsWith('LIB-')).toBe(true);
    }
  });
});
