import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@dawaa/db';
import { addMoney, cmpMoney, money, MoneyError, mulMoney, subMoney } from '@dawaa/shared';
import { PasswordService } from '../auth/password.service';
import { DomainError } from '../http/domain-error';
import { PrismaService } from '../prisma/prisma.service';
import { plainMedicineName } from './medicine-name';
import { allocateFefo, assertJournalBalances, assertReceiptLine, balanceDelta, buildHome, khartoumDate, khartoumDayStart, nextPrice, parseCsv, priceListWorkflow, renewAmount, type PriceOp, type RenewAdjust } from './ops.logic';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

type MoneyRow = { toFixed(digits: number): string };

function cash(value: MoneyRow | string): string {
  return money(typeof value === 'string' ? value : value.toFixed(2));
}

async function ensureProducts(tx: Tx, tenantId: string, actorId: string, codes: string[]): Promise<number> {
  const standards = await tx.standardMedicine.findMany({ where: { code: { in: codes } } });
  let created = 0;
  for (const item of standards) {
    const existing = await tx.product.findFirst({ where: { tenantId, sku: item.code, isDeleted: false } });
    if (existing) continue;
    let category = await tx.category.findFirst({ where: { tenantId, nameEn: item.categoryEn, isDeleted: false } });
    if (!category) {
      category = await tx.category.create({
        data: { tenantId, nameAr: item.categoryAr, nameEn: item.categoryEn, createdBy: actorId },
      });
    }
    await tx.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        sku: item.code,
        nameAr: plainMedicineName(item.nameAr),
        nameEn: plainMedicineName(item.nameEn),
        genericName: plainMedicineName(item.genericName),
        form: item.form,
        strength: item.strength,
        reorderLevel: 10,
        sellPrice: '0.00',
        costPrice: '0.00',
        isLocal: false,
        masterCode: item.code,
        gtin: item.gtin || null,
        trackSerial: item.trackSerial,
        isControlled: item.isControlled,
        createdBy: actorId,
      },
    });
    created += 1;
  }
  return created;
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
  lines: { productId: string; qty: number }[];
};

export type PurchaseInput = {
  supplierId: string;
  lines: {
    productId?: string;
    code?: string;
    qty: number;
    unitCost: string;
    sellPrice?: string;
    batchNo: string;
    expiry: string;
    location: string;
    manufacturedAt?: string;
    serialNo?: string;
    bonusQty?: number;
    unitCode?: string;
  }[];
};

