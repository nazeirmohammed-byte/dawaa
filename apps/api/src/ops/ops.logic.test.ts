import { describe, expect, it } from 'vitest';
import { allocateFefo, assertJournalBalances, balanceDelta, barHeights, buildHome, daySpan, daysUntil, priceListWorkflow, renewAmount } from './ops.logic';

const today = '2026-10-10';

describe('allocateFefo', () => {
  it('takes the earliest unexpired batch and skips expired stock', () => {
    const takes = allocateFefo(
      [
        { id: 'expired', qtyBase: 50, expiry: '2026-10-01T00:00:00.000Z' },
        { id: 'later', qtyBase: 10, expiry: '2027-01-01T00:00:00.000Z' },
        { id: 'soon', qtyBase: 4, expiry: '2026-11-01T00:00:00.000Z' },
      ],
      6,
      today,
    );
    expect(takes).toEqual([
      { id: 'soon', take: 4 },
      { id: 'later', take: 2 },
    ]);
  });

  it('refuses a quantity the unexpired batches cannot cover', () => {
    expect(() => allocateFefo([{ id: 'a', qtyBase: 1, expiry: '2026-12-01T00:00:00.000Z' }], 2, today)).toThrow(
      'STOCK_SHORT',
    );
  });
});

describe('journal balance', () => {
  it('accepts equal debits and credits', () => {
    expect(() =>
      assertJournalBalances([
        { debit: '4500.00', credit: '0.00' },
        { debit: '0.00', credit: '4500.00' },
      ]),
    ).not.toThrow();
  });

  it('rejects an unbalanced entry', () => {
    expect(() => assertJournalBalances([{ debit: '10.00', credit: '0.00' }])).toThrow('UNBALANCED');
  });

  it('scales chart bars from decimal strings and keeps a seven-day span', () => {
    expect(daySpan('2026-10-11', 7)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(barHeights(['0.00', '50.00', '100.00'])).toEqual([0, 50, 100]);
    expect(daysUntil('2026-10-11', '2026-10-01')).toBe(-10);
  });

  it('builds the home board from posted sales without dropping cents', () => {
    const home = buildHome({
      today: '2026-10-11',
      branches: [{ id: 'main', nameAr: 'الرئيسي', nameEn: 'Main' }],
      sales: [
        {
          branchId: 'main',
          soldAt: '2026-10-11T08:00:00.000Z',
          total: '10.50',
          docNo: 'S-1',
          customerName: 'نقدي',
          paymentMethod: 'CASH',
          status: 'POSTED',
        },
        {
          branchId: 'main',
          soldAt: '2026-10-10T08:00:00.000Z',
          total: '1.00',
          docNo: 'S-0',
          customerName: 'نقدي',
          paymentMethod: 'CASH',
          status: 'POSTED',
        },
      ],
      purchases: [
        {
          orderedAt: '2026-10-02T08:00:00.000Z',
          total: '20.00',
          docNo: 'P-1',
          status: 'RECEIVED',
          supplierAr: 'مورد',
          supplierEn: 'Supplier',
        },
      ],
      expenses: [{ spentAt: '2026-10-11T09:00:00.000Z', amount: '3.25' }],
      suppliers: [{ balance: '20.00' }],
      customers: [{ nameAr: 'أحمد', nameEn: 'Ahmed', balance: '5.00' }],
      lots: [{ branchId: 'main', productId: 'p1', batchNo: 'B1', expiry: '2026-09-01T00:00:00.000Z', qtyBase: 2 }],
      products: [
        {
          id: 'p1',
          nameAr: 'دواء',
          nameEn: 'Drug',
          genericName: 'gen',
          sku: 'SKU',
          form: 'قرص',
          sellPrice: '10.50',
          qty: 2,
          reorderLevel: 5,
        },
      ],
    });
    expect(home.salesToday).toBe('10.50');
    expect(home.purchasesMonth).toBe('20.00');
    expect(home.accounts.paymentsToday).toBe('3.25');
    expect(home.accounts.customerDue).toBe('5.00');
    expect(home.expiredCount).toBe(1);
    expect(home.lowCount).toBe(1);
    expect(home.days).toHaveLength(7);
    expect(home.days[6]?.total).toBe('10.50');
  });

  it('moves asset and income balances in opposite directions', () => {
    expect(balanceDelta('ASSET', '4500.00', '0.00')).toBe('4500.00');
    expect(balanceDelta('ASSET', '0.00', '2800.00')).toBe('-2800.00');
    expect(balanceDelta('INCOME', '0.00', '4500.00')).toBe('4500.00');
  });
});

describe('price list operations', () => {
  it('lets an unused draft be edited, activated, and deleted', () => {
    expect(
      priceListWorkflow({ status: 'DRAFT', usedOnSales: false, canManage: true, canActivateHere: true, isSelling: false }),
    ).toEqual({ allowedActions: ['edit', 'activate', 'delete'], lockReason: 'draft' });
  });

  it('freezes a selling list and offers renew plus deactivate', () => {
    expect(
      priceListWorkflow({ status: 'ACTIVE', usedOnSales: true, canManage: true, canActivateHere: true, isSelling: true }),
    ).toEqual({ allowedActions: ['deactivate', 'renew'], lockReason: 'usedOnSales' });
  });

  it('renews an archived list without reopening it for edits', () => {
    expect(
      priceListWorkflow({ status: 'ARCHIVED', usedOnSales: false, canManage: true, canActivateHere: false, isSelling: false }),
    ).toEqual({ allowedActions: ['renew'], lockReason: 'active' });
  });

  it('keeps, raises by percent, or adds a fixed amount', () => {
    expect(renewAmount('100.00', 'SAME', '0')).toBe('100.00');
    expect(renewAmount('100.00', 'PCT', '10')).toBe('110.00');
    expect(renewAmount('100.00', 'AMOUNT', '2.50')).toBe('102.50');
    expect(() => renewAmount('1.00', 'AMOUNT', '-5')).toThrow('PRICE');
  });
});
