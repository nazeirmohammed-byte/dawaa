import { addMoney, applyPercent, cmpMoney, divMoney, money, mulMoney, roundToIncrement, subMoney } from '@dawaa/shared';

export type SaleUnit = 'BOX' | 'STRIP' | 'BOTTLE' | 'PIECE';

export type ItemPack = {
  outer: SaleUnit;
  inner: 'STRIP' | 'BOTTLE' | 'PIECE';
  perBox: number;
  perInner: number;
};

export type SaleChoice = { unit: SaleUnit; pieces: number; divide: number };

export function parseItemPack(raw: string | null | undefined): ItemPack | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ItemPack>;
    if (data.outer !== 'BOX' && data.outer !== 'STRIP' && data.outer !== 'BOTTLE' && data.outer !== 'PIECE') return null;
    const inner = data.inner === 'BOTTLE' || data.inner === 'PIECE' ? data.inner : 'STRIP';
    return {
      outer: data.outer,
      inner,
      perBox: Math.max(1, Math.trunc(Number(data.perBox) || 1)),
      perInner: Math.max(1, Math.trunc(Number(data.perInner) || 1)),
    };
  } catch {
    return null;
  }
}

/** Selling choices for a container whose price is the whole box. `divide` is how many of that unit make one container. */
export function saleChoices(pack: ItemPack | null): SaleChoice[] {
  if (!pack || pack.outer === 'PIECE') return [{ unit: 'PIECE', pieces: 1, divide: 1 }];
  if (pack.outer === 'STRIP' || pack.outer === 'BOTTLE') {
    const pieces = Math.max(1, pack.perInner);
    return pieces > 1
      ? [{ unit: pack.outer, pieces, divide: 1 }, { unit: 'PIECE', pieces: 1, divide: pieces }]
      : [{ unit: pack.outer, pieces: 1, divide: 1 }];
  }
  const innerPieces = pack.inner === 'PIECE' ? 1 : Math.max(1, pack.perInner);
  const perBox = Math.max(1, pack.perBox);
  const boxPieces = perBox * innerPieces;
  const choices: SaleChoice[] = [{ unit: 'BOX', pieces: boxPieces, divide: 1 }];
  if ((pack.inner === 'STRIP' || pack.inner === 'BOTTLE') && perBox > 1) {
    choices.push({ unit: pack.inner, pieces: innerPieces, divide: perBox });
  }
  if (boxPieces > 1) choices.push({ unit: 'PIECE', pieces: 1, divide: boxPieces });
  return choices;
}

export function piecesInContainer(pack: ItemPack): number {
  return saleChoices(pack).find((choice) => choice.unit === pack.outer)?.pieces ?? 1;
}

/** The list price is the container. A strip is that price divided by the strips in the box. */
export function containerUnitPrice(containerPrice: string, divide: number): string {
  if (divide <= 1) return containerPrice;
  return divMoney(containerPrice, String(divide));
}

/** A typed box cost becomes the cost of one piece, which is how stock is stored. */
export function pieceUnitCost(containerCost: string, pack: ItemPack | null): string {
  if (!pack) return containerCost;
  const each = piecesInContainer(pack);
  if (each <= 1) return containerCost;
  return divMoney(containerCost, String(each));
}

export type LotSlice = {
  id: string;
  qtyBase: number;
  expiry: string;
};

export function khartoumDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Khartoum',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A receipt may omit the manufacturer batch. Blank and the old OPEN placeholder are stored as N/A. */
export function manufacturerBatch(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (!text || text.toUpperCase() === 'OPEN' || text.toUpperCase() === 'N/A') return 'N/A';
  return text.slice(0, 64);
}

export function khartoumDayStart(now = new Date()): Date {
  return new Date(`${khartoumDate(now)}T00:00:00+02:00`);
}

/** Sellable stock is an available, unexpired quantity. Rejected, quarantined, and damaged lots stay on the books. */
export function isSellableLot(
  lot: { qtyBase: number; expiry: string; condition?: string | null },
  today: string,
): boolean {
  return (lot.condition || 'AVAILABLE') === 'AVAILABLE' && lot.qtyBase > 0 && lot.expiry.slice(0, 10) >= today;
}

export type OrderBucket = { id: string; productId: string; ordered: number; received: number };

