import { addMoney, cmpMoney, money } from '@dawaa/shared';

export const ALERT_CATEGORIES = ['STOCK', 'EXPIRY', 'DEMAND', 'PROCUREMENT', 'PRICING', 'FINANCE', 'SAAS'] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'info';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'SNOOZED' | 'RESOLVED';

export type AlertThresholds = {
  nearDays: number;
  fastPct: number;
  slowDays: number;
  deadDays: number;
  expiryDays: number[];
  pricePct: number;
  minMargin: number;
  payDueDays: number;
  payTerms: number;
  historyDays: number;
  excessDays: number;
  poDelayDays: number;
  creditLimit: string;
  revenueDropPct: number;
  highValue: string;
};

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  nearDays: 14,
  fastPct: 50,
  slowDays: 60,
  deadDays: 180,
  expiryDays: [180, 90, 60, 30, 7],
  pricePct: 10,
  minMargin: 20,
  payDueDays: 7,
  payTerms: 30,
  historyDays: 30,
  excessDays: 180,
  poDelayDays: 14,
  creditLimit: '0.00',
  revenueDropPct: 25,
  highValue: '50000.00',
};

/** Bump when the standard parameters change, so untouched saved values move forward once. */
export const ALERT_STANDARD_VERSION = '2';

/** Values written by the previous standard. A pharmacy that saved one of these has not chosen its own limit. */
export const PREVIOUS_ALERT_DEFAULTS: Record<string, string> = {
  alertNearDays: '7',
  alertSlowDays: '30',
  alertDeadDays: '90',
  alertExpiryDays: '90,60,30,15,7',
  alertMinMargin: '15',
  alertPoDelayDays: '7',
  alertRevenueDropPct: '30',
  alertHighValue: '100000.00',
};

/** Standard pharmacy parameters. Stored on the tenant and shown in settings. */
export function defaultAlertSettings(): { key: string; value: string }[] {
  return [
    { key: 'alertNearDays', value: String(DEFAULT_THRESHOLDS.nearDays) },
    { key: 'alertFastPct', value: String(DEFAULT_THRESHOLDS.fastPct) },
    { key: 'alertSlowDays', value: String(DEFAULT_THRESHOLDS.slowDays) },
    { key: 'alertDeadDays', value: String(DEFAULT_THRESHOLDS.deadDays) },
    { key: 'alertExpiryDays', value: DEFAULT_THRESHOLDS.expiryDays.join(',') },
    { key: 'alertPricePct', value: String(DEFAULT_THRESHOLDS.pricePct) },
    { key: 'alertMinMargin', value: String(DEFAULT_THRESHOLDS.minMargin) },
    { key: 'alertPayDueDays', value: String(DEFAULT_THRESHOLDS.payDueDays) },
    { key: 'alertPayTerms', value: String(DEFAULT_THRESHOLDS.payTerms) },
    { key: 'alertHistoryDays', value: String(DEFAULT_THRESHOLDS.historyDays) },
    { key: 'alertExcessDays', value: String(DEFAULT_THRESHOLDS.excessDays) },
    { key: 'alertPoDelayDays', value: String(DEFAULT_THRESHOLDS.poDelayDays) },
    { key: 'alertCreditLimit', value: DEFAULT_THRESHOLDS.creditLimit },
    { key: 'alertRevenueDropPct', value: String(DEFAULT_THRESHOLDS.revenueDropPct) },
    { key: 'alertHighValue', value: DEFAULT_THRESHOLDS.highValue },
  ];
}

export const ALERT_SETTING_FIELDS: { key: string; kind: 'int' | 'money' | 'days' | 'list'; min: number; max: number }[] = [
  { key: 'alertNearDays', kind: 'int', min: 1, max: 60 },
  { key: 'alertFastPct', kind: 'int', min: 10, max: 300 },
  { key: 'alertSlowDays', kind: 'int', min: 7, max: 180 },
  { key: 'alertDeadDays', kind: 'int', min: 30, max: 365 },
  { key: 'alertExpiryDays', kind: 'list', min: 1, max: 365 },
  { key: 'alertPricePct', kind: 'int', min: 1, max: 100 },
  { key: 'alertMinMargin', kind: 'int', min: 0, max: 90 },
  { key: 'alertPayDueDays', kind: 'int', min: 0, max: 60 },
  { key: 'alertPayTerms', kind: 'int', min: 1, max: 180 },
  { key: 'alertHistoryDays', kind: 'int', min: 7, max: 180 },
  { key: 'alertExcessDays', kind: 'int', min: 30, max: 720 },
  { key: 'alertPoDelayDays', kind: 'int', min: 1, max: 90 },
  { key: 'alertCreditLimit', kind: 'money', min: 0, max: 1_000_000_000 },
  { key: 'alertRevenueDropPct', kind: 'int', min: 5, max: 100 },
  { key: 'alertHighValue', kind: 'money', min: 0, max: 1_000_000_000 },
];

const FIELD_BY_KEY = new Map(ALERT_SETTING_FIELDS.map((field) => [field.key, field]));

export type AlertDraft = {
  fingerprint: string;
  category: AlertCategory;
  severity: AlertSeverity;
  code: string;
  branchId: string | null;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  figureAr: string;
  figureEn: string;
  currentValue: string;
  thresholdValue: string;
  entityType: string;
  entityId: string;
  recommendedAr: string;
  recommendedEn: string;
  actionHref: string;
  estimate: boolean;
  exposure: string;
};

export type AlertFacts = {
  today: string;
  thresholds: AlertThresholds;
  branches: { id: string; nameAr: string; nameEn: string }[];
  products: {
    id: string;
    sku: string;
    nameAr: string;
    nameEn: string;
    reorderLevel: number;
    sellPrice: string;
    costPrice: string;
    createdOn: string;
  }[];
  lots: {
    id: string;
    branchId: string;
    productId: string;
    batchNo: string;
    expiry: string;
    qty: number;
    condition: string;
    unitCost: string | null;
  }[];
  movements: { lotId: string; productId: string; branchId: string; type: string; qty: number; on: string }[];
  sales: {
    id: string;
    branchId: string;
    docNo: string;
    on: string;
    subtotal: string;
    discount: string;
    total: string;
    paid: string;
    status: string;
  }[];
  lines: { saleId: string; productId: string; branchId: string; on: string; qty: number; lineTotal: string; costTotal: string; discount: string }[];
  purchases: {
    id: string;
    branchId: string;
    docNo: string;
    status: string;
    orderedOn: string;
    supplierId: string;
    supplierAr: string;
    supplierEn: string;
  }[];
  purchaseLines: { purchaseId: string; productId: string; qty: number; receivedQty: number; unitCost: string }[];
  receipts: { id: string; branchId: string; purchaseId: string | null; supplierId: string | null; docNo: string; status: string; receivedOn: string }[];
  receiptLines: { id: string; receiptId: string; productId: string; batchNo: string; qty: number; unitCost: string; receivedOn: string }[];
  suppliers: { id: string; nameAr: string; nameEn: string; balance: string }[];
  customers: { id: string; nameAr: string; nameEn: string; balance: string }[];
  prices: { productId: string; branchId: string; amount: string; active: boolean }[];
  priceChanges: { productId: string; oldAmount: string; newAmount: string; on: string; actorId: string | null }[];
  lists: { id: string; nameAr: string; nameEn: string; status: string; effectiveTo: string | null; effectiveFrom?: string | null }[];
  knownUserIds: string[];
  tenantStatus: string;
  readOnly: boolean;
  subscriptionEnd: string | null;
  subscriptionInvoices: { id: string; amount: string; status: string; dueOn: string }[];
};

export type StoredAlert = {
  id: string;
  fingerprint: string;
  status: AlertStatus;
  snoozeUntil: string | null;
  openedAt: string;
  escalatedAt: string | null;
};

export type SyncOp =
  | { op: 'create'; draft: AlertDraft }
  | { op: 'update'; id: string; draft: AlertDraft; status: AlertStatus; reopen: boolean; escalate: boolean }
  | { op: 'resolve'; id: string };

