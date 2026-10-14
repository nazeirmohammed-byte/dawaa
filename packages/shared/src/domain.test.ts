import { describe, expect, it } from 'vitest';
import { assertFeature, errorMessage, prefersArabic } from './domain';

describe('errors and features', () => {
  it('uses Arabic unless the request prefers English', () => {
    expect(prefersArabic(undefined)).toBe(true);
    expect(prefersArabic('ar-SD,en;q=0.8')).toBe(true);
    expect(prefersArabic('en-US,en;q=0.9')).toBe(false);
    expect(errorMessage('AUTH_INVALID_CREDENTIALS', 'en')).toMatch(/incorrect/i);
    expect(errorMessage('AUTH_INVALID_CREDENTIALS', 'ar')).toMatch(/غير صحيحة/);
  });

  it('denies a feature that the tenant flags do not include', () => {
    expect(() => assertFeature(['POS'], 'ACCOUNTING')).toThrow(/FEATURE_DISABLED/);
    expect(() => assertFeature(['ACCOUNTING'], 'ACCOUNTING')).not.toThrow();
  });
});
