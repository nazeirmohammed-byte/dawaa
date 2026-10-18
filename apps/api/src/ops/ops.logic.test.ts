import { describe, expect, it } from 'vitest';
import { allocateFefo, allocateReceiptCosts, assertJournalBalances, balanceDelta, barHeights, buildHome, canStockReceipt, claimReceiptQty, claimStockQty, duplicateActivePharmacyListIds, inventoryDocNo, manufacturerBatch, orderStockState, placeCompatible, priceChangePct, qtyToStockPieces, remainingToStock, resolveSellingPriceListId, suggestPlace, summarizeStocking, usdSellingPrice, daySpan, daysUntil, isSellableLot, containerUnitPrice, pieceUnitCost, priceListDateGate, priceListWorkflow, renewAmount, saleChoices, type StockCandidate } from './ops.logic';

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

describe('goods receipt rules', () => {
  it('keeps rejected and expired lots out of sellable stock', () => {
    expect(isSellableLot({ qtyBase: 5, expiry: '2027-01-01', condition: 'AVAILABLE' }, today)).toBe(true);
    expect(isSellableLot({ qtyBase: 5, expiry: '2020-01-01', condition: 'AVAILABLE' }, today)).toBe(false);
    expect(isSellableLot({ qtyBase: 5, expiry: '2027-01-01', condition: 'QUARANTINE' }, today)).toBe(false);
    expect(isSellableLot({ qtyBase: 5, expiry: '2027-01-01', condition: 'DAMAGED' }, today)).toBe(false);
  });

  it('allows a partial receipt and blocks an over-receipt unless overridden', () => {
    const buckets = [{ id: 'line', productId: 'med', ordered: 10, received: 4 }];
    expect(claimReceiptQty(buckets, 'med', 3, false)).toEqual([{ id: 'line', take: 3 }]);
    expect(buckets[0]?.received).toBe(7);
    expect(() => claimReceiptQty(buckets, 'med', 5, false)).toThrow('OVER_RECEIVE');
    expect(buckets[0]?.received).toBe(7);
    const forced = claimReceiptQty([{ id: 'line', productId: 'med', ordered: 10, received: 7 }], 'med', 5, true);
    expect(forced.reduce((sum, take) => sum + take.take, 0)).toBe(5);
  });

  it('rejects a medicine that is not on the purchase order', () => {
    expect(() => claimReceiptQty([{ id: 'line', productId: 'med', ordered: 2, received: 0 }], 'other', 1, false)).toThrow(
      'NOT_ON_ORDER',
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

describe('procurement to inventory posting', () => {
  const received: StockCandidate = {
    poStatus: 'RECEIVED',
    receiptStatus: 'POSTED',
    source: 'PROCUREMENT',
    condition: 'AVAILABLE',
    expiry: '2027-06-01',
    received: 100,
    posted: 0,
  };

  it('hides an approved order that has not been physically received', () => {
    expect(canStockReceipt({ ...received, poStatus: 'ORDERED', receiptStatus: 'DRAFT', received: 0 }, today)).toBe(false);
    expect(canStockReceipt({ ...received, poStatus: 'ORDERED', receiptStatus: 'POSTED' }, today)).toBe(false);
  });

  it('shows a received line and keeps the remainder after a partial post', () => {
    expect(canStockReceipt(received, today)).toBe(true);
    expect(claimStockQty(100, 0, 40)).toBe(40);
    expect(remainingToStock(100, 40)).toBe(60);
    expect(canStockReceipt({ ...received, poStatus: 'PARTIAL', posted: 40 }, today)).toBe(true);
    expect(canStockReceipt({ ...received, posted: 100 }, today)).toBe(false);
    expect(orderStockState([{ condition: 'AVAILABLE', received: 100, posted: 40 }])).toBe('PARTIAL');
    expect(orderStockState([{ condition: 'AVAILABLE', received: 100, posted: 100 }])).toBe('STOCKED');
  });

  it('rejects a second claim once the received quantity is already posted', () => {
    expect(() => claimStockQty(50, 50, 1)).toThrow('OVER_POST');
    expect(() => claimStockQty(50, 0, 51)).toThrow('OVER_POST');
  });

  it('excludes cancelled, rejected, expired, opening, and draft lines', () => {
    expect(canStockReceipt({ ...received, poStatus: 'CANCELLED' }, today)).toBe(false);
    expect(canStockReceipt({ ...received, condition: 'REJECTED' }, today)).toBe(false);
    expect(canStockReceipt({ ...received, condition: 'QUARANTINE' }, today)).toBe(false);
    expect(canStockReceipt({ ...received, expiry: '2020-01-01' }, today)).toBe(false);
    expect(canStockReceipt({ ...received, source: 'OPENING' }, today)).toBe(false);
    expect(canStockReceipt({ ...received, receiptStatus: 'DRAFT' }, today)).toBe(false);
  });

  it('uses one summary for procurement and inventory counts', () => {
    const summary = summarizeStocking({
      orders: [{ status: 'ORDERED' }, { status: 'RECEIVED' }, { status: 'PARTIAL' }],
      lines: [received, { ...received, posted: 100 }, { ...received, condition: 'REJECTED' }],
      today,
    });
    expect(summary).toEqual({ pendingReceipts: 2, receivedLines: 3, awaitingPosting: 1, fullyStocked: 1, pendingQty: 100 });
  });

  it('stores a blank manufacturer batch as N/A and keeps a written batch', () => {
    expect(manufacturerBatch('')).toBe('N/A');
    expect(manufacturerBatch('  ')).toBe('N/A');
    expect(manufacturerBatch('OPEN')).toBe('N/A');
    expect(manufacturerBatch('n/a')).toBe('N/A');
    expect(manufacturerBatch(' LOT-19 ')).toBe('LOT-19');
  });

  it('generates a tenant inventory reference without replacing the manufacturer batch', () => {
    expect(inventoryDocNo(2026, 125)).toBe('INV-2026-000125');
    expect(inventoryDocNo(2026, 125)).not.toBe('PCM-001');
  });

  it('suggests the previous place and warns when a cold medicine leaves the fridge', () => {
    expect(suggestPlace('أنسولين', null)).toBe('FRIDGE');
    expect(suggestPlace('أنسولين', 'A1')).toBe('A1');
    expect(placeCompatible('COLD', 'A1')).toBe(false);
    expect(placeCompatible('COLD', 'FRIDGE')).toBe(true);
    expect(placeCompatible('NORMAL', 'A1')).toBe(true);
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

  it('prices a strip as the box price divided by the strips in the box', () => {
    const pack = { outer: 'BOX' as const, inner: 'STRIP' as const, perBox: 10, perInner: 10 };
    expect(saleChoices(pack)).toEqual([
      { unit: 'BOX', pieces: 100, divide: 1 },
      { unit: 'STRIP', pieces: 10, divide: 10 },
      { unit: 'PIECE', pieces: 1, divide: 100 },
    ]);
    expect(containerUnitPrice('1000.00', 1)).toBe('1000.00');
    expect(containerUnitPrice('1000.00', 10)).toBe('100.00');
    expect(containerUnitPrice('1000.00', 100)).toBe('10.00');
    expect(pieceUnitCost('1000.00', pack)).toBe('10.00');
    expect(qtyToStockPieces(10, pack, 'BOX')).toBe(1000);
    expect(qtyToStockPieces(5, pack, 'STRIP')).toBe(50);
    expect(qtyToStockPieces(2000, null, 'PIECE')).toBe(2000);
    expect(saleChoices(null)).toEqual([{ unit: 'PIECE', pieces: 1, divide: 1 }]);
  });

  it('allows today or a later day and refuses a back date', () => {
    expect(priceListDateGate({ nextOn: '2026-10-18', today: '2026-10-18' })).toBe('ok');
    expect(priceListDateGate({ nextOn: '2026-10-19', today: '2026-10-18' })).toBe('ok');
    expect(priceListDateGate({ nextOn: '2026-10-17', today: '2026-10-18' })).toBe('PRICE_DATE');
  });

  it('keeps, raises by percent, or adds a fixed amount', () => {
    expect(renewAmount('100.00', 'SAME', '0')).toBe('100.00');
    expect(renewAmount('100.00', 'PCT', '10')).toBe('110.00');
    expect(renewAmount('100.00', 'AMOUNT', '2.50')).toBe('102.50');
    expect(() => renewAmount('1.00', 'AMOUNT', '-5')).toThrow('PRICE');
  });

  it('keeps the receipt cost in SDG and proposes a USD selling price without rounding', () => {
    const [line] = allocateReceiptCosts([{ qty: 2, unitCost: '2.00' }], {
      currency: 'USD',
      rate: '2700.00',
      discount: '0.00',
      tax: '0.00',
      charges: '0.00',
    });
    expect(line.foreignUnit).toBe('2.00');
    expect(line.sdgUnit).toBe('5400.00');
    expect(line.sdgTotal).toBe('10800.00');
    expect(usdSellingPrice('2.00', '2700.00')).toBe('5400.00');
    expect(priceChangePct('5000.00', '5400.00')).toBe('8.00');
    expect(usdSellingPrice('0.00', '2700.00')).toBeNull();
  });
});

describe('selling price list', () => {
  it('prefers a branch activation over the pharmacy-wide list', () => {
    const id = resolveSellingPriceListId({
      branchId: 'b1',
      lists: [
        { id: 'shared', scope: 'PHARMACY', status: 'ACTIVE', isActive: true, activatedAt: '2026-10-01', createdAt: '2026-09-01' },
        { id: 'branch', scope: 'BRANCH', status: 'ACTIVE', isActive: false, activatedAt: '2026-10-02', createdAt: '2026-09-02' },
      ],
      branchLinks: [{ branchId: 'b1', priceListId: 'branch', isActive: true, activatedAt: '2026-10-02' }],
    });
    expect(id).toBe('branch');
  });

  it('uses the newest pharmacy-wide list when no branch override exists', () => {
    const id = resolveSellingPriceListId({
      branchId: 'b1',
      lists: [
        { id: 'old', scope: 'PHARMACY', status: 'ACTIVE', isActive: true, activatedAt: '2026-09-01', createdAt: '2026-08-01' },
        { id: 'new', scope: 'PHARMACY', status: 'ACTIVE', isActive: true, activatedAt: '2026-10-01', createdAt: '2026-09-01' },
      ],
      branchLinks: [],
    });
    expect(id).toBe('new');
    expect(duplicateActivePharmacyListIds([
      { id: 'old', scope: 'PHARMACY', status: 'ACTIVE', isActive: true, activatedAt: '2026-09-01', createdAt: '2026-08-01' },
      { id: 'new', scope: 'PHARMACY', status: 'ACTIVE', isActive: true, activatedAt: '2026-10-01', createdAt: '2026-09-01' },
    ])).toEqual(['old']);
  });
});