export type SummaryCard = { id: string; count: number; exposure: string };
export type AlertCharts = {
  categories: { id: string; count: number }[];
  severities: { id: AlertSeverity; count: number }[];
  stock: { out: number; low: number; expiring: number; excess: number; negative: number };
  exposure: { expiry: string; pricing: string; payable: string; receivable: string };
  trend: { day: string; count: number }[];
  trendMode: 'history' | 'snapshot';
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
const MIN_RATE_DAYS = 7;

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function settingKey(base: string, branchId: string | null): string {
  return branchId ? `${base}@${branchId}` : base;
}

export function assertAlertSetting(key: string, value: string): void {
  const base = key.split('@')[0] ?? key;
  const field = FIELD_BY_KEY.get(base);
  if (!field) return;
  if (field.kind === 'list') {
    const days = value.split(',').map((part) => Number(part.trim())).filter((part) => Number.isInteger(part));
    if (days.length === 0 || days.some((part) => part < field.min || part > field.max)) {
      throw new Error('VALIDATION_ERROR');
    }
    return;
  }
  if (field.kind === 'money') {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('VALIDATION_ERROR');
    const amount = Number(value);
    if (amount < field.min || amount > field.max) throw new Error('VALIDATION_ERROR');
    return;
  }
  if (!/^\d+$/.test(value)) throw new Error('VALIDATION_ERROR');
  const amount = Number(value);
  if (amount < field.min || amount > field.max) throw new Error('VALIDATION_ERROR');
}

export function thresholdsFrom(rows: { key: string; value: string }[], branchId: string | null): AlertThresholds {
  const next = { ...DEFAULT_THRESHOLDS, expiryDays: [...DEFAULT_THRESHOLDS.expiryDays] };
  const apply = (key: string, value: string) => {
    const base = key.split('@')[0] ?? key;
    if (branchId && key.includes('@') && !key.endsWith(`@${branchId}`)) return;
    if (!branchId && key.includes('@')) return;
    const parsed = readField(base, value);
    if (!parsed) return;
    Object.assign(next, parsed);
  };
  for (const row of rows) if (!row.key.includes('@')) apply(row.key, row.value);
  if (branchId) for (const row of rows) if (row.key.endsWith(`@${branchId}`)) apply(row.key, row.value);
  next.expiryDays = [...next.expiryDays].sort((left, right) => right - left);
  return next;
}

function readField(key: string, value: string): Partial<AlertThresholds> | null {
  try {
    assertAlertSetting(key, value);
  } catch {
    return null;
  }
  const days = () => Number(value);
  if (key === 'alertNearDays') return { nearDays: days() };
  if (key === 'alertFastPct') return { fastPct: days() };
  if (key === 'alertSlowDays') return { slowDays: days() };
  if (key === 'alertDeadDays') return { deadDays: days() };
  if (key === 'alertExpiryDays') return { expiryDays: value.split(',').map((part) => Number(part.trim())) };
  if (key === 'alertPricePct') return { pricePct: days() };
  if (key === 'alertMinMargin') return { minMargin: days() };
  if (key === 'alertPayDueDays') return { payDueDays: days() };
  if (key === 'alertPayTerms') return { payTerms: days() };
  if (key === 'alertHistoryDays') return { historyDays: days() };
  if (key === 'alertExcessDays') return { excessDays: days() };
  if (key === 'alertPoDelayDays') return { poDelayDays: days() };
  if (key === 'alertCreditLimit') return { creditLimit: money(value) };
  if (key === 'alertRevenueDropPct') return { revenueDropPct: days() };
  if (key === 'alertHighValue') return { highValue: money(value) };
  return null;
}

export function allowedCategories(perms: readonly string[]): AlertCategory[] {
  const set = new Set(perms);
  const out: AlertCategory[] = [];
  if (set.has('stock.count')) out.push('STOCK', 'EXPIRY', 'DEMAND');
  if (set.has('purchasing.receive')) out.push('PROCUREMENT');
  if (set.has('reports.view') || set.has('users.manage')) out.push('PRICING');
  if (set.has('accounting.view')) out.push('FINANCE');
  if (set.has('users.manage')) out.push('SAAS');
  return out;
}

export function canAssignAlerts(perms: readonly string[]): boolean {
  const set = new Set(perms);
  return set.has('users.manage') || set.has('stock.adjust');
}

export function canConfigureAlerts(perms: readonly string[]): boolean {
  const set = new Set(perms);
  return set.has('users.manage') || (set.has('stock.adjust') && set.has('accounting.view'));
}

export function snoozeAllowed(severity: AlertSeverity, days: number): boolean {
  if (!Number.isInteger(days) || days < 1 || days > 7) return false;
  if (severity === 'critical') return false;
  if (severity === 'high') return days === 1;
  return true;
}

export function evaluateAlerts(facts: AlertFacts): AlertDraft[] {
  const found = new Map<string, AlertDraft>();
  const put = (draft: AlertDraft) => {
    if (!found.has(draft.fingerprint)) found.set(draft.fingerprint, draft);
  };
  stockAlerts(facts, put);
  expiryAlerts(facts, put);
  demandAlerts(facts, put);
  procurementAlerts(facts, put);
  pricingAlerts(facts, put);
  financeAlerts(facts, put);
  saasAlerts(facts, put);
  return [...found.values()];
}

export function planSync(live: AlertDraft[], stored: StoredAlert[], nowIso: string): SyncOp[] {
  const byPrint = new Map(stored.map((row) => [row.fingerprint, row]));
  const livePrints = new Set(live.map((row) => row.fingerprint));
  const ops: SyncOp[] = [];
  for (const draft of live) {
    const current = byPrint.get(draft.fingerprint);
    if (!current) {
      ops.push({ op: 'create', draft });
      continue;
    }
    const snoozed = current.status === 'SNOOZED' && current.snoozeUntil !== null && current.snoozeUntil > nowIso;
    const reopen = current.status === 'RESOLVED' || (current.status === 'SNOOZED' && !snoozed);
    const status: AlertStatus = reopen ? 'OPEN' : snoozed ? 'SNOOZED' : current.status;
    const ageHours = (new Date(nowIso).getTime() - new Date(current.openedAt).getTime()) / 3_600_000;
    const sinceEscalate = current.escalatedAt ? (new Date(nowIso).getTime() - new Date(current.escalatedAt).getTime()) / 3_600_000 : 999;
    const escalate = draft.severity === 'critical' && status === 'OPEN' && ageHours >= 24 && sinceEscalate >= 24;
    ops.push({ op: 'update', id: current.id, draft, status, reopen, escalate });
  }
  for (const current of stored) {
    if (current.status !== 'RESOLVED' && !livePrints.has(current.fingerprint)) ops.push({ op: 'resolve', id: current.id });
  }
  return ops;
}

export function planNotices(input: {
  today: string;
  prefs: { immediate: boolean; daily: boolean; weekly: boolean };
  active: { fingerprint: string; severity: AlertSeverity; openedOn: string; escalated: boolean; titleAr: string; titleEn: string }[];
  existing: string[];
}): { kind: string; fingerprint: string; periodKey: string; titleAr: string; titleEn: string; bodyAr: string; bodyEn: string }[] {
  const have = new Set(input.existing);
  const notices: { kind: string; fingerprint: string; periodKey: string; titleAr: string; titleEn: string; bodyAr: string; bodyEn: string }[] = [];
  const push = (notice: (typeof notices)[number]) => {
    const key = `${notice.kind}|${notice.fingerprint}|${notice.periodKey}`;
    if (have.has(key)) return;
    have.add(key);
    notices.push(notice);
  };
  if (input.prefs.immediate) {
    for (const alert of input.active.filter((row) => row.severity === 'critical')) {
      push({
        kind: 'IMMEDIATE',
        fingerprint: alert.fingerprint,
        periodKey: alert.openedOn,
        titleAr: alert.titleAr,
        titleEn: alert.titleEn,
        bodyAr: 'تنبيه حرج يحتاج إجراءً الآن.',
        bodyEn: 'A critical alert needs action now.',
      });
    }
  }
  const openCount = input.active.length;
  if (input.prefs.daily && openCount > 0) {
    push({
      kind: 'DAILY',
      fingerprint: 'summary',
      periodKey: input.today,
      titleAr: 'ملخص تنبيهات اليوم',
      titleEn: 'Daily alert summary',
      bodyAr: `${openCount} تنبيهاً مفتوحاً.`,
      bodyEn: `${openCount} open alerts.`,
    });
  }
  if (input.prefs.weekly && openCount > 0) {
    push({
      kind: 'WEEKLY',
      fingerprint: 'summary',
      periodKey: `W:${weekStart(input.today)}`,
      titleAr: 'ملخص تنبيهات الأسبوع',
      titleEn: 'Weekly alert summary',
      bodyAr: `${openCount} تنبيهاً مفتوحاً هذا الأسبوع.`,
      bodyEn: `${openCount} open alerts this week.`,
    });
  }
  for (const alert of input.active.filter((row) => row.escalated)) {
    push({
      kind: 'ESCALATION',
      fingerprint: alert.fingerprint,
      periodKey: input.today,
      titleAr: `تصعيد: ${alert.titleAr}`,
      titleEn: `Escalation: ${alert.titleEn}`,
      bodyAr: 'تنبيه حرج ما زال بلا معالجة منذ أكثر من يوم.',
      bodyEn: 'A critical alert is still unresolved after a day.',
    });
  }
  return notices;
}

export function summaryCards(alerts: { category: string; severity: string; code: string; exposure: string }[]): SummaryCard[] {
  const groups: { id: string; match: (alert: { category: string; severity: string; code: string; exposure: string }) => boolean }[] = [
    { id: 'critical', match: (alert) => alert.severity === 'critical' },
    { id: 'expiry', match: (alert) => alert.category === 'EXPIRY' },
    { id: 'stock', match: (alert) => ['OUT_OF_STOCK', 'LOW_STOCK', 'BELOW_MIN', 'NEAR_STOCKOUT'].includes(alert.code) },
    { id: 'fast', match: (alert) => ['FAST', 'SPIKE', 'FAST_LOW'].includes(alert.code) },
    { id: 'slow', match: (alert) => alert.code === 'SLOW' || alert.code.startsWith('DEAD') },
    { id: 'excess', match: (alert) => alert.code === 'EXCESS' },
    { id: 'procurement', match: (alert) => alert.category === 'PROCUREMENT' },
    { id: 'pricing', match: (alert) => alert.category === 'PRICING' },
    { id: 'payments', match: (alert) => ['DUE_SOON', 'OVERDUE', 'UNPAID', 'CREDIT_LIMIT', 'CUSTOMER_DUE'].includes(alert.code) },
    { id: 'profit', match: (alert) => ['REVENUE_DROP', 'MARGIN_DROP', 'DISCOUNT', 'REFUND'].includes(alert.code) },
    { id: 'discrepancy', match: (alert) => ['DISCREPANCY', 'ADJUST', 'NEGATIVE', 'QTY_MISMATCH'].includes(alert.code) },
  ];
  return groups.map((group) => {
    const rows = alerts.filter(group.match);
    return { id: group.id, count: rows.length, exposure: sumExposure(rows) };
  });
}

export function buildCharts(alerts: { category: string; severity: string; code: string; exposure: string }[], events: { on: string; kind: string }[], today: string): AlertCharts {
  const categories = ALERT_CATEGORIES.map((id) => ({ id, count: alerts.filter((alert) => alert.category === id).length }));
  const severities = (['critical', 'high', 'medium', 'info'] as const).map((id) => ({
    id,
    count: alerts.filter((alert) => alert.severity === id).length,
  }));
  const stock = {
    out: alerts.filter((alert) => alert.code === 'OUT_OF_STOCK').length,
    low: alerts.filter((alert) => alert.code === 'LOW_STOCK' || alert.code === 'BELOW_MIN' || alert.code === 'NEAR_STOCKOUT').length,
    expiring: alerts.filter((alert) => alert.category === 'EXPIRY').length,
    excess: alerts.filter((alert) => alert.code === 'EXCESS').length,
    negative: alerts.filter((alert) => alert.code === 'NEGATIVE').length,
  };
  const exposure = {
    expiry: sumExposure(alerts.filter((alert) => alert.category === 'EXPIRY')),
    pricing: sumExposure(alerts.filter((alert) => alert.category === 'PRICING')),
    payable: sumExposure(alerts.filter((alert) => alert.code === 'OVERDUE' || alert.code === 'DUE_SOON')),
    receivable: sumExposure(alerts.filter((alert) => alert.code === 'CUSTOMER_DUE' || alert.code === 'CREDIT_LIMIT' || alert.code === 'UNPAID')),
  };
  const opened = events.filter((event) => event.kind === 'OPENED' || event.kind === 'REOPENED');
  const days = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13));
  if (opened.length === 0) {
    return {
      categories,
      severities,
      stock,
      exposure,
      trend: [{ day: today, count: alerts.length }],
      trendMode: 'snapshot',
    };
  }
  return {
    categories,
    severities,
    stock,
    exposure,
    trend: days.map((day) => ({ day, count: opened.filter((event) => event.on === day).length })),
    trendMode: 'history',
  };
}

