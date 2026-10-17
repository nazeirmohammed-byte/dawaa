import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ROLE_PERMISSIONS, type RoleCode } from '@dawaa/shared';
import { DomainError } from '../http/domain-error';
import { khartoumDate } from '../ops/ops.logic';
import { OpsService } from '../ops/ops.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  allowedCategories,
  buildCharts,
  canAssignAlerts,
  canConfigureAlerts,
  evaluateAlerts,
  planNotices,
  planSync,
  snoozeAllowed,
  sortAlerts,
  summaryCards,
  thresholdsFrom,
  type AlertCategory,
  type AlertDraft,
  type AlertFacts,
  type AlertSeverity,
  type AlertStatus,
} from './alerts.logic';

type MoneyLike = { toFixed(digits: number): string };

export type AlertQuery = {
  view: 'full' | 'bell';
  category: string | null;
  severity: string | null;
  q: string | null;
  status: 'active' | 'history' | 'snoozed';
  sort: 'severity' | 'newest' | 'oldest';
};

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OpsService,
  ) {}

  async center(tenantId: string, userId: string, jwtBranch: string | null, header: string | null, query: AlertQuery) {
    const built = await this.refresh(tenantId, userId, jwtBranch, header);
    const activeAll = built.items.filter((item) => item.status === 'OPEN' || item.status === 'ACKNOWLEDGED');
    const items = filterItems(built.items, query);
    const active = items.filter((item) => item.status === 'OPEN' || item.status === 'ACKNOWLEDGED');
    const history = items.filter((item) => item.status === 'RESOLVED');
    const snoozed = items.filter((item) => item.status === 'SNOOZED');
    const shown = query.status === 'history' ? history : query.status === 'snoozed' ? snoozed : active;
    const unread = built.items.filter((item) => item.status === 'OPEN').length + built.notices.filter((notice) => !notice.readAt).length;
    if (query.view === 'bell') {
      return {
        unread,
        critical: built.items.filter((item) => item.status === 'OPEN' && item.severity === 'critical').length,
        items: sortAlerts(built.items.filter((item) => item.status === 'OPEN' || item.status === 'ACKNOWLEDGED'), 'severity').slice(0, 8),
        notices: built.notices.filter((notice) => !notice.readAt).slice(0, 6),
      };
    }
    return {
      unread,
      cards: summaryCards(activeAll),
      charts: buildCharts(
        activeAll,
        built.events.map((event) => ({ on: khartoumDate(event.createdAt), kind: event.kind })),
        khartoumDate(),
      ),
      items: sortAlerts(shown, query.sort),
      historyCount: built.items.filter((item) => item.status === 'RESOLVED').length,
      snoozedCount: built.items.filter((item) => item.status === 'SNOOZED').length,
      notices: built.notices,
      staff: built.staff,
      prefs: built.prefs,
      canAssign: built.canAssign,
      canConfigure: built.canConfigure,
    };
  }

  async act(
    tenantId: string,
    userId: string,
    jwtBranch: string | null,
    header: string | null,
    input: { id: string; type: 'ack' | 'snooze' | 'resolve' | 'assign'; days?: number; assigneeId?: string | null },
  ) {
    const context = await this.loadContext(tenantId, userId, jwtBranch, header);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.alertCase.findFirst({ where: { tenantId, id: input.id } });
      if (!row || !context.allowed.includes(row.category as AlertCategory)) throw new DomainError('NOT_FOUND', 404);
      if (input.type === 'ack') {
        await tx.alertCase.update({ where: { id: row.id }, data: { status: 'ACKNOWLEDGED' } });
        await event(tx, tenantId, row.id, userId, 'ACK', '');
      } else if (input.type === 'snooze') {
        const days = input.days ?? 1;
        if (!snoozeAllowed(row.severity as AlertSeverity, days)) throw new DomainError('SNOOZE_BLOCKED', 400);
        const until = new Date(Date.now() + days * 86_400_000);
        await tx.alertCase.update({ where: { id: row.id }, data: { status: 'SNOOZED', snoozeUntil: until } });
        await event(tx, tenantId, row.id, userId, 'SNOOZE', String(days));
      } else if (input.type === 'resolve') {
        if (context.live.some((draft) => draft.fingerprint === row.fingerprint)) throw new DomainError('CONDITION_OPEN', 409);
        await tx.alertCase.update({ where: { id: row.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
        await event(tx, tenantId, row.id, userId, 'RESOLVED', '');
      } else {
        if (!context.canAssign) throw new DomainError('UNAUTHORIZED', 403);
        if (input.assigneeId) {
          const user = await tx.user.findFirst({ where: { tenantId, id: input.assigneeId, isDeleted: false } });
          if (!user) throw new DomainError('NOT_FOUND', 404);
        }
        await tx.alertCase.update({ where: { id: row.id }, data: { assigneeId: input.assigneeId || null } });
        await event(tx, tenantId, row.id, userId, 'ASSIGN', input.assigneeId ?? '');
      }
      return { ok: true };
    });
  }

  async savePrefs(tenantId: string, userId: string, prefs: { immediate: boolean; daily: boolean; weekly: boolean }) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.alertPreference.findFirst({ where: { tenantId, userId } });
      if (!current) {
        await tx.alertPreference.create({ data: { tenantId, userId, ...prefs } });
      } else {
        await tx.alertPreference.update({ where: { id: current.id }, data: prefs });
      }
      return { ok: true };
    });
  }

  async readNotice(tenantId: string, userId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const notice = await tx.alertNotice.findFirst({ where: { tenantId, userId, id } });
      if (!notice) throw new DomainError('NOT_FOUND', 404);
      await tx.alertNotice.update({ where: { id: notice.id }, data: { readAt: new Date() } });
      return { ok: true };
    });
  }

  private async refresh(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    const context = await this.loadContext(tenantId, userId, jwtBranch, header);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const where = context.scope.readBranchId
        ? { tenantId, OR: [{ branchId: context.scope.readBranchId }, { branchId: null }] }
        : { tenantId };
      const stored = await tx.alertCase.findMany({ where });
      const nowIso = new Date().toISOString();
      for (const op of planSync(context.live, stored.map(storedOf), nowIso)) {
        if (op.op === 'create') {
          const id = randomUUID();
          await tx.alertCase.create({ data: caseData(tenantId, id, op.draft, 'OPEN', new Date()) });
          await event(tx, tenantId, id, null, 'OPENED', '');
        } else if (op.op === 'resolve') {
          await tx.alertCase.update({ where: { id: op.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), snoozeUntil: null } });
          await event(tx, tenantId, op.id, null, 'AUTO_RESOLVED', '');
        } else {
          await tx.alertCase.update({
            where: { id: op.id },
            data: {
              ...draftData(op.draft),
              status: op.status,
              ...(op.reopen ? { openedAt: new Date(), resolvedAt: null, snoozeUntil: null, escalatedAt: null } : {}),
              ...(op.escalate ? { escalatedAt: new Date() } : {}),
            },
          });
          if (op.reopen) await event(tx, tenantId, op.id, null, 'REOPENED', '');
          if (op.escalate) await event(tx, tenantId, op.id, null, 'ESCALATED', '');
        }
      }
      const cases = await tx.alertCase.findMany({ where, orderBy: { openedAt: 'desc' } });
      const visible = cases.filter((row) => context.allowed.includes(row.category as AlertCategory));
      const events = visible.length
        ? await tx.alertEvent.findMany({
            where: { tenantId, caseId: { in: visible.map((row) => row.id) } },
            orderBy: { createdAt: 'desc' },
            take: 500,
          })
        : [];
      const names = new Map(context.staff.map((person) => [person.id, person.name]));
      const branchNames = new Map(context.scope.branches.map((branch) => [branch.id, branch]));
      const items = visible.map((row) => ({
        id: row.id,
        fingerprint: row.fingerprint,
        category: row.category,
        severity: row.severity as AlertSeverity,
        code: row.code,
        status: row.status as AlertStatus,
        titleAr: row.titleAr,
        titleEn: row.titleEn,
        detailAr: row.detailAr,
        detailEn: row.detailEn,
        figureAr: row.figureAr,
        figureEn: row.figureEn,
        currentValue: row.currentValue,
        thresholdValue: row.thresholdValue,
        entityType: row.entityType,
        entityId: row.entityId,
        recommendedAr: row.recommendedAr,
        recommendedEn: row.recommendedEn,
        actionHref: row.actionHref,
        estimate: row.estimate,
        exposure: row.exposure.toFixed(2),
        branchId: row.branchId,
        branchNameAr: row.branchId ? branchNames.get(row.branchId)?.nameAr ?? '' : '',
        branchNameEn: row.branchId ? branchNames.get(row.branchId)?.nameEn || branchNames.get(row.branchId)?.nameAr || '' : '',
        assigneeId: row.assigneeId,
        assigneeName: row.assigneeId ? names.get(row.assigneeId) ?? '' : '',
        openedAt: row.openedAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        snoozeUntil: row.snoozeUntil?.toISOString() ?? null,
        escalated: Boolean(row.escalatedAt),
        history: events
          .filter((entry) => entry.caseId === row.id)
          .slice(0, 12)
          .map((entry) => ({ at: entry.createdAt.toISOString(), kind: entry.kind, note: entry.note })),
      }));
      const prefsRow = await tx.alertPreference.findFirst({ where: { tenantId, userId } });
      const prefs = { immediate: prefsRow?.immediate ?? true, daily: prefsRow?.daily ?? true, weekly: prefsRow?.weekly ?? false };
      const existing = await tx.alertNotice.findMany({ where: { tenantId, userId } });
      const notices = planNotices({
        today: khartoumDate(),
        prefs,
        active: items
          .filter((item) => item.status === 'OPEN' || item.status === 'ACKNOWLEDGED')
          .map((item) => ({
            fingerprint: item.fingerprint,
            severity: item.severity,
            openedOn: khartoumDate(new Date(item.openedAt)),
            escalated: item.escalated,
            titleAr: item.titleAr,
            titleEn: item.titleEn,
          })),
        existing: existing.map((notice) => `${notice.kind}|${notice.fingerprint}|${notice.periodKey}`),
      });
      for (const notice of notices) {
        await tx.alertNotice.create({
          data: {
            tenantId,
            userId,
            kind: clip(notice.kind, 32),
            fingerprint: clip(notice.fingerprint, 200),
            periodKey: clip(notice.periodKey, 32),
            titleAr: clip(notice.titleAr, 200),
            titleEn: clip(notice.titleEn, 200),
            bodyAr: clip(notice.bodyAr, 400),
            bodyEn: clip(notice.bodyEn, 400),
          },
        });
      }
      const fresh = notices.length ? await tx.alertNotice.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' }, take: 30 }) : existing;
      return {
        items,
        events,
        notices: fresh.map((notice) => ({
          id: notice.id,
          kind: notice.kind,
          titleAr: notice.titleAr,
          titleEn: notice.titleEn,
          bodyAr: notice.bodyAr,
          bodyEn: notice.bodyEn,
          readAt: notice.readAt?.toISOString() ?? null,
          createdAt: notice.createdAt.toISOString(),
        })),
        staff: context.staff,
        prefs,
        canAssign: context.canAssign,
        canConfigure: context.canConfigure,
      };
    });
  }

  private async loadContext(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    const scope = await this.ops.scopeFor(tenantId, userId, jwtBranch, header);
    const since = new Date(Date.now() - 200 * 86_400_000);
    const branch = scope.readBranchId ? { branchId: scope.readBranchId } : {};
    const [bundle, subscription, invoices] = await Promise.all([
      this.prisma.withTenant(tenantId, async (tx) => {
        const [products, lots, movements, sales, purchases, receipts, suppliers, customers, settings, links, users, lists, activations, histories, tenant] = await Promise.all([
          tx.product.findMany({ where: { tenantId, isDeleted: false } }),
          tx.stockLot.findMany({ where: { tenantId, ...branch } }),
          tx.stockMovement.findMany({ where: { tenantId, ...branch } }),
          tx.sale.findMany({ where: { tenantId, ...branch, soldAt: { gte: since } }, include: { lines: true } }),
          tx.purchaseOrder.findMany({
            where: { tenantId, ...branch, OR: [{ status: { in: ['DRAFT', 'ORDERED', 'PARTIAL'] } }, { orderedAt: { gte: since } }] },
            include: { supplier: true, lines: true },
          }),
          tx.goodsReceipt.findMany({
            where: { tenantId, ...branch, OR: [{ status: 'DRAFT' }, { receivedAt: { gte: since } }] },
            include: { lines: true },
          }),
          tx.supplier.findMany({ where: { tenantId, isDeleted: false } }),
          tx.customer.findMany({ where: { tenantId, isDeleted: false } }),
          tx.pharmacySetting.findMany({ where: { tenantId, key: { startsWith: 'alert' } } }),
          tx.userBranchRole.findMany({ where: { tenantId, userId }, include: { role: true } }),
          tx.user.findMany({ where: { tenantId, isDeleted: false, isActive: true }, select: { id: true, displayName: true } }),
          tx.priceList.findMany({ where: { tenantId } }),
          tx.branchPriceActivation.findMany({ where: { tenantId, isActive: true } }),
          tx.priceHistory.findMany({ where: { tenantId, createdAt: { gte: since } } }),
          tx.tenant.findFirst({ where: { id: tenantId } }),
        ]);
        const activeListIds = new Set(lists.filter((list) => list.status === 'ACTIVE' && list.isActive).map((list) => list.id));
        const prices = activeListIds.size
          ? await tx.productPrice.findMany({ where: { tenantId, priceListId: { in: [...activeListIds] } } })
          : [];
        return { products, lots, movements, sales, purchases, receipts, suppliers, customers, settings, links, users, lists, activations, histories, prices, tenant };
      }),
      this.prisma.client.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.subscriptionInvoice.findMany({ where: { tenantId } }),
    ]);
    const perms = bundle.links.flatMap((link) => {
      const code = link.role.code as RoleCode;
      return code in ROLE_PERMISSIONS ? [...ROLE_PERMISSIONS[code]] : [];
    });
    const branches = scope.branches
      .filter((row) => !scope.readBranchId || row.id === scope.readBranchId)
      .map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn || row.nameAr }));
    const settings = bundle.settings.map((row) => ({ key: row.key, value: row.valueEn || row.valueAr }));
    const shared = sharedFacts(bundle, branches, subscription, invoices);
    const operational = branches.flatMap((row) =>
      evaluateAlerts(factsForBranch(shared, row.id, thresholdsFrom(settings, row.id))).filter((draft) => draft.branchId),
    );
    const tenantWide = evaluateAlerts({ ...shared, thresholds: thresholdsFrom(settings, scope.readBranchId) }).filter((draft) => !draft.branchId);
    const live = dedupe([...operational, ...tenantWide]);
    return {
      scope,
      live,
      allowed: allowedCategories(perms),
      canAssign: canAssignAlerts(perms),
      canConfigure: canConfigureAlerts(perms),
      staff: bundle.users.map((user) => ({ id: user.id, name: user.displayName })),
    };
  }
}

