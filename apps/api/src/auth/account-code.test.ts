import { describe, expect, it } from 'vitest';
import { accountCodeShape, cleanAccountCode } from './account-code';

describe('tenant account code', () => {
  it('keeps letters and digits and drops the rest', () => {
    expect(cleanAccountCode(' dw-99 ')).toBe('DW99');
  });

  it('accepts a code that starts with a letter and has 4 to 16 characters', () => {
    expect(accountCodeShape('DW0008')).toBe(true);
    expect(accountCodeShape('NILE1')).toBe(true);
    expect(accountCodeShape('12AB')).toBe(false);
    expect(accountCodeShape('AB')).toBe(false);
  });
});