/** Assign received pieces to purchase lines. Updates `received` on the buckets that were claimed. */
export function claimReceiptQty(
  buckets: OrderBucket[],
  productId: string,
  pieces: number,
  override: boolean,
): { id: string; take: number }[] {
  if (!Number.isInteger(pieces) || pieces <= 0) throw new Error('QTY');
  const scratch = buckets.map((row) => ({ ...row }));
  const rows = scratch.filter((row) => row.productId === productId);
  if (rows.length === 0) throw new Error('NOT_ON_ORDER');
  let left = pieces;
  const takes: { id: string; take: number }[] = [];
  for (const row of rows) {
    const room = row.ordered - row.received;
    if (room <= 0) continue;
    const take = Math.min(room, left);
    if (take <= 0) continue;
    takes.push({ id: row.id, take });
    row.received += take;
    left -= take;
  }
  if (left > 0) {
    if (!override) throw new Error('OVER_RECEIVE');
    const last = rows[rows.length - 1];
    if (!last) throw new Error('NOT_ON_ORDER');
    takes.push({ id: last.id, take: left });
    last.received += left;
  }
  for (const row of scratch) {
    const live = buckets.find((item) => item.id === row.id);
    if (live) live.received = row.received;
  }
  return takes;
}

export const STOCK_PLACES = [
  { code: 'MAIN', kind: 'PHARMACY', nameAr: 'الصيدلية الرئيسية', nameEn: 'Main Pharmacy' },
  { code: 'A1', kind: 'SHELF', nameAr: 'رف A1', nameEn: 'Shelf A1' },
  { code: 'B2', kind: 'SHELF', nameAr: 'رف B2', nameEn: 'Shelf B2' },
  { code: 'FRIDGE', kind: 'FRIDGE', nameAr: 'ثلاجة', nameEn: 'Refrigerator' },
  { code: 'CONTROLLED', kind: 'CONTROLLED', nameAr: 'تخزين مراقب', nameEn: 'Controlled Storage' },
  { code: 'WAREHOUSE', kind: 'WAREHOUSE', nameAr: 'مخزن', nameEn: 'Warehouse' },
] as const;

export type StockCandidate = {
  poStatus: string;
  receiptStatus: string;
  source: string;
  condition: string;
  expiry: string;
  received: number;
  posted: number;
};

/** Pieces still waiting to be placed on a shelf. */
export function remainingToStock(received: number, posted: number): number {
  if (!Number.isInteger(received) || received < 0 || !Number.isInteger(posted) || posted < 0) throw new Error('QTY');
  return Math.max(0, received - posted);
}

/** Claim part of a received line. A second claim against the same posted quantity fails. */
export function claimStockQty(received: number, posted: number, request: number): number {
  if (!Number.isInteger(request) || request <= 0) throw new Error('QTY');
  const left = remainingToStock(received, posted);
  if (request > left) throw new Error('OVER_POST');
  return request;
}

/**
 * A line can be stocked only after a posted procurement goods receipt.
 * Approval alone, drafts, cancellations, rejected or expired lines, and fully posted lines stay out.
 */
export function canStockReceipt(row: StockCandidate, today: string): boolean {
  if (row.source !== 'PROCUREMENT') return false;
  if (row.receiptStatus !== 'POSTED') return false;
  if (row.poStatus !== 'PARTIAL' && row.poStatus !== 'RECEIVED') return false;
  if (row.condition !== 'AVAILABLE') return false;
  const expiry = row.expiry.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry < today) return false;
  return remainingToStock(row.received, row.posted) > 0;
}

export function inventoryDocNo(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error('QTY');
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) throw new Error('QTY');
  return `INV-${year}-${String(sequence).padStart(6, '0')}`;
}

export function stockingLabel(
  received: number,
  posted: number,
  condition: string,
): 'PENDING' | 'PARTIAL' | 'STOCKED' | 'REJECTED' | 'QUARANTINE' {
  if (condition === 'QUARANTINE') return 'QUARANTINE';
  if (condition === 'REJECTED' || condition === 'DAMAGED') return 'REJECTED';
  if (posted <= 0) return 'PENDING';
  if (posted < received) return 'PARTIAL';
  return 'STOCKED';
}