function storedOf(row: { id: string; fingerprint: string; status: string; snoozeUntil: Date | null; openedAt: Date; escalatedAt: Date | null }) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    status: row.status as AlertStatus,
    snoozeUntil: row.snoozeUntil?.toISOString() ?? null,
    openedAt: row.openedAt.toISOString(),
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
  };
}

function caseData(tenantId: string, id: string, draft: AlertDraft, status: AlertStatus, openedAt: Date) {
  return { id, tenantId, status, openedAt, ...draftData(draft) };
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function draftData(draft: AlertDraft) {
  return {
    branchId: draft.branchId,
    fingerprint: clip(draft.fingerprint, 200),
    category: clip(draft.category, 32),
    severity: clip(draft.severity, 16),
    code: clip(draft.code, 64),
    titleAr: clip(draft.titleAr, 200),
    titleEn: clip(draft.titleEn, 200),
    detailAr: clip(draft.detailAr, 800),
    detailEn: clip(draft.detailEn, 800),
    figureAr: clip(draft.figureAr, 80),
    figureEn: clip(draft.figureEn, 80),
    currentValue: clip(draft.currentValue, 80),
    thresholdValue: clip(draft.thresholdValue, 80),
    entityType: clip(draft.entityType, 32),
    entityId: clip(draft.entityId, 80),
    recommendedAr: clip(draft.recommendedAr, 400),
    recommendedEn: clip(draft.recommendedEn, 400),
    actionHref: clip(draft.actionHref, 200),
    estimate: draft.estimate,
    exposure: draft.exposure,
  };
}

function dedupe(rows: AlertDraft[]): AlertDraft[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.fingerprint)) return false;
    seen.add(row.fingerprint);
    return true;
  });
}

