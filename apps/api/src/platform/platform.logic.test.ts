import { describe, expect, it } from 'vitest';
import {
  assertRequestStep,
  canActivateTenant,
  canLinkExpiredPartner,
  catalogPushPatch,
  dayPriceFromMonth,
  licenseNeedsAlert,
  mergeLimitPrices,
  systemHealthCounts,
  planPrices,
  subscriptionCharge,
  unitForCycle,
} from './platform.logic';

describe('subscription requests', () => {
  it('walks the approval path and blocks a skip', () => {
    expect(() => assertRequestStep('SUBMITTED', 'UNDER_REVIEW')).not.toThrow();
    expect(() => assertRequestStep('UNDER_REVIEW', 'VERIFIED')).not.toThrow();
    expect(() => assertRequestStep('VERIFIED', 'APPROVED')).not.toThrow();
    expect(() => assertRequestStep('APPROVED', 'TENANT_CREATED')).not.toThrow();
    expect(() => assertRequestStep('TENANT_CREATED', 'ACTIVE')).not.toThrow();
    expect(() => assertRequestStep('SUBMITTED', 'ACTIVE')).toThrow('REQUEST_STEP');
  });
});

describe('activation and partners', () => {
  it('keeps an unverified tenant inactive unless a super admin records a reason', () => {
    expect(canActivateTenant('PENDING', 'TENANT_APPROVAL_MANAGER', 'override')).toBe(false);
    expect(canActivateTenant('PENDING', 'SUPER_ADMIN', '')).toBe(false);
    expect(canActivateTenant('PENDING', 'SUPER_ADMIN', 'license checked offline')).toBe(true);
    expect(canActivateTenant('VALID', 'BILLING_MANAGER', '')).toBe(true);
  });

  it('blocks an expired partner unless a super admin records a reason', () => {
    expect(canLinkExpiredPartner('SUPPORT_ADMIN', 'needed')).toBe(false);
    expect(canLinkExpiredPartner('SUPER_ADMIN', 'contract renewed verbally')).toBe(true);
  });

  it('alerts on a license that expires within 30 days', () => {
    const now = new Date('2026-10-11T00:00:00Z');
    expect(licenseNeedsAlert(new Date('2026-11-01T00:00:00Z'), now)).toBe(true);
    expect(licenseNeedsAlert(new Date('2027-01-01T00:00:00Z'), now)).toBe(false);
  });
});

describe('catalog money and push', () => {
  it('prices a chain from decimal strings', () => {
    expect(subscriptionCharge('BASIC', '12000.00', '0.00', 1)).toBe('12000.00');
    expect(subscriptionCharge('CHAIN', '21000.00', '30000.00', 2)).toBe('72000.00');
  });

  it('keeps a configured day, year, and pay-as-you-go price beside the monthly price', () => {
    expect(dayPriceFromMonth('12000.00')).toBe('400.00');
    const prices = planPrices({ monthlyPrice: '12000.00', yearlyPrice: '120000.00', limits: '{"maxBranches":1}' });
    expect(prices.dailyPrice).toBe('400.00');
    expect(prices.paygPrice).toBe('400.00');
    const saved = mergeLimitPrices('{"maxBranches":1}', '350.00', '15.00');
    const next = planPrices({ monthlyPrice: '12000.00', yearlyPrice: '100000.00', limits: saved });
    expect(next.dailyPrice).toBe('350.00');
    expect(next.paygPrice).toBe('15.00');
    expect(JSON.parse(saved).maxBranches).toBe(1);
    expect(unitForCycle(next, 'YEARLY')).toBe('100000.00');
    expect(unitForCycle(next, 'PAYG')).toBe('15.00');
    expect(unitForCycle(next, 'DAILY')).toBe('350.00');
    expect(unitForCycle(next, 'MONTHLY')).toBe('12000.00');
  });

  it('pushes catalog text without prices or stock', () => {
    const patch = catalogPushPatch({
      nameAr: 'أموكسيسيلين',
      nameEn: 'Amoxicillin',
      genericName: 'Amoxicillin',
      form: 'TABLET',
      strength: '500 mg',
      manufacturer: 'Local',
      country: 'SD',
      atcCode: 'J01CA04',
      gtin: '123',
      isControlled: false,
      requiresPrescription: true,
    });
    expect(patch).not.toHaveProperty('sellPrice');
    expect(patch).not.toHaveProperty('qty');
    expect(patch.nameAr).toBe('أموكسيسيلين');
  });
});

describe('platform system health', () => {
  it('counts subscription and payment risk from real rows', () => {
    const health = systemHealthCounts({
      today: '2026-10-15',
      tenants: [
        { status: 'SUSPENDED', readOnly: true },
        { status: 'ACTIVE', readOnly: false },
      ],
      subscriptions: [
        { status: 'ACTIVE', endsOn: '2026-10-20' },
        { status: 'ACTIVE', endsOn: '2027-01-01' },
        { status: 'TRIAL', endsOn: '2026-10-01' },
      ],
      invoices: [
        { status: 'ISSUED', dueOn: '2026-10-01' },
        { status: 'FAILED', dueOn: '2026-10-20' },
        { status: 'PAID', dueOn: '2026-09-01' },
      ],
      rejectedProofs: 1,
    });
    expect(health.suspended).toBe(1);
    expect(health.readOnly).toBe(1);
    expect(health.expiringSubscriptions).toBe(1);
    expect(health.failedPayments).toBe(2);
    expect(health.overdueInvoices).toBe(1);
  });
});