export function sortAlerts<T extends { severity: AlertSeverity; openedAt: string }>(rows: T[], mode: 'severity' | 'newest' | 'oldest'): T[] {
  const copy = [...rows];
  if (mode === 'oldest') return copy.sort((left, right) => left.openedAt.localeCompare(right.openedAt));
  if (mode === 'newest') return copy.sort((left, right) => right.openedAt.localeCompare(left.openedAt));
  return copy.sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] || right.openedAt.localeCompare(left.openedAt));
}

export function legacySeverity(severity: AlertSeverity): 'urgent' | 'watch' | 'info' {
  if (severity === 'critical' || severity === 'high') return 'urgent';
  if (severity === 'medium') return 'watch';
  return 'info';
}

function stockAlerts(facts: AlertFacts, put: (draft: AlertDraft) => void) {
  const branches = facts.branches.length > 0 ? facts.branches : [{ id: '', nameAr: '', nameEn: '' }];
  for (const branch of branches) {
    for (const product of facts.products) {
      const carried =
        facts.branches.length === 1 ||
        facts.lots.some((lot) => lot.productId === product.id && lot.branchId === branch.id) ||
        facts.lines.some((line) => line.productId === product.id && line.branchId === branch.id);
      if (!carried) continue;
      const mine = facts.lots.filter((lot) => lot.productId === product.id && lot.branchId === branch.id);
      const raw = mine.reduce((sum, lot) => sum + lot.qty, 0);
      const qty = mine.reduce((sum, lot) => sum + (sellableLot(lot, facts.today) ? lot.qty : 0), 0);
      const href = `/app/inventory?q=${encodeURIComponent(product.sku)}`;
      if (raw < 0) {
        put(draftOf(facts, {
          category: 'STOCK',
          severity: 'critical',
          code: 'NEGATIVE',
          branchId: branch.id || null,
          product,
          href,
          current: String(raw),
          threshold: '0',
          figureAr: `${raw}`,
          figureEn: `${raw}`,
          titleAr: `مخزون سالب: ${product.nameAr}`,
          titleEn: `Negative stock: ${product.nameEn}`,
          detailAr: 'الكمية المسجلة أقل من صفر. راجع حركات المخزون قبل أي بيع.',
          detailEn: 'The recorded quantity is below zero. Review stock movements before any sale.',
          actionAr: 'راجع حركات الصنف وصحح الرصيد.',
          actionEn: 'Review the movements and correct the balance.',
          estimate: false,
          exposure: '0.00',
          entityType: 'Product',
          entityId: product.id,
        }));
      } else if (qty === 0 && product.reorderLevel > 0) {
        put(draftOf(facts, {
          category: 'STOCK',
          severity: 'critical',
          code: 'OUT_OF_STOCK',
          branchId: branch.id || null,
          product,
          href,
          current: '0',
          threshold: String(product.reorderLevel),
          figureAr: '0',
          figureEn: '0',
          titleAr: `نفاد: ${product.nameAr}`,
          titleEn: `Out of stock: ${product.nameEn}`,
          detailAr: `حد الطلب ${product.reorderLevel} والمتوفر 0.`,
          detailEn: `Reorder level is ${product.reorderLevel} and none is on hand.`,
          actionAr: 'أنشئ طلب شراء أو انقل كمية من فرع آخر.',
          actionEn: 'Create a purchase request or transfer stock from another branch.',
          estimate: false,
          exposure: '0.00',
          entityType: 'Product',
          entityId: product.id,
        }));
      } else if (qty > 0 && qty < product.reorderLevel) {
        put(draftOf(facts, {
          category: 'STOCK',
          severity: 'high',
          code: 'BELOW_MIN',
          branchId: branch.id || null,
          product,
          href,
          current: String(qty),
          threshold: String(product.reorderLevel),
          figureAr: `${qty}`,
          figureEn: `${qty}`,
          titleAr: `تحت الحد: ${product.nameAr}`,
          titleEn: `Below minimum: ${product.nameEn}`,
          detailAr: `المتوفر ${qty} والحد ${product.reorderLevel}.`,
          detailEn: `On hand ${qty}, minimum ${product.reorderLevel}.`,
          actionAr: 'اطلب الكمية قبل النفاد.',
          actionEn: 'Order more before it runs out.',
          estimate: false,
          exposure: '0.00',
          entityType: 'Product',
          entityId: product.id,
        }));
      } else if (qty > 0 && product.reorderLevel > 0 && qty === product.reorderLevel) {
        put(draftOf(facts, {
          category: 'STOCK',
          severity: 'medium',
          code: 'LOW_STOCK',
          branchId: branch.id || null,
          product,
          href,
          current: String(qty),
          threshold: String(product.reorderLevel),
          figureAr: `${qty}`,
          figureEn: `${qty}`,
          titleAr: `عند حد الطلب: ${product.nameAr}`,
          titleEn: `At reorder level: ${product.nameEn}`,
          detailAr: `المتوفر يساوي حد الطلب ${product.reorderLevel}.`,
          detailEn: `On hand equals the reorder level ${product.reorderLevel}.`,
          actionAr: 'راجع الحاجة للشراء.',
          actionEn: 'Review whether to purchase.',
          estimate: false,
          exposure: '0.00',
          entityType: 'Product',
          entityId: product.id,
        }));
      }
      const rate = salesRate(facts, product.id, branch.id, addDays(facts.today, 1 - facts.thresholds.historyDays), facts.today, qty);
      if (qty > 0 && rate && rate.perDay > 0) {
        const daysLeft = qty / rate.perDay;
        if (daysLeft <= facts.thresholds.nearDays) {
          put(draftOf(facts, {
            category: 'STOCK',
            severity: 'high',
            code: 'NEAR_STOCKOUT',
            branchId: branch.id || null,
            product,
            href,
            current: daysLeft.toFixed(1),
            threshold: String(facts.thresholds.nearDays),
            figureAr: `${daysLeft.toFixed(1)} يوم تقديراً`,
            figureEn: `${daysLeft.toFixed(1)} estimated days`,
            titleAr: `قرب النفاد: ${product.nameAr}`,
            titleEn: `Near stockout: ${product.nameEn}`,
            detailAr: `تقدير من متوسط البيع اليومي بعد استبعاد أيام النفاد. المتوفر ${qty}.`,
            detailEn: `Estimate from average daily sales, excluding stockout days. On hand ${qty}.`,
            actionAr: 'جهّز الشراء قبل يوم النفاد التقديري.',
            actionEn: 'Prepare a purchase before the estimated stockout day.',
            estimate: true,
            exposure: '0.00',
            entityType: 'Product',
            entityId: product.id,
          }));
        }
        if (daysLeft >= facts.thresholds.excessDays && qty > product.reorderLevel) {
          put(draftOf(facts, {
            category: 'STOCK',
            severity: 'medium',
            code: 'EXCESS',
            branchId: branch.id || null,
            product,
            href,
            current: daysLeft.toFixed(0),
            threshold: String(facts.thresholds.excessDays),
            figureAr: `${qty}`,
            figureEn: `${qty}`,
            titleAr: `مخزون زائد: ${product.nameAr}`,
            titleEn: `Excess inventory: ${product.nameEn}`,
            detailAr: `تقدير تغطية ${daysLeft.toFixed(0)} يوماً، فوق ${facts.thresholds.excessDays} يوماً.`,
            detailEn: `Estimated cover is ${daysLeft.toFixed(0)} days, above ${facts.thresholds.excessDays} days.`,
            actionAr: 'أوقف الشراء أو انقل الكمية الزائدة.',
            actionEn: 'Stop buying or transfer the extra quantity.',
            estimate: true,
            exposure: mul(product.costPrice, qty),
            entityType: 'Product',
            entityId: product.id,
          }));
        }
      }
    }
  }
  const moved = new Map<string, number>();
  const counted = new Set<string>();
  for (const movement of facts.movements) {
    moved.set(movement.lotId, (moved.get(movement.lotId) ?? 0) + movement.qty);
    counted.add(movement.lotId);
    if (movement.type === 'ADJUST' && Math.abs(movement.qty) >= 10 && daysBetween(movement.on, facts.today) <= 14) {
      const product = facts.products.find((row) => row.id === movement.productId);
      put(draftOf(facts, {
        category: 'STOCK',
        severity: 'medium',
        code: 'ADJUST',
        branchId: movement.branchId,
        product,
        href: product ? `/app/inventory?q=${encodeURIComponent(product.sku)}` : '/app/inventory',
        current: String(movement.qty),
        threshold: '10',
        figureAr: `${movement.qty}`,
        figureEn: `${movement.qty}`,
        titleAr: `تسوية غير معتادة${product ? `: ${product.nameAr}` : ''}`,
        titleEn: `Unusual adjustment${product ? `: ${product.nameEn}` : ''}`,
        detailAr: `حركة تسوية بتاريخ ${movement.on}.`,
        detailEn: `Adjustment posted on ${movement.on}.`,
        actionAr: 'راجع سبب التسوية ومن اعتمدها.',
        actionEn: 'Review why the adjustment was posted.',
        estimate: false,
        exposure: '0.00',
        entityType: 'StockLot',
        entityId: movement.lotId,
      }));
    }
  }
  for (const lot of facts.lots) {
    if (counted.has(lot.id) && (moved.get(lot.id) ?? 0) !== lot.qty) {
      const product = facts.products.find((row) => row.id === lot.productId);
      put(draftOf(facts, {
        category: 'STOCK',
        severity: 'high',
        code: 'DISCREPANCY',
        branchId: lot.branchId,
        product,
        href: product ? `/app/inventory?q=${encodeURIComponent(product.sku)}` : '/app/inventory',
        current: String(lot.qty),
        threshold: String(moved.get(lot.id) ?? 0),
        figureAr: `${lot.qty}`,
        figureEn: `${lot.qty}`,
        titleAr: `فرق مخزون${product ? `: ${product.nameAr}` : ''}`,
        titleEn: `Stock discrepancy${product ? `: ${product.nameEn}` : ''}`,
        detailAr: `التشغيلة ${lot.batchNo || '—'} كميتها ${lot.qty} ومجموع الحركات ${moved.get(lot.id) ?? 0}.`,
        detailEn: `Batch ${lot.batchNo || '—'} shows ${lot.qty} while movements sum to ${moved.get(lot.id) ?? 0}.`,
        actionAr: 'طابق الكمية مع سجل الحركات.',
        actionEn: 'Match the quantity to the movement ledger.',
        estimate: false,
        exposure: '0.00',
        entityType: 'StockLot',
        entityId: lot.id,
      }));
    }
    if (lot.qty > 0 && lot.condition !== 'AVAILABLE') {
      const product = facts.products.find((row) => row.id === lot.productId);
      put(draftOf(facts, {
        category: 'STOCK',
        severity: lot.condition === 'QUARANTINE' ? 'high' : 'medium',
        code: 'UNAVAILABLE',
        branchId: lot.branchId,
        product,
        href: product ? `/app/inventory?q=${encodeURIComponent(product.sku)}` : '/app/inventory',
        current: lot.condition,
        threshold: 'AVAILABLE',
        figureAr: `${lot.qty}`,
        figureEn: `${lot.qty}`,
        titleAr: `مخزون غير متاح${product ? `: ${product.nameAr}` : ''}`,
        titleEn: `Unavailable stock${product ? `: ${product.nameEn}` : ''}`,
        detailAr: `التشغيلة ${lot.batchNo || '—'} حالتها ${lot.condition}.`,
        detailEn: `Batch ${lot.batchNo || '—'} is ${lot.condition}.`,
        actionAr: 'أبقه خارج البيع حتى تُحسم حالته.',
        actionEn: 'Keep it unsellable until the condition is decided.',
        estimate: false,
        exposure: lotValue(lot, product),
        entityType: 'StockLot',
        entityId: lot.id,
      }));
    }
  }
}

