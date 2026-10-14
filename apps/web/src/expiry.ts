export function plusMonths(from: Date, months: number): string {
  const date = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function defaultShelfExpiry(): string {
  return plusMonths(new Date(), 36);
}

export function expiryTone(iso: string | null | undefined): 'ok' | 'soon' | 'bad' | '' {
  if (!iso) return '';
  const end = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(end.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (days <= 30) return 'bad';
  if (days <= 180) return 'soon';
  return 'ok';
}

function gs1Date(value: string | undefined): string | undefined {
  if (!value || value.length !== 6) return undefined;
  const year = 2000 + Number(value.slice(0, 2));
  const month = value.slice(2, 4);
  const day = value.slice(4, 6) === '00' ? '01' : value.slice(4, 6);
  return `${year}-${month}-${day}`;
}

export function parseGs1(raw: string): { gtin?: string; batch?: string; expiry?: string; manufactured?: string; serial?: string } | null {
  const text = raw.trim();
  if (!/\((01|10|11|17|21)\)/.test(text)) return null;
  const gtin = text.match(/\(01\)(\d{14})/)?.[1];
  const batch = text.match(/\(10\)([^()]+)/)?.[1]?.trim();
  const expiry = gs1Date(text.match(/\(17\)(\d{6})/)?.[1]);
  const manufactured = gs1Date(text.match(/\(11\)(\d{6})/)?.[1]);
  const serial = text.match(/\(21\)([^()]+)/)?.[1]?.trim();
  if (!gtin && !batch && !expiry && !manufactured && !serial) return null;
  return { gtin, batch, expiry, manufactured, serial };
}
