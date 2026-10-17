import { describe, expect, it } from 'vitest';
import { SUDAN_SUPPLIERS, isSystemSupplier, missingSudanSuppliers } from './sudan-suppliers';

describe('Sudan supplier catalog', () => {
  it('lists each company once, with a phone that fits the supplier column', () => {
    const names = SUDAN_SUPPLIERS.map((row) => row.nameEn);
    expect(new Set(names).size).toBe(names.length);
    expect(SUDAN_SUPPLIERS.length).toBeGreaterThan(10);
    for (const row of SUDAN_SUPPLIERS) {
      expect(row.nameAr.trim().length).toBeGreaterThan(1);
      expect(row.city.trim().length).toBeGreaterThan(1);
      if (row.phone) expect(row.phone.length).toBeLessThanOrEqual(20);
    }
  });

  it('adds only the companies the pharmacy does not already have', () => {
    const missing = missingSudanSuppliers(['Amipharma', 'Azal Pharmaceutical Industries']);
    expect(missing.some((row) => row.nameEn === 'Amipharma')).toBe(false);
    expect(missing.some((row) => row.nameEn === 'Hikma')).toBe(true);
    expect(isSystemSupplier('Hikma')).toBe(true);
    expect(isSystemSupplier('Demo supplier 1')).toBe(false);
  });
});