function expiryAlerts(facts: AlertFacts, put: (draft: AlertDraft) => void) {
  const slowIds = new Set(slowProductIds(facts));
  for (const lot of facts.lots) {
    if (lot.qty <= 0) continue;
    const product = facts.products.find((row) => row.id === lot.productId);
    const href = product ? `/app/inventory?q=${encodeURIComponent(product.sku)}` : '/app/inventory';
    const value = lotValue(lot, product);
    const left = lot.expiry ? daysBetween(facts.today, lot.expiry) : null;
    if (!lot.expiry) {
      put(expiryDraft(facts, lot, product, href, 'MISSING_EXPIRY', 'high', 'expiry', '—', 'تاريخ الصلاحية ناقص', 'Expiry date is missing', 'أدخل تاريخ الصلاحية.', 'Enter the expiry date.', value, false));
      continue;
    }
    if (left !== null && left < 0) {
      const sellable = lot.condition === 'AVAILABLE';
      put(expiryDraft(
        facts,
        lot,
        product,
        href,
        sellable ? 'EXPIRED_SELLABLE' : 'EXPIRED',
        'critical',
        String(lot.qty),
        lot.expiry,
        sellable ? 'منته وما زال قابلاً للبيع' : 'منته الصلاحية',
        sellable ? 'Expired and still sellable' : 'Already expired',
        'أوقف البيع وأخرج التشغيلة.',
        'Stop sales and remove the batch.',
        value,
        false,
      ));
      continue;
    }
    const bucket = left === null ? null : [...facts.thresholds.expiryDays].sort((leftDay, rightDay) => leftDay - rightDay).find((day) => left <= day);
    if (bucket === undefined || bucket === null || left === null) continue;
    const high = cmpMoney(value, facts.thresholds.highValue) >= 0;
    const slow = slowIds.has(`${lot.branchId}:${lot.productId}`);
    const code = high ? 'EXPIRY_VALUE' : slow ? 'EXPIRY_SLOW' : `EXPIRY_${bucket}`;
    const severity: AlertSeverity = bucket <= 7 || (high && bucket <= 30) ? 'critical' : bucket <= 30 || high ? 'high' : 'medium';
    put(expiryDraft(
      facts,
      lot,
      product,
      href,
      code,
      severity,
      String(lot.qty),
      String(bucket),
      high ? 'قيمة عالية قرب الانتهاء' : slow ? 'بطيء الحركة وقرب الانتهاء' : `ينتهي خلال ${bucket} يوماً`,
      high ? 'High value nearing expiry' : slow ? 'Slow stock nearing expiry' : `Expires within ${bucket} days`,
      'خفّض أو أرجع أو انقل التشغيلة قبل انتهاء الصلاحية.',
      'Discount, return, or transfer the batch before it expires.',
      value,
      false,
    ));
  }
}