type Bundle = {
  products: { id: string; sku: string; nameAr: string; nameEn: string; reorderLevel: number; sellPrice: MoneyLike; costPrice: MoneyLike; createdAt: Date }[];
  lots: { id: string; branchId: string; productId: string; batchNo: string; expiry: Date; qtyBase: number; condition: string; unitCost: MoneyLike | null }[];
  movements: { lotId: string; productId: string; branchId: string; type: string; qtyBase: number; createdAt: Date }[];
  sales: { id: string; branchId: string; docNo: string; soldAt: Date; subtotal: MoneyLike; discount: MoneyLike; total: MoneyLike; paid: MoneyLike; status: string; lines: { saleId: string; productId: string; qty: number; lineTotal: MoneyLike; costTotal: MoneyLike; discountAmount: MoneyLike }[] }[];
  purchases: { id: string; branchId: string; docNo: string; status: string; orderedAt: Date; supplierId: string; supplier: { nameAr: string; nameEn: string }; lines: { purchaseId: string; productId: string; qty: number; receivedQty: number; unitCost: MoneyLike }[] }[];
  receipts: { id: string; branchId: string; purchaseId: string | null; supplierId: string | null; docNo: string; status: string; receivedAt: Date; lines: { id: string; productId: string; batchNo: string; qty: number; unitCost: MoneyLike }[] }[];
  suppliers: { id: string; nameAr: string; nameEn: string; balance: MoneyLike }[];
  customers: { id: string; nameAr: string; nameEn: string; balance: MoneyLike }[];
  lists: { id: string; nameAr: string; nameEn: string; status: string; isActive: boolean; scope: string; effectiveTo: Date | null; effectiveFrom: Date | null }[];
  activations: { branchId: string; priceListId: string; isActive: boolean }[];
  prices: { productId: string; priceListId: string; amount: MoneyLike }[];
  histories: { productId: string; oldAmount: MoneyLike; newAmount: MoneyLike; createdAt: Date; createdBy: string | null }[];
  users: { id: string }[];
  tenant: { status: string; readOnly: boolean; trialEndsAt: Date | null } | null;
};

