import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@dawaa/db';
import { addMoney, cmpMoney, isSystemSupplier, missingSudanSuppliers, money, MoneyError, mulMoney, ROLE_PERMISSIONS, subMoney, type RoleCode } from '@dawaa/shared';
import { ALERT_STANDARD_VERSION, PREVIOUS_ALERT_DEFAULTS, assertAlertSetting, canConfigureAlerts, defaultAlertSettings } from '../board/alerts.logic';
import { PasswordService } from '../auth/password.service';
import { DomainError } from '../http/domain-error';
import { PrismaService } from '../prisma/prisma.service';
import { ensureTenantReference, findCommercialDuplicate, searchPublishedLibrary, type LibraryHit } from '../catalog/global-library';
import { plainMedicineName } from './medicine-name';
import { allocateFefo, allocateReceiptCosts, assertJournalBalances, assertReceiptLine, balanceDelta, buildHome, canStockReceipt, claimReceiptQty, claimStockQty, containerUnitPrice, duplicateActivePharmacyListIds, inventoryDocNo, isSellableLot, khartoumDate, khartoumDayStart, manufacturerBatch, nextPrice, normalizePlace, orderStockState, parseCsv, parseItemPack, pieceUnitCost, piecesInContainer, placeCompatible, priceChangePct, priceListDateGate, priceListWorkflow, qtyToStockPieces, renewAmount, resolveSellingPriceListId, saleChoices, STOCK_PLACES, storageNeed, suggestPlace, summarizeStocking, usdSellingPrice, type ItemPack, type OrderBucket, type PriceOp, type RenewAdjust, type SaleUnit } from './ops.logic';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

type MoneyRow = { toFixed(digits: number): string };

function cash(value: MoneyRow | string): string {
  return money(typeof value === 'string' ? value : value.toFixed(2));
}

function uniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

function ensureProducts(tx: Tx, tenantId: string, actorId: string, codes: string[]): Promise<number> {
  return ensureTenantReference(tx, tenantId, actorId, codes);
}

async function writePrices(
  tx: Tx,
  tenantId: string,
  actorId: string,
  priceListId: string,
  lines: { productId: string; amount: string }[],
) {
  for (const line of lines) {
    const amount = money(line.amount);
    const current = await tx.productPrice.findFirst({
      where: { tenantId, priceListId, productId: line.productId },
    });
    const oldAmount = current ? cash(current.amount) : '0.00';
    if (current) {
      await tx.productPrice.update({ where: { id: current.id }, data: { amount, isManualOverride: true } });
    } else {
      await tx.productPrice.create({
        data: { tenantId, priceListId, productId: line.productId, amount, isManualOverride: true, createdBy: actorId },
      });
    }
    await tx.priceHistory.create({
      data: { tenantId, priceListId, productId: line.productId, oldAmount, newAmount: amount, createdBy: actorId },
    });
  }
}

async function writeCodedPrices(
  tx: Tx,
  tenantId: string,
  actorId: string,
  priceListId: string,
  items: { code: string; amount: string }[],
) {
  await ensureProducts(tx, tenantId, actorId, items.map((row) => row.code));
  const products = await tx.product.findMany({
    where: { tenantId, sku: { in: items.map((row) => row.code) }, isDeleted: false },
  });
  const bySku = new Map(products.map((product) => [product.sku, product.id]));
  const missing = items.find((row) => !bySku.has(row.code));
  if (missing) throw new DomainError('NOT_FOUND', 404);
  await writePrices(
    tx,
    tenantId,
    actorId,
    priceListId,
    items.map((row) => ({ productId: bySku.get(row.code) ?? '', amount: row.amount })),
  );
}

export type ProductView = {
  id: string;
  sku: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  genericName: string;
  form: string;
  strength: string;
  reorderLevel: number;
  sellPrice: string;
  costPrice: string;
  costUsd: string;
  isLocal: boolean;
  trackSerial: boolean;
  gtin: string;
  qty: number;
  nearestExpiry: string | null;
  location: string;
};

export type SaleInput = {
  customerName: string;
  discount: string;
  paid: string;
  paymentMethod: string;
  hold?: boolean;
  lines: { productId: string; qty: number; unit?: SaleUnit }[];
};

const UNIT_AR: Record<SaleUnit, string> = { BOX: 'علبة', STRIP: 'شريط', BOTTLE: 'زجاجة', PIECE: 'حبة' };
const UNIT_EN: Record<SaleUnit, string> = { BOX: 'Box', STRIP: 'Strip', BOTTLE: 'Bottle', PIECE: 'Piece' };

type RatePreview = {
  productId: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  oldPrice: string;
  newPrice: string;
  changePct: string;
  belowCost: boolean;
};

export type PurchaseInput = {
  supplierId: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  notes?: string;
  lines: {
    productId?: string;
    code?: string;
    qty: number;
    unitCost?: string;
    sellPrice?: string;
    pack?: ItemPack;
    unitCode?: string;
  }[];
};

export type ReceiveLine = {
  productId?: string;
  code?: string;
  qty: number;
  unitCost: string;
  sellPrice?: string;
  rejectedQty?: number;
  batchNo: string;
  expiry: string;
  location: string;
  condition?: 'AVAILABLE' | 'REJECTED' | 'QUARANTINE' | 'DAMAGED';
  manufacturedAt?: string;
  serialNo?: string;
  bonusQty?: number;
  unitCode?: string;
  pack?: ItemPack;
};

export type GoodsReceiptInput = {
  clientKey: string;
  purchaseId?: string;
  opening?: boolean;
  override?: boolean;
  supplierInvoice?: string;
  currency?: 'SDG' | 'USD';
  discount?: string;
  tax?: string;
  charges?: string;
  post: boolean;
  lines: ReceiveLine[];
};

export type InventoryPostInput = {
  clientKey: string;
  post: boolean;
  lines: { receiptLineId: string; qty: number; location: string }[];
};