function demandAlerts(facts: AlertFacts, put: (draft: AlertDraft) => void) {
  const { today, thresholds } = facts;
  for (const branch of facts.branches) {
    let recentMoney = '0.00';
    let priorMoney = '0.00';
    for (const sale of facts.sales.filter((row) => row.branchId === branch.id && row.status === 'POSTED')) {
      const age = daysBetween(sale.on, today);
      if (age <= 6) recentMoney = addMoney(recentMoney, sale.total);
      else if (age <= 13) priorMoney = addMoney(priorMoney, sale.total);
    }
    if (cmpMoney(priorMoney, '0.00') > 0) {
      const drop = ((Number(priorMoney) - Number(recentMoney)) / Number(priorMoney)) * 100;
      if (drop >= thresholds.revenueDropPct) {
        put(branchDraft(facts, branch.id, 'FINANCE', 'high', 'REVENUE_DROP', '/app/reports', recentMoney, priorMoney, `${drop.toFixed(0)}%`, 'انخفاض الإيراد', 'Revenue decline', `إيراد 7 أيام ${recentMoney} مقابل ${priorMoney} في الأسبوع السابق. هذا تقدير من المبيعات المرحلة.`, `Seven-day revenue is ${recentMoney} against ${priorMoney} the week before. This is an estimate from posted sales.`, 'راجع المبيعات والأصناف الراكدة.', 'Review sales and slow items.', true, recentMoney));
      }
    }
    const margin = marginOf(facts, branch.id, addDays(today, -13), today);
    if (margin && margin.pct < thresholds.minMargin) {
      put(branchDraft(facts, branch.id, 'FINANCE', margin.pct < 0 ? 'high' : 'medium', 'MARGIN_DROP', '/app/reports', margin.pct.toFixed(1), String(thresholds.minMargin), `${margin.pct.toFixed(1)}%`, 'هامش الربح منخفض', 'Profit margin is low', `هامش آخر 14 يوماً ${margin.pct.toFixed(1)}% والحد ${thresholds.minMargin}%.`, `The last 14 days margin is ${margin.pct.toFixed(1)}% and the minimum is ${thresholds.minMargin}%.`, 'راجع التسعير والتكلفة.', 'Review prices and cost.', false, '0.00'));
    }
    for (const product of facts.products) {
      const mine = facts.lots.filter((lot) => lot.branchId === branch.id && lot.productId === product.id);
      const qty = mine.reduce((sum, lot) => sum + (lot.qty > 0 ? lot.qty : 0), 0);
      const sellable = mine.reduce((sum, lot) => sum + (sellableLot(lot, today) ? lot.qty : 0), 0);
      const href = `/app/inventory?q=${encodeURIComponent(product.sku)}`;
      const age = daysBetween(product.createdOn, today);
      const sold = (days: number) => unitsBetween(facts, product.id, branch.id, addDays(today, 1 - days), today);
      const dead180 = age >= 180 && sold(180) === 0 && qty > 0;
      const deadConfigured = age >= thresholds.deadDays && sold(thresholds.deadDays) === 0 && qty > 0;
      const dead60 = age >= 60 && sold(60) === 0 && qty > 0;
      if (dead180 || deadConfigured || dead60) {
        const window = dead180 ? 180 : deadConfigured ? thresholds.deadDays : 60;
        put(productDraft(facts, branch.id, product, 'DEMAND', window >= thresholds.deadDays ? 'high' : 'medium', window === 60 && window !== thresholds.deadDays ? 'DEAD_60' : 'DEAD', href, '0', String(window), `${qty}`, `راكد ${window} يوماً: ${product.nameAr}`, `Dead stock ${window} days: ${product.nameEn}`, `لا مبيعات خلال ${window} يوماً والكمية ${qty}.`, `No sales for ${window} days and quantity is ${qty}.`, 'اعرضه أو انقله أو أوقفه عن الشراء.', 'Promote it, transfer it, or stop buying it.', false, mul(product.costPrice, qty)));
      } else if (age >= thresholds.slowDays && qty > 0) {
        const units = sold(thresholds.slowDays);
        const cap = Math.max(2, Math.floor(product.reorderLevel * 0.15));
        if (units > 0 && units <= cap) {
          put(productDraft(facts, branch.id, product, 'DEMAND', 'medium', 'SLOW', href, String(units), String(cap), `${units}`, `بطيء الحركة: ${product.nameAr}`, `Slow moving: ${product.nameEn}`, `${units} وحدة خلال ${thresholds.slowDays} يوماً.`, `${units} units in ${thresholds.slowDays} days.`, 'راجع العرض أو النقل.', 'Review a promotion or a transfer.', false, mul(product.costPrice, qty)));
        }
      }
      const recentFrom = addDays(today, -6);
      const baseTo = addDays(today, -7);
      const baseFrom = addDays(baseTo, 1 - thresholds.historyDays);
      const recent = salesRate(facts, product.id, branch.id, recentFrom, today, sellable);
      const base = salesRate(facts, product.id, branch.id, baseFrom, baseTo, sellable);
      const fast = Boolean(recent && base && base.perDay > 0 && recent.units >= 5 && recent.perDay >= base.perDay * (1 + thresholds.fastPct / 100));
      if (fast && recent && base) {
        put(productDraft(facts, branch.id, product, 'DEMAND', 'info', 'FAST', href, recent.perDay.toFixed(2), base.perDay.toFixed(2), recent.perDay.toFixed(1), `سريع البيع: ${product.nameAr}`, `Fast selling: ${product.nameEn}`, `تقدير: ${recent.perDay.toFixed(1)} يومياً مقابل أساس ${base.perDay.toFixed(1)}.`, `Estimate: ${recent.perDay.toFixed(1)} a day against a baseline of ${base.perDay.toFixed(1)}.`, 'تأكد أن المخزون يغطي الطلب.', 'Make sure stock covers the demand.', true, '0.00'));
        const cover = recent.perDay > 0 ? sellable / recent.perDay : 999;
        if (sellable <= product.reorderLevel || cover <= thresholds.nearDays) {
          put(productDraft(facts, branch.id, product, 'DEMAND', 'critical', 'FAST_LOW', `/app/purchasing?sku=${encodeURIComponent(product.sku)}`, String(sellable), String(product.reorderLevel), `${sellable}`, `سريع البيع ومخزونه لا يكفي: ${product.nameAr}`, `Fast seller with low stock: ${product.nameEn}`, 'الطلب المرتفع أعلى من تغطية المخزون الحالية. التقدير من سجل البيع.', 'Demand is ahead of the stock cover. The rate is estimated from sales history.', 'أنشئ طلب شراء الآن.', 'Create a purchase request now.', true, '0.00'));
        }
      }
      const prior = salesRate(facts, product.id, branch.id, addDays(today, -13), addDays(today, -7), qty);
      if (recent && prior && prior.units >= 4 && recent.units >= 8 && recent.units >= prior.units * 1.5) {
        put(productDraft(facts, branch.id, product, 'DEMAND', 'medium', 'SPIKE', href, String(recent.units), String(prior.units), `${recent.units}`, `قفزة طلب: ${product.nameAr}`, `Demand spike: ${product.nameEn}`, `تقدير: ${recent.units} وحدة في 7 أيام مقابل ${prior.units} في الأسبوع السابق.`, `Estimate: ${recent.units} units in 7 days against ${prior.units} the week before.`, 'راجع حد الطلب.', 'Review the reorder level.', true, '0.00'));
      }
      const last = unitsBetween(facts, product.id, branch.id, addDays(today, -13), today);
      const before = unitsBetween(facts, product.id, branch.id, addDays(today, -27), addDays(today, -14));
      if (before >= 10 && last < before * 0.5) {
        put(productDraft(facts, branch.id, product, 'DEMAND', 'medium', 'DECLINE', href, String(last), String(before), `${last}`, `تراجع بيع: ${product.nameAr}`, `Sales decline: ${product.nameEn}`, `تقدير: ${last} وحدة في 14 يوماً مقابل ${before} قبلها.`, `Estimate: ${last} units in 14 days against ${before} before that.`, 'تحقق من التوفر والسعر.', 'Check availability and price.', true, '0.00'));
      }
    }
  }
  for (const sale of facts.sales) {
    if (sale.status === 'REFUND' || sale.status === 'VOID' || sale.status === 'RETURN' || Number(sale.total) < 0) {
      put(branchDraft(facts, sale.branchId, 'DEMAND', 'high', 'REFUND', '/app/sales', sale.total, '0.00', sale.docNo, `مرتجع غير معتاد ${sale.docNo}`, `Unusual refund ${sale.docNo}`, `الحالة ${sale.status}.`, `Status ${sale.status}.`, 'راجع المرتجع قبل إقفال الوردية.', 'Review the refund before closing the shift.', false, sale.total.replace('-', '')));
    }
    const base = Number(sale.subtotal);
    if (sale.status === 'POSTED' && base > 0 && Number(sale.discount) / base >= 0.25) {
      put(branchDraft(facts, sale.branchId, 'PRICING', 'medium', 'DISCOUNT', '/app/sales', sale.discount, '25%', sale.docNo, `خصم مرتفع ${sale.docNo}`, `High discount ${sale.docNo}`, `الخصم ${sale.discount} من أصل ${sale.subtotal}.`, `Discount ${sale.discount} on ${sale.subtotal}.`, 'تأكد أن الخصم مصرح.', 'Confirm the discount was allowed.', false, sale.discount));
    }
  }
}

