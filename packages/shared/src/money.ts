import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const SCALE = 2;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function parseDecimal(value: string, label: string): Decimal {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MoneyError(`${label} must be a decimal string`);
  }
  try {
    return new Decimal(value);
  } catch {
    throw new MoneyError(`${label} is not a decimal`);
  }
}

export function money(value: string): string {
  return parseDecimal(value, 'amount').toFixed(SCALE);
}

export function addMoney(left: string, right: string): string {
  return parseDecimal(left, 'amount').plus(parseDecimal(right, 'amount')).toFixed(SCALE);
}

export function subMoney(left: string, right: string): string {
  return parseDecimal(left, 'amount').minus(parseDecimal(right, 'amount')).toFixed(SCALE);
}

export function mulMoney(amount: string, qty: string): string {
  return parseDecimal(amount, 'amount').times(parseDecimal(qty, 'qty')).toFixed(SCALE);
}

/** Price after a signed percent. `15` is +15%, `-10` is −10%. */
export function applyPercent(amount: string, percentPoints: string): string {
  const base = parseDecimal(amount, 'amount');
  const points = parseDecimal(percentPoints, 'percent');
  return base.mul(new Decimal(1).plus(points.div(100))).toFixed(SCALE);
}

export function cmpMoney(left: string, right: string): number {
  return parseDecimal(left, 'amount').cmp(parseDecimal(right, 'amount'));
}

/** Half-up to the nearest increment. Increment and amount are decimal strings. */
export function roundToIncrement(amount: string, increment: string): string {
  const value = parseDecimal(amount, 'amount');
  const step = parseDecimal(increment, 'increment');
  if (step.lte(0)) {
    throw new MoneyError('increment must be positive');
  }
  const units = value.div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return units.mul(step).toFixed(SCALE);
}

/** Integer sale/purchase quantity × integer factor = base-unit quantity. */
export function toBaseUnits(quantity: string, factor: string): string {
  const qty = parseDecimal(quantity, 'quantity');
  const fac = parseDecimal(factor, 'factor');
  if (!qty.isInteger() || !fac.isInteger()) {
    throw new MoneyError('quantity and factor must be integers');
  }
  if (qty.isNegative() || fac.lte(0)) {
    throw new MoneyError('quantity must be >= 0 and factor must be > 0');
  }
  return qty.mul(fac).toFixed(0);
}
