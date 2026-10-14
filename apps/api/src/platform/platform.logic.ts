import { addMoney, money, mulMoney } from '@dawaa/shared';

const NEXT: Record<string, readonly string[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['NEED_MORE_INFO', 'VERIFIED', 'REJECTED'],
  NEED_MORE_INFO: ['UNDER_REVIEW', 'REJECTED'],
  VERIFIED: ['APPROVED', 'REJECTED'],
  APPROVED: ['TENANT_CREATED'],
  TENANT_CREATED: ['ACTIVE'],
  REJECTED: [],
  ACTIVE: [],
};

export function nextRequestStatuses(from: string): readonly string[] {
  return NEXT[from] ?? [];
}

export function assertRequestStep(from: string, to: string): void {
  if (!nextRequestStatuses(from).includes(to)) {
    throw new Error('REQUEST_STEP');
  }
}

export const BILLING_CYCLES = ['MONTHLY', 'DAILY', 'YEARLY', 'PAYG'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export function isBillingCycle(value: string): value is BillingCycle {
  return (BILLING_CYCLES as readonly string[]).includes(value);
}

export function dayPriceFromMonth(monthlyPrice: string): string {
  const cents = Math.round(Number(money(monthlyPrice)) * 100);
  return (Math.round(cents / 30) / 100).toFixed(2);
}

export function planPrices(input: { monthlyPrice: string; yearlyPrice: string; limits: string }): {
  monthlyPrice: string;
  dailyPrice: string;
  yearlyPrice: string;
  paygPrice: string;
} {
  const monthlyPrice = money(input.monthlyPrice);
  const yearlyPrice = money(input.yearlyPrice);
  const stored = limitPrices(input.limits);
  const dailyPrice = stored.dailyPrice ?? dayPriceFromMonth(monthlyPrice);
  return {
    monthlyPrice,
    dailyPrice,
    yearlyPrice,
    paygPrice: stored.paygPrice ?? dailyPrice,
  };
}

export function unitForCycle(
  prices: { monthlyPrice: string; dailyPrice: string; yearlyPrice: string; paygPrice: string },
  cycle: string,
): string {
  if (cycle === 'DAILY') return prices.dailyPrice;
  if (cycle === 'YEARLY') return prices.yearlyPrice;
  if (cycle === 'PAYG') return prices.paygPrice;
  return prices.monthlyPrice;
}

export function mergeLimitPrices(raw: string, dailyPrice: string, paygPrice: string): string {
  let bag: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) bag = { ...(parsed as Record<string, unknown>) };
  } catch {
    bag = {};
  }
  bag.dailyPrice = money(dailyPrice);
  bag.paygPrice = money(paygPrice);
  return JSON.stringify(bag);
}

function limitPrices(raw: string): { dailyPrice?: string; paygPrice?: string } {
  try {
    const parsed = JSON.parse(raw) as { dailyPrice?: unknown; paygPrice?: unknown };
    return {
      dailyPrice: priceOrEmpty(parsed.dailyPrice),
      paygPrice: priceOrEmpty(parsed.paygPrice),
    };
  } catch {
    return {};
  }
}

function priceOrEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  return money(value);
}

export function subscriptionCharge(
  planCode: string,
  monthlyPrice: string,
  headOfficeFee: string,
  branchCount: number,
): string {
  if (planCode === 'CHAIN') {
    return addMoney(mulMoney(money(monthlyPrice), String(branchCount)), money(headOfficeFee));
  }
  return money(monthlyPrice);
}

export function canActivateTenant(verificationStatus: string, roleCode: string, overrideReason: string): boolean {
  if (verificationStatus === 'VALID') return true;
  return roleCode === 'SUPER_ADMIN' && overrideReason.trim().length >= 3;
}

export function canLinkExpiredPartner(roleCode: string, reason: string): boolean {
  return roleCode === 'SUPER_ADMIN' && reason.trim().length >= 3;
}

export function licenseNeedsAlert(expiresOn: Date, now: Date, withinDays = 30): boolean {
  return expiresOn.getTime() - now.getTime() <= withinDays * 24 * 60 * 60 * 1000;
}

export type CatalogPush = {
  nameAr: string;
  nameEn: string;
  genericName: string;
  form: string;
  strength: string;
  manufacturer: string;
  country: string;
  atcCode: string;
  gtin: string;
  isControlled: boolean;
  requiresPrescription: boolean;
};

export function catalogPushPatch(item: CatalogPush): CatalogPush {
  return {
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    genericName: item.genericName,
    form: item.form,
    strength: item.strength,
    manufacturer: item.manufacturer,
    country: item.country,
    atcCode: item.atcCode,
    gtin: item.gtin,
    isControlled: item.isControlled,
    requiresPrescription: item.requiresPrescription,
  };
}
