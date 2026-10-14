import { describe, expect, it } from 'vitest';
import { addMoney, cmpMoney, money, MoneyError, mulMoney, roundToIncrement, subMoney, toBaseUnits } from './money';

describe('money', () => {
  it('keeps scale 2 without binary float residue', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(subMoney('12000.00', '0.01')).toBe('11999.99');
    expect(money('10')).toBe('10.00');
  });

  it('rejects JavaScript numbers at compile time and blank strings at runtime', () => {
    expect(() => money('')).toThrow(MoneyError);
    expect(() => addMoney('nope', '1.00')).toThrow(MoneyError);
  });

  it('multiplies and compares decimal strings', () => {
    expect(mulMoney('1800.00', '40')).toBe('72000.00');
    expect(cmpMoney('5000.00', '4500.00')).toBeGreaterThan(0);
    expect(cmpMoney('10.00', '10')).toBe(0);
  });

  it('rounds half-up to the nearest increment', () => {
    expect(roundToIncrement('1024', '50')).toBe('1000.00');
    expect(roundToIncrement('1025', '50')).toBe('1050.00');
    expect(roundToIncrement('1000', '50')).toBe('1000.00');
    expect(() => roundToIncrement('10', '0')).toThrow(MoneyError);
  });

  it('converts packaging to integer base units', () => {
    expect(toBaseUnits('3', '10')).toBe('30');
    expect(toBaseUnits('0', '10')).toBe('0');
    expect(() => toBaseUnits('1.5', '10')).toThrow(MoneyError);
    expect(() => toBaseUnits('-1', '10')).toThrow(MoneyError);
    expect(() => toBaseUnits('1', '0')).toThrow(MoneyError);
  });
});
