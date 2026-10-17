import { describe, expect, it } from 'vitest';
import {
  canonicalInns,
  commercialFingerprint,
  duplicateGroups,
  expandQuery,
  foldSearchText,
  ingredientParts,
  isSameCommercial,
  scoreLibraryRow,
} from './library-search';

describe('global library search', () => {
  it('folds Arabic letter variants without changing the product identity key', () => {
    expect(foldSearchText('أموكسيسيلين')).toBe(foldSearchText('اموكسيسيلين'));
    expect(foldSearchText('صيدلية')).toBe('صيدليه');
  });

  it('resolves acetaminophen and the Arabic name to paracetamol', () => {
    expect(canonicalInns('Acetaminophen')).toEqual(['paracetamol']);
    expect(canonicalInns('باراسيتامول')).toEqual(['paracetamol']);
    expect(expandQuery('paracetemol').map((value) => value.toLowerCase())).toContain('paracetamol');
  });

  it('keeps branded products distinct while sharing an ingredient', () => {
    const panadol = commercialFingerprint({
      nameEn: 'Panadol',
      genericName: 'Paracetamol',
      strength: '500 mg',
      dosageForm: 'TABLET',
      manufacturer: 'GSK',
    });
    const adol = commercialFingerprint({
      nameEn: 'Adol',
      genericName: 'Paracetamol',
      strength: '500 mg',
      dosageForm: 'TABLET',
      manufacturer: 'Julphar',
    });
    expect(panadol).not.toBe(adol);
    expect(
      isSameCommercial(
        { nameEn: 'Panadol', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', manufacturer: 'GSK' },
        { nameEn: 'Panadol 500', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', manufacturer: 'GSK', brandNameEn: 'Panadol' },
      ),
    ).toBe(true);
    expect(
      isSameCommercial(
        { nameEn: 'Panadol', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', manufacturer: 'GSK', barcode: '6281001' },
        { nameEn: 'Panadol extra', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', manufacturer: 'GSK', barcode: '6281001' },
      ),
    ).toBe(true);
  });

  it('splits combination medicines into separate ingredients', () => {
    expect(ingredientParts('Amoxicillin / clavulanic acid')).toEqual(['Amoxicillin', 'clavulanic acid']);
  });

  it('ranks a synonym match and hides unrelated rows', () => {
    const panadol = scoreLibraryRow('Acetaminophen', {
      code: 'PAN-500',
      nameEn: 'Panadol',
      nameAr: 'بنادول',
      genericName: 'Paracetamol',
      strength: '500 mg',
      dosageForm: 'TABLET',
      manufacturer: 'GSK',
      ingredients: ['Paracetamol'],
    });
    const insulin = scoreLibraryRow('Acetaminophen', {
      code: 'INS-100',
      nameEn: 'Human insulin',
      nameAr: 'إنسولين',
      genericName: 'Insulin human',
      strength: '100 IU/ml',
      dosageForm: 'VIAL',
      manufacturer: 'Novo',
    });
    expect(panadol).toBeGreaterThan(0);
    expect(insulin).toBe(0);
  });

  it('groups only identical commercial fingerprints', () => {
    const groups = duplicateGroups([
      { id: '1', code: 'A', nameEn: 'Panadol', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', manufacturer: 'GSK' },
      { id: '2', code: 'B', nameEn: 'Panadol', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', manufacturer: 'GSK' },
      { id: '3', code: 'C', nameEn: 'Adol', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', manufacturer: 'Julphar' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.codes.sort()).toEqual(['A', 'B']);
  });
});
