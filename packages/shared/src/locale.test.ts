import { describe, expect, it } from 'vitest';
import { directionFor, formatKhartoum, usesWesternDigits } from './locale';

describe('locale', () => {
  it('defaults Arabic to RTL and English to LTR', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('ar-SD')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });

  it('formats Khartoum time with Western digits', () => {
    const formatted = formatKhartoum('2026-10-10T12:00:00.000Z', 'ar');
    expect(usesWesternDigits(formatted)).toBe(true);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