function sharedFacts(
  bundle: Bundle,
  branches: { id: string }[],
  subscription: { currentPeriodEnd: Date | null; trialEndsAt: Date | null } | null,
  invoices: { id: string; amount: MoneyLike; status: string; dueAt: Date }[],
): Omit<AlertFacts, 'thresholds' | 'branches'> & { branches: AlertFacts['branches'] } {
  const today = khartoumDate();
  const activeLists = new Set(bundle.lists.filter((list) => list.status === 'ACTIVE' && list.isActive).map((list) => list.id));
  const activated = new Set(bundle.activations.filter((row) => row.isActive).map((row) => `${row.branchId}:${row.priceListId}`));
  const prices: AlertFacts['prices'] = [];
  for (const price of bundle.prices) {
    if (!activeLists.has(price.priceListId)) continue;
    const list = bundle.lists.find((row) => row.id === price.priceListId);
    if (!list) continue;
    if (list.scope === 'PHARMACY') {
      for (const branch of branches) prices.push({ productId: price.productId, branchId: branch.id, amount: cash(price.amount), active: true });
    }
    for (const branch of branches) {
      if (activated.has(`${branch.id}:${price.priceListId}`)) {
        prices.push({ productId: price.productId, branchId: branch.id, amount: cash(price.amount), active: true });
      }
    }
  }
  const end = subscription?.currentPeriodEnd ?? subscription?.trialEndsAt ?? bundle.tenant?.trialEndsAt ?? null;
  return {
    today,
    branches: branches.map((branch) => {
      const named = branch as { id: string; nameAr?: string; nameEn?: string };
      return { id: branch.id, nameAr: named.nameAr ?? '', nameEn: named.nameEn ?? '' };
    }),
    products: bundle.products.map((product) => ({
      id: product.id,
      sku: product.sku,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      reorderLevel: product.reorderLevel,
      sellPrice: cash(product.sellPrice),
      costPrice: cash(product.costPrice),
      createdOn: khartoumDate(product.createdAt),
    })),
    lots: bundle.lots.map((lot) => ({
      id: lot.id,
      branchId: lot.branchId,
      productId: lot.productId,
      batchNo: lot.batchNo,
      expiry: khartoumDate(lot.expiry),
      qty: lot.qtyBase,
      condition: lot.condition || 'AVAILABLE',
      unitCost: lot.unitCost ? cash(lot.unitCost) : null,
    })),
    movements: bundle.movements.map((movement) => ({
      lotId: movement.lotId,
      productId: movement.productId,
      branchId: movement.branchId,
      type: movement.type,
      qty: movement.qtyBase,
      on: khartoumDate(movement.createdAt),
    })),
    sales: bundle.sales.map((sale) => ({
      id: sale.id,
      branchId: sale.branchId,
      docNo: sale.docNo,
      on: khartoumDate(sale.soldAt),
      subtotal: cash(sale.subtotal),
      discount: cash(sale.discount),
      total: cash(sale.total),
      paid: cash(sale.paid),
      status: sale.status,
    })),
    lines: bundle.sales.flatMap((sale) => sale.lines.map((line) => ({
      saleId: sale.id,
      productId: line.productId,
      branchId: sale.branchId,
      on: khartoumDate(sale.soldAt),
      qty: line.qty,
      lineTotal: cash(line.lineTotal),
      costTotal: cash(line.costTotal),
      discount: cash(line.discountAmount),
    }))),
    purchases: bundle.purchases.map((order) => ({
      id: order.id,
      branchId: order.branchId,
      docNo: order.docNo,
      status: order.status,
      orderedOn: khartoumDate(order.orderedAt),
      supplierId: order.supplierId,
      supplierAr: order.supplier.nameAr,
      supplierEn: order.supplier.nameEn,
    })),
    purchaseLines: bundle.purchases.flatMap((order) => order.lines.map((line) => ({
      purchaseId: order.id,
      productId: line.productId,
      qty: line.qty,
      receivedQty: line.receivedQty,
      unitCost: cash(line.unitCost),
    }))),
    receipts: bundle.receipts.map((receipt) => ({
      id: receipt.id,
      branchId: receipt.branchId,
      purchaseId: receipt.purchaseId,
      supplierId: receipt.supplierId,
      docNo: receipt.docNo,
      status: receipt.status,
      receivedOn: khartoumDate(receipt.receivedAt),
    })),
    receiptLines: bundle.receipts.flatMap((receipt) => receipt.lines.map((line) => ({
      id: line.id,
      receiptId: receipt.id,
      productId: line.productId,
      batchNo: line.batchNo,
      qty: line.qty,
      unitCost: cash(line.unitCost),
      receivedOn: khartoumDate(receipt.receivedAt),
    }))),
    suppliers: bundle.suppliers.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn, balance: cash(row.balance) })),
    customers: bundle.customers.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn, balance: cash(row.balance) })),
    prices,
    priceChanges: bundle.histories.map((row) => ({
      productId: row.productId,
      oldAmount: cash(row.oldAmount),
      newAmount: cash(row.newAmount),
      on: khartoumDate(row.createdAt),
      actorId: row.createdBy,
    })),
    lists: bundle.lists.map((list) => ({
      id: list.id,
      nameAr: list.nameAr,
      nameEn: list.nameEn,
      status: list.status,
      effectiveTo: list.effectiveTo ? khartoumDate(list.effectiveTo) : null,
      effectiveFrom: list.effectiveFrom ? khartoumDate(list.effectiveFrom) : null,
    })),
    knownUserIds: bundle.users.map((user) => user.id),
    tenantStatus: bundle.tenant?.status ?? 'ACTIVE',
    readOnly: bundle.tenant?.readOnly ?? false,
    subscriptionEnd: end ? khartoumDate(end) : null,
    subscriptionInvoices: invoices.map((invoice) => ({
      id: invoice.id,
      amount: cash(invoice.amount),
      status: invoice.status,
      dueOn: khartoumDate(invoice.dueAt),
    })),
  };
}

