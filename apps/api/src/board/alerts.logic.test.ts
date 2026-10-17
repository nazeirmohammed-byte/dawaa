import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  addDays,
  defaultAlertSettings,
  allowedCategories,
  assertAlertSetting,
  buildCharts,
  canConfigureAlerts,
  evaluateAlerts,
  planNotices,
  planSync,
  snoozeAllowed,
  sortAlerts,
  summaryCards,
  thresholdsFrom,
  type AlertFacts,
  type AlertDraft,
} from './alerts.logic';

const TODAY = '2026-10-15';

function blank(patch: Partial<AlertFacts> = {}): AlertFacts {
  return {
    today: TODAY,
    thresholds: { ...DEFAULT_THRESHOLDS, expiryDays: [...DEFAULT_THRESHOLDS.expiryDays] },
    branches: [{ id: 'b1', nameAr: 'الرئيسي', nameEn: 'Main' }],
    products: [],
    lots: [],
    movements: [],
    sales: [],
    lines: [],
    purchases: [],
    purchaseLines: [],
    receipts: [],
    receiptLines: [],
    suppliers: [],
    customers: [],
    prices: [],
    priceChanges: [],
    lists: [],
    knownUserIds: ['user-1'],
    tenantStatus: 'ACTIVE',
    readOnly: false,
    subscriptionEnd: null,
    subscriptionInvoices: [],
    ...patch,
  };
}

function product(id: string, patch: Partial<AlertFacts['products'][number]> = {}): AlertFacts['products'][number] {
  return {
    id,
    sku: id.toUpperCase(),
    nameAr: id,
    nameEn: id,
    reorderLevel: 10,
    sellPrice: '20.00',
    costPrice: '10.00',
    createdOn: '2025-01-01',
    ...patch,
  };
}

function lot(id: string, productId: string, patch: Partial<AlertFacts['lots'][number]> = {}): AlertFacts['lots'][number] {
  return {
    id,
    branchId: 'b1',
    productId,
    batchNo: `B-${id}`,
    expiry: '2027-06-01',
    qty: 10,
    condition: 'AVAILABLE',
    unitCost: '10.00',
    ...patch,
  };
}

function fill(productId: string, from: string, to: string, qty: number): AlertFacts['lines'] {
  const lines: AlertFacts['lines'] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    lines.push({ saleId: `${productId}-${day}`, productId, branchId: 'b1', on: day, qty, lineTotal: '20.00', costTotal: '10.00', discount: '0.00' });
  }
  return lines;
}

function codes(rows: AlertDraft[]): string[] {
  return rows.map((row) => row.code).sort();
}

