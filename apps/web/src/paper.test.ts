import { describe, expect, it } from 'vitest';
import { THERMAL_WIDTH_MM } from './paper';

describe('thermal paper', () => {
  it('uses the smallest common heat-printer width', () => {
    expect(THERMAL_WIDTH_MM).toBe(58);
  });
});