export function orderStockState(
  lines: { condition: string; received: number; posted: number }[],
): 'NONE' | 'PENDING' | 'PARTIAL' | 'STOCKED' | 'REJECTED' {
  const rows = lines.filter((line) => line.received > 0 && line.condition === 'AVAILABLE');
  if (rows.length === 0) {
    if (lines.some((line) => line.condition === 'QUARANTINE' || line.condition === 'REJECTED' || line.condition === 'DAMAGED')) {
      return 'REJECTED';
    }
    return 'NONE';
  }
  if (rows.every((line) => line.posted >= line.received)) return 'STOCKED';
  if (rows.every((line) => line.posted === 0)) return 'PENDING';
  return 'PARTIAL';
}

export type StockingSummary = {
  pendingReceipts: number;
  receivedLines: number;
  awaitingPosting: number;
  fullyStocked: number;
  pendingQty: number;
};

/** Shared counts for the procurement and inventory screens. */
export function summarizeStocking(input: { orders: { status: string }[]; lines: StockCandidate[]; today: string }): StockingSummary {
  const received = input.lines.filter(
    (line) => line.source === 'PROCUREMENT' && line.receiptStatus === 'POSTED' && (line.poStatus === 'PARTIAL' || line.poStatus === 'RECEIVED'),
  );
  const awaiting = received.filter((line) => canStockReceipt(line, input.today));
  return {
    pendingReceipts: input.orders.filter((order) => order.status === 'ORDERED' || order.status === 'PARTIAL').length,
    receivedLines: received.length,
    awaitingPosting: awaiting.length,
    fullyStocked: received.filter((line) => line.condition === 'AVAILABLE' && line.received > 0 && line.posted >= line.received).length,
    pendingQty: awaiting.reduce((sum, line) => sum + remainingToStock(line.received, line.posted), 0),
  };
}

export function normalizePlace(value: string): string {
  const text = value.trim();
  const hit = STOCK_PLACES.find((place) => place.code === text || place.nameAr === text || place.nameEn.toLowerCase() === text.toLowerCase());
  if (hit) return hit.code;
  if (text === 'ثلاجة') return 'FRIDGE';
  if (text === 'مخزن') return 'WAREHOUSE';
  if (text === 'رف') return 'A1';
  return '';
}

export function storageNeed(hint: string): 'COLD' | 'CONTROLLED' | 'NORMAL' {
  if (/ثلاج|مبرد|تبريد|لقاح|أنسولين|إنسولين|انسولين|مصل|vaccine|insulin|immunoglobulin|interferon|oxytocin|refriger|cold|2\s*[-–to]+\s*8/i.test(hint)) {
    return 'COLD';
  }
  if (/مراقب|مخدر|narcotic|controlled|psychotropic/i.test(hint)) return 'CONTROLLED';
  return 'NORMAL';
}

export function suggestPlace(hint: string, previous: string | null): string {
  const known = previous ? normalizePlace(previous) : '';
  if (known) return known;
  const need = storageNeed(hint);
  if (need === 'COLD') return 'FRIDGE';
  if (need === 'CONTROLLED') return 'CONTROLLED';
  if (/مخزن|warehouse/i.test(hint)) return 'WAREHOUSE';
  return 'MAIN';
}

export function placeCompatible(need: 'COLD' | 'CONTROLLED' | 'NORMAL', code: string): boolean {
  if (need === 'COLD') return code === 'FRIDGE';
  if (need === 'CONTROLLED') return code === 'CONTROLLED';
  return true;
}

/** Earliest unexpired batch first. Expired stock is never allocated. */
export function allocateFefo(lots: LotSlice[], qty: number, today: string): { id: string; take: number }[] {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('QTY');
  }
  const usable = lots
    .filter((lot) => lot.qtyBase > 0 && lot.expiry.slice(0, 10) >= today)
    .sort((left, right) => left.expiry.localeCompare(right.expiry) || left.id.localeCompare(right.id));
  let left = qty;
  const takes: { id: string; take: number }[] = [];
  for (const lot of usable) {
    if (left === 0) break;
    const take = Math.min(lot.qtyBase, left);
    takes.push({ id: lot.id, take });
    left -= take;
  }
  if (left > 0) throw new Error('STOCK_SHORT');
  return takes;
}