function procurementAlerts(facts: AlertFacts, put: (draft: AlertDraft) => void) {
  for (const order of facts.purchases) {
    if (order.status === 'CANCELLED' || order.status === 'RECEIVED') continue;
    const age = daysBetween(order.orderedOn, facts.today);
    const href = '/app/purchasing';
    if (order.status === 'DRAFT') {
      put(orderDraft(facts, order, 'PO_DRAFT', 'medium', href, order.status, 'اعتماد', 'أمر شراء بانتظار الاعتماد', 'Purchase order waiting for approval', 'الأمر لم يُعتمد بعد.', 'The order is not approved yet.', 'اعتمد الأمر أو ألغه.', 'Approve the order or cancel it.'));
    }
    if ((order.status === 'ORDERED' || order.status === 'PARTIAL') && age > facts.thresholds.poDelayDays) {
      put(orderDraft(facts, order, 'PO_DELAYED', 'high', href, String(age), String(facts.thresholds.poDelayDays), 'أمر شراء متأخر', 'Purchase order is delayed', `مر ${age} يوماً منذ ${order.orderedOn}.`, `${age} days have passed since ${order.orderedOn}.`, 'تابع المورد أو أغلق الأمر.', 'Follow up with the supplier or close the order.'));
    }
    const lines = facts.purchaseLines.filter((line) => line.purchaseId === order.id);
    if (order.status === 'PARTIAL' || lines.some((line) => line.receivedQty > 0 && line.receivedQty < line.qty)) {
      put(orderDraft(facts, order, 'PARTIAL', 'high', href, order.status, 'كامل', 'استلام جزئي', 'Partial delivery', 'ما زال جزء من الأمر غير مستلم.', 'Part of the order is still not received.', 'استلم الباقي أو عدّل الأمر.', 'Receive the rest or amend the order.'));
    }
    if (lines.some((line) => line.receivedQty > line.qty)) {
      put(orderDraft(facts, order, 'QTY_MISMATCH', 'high', href, String(lines.reduce((sum, line) => sum + line.receivedQty, 0)), String(lines.reduce((sum, line) => sum + line.qty, 0)), 'فرق كمية الشراء', 'Purchase quantity discrepancy', 'المستلم أكبر من المطلوب.', 'Received quantity is above the ordered quantity.', 'طابق فاتورة المورد مع الأمر.', 'Match the supplier invoice to the order.'));
    }
  }
  for (const receipt of facts.receipts) {
    if (receipt.status === 'DRAFT') {
      put(branchDraft(facts, receipt.branchId, 'PROCUREMENT', 'medium', 'GR_DRAFT', '/app/purchasing', receipt.status, 'POSTED', receipt.docNo, `استلام بانتظار الاعتماد ${receipt.docNo}`, `Receipt waiting for approval ${receipt.docNo}`, 'المخزون لا يزيد قبل الاعتماد.', 'Stock does not increase before approval.', 'راجع الاستلام ثم اعتمده.', 'Review the receipt, then approve it.', false, '0.00'));
    }
    const order = facts.purchases.find((row) => row.id === receipt.purchaseId);
    if (receipt.status === 'POSTED' && order && daysBetween(order.orderedOn, receipt.receivedOn) > facts.thresholds.poDelayDays) {
      put(branchDraft(facts, receipt.branchId, 'PROCUREMENT', 'medium', 'LATE_DELIVERY', '/app/purchasing', String(daysBetween(order.orderedOn, receipt.receivedOn)), String(facts.thresholds.poDelayDays), receipt.docNo, `توريد متأخر ${order.supplierAr}`, `Late delivery ${order.supplierEn}`, `الاستلام ${receipt.docNo} تأخر عن أمر ${order.docNo}.`, `Receipt ${receipt.docNo} was late against order ${order.docNo}.`, 'سجّل أداء المورد عند الطلب القادم.', 'Note the supplier performance on the next order.', false, '0.00'));
    }
  }
  const costs = new Map<string, { cost: string; on: string }[]>();
  for (const line of facts.receiptLines) {
    const rows = costs.get(line.productId) ?? [];
    rows.push({ cost: line.unitCost, on: line.receivedOn });
    costs.set(line.productId, rows);
  }
  for (const [productId, rows] of costs) {
    const ordered = [...rows].sort((left, right) => left.on.localeCompare(right.on));
    const prev = ordered.at(-2);
    const last = ordered.at(-1);
    if (!prev || !last || Number(prev.cost) <= 0) continue;
    const change = ((Number(last.cost) - Number(prev.cost)) / Number(prev.cost)) * 100;
    if (change < facts.thresholds.pricePct) continue;
    const product = facts.products.find((row) => row.id === productId);
    put(productDraft(facts, null, product, 'PROCUREMENT', 'medium', 'COST_UP', '/app/prices', last.cost, prev.cost, `${change.toFixed(0)}%`, `ارتفاع سعر الشراء${product ? `: ${product.nameAr}` : ''}`, `Purchase price increase${product ? `: ${product.nameEn}` : ''}`, `التكلفة ${last.cost} بعد ${prev.cost}.`, `Cost is ${last.cost} after ${prev.cost}.`, 'راجع سعر البيع بعد ارتفاع التكلفة.', 'Review the selling price after the cost increase.', false, '0.00', 'Product', productId));
    const changedAfter = facts.priceChanges.some((changeRow) => changeRow.productId === productId && changeRow.on >= last.on);
    if (!changedAfter) {
      put(productDraft(facts, null, product, 'PRICING', 'high', 'STALE_PRICE', '/app/prices', product?.sellPrice ?? '0.00', last.cost, product?.sellPrice ?? '0.00', `سعر البيع لم يُحدَّث${product ? `: ${product.nameAr}` : ''}`, `Selling price not updated${product ? `: ${product.nameEn}` : ''}`, 'ارتفعت تكلفة الشراء ولم يُسجل تغيير لسعر البيع بعدها.', 'Purchase cost rose and no selling-price change was recorded after it.', 'حدّث سعر البيع أو وثّق سبب الإبقاء.', 'Update the selling price or record why it stays.', false, '0.00', 'Product', productId));
    }
  }
}

function pricingAlerts(facts: AlertFacts, put: (draft: AlertDraft) => void) {
  for (const product of facts.products) {
    const href = '/app/prices';
    const sell = Number(product.sellPrice);
    const cost = Number(product.costPrice);
    if (sell <= 0) {
      put(productDraft(facts, null, product, 'PRICING', 'critical', 'NO_PRICE', href, product.sellPrice, '0.01', product.sellPrice, `بلا سعر بيع: ${product.nameAr}`, `No selling price: ${product.nameEn}`, 'لا يمكن بيع الصنف بلا سعر.', 'The item cannot be sold without a price.', 'ضع سعر البيع.', 'Set the selling price.', false, '0.00'));
      continue;
    }
    if (cost > 0 && sell < cost) {
      put(productDraft(facts, null, product, 'PRICING', 'critical', 'BELOW_COST', href, product.sellPrice, product.costPrice, product.sellPrice, `البيع تحت التكلفة: ${product.nameAr}`, `Selling below cost: ${product.nameEn}`, `البيع ${product.sellPrice} والتكلفة ${product.costPrice}.`, `Sell ${product.sellPrice}, cost ${product.costPrice}.`, 'ارفع السعر أو راجع التكلفة.', 'Raise the price or review the cost.', false, mul(String(cost - sell), 1)));
      continue;
    }
    if (sell > 0 && cost > 0) {
      const margin = ((sell - cost) / sell) * 100;
      if (margin < facts.thresholds.minMargin) {
        put(productDraft(facts, null, product, 'PRICING', 'high', 'LOW_MARGIN', href, margin.toFixed(1), String(facts.thresholds.minMargin), `${margin.toFixed(1)}%`, `هامش ضعيف: ${product.nameAr}`, `Low margin: ${product.nameEn}`, `الهامش ${margin.toFixed(1)}% والحد ${facts.thresholds.minMargin}%.`, `Margin is ${margin.toFixed(1)}% and the minimum is ${facts.thresholds.minMargin}%.`, 'راجع سعر البيع.', 'Review the selling price.', false, '0.00'));
      }
    }
    const byBranch = facts.prices.filter((price) => price.productId === product.id && price.active);
    const amounts = [...new Set(byBranch.map((price) => price.amount))];
    if (amounts.length > 1) {
      const nums = amounts.map(Number).filter((value) => value > 0);
      const low = Math.min(...nums);
      const high = Math.max(...nums);
      if (low > 0 && ((high - low) / low) * 100 >= facts.thresholds.pricePct) {
        put(productDraft(facts, null, product, 'PRICING', 'medium', 'BRANCH_PRICE', href, high.toFixed(2), low.toFixed(2), `${low.toFixed(2)}–${high.toFixed(2)}`, `فرق سعر بين الفروع: ${product.nameAr}`, `Branch price difference: ${product.nameEn}`, 'قوائم الأسعار النشطة تختلف بين الفروع فوق حد التغيير.', 'Active price lists differ between branches by more than the change limit.', 'وحّد السعر أو وثّق سبب الفرق.', 'Align the price or record why it differs.', false, '0.00'));
      }
    }
  }
  for (const change of facts.priceChanges) {
    if (Number(change.oldAmount) <= 0) continue;
    const jump = Math.abs((Number(change.newAmount) - Number(change.oldAmount)) / Number(change.oldAmount)) * 100;
    if (jump < facts.thresholds.pricePct || daysBetween(change.on, facts.today) > 90) continue;
    const product = facts.products.find((row) => row.id === change.productId);
    put(productDraft(facts, null, product, 'PRICING', 'medium', 'PRICE_JUMP', '/app/prices', change.newAmount, change.oldAmount, `${jump.toFixed(0)}%`, `تغير سعر كبير${product ? `: ${product.nameAr}` : ''}`, `Large price change${product ? `: ${product.nameEn}` : ''}`, `من ${change.oldAmount} إلى ${change.newAmount} في ${change.on}.`, `From ${change.oldAmount} to ${change.newAmount} on ${change.on}.`, 'تأكد أن التغيير مقصود.', 'Confirm the change was intended.', false, '0.00', 'Product', `${change.productId}:${change.on}`));
    if (!change.actorId || !facts.knownUserIds.includes(change.actorId)) {
      put(productDraft(facts, null, product, 'PRICING', 'high', 'UNAUTH_PRICE', '/app/prices', change.newAmount, change.oldAmount, change.on, `تغيير سعر بلا مستخدم معروف${product ? `: ${product.nameAr}` : ''}`, `Price change without a known user${product ? `: ${product.nameEn}` : ''}`, 'سجل السعر لا يربطه بمستخدم نشط في الصيدلية.', 'The price record is not linked to an active pharmacy user.', 'راجع سجل الأسعار.', 'Review the price history.', false, '0.00', 'Product', `auth:${change.productId}:${change.on}`));
    }
  }
  for (const list of facts.lists) {
    if (list.status === 'ACTIVE' && list.effectiveTo && list.effectiveTo < facts.today) {
      put(branchDraft(facts, null, 'PRICING', 'medium', 'EXPIRED_LIST', '/app/prices', list.effectiveTo, facts.today, list.nameAr, `قائمة سعر منتهية: ${list.nameAr}`, `Expired price list: ${list.nameEn}`, `سارية في النظام حتى ${list.effectiveTo} رغم انتهاء المدة.`, `Still active even though it ended on ${list.effectiveTo}.`, 'أوقف القائمة أو مددها.', 'Archive the list or extend it.', false, '0.00', 'PriceList', list.id));
    }
    if (list.status === 'SCHEDULED' && list.effectiveFrom && list.effectiveFrom < facts.today) {
      put(branchDraft(facts, null, 'PRICING', 'high', 'ACTIVATION_FAILED', '/app/prices', list.effectiveFrom, facts.today, list.nameAr, `تعذّر تفعيل قائمة السعر: ${list.nameAr}`, `Price list did not activate: ${list.nameEn}`, `كان يفترض أن تسري في ${list.effectiveFrom} وما زالت مجدولة.`, `It was due on ${list.effectiveFrom} and is still scheduled.`, 'افتح القائمة واعتمد التفعيل.', 'Open the list and approve activation.', false, '0.00', 'PriceList', list.id));
    }
    if (list.status === 'DRAFT' || list.status === 'PENDING' || list.status === 'SCHEDULED') {
      put(branchDraft(facts, null, 'PRICING', list.status === 'PENDING' ? 'high' : 'medium', 'RATE_REVIEW', '/app/prices', list.status, 'ACTIVE', list.nameAr, `قائمة سعر بانتظار القرار: ${list.nameAr}`, `Price list waiting for a decision: ${list.nameEn}`, 'سعر البيع النشط لا يتغير حتى تُعتمد القائمة.', 'The active selling price stays until this list is approved.', 'اعتمدها أو ارفضها أو أبقها مسودة.', 'Approve it, reject it, or keep it as a draft.', false, '0.00', 'PriceList', list.id));
    }
  }
  for (const product of facts.products) {
    const listed = facts.prices.some((row) => row.productId === product.id && row.active);
    const qty = facts.lots.filter((lot) => lot.productId === product.id && lot.qty > 0).reduce((sum, lot) => sum + lot.qty, 0);
    if (!listed && cmpMoney(product.sellPrice, '0.00') <= 0 && qty > 0) {
      put(productDraft(facts, null, product, 'PRICING', 'high', 'NO_SELL_PRICE', '/app/prices', '0.00', '0.00', product.sku, `بلا سعر بيع: ${product.nameAr}`, `No selling price: ${product.nameEn}`, 'لا سعر في قائمة نشطة ولا سعر مخزن على الدواء.', 'There is no active list price and no stored selling price.', 'أضف السعر في قائمة الأسعار واعتمدها.', 'Add the price on a price list and approve it.', false, '0.00'));
    }
  }
}

