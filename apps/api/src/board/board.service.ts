import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@dawaa/db';
import { cmpMoney } from '@dawaa/shared';
import { DomainError } from '../http/domain-error';
import { OpsService } from '../ops/ops.service';
import { PrismaService } from '../prisma/prisma.service';

export type BoardCard = {
  id: string;
  lane: string;
  severity: string;
  code: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  figureAr: string;
  figureEn: string;
};

export type ReceiptLine = {
  nameAr: string;
  nameEn: string;
  qty: string;
  unitAr: string;
  unitEn: string;
  price: string;
  total: string;
};

export type ReceiptPreview = {
  pharmacyAr: string;
  pharmacyEn: string | null;
  branchAr: string;
  branchEn: string | null;
  phone: string | null;
  receiptNo: string;
  cashierName: string;
  soldAt: string;
  lines: ReceiptLine[];
  subtotal: string;
  discount: string;
  total: string;
  paid: string;
  changeDue: string;
  paymentMethod: string;
  widthMm: number;
  footerAr: string;
  footerEn: string;
  showPhone: boolean;
};

@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OpsService,
  ) {}

  async load(tenantId: string, userId: string, jwtBranch: string | null, header: string | null): Promise<{
    kpis: BoardCard[];
    inventory: BoardCard[];
    procurement: BoardCard[];
    marketing: BoardCard[];
    alerts: BoardCard[];
    home: Report['home'];
  }> {
    const report = await this.ops.reports(tenantId, userId, jwtBranch, header);
    if (report.stockValue !== '0.00' || report.salesCount > 0 || report.purchases.length > 0) {
      return { ...liveBoard(report), home: report.home };
    }
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.operationalSignal.findMany({
        where: { tenantId },
        orderBy: [{ lane: 'asc' }, { sortOrder: 'asc' }],
      }),
    );
    const cards = rows.map(toCard);
    return {
      kpis: cards.filter((card) => card.lane === 'KPI'),
      inventory: cards.filter((card) => card.lane === 'INVENTORY'),
      procurement: cards.filter((card) => card.lane === 'PROCUREMENT'),
      marketing: cards.filter((card) => card.lane === 'MARKETING'),
      alerts: cards.filter((card) => card.severity === 'urgent' || card.severity === 'watch'),
      home: report.home,
    };
  }

  async receipt(tenantId: string): Promise<ReceiptPreview> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const options = await receiptOptions(tx, tenantId);
      const sale = await tx.sale.findFirst({
        where: { tenantId, status: 'POSTED' },
        orderBy: { soldAt: 'desc' },
        include: { lines: true },
      });
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
      if (!tenant) throw new DomainError('NOT_FOUND', 404);
      if (sale) {
        const branch = await tx.branch.findFirst({ where: { id: sale.branchId, tenantId, isDeleted: false } });
        const products = await tx.product.findMany({
          where: { tenantId, id: { in: sale.lines.map((line) => line.productId) } },
        });
        const forms = new Map(products.map((product) => [product.id, product.form]));
        return {
          pharmacyAr: tenant.tradeNameAr,
          pharmacyEn: tenant.tradeNameEn,
          branchAr: branch?.nameAr ?? '',
          branchEn: branch?.nameEn ?? null,
          phone: branch?.phone ?? tenant.phone,
          receiptNo: sale.docNo,
          cashierName: sale.cashierName,
          soldAt: sale.soldAt.toISOString(),
          lines: sale.lines.map((line) => ({
            nameAr: line.nameAr,
            nameEn: line.nameEn,
            qty: String(line.qty),
            unitAr: forms.get(line.productId) ?? '',
            unitEn: forms.get(line.productId) ?? '',
            price: line.unitPrice.toFixed(2),
            total: line.lineTotal.toFixed(2),
          })),
          subtotal: sale.subtotal.toFixed(2),
          discount: sale.discount.toFixed(2),
          total: sale.total.toFixed(2),
          paid: sale.paid.toFixed(2),
          changeDue: sale.changeDue.toFixed(2),
          paymentMethod: sale.paymentMethod,
          ...options,
        };
      }
      const draft = await tx.receiptDraft.findFirst({
        where: { tenantId },
        orderBy: { soldAt: 'desc' },
      });
      if (!draft) throw new DomainError('NOT_FOUND', 404);
      const branch = await tx.branch.findFirst({
        where: { id: draft.branchId, tenantId, isDeleted: false },
      });
      return {
        pharmacyAr: tenant.tradeNameAr,
        pharmacyEn: tenant.tradeNameEn,
        branchAr: branch?.nameAr ?? '',
        branchEn: branch?.nameEn ?? null,
        phone: branch?.phone ?? tenant.phone,
        receiptNo: draft.receiptNo,
        cashierName: draft.cashierName,
        soldAt: draft.soldAt.toISOString(),
        lines: parseLines(draft.linesJson),
        subtotal: draft.subtotal.toFixed(2),
        discount: draft.discount.toFixed(2),
        total: draft.total.toFixed(2),
        paid: draft.paid.toFixed(2),
        changeDue: draft.changeDue.toFixed(2),
        paymentMethod: draft.paymentMethod,
        ...options,
      };
    });
  }
}

type TenantTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function receiptOptions(tx: TenantTx, tenantId: string) {
  const defaults = [
    { key: 'receiptWidth', valueAr: '58', valueEn: '58' },
    { key: 'receiptFooter', valueAr: 'شكراً لزيارتكم', valueEn: 'Thank you' },
    { key: 'receiptShowPhone', valueAr: '1', valueEn: '1' },
  ];
  const found = await tx.pharmacySetting.findMany({ where: { tenantId, key: { in: defaults.map((item) => item.key) } } });
  for (const item of defaults) {
    if (!found.some((row) => row.key === item.key)) await tx.pharmacySetting.create({ data: { tenantId, ...item } });
  }
  const rows = found.length === defaults.length ? found : await tx.pharmacySetting.findMany({ where: { tenantId, key: { in: defaults.map((item) => item.key) } } });
  const value = (key: string) => rows.find((row) => row.key === key) ?? defaults.find((row) => row.key === key)!;
  const width = value('receiptWidth').valueEn === '80' ? 80 : 58;
  return {
    widthMm: width,
    footerAr: value('receiptFooter').valueAr,
    footerEn: value('receiptFooter').valueEn,
    showPhone: value('receiptShowPhone').valueAr !== '0',
  };
}

type Report = Awaited<ReturnType<OpsService['reports']>>;

function figure(amount: string): Pick<BoardCard, 'figureAr' | 'figureEn'> {
  return { figureAr: `${amount} ج.س`, figureEn: `${amount} SDG` };
}

