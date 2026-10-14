import { addMoney, applyPercent, cmpMoney, money, mulMoney, roundToIncrement, subMoney } from '@dawaa/shared';

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

export function khartoumDayStart(now = new Date()): Date {
  return new Date(`${khartoumDate(now)}T00:00:00+02:00`);
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
  sales: { soldAt: string; docNo: string; customerName: string; total: string; paymentMethod: string; status: string }[];
  accounts: { receiptsToday: string; paymentsToday: string; customerDue: string; supplierDue: string };
  customers: { nameAr: string; nameEn: string; balance: string }[];
  products: { id: string; nameAr: string; nameEn: string; genericName: string; sku: string; form: string; sellPrice: string; qty: number }[];
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
  products: { id: string; nameAr: string; nameEn: string; genericName: string; sku: string; form: string; sellPrice: string; qty: number; reorderLevel: number }[];
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
    products: input.products.map((product) => ({
      id: product.id,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      genericName: product.genericName,
      sku: product.sku,
      form: product.form,
      sellPrice: product.sellPrice,
      qty: product.qty,
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