function factsForBranch(shared: ReturnType<typeof sharedFacts>, branchId: string, thresholds: AlertFacts['thresholds']): AlertFacts {
  const purchaseIds = new Set(shared.purchases.filter((row) => row.branchId === branchId).map((row) => row.id));
  const receiptIds = new Set(shared.receipts.filter((row) => row.branchId === branchId).map((row) => row.id));
  return {
    ...shared,
    thresholds,
    branches: shared.branches.filter((branch) => branch.id === branchId),
    lots: shared.lots.filter((row) => row.branchId === branchId),
    movements: shared.movements.filter((row) => row.branchId === branchId),
    sales: shared.sales.filter((row) => row.branchId === branchId),
    lines: shared.lines.filter((row) => row.branchId === branchId),
    purchases: shared.purchases.filter((row) => row.branchId === branchId),
    purchaseLines: shared.purchaseLines.filter((row) => purchaseIds.has(row.purchaseId)),
    receipts: shared.receipts.filter((row) => row.branchId === branchId),
    receiptLines: shared.receiptLines.filter((row) => receiptIds.has(row.receiptId)),
  };
}

function filterItems<T extends { category: string; severity: string; status: string; titleAr: string; titleEn: string; detailAr: string; detailEn: string; code: string; entityId: string }>(
  items: T[],
  query: AlertQuery,
): T[] {
  const q = query.q?.trim().toLowerCase() ?? '';
  return items.filter((item) => {
    if (query.category && query.category !== 'all' && item.category !== query.category && item.code !== query.category && !cardMatch(query.category, item)) return false;
    if (query.severity && query.severity !== 'all' && item.severity !== query.severity) return false;
    if (!q) return true;
    return `${item.titleAr} ${item.titleEn} ${item.detailAr} ${item.detailEn} ${item.code} ${item.entityId}`.toLowerCase().includes(q);
  });
}