export function assertJournalBalances(lines: { debit: string; credit: string }[]): void {
  let debit = '0.00';
  let credit = '0.00';
  for (const line of lines) {
    debit = addMoney(debit, line.debit);
    credit = addMoney(credit, line.credit);
  }
  if (cmpMoney(debit, credit) !== 0) throw new Error('UNBALANCED');
}

/** Debit-normal accounts grow on debit. Credit-normal accounts grow on credit. */
export function balanceDelta(kind: string, debit: string, credit: string): string {
  if (kind === 'ASSET' || kind === 'EXPENSE') return subMoney(debit, credit);
  return subMoney(credit, debit);
}

export type PriceOp = 'PCT' | 'AMOUNT' | 'MARGIN' | 'FX';

function roundUp(amount: string, step: string): string {
  const nearest = roundToIncrement(amount, step);
  if (cmpMoney(nearest, amount) < 0) return addMoney(nearest, money(step));
  return nearest;
}

/** Next draft price. Returns null when the rule cannot price the row. */
export function nextPrice(input: {
  oldPrice: string;
  cost: string;
  costUsd: string;
  op: PriceOp;
  value: string;
  rate: string;
  rounding: 'NONE' | '10' | '50' | '100';
  roundMode: 'NEAREST' | 'UP';
}): string | null {
  const oldPrice = input.oldPrice.trim() === '' ? '0.00' : money(input.oldPrice);
  let next = oldPrice;
  if (input.op === 'PCT') next = applyPercent(oldPrice, input.value);
  else if (input.op === 'AMOUNT') next = addMoney(oldPrice, money(input.value));
  else if (input.op === 'MARGIN') next = applyPercent(money(input.cost), input.value);
  else {
    if (cmpMoney(input.costUsd || '0.00', '0.00') <= 0 || cmpMoney(input.rate || '0.00', '0.00') <= 0) return null;
    next = applyPercent(mulMoney(input.costUsd, input.rate), input.value);
  }
  if (cmpMoney(next, '0.00') < 0) return null;
  if (input.rounding === 'NONE') return money(next);
  const stepped = input.roundMode === 'UP' ? roundUp(next, input.rounding) : roundToIncrement(next, input.rounding);
  return money(stepped);
}

export type ReceiptCostLine = { qty: number; unitCost: string };

/** SDG net unit cost from the currency entered at receipt. Later rate changes do not revise this. */
export function allocateReceiptCosts(
  lines: ReceiptCostLine[],
  header: { currency: 'SDG' | 'USD'; rate: string; discount: string; tax: string; charges: string },
): { sdgUnit: string; sdgTotal: string; foreignUnit: string }[] {
  if (header.currency === 'USD' && cmpMoney(header.rate || '0.00', '0.00') <= 0) throw new Error('RATE');
  const rate = header.currency === 'USD' ? money(header.rate) : '1.00';
  const grosses = lines.map((line) => {
    if (!Number.isInteger(line.qty) || line.qty <= 0) throw new Error('QTY');
    const foreign = money(line.unitCost);
    const sdg = header.currency === 'USD' ? mulMoney(foreign, rate) : foreign;
    return mulMoney(sdg, String(line.qty));
  });
  const grossTotal = grosses.reduce((sum, gross) => addMoney(sum, gross), '0.00');
  const discount = money(header.discount || '0.00');
  const tax = money(header.tax || '0.00');
  const charges = money(header.charges || '0.00');
  let usedDiscount = '0.00';
  let usedTax = '0.00';
  let usedCharges = '0.00';
  return lines.map((line, index) => {
    const last = index === lines.length - 1;
    const share = (pool: string, used: string) => {
      if (last) return subMoney(pool, used);
      if (cmpMoney(grossTotal, '0.00') <= 0) return '0.00';
      return divMoney(mulMoney(pool, grosses[index]), grossTotal);
    };
    const lineDiscount = share(discount, usedDiscount);
    const lineTax = share(tax, usedTax);
    const lineCharges = share(charges, usedCharges);
    usedDiscount = addMoney(usedDiscount, lineDiscount);
    usedTax = addMoney(usedTax, lineTax);
    usedCharges = addMoney(usedCharges, lineCharges);
    const net = addMoney(addMoney(subMoney(grosses[index], lineDiscount), lineTax), lineCharges);
    if (cmpMoney(net, '0.00') < 0) throw new Error('COST');
    return {
      foreignUnit: money(line.unitCost),
      sdgTotal: net,
      sdgUnit: divMoney(net, String(line.qty)),
    };
  });
}