function liveBoard(report: Report): {
  kpis: BoardCard[];
  inventory: BoardCard[];
  procurement: BoardCard[];
  marketing: BoardCard[];
  alerts: BoardCard[];
} {
  const kpis: BoardCard[] = [
    {
      id: 'kpi-sales',
      lane: 'KPI',
      severity: 'info',
      code: 'sales-today',
      titleAr: 'مبيعات اليوم',
      titleEn: 'Sales today',
      detailAr: `${report.salesCount} فاتورة مرحلة من المخزون`,
      detailEn: `${report.salesCount} posted invoices taken from stock`,
      ...figure(report.salesToday),
    },
    {
      id: 'kpi-expiry',
      lane: 'KPI',
      severity: report.expiring.length > 0 ? 'urgent' : 'info',
      code: 'expiry-30',
      titleAr: 'قرب الانتهاء خلال 30 يوماً',
      titleEn: 'Expiring within 30 days',
      detailAr: 'أصناف تحتاج إرجاعاً أو تخفيضاً',
      detailEn: 'Items that need a return or a discount',
      figureAr: `${report.expiring.length}`,
      figureEn: `${report.expiring.length}`,
    },
    {
      id: 'kpi-low',
      lane: 'KPI',
      severity: report.lowStock.length > 0 ? 'watch' : 'info',
      code: 'reorder',
      titleAr: 'تحت حد الطلب',
      titleEn: 'Below reorder level',
      detailAr: 'أصناف يفضّل شراؤها قبل النفاد',
      detailEn: 'Items worth buying before they run out',
      figureAr: `${report.lowStock.length}`,
      figureEn: `${report.lowStock.length}`,
    },
    {
      id: 'kpi-profit',
      lane: 'KPI',
      severity: 'info',
      code: 'gross-profit',
      titleAr: 'مجمل الربح',
      titleEn: 'Gross profit',
      detailAr: 'المبيعات ناقص تكلفة التشغيلات المباعة',
      detailEn: 'Sales minus the cost of the batches sold',
      ...figure(report.grossProfit),
    },
  ];
  const inventory: BoardCard[] = [
    ...report.expiring.map((item) => ({
      id: `exp-${item.id}`,
      lane: 'INVENTORY',
      severity: 'urgent' as const,
      code: item.sku,
      titleAr: item.nameAr,
      titleEn: item.nameEn,
      detailAr: `${item.location} · الكمية ${item.qty}`,
      detailEn: `${item.location} · quantity ${item.qty}`,
      figureAr: item.nearestExpiry ? item.nearestExpiry.slice(0, 10) : '',
      figureEn: item.nearestExpiry ? item.nearestExpiry.slice(0, 10) : '',
    })),
    ...report.lowStock.map((item) => ({
      id: `low-${item.id}`,
      lane: 'INVENTORY',
      severity: 'watch' as const,
      code: item.sku,
      titleAr: item.nameAr,
      titleEn: item.nameEn,
      detailAr: `الحد ${item.reorderLevel} والمتوفر ${item.qty}`,
      detailEn: `Reorder ${item.reorderLevel}, on hand ${item.qty}`,
      figureAr: `${item.qty}`,
      figureEn: `${item.qty}`,
    })),
    {
      id: 'stock-value',
      lane: 'INVENTORY',
      severity: 'info',
      code: 'stock-value',
      titleAr: 'قيمة المخزون بالتكلفة',
      titleEn: 'Stock at cost',
      detailAr: 'مجموع الكمية في التكلفة الحالية',
      detailEn: 'Quantity times the current cost',
      ...figure(report.stockValue),
    },
  ];
  if (report.stocking) {
    inventory.unshift({
      id: 'ready-stock',
      lane: 'INVENTORY',
      severity: report.stocking.awaitingPosting > 0 ? 'watch' : 'info',
      code: 'ready-stock',
      titleAr: 'أدوية جاهزة للتخزين',
      titleEn: 'Medicines ready for stocking',
      detailAr: `كمية بانتظار الإدخال ${report.stocking.pendingQty}`,
      detailEn: `${report.stocking.pendingQty} units still waiting to be posted`,
      figureAr: `${report.stocking.awaitingPosting}`,
      figureEn: `${report.stocking.awaitingPosting}`,
    });
  }
  const procurement: BoardCard[] = [
    ...report.suppliers
      .filter((supplier) => cmpMoney(supplier.balance, '0.00') > 0)
      .map((supplier, index) => ({
        id: `sup-${index}`,
        lane: 'PROCUREMENT',
        severity: 'watch' as const,
        code: 'payable',
        titleAr: supplier.nameAr,
        titleEn: supplier.nameEn,
        detailAr: 'رصيد مستحق للمورد',
        detailEn: 'Balance still owed to the supplier',
        ...figure(supplier.balance),
      })),
    ...report.purchases.slice(0, 3).map((order) => ({
      id: `po-${order.docNo}`,
      lane: 'PROCUREMENT',
      severity: 'info' as const,
      code: order.docNo,
      titleAr: order.supplierAr,
      titleEn: order.supplierEn,
      detailAr: `استلام ${order.docNo}`,
      detailEn: `Receipt ${order.docNo}`,
      ...figure(order.total),
    })),
  ];
  if (report.stocking) {
    procurement.unshift(
      {
        id: 'pending-receipts',
        lane: 'PROCUREMENT',
        severity: report.stocking.pendingReceipts > 0 ? 'watch' : 'info',
        code: 'pending-receipts',
        titleAr: 'بانتظار الاستلام',
        titleEn: 'Pending receipts',
        detailAr: 'أوامر معتمدة لم تُستلم بالكامل',
        detailEn: 'Approved orders that are not fully received',
        figureAr: `${report.stocking.pendingReceipts}`,
        figureEn: `${report.stocking.pendingReceipts}`,
      },
      {
        id: 'awaiting-post',
        lane: 'PROCUREMENT',
        severity: report.stocking.awaitingPosting > 0 ? 'watch' : 'info',
        code: 'awaiting-post',
        titleAr: 'بانتظار إدخال المخزون',
        titleEn: 'Awaiting inventory posting',
        detailAr: `${report.stocking.fullyStocked} دواء دخل المخزون بالكامل`,
        detailEn: `${report.stocking.fullyStocked} medicines are fully stocked`,
        figureAr: `${report.stocking.awaitingPosting}`,
        figureEn: `${report.stocking.awaitingPosting}`,
      },
    );
  }
  const marketing: BoardCard[] = report.top.map((item, index) => ({
    id: `top-${index}`,
    lane: 'MARKETING',
    severity: 'info' as const,
    code: 'top',
    titleAr: item.nameAr,
    titleEn: item.nameEn,
    detailAr: `بيع ${item.qty} وحدة`,
    detailEn: `${item.qty} units sold`,
    ...figure(item.total),
  }));
  if (marketing.length === 0) {
    marketing.push({
      id: 'top-empty',
      lane: 'MARKETING',
      severity: 'info',
      code: 'top',
      titleAr: 'لا توجد مبيعات بعد',
      titleEn: 'No sales yet',
      detailAr: 'أول فاتورة تظهر هنا',
      detailEn: 'The first invoice shows up here',
      figureAr: '0',
      figureEn: '0',
    });
  }
  const alerts = [...kpis, ...inventory, ...procurement, ...marketing].filter(
    (card) => card.severity === 'urgent' || card.severity === 'watch',
  );
  return { kpis, inventory, procurement, marketing, alerts };
}

function toCard(row: {
  id: string;
  lane: string;
  severity: string;
  code: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  figureAr: string;
  figureEn: string;
}): BoardCard {
  return {
    id: row.id,
    lane: row.lane,
    severity: row.severity,
    code: row.code,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    detailAr: row.detailAr,
    detailEn: row.detailEn,
    figureAr: row.figureAr,
    figureEn: row.figureEn,
  };
}

function parseLines(value: string): ReceiptLine[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isLine);
}

function isLine(value: unknown): value is ReceiptLine {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.nameAr === 'string' &&
    typeof row.nameEn === 'string' &&
    typeof row.qty === 'string' &&
    typeof row.unitAr === 'string' &&
    typeof row.unitEn === 'string' &&
    typeof row.price === 'string' &&
    typeof row.total === 'string'
  );
}