function cardMatch(card: string, item: { category: string; severity: string; code: string }): boolean {
  if (card === 'critical') return item.severity === 'critical';
  if (card === 'expiry') return item.category === 'EXPIRY';
  if (card === 'stock') return ['OUT_OF_STOCK', 'LOW_STOCK', 'BELOW_MIN', 'NEAR_STOCKOUT'].includes(item.code);
  if (card === 'fast') return ['FAST', 'SPIKE', 'FAST_LOW'].includes(item.code);
  if (card === 'slow') return item.code === 'SLOW' || item.code.startsWith('DEAD');
  if (card === 'excess') return item.code === 'EXCESS';
  if (card === 'procurement') return item.category === 'PROCUREMENT';
  if (card === 'pricing') return item.category === 'PRICING';
  if (card === 'payments') return ['DUE_SOON', 'OVERDUE', 'UNPAID', 'CREDIT_LIMIT', 'CUSTOMER_DUE'].includes(item.code);
  if (card === 'profit') return ['REVENUE_DROP', 'MARGIN_DROP', 'DISCOUNT', 'REFUND'].includes(item.code);
  if (card === 'discrepancy') return ['DISCREPANCY', 'ADJUST', 'NEGATIVE', 'QTY_MISMATCH'].includes(item.code);
  return false;
}

async function event(
  tx: { alertEvent: { create(args: { data: { tenantId: string; caseId: string; kind: string; note: string; actorId: string | null } }): Promise<unknown> } },
  tenantId: string,
  caseId: string,
  actorId: string | null,
  kind: string,
  note: string,
) {
  await tx.alertEvent.create({ data: { tenantId, caseId, kind, note, actorId } });
}

function cash(value: MoneyLike | null | undefined): string {
  return value ? value.toFixed(2) : '0.00';
}