describe('pharmacy alert evaluation', () => {
  it('raises stock, discrepancy, and adjustment alerts from quantities and movements', () => {
    const rows = evaluateAlerts(blank({
      products: [
        product('out'),
        product('low', { reorderLevel: 8 }),
        product('min', { reorderLevel: 12 }),
        product('neg'),
        product('hold'),
        product('gap'),
        product('match'),
        product('quiet'),
      ],
      lots: [
        lot('low', 'low', { qty: 8 }),
        lot('min', 'min', { qty: 4 }),
        lot('neg', 'neg', { qty: -3 }),
        lot('hold', 'hold', { qty: 2, condition: 'QUARANTINE' }),
        lot('gap', 'gap', { qty: 5 }),
        lot('match', 'match', { qty: 4 }),
        lot('quiet', 'quiet', { qty: 6 }),
      ],
      movements: [
        { lotId: 'gap', productId: 'gap', branchId: 'b1', type: 'RECEIVE', qty: 8, on: '2026-09-01' },
        { lotId: 'match', productId: 'match', branchId: 'b1', type: 'RECEIVE', qty: 4, on: '2026-09-01' },
        { lotId: 'gap', productId: 'gap', branchId: 'b1', type: 'ADJUST', qty: -12, on: '2026-10-10' },
      ],
    }));
    expect(codes(rows)).toEqual(expect.arrayContaining(['OUT_OF_STOCK', 'LOW_STOCK', 'BELOW_MIN', 'NEGATIVE', 'UNAVAILABLE', 'DISCREPANCY', 'ADJUST']));
    expect(rows.some((row) => row.code === 'DISCREPANCY' && row.entityId === 'match')).toBe(false);
    expect(rows.some((row) => row.code === 'DISCREPANCY' && row.entityId === 'quiet')).toBe(false);
    expect(rows.find((row) => row.code === 'NEGATIVE')?.severity).toBe('critical');
  });

  it('predicts a near stockout only when the sales history is long enough', () => {
    const ready = evaluateAlerts(blank({
      products: [product('para', { reorderLevel: 40 })],
      lots: [lot('p', 'para', { qty: 10 })],
      lines: fill('para', addDays(TODAY, -29), TODAY, 2),
    }));
    const near = ready.find((row) => row.code === 'NEAR_STOCKOUT');
    expect(near?.estimate).toBe(true);
    expect(near?.detailEn.startsWith('Estimate.')).toBe(true);

    const thin = evaluateAlerts(blank({
      products: [product('para', { reorderLevel: 40 })],
      lots: [lot('p', 'para', { qty: 4 })],
      lines: fill('para', addDays(TODAY, -2), TODAY, 2),
    }));
    expect(thin.some((row) => row.code === 'NEAR_STOCKOUT' || row.code === 'FAST' || row.code === 'EXCESS')).toBe(false);
    expect(thin.some((row) => row.code === 'BELOW_MIN')).toBe(true);
  });

  it('flags excess cover and does not call a stocked-out week a fast seller', () => {
    const excess = evaluateAlerts(blank({
      products: [product('bulk', { reorderLevel: 2 })],
      lots: [lot('bulk', 'bulk', { qty: 500 })],
      lines: fill('bulk', addDays(TODAY, -29), TODAY, 1),
    }));
    expect(excess.some((row) => row.code === 'EXCESS' && row.estimate)).toBe(true);

    const stockout = evaluateAlerts(blank({
      products: [product('gone')],
      lots: [],
      lines: fill('gone', '2026-09-01', '2026-09-20', 4),
    }));
    expect(stockout.some((row) => row.code === 'OUT_OF_STOCK')).toBe(true);
    expect(stockout.some((row) => row.code === 'FAST')).toBe(false);
  });

  it('classifies expiry, value at risk, slow expiry, and missing batch data', () => {
    const rows = evaluateAlerts(blank({
      products: [
        product('soon', { reorderLevel: 0 }),
        product('month', { reorderLevel: 0 }),
        product('quarter', { reorderLevel: 0 }),
        product('old', { reorderLevel: 0 }),
        product('dear', { reorderLevel: 0, costPrice: '20000.00' }),
        product('idle', { reorderLevel: 0 }),
        product('blank', { reorderLevel: 0 }),
      ],
      lots: [
        lot('soon', 'soon', { qty: 3, expiry: addDays(TODAY, 5), unitCost: '12.50' }),
        lot('month', 'month', { qty: 2, expiry: addDays(TODAY, 20) }),
        lot('quarter', 'quarter', { qty: 2, expiry: addDays(TODAY, 80) }),
        lot('old', 'old', { qty: 4, expiry: '2026-10-01' }),
        lot('dear', 'dear', { qty: 10, expiry: addDays(TODAY, 20), unitCost: '20000.00' }),
        lot('idle', 'idle', { qty: 6, expiry: addDays(TODAY, 40) }),
        lot('blank', 'blank', { qty: 1, batchNo: '', expiry: '' }),
      ],
      lines: [
        ...fill('soon', '2026-10-01', '2026-10-10', 1),
        ...fill('month', '2026-10-01', '2026-10-10', 1),
        ...fill('quarter', '2026-10-01', '2026-10-10', 1),
        ...fill('dear', '2026-10-01', '2026-10-10', 1),
      ],
    }));
    const expiry = (id: string) => rows.find((row) => row.category === 'EXPIRY' && row.entityId === id);
    expect(expiry('soon')?.code).toBe('EXPIRY_7');
    expect(expiry('month')?.code).toBe('EXPIRY_30');
    expect(expiry('quarter')?.code).toBe('EXPIRY_90');
    expect(expiry('old')?.code).toBe('EXPIRED_SELLABLE');
    expect(expiry('old')?.detailEn).toContain('value 40.00');
    expect(expiry('dear')?.code).toBe('EXPIRY_VALUE');
    expect(expiry('idle')?.code).toBe('EXPIRY_SLOW');
    expect(rows.filter((row) => row.category === 'EXPIRY' && row.entityId === 'blank').map((row) => row.code).sort()).toEqual(['MISSING_EXPIRY']);
  });

  it('separates fast, slow, dead, spike, and decline demand from short histories', () => {
    const fastLines = [
      ...fill('fast', '2026-09-09', '2026-10-08', 2),
      ...fill('fast', '2026-10-09', TODAY, 4),
    ];
    const rows = evaluateAlerts(blank({
      products: [
        product('fast', { reorderLevel: 4 }),
        product('dead', { reorderLevel: 5 }),
        product('fresh', { createdOn: '2026-10-01' }),
        product('slow', { reorderLevel: 20 }),
        product('spike'),
        product('drop'),
      ],
      lots: [
        lot('fast', 'fast', { qty: 100 }),
        lot('dead', 'dead', { qty: 8 }),
        lot('fresh', 'fresh', { qty: 8 }),
        lot('slow', 'slow', { qty: 20 }),
        lot('spike', 'spike', { qty: 30 }),
        lot('drop', 'drop', { qty: 30 }),
      ],
      lines: [
        ...fastLines,
        { saleId: 'slow-1', productId: 'slow', branchId: 'b1', on: '2026-10-02', qty: 2, lineTotal: '20.00', costTotal: '10.00', discount: '0.00' },
        ...fill('spike', '2026-10-02', '2026-10-08', 1),
        ...fill('spike', '2026-10-09', TODAY, 3),
        ...fill('drop', '2026-09-18', '2026-10-01', 2),
        { saleId: 'drop-late', productId: 'drop', branchId: 'b1', on: '2026-10-10', qty: 2, lineTotal: '20.00', costTotal: '10.00', discount: '0.00' },
      ],
    }));
    expect(rows.some((row) => row.code === 'FAST' && row.entityId === 'fast')).toBe(true);
    expect(rows.some((row) => row.code === 'FAST_LOW' && row.entityId === 'fast')).toBe(false);
    expect(rows.find((row) => row.entityId === 'dead')?.code).toBe('DEAD');
    expect(rows.some((row) => row.entityId === 'fresh' && row.code.startsWith('DEAD'))).toBe(false);
    expect(rows.some((row) => row.code === 'SLOW' && row.entityId === 'slow')).toBe(true);
    expect(rows.some((row) => row.code === 'SPIKE' && row.entityId === 'spike')).toBe(true);
    expect(rows.some((row) => row.code === 'DECLINE' && row.entityId === 'drop')).toBe(true);

    const low = evaluateAlerts(blank({
      products: [product('fast', { reorderLevel: 20 })],
      lots: [lot('fast', 'fast', { qty: 5 })],
      lines: fastLines,
    }));
    expect(low.some((row) => row.code === 'FAST_LOW')).toBe(true);
  });

  it('raises procurement, pricing, payment, and subscription alerts from documents', () => {
    const rows = evaluateAlerts(blank({
      products: [
        product('priced'),
        product('free', { sellPrice: '0.00' }),
        product('loss', { sellPrice: '8.00', costPrice: '12.00' }),
        product('thin', { sellPrice: '10.00', costPrice: '9.00' }),
      ],
      purchases: [
        { id: 'po1', branchId: 'b1', docNo: 'PO-1', status: 'DRAFT', orderedOn: TODAY, supplierId: 's1', supplierAr: 'النيل', supplierEn: 'Nile' },
        { id: 'po2', branchId: 'b1', docNo: 'PO-2', status: 'ORDERED', orderedOn: '2026-09-01', supplierId: 's1', supplierAr: 'النيل', supplierEn: 'Nile' },
        { id: 'po3', branchId: 'b1', docNo: 'PO-3', status: 'PARTIAL', orderedOn: TODAY, supplierId: 's1', supplierAr: 'النيل', supplierEn: 'Nile' },
        { id: 'po4', branchId: 'b1', docNo: 'PO-4', status: 'ORDERED', orderedOn: '2026-10-01', supplierId: 's1', supplierAr: 'النيل', supplierEn: 'Nile' },
      ],
      purchaseLines: [
        { purchaseId: 'po3', productId: 'priced', qty: 10, receivedQty: 4, unitCost: '10.00' },
        { purchaseId: 'po4', productId: 'priced', qty: 5, receivedQty: 8, unitCost: '10.00' },
      ],
      receipts: [
        { id: 'gr1', branchId: 'b1', purchaseId: null, supplierId: 's-old', docNo: 'GR-1', status: 'DRAFT', receivedOn: TODAY },
        { id: 'gr-old', branchId: 'b1', purchaseId: null, supplierId: 's-old', docNo: 'GR-OLD', status: 'POSTED', receivedOn: '2026-08-01' },
        { id: 'gr2', branchId: 'b1', purchaseId: 'po2', supplierId: 's-late', docNo: 'GR-2', status: 'POSTED', receivedOn: '2026-09-20' },
        { id: 'gr3', branchId: 'b1', purchaseId: null, supplierId: 's-soon', docNo: 'GR-3', status: 'POSTED', receivedOn: '2026-09-20' },
      ],
      receiptLines: [
        { id: 'rl1', receiptId: 'gr1', productId: 'priced', batchNo: '', qty: 2, unitCost: '10.00', receivedOn: '2026-08-01' },
        { id: 'rl2', receiptId: 'gr-old', productId: 'priced', batchNo: 'B1', qty: 2, unitCost: '10.00', receivedOn: '2026-09-01' },
        { id: 'rl3', receiptId: 'gr3', productId: 'priced', batchNo: 'B2', qty: 2, unitCost: '15.00', receivedOn: '2026-10-01' },
      ],
      suppliers: [
        { id: 's-old', nameAr: 'الشفاء', nameEn: 'Shifa', balance: '640.00' },
        { id: 's-soon', nameAr: 'قريب', nameEn: 'Soon', balance: '80.00' },
        { id: 's-open', nameAr: 'مفتوح', nameEn: 'Open', balance: '15.00' },
      ],
      customers: [{ id: 'c1', nameAr: 'أحمد', nameEn: 'Ahmed', balance: '40.00' }],
      prices: [
        { productId: 'priced', branchId: 'b1', amount: '10.00', active: true },
        { productId: 'priced', branchId: 'b2', amount: '20.00', active: true },
      ],
      priceChanges: [{ productId: 'priced', oldAmount: '10.00', newAmount: '16.00', on: '2026-09-15', actorId: null }],
      lists: [{ id: 'promo', nameAr: 'عرض', nameEn: 'Offer', status: 'ACTIVE', effectiveTo: '2026-10-01' }],
      sales: [
        { id: 'sale-old', branchId: 'b1', docNo: 'S-OLD', on: '2026-10-05', subtotal: '1000.00', discount: '0.00', total: '1000.00', paid: '1000.00', status: 'POSTED' },
        { id: 'sale-new', branchId: 'b1', docNo: 'S-NEW', on: TODAY, subtotal: '100.00', discount: '30.00', total: '70.00', paid: '20.00', status: 'POSTED' },
        { id: 'sale-back', branchId: 'b1', docNo: 'S-BACK', on: TODAY, subtotal: '10.00', discount: '0.00', total: '-10.00', paid: '0.00', status: 'REFUND' },
      ],
      lines: [
        { saleId: 'sale-new', productId: 'priced', branchId: 'b1', on: TODAY, qty: 1, lineTotal: '100.00', costTotal: '90.00', discount: '0.00' },
      ],
      thresholds: { ...DEFAULT_THRESHOLDS, creditLimit: '30.00', expiryDays: [...DEFAULT_THRESHOLDS.expiryDays] },
      tenantStatus: 'SUSPENDED',
      subscriptionEnd: '2026-10-20',
      subscriptionInvoices: [{ id: 'inv1', amount: '12000.00', status: 'ISSUED', dueOn: '2026-10-01' }],
    }));
    expect(codes(rows)).toEqual(expect.arrayContaining([
      'PO_DRAFT',
      'PO_DELAYED',
      'LATE_DELIVERY',
      'PARTIAL',
      'QTY_MISMATCH',
      'GR_DRAFT',
      'COST_UP',
      'STALE_PRICE',
      'NO_PRICE',
      'BELOW_COST',
      'LOW_MARGIN',
      'BRANCH_PRICE',
      'PRICE_JUMP',
      'UNAUTH_PRICE',
      'EXPIRED_LIST',
      'OVERDUE',
      'DUE_SOON',
      'CUSTOMER_DUE',
      'CREDIT_LIMIT',
      'UNPAID',
      'REVENUE_DROP',
      'MARGIN_DROP',
      'DISCOUNT',
      'REFUND',
      'SUSPENDED',
      'SUB_ENDING',
      'SUB_INVOICE',
    ]));
    const overdue = rows.find((row) => row.code === 'OVERDUE');
    expect(overdue?.severity).toBe('critical');
    expect(overdue?.exposure).toBe('640.00');
    expect(rows.find((row) => row.code === 'SUB_INVOICE')?.entityId).toBe('inv1');
  });

  it('keeps one active case per condition, resolves it when the condition clears, and escalates critical cases', () => {
    const live = evaluateAlerts(blank({ products: [product('out')], lots: [] }));
    const first = planSync(live, [], '2026-10-15T08:00:00.000Z');
    expect(first.filter((row) => row.op === 'create')).toHaveLength(live.length);
    const stored = live.map((draft, index) => ({
      id: `case-${index}`,
      fingerprint: draft.fingerprint,
      status: 'OPEN' as const,
      snoozeUntil: null,
      openedAt: '2026-10-13T08:00:00.000Z',
      escalatedAt: null,
    }));
    const second = planSync(live, stored, '2026-10-15T08:00:00.000Z');
    expect(second.some((row) => row.op === 'create')).toBe(false);
    expect(second.find((row) => row.op === 'update' && row.id === 'case-0')).toMatchObject({ escalate: true, reopen: false });
    const gone = planSync([], stored, '2026-10-15T08:00:00.000Z');
    expect(gone.every((row) => row.op === 'resolve')).toBe(true);
  });

  it('does not repeat a notice for the same period', () => {
    const active = [{ fingerprint: 'STOCK:OUT_OF_STOCK::out', severity: 'critical' as const, openedOn: TODAY, escalated: true, titleAr: 'نفاد', titleEn: 'Out' }];
    const first = planNotices({ today: TODAY, prefs: { immediate: true, daily: true, weekly: true }, active, existing: [] });
    expect(first.map((row) => row.kind).sort()).toEqual(['DAILY', 'ESCALATION', 'IMMEDIATE', 'WEEKLY']);
    const existing = first.map((row) => `${row.kind}|${row.fingerprint}|${row.periodKey}`);
    expect(planNotices({ today: TODAY, prefs: { immediate: true, daily: true, weekly: true }, active, existing })).toEqual([]);
  });

  it('limits categories by permission and keeps snooze off critical alerts', () => {
    expect(allowedCategories(['stock.count', 'reports.view'])).toEqual(['STOCK', 'EXPIRY', 'DEMAND', 'PRICING']);
    expect(allowedCategories(['accounting.view'])).toEqual(['FINANCE']);
    expect(allowedCategories(['users.manage'])).toEqual(['PRICING', 'SAAS']);
    expect(allowedCategories(['pos.sell'])).toEqual([]);
    expect(canConfigureAlerts(['stock.adjust', 'accounting.view'])).toBe(true);
    expect(canConfigureAlerts(['stock.count'])).toBe(false);
    expect(snoozeAllowed('critical', 1)).toBe(false);
    expect(snoozeAllowed('high', 1)).toBe(true);
    expect(snoozeAllowed('high', 3)).toBe(false);
    expect(snoozeAllowed('medium', 7)).toBe(true);
  });

  it('reads tenant and branch thresholds and rejects values outside the allowed range', () => {
    const rows = thresholdsFrom([
      { key: 'alertNearDays', value: '9' },
      { key: 'alertNearDays@b2', value: '4' },
      { key: 'alertMinMargin', value: '12' },
    ], 'b2');
    expect(rows.nearDays).toBe(4);
    expect(rows.minMargin).toBe(12);
    expect(thresholdsFrom([{ key: 'alertNearDays', value: '9' }, { key: 'alertNearDays@b2', value: '4' }], null).nearDays).toBe(9);
    expect(() => assertAlertSetting('alertNearDays', '0')).toThrow('VALIDATION_ERROR');
    expect(() => assertAlertSetting('alertExpiryDays', '90,60,30,15,7')).not.toThrow();
    const standards = thresholdsFrom(defaultAlertSettings().map((row) => ({ key: row.key, value: row.value })), null);
    expect(standards).toEqual({ ...DEFAULT_THRESHOLDS, expiryDays: [...DEFAULT_THRESHOLDS.expiryDays] });
  });

  it('counts dashboard cards from the same alerts and sorts by severity', () => {
    const rows = evaluateAlerts(blank({
      products: [product('out'), product('idle', { reorderLevel: 0 })],
      lots: [lot('idle', 'idle', { qty: 6, expiry: addDays(TODAY, 40) })],
    }));
    const cards = summaryCards(rows);
    expect(cards.find((card) => card.id === 'critical')?.count).toBe(rows.filter((row) => row.severity === 'critical').length);
    expect(cards.find((card) => card.id === 'expiry')?.count).toBeGreaterThan(0);
    expect(cards.reduce((sum, card) => sum + card.count, 0)).toBeGreaterThan(0);
    const sorted = sortAlerts(rows.map((row, index) => ({ ...row, openedAt: `2026-10-${String(10 + index).padStart(2, '0')}T00:00:00.000Z` })), 'severity');
    expect(sorted[0]?.severity).toBe('critical');
    const charts = buildCharts(rows, [], TODAY);
    expect(charts.trendMode).toBe('snapshot');
    expect(charts.stock.out).toBe(1);
    expect(buildCharts(rows, [{ on: TODAY, kind: 'OPENED' }], TODAY).trendMode).toBe('history');
  });
});
