import { describe, expect, it } from 'vitest';
import { toErrorBody } from './error-body';

describe('toErrorBody', () => {
  it('returns Arabic by default and English when requested', () => {
    expect(toErrorBody('UNAUTHORIZED', undefined).message).toMatch(/تسجيل الدخول/);
    expect(toErrorBody('UNAUTHORIZED', 'en').messageKey).toBe('errors.UNAUTHORIZED');
    expect(toErrorBody('UNAUTHORIZED', 'en').message).toMatch(/Sign in/);
  });
});