/** Selling price when the USD base already includes markup and no extra rounding applies. */
export function usdSellingPrice(baseUsd: string, rate: string): string | null {
  if (cmpMoney(baseUsd || '0.00', '0.00') <= 0 || cmpMoney(rate || '0.00', '0.00') <= 0) return null;
  return mulMoney(money(baseUsd), money(rate));
}

export function priceChangePct(oldPrice: string, newPrice: string): string {
  if (cmpMoney(oldPrice || '0.00', '0.00') <= 0) return '0.00';
  return mulMoney(divMoney(subMoney(newPrice, oldPrice), oldPrice), '100');
}

function shiftMonths(iso: string, months: number): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1 + months, day);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

/** Blocks expired stock, reversed dates, and missing serials. Returns a shelf-life warning code. */
export function assertReceiptLine(input: {
  expiry: string;
  manufacturedAt: string;
  qty: number;
  bonusQty: number;
  serial: string;
  trackSerial: boolean;
  today: string;
  warnMonths: number;
}): string | null {
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new Error('QTY');
  if (!Number.isInteger(input.bonusQty) || input.bonusQty < 0) throw new Error('QTY');
  const expiry = input.expiry.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry <= input.today) throw new Error('EXPIRED');
  if (input.manufacturedAt && input.manufacturedAt.slice(0, 10) >= expiry) throw new Error('DATE_ORDER');
  if (input.trackSerial && input.serial.trim() === '') throw new Error('SERIAL');
  if (expiry < shiftMonths(input.today, input.warnMonths)) return 'SHORT_SHELF';
  return null;
}

export function daySpan(today: string, count: number): string[] {
  const [year, month, day] = today.split('-').map(Number);
  const days: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    days.push(new Date(Date.UTC(year, month - 1, day - index)).toISOString().slice(0, 10));
  }
  return days;
}