function financeAlerts(facts: AlertFacts, put: (draft: AlertDraft) => void) {
  const lastReceipt = new Map<string, string>();
  for (const receipt of facts.receipts) {
    if (!receipt.supplierId || receipt.status !== 'POSTED') continue;
    const current = lastReceipt.get(receipt.supplierId);
    if (!current || receipt.receivedOn > current) lastReceipt.set(receipt.supplierId, receipt.receivedOn);
  }
  for (const supplier of facts.suppliers) {
    if (cmpMoney(supplier.balance, '0.00') <= 0) continue;
    const last = lastReceipt.get(supplier.id) ?? null;
    const due = last ? addDays(last, facts.thresholds.payTerms) : null;
    const left = due ? daysBetween(facts.today, due) : null;
    if (left !== null && left < 0) {
      put(partyDraft(supplier, 'OVERDUE', left < -14 ? 'critical' : 'high', supplier.balance, due ?? '', 'فاتورة مورد متأخرة', 'Supplier balance is overdue', `الرصيد ${supplier.balance} والاستحقاق التقديري ${due} من آخر استلام.`, `Balance ${supplier.balance}. Estimated due ${due} from the last receipt.`, '/app/finance'));
    } else if (left !== null && left <= facts.thresholds.payDueDays) {
      put(partyDraft(supplier, 'DUE_SOON', 'medium', supplier.balance, due ?? '', 'استحقاق مورد قريب', 'Supplier balance due soon', `الرصيد ${supplier.balance} يستحق تقديراً في ${due}.`, `Balance ${supplier.balance} is estimated due on ${due}.`, '/app/finance'));
    } else if (!due) {
      put(partyDraft(supplier, 'DUE_SOON', 'info', supplier.balance, '0.00', 'رصيد مورد بلا تاريخ استحقاق', 'Supplier balance without a due date', `الرصيد ${supplier.balance}. لا يوجد استلام بتاريخ ليحسب الاستحقاق.`, `Balance is ${supplier.balance}. No receipt date is available to estimate a due date.`, '/app/finance'));
    }
  }
  for (const customer of facts.customers) {
    if (cmpMoney(customer.balance, '0.00') <= 0) continue;
    put({
      fingerprint: `FINANCE:CUSTOMER_DUE:${customer.id}`,
      category: 'FINANCE',
      severity: 'medium',
      code: 'CUSTOMER_DUE',
      branchId: null,
      titleAr: `رصيد عميل: ${customer.nameAr}`,
      titleEn: `Customer balance: ${customer.nameEn}`,
      detailAr: `الرصيد القائم ${customer.balance}.`,
      detailEn: `Outstanding balance is ${customer.balance}.`,
      figureAr: customer.balance,
      figureEn: customer.balance,
      currentValue: customer.balance,
      thresholdValue: '0.00',
      entityType: 'Customer',
      entityId: customer.id,
      recommendedAr: 'راجع التحصيل.',
      recommendedEn: 'Review collection.',
      actionHref: '/app/customers',
      estimate: false,
      exposure: customer.balance,
    });
    if (cmpMoney(facts.thresholds.creditLimit, '0.00') > 0 && cmpMoney(customer.balance, facts.thresholds.creditLimit) > 0) {
      put({
        fingerprint: `FINANCE:CREDIT_LIMIT:${customer.id}`,
        category: 'FINANCE',
        severity: 'high',
        code: 'CREDIT_LIMIT',
        branchId: null,
        titleAr: `تجاوز حد الائتمان: ${customer.nameAr}`,
        titleEn: `Credit limit exceeded: ${customer.nameEn}`,
        detailAr: `الرصيد ${customer.balance} والحد ${facts.thresholds.creditLimit}.`,
        detailEn: `Balance ${customer.balance} is above the limit ${facts.thresholds.creditLimit}.`,
        figureAr: customer.balance,
        figureEn: customer.balance,
        currentValue: customer.balance,
        thresholdValue: facts.thresholds.creditLimit,
        entityType: 'Customer',
        entityId: customer.id,
        recommendedAr: 'أوقف البيع الآجل حتى ينخفض الرصيد.',
        recommendedEn: 'Stop credit sales until the balance falls.',
        actionHref: '/app/customers',
        estimate: false,
        exposure: customer.balance,
      });
    }
  }
  for (const sale of facts.sales) {
    if (sale.status === 'POSTED' && cmpMoney(sale.paid, sale.total) < 0) {
      put(branchDraft(facts, sale.branchId, 'FINANCE', 'high', 'UNPAID', '/app/sales', sale.paid, sale.total, sale.docNo, `فاتورة غير مكتملة الدفع ${sale.docNo}`, `Invoice not fully paid ${sale.docNo}`, `المدفوع ${sale.paid} من ${sale.total}.`, `Paid ${sale.paid} of ${sale.total}.`, 'حصّل المتبقي أو راجع الفاتورة.', 'Collect the remainder or review the invoice.', false, sub(sale.total, sale.paid), 'Sale', sale.id));
    }
  }
}

function saasAlerts(facts: AlertFacts, put: (draft: AlertDraft) => void) {
  if (facts.tenantStatus === 'SUSPENDED' || facts.readOnly) {
    put(saas('SUSPENDED', 'critical', facts.tenantStatus, 'ACTIVE', 'اشتراك الصيدلية موقوف', 'Pharmacy subscription is suspended', 'الدخول التشغيلي مقيد حتى تعيد المنصة التفعيل.', 'Operations stay restricted until the platform reactivates the pharmacy.'));
  }
  if (facts.subscriptionEnd) {
    const left = daysBetween(facts.today, facts.subscriptionEnd);
    if (left < 0) {
      put(saas('SUB_EXPIRED', 'critical', facts.subscriptionEnd, facts.today, 'انتهى الاشتراك', 'Subscription has ended', `تاريخ النهاية ${facts.subscriptionEnd}.`, `The end date is ${facts.subscriptionEnd}.`));
    } else if (left <= 14) {
      put(saas('SUB_ENDING', 'high', facts.subscriptionEnd, '14', 'الاشتراك قارب الانتهاء', 'Subscription is nearing its end', `ينتهي في ${facts.subscriptionEnd}.`, `It ends on ${facts.subscriptionEnd}.`));
    }
  }
  for (const invoice of facts.subscriptionInvoices) {
    if (invoice.status === 'PAID') continue;
    const left = daysBetween(facts.today, invoice.dueOn);
    if (invoice.status === 'FAILED' || left < 0) {
      put(saas(`SUB_INVOICE:${invoice.id}`, invoice.status === 'FAILED' ? 'critical' : 'high', invoice.amount, invoice.dueOn, 'فاتورة اشتراك غير مدفوعة', 'Subscription invoice is unpaid', `المبلغ ${invoice.amount} والحالة ${invoice.status} والاستحقاق ${invoice.dueOn}.`, `Amount ${invoice.amount}, status ${invoice.status}, due ${invoice.dueOn}.`, invoice.id));
    }
  }
}

function saas(code: string, severity: AlertSeverity, current: string, threshold: string, titleAr: string, titleEn: string, detailAr: string, detailEn: string, entityId = 'tenant'): AlertDraft {
  return {
    fingerprint: `SAAS:${code}`,
    category: 'SAAS',
    severity,
    code: code.startsWith('SUB_INVOICE') ? 'SUB_INVOICE' : code,
    branchId: null,
    titleAr,
    titleEn,
    detailAr,
    detailEn,
    figureAr: current,
    figureEn: current,
    currentValue: current,
    thresholdValue: threshold,
    entityType: 'Subscription',
    entityId,
    recommendedAr: 'راجع الاشتراك مع مسؤول المنصة.',
    recommendedEn: 'Review the subscription with the platform admin.',
    actionHref: '/app/settings',
    estimate: false,
    exposure: '0.00',
  };
}