export type ProductInput = {
  categoryId: string;
  nameAr: string;
  nameEn: string;
  genericName: string;
  form: string;
  strength: string;
  reorderLevel: number;
  sellPrice: string;
  costPrice: string;
  batchNo: string;
  expiry: string;
  qtyBase: number;
  location: string;
  manufacturedAt?: string;
  serialNo?: string;
  bonusQty?: number;
};

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  inventory(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const branch = scope.readBranchId ? { branchId: scope.readBranchId } : {};
      const [categories, products, lots, receiptLines] = await Promise.all([
        tx.category.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.stockLot.findMany({ where: { tenantId, ...branch } }),
        tx.goodsReceiptLine.findMany({
          where: {
            tenantId,
            condition: 'AVAILABLE',
            receipt: { tenantId, status: 'POSTED', source: 'PROCUREMENT', ...branch },
          },
          select: { productId: true, qty: true, bonusQty: true, postedQty: true },
        }),
      ]);
      const today = khartoumDate();
      const remainingByProduct = new Map<string, number>();
      for (const line of receiptLines) {
        const left = Math.max(0, line.qty + line.bonusQty - line.postedQty);
        if (left === 0) continue;
        remainingByProduct.set(line.productId, (remainingByProduct.get(line.productId) ?? 0) + left);
      }
      const expiredByProduct = new Map<string, number>();
      for (const lot of lots) {
        if (lot.qtyBase <= 0 || lot.condition !== 'AVAILABLE' || khartoumDate(lot.expiry) >= today) continue;
        expiredByProduct.set(lot.productId, (expiredByProduct.get(lot.productId) ?? 0) + lot.qtyBase);
      }
      const priced = await this.withPrices(
        tx,
        tenantId,
        scope.readBranchId,
        (await this.paintProducts(tx, products)).map((product) => this.viewProduct(product, lots)),
      );
      return {
        categories: categories.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn })),
        products: priced.map((product) => ({
          ...product,
          remaining: remainingByProduct.get(product.id) ?? 0,
          expiredQty: expiredByProduct.get(product.id) ?? 0,
        })),
        stocking: await this.stockingSummary(tx, tenantId, scope.readBranchId),
        scope: { management: scope.management, all: scope.readBranchId === null },
      };
    });
  }

  async createProduct(tenantId: string, branchHint: string | null, actorId: string, header: string | null, input: ProductInput) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, header, false)).readBranchId;
        const match = await findCommercialDuplicate(tx, {
          nameEn: input.nameEn,
          genericName: input.genericName,
          strength: input.strength,
          dosageForm: input.form,
          manufacturer: '',
        });
        if (match) throw new DomainError('DUPLICATE_PRODUCT', 409, { fields: { nameEn: 'duplicate', matchId: match.id, matchCode: match.code } });
        const request = await tx.newCatalogItemRequest.create({
          data: {
            tenantId,
            branchId,
            requestedBy: actorId,
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            genericName: input.genericName,
            strength: input.strength,
            itemType: 'Medicine',
            note: 'Submitted from the pharmacy instead of a local medicine master.',
            status: 'PENDING',
          },
          select: { id: true },
        });
        await this.audit(tx, {
          tenantId,
          actorId,
          branchId,
          action: 'catalog.request',
          entityType: 'NewCatalogItemRequest',
          entityId: request.id,
          newJson: JSON.stringify({ nameEn: input.nameEn }),
        });
        return { id: request.id, requested: true };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async adjustStock(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    header: string | null,
    input: { productId: string; qtyDelta: number; note: string },
  ) {
    try {
      if (!Number.isInteger(input.qtyDelta) || input.qtyDelta === 0) throw new DomainError('VALIDATION_ERROR', 400);
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, header, true)).writeBranchId;
        const product = await tx.product.findFirst({ where: { id: input.productId, tenantId, isDeleted: false } });
        if (!product) throw new DomainError('NOT_FOUND', 404);
        if (input.qtyDelta > 0) {
          const lot = await tx.stockLot.findFirst({
            where: { tenantId, productId: product.id, qtyBase: { gt: 0 } },
            orderBy: { expiry: 'desc' },
          });
          const lotId = lot?.id ?? randomUUID();
          if (!lot) {
            await tx.stockLot.create({
              data: {
                id: lotId,
                tenantId,
                branchId,
                productId: product.id,
                batchNo: `ADJ-${khartoumDate()}`,
                expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                qtyBase: input.qtyDelta,
                location: 'تسوية',
                createdBy: actorId,
              },
            });
          } else {
            await tx.stockLot.update({ where: { id: lot.id }, data: { qtyBase: lot.qtyBase + input.qtyDelta } });
          }
          await tx.stockMovement.create({
            data: {
              tenantId,
              branchId,
              productId: product.id,
              lotId,
              type: 'ADJUST',
              qtyBase: input.qtyDelta,
              note: input.note,
              refType: 'ADJUST',
              createdBy: actorId,
            },
          });
        } else {
          await this.takeStock(tx, tenantId, branchId, actorId, product.id, -input.qtyDelta, 'ADJUST', null, input.note);
        }
        const value = mulMoney(cash(product.costPrice), String(Math.abs(input.qtyDelta)));
        if (input.qtyDelta > 0) {
          await this.postJournal(tx, tenantId, actorId, 'تسوية زيادة', 'Stock increase', [
            { code: '1200', debit: value, credit: '0.00' },
            { code: '3000', debit: '0.00', credit: value },
          ]);
        } else {
          await this.postJournal(tx, tenantId, actorId, 'تسوية نقص', 'Stock decrease', [
            { code: '5100', debit: value, credit: '0.00' },
            { code: '1200', debit: '0.00', credit: value },
          ]);
        }
        return { ok: true };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  sales(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const saleWhere = scope.readBranchId ? { tenantId, branchId: scope.readBranchId } : { tenantId };
      const lotWhere = scope.readBranchId ? { tenantId, branchId: scope.readBranchId } : { tenantId };
      const [sales, products, customers, lots] = await Promise.all([
        tx.sale.findMany({ where: { ...saleWhere, status: 'POSTED' }, orderBy: { soldAt: 'desc' }, take: 30, include: { lines: true } }),
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.customer.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.stockLot.findMany({ where: lotWhere }),
      ]);
      return {
        products: await this.withPrices(
          tx,
          tenantId,
          scope.readBranchId,
          (await this.paintProducts(tx, products)).map((product) => this.viewProduct(product, lots)),
        ),
        customers: customers.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn })),
        sales: sales.map((sale) => ({
          id: sale.id,
          docNo: sale.docNo,
          customerName: sale.customerName,
          cashierName: sale.cashierName,
          soldAt: sale.soldAt.toISOString(),
          total: cash(sale.total),
          paid: cash(sale.paid),
          changeDue: cash(sale.changeDue),
          paymentMethod: sale.paymentMethod,
          lines: sale.lines.map((line) => ({
            nameAr: line.nameAr,
            nameEn: line.nameEn,
            qty: line.qty,
            lineTotal: cash(line.lineTotal),
          })),
        })),
      };
    });
  }

  async createSale(tenantId: string, branchHint: string | null, actorId: string, header: string | null, input: SaleInput) {
    try {
      const discount = money(input.discount);
      const paid = money(input.paid);
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, header, true)).writeBranchId;
        const cashier = await tx.user.findFirst({ where: { id: actorId, tenantId } });
        const ids = [...new Set(input.lines.map((line) => line.productId))];
        const products = await tx.product.findMany({ where: { tenantId, id: { in: ids }, isDeleted: false } });
        if (products.length !== ids.length) throw new DomainError('NOT_FOUND', 404);
        const byId = new Map(products.map((product) => [product.id, product]));
        const priceMap = await this.priceQuote(tx, tenantId, branchId, ids);
        const sellingListId = [...priceMap.values()][0]?.listId ?? null;
        const listed = sellingListId ? { id: sellingListId } : null;
        const packs = await this.itemPacks(tx, tenantId, ids);
        let subtotal = '0.00';
        let cost = '0.00';
        const priced = input.lines.map((line) => {
          const product = byId.get(line.productId);
          if (!product) throw new DomainError('NOT_FOUND', 404);
          const pack = packs.get(product.id) ?? null;
          const choice = line.unit && pack ? saleChoices(pack).find((item) => item.unit === line.unit) : undefined;
          if (line.unit && pack && !choice) throw new DomainError('VALIDATION_ERROR', 400);
          const sold = choice ?? { unit: 'PIECE' as const, pieces: 1, divide: 1 };
          const stockQty = line.qty * sold.pieces;
          if (!Number.isSafeInteger(stockQty) || stockQty > 1_000_000) throw new DomainError('VALIDATION_ERROR', 400);
          const quote = priceMap.get(product.id);
          const container = quote?.amount ?? (listed ? '' : cash(product.sellPrice));
          if (!container || cmpMoney(container, '0.00') <= 0) throw new DomainError(listed ? 'NO_SELL_PRICE' : 'VALIDATION_ERROR', 400);
          const unitPrice = containerUnitPrice(container, sold.divide);
          const lineTotal = mulMoney(unitPrice, String(line.qty));
          const costTotal = mulMoney(mulMoney(cash(product.costPrice), String(sold.pieces)), String(line.qty));
          subtotal = addMoney(subtotal, lineTotal);
          cost = addMoney(cost, costTotal);
          const named = Boolean(pack && line.unit);
          return {
            product,
            qty: line.qty,
            stockQty,
            lineTotal,
            costTotal,
            unitPrice,
            quote,
            nameAr: named ? `${product.nameAr} · ${UNIT_AR[sold.unit]}` : product.nameAr,
            nameEn: named ? `${product.nameEn} · ${UNIT_EN[sold.unit]}` : product.nameEn,
            unitCost: mulMoney(cash(product.costPrice), String(sold.pieces)),
          };
        });
        if (cmpMoney(discount, subtotal) > 0) throw new DomainError('VALIDATION_ERROR', 400);
        const total = subMoney(subtotal, discount);
        if (input.hold) {
          const today = khartoumDate();
          for (const line of priced) {
            const lots = await tx.stockLot.findMany({ where: { tenantId, branchId, productId: line.product.id } });
            const onHand = lots
              .filter((lot) => isSellableLot({ qtyBase: lot.qtyBase, expiry: lot.expiry.toISOString(), condition: lot.condition }, today))
              .reduce((sum, lot) => sum + lot.qtyBase, 0);
            if (onHand < line.stockQty) throw new DomainError('STOCK_SHORT', 409);
          }
          const saleId = randomUUID();
          const docNo = `S-${saleId.slice(0, 8).toUpperCase()}`;
          await tx.sale.create({
            data: {
              id: saleId,
              tenantId,
              branchId,
              docNo,
              customerName: input.customerName,
              cashierName: cashier?.displayName ?? '',
              soldAt: new Date(),
              subtotal,
              discount,
              total,
              paid: '0.00',
              changeDue: '0.00',
              paymentMethod: 'PENDING',
              status: 'AWAITING_CASH',
              createdBy: actorId,
            },
          });
          for (const line of priced) {
            await tx.saleLine.create({
              data: {
                tenantId,
                saleId,
                productId: line.product.id,
                nameAr: line.nameAr,
                nameEn: line.nameEn,
                qty: line.qty,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
                costTotal: line.costTotal,
                unitCost: line.unitCost,
                discountAmount: '0.00',
                priceListId: line.quote?.listId ?? null,
                priceListVersionNo: line.quote?.version ?? null,
                createdBy: actorId,
              },
            });
          }
          return { id: saleId, docNo, total, changeDue: '0.00', status: 'AWAITING_CASH' };
        }
        if (cmpMoney(paid, total) < 0) throw new DomainError('VALIDATION_ERROR', 400);
        const saleId = randomUUID();
        const docNo = `S-${saleId.slice(0, 8).toUpperCase()}`;
        for (const line of priced) {
          await this.takeStock(tx, tenantId, branchId, actorId, line.product.id, line.stockQty, 'SALE', saleId, docNo);
        }
        await tx.sale.create({
          data: {
            id: saleId,
            tenantId,
            branchId,
            docNo,
            customerName: input.customerName,
            cashierName: cashier?.displayName ?? '',
            soldAt: new Date(),
            subtotal,
            discount,
            total,
            paid,
            changeDue: subMoney(paid, total),
            paymentMethod: input.paymentMethod,
            status: 'POSTED',
            createdBy: actorId,
          },
        });
        for (const line of priced) {
          await tx.saleLine.create({
            data: {
              tenantId,
              saleId,
              productId: line.product.id,
              nameAr: line.nameAr,
              nameEn: line.nameEn,
              qty: line.qty,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              costTotal: line.costTotal,
              unitCost: line.unitCost,
              discountAmount: '0.00',
              priceListId: line.quote?.listId ?? null,
              priceListVersionNo: line.quote?.version ?? null,
              createdBy: actorId,
            },
          });
        }
        await this.postJournal(tx, tenantId, actorId, `بيع ${docNo}`, `Sale ${docNo}`, [
          { code: '1000', debit: total, credit: '0.00' },
          { code: '4000', debit: '0.00', credit: total },
          { code: '5000', debit: cost, credit: '0.00' },
          { code: '1200', debit: '0.00', credit: cost },
        ]);
        return { id: saleId, docNo, total, changeDue: subMoney(paid, total), status: 'POSTED' };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  waitingSales(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const where = scope.readBranchId
        ? { tenantId, branchId: scope.readBranchId, status: 'AWAITING_CASH' }
        : { tenantId, status: 'AWAITING_CASH' };
      const sales = await tx.sale.findMany({ where, orderBy: { soldAt: 'asc' }, include: { lines: true }, take: 20 });
      return {
        sales: sales.map((sale) => ({
          id: sale.id,
          docNo: sale.docNo,
          customerName: sale.customerName,
          cashierName: sale.cashierName,
          soldAt: sale.soldAt.toISOString(),
          total: cash(sale.total),
          lines: sale.lines.map((line) => ({
            nameAr: line.nameAr,
            nameEn: line.nameEn,
            qty: line.qty,
            lineTotal: cash(line.lineTotal),
          })),
        })),
      };
    });
  }

  async receiveSale(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    header: string | null,
    input: { saleId: string; paid: string; paymentMethod: string },
  ) {
    try {
      const paid = money(input.paid);
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, header, true)).writeBranchId;
        const sale = await tx.sale.findFirst({ where: { id: input.saleId, tenantId }, include: { lines: true } });
        if (!sale || sale.status !== 'AWAITING_CASH' || sale.branchId !== branchId) throw new DomainError('NOT_FOUND', 404);
        const total = cash(sale.total);
        if (cmpMoney(paid, total) < 0) throw new DomainError('VALIDATION_ERROR', 400);
        const cashier = await tx.user.findFirst({ where: { id: actorId, tenantId } });
        const packs = await this.itemPacks(tx, tenantId, sale.lines.map((line) => line.productId));
        let cost = '0.00';
        for (const line of sale.lines) {
          const pack = packs.get(line.productId) ?? null;
          const unit = (['BOX', 'STRIP', 'BOTTLE', 'PIECE'] as const).find((key) => line.nameEn.endsWith(` · ${UNIT_EN[key]}`));
          const choice = unit && pack ? saleChoices(pack).find((item) => item.unit === unit) : undefined;
          const stockQty = line.qty * (choice?.pieces ?? 1);
          await this.takeStock(tx, tenantId, branchId, actorId, line.productId, stockQty, 'SALE', sale.id, sale.docNo);
          cost = addMoney(cost, cash(line.costTotal));
        }
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            status: 'POSTED',
            paid,
            changeDue: subMoney(paid, total),
            paymentMethod: input.paymentMethod,
            cashierName: cashier?.displayName ?? sale.cashierName,
            soldAt: new Date(),
            updatedBy: actorId,
          },
        });
        await this.postJournal(tx, tenantId, actorId, `بيع ${sale.docNo}`, `Sale ${sale.docNo}`, [
          { code: '1000', debit: total, credit: '0.00' },
          { code: '4000', debit: '0.00', credit: total },
          { code: '5000', debit: cost, credit: '0.00' },
          { code: '1200', debit: '0.00', credit: cost },
        ]);
        return {
          id: sale.id,
          docNo: sale.docNo,
          customerName: sale.customerName,
          cashierName: cashier?.displayName ?? sale.cashierName,
          total,
          paid,
          changeDue: subMoney(paid, total),
          paymentMethod: input.paymentMethod,
          status: 'POSTED',
          lines: sale.lines.map((line) => ({ nameAr: line.nameAr, nameEn: line.nameEn, qty: line.qty, lineTotal: cash(line.lineTotal) })),
        };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  purchasing(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const orderWhere = scope.readBranchId ? { tenantId, branchId: scope.readBranchId } : { tenantId };
      const [orders, foundSuppliers, products, receipts, stocking] = await Promise.all([
        tx.purchaseOrder.findMany({
          where: orderWhere,
          orderBy: { orderedAt: 'desc' },
          take: 30,
          include: { lines: { include: { product: true } }, supplier: true },
        }),
        tx.supplier.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.goodsReceipt.findMany({
          where: { ...orderWhere, source: 'PROCUREMENT', status: 'POSTED' },
          include: { lines: { select: { purchaseLineId: true, qty: true, bonusQty: true, postedQty: true, condition: true } } },
        }),
        this.stockingSummary(tx, tenantId, scope.readBranchId),
      ]);
      const missing = missingSudanSuppliers(foundSuppliers.map((row) => row.nameEn));
      const suppliers = missing.length === 0
        ? foundSuppliers
        : await tx.supplier.createMany({
          data: missing.map((supplier) => ({
            id: randomUUID(),
            tenantId,
            nameAr: supplier.nameAr,
            nameEn: supplier.nameEn,
            phone: supplier.phone,
            city: supplier.city,
            balance: '0.00',
          })),
        }).then(() => tx.supplier.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }));
      const namedProducts = await this.paintProducts(tx, products);
      const packByProduct = await this.itemPacks(tx, tenantId, products.map((row) => row.id));
      const namedLines = new Map(
        (await this.paintProducts(tx, orders.flatMap((order) => order.lines.map((line) => line.product)))).map((product) => [product.id, product]),
      );
      return {
        suppliers: suppliers.map((row) => ({
          id: row.id,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          phone: row.phone,
          city: row.city,
          balance: cash(row.balance),
          system: isSystemSupplier(row.nameEn),
        })),
        canCreateSupplier: scope.canViewAll,
        products: namedProducts.map((row) => ({
          id: row.id,
          sku: row.sku,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          genericName: row.genericName,
          form: row.form,
          strength: row.strength,
          gtin: row.gtin ?? '',
          costPrice: cash(row.costPrice),
          sellPrice: cash(row.sellPrice),
          trackSerial: row.trackSerial,
        })),
        stocking,
        orders: orders.map((order) => {
          const received = receipts
            .filter((receipt) => receipt.purchaseId === order.id)
            .flatMap((receipt) => receipt.lines)
            .map((line) => ({
              condition: line.condition,
              received: line.qty + line.bonusQty,
              posted: line.postedQty,
            }));
          return {
            id: order.id,
            docNo: order.docNo,
            status: order.status,
            stockStatus: orderStockState(received),
            total: cash(order.total),
            orderedAt: order.orderedAt.toISOString(),
            supplierAr: order.supplier.nameAr,
            supplierEn: order.supplier.nameEn,
            supplierId: order.supplierId,
            lines: order.lines.map((line) => ({
              id: line.id,
              qty: line.qty,
              receivedQty: line.receivedQty,
              unitCode: line.unitCode,
              pack: packByProduct.get(line.productId) ?? null,
              unitCost: cash(line.unitCost),
              lineTotal: cash(line.lineTotal),
              productId: line.productId,
              nameAr: namedLines.get(line.productId)?.nameAr ?? line.product.nameAr,
              nameEn: namedLines.get(line.productId)?.nameEn ?? line.product.nameEn,
              strength: namedLines.get(line.productId)?.strength ?? line.product.strength,
              form: namedLines.get(line.productId)?.form ?? line.product.form,
            })),
          };
        }),
      };
    });
  }

  async createPurchase(tenantId: string, branchHint: string | null, actorId: string, header: string | null, input: PurchaseInput) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, header, true)).writeBranchId;
        const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId, isDeleted: false } });
        if (!supplier) throw new DomainError('NOT_FOUND', 404);
        const readyLines = [];
        for (const line of input.lines) {
          let productId = line.productId;
          if (!productId && line.code) {
            await ensureProducts(tx, tenantId, actorId, [line.code]);
            const created = await tx.product.findFirst({ where: { tenantId, sku: line.code, isDeleted: false } });
            if (!created) throw new DomainError('NOT_FOUND', 404);
            productId = created.id;
          }
          if (!productId) throw new DomainError('NOT_FOUND', 404);
          readyLines.push({ ...line, productId });
        }
        const ids = [...new Set(readyLines.map((line) => line.productId))];
        const products = await tx.product.findMany({ where: { tenantId, id: { in: ids }, isDeleted: false } });
        if (products.length !== ids.length) throw new DomainError('NOT_FOUND', 404);
        const byId = new Map(products.map((product) => [product.id, product]));
        let total = '0.00';
        const lines = readyLines.map((line) => {
          const product = byId.get(line.productId);
          if (!product) throw new DomainError('NOT_FOUND', 404);
          const unitCost = line.unitCost ? money(line.unitCost) : '0.00';
          const lineTotal = mulMoney(unitCost, String(line.qty));
          total = addMoney(total, lineTotal);
          if (line.sellPrice) money(line.sellPrice);
          return { ...line, unitCost, lineTotal, product };
        });
        const purchaseId = randomUUID();
        const docNo = `PO-${purchaseId.slice(0, 8).toUpperCase()}`;
        await tx.purchaseOrder.create({
          data: {
            id: purchaseId,
            tenantId,
            branchId,
            supplierId: supplier.id,
            docNo,
            status: 'ORDERED',
            priority: input.priority ?? 'NORMAL',
            notes: input.notes ?? '',
            total,
            orderedAt: new Date(),
            createdBy: actorId,
          },
        });
        for (const line of lines) {
          if (line.pack) await this.rememberPack(tx, tenantId, actorId, line.productId, line.pack);
          const unitCode = line.unitCode ?? line.pack?.outer ?? 'PIECE';
          await tx.purchaseLine.create({
            data: {
              tenantId,
              purchaseId,
              productId: line.productId,
              qty: line.qty,
              receivedQty: 0,
              unitCode,
              unitCost: line.unitCost,
              lineTotal: line.lineTotal,
              createdBy: actorId,
            },
          });
        }
        await this.audit(tx, {
          tenantId,
          actorId,
          branchId,
          action: 'purchase.order',
          entityType: 'PurchaseOrder',
          entityId: purchaseId,
          newJson: JSON.stringify({ docNo, total, status: 'ORDERED' }),
        });
        return { id: purchaseId, docNo, total, status: 'ORDERED', warnings: [] as string[] };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  finance(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [accounts, entries, expenses] = await Promise.all([
        tx.ledgerAccount.findMany({ where: { tenantId, isDeleted: false }, orderBy: { code: 'asc' } }),
        tx.journalEntry.findMany({
          where: { tenantId },
          orderBy: { postedAt: 'desc' },
          take: 20,
          include: { lines: true },
        }),
        tx.expense.findMany({ where: { tenantId }, orderBy: { spentAt: 'desc' }, take: 20 }),
      ]);
      return {
        accounts: accounts.map((row) => ({
          code: row.code,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          kind: row.kind,
          balance: cash(row.balance),
        })),
        entries: entries.map((entry) => ({
          id: entry.id,
          docNo: entry.docNo,
          memoAr: entry.memoAr,
          memoEn: entry.memoEn,
          postedAt: entry.postedAt.toISOString(),
          amount: entry.lines.reduce((sum, line) => addMoney(sum, cash(line.debit)), '0.00'),
        })),
        expenses: expenses.map((row) => ({
          id: row.id,
          titleAr: row.titleAr,
          titleEn: row.titleEn,
          amount: cash(row.amount),
          spentAt: row.spentAt.toISOString(),
        })),
      };
    });
  }

  async createExpense(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    input: { titleAr: string; titleEn: string; amount: string },
  ) {
    try {
      const amount = money(input.amount);
      if (cmpMoney(amount, '0.00') <= 0) throw new DomainError('VALIDATION_ERROR', 400);
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, null, true)).writeBranchId;
        const account = await tx.ledgerAccount.findFirst({ where: { tenantId, code: '5100' } });
        if (!account) throw new DomainError('NOT_FOUND', 404);
        await tx.expense.create({
          data: {
            tenantId,
            branchId,
            accountId: account.id,
            titleAr: input.titleAr,
            titleEn: input.titleEn,
            amount,
            spentAt: new Date(),
            createdBy: actorId,
          },
        });
        await this.postJournal(tx, tenantId, actorId, input.titleAr, input.titleEn, [
          { code: '5100', debit: amount, credit: '0.00' },
          { code: '1000', debit: '0.00', credit: amount },
        ]);
        return { ok: true };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  users(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [users, roles, links] = await Promise.all([
        tx.user.findMany({ where: { tenantId, isDeleted: false }, orderBy: { displayName: 'asc' } }),
        tx.role.findMany({ where: { tenantId, isDeleted: false }, orderBy: { code: 'asc' } }),
        tx.userBranchRole.findMany({ where: { tenantId }, include: { role: true } }),
      ]);
      return {
        roles: roles.map((role) => ({ code: role.code, nameAr: role.nameAr, nameEn: role.nameEn })),
        users: users.map((user) => ({
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
          isActive: user.isActive,
          roles: links.filter((link) => link.userId === user.id).map((link) => link.role.code),
          branches: links.filter((link) => link.userId === user.id).map((link) => link.branchId),
        })),
      };
    });
  }

  async createUser(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    input: { displayName: string; email: string; phone: string; password: string; roleCode: string; branchId?: string },
  ) {
    const passwordHash = await this.passwords.hash(input.password);
    const phone = input.phone.trim();
    const email = input.email.trim();
    return this.prisma.withTenant(tenantId, async (tx) => {
      const branchId = input.branchId
        ? (await this.access(tx, tenantId, actorId, input.branchId, input.branchId, true)).writeBranchId
        : (await this.access(tx, tenantId, actorId, branchHint, null, true)).writeBranchId;
      const role = await tx.role.findFirst({ where: { tenantId, code: input.roleCode, isDeleted: false } });
      if (!role) throw new DomainError('VALIDATION_ERROR', 400);
      const samePhone = await tx.user.findFirst({ where: { tenantId, phone, isDeleted: false } });
      if (samePhone) throw new DomainError('VALIDATION_ERROR', 409, { fields: { phone: 'taken' } });
      if (email) {
        const sameEmail = await tx.user.findFirst({ where: { tenantId, email, isDeleted: false } });
        if (sameEmail) throw new DomainError('VALIDATION_ERROR', 409, { fields: { email: 'taken' } });
      }
      const userId = randomUUID();
      await tx.user.create({
        data: {
          id: userId,
          tenantId,
          email: email || null,
          phone,
          passwordHash,
          displayName: input.displayName,
          isActive: true,
        },
      });
      await tx.userBranchRole.create({
        data: { tenantId, userId, branchId, roleId: role.id },
      });
      return { id: userId };
    });
  }

  setUserActive(tenantId: string, actorId: string, userId: string, isActive: boolean) {
    if (actorId === userId && !isActive) throw new DomainError('VALIDATION_ERROR', 400);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, tenantId, isDeleted: false } });
      if (!user) throw new DomainError('NOT_FOUND', 404);
      await tx.user.update({ where: { id: user.id }, data: { isActive } });
      return { ok: true };
    });
  }

  settings(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const defaults = [
        { key: 'shelfLifeMonths', valueAr: '36', valueEn: '36' },
        { key: 'expiryWarnMonths', valueAr: '6', valueEn: '6' },
        { key: 'receiptWidth', valueAr: '58', valueEn: '58' },
        { key: 'receiptFooter', valueAr: 'شكراً لزيارتكم', valueEn: 'Thank you' },
        { key: 'receiptShowPhone', valueAr: '1', valueEn: '1' },
        ...defaultAlertSettings().map((item) => ({ key: item.key, valueAr: item.value, valueEn: item.value })),
      ];
      const version = await tx.pharmacySetting.findFirst({ where: { tenantId, key: 'alertStandardsVersion' } });
      for (const item of defaults) {
        const found = await tx.pharmacySetting.findFirst({ where: { tenantId, key: item.key } });
        if (!found) {
          await tx.pharmacySetting.create({ data: { tenantId, ...item } });
          continue;
        }
        const previous = PREVIOUS_ALERT_DEFAULTS[item.key];
        if (!version && previous && found.valueEn === previous && found.valueEn !== item.valueEn) {
          await tx.pharmacySetting.update({ where: { id: found.id }, data: { valueAr: item.valueAr, valueEn: item.valueEn } });
        }
      }
      if (!version) {
        await tx.pharmacySetting.create({
          data: { tenantId, key: 'alertStandardsVersion', valueAr: ALERT_STANDARD_VERSION, valueEn: ALERT_STANDARD_VERSION },
        });
      }
      const [rows, tenant] = await Promise.all([
        tx.pharmacySetting.findMany({ where: { tenantId }, orderBy: { key: 'asc' } }),
        tx.tenant.findFirst({ where: { id: tenantId } }),
      ]);
      return {
        pharmacyAr: tenant?.tradeNameAr ?? '',
        pharmacyEn: tenant?.tradeNameEn ?? '',
        settings: rows.map((row) => ({ key: row.key, valueAr: row.valueAr, valueEn: row.valueEn })),
      };
    });
  }

  saveSetting(tenantId: string, userId: string, input: { key: string; valueAr: string; valueEn: string }) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (input.key.startsWith('alert')) {
        const links = await tx.userBranchRole.findMany({ where: { tenantId, userId }, include: { role: true } });
        const perms = links.flatMap((link) => {
          const code = link.role.code as RoleCode;
          return code in ROLE_PERMISSIONS ? [...ROLE_PERMISSIONS[code]] : [];
        });
        if (!canConfigureAlerts(perms)) throw new DomainError('UNAUTHORIZED', 403);
        try {
          assertAlertSetting(input.key, input.valueEn);
        } catch {
          throw new DomainError('VALIDATION_ERROR', 400);
        }
      }
      const current = await tx.pharmacySetting.findFirst({ where: { tenantId, key: input.key } });
      if (!current && input.key.startsWith('alert')) {
        await tx.pharmacySetting.create({ data: { tenantId, key: input.key, valueAr: input.valueAr, valueEn: input.valueEn } });
        return { ok: true };
      }
      if (!current) throw new DomainError('NOT_FOUND', 404);
      await tx.pharmacySetting.update({
        where: { id: current.id },
        data: { valueAr: input.valueAr, valueEn: input.valueEn },
      });
      return { ok: true };
    });
  }

  scopeFor(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, (tx) => this.access(tx, tenantId, userId, jwtBranch, header, false));
  }

  reports(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const start = khartoumDayStart();
      const branch = scope.readBranchId ? { branchId: scope.readBranchId } : {};
      const stocking = await this.stockingSummary(tx, tenantId, scope.readBranchId);
      const [products, lots, sales, purchases, expenses, suppliers, customers] = await Promise.all([
        tx.product.findMany({ where: { tenantId, isDeleted: false } }),
        tx.stockLot.findMany({ where: { tenantId, ...branch } }),
        tx.sale.findMany({ where: { tenantId, status: 'POSTED', ...branch } }),
        tx.purchaseOrder.findMany({
          where: { tenantId, ...branch },
          orderBy: { orderedAt: 'desc' },
          take: 8,
          include: { supplier: true },
        }),
        tx.expense.findMany({ where: { tenantId, ...branch } }),
        tx.supplier.findMany({ where: { tenantId, isDeleted: false }, orderBy: { balance: 'desc' } }),
        tx.customer.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
      ]);
      const saleIds = sales.map((sale) => sale.id);
      const lines =
        saleIds.length === 0
          ? []
          : await tx.saleLine.findMany({ where: { tenantId, saleId: { in: saleIds } } });
      const todaySales = sales.filter((sale) => sale.soldAt >= start);
      const views = await this.withPrices(
        tx,
        tenantId,
        scope.readBranchId,
        (await this.paintProducts(tx, products)).map((product) => this.viewProduct(product, lots)),
      );
      let salesToday = '0.00';
      for (const sale of todaySales) salesToday = addMoney(salesToday, cash(sale.total));
      let stockValue = '0.00';
      let gross = '0.00';
      let cogs = '0.00';
      for (const view of views) stockValue = addMoney(stockValue, mulMoney(view.costPrice, String(view.qty)));
      for (const line of lines) {
        gross = addMoney(gross, cash(line.lineTotal));
        cogs = addMoney(cogs, cash(line.costTotal));
      }
      let expenseTotal = '0.00';
      for (const expense of expenses) expenseTotal = addMoney(expenseTotal, cash(expense.amount));
      const today = khartoumDate();
      const horizon = new Date(`${today}T00:00:00+02:00`);
      horizon.setUTCDate(horizon.getUTCDate() + 30);
      const sold = new Map<string, { nameAr: string; nameEn: string; qty: number; total: string }>();
      for (const line of lines) {
        const current = sold.get(line.productId) ?? {
          nameAr: line.nameAr,
          nameEn: line.nameEn,
          qty: 0,
          total: '0.00',
        };
        current.qty += line.qty;
        current.total = addMoney(current.total, cash(line.lineTotal));
        sold.set(line.productId, current);
      }
      const packByProduct = await this.itemPacks(tx, tenantId, views.map((view) => view.id));
      const top = [...sold.values()].sort((left, right) => right.qty - left.qty).slice(0, 3);
      return {
        salesToday,
        salesCount: todaySales.length,
        stockValue,
        grossProfit: subMoney(gross, cogs),
        expenseTotal,
        lowStock: views.filter((view) => view.qty <= view.reorderLevel),
        expiring: views.filter((view) => view.nearestExpiry !== null && new Date(view.nearestExpiry) <= horizon && view.qty > 0),
        purchases: purchases.map((order) => ({
          docNo: order.docNo,
          total: cash(order.total),
          supplierAr: order.supplier.nameAr,
          supplierEn: order.supplier.nameEn,
          orderedAt: order.orderedAt.toISOString(),
          status: order.status,
        })),
        home: buildHome({
          today: khartoumDate(),
          branches: scope.branches.filter((row) => scope.readBranchId === null || row.id === scope.readBranchId),
          sales: sales.map((sale) => ({
            branchId: sale.branchId,
            soldAt: sale.soldAt.toISOString(),
            total: cash(sale.total),
            docNo: sale.docNo,
            customerName: sale.customerName,
            paymentMethod: sale.paymentMethod,
            status: sale.status,
          })),
          purchases: purchases.map((order) => ({
            orderedAt: order.orderedAt.toISOString(),
            total: cash(order.total),
            docNo: order.docNo,
            status: order.status,
            supplierAr: order.supplier.nameAr,
            supplierEn: order.supplier.nameEn,
          })),
          expenses: expenses.map((expense) => ({ spentAt: expense.spentAt.toISOString(), amount: cash(expense.amount) })),
          suppliers: suppliers.map((row) => ({ balance: cash(row.balance) })),
          customers: customers.map((row) => ({ nameAr: row.nameAr, nameEn: row.nameEn, balance: cash(row.balance) })),
          lots: lots.map((lot) => ({
            branchId: lot.branchId,
            productId: lot.productId,
            batchNo: lot.batchNo,
            expiry: lot.expiry.toISOString(),
            qtyBase: lot.qtyBase,
          })),
          products: views.map((view) => ({
            id: view.id,
            nameAr: view.nameAr,
            nameEn: view.nameEn,
            genericName: view.genericName,
            sku: view.sku,
            form: view.form,
            sellPrice: view.sellPrice,
            qty: view.qty,
            reorderLevel: view.reorderLevel,
            pack: packByProduct.get(view.id) ?? null,
          })),
          stocking,
        }),
        stocking,
        suppliers: suppliers.map((row) => ({
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          balance: cash(row.balance),
        })),
        top,
        scope: {
          management: scope.management,
          all: scope.readBranchId === null,
          branchLimit: scope.branchLimit,
          branchCount: scope.branches.length,
        },
      };
    });
  }

  reportTable(
    tenantId: string,
    userId: string,
    jwtBranch: string | null,
    header: string | null,
    kind: string,
    from: string | null,
    to: string | null,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const links = await tx.userBranchRole.findMany({ where: { tenantId, userId }, include: { role: true } });
      const roleCode = links[0]?.role.code;
      const perms = roleCode && roleCode in ROLE_PERMISSIONS ? ROLE_PERMISSIONS[roleCode as RoleCode] : [];
      if (!perms.includes('reports.view')) throw new DomainError('UNAUTHORIZED', 403);
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const branch = scope.readBranchId ? { branchId: scope.readBranchId } : {};
      const start = from ? new Date(`${from}T00:00:00+02:00`) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const end = to ? new Date(`${to}T23:59:59+02:00`) : new Date();
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
      const columns: { key: string; labelAr: string; labelEn: string; kind: 'text' | 'money' | 'number' | 'date' }[] = [];
      const rows: Record<string, string | number>[] = [];
      const push = (row: Record<string, string | number>) => rows.push(row);

      if (kind === 'sales' || kind === 'payments') {
        columns.push(
          { key: 'docNo', labelAr: 'الفاتورة', labelEn: 'Invoice', kind: 'text' },
          { key: 'soldAt', labelAr: 'التاريخ', labelEn: 'Date', kind: 'date' },
          { key: 'customer', labelAr: 'العميل', labelEn: 'Customer', kind: 'text' },
          { key: 'items', labelAr: 'الأصناف', labelEn: 'Items', kind: 'text' },
          { key: 'qty', labelAr: 'الكمية', labelEn: 'Qty', kind: 'number' },
          { key: 'method', labelAr: 'الدفع', labelEn: 'Payment', kind: 'text' },
          { key: 'total', labelAr: 'الإجمالي', labelEn: 'Total', kind: 'money' },
          { key: 'status', labelAr: 'الحالة', labelEn: 'Status', kind: 'text' },
        );
        const sales = await tx.sale.findMany({
          where: { tenantId, ...branch, soldAt: { gte: start, lte: end } },
          orderBy: { soldAt: 'desc' },
          include: { lines: true },
        });
        for (const sale of sales) {
          push({
            docNo: sale.docNo,
            soldAt: sale.soldAt.toISOString().slice(0, 10),
            customer: sale.customerName,
            items: sale.lines.map((line) => `${line.nameAr} × ${line.qty}`).join(' · '),
            qty: sale.lines.reduce((sum, line) => sum + line.qty, 0),
            method: sale.paymentMethod,
            total: cash(sale.total),
            status: sale.status,
          });
        }
      } else if (kind === 'sales-items') {
        columns.push(
          { key: 'name', labelAr: 'الصنف', labelEn: 'Item', kind: 'text' },
          { key: 'qty', labelAr: 'الكمية', labelEn: 'Qty', kind: 'number' },
          { key: 'total', labelAr: 'الإجمالي', labelEn: 'Total', kind: 'money' },
        );
        const sales = await tx.sale.findMany({
          where: { tenantId, status: 'POSTED', ...branch, soldAt: { gte: start, lte: end } },
          select: { id: true },
        });
        const lines = sales.length
          ? await tx.saleLine.findMany({ where: { tenantId, saleId: { in: sales.map((sale) => sale.id) } } })
          : [];
        const grouped = new Map<string, { name: string; qty: number; total: string }>();
        for (const line of lines) {
          const current = grouped.get(line.productId) ?? { name: line.nameAr, qty: 0, total: '0.00' };
          current.qty += line.qty;
          current.total = addMoney(current.total, cash(line.lineTotal));
          grouped.set(line.productId, current);
        }
        for (const row of grouped.values()) push({ name: row.name, qty: row.qty, total: row.total });
      } else if (kind === 'stock' || kind === 'low-stock' || kind === 'expiry' || kind === 'valuation') {
        columns.push(
          { key: 'sku', labelAr: 'الرمز', labelEn: 'SKU', kind: 'text' },
          { key: 'name', labelAr: 'الصنف', labelEn: 'Item', kind: 'text' },
          { key: 'qty', labelAr: 'الكمية', labelEn: 'Qty', kind: 'number' },
          { key: 'cost', labelAr: 'التكلفة', labelEn: 'Cost', kind: 'money' },
          { key: 'value', labelAr: 'القيمة', labelEn: 'Value', kind: 'money' },
          { key: 'expiry', labelAr: 'الصلاحية', labelEn: 'Expiry', kind: 'date' },
        );
        const products = await tx.product.findMany({ where: { tenantId, isDeleted: false } });
        const lots = await tx.stockLot.findMany({ where: { tenantId, ...branch } });
        const today = khartoumDate();
        const horizon = new Date(`${today}T00:00:00+02:00`);
        horizon.setUTCDate(horizon.getUTCDate() + 90);
        for (const product of products) {
          const mine = lots.filter(
            (lot) => lot.productId === product.id && (lot.condition || 'AVAILABLE') === 'AVAILABLE' && lot.qtyBase > 0,
          );
          const qty = mine.reduce((sum, lot) => sum + lot.qtyBase, 0);
          const nearest = mine.sort((a, b) => a.expiry.getTime() - b.expiry.getTime())[0];
          const expired = nearest ? nearest.expiry.toISOString().slice(0, 10) < today : false;
          const near = nearest ? nearest.expiry <= horizon : false;
          if (kind === 'low-stock' && qty > product.reorderLevel) continue;
          if (kind === 'expiry' && !near) continue;
          if (kind === 'stock' && expired) continue;
          push({
            sku: product.sku,
            name: product.nameAr,
            qty,
            cost: cash(product.costPrice),
            value: mulMoney(cash(product.costPrice), String(qty)),
            expiry: nearest ? nearest.expiry.toISOString().slice(0, 10) : '',
          });
        }
      } else if (kind === 'purchases') {
        columns.push(
          { key: 'docNo', labelAr: 'الأمر', labelEn: 'Order', kind: 'text' },
          { key: 'supplier', labelAr: 'المورد', labelEn: 'Supplier', kind: 'text' },
          { key: 'item', labelAr: 'الصنف', labelEn: 'Item', kind: 'text' },
          { key: 'qty', labelAr: 'الكمية', labelEn: 'Qty', kind: 'number' },
          { key: 'total', labelAr: 'الإجمالي', labelEn: 'Total', kind: 'money' },
          { key: 'status', labelAr: 'الحالة', labelEn: 'Status', kind: 'text' },
          { key: 'date', labelAr: 'التاريخ', labelEn: 'Date', kind: 'date' },
        );
        const orders = await tx.purchaseOrder.findMany({
          where: { tenantId, ...branch, orderedAt: { gte: start, lte: end } },
          include: { supplier: true, lines: { include: { product: true } } },
          orderBy: { orderedAt: 'desc' },
        });
        for (const order of orders) {
          const shared = {
            docNo: order.docNo,
            supplier: order.supplier.nameAr,
            status: order.status,
            date: order.orderedAt.toISOString().slice(0, 10),
          };
          if (order.lines.length === 0) {
            push({ ...shared, item: '', qty: 0, total: cash(order.total) });
            continue;
          }
          for (const line of order.lines) {
            push({ ...shared, item: line.product.nameAr, qty: line.qty, total: cash(line.lineTotal) });
          }
        }
      } else if (kind === 'receipts') {
        columns.push(
          { key: 'docNo', labelAr: 'الاستلام', labelEn: 'Receipt', kind: 'text' },
          { key: 'date', labelAr: 'التاريخ', labelEn: 'Date', kind: 'date' },
          { key: 'supplier', labelAr: 'المورد', labelEn: 'Supplier', kind: 'text' },
          { key: 'item', labelAr: 'الصنف', labelEn: 'Item', kind: 'text' },
          { key: 'qty', labelAr: 'الكمية', labelEn: 'Qty', kind: 'number' },
          { key: 'status', labelAr: 'الحالة', labelEn: 'Status', kind: 'text' },
        );
        const receipts = await tx.goodsReceipt.findMany({
          where: { tenantId, ...branch, receivedAt: { gte: start, lte: end } },
          include: { supplier: true, lines: { include: { product: true } } },
          orderBy: { receivedAt: 'desc' },
        });
        for (const receipt of receipts) {
          const shared = {
            docNo: receipt.docNo,
            date: receipt.receivedAt.toISOString().slice(0, 10),
            supplier: receipt.supplier?.nameAr ?? '',
            status: receipt.status,
          };
          if (receipt.lines.length === 0) {
            push({ ...shared, item: '', qty: 0 });
            continue;
          }
          for (const line of receipt.lines) {
            push({ ...shared, item: line.product.nameAr, qty: line.qty + line.bonusQty });
          }
        }
      } else if (kind === 'customers' || kind === 'suppliers') {
        columns.push(
          { key: 'name', labelAr: 'الاسم', labelEn: 'Name', kind: 'text' },
          { key: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', kind: 'text' },
          { key: 'balance', labelAr: 'الرصيد', labelEn: 'Balance', kind: 'money' },
        );
        if (kind === 'customers') {
          const people = await tx.customer.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } });
          for (const person of people) push({ name: person.nameAr, phone: person.phone ?? '', balance: cash(person.balance) });
        } else {
          const people = await tx.supplier.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } });
          for (const person of people) push({ name: person.nameAr, phone: person.phone ?? '', balance: cash(person.balance) });
        }
      } else if (kind === 'profit') {
        columns.push(
          { key: 'name', labelAr: 'الصنف', labelEn: 'Item', kind: 'text' },
          { key: 'sales', labelAr: 'المبيعات', labelEn: 'Sales', kind: 'money' },
          { key: 'cost', labelAr: 'التكلفة', labelEn: 'Cost', kind: 'money' },
          { key: 'margin', labelAr: 'الهامش', labelEn: 'Margin', kind: 'money' },
        );
        const sales = await tx.sale.findMany({
          where: { tenantId, status: 'POSTED', ...branch, soldAt: { gte: start, lte: end } },
          select: { id: true },
        });
        const lines = sales.length
          ? await tx.saleLine.findMany({ where: { tenantId, saleId: { in: sales.map((sale) => sale.id) } } })
          : [];
        const grouped = new Map<string, { name: string; sales: string; cost: string }>();
        for (const line of lines) {
          const current = grouped.get(line.productId) ?? { name: line.nameAr, sales: '0.00', cost: '0.00' };
          current.sales = addMoney(current.sales, cash(line.lineTotal));
          current.cost = addMoney(current.cost, cash(line.costTotal));
          grouped.set(line.productId, current);
        }
        for (const row of grouped.values()) {
          push({ name: row.name, sales: row.sales, cost: row.cost, margin: subMoney(row.sales, row.cost) });
        }
      } else if (kind === 'movements') {
        columns.push(
          { key: 'type', labelAr: 'الحركة', labelEn: 'Movement', kind: 'text' },
          { key: 'qty', labelAr: 'الكمية', labelEn: 'Qty', kind: 'number' },
          { key: 'note', labelAr: 'ملاحظة', labelEn: 'Note', kind: 'text' },
          { key: 'at', labelAr: 'التاريخ', labelEn: 'Date', kind: 'date' },
        );
        const moves = await tx.stockMovement.findMany({
          where: { tenantId, ...branch, createdAt: { gte: start, lte: end } },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        for (const move of moves) {
          push({ type: move.type, qty: move.qtyBase, note: move.note, at: move.createdAt.toISOString().slice(0, 10) });
        }
      } else if (kind === 'prices') {
        columns.push(
          { key: 'list', labelAr: 'القائمة', labelEn: 'List', kind: 'text' },
          { key: 'amount', labelAr: 'السعر', labelEn: 'Amount', kind: 'money' },
          { key: 'at', labelAr: 'التاريخ', labelEn: 'Date', kind: 'date' },
        );
        const history = await tx.priceHistory.findMany({
          where: { tenantId, createdAt: { gte: start, lte: end } },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        for (const row of history) {
          push({ list: row.priceListId, amount: cash(row.newAmount), at: row.createdAt.toISOString().slice(0, 10) });
        }
      } else {
        throw new DomainError('VALIDATION_ERROR', 400);
      }

      let total = '0.00';
      const moneyKey = columns.find((column) => column.kind === 'money' && ['total', 'value', 'balance', 'margin', 'sales'].includes(column.key))?.key;
      if (moneyKey) {
        for (const row of rows) total = addMoney(total, String(row[moneyKey] ?? '0'));
      } else if (columns.some((column) => column.key === 'qty')) {
        let qty = 0;
        for (const row of rows) qty += Number(row.qty ?? 0);
        total = String(qty);
      }
      return {
        kind,
        titleAr: tenant?.tradeNameAr ?? 'دواء',
        titleEn: tenant?.tradeNameEn ?? 'Dawaa',
        phone: tenant?.phone ?? '',
        accountCode: tenant?.accountCode ?? '',
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
        generatedAt: new Date().toISOString(),
        columns,
        rows,
        total,
        rowCount: rows.length,
        illustrative: true,
      };
    });
  }

  private async paintProducts<T extends { globalItemId?: string | null; nameAr: string; nameEn: string; genericName: string; form: string; strength: string }>(
    tx: Tx,
    products: T[],
  ): Promise<T[]> {
    const ids = [...new Set(products.map((product) => product.globalItemId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return products;
    const rows = await tx.globalCatalogItem.findMany({
      where: { id: { in: ids }, status: { in: ['active', 'PUBLISHED'] } },
      select: { id: true, nameAr: true, nameEn: true, genericName: true, dosageForm: true, strength: true, brandNameAr: true, brandNameEn: true },
    });
    const labels = new Map(rows.map((row) => [row.id, row]));
    return products.map((product) => {
      const label = product.globalItemId ? labels.get(product.globalItemId) : undefined;
      if (!label) return product;
      return {
        ...product,
        nameAr: plainMedicineName(label.brandNameAr || label.nameAr),
        nameEn: plainMedicineName(label.brandNameEn || label.nameEn),
        genericName: plainMedicineName(label.genericName),
        form: label.dosageForm || product.form,
        strength: label.strength || product.strength,
      };
    });
  }

  private viewProduct(
    product: {
      id: string;
      sku: string;
      categoryId: string;
      nameAr: string;
      nameEn: string;
      genericName: string;
      form: string;
      strength: string;
      reorderLevel: number;
      sellPrice: MoneyRow;
      costPrice: MoneyRow;
      costUsd: MoneyRow | null;
      isLocal: boolean;
      trackSerial: boolean;
      gtin: string | null;
    },
    lots: { productId: string; qtyBase: number; expiry: Date; location: string; condition?: string | null }[],
  ): ProductView {
    const today = khartoumDate();
    const mine = lots.filter((lot) =>
      lot.productId === product.id &&
      isSellableLot({ qtyBase: lot.qtyBase, expiry: lot.expiry.toISOString(), condition: lot.condition }, today),
    );
    const qty = mine.reduce((sum, lot) => sum + lot.qtyBase, 0);
    const withQty = [...mine].sort((left, right) => left.expiry.getTime() - right.expiry.getTime());
    return {
      id: product.id,
      sku: product.sku,
      categoryId: product.categoryId,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      genericName: product.genericName,
      form: product.form,
      strength: product.strength,
      reorderLevel: product.reorderLevel,
      sellPrice: cash(product.sellPrice),
      costPrice: cash(product.costPrice),
      costUsd: product.costUsd ? cash(product.costUsd) : '',
      isLocal: product.isLocal,
      trackSerial: product.trackSerial,
      gtin: product.gtin ?? '',
      qty,
      nearestExpiry: withQty[0]?.expiry.toISOString() ?? null,
      location: withQty[0]?.location ?? '',
    };
  }

  async catalog(tenantId: string, query: string | null) {
    const needle = (query ?? '').trim();
    const found = await searchPublishedLibrary(this.prisma.client, needle, 1, 48);
    const rows: LibraryHit[] = [...found.rows];
    if (needle && rows.length < 8) {
      const legacy = await this.prisma.client.standardMedicine.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [
            { code: { startsWith: needle } },
            { nameAr: { startsWith: needle } },
            { nameEn: { startsWith: needle } },
            { genericName: { startsWith: needle } },
            { gtin: { startsWith: needle } },
          ],
        },
        take: 24,
      });
      const seen = new Set(rows.map((row) => row.code));
      for (const item of legacy) {
        if (seen.has(item.code)) continue;
        rows.push({
          id: '',
          code: item.code,
          itemType: 'Medicine',
          nameAr: plainMedicineName(item.nameAr),
          nameEn: plainMedicineName(item.nameEn),
          genericName: plainMedicineName(item.genericName),
          brandNameAr: '',
          brandNameEn: '',
          form: item.form,
          strength: item.strength,
          categoryAr: item.categoryAr,
          categoryEn: item.categoryEn,
          manufacturer: item.manufacturer,
          gtin: item.gtin,
          unitsJson: item.unitsJson,
          packDescription: item.packDescription,
          route: item.route,
          ingredients: item.ingredients,
          status: item.status,
          isControlled: item.isControlled,
          requiresPrescription: item.requiresPrescription,
          trackSerial: item.trackSerial,
          storageCondition: '',
          modelNumber: '',
          aliases: [item.genericName, item.nameAr, item.nameEn],
          versionNo: 1,
        });
      }
    }
    if (rows.length === 0) return [];
    const codes = rows.map((item) => item.code);
    const ids = rows.map((item) => item.id).filter(Boolean);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const products = await tx.product.findMany({
        where: {
          tenantId,
          isDeleted: false,
          OR: [
            { sku: { in: codes } },
            { masterCode: { in: codes } },
            ...(ids.length > 0 ? [{ globalItemId: { in: ids } }] : []),
          ],
        },
        select: { sku: true, masterCode: true, gtin: true, globalItemId: true },
      });
      const imported = new Set(products.flatMap((product) => [product.sku, product.masterCode ?? '', product.gtin ?? '']));
      const linked = new Set(products.map((product) => product.globalItemId).filter((id): id is string => Boolean(id)));
      return rows.map((item) => ({
        ...item,
        imported: linked.has(item.id) || imported.has(item.code) || (item.gtin !== '' && imported.has(item.gtin)),
      }));
    });
  }

  async dosageForms() {
    const rows = await this.prisma.client.dosageForm.findMany({ orderBy: { nameEn: 'asc' } });
    return rows.map((row) => ({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn }));
  }

  async importMedicines(tenantId: string, actorId: string, codes: string[]) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      return { created: await ensureProducts(tx, tenantId, actorId, codes) };
    });
  }

  prices(tenantId: string, userId: string, jwtBranch: string | null, header: string | null, listId: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const [lists, activations, products, usedRows] = await Promise.all([
        tx.priceList.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
        tx.branchPriceActivation.findMany({ where: { tenantId }, include: { branch: true } }),
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.saleLine.findMany({
          where: { tenantId, priceListId: { not: null }, sale: { status: 'POSTED' } },
          select: { priceListId: true },
        }),
      ]);
      const usedIds = new Set(usedRows.map((row) => row.priceListId).filter((id): id is string => id !== null));
      const listById = new Map(lists.map((list) => [list.id, list]));
      await this.reconcileDuplicateActivePriceLists(tx, tenantId);
      const listRows = lists.map((list) => ({
        id: list.id,
        scope: list.scope,
        status: list.status,
        isActive: list.isActive,
        activatedAt: list.activatedAt?.toISOString() ?? null,
        createdAt: list.createdAt.toISOString(),
      }));
      const branchLinks = activations.map((row) => ({
        branchId: row.branchId,
        priceListId: row.priceListId,
        isActive: row.isActive,
        activatedAt: listById.get(row.priceListId)?.activatedAt?.toISOString() ?? null,
      }));
      const sellingListIdResolved = resolveSellingPriceListId({
        branchId: scope.readBranchId,
        lists: listRows,
        branchLinks,
      });
      const branchActivation =
        scope.readBranchId && sellingListIdResolved
          ? activations.find((row) => row.branchId === scope.readBranchId && row.isActive && row.priceListId === sellingListIdResolved) ??
            null
          : null;
      const selectedId = listId ?? sellingListIdResolved ?? lists[0]?.id ?? null;
      const amounts =
        selectedId === null
          ? []
          : await tx.productPrice.findMany({ where: { tenantId, priceListId: selectedId } });
      const amountByProduct = new Map(amounts.map((row) => [row.productId, cash(row.amount)]));
      const sellingListId = sellingListIdResolved;
      const sellingRows =
        sellingListId === null || sellingListId === selectedId
          ? amounts
          : await tx.productPrice.findMany({ where: { tenantId, priceListId: sellingListId } });
      const sellingByProduct = new Map(sellingRows.map((row) => [row.productId, cash(row.amount)]));
      const stockLots = await tx.stockLot.groupBy({
        by: ['productId'],
        where: {
          tenantId,
          qtyBase: { gt: 0 },
          condition: 'AVAILABLE',
          ...(scope.readBranchId ? { branchId: scope.readBranchId } : {}),
        },
        _sum: { qtyBase: true },
      });
      const qtyByProduct = new Map(stockLots.map((row) => [row.productId, row._sum.qtyBase ?? 0]));
        const named = await this.paintProducts(tx, products);
        const sellingList = sellingListId ? listById.get(sellingListId) ?? null : null;
        return {
        using: branchActivation ? 'BRANCH' : 'PHARMACY',
        branchId: scope.readBranchId,
        sellingOn: sellingList ? khartoumDate(sellingList.effectiveFrom ?? sellingList.activatedAt ?? sellingList.createdAt) : null,
        sellingId: sellingList?.id ?? null,
        selectedId,
        lists: lists.map((list) => {
          const link = activations.find((row) => row.priceListId === list.id);
          const branchSelected = scope.readBranchId !== null;
          const canActivateHere =
            list.scope === 'PHARMACY'
              ? branchSelected
              : Boolean(branchSelected && link && link.branchId === scope.readBranchId);
          const isSelling = list.id === sellingListId;
          const workflow = priceListWorkflow({
            status: list.status,
            usedOnSales: usedIds.has(list.id),
            canManage: scope.canViewAll,
            canActivateHere,
            isSelling,
          });
          const source = list.sourcePriceListId ? listById.get(list.sourcePriceListId) : undefined;
          return {
            id: list.id,
            nameAr: list.nameAr,
            nameEn: list.nameEn,
            scope: list.scope,
            isActive: list.scope === 'PHARMACY' ? list.isActive : Boolean(link?.isActive),
            status: list.status,
            versionNo: list.versionNo,
            listType: list.listType,
            code: list.code,
            effectiveFrom: list.effectiveFrom?.toISOString() ?? null,
            locked: !workflow.allowedActions.includes('edit'),
            allowedActions: workflow.allowedActions,
            lockReason: workflow.lockReason,
            copied: Boolean(list.sourcePriceListId),
            sourceNameAr: source?.nameAr ?? null,
            sourceNameEn: source?.nameEn ?? null,
            branchId: link?.branchId ?? null,
            branchAr: link?.branch.nameAr ?? null,
            branchEn: link?.branch.nameEn ?? null,
          };
        }),
        items: named.map((product) => {
          const selling = sellingByProduct.get(product.id);
          const sell = cash(product.sellPrice);
          const listed = selling && selling !== '0.00' ? selling : sell !== '0.00' ? sell : '';
          return {
            productId: product.id,
            sku: product.sku,
            nameAr: product.nameAr,
            nameEn: product.nameEn,
            genericName: product.genericName,
            gtin: product.gtin ?? '',
            cost: cash(product.costPrice),
            costUsd: product.costUsd ? cash(product.costUsd) : '',
            amount: amountByProduct.get(product.id) ?? '',
            qty: qtyByProduct.get(product.id) ?? 0,
            listedPrice: listed,
          };
        }),
      };
    });
  }

  async createPriceList(
    tenantId: string,
    actorId: string,
    jwtBranch: string | null,
    header: string | null,
    input: {
      nameAr: string;
      nameEn: string;
      scope: 'PHARMACY' | 'BRANCH';
      effectiveFrom: string;
      items?: { code: string; amount: string }[];
    },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, jwtBranch, header, input.scope === 'BRANCH');
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      this.guardPriceDate(input.effectiveFrom);
      const id = randomUUID();
      await tx.priceList.create({
        data: {
          id,
          tenantId,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          scope: input.scope,
          isActive: false,
          effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00+02:00`),
          createdBy: actorId,
        },
      });
      if (input.scope === 'BRANCH') {
        await tx.branchPriceActivation.create({
          data: {
            tenantId,
            branchId: scope.writeBranchId,
            priceListId: id,
            isActive: false,
            createdBy: actorId,
          },
        });
      }
      const items = input.items ?? [];
      if (items.length > 0) {
        await writeCodedPrices(tx, tenantId, actorId, id, items);
      }
      return { id, saved: items.length };
    });
  }

  async linkPriceBranch(tenantId: string, actorId: string, input: { priceListId: string; branchId: string }) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const list = await tx.priceList.findFirst({ where: { id: input.priceListId, tenantId } });
      const branch = scope.branches.find((row) => row.id === input.branchId);
      if (!list || list.status !== 'DRAFT' || !branch) throw new DomainError('VALIDATION_ERROR', 400);
      await tx.priceList.update({
        where: { id: list.id },
        data: { scope: 'BRANCH', isActive: false, updatedBy: actorId },
      });
      const link = await tx.branchPriceActivation.findFirst({ where: { tenantId, priceListId: list.id } });
      if (link) {
        await tx.branchPriceActivation.update({
          where: { id: link.id },
          data: { branchId: branch.id, isActive: false },
        });
      } else {
        await tx.branchPriceActivation.create({
          data: { tenantId, branchId: branch.id, priceListId: list.id, isActive: false, createdBy: actorId },
        });
      }
      await this.audit(tx, {
        tenantId,
        actorId,
        branchId: branch.id,
        action: 'price.link',
        entityType: 'PriceList',
        entityId: list.id,
        newJson: JSON.stringify({ branchId: branch.id }),
      });
      return { branchId: branch.id };
    });
  }

  async savePriceLines(
    tenantId: string,
    actorId: string,
    input: { priceListId: string; items: { productId?: string; code?: string; amount: string }[] },
  ) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const scope = await this.access(tx, tenantId, actorId, null, null, false);
        if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
        const list = await tx.priceList.findFirst({ where: { id: input.priceListId, tenantId } });
        if (!list) throw new DomainError('NOT_FOUND', 404);
        if (list.status !== 'DRAFT') throw new DomainError('VALIDATION_ERROR', 400);
        const coded = input.items.filter((row): row is { code: string; amount: string } => Boolean(row.code));
        const byId = input.items.filter((row): row is { productId: string; amount: string } => Boolean(row.productId));
        if (coded.length > 0) await writeCodedPrices(tx, tenantId, actorId, list.id, coded);
        if (byId.length > 0) await writePrices(tx, tenantId, actorId, list.id, byId);
        await this.audit(tx, {
          tenantId,
          actorId,
          action: 'price.change',
          entityType: 'PriceList',
          entityId: list.id,
          newJson: JSON.stringify({ saved: input.items.length }),
        });
        return { ok: true, saved: input.items.length };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async setPrice(tenantId: string, actorId: string, input: { priceListId: string; productId: string; amount: string }) {
    try {
      const amount = money(input.amount);
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const scope = await this.access(tx, tenantId, actorId, null, null, false);
        if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
        const list = await tx.priceList.findFirst({ where: { id: input.priceListId, tenantId } });
        const product = await tx.product.findFirst({ where: { id: input.productId, tenantId, isDeleted: false } });
        if (!list || !product) throw new DomainError('NOT_FOUND', 404);
        if (list.status !== 'DRAFT') throw new DomainError('VALIDATION_ERROR', 400);
        const current = await tx.productPrice.findFirst({
          where: { tenantId, priceListId: list.id, productId: product.id },
        });
        const oldAmount = current ? cash(current.amount) : '0.00';
        if (current) {
          await tx.productPrice.update({ where: { id: current.id }, data: { amount, isManualOverride: true } });
        } else {
          await tx.productPrice.create({
            data: { tenantId, priceListId: list.id, productId: product.id, amount, isManualOverride: true, createdBy: actorId },
          });
        }
        await tx.priceHistory.create({
          data: { tenantId, priceListId: list.id, productId: product.id, oldAmount, newAmount: amount, createdBy: actorId },
        });
        await this.audit(tx, {
          tenantId,
          actorId,
          action: 'price.change',
          entityType: 'PriceList',
          entityId: list.id,
          oldJson: JSON.stringify({ productId: product.id, amount: oldAmount }),
          newJson: JSON.stringify({ productId: product.id, amount }),
        });
        return { ok: true };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async activatePriceList(
    tenantId: string,
    actorId: string,
    jwtBranch: string | null,
    header: string | null,
    input: { priceListId: string; useShared: boolean },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, jwtBranch, header, true);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      if (input.useShared) {
        const previous = await tx.branchPriceActivation.findMany({
          where: { tenantId, branchId: scope.writeBranchId, isActive: true },
        });
        await tx.branchPriceActivation.updateMany({
          where: { tenantId, branchId: scope.writeBranchId, isActive: true },
          data: { isActive: false },
        });
        for (const row of previous) {
          await tx.priceList.update({
            where: { id: row.priceListId },
            data: { status: 'ARCHIVED', isActive: false, effectiveTo: new Date() },
          });
        }
        await this.audit(tx, {
          tenantId,
          actorId,
          branchId: scope.writeBranchId,
          action: 'price.activate',
          entityType: 'PriceList',
          entityId: input.priceListId,
          newJson: JSON.stringify({ using: 'PHARMACY' }),
        });
        return { using: 'PHARMACY' };
      }
      const list = await tx.priceList.findFirst({ where: { id: input.priceListId, tenantId } });
      if (!list) throw new DomainError('NOT_FOUND', 404);
      if (list.status !== 'DRAFT') throw new DomainError('VALIDATION_ERROR', 400);
      const now = new Date();
      const nextOn = khartoumDate(list.effectiveFrom ?? now);
      this.guardPriceDate(nextOn);
      if (list.scope === 'PHARMACY') {
        await tx.priceList.updateMany({
          where: { tenantId, scope: 'PHARMACY', listType: list.listType, status: 'ACTIVE' },
          data: { isActive: false, status: 'ARCHIVED', effectiveTo: now },
        });
        await tx.branchPriceActivation.updateMany({
          where: { tenantId, isActive: true },
          data: { isActive: false },
        });
        await tx.priceList.update({
          where: { id: list.id },
          data: { isActive: true, status: 'ACTIVE', activatedAt: now, activatedBy: actorId, effectiveFrom: list.effectiveFrom ?? now, effectiveTo: null },
        });
        await this.audit(tx, {
          tenantId,
          actorId,
          action: 'price.activate',
          entityType: 'PriceList',
          entityId: list.id,
          newJson: JSON.stringify({ using: 'PHARMACY', version: list.versionNo }),
        });
        return { using: 'PHARMACY' };
      }
      const link = await tx.branchPriceActivation.findFirst({ where: { tenantId, priceListId: list.id } });
      if (!link || link.branchId !== scope.writeBranchId) throw new DomainError('VALIDATION_ERROR', 400);
      const previous = await tx.branchPriceActivation.findMany({
        where: { tenantId, branchId: scope.writeBranchId, isActive: true },
        include: { priceList: true },
      });
      await tx.branchPriceActivation.updateMany({
        where: { tenantId, branchId: scope.writeBranchId, isActive: true },
        data: { isActive: false },
      });
      for (const row of previous) {
        if (row.priceList.listType === list.listType && row.priceListId !== list.id) {
          await tx.priceList.update({
            where: { id: row.priceListId },
            data: { status: 'ARCHIVED', isActive: false, effectiveTo: now },
          });
        }
      }
      await tx.branchPriceActivation.update({ where: { id: link.id }, data: { isActive: true } });
      await tx.priceList.update({
        where: { id: list.id },
        data: { status: 'ACTIVE', activatedAt: now, activatedBy: actorId, effectiveFrom: list.effectiveFrom ?? now, effectiveTo: null },
      });
      await this.audit(tx, {
        tenantId,
        actorId,
        branchId: scope.writeBranchId,
        action: 'price.activate',
        entityType: 'PriceList',
        entityId: list.id,
        newJson: JSON.stringify({ using: 'BRANCH', version: list.versionNo }),
      });
      return { using: 'BRANCH' };
    });
  }

  network(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, null, null, false);
      return {
        management: scope.management,
        branchLimit: scope.branchLimit,
        canViewAll: scope.canViewAll,
        branches: scope.branches.map((branch) => ({
          id: branch.id,
          code: branch.code,
          nameAr: branch.nameAr,
          nameEn: branch.nameEn,
          isHeadOffice: branch.isHeadOffice,
          city: branch.city,
        })),
      };
    });
  }

  async createSupplier(
    tenantId: string,
    actorId: string,
    input: { nameAr: string; nameEn: string; phone: string; city: string; batchNotes?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const found = await tx.supplier.findFirst({
        where: {
          tenantId,
          isDeleted: false,
          OR: [{ nameAr: input.nameAr }, { nameEn: input.nameEn }],
        },
      });
      if (found) {
        return { id: found.id, created: false, nameAr: found.nameAr, nameEn: found.nameEn };
      }
      const id = randomUUID();
      await tx.supplier.create({
        data: {
          id,
          tenantId,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          phone: input.phone || null,
          city: input.city || null,
          batchNotes: input.batchNotes ?? '',
          balance: '0.00',
          createdBy: actorId,
        },
      });
      return { id, created: true, nameAr: input.nameAr, nameEn: input.nameEn };
    });
  }

  supplierDesk(tenantId: string, actorId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      const [suppliers, receipts] = await Promise.all([
        tx.supplier.findMany({ where: { tenantId }, orderBy: { nameAr: 'asc' } }),
        tx.goodsReceipt.findMany({
          where: { tenantId, supplierId: { not: null } },
          orderBy: { receivedAt: 'desc' },
          take: 300,
          select: { supplierId: true, lines: { select: { batchNo: true } } },
        }),
      ]);
      const received = new Map<string, string[]>();
      for (const receipt of receipts) {
        if (!receipt.supplierId) continue;
        const list = received.get(receipt.supplierId) ?? [];
        for (const line of receipt.lines) {
          const batch = line.batchNo.trim();
          if (!batch || batch.toUpperCase() === 'N/A' || list.includes(batch) || list.length >= 12) continue;
          list.push(batch);
        }
        received.set(receipt.supplierId, list);
      }
      return {
        canManage: scope.canViewAll,
        suppliers: suppliers.map((row) => ({
          id: row.id,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          phone: row.phone ?? '',
          city: row.city ?? '',
          balance: cash(row.balance),
          active: !row.isDeleted,
          batchNotes: row.batchNotes,
          receivedBatches: received.get(row.id) ?? [],
        })),
      };
    });
  }

  updateSupplier(
    tenantId: string,
    actorId: string,
    supplierId: string,
    input: { nameAr: string; nameEn: string; phone: string; city: string; batchNotes?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const found = await tx.supplier.findFirst({ where: { id: supplierId, tenantId } });
      if (!found) throw new DomainError('NOT_FOUND', 404);
      await tx.supplier.update({
        where: { tenantId_id: { tenantId, id: found.id } },
        data: {
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          phone: input.phone || null,
          city: input.city || null,
          batchNotes: input.batchNotes ?? '',
          updatedBy: actorId,
        },
      });
      return { id: found.id };
    });
  }

  setSupplierActive(tenantId: string, actorId: string, supplierId: string, isActive: boolean) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const found = await tx.supplier.findFirst({ where: { id: supplierId, tenantId } });
      if (!found) throw new DomainError('NOT_FOUND', 404);
      await tx.supplier.update({
        where: { tenantId_id: { tenantId, id: found.id } },
        data: { isDeleted: !isActive, updatedBy: actorId },
      });
      return { id: found.id, active: isActive };
    });
  }

  async createBranch(
    tenantId: string,
    actorId: string,
    input: { nameAr: string; nameEn: string; city: string; addressLine: string; phone: string; latitude: number; longitude: number },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const used = scope.branches.length;
      if (used >= scope.branchLimit) throw new DomainError('BRANCH_LIMIT', 409);
      const id = randomUUID();
      await tx.branch.create({
        data: {
          id,
          tenantId,
          code: `B${used + 1}`,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          isHeadOffice: false,
          city: input.city,
          addressLine: input.addressLine,
          latitude: input.latitude.toFixed(6),
          longitude: input.longitude.toFixed(6),
          phone: input.phone || null,
          createdBy: actorId,
        },
      });
      return { id };
    });
  }

  async setManagement(tenantId: string, actorId: string, management: 'INDEPENDENT' | 'SHARED') {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const current = await tx.pharmacySetting.findFirst({ where: { tenantId, key: 'management' } });
      const valueAr = management === 'INDEPENDENT' ? 'مستقل' : 'مشترك';
      if (!current) {
        await tx.pharmacySetting.create({ data: { tenantId, key: 'management', valueAr, valueEn: management } });
      } else {
        await tx.pharmacySetting.update({ where: { id: current.id }, data: { valueAr, valueEn: management } });
      }
      return { management };
    });
  }

  private async access(
    tx: Tx,
    tenantId: string,
    userId: string,
    jwtBranch: string | null,
    header: string | null,
    writing: boolean,
  ): Promise<{
    readBranchId: string | null;
    writeBranchId: string;
    management: 'INDEPENDENT' | 'SHARED';
    branchLimit: number;
    canViewAll: boolean;
    canManage: boolean;
    branches: { id: string; code: string; nameAr: string; nameEn: string | null; isHeadOffice: boolean; city: string | null }[];
  }> {
    const [branches, links, mode, tenant] = await Promise.all([
      tx.branch.findMany({ where: { tenantId, isDeleted: false }, orderBy: { createdAt: 'asc' } }),
      tx.userBranchRole.findMany({ where: { tenantId, userId }, include: { role: true } }),
      tx.pharmacySetting.findFirst({ where: { tenantId, key: 'management' } }),
      tx.tenant.findFirst({ where: { id: tenantId } }),
    ]);
    const canViewAll = links.some((link) => link.role.code === 'OWNER');
    const canManage = links.some((link) => {
      const code = link.role.code as RoleCode;
      return code in ROLE_PERMISSIONS && ROLE_PERMISSIONS[code].includes('users.manage');
    });
    const allowed = new Set(canViewAll ? branches.map((branch) => branch.id) : links.map((link) => link.branchId));
    if (header && header !== 'all' && !allowed.has(header)) throw new DomainError('UNAUTHORIZED', 403);
    if (writing && header === 'all') throw new DomainError('PICK_BRANCH', 400);
    const home = (jwtBranch && allowed.has(jwtBranch) ? jwtBranch : [...allowed][0]) ?? branches[0]?.id;
    if (!home) throw new DomainError('NOT_FOUND', 404);
    const picked = header && header !== 'all' ? header : home;
    const readBranchId = header === 'all' && canViewAll ? null : picked;
    const management = mode?.valueEn === 'INDEPENDENT' ? 'INDEPENDENT' : 'SHARED';
    return {
      readBranchId,
      writeBranchId: picked,
      management,
      branchLimit: tenant?.branchLimit ?? 1,
      canViewAll,
      canManage,
      branches,
    };
  }

  private async withPrices<T extends { id: string; sellPrice: string }>(
    tx: Tx,
    tenantId: string,
    branchId: string | null,
    views: T[],
  ): Promise<T[]> {
    const map = await this.priceQuote(
      tx,
      tenantId,
      branchId,
      views.map((view) => view.id),
    );
    return views.map((view) => ({ ...view, sellPrice: map.get(view.id)?.amount ?? view.sellPrice }));
  }

  private guardPriceDate(nextOn: string) {
    if (priceListDateGate({ nextOn, today: khartoumDate() }) === 'PRICE_DATE') {
      throw new DomainError('PRICE_DATE', 409);
    }
  }

  private async activateProposedList(
    tx: Tx,
    tenantId: string,
    list: { id: string; scope: string; listType: string; sourcePriceListId: string | null; effectiveFrom?: Date | null },
    actorId: string | null,
    effectiveFrom?: Date,
  ) {
    const now = new Date();
    const starts = effectiveFrom ?? list.effectiveFrom ?? now;
    this.guardPriceDate(khartoumDate(starts));
    await tx.priceList.updateMany({
      where: { tenantId, scope: list.scope, listType: list.listType, status: 'ACTIVE', id: { not: list.id } },
      data: { isActive: false, status: 'ARCHIVED', effectiveTo: now },
    });
    if (list.scope === 'PHARMACY') {
      await tx.branchPriceActivation.updateMany({ where: { tenantId, isActive: true }, data: { isActive: false } });
    }
    await tx.priceList.update({
      where: { id: list.id },
      data: {
        status: 'ACTIVE',
        isActive: list.scope === 'PHARMACY',
        activatedAt: now,
        activatedBy: actorId,
        effectiveFrom: effectiveFrom ?? now,
        effectiveTo: null,
        updatedBy: actorId,
      },
    });
    const rateRow = await tx.exchangeRate.findFirst({ where: { tenantId, priceListId: list.id } });
    if (rateRow && rateRow.status !== 'APPROVED') {
      await tx.exchangeRate.update({ where: { id: rateRow.id }, data: { status: 'APPROVED', updatedBy: actorId } });
    }
    if (!list.sourcePriceListId) return;
    const [previous, next] = await Promise.all([
      tx.productPrice.findMany({ where: { tenantId, priceListId: list.sourcePriceListId } }),
      tx.productPrice.findMany({ where: { tenantId, priceListId: list.id } }),
    ]);
    const oldBy = new Map(previous.map((row) => [row.productId, cash(row.amount)]));
    for (const row of next) {
      const oldAmount = oldBy.get(row.productId) ?? '0.00';
      const newAmount = cash(row.amount);
      if (oldAmount === newAmount) continue;
      await tx.priceHistory.create({
        data: { tenantId, priceListId: list.id, productId: row.productId, oldAmount, newAmount, createdBy: actorId },
      });
    }
  }

  private async reconcileDuplicateActivePriceLists(tx: Tx, tenantId: string): Promise<void> {
    const now = new Date();
    const lists = await tx.priceList.findMany({ where: { tenantId } });
    const rows = lists.map((list) => ({
      id: list.id,
      scope: list.scope,
      status: list.status,
      isActive: list.isActive,
      activatedAt: list.activatedAt?.toISOString() ?? null,
      createdAt: list.createdAt.toISOString(),
    }));
    for (const id of duplicateActivePharmacyListIds(rows)) {
      await tx.priceList.update({
        where: { id },
        data: { isActive: false, status: 'ARCHIVED', effectiveTo: now },
      });
    }
    const activeLinks = await tx.branchPriceActivation.findMany({ where: { tenantId, isActive: true } });
    const byBranch = new Map<string, typeof activeLinks>();
    for (const link of activeLinks) {
      const bucket = byBranch.get(link.branchId) ?? [];
      bucket.push(link);
      byBranch.set(link.branchId, bucket);
    }
    for (const [, links] of byBranch) {
      if (links.length <= 1) continue;
      const sorted = [...links].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
      for (const link of sorted.slice(1)) {
        await tx.branchPriceActivation.update({ where: { id: link.id }, data: { isActive: false } });
      }
    }
  }

  private async priceQuote(
    tx: Tx,
    tenantId: string,
    branchId: string | null,
    productIds: string[],
  ): Promise<Map<string, { amount: string; listId: string; version: number }>> {
    const map = new Map<string, { amount: string; listId: string; version: number }>();
    await this.reconcileDuplicateActivePriceLists(tx, tenantId);
    const due = await tx.priceList.findMany({
      where: { tenantId, status: 'SCHEDULED', effectiveFrom: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    for (const list of due) {
      try {
        await this.activateProposedList(tx, tenantId, list, null);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== 'PRICE_DATE') throw error;
      }
    }
    if (productIds.length === 0) return map;
    const [lists, activations] = await Promise.all([
      tx.priceList.findMany({ where: { tenantId } }),
      tx.branchPriceActivation.findMany({ where: { tenantId } }),
    ]);
    const listById = new Map(lists.map((list) => [list.id, list]));
    const listId = resolveSellingPriceListId({
      branchId,
      lists: lists.map((list) => ({
        id: list.id,
        scope: list.scope,
        status: list.status,
        isActive: list.isActive,
        activatedAt: list.activatedAt?.toISOString() ?? null,
        createdAt: list.createdAt.toISOString(),
      })),
      branchLinks: activations.map((row) => ({
        branchId: row.branchId,
        priceListId: row.priceListId,
        isActive: row.isActive,
        activatedAt: listById.get(row.priceListId)?.activatedAt?.toISOString() ?? null,
      })),
    });
    if (!listId) return map;
    const list = await tx.priceList.findFirst({ where: { id: listId, tenantId } });
    const rows = await tx.productPrice.findMany({
      where: { tenantId, priceListId: listId, productId: { in: productIds } },
    });
    for (const row of rows) {
      map.set(row.productId, { amount: cash(row.amount), listId, version: list?.versionNo ?? 1 });
    }
    return map;
  }

  private async takeStock(
    tx: Tx,
    tenantId: string,
    branchId: string,
    actorId: string,
    productId: string,
    qty: number,
    type: string,
    refId: string | null,
    note: string,
  ): Promise<void> {
    const lots = await tx.stockLot.findMany({ where: { tenantId, branchId, productId } });
    const today = khartoumDate();
    const takes = allocateFefo(
      lots
        .filter((lot) => (lot.condition || 'AVAILABLE') === 'AVAILABLE')
        .map((lot) => ({ id: lot.id, qtyBase: lot.qtyBase, expiry: lot.expiry.toISOString() })),
      qty,
      today,
    );
    for (const take of takes) {
      const lot = lots.find((row) => row.id === take.id);
      if (!lot) throw new DomainError('STOCK_SHORT', 409);
      await tx.stockLot.update({ where: { id: lot.id }, data: { qtyBase: lot.qtyBase - take.take } });
      await tx.stockMovement.create({
        data: {
          tenantId,
          branchId,
          productId,
          lotId: lot.id,
          type,
          qtyBase: -take.take,
          note,
          refType: type,
          refId,
          createdBy: actorId,
        },
      });
    }
  }

  private async postJournal(
    tx: Tx,
    tenantId: string,
    actorId: string,
    memoAr: string,
    memoEn: string,
    lines: { code: string; debit: string; credit: string }[],
  ): Promise<void> {
    assertJournalBalances(lines);
    const entryId = randomUUID();
    await tx.journalEntry.create({
      data: {
        id: entryId,
        tenantId,
        docNo: `JE-${entryId.slice(0, 8).toUpperCase()}`,
        memoAr,
        memoEn,
        postedAt: new Date(),
        createdBy: actorId,
      },
    });
    for (const line of lines) {
      if (cmpMoney(line.debit, '0.00') === 0 && cmpMoney(line.credit, '0.00') === 0) continue;
      const account = await tx.ledgerAccount.findFirst({ where: { tenantId, code: line.code } });
      if (!account) throw new DomainError('NOT_FOUND', 404);
      await tx.journalLine.create({
        data: {
          tenantId,
          entryId,
          accountId: account.id,
          debit: line.debit,
          credit: line.credit,
          createdBy: actorId,
        },
      });
      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: { balance: addMoney(cash(account.balance), balanceDelta(account.kind, line.debit, line.credit)) },
      });
    }
  }

  async updatePriceDate(
    tenantId: string,
    actorId: string,
    input: { priceListId: string; effectiveFrom: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const list = await tx.priceList.findFirst({ where: { id: input.priceListId, tenantId } });
      if (!list || list.status === 'ARCHIVED') throw new DomainError('VALIDATION_ERROR', 400);
      this.guardPriceDate(input.effectiveFrom);
      await tx.priceList.update({
        where: { id: list.id },
        data: { effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00+02:00`), updatedBy: actorId },
      });
      await this.audit(tx, {
        tenantId,
        actorId,
        action: 'price.date',
        entityType: 'PriceList',
        entityId: list.id,
        newJson: JSON.stringify({ effectiveFrom: input.effectiveFrom }),
      });
      return { effectiveFrom: input.effectiveFrom };
    });
  }

  async copyPriceList(
    tenantId: string,
    actorId: string,
    priceListId: string,
    adjust: RenewAdjust = 'SAME',
    value = '0.00',
    names?: { nameAr: string; nameEn: string },
    effectiveOn?: string,
  ) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const scope = await this.access(tx, tenantId, actorId, null, null, false);
        if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
        const source = await tx.priceList.findFirst({ where: { id: priceListId, tenantId } });
        if (!source) throw new DomainError('NOT_FOUND', 404);
        const nameAr = names?.nameAr.trim() || `${source.nameAr} ${source.versionNo + 1}`;
        const nameEn = names?.nameEn.trim() || `${source.nameEn} ${source.versionNo + 1}`;
        if (nameAr === source.nameAr && nameEn === source.nameEn) throw new DomainError('PRICE_DATE', 409);
        const id = randomUUID();
        const link = await tx.branchPriceActivation.findFirst({ where: { tenantId, priceListId: source.id } });
        const selling = source.status === 'ACTIVE' && (source.scope === 'PHARMACY' ? source.isActive : Boolean(link?.isActive));
        const starts = /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn ?? '')
          ? effectiveOn
          : selling
            ? khartoumDate(source.effectiveFrom ?? khartoumDayStart())
            : null;
        if (starts) this.guardPriceDate(starts);
        await tx.priceList.create({
          data: {
            id,
            tenantId,
            nameAr,
            nameEn,
            scope: source.scope,
            isActive: false,
            code: id.slice(0, 8).toUpperCase(),
            listType: source.listType,
            status: 'DRAFT',
            versionNo: source.versionNo + 1,
            sourcePriceListId: source.id,
            effectiveFrom: starts ? new Date(`${starts}T00:00:00+02:00`) : null,
            notes: source.notes,
            createdBy: actorId,
          },
        });
        if (source.scope === 'BRANCH' && link) {
          await tx.branchPriceActivation.create({
            data: { tenantId, branchId: link.branchId, priceListId: id, isActive: false, createdBy: actorId },
          });
        }
        const rows = await tx.productPrice.findMany({ where: { tenantId, priceListId: source.id } });
        for (const row of rows) {
          const current = cash(row.amount);
          let amount = current;
          try {
            amount = renewAmount(current, adjust, value);
          } catch (error) {
            if (!(error instanceof Error) || error.message !== 'PRICE') throw error;
          }
          await tx.productPrice.create({
            data: {
              tenantId,
              priceListId: id,
              productId: row.productId,
              amount,
              costReference: row.costReference ? cash(row.costReference) : null,
              marginPct: row.marginPct ? cash(row.marginPct) : null,
              createdBy: actorId,
            },
          });
        }
        await this.audit(tx, {
          tenantId,
          actorId,
          action: 'price.renew',
          entityType: 'PriceList',
          entityId: id,
          oldJson: JSON.stringify({ sourceId: source.id, version: source.versionNo }),
          newJson: JSON.stringify({ version: source.versionNo + 1, adjust, value }),
        });
        return { id, versionNo: source.versionNo + 1 };
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'PRICE') throw new DomainError('VALIDATION_ERROR', 400);
      this.rethrow(error);
    }
  }

  async deactivatePriceList(
    tenantId: string,
    actorId: string,
    jwtBranch: string | null,
    header: string | null,
    priceListId: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, jwtBranch, header, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const list = await tx.priceList.findFirst({ where: { id: priceListId, tenantId } });
      if (!list || list.status !== 'ACTIVE') throw new DomainError('VALIDATION_ERROR', 400);
      const now = new Date();
      if (list.scope === 'BRANCH') {
        if (!scope.readBranchId) throw new DomainError('PICK_BRANCH', 400);
        const link = await tx.branchPriceActivation.findFirst({ where: { tenantId, priceListId: list.id } });
        if (!link || !link.isActive || link.branchId !== scope.readBranchId) throw new DomainError('VALIDATION_ERROR', 400);
        await tx.branchPriceActivation.update({ where: { id: link.id }, data: { isActive: false } });
      } else if (!list.isActive) {
        throw new DomainError('VALIDATION_ERROR', 400);
      }
      await tx.priceList.update({
        where: { id: list.id },
        data: { status: 'ARCHIVED', isActive: false, effectiveTo: now },
      });
      await this.audit(tx, {
        tenantId,
        actorId,
        branchId: list.scope === 'BRANCH' ? scope.readBranchId : null,
        action: 'price.deactivate',
        entityType: 'PriceList',
        entityId: list.id,
        newJson: JSON.stringify({ status: 'ARCHIVED' }),
      });
      return { status: 'ARCHIVED' };
    });
  }

  async deletePriceList(tenantId: string, actorId: string, priceListId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const list = await tx.priceList.findFirst({ where: { id: priceListId, tenantId } });
      if (!list || list.status !== 'DRAFT') throw new DomainError('VALIDATION_ERROR', 400);
      const used = await tx.saleLine.findFirst({
        where: { tenantId, priceListId: list.id, sale: { status: 'POSTED' } },
        select: { id: true },
      });
      if (used) throw new DomainError('VALIDATION_ERROR', 400);
      await tx.productPrice.deleteMany({ where: { tenantId, priceListId: list.id } });
      await tx.priceHistory.deleteMany({ where: { tenantId, priceListId: list.id } });
      await tx.priceListChangeBatch.deleteMany({ where: { tenantId, priceListId: list.id } });
      await tx.branchPriceActivation.deleteMany({ where: { tenantId, priceListId: list.id } });
      await tx.priceList.delete({ where: { id: list.id } });
      await this.audit(tx, {
        tenantId,
        actorId,
        action: 'price.delete',
        entityType: 'PriceList',
        entityId: list.id,
        oldJson: JSON.stringify({ nameEn: list.nameEn, version: list.versionNo }),
      });
      return { ok: true };
    });
  }

  async changePrices(
    tenantId: string,
    actorId: string,
    input: {
      priceListId: string;
      op: PriceOp;
      value: string;
      rounding: 'NONE' | '10' | '50' | '100';
      roundMode: 'NEAREST' | 'UP';
      filter: 'ALL' | 'USD';
      apply: boolean;
    },
  ) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const scope = await this.access(tx, tenantId, actorId, null, null, false);
        if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
        const list = await tx.priceList.findFirst({ where: { id: input.priceListId, tenantId } });
        if (!list) throw new DomainError('NOT_FOUND', 404);
        if (list.status !== 'DRAFT') throw new DomainError('VALIDATION_ERROR', 400);
        const rateRow = await tx.exchangeRate.findFirst({ where: { tenantId }, orderBy: { notedAt: 'desc' } });
        const rate = rateRow ? cash(rateRow.rate) : '0.00';
        const products = await tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } });
        const current = await tx.productPrice.findMany({ where: { tenantId, priceListId: list.id } });
        const amountByProduct = new Map(current.map((row) => [row.productId, cash(row.amount)]));
        const preview = products
          .filter((product) => input.filter !== 'USD' || (product.costUsd !== null && cmpMoney(cash(product.costUsd), '0.00') > 0))
          .map((product) => {
            const oldPrice = amountByProduct.get(product.id) ?? '';
            const next = nextPrice({
              oldPrice,
              cost: cash(product.costPrice),
              costUsd: product.costUsd ? cash(product.costUsd) : '0.00',
              op: input.op,
              value: input.value,
              rate,
              rounding: input.rounding,
              roundMode: input.roundMode,
            });
            return {
              productId: product.id,
              sku: product.sku,
              nameAr: product.nameAr,
              nameEn: product.nameEn,
              oldPrice: oldPrice || '0.00',
              newPrice: next,
              belowCost: next !== null && cmpMoney(cash(product.costPrice), '0.00') > 0 && cmpMoney(next, cash(product.costPrice)) < 0,
            };
          });
        if (!input.apply) return { preview, rate };
        let rowsAffected = 0;
        for (const row of preview) {
          if (!row.newPrice || row.newPrice === row.oldPrice) continue;
          const existing = current.find((item) => item.productId === row.productId);
          if (existing) {
            await tx.productPrice.update({ where: { id: existing.id }, data: { amount: row.newPrice } });
          } else {
            await tx.productPrice.create({
              data: { tenantId, priceListId: list.id, productId: row.productId, amount: row.newPrice, createdBy: actorId },
            });
          }
          await tx.priceHistory.create({
            data: {
              tenantId,
              priceListId: list.id,
              productId: row.productId,
              oldAmount: row.oldPrice,
              newAmount: row.newPrice,
              createdBy: actorId,
            },
          });
          rowsAffected += 1;
        }
        await tx.priceListChangeBatch.create({
          data: {
            tenantId,
            priceListId: list.id,
            ruleName: input.op,
            filterText: input.filter,
            valueText: `${input.value}|${input.rounding}|${input.roundMode}`,
            rowsAffected,
            createdBy: actorId,
          },
        });
        await this.audit(tx, {
          tenantId,
          actorId,
          action: 'price.bulk',
          entityType: 'PriceList',
          entityId: list.id,
          newJson: JSON.stringify({ op: input.op, value: input.value, rowsAffected }),
        });
        return { preview, rate, rowsAffected };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  rates(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const rows = await tx.exchangeRate.findMany({ where: { tenantId }, orderBy: { notedAt: 'desc' }, take: 12 });
      return rows.map((row) => ({
        id: row.id,
        currency: row.currency,
        rate: cash(row.rate),
        status: row.status,
        priceListId: row.priceListId,
        reason: row.reason,
        notedAt: row.notedAt.toISOString(),
      }));
    });
  }

  async saveRate(tenantId: string, actorId: string, rate: string) {
    const amount = money(rate);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const id = randomUUID();
      await tx.exchangeRate.create({
        data: { id, tenantId, currency: 'USD', rate: amount, notedAt: new Date(), createdBy: actorId },
      });
      return { id, rate: amount };
    });
  }

  async proposeUsdRate(
    tenantId: string,
    actorId: string,
    input: { rate: string; action: 'preview' | 'draft' | 'submit' | 'reject' | 'approve' | 'rate'; proposalId?: string; reason?: string; effectiveOn?: string },
  ) {
    const nextRate = money(input.rate);
    if (cmpMoney(nextRate, '0.00') <= 0) throw new DomainError('VALIDATION_ERROR', 400);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      if (input.action === 'rate') {
        const approved = await tx.exchangeRate.findFirst({ where: { tenantId, status: 'APPROVED' }, orderBy: { notedAt: 'desc' } });
        const oldRate = approved ? cash(approved.rate) : '0.00';
        const rateId = randomUUID();
        await tx.exchangeRate.create({
          data: { id: rateId, tenantId, currency: 'USD', rate: nextRate, status: 'APPROVED', notedAt: new Date(), createdBy: actorId },
        });
        await this.audit(tx, { tenantId, actorId, action: 'price.rate_keep', entityType: 'ExchangeRate', entityId: rateId, newJson: JSON.stringify({ oldRate, newRate: nextRate }) });
        return { oldRate, newRate: nextRate, changePct: priceChangePct(oldRate, nextRate), status: 'APPROVED', rows: [] as RatePreview[] };
      }
      if (input.action === 'reject' || input.action === 'approve') {
        if (!input.proposalId) throw new DomainError('VALIDATION_ERROR', 400);
        const list = await tx.priceList.findFirst({ where: { id: input.proposalId, tenantId } });
        if (!list || !['DRAFT', 'PENDING', 'SCHEDULED'].includes(list.status)) throw new DomainError('VALIDATION_ERROR', 400);
        const rateRow = await tx.exchangeRate.findFirst({ where: { tenantId, priceListId: list.id } });
        if (input.action === 'reject') {
          const reason = (input.reason ?? '').trim();
          if (reason.length < 3) throw new DomainError('VALIDATION_ERROR', 400);
          await tx.priceList.update({ where: { id: list.id }, data: { status: 'REJECTED', isActive: false, notes: reason, updatedBy: actorId } });
          if (rateRow) await tx.exchangeRate.update({ where: { id: rateRow.id }, data: { status: 'REJECTED', reason } });
          await this.audit(tx, { tenantId, actorId, action: 'price.rate_reject', entityType: 'PriceList', entityId: list.id, newJson: JSON.stringify({ reason }) });
          return { status: 'REJECTED', proposalId: list.id, rows: [] as RatePreview[] };
        }
        const when = input.effectiveOn ? new Date(`${input.effectiveOn}T00:00:00Z`) : new Date();
        const later = input.effectiveOn ? input.effectiveOn > khartoumDate() : false;
        if (later) {
          await tx.priceList.update({
            where: { id: list.id },
            data: { status: 'SCHEDULED', isActive: false, effectiveFrom: when, updatedBy: actorId },
          });
          return { status: 'SCHEDULED', proposalId: list.id, rows: [] as RatePreview[] };
        }
        await this.activateProposedList(tx, tenantId, list, actorId, when);
        await this.audit(tx, { tenantId, actorId, action: 'price.rate_approve', entityType: 'PriceList', entityId: list.id, newJson: JSON.stringify({ version: list.versionNo, rate: cash(list.exchangeRateUsed ?? 0) }) });
        return { status: 'ACTIVE', proposalId: list.id, rows: [] as RatePreview[] };
      }
      const approved = await tx.exchangeRate.findFirst({ where: { tenantId, status: 'APPROVED' }, orderBy: { notedAt: 'desc' } });
      const oldRate = approved ? cash(approved.rate) : '0.00';
      const active = await tx.priceList.findFirst({ where: { tenantId, scope: 'PHARMACY', status: 'ACTIVE', isActive: true } });
      const products = await tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } });
      const currentPrices = active ? await tx.productPrice.findMany({ where: { tenantId, priceListId: active.id } }) : [];
      const oldByProduct = new Map(currentPrices.map((row) => [row.productId, cash(row.amount)]));
      const rows: RatePreview[] = [];
      for (const product of products) {
        const base = product.costUsd ? cash(product.costUsd) : '0.00';
        const proposed = usdSellingPrice(base, nextRate);
        if (!proposed && !oldByProduct.has(product.id)) continue;
        const oldPrice = oldByProduct.get(product.id) ?? '0.00';
        const newPrice = proposed ?? oldPrice;
        rows.push({
          productId: product.id,
          sku: product.sku,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          oldPrice,
          newPrice,
          changePct: priceChangePct(oldPrice, newPrice),
          belowCost: cmpMoney(cash(product.costPrice), '0.00') > 0 && cmpMoney(newPrice, cash(product.costPrice)) < 0,
        });
      }
      const changePct = priceChangePct(oldRate, nextRate);
      if (input.action === 'preview') {
        return { oldRate, newRate: nextRate, changePct, status: 'PREVIEW', rows };
      }
      const starts = input.effectiveOn && /^\d{4}-\d{2}-\d{2}$/.test(input.effectiveOn) ? input.effectiveOn : khartoumDate();
      this.guardPriceDate(starts);
      const status = input.action === 'submit' ? 'PENDING' : 'DRAFT';
      const listId = randomUUID();
      const highest = await tx.priceList.aggregate({ where: { tenantId }, _max: { versionNo: true } });
      const version = (highest._max.versionNo ?? 0) + 1;
      await tx.priceList.create({
        data: {
          id: listId,
          tenantId,
          nameAr: active?.nameAr ?? 'قائمة السعر',
          nameEn: active?.nameEn ?? 'Price list',
          scope: 'PHARMACY',
          listType: active?.listType ?? 'GENERAL',
          status,
          versionNo: version,
          sourcePriceListId: active?.id ?? null,
          exchangeRateUsed: nextRate,
          effectiveFrom: new Date(`${starts}T00:00:00+02:00`),
          isActive: false,
          createdBy: actorId,
        },
      });
      const priced = new Set<string>();
      for (const row of rows) {
        priced.add(row.productId);
        await tx.productPrice.create({
          data: { tenantId, priceListId: listId, productId: row.productId, amount: row.newPrice, createdBy: actorId },
        });
      }
      for (const row of currentPrices) {
        if (priced.has(row.productId)) continue;
        await tx.productPrice.create({
          data: { tenantId, priceListId: listId, productId: row.productId, amount: cash(row.amount), createdBy: actorId },
        });
      }
      const rateId = randomUUID();
      await tx.exchangeRate.create({
        data: { id: rateId, tenantId, currency: 'USD', rate: nextRate, status, priceListId: listId, notedAt: new Date(), createdBy: actorId },
      });
      await this.audit(tx, { tenantId, actorId, action: 'price.rate_propose', entityType: 'PriceList', entityId: listId, newJson: JSON.stringify({ oldRate, newRate: nextRate, status, rows: rows.length }) });
      return { oldRate, newRate: nextRate, changePct, status, proposalId: listId, rows };
    });
  }

  async exportPrices(tenantId: string, priceListId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const list = await tx.priceList.findFirst({ where: { id: priceListId, tenantId } });
      if (!list) throw new DomainError('NOT_FOUND', 404);
      const [products, prices] = await Promise.all([
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.productPrice.findMany({ where: { tenantId, priceListId } }),
      ]);
      const byProduct = new Map(prices.map((row) => [row.productId, row]));
      const header = 'PriceListItemId,ProductCode,Barcode,TradeName,GenericName,Unit,Cost,CurrentPrice,NewPrice';
      const lines = products.map((product) => {
        const price = byProduct.get(product.id);
        return [
          price?.id ?? product.id,
          product.sku,
          product.gtin ?? '',
          product.nameAr,
          product.genericName,
          'BASE',
          cash(product.costPrice),
          price ? cash(price.amount) : '',
          price ? cash(price.amount) : '',
        ].join(',');
      });
      return { csv: `\uFEFF${header}\n${lines.join('\n')}\n`, status: list.status };
    });
  }

  async importPrices(tenantId: string, actorId: string, priceListId: string, csv: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
      const list = await tx.priceList.findFirst({ where: { id: priceListId, tenantId } });
      if (!list || list.status !== 'DRAFT') throw new DomainError('VALIDATION_ERROR', 400);
      const products = await tx.product.findMany({ where: { tenantId, isDeleted: false } });
      const prices = await tx.productPrice.findMany({ where: { tenantId, priceListId } });
      const bySku = new Map(products.map((product) => [product.sku, product]));
      const byPriceId = new Map(prices.map((row) => [row.id, row]));
      const byProductPrice = new Map(prices.map((row) => [row.productId, row]));
      const table = parseCsv(csv);
      const header = table[0]?.map((cell) => cell.trim()) ?? [];
      const idIndex = header.indexOf('PriceListItemId');
      const codeIndex = header.indexOf('ProductCode');
      const newIndex = header.indexOf('NewPrice');
      if (newIndex < 0) throw new DomainError('VALIDATION_ERROR', 400);
      const changed: string[] = [];
      const unchanged: string[] = [];
      const errors: string[] = [];
      for (const cells of table.slice(1)) {
        const code = cells[codeIndex] ?? '';
        const raw = cells[newIndex] ?? '';
        const product = bySku.get(code) ?? products.find((item) => item.id === cells[idIndex]);
        if (!product) {
          errors.push(code || cells[idIndex] || '?');
          continue;
        }
        if (raw.trim() === '') {
          unchanged.push(product.sku);
          continue;
        }
        if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) {
          errors.push(product.sku);
          continue;
        }
        const next = money(raw.trim());
        const current = byPriceId.get(cells[idIndex] ?? '') ?? byProductPrice.get(product.id);
        const oldAmount = current ? cash(current.amount) : '0.00';
        if (current && cash(current.amount) === next) {
          unchanged.push(product.sku);
          continue;
        }
        if (cmpMoney(cash(product.costPrice), '0.00') > 0 && cmpMoney(next, cash(product.costPrice)) < 0) {
          errors.push(`${product.sku}:below-cost`);
        }
        if (current) await tx.productPrice.update({ where: { id: current.id }, data: { amount: next, isManualOverride: true } });
        else {
          await tx.productPrice.create({
            data: { tenantId, priceListId, productId: product.id, amount: next, isManualOverride: true, createdBy: actorId },
          });
        }
        await tx.priceHistory.create({
          data: { tenantId, priceListId, productId: product.id, oldAmount, newAmount: next, createdBy: actorId },
        });
        changed.push(product.sku);
      }
      await this.audit(tx, {
        tenantId,
        actorId,
        action: 'price.import',
        entityType: 'PriceList',
        entityId: priceListId,
        newJson: JSON.stringify({ changed: changed.length, errors: errors.length }),
      });
      return { changed, unchanged, errors };
    });
  }

  async publishCatalog(
    tenantId: string,
    actorId: string,
    rows: {
      code: string;
      nameAr: string;
      nameEn: string;
      genericName: string;
      form: string;
      strength: string;
      categoryAr: string;
      categoryEn: string;
      gtin?: string;
      manufacturer?: string;
      ingredients?: string;
    }[],
  ) {
    const scopeOk = await this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, null, null, false);
      return scope.canViewAll;
    });
    if (!scopeOk) throw new DomainError('UNAUTHORIZED', 403);
    const errors: string[] = [];
    let requested = 0;
    for (const row of rows) {
      if (!row.nameAr || !row.nameEn || !row.genericName) {
        errors.push(row.code || '?');
        continue;
      }
      const existing = await this.prisma.client.globalCatalogItem.findFirst({
        where: { OR: [{ code: row.code }, { nameEn: row.nameEn, genericName: row.genericName, strength: row.strength || '' }] },
        select: { id: true },
      });
      if (existing) {
        errors.push(`${row.code}:duplicate`);
        continue;
      }
      await this.prisma.client.newCatalogItemRequest.create({
        data: {
          tenantId,
          requestedBy: actorId,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          genericName: row.genericName,
          manufacturer: row.manufacturer ?? '',
          strength: row.strength || '',
          packaging: row.form,
          itemType: 'Medicine',
          barcode: row.gtin ?? '',
          note: row.ingredients ?? '',
          status: 'PENDING',
        },
      });
      requested += 1;
    }
    return { created: 0, updated: 0, requested, errors };
  }

  async saveGoodsReceipt(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    header: string | null,
    input: GoodsReceiptInput,
  ) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const scope = await this.access(tx, tenantId, actorId, branchHint, header, true);
        const opening = Boolean(input.opening);
        const override = Boolean(input.override);
        if ((opening || override) && !scope.canManage) throw new DomainError('OPENING_FORBIDDEN', 403);
        if (opening === Boolean(input.purchaseId)) throw new DomainError('NEED_PURCHASE', 400);
        const invoice = (input.supplierInvoice ?? '').trim();
        if (!opening && invoice.length < 1) throw new DomainError('NEED_INVOICE', 400);
        const shelf = await this.shelfSettings(tx, tenantId);
        const existing = await tx.goodsReceipt.findFirst({
          where: { tenantId, clientKey: input.clientKey },
          include: { lines: true },
        });
        if (existing?.status === 'POSTED') {
          const quantity = existing.lines.reduce((sum, line) => sum + line.qty + line.bonusQty, 0);
          const value = existing.lines.reduce((sum, line) => addMoney(sum, mulMoney(cash(line.unitCost), String(line.qty))), '0.00');
          return { id: existing.id, docNo: existing.docNo, status: existing.status, quantity, value, warnings: [] as string[] };
        }
        const order = input.purchaseId
          ? await tx.purchaseOrder.findFirst({
              where: { id: input.purchaseId, tenantId, branchId: scope.writeBranchId },
              include: { lines: true, supplier: true },
            })
          : null;
        if (!opening && (!order || !['ORDERED', 'PARTIAL'].includes(order.status))) throw new DomainError('NOT_FOUND', 404);
        const buckets: OrderBucket[] = (order?.lines ?? []).map((line) => ({
          id: line.id,
          productId: line.productId,
          ordered: line.qty,
          received: line.receivedQty,
        }));
        const productIds = input.lines.map((row) => row.productId).filter((id): id is string => Boolean(id));
        const packsByProduct = productIds.length > 0 ? await this.itemPacks(tx, tenantId, productIds) : new Map<string, ItemPack>();
        const warnings: string[] = [];
        const ready: {
          productId: string;
          batchNo: string;
          qty: number;
          bonus: number;
          unitCost: string;
          foreignUnit: string;
          rejectedQty: number;
          sellPrice: string;
          expiry: Date;
          location: string;
          condition: 'AVAILABLE' | 'REJECTED' | 'QUARANTINE' | 'DAMAGED';
          manufacturedAt: string;
          serialNo: string;
          unitCode: string;
          trackSerial: boolean;
          purchaseLineId: string | null;
        }[] = [];
        for (const line of input.lines) {
          const batchNo = manufacturerBatch(line.batchNo);
          let product = line.productId
            ? await tx.product.findFirst({ where: { id: line.productId, tenantId, isDeleted: false } })
            : null;
          if (!product && line.code) {
            await ensureProducts(tx, tenantId, actorId, [line.code]);
            product = await tx.product.findFirst({ where: { tenantId, sku: line.code, isDeleted: false } });
          }
          if (!product) throw new DomainError('NOT_FOUND', 404);
          const condition = line.condition ?? 'AVAILABLE';
          const bonus = line.bonusQty ?? 0;
          const pack = line.pack ?? packsByProduct.get(product.id) ?? null;
          const orderLine = order?.lines.find((row) => row.productId === product.id);
          const unitCode = line.unitCode ?? orderLine?.unitCode ?? 'PIECE';
          const orderQty = line.qty;
          const stockPieces = qtyToStockPieces(orderQty, pack, unitCode);
          if (condition === 'AVAILABLE') {
            const warning = assertReceiptLine({
              expiry: line.expiry,
              manufacturedAt: line.manufacturedAt ?? '',
              qty: stockPieces,
              bonusQty: bonus,
              serial: line.serialNo ?? '',
              trackSerial: product.trackSerial,
              today: khartoumDate(),
              warnMonths: shelf.warn,
            });
            if (warning) warnings.push(`${product.sku}:${warning}`);
          } else if (!/^\d{4}-\d{2}-\d{2}/.test(line.expiry)) {
            throw new DomainError('VALIDATION_ERROR', 400);
          }
          if (line.serialNo?.trim()) {
            const duplicate = await tx.stockLot.findFirst({ where: { tenantId, serialNo: line.serialNo.trim() } });
            if (duplicate) throw new DomainError('VALIDATION_ERROR', 400);
          }
          const takes = order ? claimReceiptQty(buckets, product.id, orderQty, override) : [];
          if (cmpMoney(money(line.unitCost), '0.00') <= 0) throw new DomainError('VALIDATION_ERROR', 400);
          if (line.pack) await this.rememberPack(tx, tenantId, actorId, product.id, line.pack);
          const unitCost = pieceUnitCost(money(line.unitCost), pack);
          ready.push({
            productId: product.id,
            batchNo,
            qty: stockPieces,
            bonus,
            unitCost,
            foreignUnit: unitCost,
            rejectedQty: line.rejectedQty ?? 0,
            sellPrice: line.sellPrice ? money(line.sellPrice) : '',
            expiry: new Date(line.expiry),
            location: line.location,
            condition,
            manufacturedAt: line.manufacturedAt ?? '',
            serialNo: line.serialNo?.trim() ?? '',
            unitCode: pack?.outer ?? unitCode,
            trackSerial: product.trackSerial,
            purchaseLineId: takes[0]?.id ?? null,
          });
        }
        const currency = input.currency ?? 'SDG';
        let snapshotRate = '1.00';
        if (currency === 'USD') {
          const approved = await tx.exchangeRate.findFirst({
            where: { tenantId, status: 'APPROVED' },
            orderBy: { notedAt: 'desc' },
          });
          if (!approved) throw new DomainError('VALIDATION_ERROR', 400);
          snapshotRate = cash(approved.rate);
        }
        let costs: { sdgUnit: string; sdgTotal: string; foreignUnit: string }[];
        try {
          costs = allocateReceiptCosts(
            ready.map((line) => ({ qty: line.qty, unitCost: line.unitCost })),
            {
              currency,
              rate: snapshotRate,
              discount: input.discount || '0.00',
              tax: input.tax || '0.00',
              charges: input.charges || '0.00',
            },
          );
        } catch (error) {
          if (error instanceof Error && (error.message === 'RATE' || error.message === 'COST' || error.message === 'QTY')) {
            throw new DomainError('VALIDATION_ERROR', 400);
          }
          throw error;
        }
        ready.forEach((line, index) => {
          line.foreignUnit = costs[index].foreignUnit;
          line.unitCost = costs[index].sdgUnit;
        });
        const receiptId = existing?.id ?? randomUUID();
        const docNo = existing?.docNo ?? `GR-${receiptId.slice(0, 8).toUpperCase()}`;
        const receivedAt = existing?.receivedAt ?? new Date();
        if (!existing) {
          await tx.goodsReceipt.create({
            data: {
              id: receiptId,
              tenantId,
              branchId: scope.writeBranchId,
              supplierId: order?.supplierId ?? null,
              purchaseId: order?.id ?? null,
              clientKey: input.clientKey,
              docNo,
              supplierInvoice: invoice,
              currency,
              exchangeRate: currency === 'USD' ? snapshotRate : null,
              discountAmount: money(input.discount || '0.00'),
              taxAmount: money(input.tax || '0.00'),
              chargeAmount: money(input.charges || '0.00'),
              status: 'DRAFT',
              source: opening ? 'OPENING' : 'PROCUREMENT',
              receivedAt,
              createdBy: actorId,
            },
          });
        } else {
          await tx.goodsReceiptLine.deleteMany({ where: { tenantId, receiptId } });
          await tx.goodsReceipt.update({
            where: { id: receiptId },
            data: {
              supplierInvoice: invoice,
              currency,
              exchangeRate: currency === 'USD' ? snapshotRate : null,
              discountAmount: money(input.discount || '0.00'),
              taxAmount: money(input.tax || '0.00'),
              chargeAmount: money(input.charges || '0.00'),
              updatedBy: actorId,
            },
          });
        }
        let quantity = 0;
        let value = '0.00';
        for (const line of ready) {
          await tx.goodsReceiptLine.create({
            data: {
              tenantId,
              receiptId,
              productId: line.productId,
              purchaseLineId: line.purchaseLineId,
              batchNo: line.batchNo,
              qty: line.qty,
              bonusQty: line.bonus,
              unitCost: line.unitCost,
              foreignUnitCost: line.foreignUnit,
              currency,
              exchangeRate: currency === 'USD' ? snapshotRate : null,
              rejectedQty: line.rejectedQty,
              sellPrice: line.sellPrice || null,
              expiry: line.expiry,
              location: line.location,
              condition: line.condition,
              manufacturedAt: line.manufacturedAt ? new Date(line.manufacturedAt) : null,
              serialNo: line.serialNo || null,
              unitCode: line.unitCode,
              createdBy: actorId,
            },
          });
          quantity += line.qty + line.bonus;
          value = addMoney(value, mulMoney(line.unitCost, String(line.qty)));
        }
        if (!input.post) {
          await this.audit(tx, {
            tenantId,
            actorId,
            branchId: scope.writeBranchId,
            action: 'receipt.draft',
            entityType: 'GoodsReceipt',
            entityId: receiptId,
            newJson: JSON.stringify({ docNo, lines: ready.length }),
          });
          return { id: receiptId, docNo, status: 'DRAFT', quantity, value, warnings };
        }
        const postedLines = await tx.goodsReceiptLine.findMany({ where: { tenantId, receiptId } });
        if (opening) {
          const already = await tx.stockMovement.findFirst({ where: { tenantId, refType: 'RECEIPT', refId: receiptId } });
          if (!already) {
            for (const line of postedLines) {
              const lotId = randomUUID();
              const received = line.qty + line.bonusQty;
              await tx.stockLot.create({
                data: {
                  id: lotId,
                  tenantId,
                  branchId: scope.writeBranchId,
                  productId: line.productId,
                  batchNo: line.batchNo,
                  expiry: line.expiry,
                  manufacturedAt: line.manufacturedAt,
                  serialNo: line.serialNo,
                  unitCode: line.unitCode,
                  bonusQty: line.bonusQty,
                  qtyBase: received,
                  location: line.location,
                  condition: line.condition,
                  unitCost: line.unitCost,
                  receiptLineId: line.id,
                  createdBy: actorId,
                },
              });
              await tx.stockMovement.create({
                data: {
                  tenantId,
                  branchId: scope.writeBranchId,
                  productId: line.productId,
                  lotId,
                  type: 'RECEIVE',
                  qtyBase: received,
                  note: docNo,
                  refType: 'RECEIPT',
                  refId: receiptId,
                  createdBy: actorId,
                },
              });
              await tx.goodsReceiptLine.update({ where: { id: line.id }, data: { postedQty: received } });
              if (line.condition === 'AVAILABLE') {
                await tx.product.update({
                  where: { id: line.productId },
                  data: { costPrice: line.unitCost },
                });
              }
            }
          }
        } else {
          for (const line of postedLines) {
            if (line.condition !== 'AVAILABLE') continue;
            await tx.product.update({
              where: { id: line.productId },
              data: { costPrice: line.unitCost },
            });
          }
        }
        if (order) {
          for (const bucket of buckets) {
            await tx.purchaseLine.update({ where: { id: bucket.id }, data: { receivedQty: bucket.received } });
          }
          const done = buckets.every((bucket) => bucket.received >= bucket.ordered);
          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: { status: done ? 'RECEIVED' : 'PARTIAL' },
          });
          await tx.supplier.update({
            where: { id: order.supplierId },
            data: { balance: addMoney(cash(order.supplier.balance), value) },
          });
          await this.postJournal(tx, tenantId, actorId, `استلام ${docNo}`, `Receipt ${docNo}`, [
            { code: '1200', debit: value, credit: '0.00' },
            { code: '2000', debit: '0.00', credit: value },
          ]);
        }
        await tx.goodsReceipt.update({
          where: { id: receiptId },
          data: { status: 'POSTED', postedAt: new Date(), updatedBy: actorId },
        });
        await this.audit(tx, {
          tenantId,
          actorId,
          branchId: scope.writeBranchId,
          action: 'receipt.post',
          entityType: 'GoodsReceipt',
          entityId: receiptId,
          newJson: JSON.stringify({ docNo, quantity, value, purchaseId: order?.id ?? null }),
        });
        return { id: receiptId, docNo, status: 'POSTED', quantity, value, warnings };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async pendingStock(tenantId: string, branchHint: string | null, actorId: string, header: string | null, clientKey: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, actorId, branchHint, header, true);
      const entry = clientKey
        ? await tx.inventoryEntry.findFirst({ where: { tenantId, clientKey }, include: { lines: true } })
        : null;
      return this.stockDesk(tx, tenantId, scope, actorId, entry);
    });
  }

  async openInventoryEntry(tenantId: string, branchHint: string | null, actorId: string, header: string | null, clientKey: string) {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.withTenant(tenantId, async (tx) => {
          const scope = await this.access(tx, tenantId, actorId, branchHint, header, true);
          let entry = await tx.inventoryEntry.findFirst({ where: { tenantId, clientKey }, include: { lines: true } });
          if (entry && entry.branchId !== scope.writeBranchId) throw new DomainError('UNAUTHORIZED', 403);
          if (!entry) {
            entry = await tx.inventoryEntry.create({
              data: {
                tenantId,
                branchId: scope.writeBranchId,
                clientKey,
                docNo: await this.nextInventoryDoc(tx, tenantId),
                status: 'DRAFT',
                receivedAt: new Date(),
                createdBy: actorId,
              },
              include: { lines: true },
            });
            await this.audit(tx, {
              tenantId,
              actorId,
              branchId: scope.writeBranchId,
              action: 'stock.open',
              entityType: 'InventoryEntry',
              entityId: entry.id,
              newJson: JSON.stringify({ docNo: entry.docNo }),
            });
          }
          return this.stockDesk(tx, tenantId, scope, actorId, entry);
        });
      } catch (error) {
        last = error;
        if (uniqueConflict(error) && attempt < 2) continue;
        this.rethrow(error);
      }
    }
    this.rethrow(last);
  }

  async saveInventoryEntry(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    header: string | null,
    input: InventoryPostInput,
  ) {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.withTenant(tenantId, async (tx) => {
          const scope = await this.access(tx, tenantId, actorId, branchHint, header, true);
          const shelf = await this.shelfSettings(tx, tenantId);
          let entry = await tx.inventoryEntry.findFirst({
            where: { tenantId, clientKey: input.clientKey },
            include: { lines: true },
          });
          if (entry?.status === 'POSTED') {
            return {
              id: entry.id,
              docNo: entry.docNo,
              status: entry.status,
              quantity: entry.lines.reduce((sum, line) => sum + line.qty, 0),
              warnings: [] as string[],
            };
          }
          if (entry && entry.branchId !== scope.writeBranchId) throw new DomainError('UNAUTHORIZED', 403);
          if (!entry) {
            entry = await tx.inventoryEntry.create({
              data: {
                tenantId,
                branchId: scope.writeBranchId,
                clientKey: input.clientKey,
                docNo: await this.nextInventoryDoc(tx, tenantId),
                status: 'DRAFT',
                receivedAt: new Date(),
                createdBy: actorId,
              },
              include: { lines: true },
            });
          }
          const places = await this.ensurePlaces(tx, tenantId, scope.writeBranchId, actorId);
          const placeByCode = new Map(places.map((place) => [place.code, place]));
          await tx.inventoryEntryLine.deleteMany({ where: { tenantId, entryId: entry.id } });
          const warnings: string[] = [];
          if (!input.post) {
            for (const request of input.lines) {
              if (!placeByCode.has(request.location)) throw new DomainError('VALIDATION_ERROR', 400);
              const source = await tx.goodsReceiptLine.findFirst({ where: { id: request.receiptLineId, tenantId } });
              if (!source) throw new DomainError('NOT_FOUND', 404);
              await tx.inventoryEntryLine.create({
                data: {
                  tenantId,
                  entryId: entry.id,
                  receiptLineId: request.receiptLineId,
                  qty: request.qty,
                  location: request.location,
                  createdBy: actorId,
                },
              });
            }
            await this.audit(tx, {
              tenantId,
              actorId,
              branchId: scope.writeBranchId,
              action: 'stock.draft',
              entityType: 'InventoryEntry',
              entityId: entry.id,
              newJson: JSON.stringify({ docNo: entry.docNo, lines: input.lines.length }),
            });
            return {
              id: entry.id,
              docNo: entry.docNo,
              status: 'DRAFT',
              quantity: input.lines.reduce((sum, line) => sum + line.qty, 0),
              warnings,
            };
          }
          let quantity = 0;
          let value = '0.00';
          for (const request of input.lines) {
            const place = placeByCode.get(request.location);
            if (!place) throw new DomainError('VALIDATION_ERROR', 400);
            const line = await tx.goodsReceiptLine.findFirst({
              where: { id: request.receiptLineId, tenantId },
              include: { product: { include: { category: true } }, receipt: { include: { purchase: true } } },
            });
            if (!line || line.receipt.branchId !== scope.writeBranchId) throw new DomainError('NOT_FOUND', 404);
            const received = line.qty + line.bonusQty;
            const candidate = {
              poStatus: line.receipt.purchase?.status ?? 'CANCELLED',
              receiptStatus: line.receipt.status,
              source: line.receipt.source,
              condition: line.condition,
              expiry: line.expiry.toISOString(),
              received,
              posted: line.postedQty,
            };
            if (!canStockReceipt(candidate, khartoumDate())) throw new DomainError('NOT_FOUND', 404);
            claimStockQty(received, line.postedQty, request.qty);
            if (line.serialNo) {
              const duplicate = await tx.stockLot.findFirst({ where: { tenantId, serialNo: line.serialNo } });
              if (duplicate) throw new DomainError('VALIDATION_ERROR', 400);
            }
            const warning = assertReceiptLine({
              expiry: line.expiry.toISOString(),
              manufacturedAt: line.manufacturedAt ? line.manufacturedAt.toISOString() : '',
              qty: request.qty,
              bonusQty: 0,
              serial: line.serialNo ?? '',
              trackSerial: Boolean(line.product.trackSerial && line.serialNo),
              today: khartoumDate(),
              warnMonths: shelf.warn,
            });
            const hint = [line.product.nameAr, line.product.nameEn, line.product.form, line.product.strength, line.product.category.nameAr, line.product.category.nameEn].join(' ');
            if (!placeCompatible(storageNeed(hint), request.location)) warnings.push(`${line.product.sku}:PLACE`);
            if (warning) warnings.push(`${line.product.sku}:${warning}`);
            const updated = await tx.goodsReceiptLine.updateMany({
              where: { id: line.id, tenantId, postedQty: line.postedQty },
              data: { postedQty: line.postedQty + request.qty },
            });
            if (updated.count !== 1) throw new DomainError('OVER_POST', 409);
            const lotId = randomUUID();
            await tx.stockLot.create({
              data: {
                id: lotId,
                tenantId,
                branchId: scope.writeBranchId,
                productId: line.productId,
                batchNo: line.batchNo,
                expiry: line.expiry,
                manufacturedAt: line.manufacturedAt,
                serialNo: line.serialNo,
                unitCode: line.unitCode,
                bonusQty: 0,
                qtyBase: request.qty,
                location: place.nameAr,
                condition: 'AVAILABLE',
                unitCost: line.unitCost,
                receiptLineId: line.id,
                createdBy: actorId,
              },
            });
            await tx.stockMovement.create({
              data: {
                tenantId,
                branchId: scope.writeBranchId,
                productId: line.productId,
                lotId,
                type: 'RECEIVE',
                qtyBase: request.qty,
                note: entry.docNo,
                refType: 'INVENTORY',
                refId: entry.id,
                createdBy: actorId,
              },
            });
            await tx.inventoryEntryLine.create({
              data: {
                tenantId,
                entryId: entry.id,
                receiptLineId: line.id,
                qty: request.qty,
                location: request.location,
                createdBy: actorId,
              },
            });
            await tx.product.update({
              where: { id: line.productId },
              data: { costPrice: line.unitCost },
            });
            quantity += request.qty;
            value = addMoney(value, mulMoney(cash(line.unitCost), String(request.qty)));
          }
          await tx.inventoryEntry.update({
            where: { id: entry.id },
            data: { status: 'POSTED', postedAt: new Date(), updatedBy: actorId },
          });
          await this.audit(tx, {
            tenantId,
            actorId,
            branchId: scope.writeBranchId,
            action: 'stock.post',
            entityType: 'InventoryEntry',
            entityId: entry.id,
            newJson: JSON.stringify({ docNo: entry.docNo, quantity, value }),
          });
          return { id: entry.id, docNo: entry.docNo, status: 'POSTED', quantity, warnings };
        });
      } catch (error) {
        last = error;
        if (uniqueConflict(error) && attempt < 2) continue;
        this.rethrow(error);
      }
    }
    this.rethrow(last);
  }

  async receiveStock(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    header: string | null,
    lines: ReceiveLine[],
  ) {
    void tenantId;
    void branchHint;
    void actorId;
    void header;
    void lines;
    throw new DomainError('NEED_PURCHASE', 400);
  }

  private async stockingSummary(tx: Tx, tenantId: string, branchId: string | null) {
    const branch = branchId ? { branchId } : {};
    const today = khartoumDate();
    const [orders, receipts, movements, lots] = await Promise.all([
      tx.purchaseOrder.findMany({ where: { tenantId, ...branch }, select: { status: true } }),
      tx.goodsReceipt.findMany({
        where: { tenantId, ...branch, source: 'PROCUREMENT' },
        include: {
          lines: { select: { qty: true, bonusQty: true, postedQty: true, condition: true, expiry: true } },
          purchase: { select: { status: true } },
        },
      }),
      tx.stockMovement.findMany({
        where: { tenantId, ...branch, type: 'RECEIVE', refType: 'INVENTORY', createdAt: { gte: khartoumDayStart() } },
        select: { productId: true, qtyBase: true },
      }),
      tx.stockLot.findMany({
        where: { tenantId, ...branch },
        select: { qtyBase: true, expiry: true, condition: true },
      }),
    ]);
    const lines = receipts.flatMap((receipt) =>
      receipt.lines.map((line) => ({
        poStatus: receipt.purchase?.status ?? 'CANCELLED',
        receiptStatus: receipt.status,
        source: 'PROCUREMENT',
        condition: line.condition,
        expiry: line.expiry.toISOString(),
        received: line.qty + line.bonusQty,
        posted: line.postedQty,
      })),
    );
    const availableQty = lots.reduce(
      (sum, lot) =>
        sum + (isSellableLot({ qtyBase: lot.qtyBase, expiry: lot.expiry.toISOString(), condition: lot.condition }, today) ? lot.qtyBase : 0),
      0,
    );
    const newlyStocked = new Set(movements.filter((row) => row.qtyBase > 0).map((row) => row.productId)).size;
    return { ...summarizeStocking({ orders, lines, today }), availableQty, newlyStocked };
  }

  private async ensurePlaces(tx: Tx, tenantId: string, branchId: string, actorId: string) {
    const found = await tx.storageLocation.findMany({ where: { tenantId, branchId, isDeleted: false }, orderBy: { code: 'asc' } });
    if (found.length > 0) return found;
    for (const place of STOCK_PLACES) {
      await tx.storageLocation.create({
        data: {
          tenantId,
          branchId,
          code: place.code,
          kind: place.kind,
          nameAr: place.nameAr,
          nameEn: place.nameEn,
          createdBy: actorId,
        },
      });
    }
    return tx.storageLocation.findMany({ where: { tenantId, branchId, isDeleted: false }, orderBy: { code: 'asc' } });
  }

  private async nextInventoryDoc(tx: Tx, tenantId: string): Promise<string> {
    const year = Number(khartoumDate().slice(0, 4));
    const prefix = `INV-${year}-`;
    await tx.$queryRaw`
      SELECT id FROM dbo.InventoryEntries WITH (UPDLOCK, HOLDLOCK)
      WHERE tenantId = CAST(${tenantId} AS uniqueidentifier) AND docNo LIKE ${`${prefix}%`}
    `;
    const rows = await tx.inventoryEntry.findMany({
      where: { tenantId, docNo: { startsWith: prefix } },
      select: { docNo: true },
    });
    let max = 0;
    for (const row of rows) {
      const seq = Number(row.docNo.slice(prefix.length));
      if (Number.isInteger(seq) && seq > max) max = seq;
    }
    return inventoryDocNo(year, max + 1);
  }

  private async stockDesk(
    tx: Tx,
    tenantId: string,
    scope: { writeBranchId: string; branches: { id: string; nameAr: string; nameEn: string | null }[] },
    actorId: string,
    entry: { id: string; docNo: string; status: string; lines: { receiptLineId: string; qty: number; location: string }[] } | null,
  ) {
    const branchId = scope.writeBranchId;
    const today = khartoumDate();
    const [places, user, receipts, lots, stocking] = await Promise.all([
      this.ensurePlaces(tx, tenantId, branchId, actorId),
      tx.user.findFirst({ where: { id: actorId, tenantId }, select: { displayName: true } }),
      tx.goodsReceipt.findMany({
        where: { tenantId, branchId, source: 'PROCUREMENT', status: 'POSTED' },
        include: {
          supplier: true,
          purchase: { select: { status: true, docNo: true } },
          lines: { include: { product: { include: { category: true } } } },
        },
      }),
      tx.stockLot.findMany({
        where: { tenantId, branchId },
        orderBy: { createdAt: 'desc' },
        select: { productId: true, location: true },
      }),
      this.stockingSummary(tx, tenantId, branchId),
    ]);
    const previous = new Map<string, string>();
    for (const lot of lots) {
      if (!previous.has(lot.productId)) previous.set(lot.productId, lot.location);
    }
    const branch = scope.branches.find((row) => row.id === branchId);
    const lines = [];
    for (const receipt of receipts) {
      for (const line of receipt.lines) {
        const received = line.qty + line.bonusQty;
        const candidate = {
          poStatus: receipt.purchase?.status ?? 'CANCELLED',
          receiptStatus: receipt.status,
          source: receipt.source,
          condition: line.condition,
          expiry: line.expiry.toISOString(),
          received,
          posted: line.postedQty,
        };
        if (!canStockReceipt(candidate, today)) continue;
        const hint = [
          line.product.nameAr,
          line.product.nameEn,
          line.product.genericName,
          line.product.form,
          line.product.strength,
          line.product.category.nameAr,
          line.product.category.nameEn,
          line.location,
        ].join(' ');
        lines.push({
          receiptLineId: line.id,
          productId: line.productId,
          sku: line.product.sku,
          nameAr: line.product.nameAr,
          nameEn: line.product.nameEn,
          genericName: line.product.genericName,
          strength: line.product.strength,
          form: line.product.form,
          pack: line.unitCode,
          barcode: line.product.gtin ?? '',
          categoryAr: line.product.category.nameAr,
          categoryEn: line.product.category.nameEn,
          supplierAr: receipt.supplier?.nameAr ?? '',
          supplierEn: receipt.supplier?.nameEn ?? '',
          purchaseDoc: receipt.purchase?.docNo ?? '',
          receiptDoc: receipt.docNo,
          batchNo: line.batchNo,
          expiry: line.expiry.toISOString().slice(0, 10),
          receivedQty: received,
          postedQty: line.postedQty,
          available: received - line.postedQty,
          unitCost: cash(line.unitCost),
          sellPrice: line.sellPrice ? cash(line.sellPrice) : cash(line.product.sellPrice),
          location: suggestPlace(hint, previous.get(line.productId) || normalizePlace(line.location)),
          storage: storageNeed(hint),
          receivedAt: receipt.receivedAt.toISOString(),
        });
      }
    }
    lines.sort((left, right) => left.nameAr.localeCompare(right.nameAr, 'ar') || left.batchNo.localeCompare(right.batchNo));
    return {
      id: entry?.id ?? null,
      docNo: entry?.docNo ?? '',
      status: entry?.status ?? 'DRAFT',
      date: today,
      branchAr: branch?.nameAr ?? '',
      branchEn: branch?.nameEn ?? branch?.nameAr ?? '',
      receiver: user?.displayName ?? '',
      locations: places.map((place) => ({ code: place.code, kind: place.kind, nameAr: place.nameAr, nameEn: place.nameEn })),
      lines,
      selected: (entry?.lines ?? []).map((line) => ({ receiptLineId: line.receiptLineId, qty: line.qty, location: line.location })),
      stocking,
    };
  }

  private async itemPacks(tx: Tx, tenantId: string, productIds: string[]): Promise<Map<string, ItemPack>> {
    const map = new Map<string, ItemPack>();
    if (productIds.length === 0) return map;
    const rows = await tx.pharmacySetting.findMany({
      where: { tenantId, key: { in: productIds.map((id) => `pack:${id}`) } },
    });
    for (const row of rows) {
      const pack = parseItemPack(row.valueEn);
      if (pack) map.set(row.key.slice(5), pack);
    }
    return map;
  }

  private async rememberPack(tx: Tx, tenantId: string, actorId: string, productId: string, pack: ItemPack): Promise<void> {
    if (piecesInContainer(pack) <= 1 && saleChoices(pack).length < 2) return;
    const json = JSON.stringify({ outer: pack.outer, inner: pack.inner, perBox: pack.perBox, perInner: pack.perInner });
    const key = `pack:${productId}`;
    const current = await tx.pharmacySetting.findFirst({ where: { tenantId, key } });
    if (!current) {
      await tx.pharmacySetting.create({ data: { tenantId, key, valueAr: json, valueEn: json, createdBy: actorId } });
      return;
    }
    await tx.pharmacySetting.update({ where: { id: current.id }, data: { valueAr: json, valueEn: json, updatedBy: actorId } });
  }

  private async shelfSettings(tx: Tx, tenantId: string): Promise<{ life: number; warn: number }> {
    const rows = await tx.pharmacySetting.findMany({
      where: { tenantId, key: { in: ['shelfLifeMonths', 'expiryWarnMonths'] } },
    });
    const life = Number(rows.find((row) => row.key === 'shelfLifeMonths')?.valueEn ?? '36');
    const warn = Number(rows.find((row) => row.key === 'expiryWarnMonths')?.valueEn ?? '6');
    return {
      life: Number.isFinite(life) && life > 0 ? life : 36,
      warn: Number.isFinite(warn) && warn >= 0 ? warn : 6,
    };
  }

  private async audit(
    tx: Tx,
    input: {
      tenantId: string;
      actorId: string;
      action: string;
      entityType: string;
      entityId: string;
      branchId?: string | null;
      oldJson?: string;
      newJson?: string;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        branchId: input.branchId ?? null,
        oldJson: input.oldJson ?? null,
        newJson: input.newJson ?? null,
        createdBy: input.actorId,
      },
    });
  }

  async requestCatalogItem(
    tenantId: string,
    actorId: string,
    branchId: string | null,
    input: {
      nameAr: string;
      nameEn: string;
      genericName: string;
      barcode: string;
      note: string;
      manufacturer?: string;
      strength?: string;
      packaging?: string;
      itemKind?: string;
      itemType?: string;
    },
  ) {
    const match = await findCommercialDuplicate(this.prisma.client, {
      nameEn: input.nameEn,
      genericName: input.genericName,
      strength: input.strength ?? '',
      dosageForm: '',
      manufacturer: input.manufacturer ?? '',
      barcode: input.barcode,
    });
    if (match) throw new DomainError('DUPLICATE_PRODUCT', 409, { fields: { nameEn: 'duplicate', matchId: match.id, matchCode: match.code } });
    return this.prisma.client.newCatalogItemRequest.create({
      data: {
        tenantId,
        branchId,
        requestedBy: actorId,
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        genericName: input.genericName,
        barcode: input.barcode,
        note: input.note,
        manufacturer: input.manufacturer ?? '',
        strength: input.strength ?? '',
        packaging: input.packaging ?? '',
        itemKind: input.itemKind === 'GENERIC' ? 'GENERIC' : 'BRAND',
        itemType: input.itemType || 'Medicine',
        status: 'PENDING',
      },
      select: { id: true, status: true },
    });
  }

  private rethrow(error: unknown): never {
    if (error instanceof DomainError) throw error;
    if (error instanceof MoneyError) throw new DomainError('VALIDATION_ERROR', 400, { hint: 'COST' });
    if (error instanceof Error && error.message in { STOCK_SHORT: 1, UNBALANCED: 1, QTY: 1, EXPIRED: 1, DATE_ORDER: 1, SERIAL: 1, OVER_RECEIVE: 1, OVER_POST: 1, NOT_ON_ORDER: 1, NEED_BATCH: 1, RATE: 1, COST: 1, PRICE: 1 }) {
      const code = error.message;
      const status = code === 'STOCK_SHORT' || code === 'OVER_POST' || code === 'OVER_RECEIVE' || code === 'NOT_ON_ORDER' ? 409 : 400;
      throw new DomainError(code, status);
    }
    throw error;
  }
}