export type ReceiveLine = {
  productId?: string;
  code?: string;
  qty: number;
  unitCost: string;
  sellPrice?: string;
  batchNo: string;
  expiry: string;
  location: string;
  manufacturedAt?: string;
  serialNo?: string;
  bonusQty?: number;
  unitCode?: string;
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
      const [categories, products, lots] = await Promise.all([
        tx.category.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.stockLot.findMany({ where: scope.readBranchId ? { tenantId, branchId: scope.readBranchId } : { tenantId } }),
      ]);
      return {
        categories: categories.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn })),
        products: await this.withPrices(tx, tenantId, scope.readBranchId, products.map((product) => this.viewProduct(product, lots))),
        scope: { management: scope.management, all: scope.readBranchId === null },
      };
    });
  }

  async createProduct(tenantId: string, branchHint: string | null, actorId: string, header: string | null, input: ProductInput) {
    try {
      const sell = money(input.sellPrice);
      const cost = money(input.costPrice);
      const expiry = new Date(input.expiry);
      if (Number.isNaN(expiry.getTime())) throw new DomainError('VALIDATION_ERROR', 400);
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, header, true)).writeBranchId;
        const shelf = await this.shelfSettings(tx, tenantId);
        const warning = assertReceiptLine({
          expiry: input.expiry,
          manufacturedAt: input.manufacturedAt ?? '',
          qty: input.qtyBase,
          bonusQty: input.bonusQty ?? 0,
          serial: input.serialNo ?? '',
          trackSerial: false,
          today: khartoumDate(),
          warnMonths: shelf.warn,
        });
        const category = await tx.category.findFirst({ where: { id: input.categoryId, tenantId, isDeleted: false } });
        if (!category) throw new DomainError('NOT_FOUND', 404);
        const productId = randomUUID();
        const lotId = randomUUID();
        const sku = `P-${productId.slice(0, 8).toUpperCase()}`;
        await tx.product.create({
          data: {
            id: productId,
            tenantId,
            categoryId: category.id,
            sku,
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            genericName: input.genericName,
            form: input.form,
            strength: input.strength,
            reorderLevel: input.reorderLevel,
            sellPrice: sell,
            costPrice: cost,
            isLocal: true,
            createdBy: actorId,
          },
        });
        await tx.stockLot.create({
          data: {
            id: lotId,
            tenantId,
            branchId,
            productId,
            batchNo: input.batchNo,
            expiry,
            manufacturedAt: input.manufacturedAt ? new Date(input.manufacturedAt) : null,
            serialNo: input.serialNo?.trim() || null,
            bonusQty: input.bonusQty ?? 0,
            qtyBase: input.qtyBase + (input.bonusQty ?? 0),
            location: input.location,
            createdBy: actorId,
          },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId,
            productId,
            lotId,
            type: 'RECEIVE',
            qtyBase: input.qtyBase + (input.bonusQty ?? 0),
            note: input.nameAr,
            refType: 'PRODUCT',
            refId: productId,
            createdBy: actorId,
          },
        });
        const received = input.qtyBase + (input.bonusQty ?? 0);
        const total = mulMoney(cost, String(received));
        await this.postJournal(tx, tenantId, actorId, 'إدخال صنف', 'New product', [
          { code: '1200', debit: total, credit: '0.00' },
          { code: '1000', debit: '0.00', credit: total },
        ]);
        await this.audit(tx, {
          tenantId,
          actorId,
          branchId,
          action: 'product.create',
          entityType: 'Product',
          entityId: productId,
          newJson: JSON.stringify({ sku, isLocal: true }),
        });
        return { id: productId, sku, warning };
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
        tx.sale.findMany({ where: saleWhere, orderBy: { soldAt: 'desc' }, take: 30, include: { lines: true } }),
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.customer.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.stockLot.findMany({ where: lotWhere }),
      ]);
      return {
        products: await this.withPrices(tx, tenantId, scope.readBranchId, products.map((product) => this.viewProduct(product, lots))),
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
        let subtotal = '0.00';
        let cost = '0.00';
        const priced = input.lines.map((line) => {
          const product = byId.get(line.productId);
          if (!product) throw new DomainError('NOT_FOUND', 404);
          const quote = priceMap.get(product.id);
          const unitPrice = quote?.amount ?? cash(product.sellPrice);
          if (cmpMoney(unitPrice, '0.00') <= 0) throw new DomainError('VALIDATION_ERROR', 400);
          const lineTotal = mulMoney(unitPrice, String(line.qty));
          const costTotal = mulMoney(cash(product.costPrice), String(line.qty));
          subtotal = addMoney(subtotal, lineTotal);
          cost = addMoney(cost, costTotal);
          return { product, qty: line.qty, lineTotal, costTotal, unitPrice, quote };
        });
        if (cmpMoney(discount, subtotal) > 0) throw new DomainError('VALIDATION_ERROR', 400);
        const total = subMoney(subtotal, discount);
        if (cmpMoney(paid, total) < 0) throw new DomainError('VALIDATION_ERROR', 400);
        const saleId = randomUUID();
        const docNo = `S-${saleId.slice(0, 8).toUpperCase()}`;
        for (const line of priced) {
          await this.takeStock(tx, tenantId, branchId, actorId, line.product.id, line.qty, 'SALE', saleId, docNo);
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
              nameAr: line.product.nameAr,
              nameEn: line.product.nameEn,
              qty: line.qty,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              costTotal: line.costTotal,
              unitCost: cash(line.product.costPrice),
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
        return { id: saleId, docNo, total, changeDue: subMoney(paid, total) };
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  purchasing(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const [orders, suppliers, products] = await Promise.all([
        tx.purchaseOrder.findMany({
          where: scope.readBranchId ? { tenantId, branchId: scope.readBranchId } : { tenantId },
          orderBy: { orderedAt: 'desc' },
          take: 30,
          include: { lines: { include: { product: true } }, supplier: true },
        }),
        tx.supplier.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
        tx.product.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
      ]);
      return {
        suppliers: suppliers.map((row) => ({
          id: row.id,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          phone: row.phone,
          city: row.city,
          balance: cash(row.balance),
        })),
        products: products.map((row) => ({
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
        orders: orders.map((order) => ({
          id: order.id,
          docNo: order.docNo,
          status: order.status,
          total: cash(order.total),
          orderedAt: order.orderedAt.toISOString(),
          supplierAr: order.supplier.nameAr,
          supplierEn: order.supplier.nameEn,
          lines: order.lines.map((line) => ({
            qty: line.qty,
            lineTotal: cash(line.lineTotal),
            productId: line.productId,
            nameAr: line.product.nameAr,
            nameEn: line.product.nameEn,
          })),
        })),
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
        const shelf = await this.shelfSettings(tx, tenantId);
        const warnings: string[] = [];
        let total = '0.00';
        const lines = readyLines.map((line) => {
          const product = byId.get(line.productId);
          if (!product) throw new DomainError('NOT_FOUND', 404);
          const unitCost = money(line.unitCost);
          const bonus = line.bonusQty ?? 0;
          const lineTotal = mulMoney(unitCost, String(line.qty + bonus));
          total = addMoney(total, lineTotal);
          const expiry = new Date(line.expiry);
          if (Number.isNaN(expiry.getTime())) throw new DomainError('VALIDATION_ERROR', 400);
          const warning = assertReceiptLine({
            expiry: line.expiry,
            manufacturedAt: line.manufacturedAt ?? '',
            qty: line.qty,
            bonusQty: bonus,
            serial: line.serialNo ?? '',
            trackSerial: product.trackSerial,
            today: khartoumDate(),
            warnMonths: shelf.warn,
          });
          if (warning) warnings.push(`${product.sku}:${warning}`);
          return { ...line, unitCost, lineTotal, expiry, bonus, product };
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
            status: 'RECEIVED',
            total,
            orderedAt: new Date(),
            createdBy: actorId,
          },
        });
        for (const line of lines) {
          const lotId = randomUUID();
          await tx.purchaseLine.create({
            data: {
              tenantId,
              purchaseId,
              productId: line.productId,
              qty: line.qty,
              unitCost: line.unitCost,
              lineTotal: line.lineTotal,
              createdBy: actorId,
            },
          });
          await tx.stockLot.create({
            data: {
              id: lotId,
              tenantId,
              branchId,
              productId: line.productId,
              batchNo: line.batchNo,
              expiry: line.expiry,
              manufacturedAt: line.manufacturedAt ? new Date(line.manufacturedAt) : null,
              serialNo: line.serialNo?.trim() || null,
              unitCode: line.unitCode || 'BASE',
              bonusQty: line.bonus,
              qtyBase: line.qty + line.bonus,
              location: line.location,
              createdBy: actorId,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              branchId,
              productId: line.productId,
              lotId,
              type: 'RECEIVE',
              qtyBase: line.qty + line.bonus,
              note: docNo,
              refType: 'PURCHASE',
              refId: purchaseId,
              createdBy: actorId,
            },
          });
          await tx.product.update({
            where: { id: line.productId },
            data: {
              costPrice: line.unitCost,
              ...(line.sellPrice ? { sellPrice: money(line.sellPrice) } : {}),
            },
          });
        }
        await tx.supplier.update({
          where: { id: supplier.id },
          data: { balance: addMoney(cash(supplier.balance), total) },
        });
        await this.postJournal(tx, tenantId, actorId, `استلام ${docNo}`, `Receipt ${docNo}`, [
          { code: '1200', debit: total, credit: '0.00' },
          { code: '2000', debit: '0.00', credit: total },
        ]);
        await this.audit(tx, {
          tenantId,
          actorId,
          branchId,
          action: 'purchase.receive',
          entityType: 'PurchaseOrder',
          entityId: purchaseId,
          newJson: JSON.stringify({ docNo, total }),
        });
        return { id: purchaseId, docNo, total, warnings };
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
    input: { displayName: string; email: string; password: string; roleCode: string; branchId?: string },
  ) {
    const passwordHash = await this.passwords.hash(input.password);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const branchId = input.branchId
        ? (await this.access(tx, tenantId, actorId, input.branchId, input.branchId, true)).writeBranchId
        : (await this.access(tx, tenantId, actorId, branchHint, null, true)).writeBranchId;
      const role = await tx.role.findFirst({ where: { tenantId, code: input.roleCode, isDeleted: false } });
      if (!role) throw new DomainError('VALIDATION_ERROR', 400);
      const existing = await tx.user.findFirst({ where: { tenantId, email: input.email, isDeleted: false } });
      if (existing) throw new DomainError('VALIDATION_ERROR', 400);
      const userId = randomUUID();
      await tx.user.create({
        data: {
          id: userId,
          tenantId,
          email: input.email,
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
      ];
      for (const item of defaults) {
        const found = await tx.pharmacySetting.findFirst({ where: { tenantId, key: item.key } });
        if (!found) await tx.pharmacySetting.create({ data: { tenantId, ...item } });
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

  saveSetting(tenantId: string, input: { key: string; valueAr: string; valueEn: string }) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.pharmacySetting.findFirst({ where: { tenantId, key: input.key } });
      if (!current) throw new DomainError('NOT_FOUND', 404);
      await tx.pharmacySetting.update({
        where: { id: current.id },
        data: { valueAr: input.valueAr, valueEn: input.valueEn },
      });
      return { ok: true };
    });
  }

  reports(tenantId: string, userId: string, jwtBranch: string | null, header: string | null) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scope = await this.access(tx, tenantId, userId, jwtBranch, header, false);
      const start = khartoumDayStart();
      const branch = scope.readBranchId ? { branchId: scope.readBranchId } : {};
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
        products.map((product) => this.viewProduct(product, lots)),
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
          })),
        }),
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
    lots: { productId: string; qtyBase: number; expiry: Date; location: string }[],
  ): ProductView {
    const mine = lots.filter((lot) => lot.productId === product.id);
    const qty = mine.reduce((sum, lot) => sum + lot.qtyBase, 0);
    const withQty = mine.filter((lot) => lot.qtyBase > 0).sort((left, right) => left.expiry.getTime() - right.expiry.getTime());
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

  catalog(tenantId: string, query: string | null) {
    const needle = (query ?? '').trim();
    return this.prisma.withTenant(tenantId, async (tx) => {
      const standards = await tx.standardMedicine.findMany({
        where: needle
          ? {
              OR: [
                { code: { contains: needle } },
                { nameAr: { contains: needle } },
                { nameEn: { contains: needle } },
                { genericName: { contains: needle } },
                { gtin: { contains: needle } },
                { strength: { contains: needle } },
              ],
            }
          : {},
        orderBy: { nameEn: 'asc' },
        take: needle ? 24 : 30,
      });
      if (standards.length === 0) return [];
      const codes = standards.map((item) => item.code);
      const gtins = standards.map((item) => item.gtin).filter((value) => value !== '');
      const products = await tx.product.findMany({
        where: {
          tenantId,
          isDeleted: false,
          OR: [
            { sku: { in: codes } },
            { masterCode: { in: codes } },
            ...(gtins.length > 0 ? [{ gtin: { in: gtins } }] : []),
          ],
        },
        select: { sku: true, masterCode: true, gtin: true },
      });
      const imported = new Set(products.flatMap((product) => [product.sku, product.masterCode ?? '', product.gtin ?? '']));
      const stored = await tx.globalCatalogItem.findMany({
        where: {
          OR: [
            { code: { in: codes } },
            ...(gtins.length > 0 ? [{ barcodes: { some: { code: { in: gtins } } } }] : []),
          ],
        },
        select: { code: true, storageCondition: true, barcodes: { select: { code: true } } },
      });
      const storageOf = (code: string, gtin: string) =>
        stored.find((row) => row.code === code)?.storageCondition ||
        stored.find((row) => gtin !== '' && row.barcodes.some((barcode) => barcode.code === gtin))?.storageCondition ||
        '';
      return standards.map((item) => ({
          code: item.code,
          nameAr: plainMedicineName(item.nameAr),
          nameEn: plainMedicineName(item.nameEn),
          genericName: plainMedicineName(item.genericName),
          form: item.form,
          strength: item.strength,
          categoryAr: item.categoryAr,
          categoryEn: item.categoryEn,
          gtin: item.gtin,
          unitsJson: item.unitsJson,
          packDescription: item.packDescription,
          manufacturer: item.manufacturer,
          route: item.route,
          ingredients: item.ingredients,
          status: item.status,
          isControlled: item.isControlled,
          requiresPrescription: item.requiresPrescription,
          trackSerial: item.trackSerial,
          storageCondition: storageOf(item.code, item.gtin),
          imported: imported.has(item.code) || (item.gtin !== '' && imported.has(item.gtin)),
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
      const shared = lists.find((list) => list.scope === 'PHARMACY' && list.isActive) ?? null;
      const branchActivation = scope.readBranchId
        ? (activations.find((row) => row.branchId === scope.readBranchId && row.isActive) ?? null)
        : null;
      const selectedId = listId ?? branchActivation?.priceListId ?? shared?.id ?? lists[0]?.id ?? null;
      const amounts =
        selectedId === null
          ? []
          : await tx.productPrice.findMany({ where: { tenantId, priceListId: selectedId } });
      const amountByProduct = new Map(amounts.map((row) => [row.productId, cash(row.amount)]));
      return {
        using: branchActivation ? 'BRANCH' : 'PHARMACY',
        branchId: scope.readBranchId,
        selectedId,
        lists: lists.map((list) => {
          const link = activations.find((row) => row.priceListId === list.id);
          const branchSelected = scope.readBranchId !== null;
          const canActivateHere =
            list.scope === 'PHARMACY'
              ? branchSelected
              : Boolean(branchSelected && link && link.branchId === scope.readBranchId);
          const isSelling =
            list.scope === 'PHARMACY'
              ? list.status === 'ACTIVE' && list.isActive
              : Boolean(link?.isActive && scope.readBranchId && link.branchId === scope.readBranchId);
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
            sourceNameAr: source?.nameAr ?? null,
            sourceNameEn: source?.nameEn ?? null,
            branchId: link?.branchId ?? null,
            branchAr: link?.branch.nameAr ?? null,
            branchEn: link?.branch.nameEn ?? null,
          };
        }),
        items: products.map((product) => ({
          productId: product.id,
          sku: product.sku,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          genericName: product.genericName,
          gtin: product.gtin ?? '',
          cost: cash(product.costPrice),
          costUsd: product.costUsd ? cash(product.costUsd) : '',
          amount: amountByProduct.get(product.id) ?? '',
        })),
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
      if (list.scope === 'PHARMACY') {
        await tx.priceList.updateMany({
          where: { tenantId, scope: 'PHARMACY', listType: list.listType, status: 'ACTIVE' },
          data: { isActive: false, status: 'ARCHIVED', effectiveTo: now },
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

  async createBranch(
    tenantId: string,
    actorId: string,
    input: { nameAr: string; nameEn: string; city: string; phone: string },
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
    branches: { id: string; code: string; nameAr: string; nameEn: string | null; isHeadOffice: boolean; city: string | null }[];
  }> {
    const [branches, links, mode, tenant] = await Promise.all([
      tx.branch.findMany({ where: { tenantId, isDeleted: false }, orderBy: { createdAt: 'asc' } }),
      tx.userBranchRole.findMany({ where: { tenantId, userId }, include: { role: true } }),
      tx.pharmacySetting.findFirst({ where: { tenantId, key: 'management' } }),
      tx.tenant.findFirst({ where: { id: tenantId } }),
    ]);
    const canViewAll = links.some((link) => link.role.code === 'OWNER');
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

  private async priceQuote(
    tx: Tx,
    tenantId: string,
    branchId: string | null,
    productIds: string[],
  ): Promise<Map<string, { amount: string; listId: string; version: number }>> {
    const map = new Map<string, { amount: string; listId: string; version: number }>();
    if (productIds.length === 0) return map;
    const shared = await tx.priceList.findFirst({ where: { tenantId, scope: 'PHARMACY', isActive: true, status: 'ACTIVE' } });
    let listId = shared?.id ?? null;
    if (branchId) {
      const activation = await tx.branchPriceActivation.findFirst({
        where: { tenantId, branchId, isActive: true },
      });
      if (activation) listId = activation.priceListId;
    }
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
    const takes = allocateFefo(
      lots.map((lot) => ({ id: lot.id, qtyBase: lot.qtyBase, expiry: lot.expiry.toISOString() })),
      qty,
      khartoumDate(),
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

  async copyPriceList(
    tenantId: string,
    actorId: string,
    priceListId: string,
    adjust: RenewAdjust = 'SAME',
    value = '0.00',
  ) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const scope = await this.access(tx, tenantId, actorId, null, null, false);
        if (!scope.canViewAll) throw new DomainError('UNAUTHORIZED', 403);
        const source = await tx.priceList.findFirst({ where: { id: priceListId, tenantId } });
        if (!source) throw new DomainError('NOT_FOUND', 404);
        const id = randomUUID();
        const link = await tx.branchPriceActivation.findFirst({ where: { tenantId, priceListId: source.id } });
        await tx.priceList.create({
          data: {
            id,
            tenantId,
            nameAr: `${source.nameAr} ${source.versionNo + 1}`,
            nameEn: `${source.nameEn} ${source.versionNo + 1}`,
            scope: source.scope,
            isActive: false,
            code: id.slice(0, 8).toUpperCase(),
            listType: source.listType,
            status: 'DRAFT',
            versionNo: source.versionNo + 1,
            sourcePriceListId: source.id,
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
          await tx.productPrice.create({
            data: {
              tenantId,
              priceListId: id,
              productId: row.productId,
              amount: renewAmount(cash(row.amount), adjust, value),
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
      return rows.map((row) => ({ id: row.id, currency: row.currency, rate: cash(row.rate), notedAt: row.notedAt.toISOString() }));
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
    const forms = new Set((await this.prisma.client.dosageForm.findMany()).map((row) => row.code));
    const seen = new Set<string>();
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      if (!row.code || !row.nameAr || !row.nameEn || !row.genericName || !row.form) {
        errors.push(row.code || '?');
        continue;
      }
      if (!forms.has(row.form)) {
        errors.push(`${row.code}:form`);
        continue;
      }
      if (seen.has(row.code)) {
        errors.push(`${row.code}:duplicate`);
        continue;
      }
      seen.add(row.code);
      const gtin = row.gtin?.trim() ?? '';
      const existing =
        (await this.prisma.client.standardMedicine.findFirst({ where: { code: row.code } })) ??
        (gtin ? await this.prisma.client.standardMedicine.findFirst({ where: { gtin } }) : null);
      const data = {
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        genericName: row.genericName,
        form: row.form,
        strength: row.strength || '',
        categoryAr: row.categoryAr || 'عام',
        categoryEn: row.categoryEn || 'General',
        gtin,
        manufacturer: row.manufacturer ?? '',
        ingredients: row.ingredients ?? row.genericName,
        status: 'PUBLISHED',
      };
      if (existing) {
        await this.prisma.client.standardMedicine.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await this.prisma.client.standardMedicine.create({ data: { code: row.code, ...data } });
        created += 1;
      }
    }
    return { created, updated, errors };
  }

  async receiveStock(
    tenantId: string,
    branchHint: string | null,
    actorId: string,
    header: string | null,
    lines: ReceiveLine[],
  ) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const branchId = (await this.access(tx, tenantId, actorId, branchHint, header, true)).writeBranchId;
        const shelf = await this.shelfSettings(tx, tenantId);
        const warnings: string[] = [];
        let quantity = 0;
        let value = '0.00';
        for (const line of lines) {
          let product = line.productId
            ? await tx.product.findFirst({ where: { id: line.productId, tenantId, isDeleted: false } })
            : null;
          if (!product && line.code) {
            await ensureProducts(tx, tenantId, actorId, [line.code]);
            product = await tx.product.findFirst({ where: { tenantId, sku: line.code, isDeleted: false } });
          }
          if (!product) throw new DomainError('NOT_FOUND', 404);
          await tx.product.update({
            where: { id: product.id },
            data: {
              costPrice: money(line.unitCost),
              ...(line.sellPrice ? { sellPrice: money(line.sellPrice) } : {}),
            },
          });
          const bonus = line.bonusQty ?? 0;
          const warning = assertReceiptLine({
            expiry: line.expiry,
            manufacturedAt: line.manufacturedAt ?? '',
            qty: line.qty,
            bonusQty: bonus,
            serial: line.serialNo ?? '',
            trackSerial: product.trackSerial,
            today: khartoumDate(),
            warnMonths: shelf.warn,
          });
          if (line.serialNo?.trim()) {
            const duplicate = await tx.stockLot.findFirst({ where: { tenantId, serialNo: line.serialNo.trim() } });
            if (duplicate) throw new DomainError('VALIDATION_ERROR', 400);
          }
          if (warning) warnings.push(`${product.sku}:${warning}`);
          const expiry = new Date(line.expiry);
          const lotId = randomUUID();
          const received = line.qty + bonus;
          await tx.stockLot.create({
            data: {
              id: lotId,
              tenantId,
              branchId,
              productId: product.id,
              batchNo: line.batchNo,
              expiry,
              manufacturedAt: line.manufacturedAt ? new Date(line.manufacturedAt) : null,
              serialNo: line.serialNo?.trim() || null,
              unitCode: line.unitCode || 'BASE',
              bonusQty: bonus,
              qtyBase: received,
              location: line.location,
              createdBy: actorId,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              branchId,
              productId: product.id,
              lotId,
              type: 'RECEIVE',
              qtyBase: received,
              note: line.batchNo,
              refType: 'OPENING',
              refId: product.id,
              createdBy: actorId,
            },
          });
          quantity += received;
          value = addMoney(value, mulMoney(money(line.unitCost), String(received)));
        }
        await this.audit(tx, {
          tenantId,
          actorId,
          branchId,
          action: 'stock.receive',
          entityType: 'StockMovement',
          entityId: branchId,
          newJson: JSON.stringify({ lines: lines.length, quantity }),
        });
        return { lines: lines.length, quantity, value, warnings };
      });
    } catch (error) {
      this.rethrow(error);
    }
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

  requestCatalogItem(
    tenantId: string,
    actorId: string,
    branchId: string | null,
    input: { nameAr: string; nameEn: string; genericName: string; barcode: string; note: string },
  ) {
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
        status: 'PENDING',
      },
      select: { id: true, status: true },
    });
  }

  private rethrow(error: unknown): never {
    if (error instanceof DomainError) throw error;
    if (error instanceof MoneyError) throw new DomainError('VALIDATION_ERROR', 400);
    if (
      error instanceof Error &&
      (error.message === 'STOCK_SHORT' ||
        error.message === 'UNBALANCED' ||
        error.message === 'QTY' ||
        error.message === 'EXPIRED' ||
        error.message === 'DATE_ORDER' ||
        error.message === 'SERIAL')
    ) {
      const status = error.message === 'STOCK_SHORT' ? 409 : 400;
      const code = error.message === 'QTY' || error.message === 'EXPIRED' || error.message === 'DATE_ORDER' || error.message === 'SERIAL'
        ? 'VALIDATION_ERROR'
        : error.message;
      throw new DomainError(code, status);
    }
    throw error;
  }
}