export function daysUntil(today: string, expiry: string): number {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${expiry.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function cents(amount: string): bigint {
  const negative = amount.startsWith('-');
  const raw = negative ? amount.slice(1) : amount;
  const [whole, frac = '00'] = raw.split('.');
  const value = BigInt(whole || '0') * 100n + BigInt((frac + '00').slice(0, 2));
  return negative ? -value : value;
}

export function barHeights(amounts: string[]): number[] {
  let max = 0n;
  const values = amounts.map((amount) => {
    const value = cents(amount);
    if (value > max) max = value;
    return value;
  });
  if (max <= 0n) return amounts.map(() => 0);
  return values.map((value) => {
    if (value <= 0n) return 0;
    const pct = Number((value * 100n) / max);
    return pct < 8 ? 8 : pct;
  });
}

export type HomeBoard = {
  salesToday: string;
  salesCount: number;
  purchasesMonth: string;
  lowCount: number;
  expiredCount: number;
  days: { date: string; total: string; count: number; heightPct: number; countPct: number }[];
  branches: { id: string; nameAr: string; nameEn: string; salesToday: string; alertCount: number }[];
  lowStock: { id: string; nameAr: string; nameEn: string; qty: number; reorderLevel: number }[];
  expiry: { nameAr: string; nameEn: string; batchNo: string; expiry: string; qty: number; daysLeft: number }[];
  purchases: { docNo: string; supplierAr: string; supplierEn: string; orderedAt: string; total: string; status: string }[];
  stocking: StockingSummary & { availableQty: number; newlyStocked: number } | null;
  sales: { soldAt: string; docNo: string; customerName: string; total: string; paymentMethod: string; status: string }[];
  accounts: { receiptsToday: string; paymentsToday: string; customerDue: string; supplierDue: string };
  customers: { nameAr: string; nameEn: string; balance: string }[];
  products: { id: string; nameAr: string; nameEn: string; genericName: string; sku: string; form: string; sellPrice: string; qty: number; pack: ItemPack | null }[];
};

export function buildHome(input: {
  today: string;
  branches: { id: string; nameAr: string; nameEn: string | null }[];
  sales: { branchId: string; soldAt: string; total: string; docNo: string; customerName: string; paymentMethod: string; status: string }[];
  purchases: { orderedAt: string; total: string; docNo: string; status: string; supplierAr: string; supplierEn: string }[];
  expenses: { spentAt: string; amount: string }[];
  suppliers: { balance: string }[];
  customers: { nameAr: string; nameEn: string; balance: string }[];
  lots: { branchId: string; productId: string; batchNo: string; expiry: string; qtyBase: number }[];
  products: { id: string; nameAr: string; nameEn: string; genericName: string; sku: string; form: string; sellPrice: string; qty: number; reorderLevel: number; pack?: ItemPack | null }[];
  stocking?: (StockingSummary & { availableQty: number; newlyStocked: number }) | null;
}): HomeBoard {
  const month = input.today.slice(0, 7);
  const dates = daySpan(input.today, 7);
  const dayTotals = dates.map((date) => {
    let total = '0.00';
    let count = 0;
    for (const sale of input.sales) {
      if (khartoumDate(new Date(sale.soldAt)) !== date) continue;
      total = addMoney(total, sale.total);
      count += 1;
    }
    return { date, total, count };
  });
  const heights = barHeights(dayTotals.map((day) => day.total));
  const countHeights = barHeights(dayTotals.map((day) => `${day.count}.00`));
  let salesToday = '0.00';
  let salesCount = 0;
  for (const sale of input.sales) {
    if (khartoumDate(new Date(sale.soldAt)) !== input.today) continue;
    salesToday = addMoney(salesToday, sale.total);
    salesCount += 1;
  }
  let purchasesMonth = '0.00';
  for (const order of input.purchases) {
    if (!khartoumDate(new Date(order.orderedAt)).startsWith(month)) continue;
    purchasesMonth = addMoney(purchasesMonth, order.total);
  }
  let paymentsToday = '0.00';
  for (const expense of input.expenses) {
    if (khartoumDate(new Date(expense.spentAt)) !== input.today) continue;
    paymentsToday = addMoney(paymentsToday, expense.amount);
  }
  let customerDue = '0.00';
  for (const customer of input.customers) {
    if (cmpMoney(customer.balance, '0.00') > 0) customerDue = addMoney(customerDue, customer.balance);
  }
  let supplierDue = '0.00';
  for (const supplier of input.suppliers) {
    if (cmpMoney(supplier.balance, '0.00') > 0) supplierDue = addMoney(supplierDue, supplier.balance);
  }
  const names = new Map(input.products.map((product) => [product.id, product]));
  const qtyByBranchProduct = new Map<string, number>();
  for (const lot of input.lots) {
    const key = `${lot.branchId}:${lot.productId}`;
    qtyByBranchProduct.set(key, (qtyByBranchProduct.get(key) ?? 0) + lot.qtyBase);
  }
  const expiredProducts = new Set(
    input.lots.filter((lot) => lot.qtyBase > 0 && daysUntil(input.today, lot.expiry) < 0).map((lot) => lot.productId),
  );
  const lowStock = input.products
    .filter((product) => product.qty <= product.reorderLevel)
    .slice(0, 6)
    .map((product) => ({
      id: product.id,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      qty: product.qty,
      reorderLevel: product.reorderLevel,
    }));
  return {
    salesToday,
    salesCount,
    purchasesMonth,
    lowCount: input.products.filter((product) => product.qty <= product.reorderLevel).length,
    expiredCount: expiredProducts.size,
    days: dayTotals.map((day, index) => ({
      ...day,
      heightPct: heights[index] ?? 0,
      countPct: countHeights[index] ?? 0,
    })),
    branches: input.branches.map((branch) => {
      let total = '0.00';
      for (const sale of input.sales) {
        if (sale.branchId !== branch.id || khartoumDate(new Date(sale.soldAt)) !== input.today) continue;
        total = addMoney(total, sale.total);
      }
      const alerts = input.products.filter((product) => {
        const qty = qtyByBranchProduct.get(`${branch.id}:${product.id}`) ?? 0;
        const expired = input.lots.some(
          (lot) => lot.branchId === branch.id && lot.productId === product.id && lot.qtyBase > 0 && daysUntil(input.today, lot.expiry) < 0,
        );
        return expired || qty <= product.reorderLevel;
      }).length;
      return {
        id: branch.id,
        nameAr: branch.nameAr,
        nameEn: branch.nameEn ?? branch.nameAr,
        salesToday: total,
        alertCount: alerts,
      };
    }),
    lowStock,
    expiry: input.lots
      .filter((lot) => lot.qtyBase > 0 && daysUntil(input.today, lot.expiry) <= 180)
      .map((lot) => ({
        nameAr: names.get(lot.productId)?.nameAr ?? '',
        nameEn: names.get(lot.productId)?.nameEn ?? '',
        batchNo: lot.batchNo,
        expiry: lot.expiry,
        qty: lot.qtyBase,
        daysLeft: daysUntil(input.today, lot.expiry),
      }))
      .sort((left, right) => left.daysLeft - right.daysLeft)
      .slice(0, 6),
    purchases: [...input.purchases]
      .sort((left, right) => right.orderedAt.localeCompare(left.orderedAt))
      .slice(0, 5),
    sales: [...input.sales]
      .sort((left, right) => right.soldAt.localeCompare(left.soldAt))
      .slice(0, 5)
      .map((sale) => ({
        soldAt: sale.soldAt,
        docNo: sale.docNo,
        customerName: sale.customerName,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
      })),
    accounts: { receiptsToday: salesToday, paymentsToday, customerDue, supplierDue },
    customers: input.customers,
    stocking: input.stocking ?? null,
    products: input.products.map((product) => ({
      id: product.id,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      genericName: product.genericName,
      sku: product.sku,
      form: product.form,
      sellPrice: product.sellPrice,
      qty: product.qty,
      pack: product.pack ?? null,
    })),
  };
}

export function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells: string[] = [];
      let current = '';
      let quoted = false;
      for (const char of line) {
        if (char === '"') {
          quoted = !quoted;
          continue;
        }
        if (char === ',' && !quoted) {
          cells.push(current.trim());
          current = '';
          continue;
        }
        current += char;
      }
      cells.push(current.trim());
      return cells;
    });
}

