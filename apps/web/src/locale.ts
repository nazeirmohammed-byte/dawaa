export function directionFor(language: string): 'rtl' | 'ltr' {
  return language.toLowerCase().startsWith('ar') ? 'rtl' : 'ltr';
}

export function formatMoney(amount: string): string {
  const negative = amount.startsWith('-');
  const raw = negative ? amount.slice(1) : amount;
  const [whole, frac = '00'] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${frac.slice(0, 2).padEnd(2, '0')}`;
}

function cents(amount: string): bigint {
  const negative = amount.startsWith('-');
  const raw = negative ? amount.slice(1) : amount;
  const [whole, frac = '00'] = raw.split('.');
  const value = BigInt(whole || '0') * 100n + BigInt((frac + '00').slice(0, 2));
  return negative ? -value : value;
}

function fromCents(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function lineAmount(price: string, qty: number): string {
  return fromCents(cents(price) * BigInt(qty));
}

export function sumAmounts(amounts: string[]): string {
  return fromCents(amounts.reduce((total, amount) => total + cents(amount), 0n));
}

export function subAmount(left: string, right: string): string {
  return fromCents(cents(left) - cents(right));
}

export function percentAmount(amount: string, percentText: string): string {
  const [whole, frac = '00'] = percentText.split('.');
  const basis = BigInt(whole || '0') * 100n + BigInt((frac + '00').slice(0, 2));
  return fromCents((cents(amount) * basis) / 10000n);
}

export function formatKhartoum(iso: string, language: string): string {
  const locale = language.toLowerCase().startsWith('ar') ? 'ar-SD-u-nu-latn' : 'en-GB';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Khartoum',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