function partyDraft(party: { id: string; nameAr: string; nameEn: string }, code: string, severity: AlertSeverity, balance: string, threshold: string, titleAr: string, titleEn: string, detailAr: string, detailEn: string, href: string): AlertDraft {
  return {
    fingerprint: `FINANCE:${code}:${party.id}`,
    category: 'FINANCE',
    severity,
    code,
    branchId: null,
    titleAr: `${titleAr}: ${party.nameAr}`,
    titleEn: `${titleEn}: ${party.nameEn}`,
    detailAr,
    detailEn,
    figureAr: balance,
    figureEn: balance,
    currentValue: balance,
    thresholdValue: threshold,
    entityType: 'Supplier',
    entityId: party.id,
    recommendedAr: 'راجع السداد.',
    recommendedEn: 'Review the payment.',
    actionHref: href,
    estimate: code !== 'CUSTOMER_DUE',
    exposure: balance,
  };
}

type DraftBits = {
  category: AlertCategory;
  severity: AlertSeverity;
  code: string;
  branchId: string | null;
  product?: { id: string; sku: string; nameAr: string; nameEn: string };
  href: string;
  current: string;
  threshold: string;
  figureAr: string;
  figureEn: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  actionAr: string;
  actionEn: string;
  estimate: boolean;
  exposure: string;
  entityType: string;
  entityId: string;
};

function draftOf(facts: AlertFacts, bits: DraftBits): AlertDraft {
  void facts;
  return {
    fingerprint: `${bits.category}:${bits.code}:${bits.branchId ?? ''}:${bits.entityId}`,
    category: bits.category,
    severity: bits.severity,
    code: bits.code,
    branchId: bits.branchId,
    titleAr: bits.titleAr,
    titleEn: bits.titleEn,
    detailAr: bits.estimate ? `تقدير. ${bits.detailAr}` : bits.detailAr,
    detailEn: bits.estimate ? `Estimate. ${bits.detailEn}` : bits.detailEn,
    figureAr: bits.figureAr,
    figureEn: bits.figureEn,
    currentValue: bits.current,
    thresholdValue: bits.threshold,
    entityType: bits.entityType,
    entityId: bits.entityId,
    recommendedAr: bits.actionAr,
    recommendedEn: bits.actionEn,
    actionHref: bits.href,
    estimate: bits.estimate,
    exposure: bits.exposure,
  };
}

function productDraft(
  facts: AlertFacts,
  branchId: string | null,
  product: AlertFacts['products'][number] | undefined,
  category: AlertCategory,
  severity: AlertSeverity,
  code: string,
  href: string,
  current: string,
  threshold: string,
  figure: string,
  titleAr: string,
  titleEn: string,
  detailAr: string,
  detailEn: string,
  actionAr: string,
  actionEn: string,
  estimate: boolean,
  exposure: string,
  entityType = 'Product',
  entityId = product?.id ?? code,
): AlertDraft {
  return draftOf(facts, {
    category,
    severity,
    code,
    branchId,
    href,
    current,
    threshold,
    figureAr: figure,
    figureEn: figure,
    titleAr,
    titleEn,
    detailAr,
    detailEn,
    actionAr,
    actionEn,
    estimate,
    exposure,
    entityType,
    entityId,
  });
}

function branchDraft(
  facts: AlertFacts,
  branchId: string | null,
  category: AlertCategory,
  severity: AlertSeverity,
  code: string,
  href: string,
  current: string,
  threshold: string,
  figure: string,
  titleAr: string,
  titleEn: string,
  detailAr: string,
  detailEn: string,
  actionAr: string,
  actionEn: string,
  estimate: boolean,
  exposure: string,
  entityType = 'Branch',
  entityId = branchId ?? code,
): AlertDraft {
  return productDraft(facts, branchId, undefined, category, severity, code, href, current, threshold, figure, titleAr, titleEn, detailAr, detailEn, actionAr, actionEn, estimate, exposure, entityType, entityId);
}

function orderDraft(
  facts: AlertFacts,
  order: AlertFacts['purchases'][number],
  code: string,
  severity: AlertSeverity,
  href: string,
  current: string,
  threshold: string,
  titleAr: string,
  titleEn: string,
  detailAr: string,
  detailEn: string,
  actionAr: string,
  actionEn: string,
): AlertDraft {
  return branchDraft(facts, order.branchId, 'PROCUREMENT', severity, code, href, current, threshold, order.docNo, `${titleAr}: ${order.supplierAr}`, `${titleEn}: ${order.supplierEn}`, detailAr, detailEn, actionAr, actionEn, false, '0.00', 'PurchaseOrder', order.id);
}

function expiryDraft(
  facts: AlertFacts,
  lot: AlertFacts['lots'][number],
  product: AlertFacts['products'][number] | undefined,
  href: string,
  code: string,
  severity: AlertSeverity,
  current: string,
  threshold: string,
  titleAr: string,
  titleEn: string,
  actionAr: string,
  actionEn: string,
  exposure: string,
  estimate: boolean,
): AlertDraft {
  const nameAr = product?.nameAr ?? '';
  const nameEn = product?.nameEn ?? '';
  return draftOf(facts, {
    category: 'EXPIRY',
    severity,
    code,
    branchId: lot.branchId,
    href,
    current,
    threshold,
    figureAr: exposure,
    figureEn: exposure,
    titleAr: `${titleAr}${nameAr ? `: ${nameAr}` : ''}`,
    titleEn: `${titleEn}${nameEn ? `: ${nameEn}` : ''}`,
    detailAr: `تشغيلة ${lot.batchNo || '—'}، صلاحية ${lot.expiry || '—'}، كمية ${lot.qty}، قيمة ${exposure}.`,
    detailEn: `Batch ${lot.batchNo || '—'}, expiry ${lot.expiry || '—'}, quantity ${lot.qty}, value ${exposure}.`,
    actionAr,
    actionEn,
    estimate,
    exposure,
    entityType: 'StockLot',
    entityId: lot.id,
  });
}

function slowProductIds(facts: AlertFacts): string[] {
  const ids: string[] = [];
  for (const branch of facts.branches) {
    for (const product of facts.products) {
      const age = daysBetween(product.createdOn, facts.today);
      if (age < facts.thresholds.slowDays) continue;
      const units = unitsBetween(facts, product.id, branch.id, addDays(facts.today, 1 - facts.thresholds.slowDays), facts.today);
      const cap = Math.max(2, Math.floor(product.reorderLevel * 0.15));
      if (units <= cap) ids.push(`${branch.id}:${product.id}`);
    }
  }
  return ids;
}

function unitsBetween(facts: AlertFacts, productId: string, branchId: string, from: string, to: string): number {
  return facts.lines
    .filter((line) => line.productId === productId && line.branchId === branchId && line.on >= from && line.on <= to)
    .reduce((sum, line) => sum + line.qty, 0);
}

function salesRate(facts: AlertFacts, productId: string, branchId: string, from: string, to: string, onHand: number): { perDay: number; units: number; days: number } | null {
  if (from > to) return null;
  const totals = new Map<string, number>();
  for (const line of facts.lines) {
    if (line.productId !== productId || line.branchId !== branchId || line.on < from || line.on > to) continue;
    totals.set(line.on, (totals.get(line.on) ?? 0) + line.qty);
  }
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  if (onHand <= 0) {
    while (days.length > 0 && (totals.get(days[days.length - 1] ?? '') ?? 0) === 0) days.pop();
  }
  if (days.length < MIN_RATE_DAYS) return null;
  const units = days.reduce((sum, day) => sum + (totals.get(day) ?? 0), 0);
  return { perDay: units / days.length, units, days: days.length };
}

function marginOf(facts: AlertFacts, branchId: string, from: string, to: string): { pct: number } | null {
  let sales = '0.00';
  let cost = '0.00';
  for (const line of facts.lines) {
    if (line.branchId !== branchId || line.on < from || line.on > to) continue;
    sales = addMoney(sales, line.lineTotal);
    cost = addMoney(cost, line.costTotal);
  }
  if (cmpMoney(sales, '0.00') <= 0) return null;
  return { pct: ((Number(sales) - Number(cost)) / Number(sales)) * 100 };
}

function sellableLot(lot: AlertFacts['lots'][number], today: string): boolean {
  return lot.qty > 0 && lot.condition === 'AVAILABLE' && (!lot.expiry || lot.expiry >= today);
}

function lotValue(lot: AlertFacts['lots'][number], product: AlertFacts['products'][number] | undefined): string {
  const cost = lot.unitCost && Number(lot.unitCost) > 0 ? lot.unitCost : product?.costPrice ?? '0.00';
  return mul(cost, lot.qty);
}

function mul(amount: string, qty: number): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '0.00';
  return (value * qty).toFixed(2);
}

function sub(left: string, right: string): string {
  return (Number(left) - Number(right)).toFixed(2);
}

function sumExposure(rows: { exposure: string }[]): string {
  return rows.reduce((sum, row) => addMoney(sum, moneyOrZero(row.exposure)), '0.00');
}

function moneyOrZero(value: string): string {
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value).toFixed(2) : '0.00';
}

function weekStart(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}