export type RenewAdjust = 'SAME' | 'PCT' | 'AMOUNT';
export type PriceAction = 'edit' | 'activate' | 'deactivate' | 'renew' | 'delete';
export type PriceLockReason = 'draft' | 'active' | 'usedOnSales';

/** Next version price. Percent is points (`10` = +10%). Result must stay above zero. */
export function renewAmount(amount: string, adjust: RenewAdjust, value: string): string {
  const base = money(amount);
  if (adjust === 'SAME') return base;
  const next = adjust === 'PCT' ? applyPercent(base, value) : addMoney(base, value);
  if (cmpMoney(next, '0.00') <= 0) throw new Error('PRICE');
  return next;
}

/**
 * A new list starts after the list already used in sales.
 * A copy may keep that same date, and then it replaces the current list.
 */
export function priceListDateGate(input: { nextOn: string; currentOn: string | null; copied: boolean }): 'ok' | 'PRICE_DATE' {
  if (!input.currentOn || input.nextOn > input.currentOn) return 'ok';
  if (input.nextOn === input.currentOn && input.copied) return 'ok';
  return 'PRICE_DATE';
}

/** Which price-list buttons the server allows. Editing stays on an unused draft. */
export function priceListWorkflow(input: {
  status: string;
  usedOnSales: boolean;
  canManage: boolean;
  canActivateHere: boolean;
  isSelling: boolean;
}): { allowedActions: PriceAction[]; lockReason: PriceLockReason } {
  const lockReason: PriceLockReason = input.usedOnSales ? 'usedOnSales' : input.status === 'DRAFT' ? 'draft' : 'active';
  if (!input.canManage) return { allowedActions: [], lockReason };
  const actions: PriceAction[] = [];
  const editable = input.status === 'DRAFT' && !input.usedOnSales;
  if (editable) actions.push('edit');
  if (editable && input.canActivateHere) actions.push('activate');
  if (input.status === 'ACTIVE' && input.isSelling) actions.push('deactivate');
  if (input.status !== 'DRAFT' || input.usedOnSales) actions.push('renew');
  if (editable) actions.push('delete');
  return { allowedActions: actions, lockReason };
}
