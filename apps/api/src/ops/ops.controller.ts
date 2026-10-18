import { Body, Controller, Get, Header, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { DomainError } from '../http/domain-error';
import { ZodValidationPipe } from '../http/zod.pipe';
import { OpsService } from './ops.service';

const moneyText = z.string().trim().regex(/^\d+(\.\d{1,2})?$/);
const optionalBatch = z
  .string()
  .trim()
  .max(64)
  .optional()
  .default('')
  .transform((value) => {
    const text = value.trim();
    if (!text || text.toUpperCase() === 'OPEN') return 'N/A';
    return text;
  });
const optionalMoney = z.union([moneyText, z.literal('')]).optional().default('');
const uuid = z.string().uuid();

const productSchema = z.object({
  categoryId: uuid,
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  genericName: z.string().trim().min(1).max(200),
  form: z.string().trim().min(1).max(80),
  strength: z.string().trim().min(1).max(80),
  reorderLevel: z.number().int().nonnegative(),
  sellPrice: moneyText,
  costPrice: moneyText,
  batchNo: optionalBatch,
  expiry: z.string().min(8),
  qtyBase: z.number().int().positive(),
  location: z.string().trim().min(1).max(100),
  manufacturedAt: z.string().optional().default(''),
  serialNo: z.string().trim().max(64).optional().default(''),
  bonusQty: z.number().int().nonnegative().optional().default(0),
});

const adjustSchema = z.object({
  productId: uuid,
  qtyDelta: z.number().int().min(-100000).max(100000),
  note: z.string().trim().min(1).max(300),
});

const itemPackSchema = z.object({
  outer: z.enum(['BOX', 'STRIP', 'BOTTLE', 'PIECE']),
  inner: z.enum(['STRIP', 'BOTTLE', 'PIECE']),
  perBox: z.number().int().min(1).max(10_000),
  perInner: z.number().int().min(1).max(10_000),
});

const saleSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  discount: moneyText,
  paid: moneyText,
  hold: z.boolean().optional(),
  paymentMethod: z.enum(['CASH', 'BANKAK', 'FAWRY', 'TRANSFER']),
  lines: z
    .array(
      z.object({
        productId: uuid,
        qty: z.number().int().positive(),
        unit: z.enum(['BOX', 'STRIP', 'BOTTLE', 'PIECE']).optional(),
      }),
    )
    .min(1)
    .max(40),
});

const stockLine = {
  qty: z.number().int().positive().max(1_000_000),
  unitCost: moneyText,
  batchNo: optionalBatch,
  expiry: z.string().min(8),
  location: z.string().trim().min(1).max(100),
  manufacturedAt: z.string().optional().default(''),
  serialNo: z.string().trim().max(64).optional().default(''),
  bonusQty: z.number().int().nonnegative().optional().default(0),
  rejectedQty: z.number().int().nonnegative().optional().default(0),
  unitCode: z.string().trim().max(32).optional().default('BASE'),
  pack: itemPackSchema.optional(),
};

const purchaseSchema = z.object({
  supplierId: uuid,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional().default('NORMAL'),
  notes: z.string().trim().max(400).optional().default(''),
  lines: z
    .array(
      z
        .object({
          productId: uuid.optional(),
          code: z.string().trim().max(64).optional().default(''),
          qty: z.number().int().positive().max(1_000_000),
          unitCost: optionalMoney,
          sellPrice: optionalMoney,
          unitCode: z.string().trim().max(16).optional(),
          pack: itemPackSchema.optional(),
        })
        .refine((line) => Boolean(line.productId) || line.code.length > 0),
    )
    .min(1)
    .max(200),
});

const goodsReceiptSchema = z.object({
  clientKey: uuid,
  purchaseId: uuid.optional(),
  opening: z.boolean().optional().default(false),
  override: z.boolean().optional().default(false),
  supplierInvoice: z.string().trim().max(64).optional().default(''),
  currency: z.enum(['SDG', 'USD']).optional().default('SDG'),
  discount: optionalMoney,
  tax: optionalMoney,
  charges: optionalMoney,
  post: z.boolean(),
  lines: z
    .array(
      z
        .object({
          productId: uuid.optional(),
          code: z.string().trim().max(64).optional().default(''),
          sellPrice: optionalMoney,
          condition: z.enum(['AVAILABLE', 'REJECTED', 'QUARANTINE', 'DAMAGED']).optional().default('AVAILABLE'),
          ...stockLine,
        })
        .refine((line) => Boolean(line.productId) || line.code.length > 0),
    )
    .min(1)
    .max(200),
});

const inventoryEntrySchema = z
  .object({
    clientKey: uuid,
    post: z.boolean(),
    lines: z
      .array(
        z.object({
          receiptLineId: uuid,
          qty: z.number().int().positive().max(1_000_000),
          location: z.string().trim().min(1).max(32),
        }),
      )
      .max(200),
  })
  .superRefine((value, ctx) => {
    if (value.post && value.lines.length < 1) ctx.addIssue({ code: 'custom', message: 'lines', path: ['lines'] });
    if (new Set(value.lines.map((line) => line.receiptLineId)).size !== value.lines.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate', path: ['lines'] });
    }
  });

const receiveSchema = z.object({
  lines: z
    .array(
      z
        .object({
          productId: uuid.optional(),
          code: z.string().trim().max(64).optional().default(''),
          sellPrice: optionalMoney,
          ...stockLine,
        })
        .refine((line) => Boolean(line.productId) || line.code.length > 0),
    )
    .min(1)
    .max(200),
});

const expenseSchema = z.object({
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().min(1).max(200),
  amount: moneyText,
});

const supplierSchema = z.object({
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(20).default(''),
  city: z.string().trim().max(100).default(''),
  batchNotes: z.string().trim().max(400).optional().default(''),
});

const branchSchema = z.object({
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  addressLine: z.string().trim().min(2).max(300),
  phone: z.string().trim().max(20).default(''),
  latitude: z.number().gte(8.4).lte(22.3),
  longitude: z.number().gte(21.7).lte(38.7),
});

const managementSchema = z.object({
  management: z.enum(['INDEPENDENT', 'SHARED']),
});

const userSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  email: z.union([z.string().trim().email().max(320), z.literal('')]).optional().default(''),
  phone: z.string().trim().min(6).max(20),
  password: z.string().min(10).max(200),
  branchId: z.string().uuid().optional(),
  roleCode: z.enum([
    'OWNER',
    'BRANCH_MANAGER',
    'PHARMACIST',
    'ASSISTANT_PHARMACIST',
    'CASHIER',
    'STOREKEEPER',
    'ACCOUNTANT',
  ]),
});

const activeSchema = z.object({ isActive: z.boolean() });

const importSchema = z.object({
  codes: z.array(z.string().trim().min(1).max(64)).min(1).max(80),
});

const priceLineSchema = z.object({
  code: z.string().trim().min(1).max(64),
  amount: moneyText,
});

const priceListSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  scope: z.enum(['PHARMACY', 'BRANCH']),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(priceLineSchema).max(500).optional().default([]),
});

const priceBatchSchema = z.object({
  priceListId: uuid,
  items: z.array(z.object({
    productId: uuid.optional(),
    code: z.string().trim().min(1).max(64).optional(),
    amount: moneyText,
  }).refine((row) => Boolean(row.productId || row.code))).min(1).max(500),
});

const priceItemSchema = z.object({
  priceListId: uuid,
  productId: uuid,
  amount: moneyText,
});

const activatePriceSchema = z.object({
  priceListId: uuid,
  useShared: z.boolean(),
});

const settingSchema = z.object({
  key: z.string().trim().min(1).max(64),
  valueAr: z.string().trim().min(1).max(400),
  valueEn: z.string().trim().min(1).max(400),
});

@ApiTags('operations')
@Controller('ops')
@UseGuards(AuthGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('inventory')
  inventory(@Req() request: AuthenticatedRequest) {
    return this.ops.inventory(this.tenant(request), this.actor(request), this.branch(request), this.header(request));
  }

  @Post('products')
  createProduct(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(productSchema)) body: z.infer<typeof productSchema>) {
    return this.ops.createProduct(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body);
  }

  @Post('stock/adjust')
  adjust(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(adjustSchema)) body: z.infer<typeof adjustSchema>) {
    return this.ops.adjustStock(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body);
  }

  @Get('sales')
  sales(@Req() request: AuthenticatedRequest) {
    return this.ops.sales(this.tenant(request), this.actor(request), this.branch(request), this.header(request));
  }

  @Get('sales/waiting')
  waitingSales(@Req() request: AuthenticatedRequest) {
    return this.ops.waitingSales(this.tenant(request), this.actor(request), this.branch(request), this.header(request));
  }

  @Post('sales')
  createSale(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(saleSchema)) body: z.infer<typeof saleSchema>) {
    return this.ops.createSale(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body);
  }

  @Post('sales/receive')
  receiveSale(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({
      saleId: uuid,
      paid: moneyText,
      paymentMethod: z.enum(['CASH', 'BANKAK', 'FAWRY', 'TRANSFER']),
    })))
    body: { saleId: string; paid: string; paymentMethod: string },
  ) {
    return this.ops.receiveSale(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body);
  }

  @Get('purchasing')
  purchasing(@Req() request: AuthenticatedRequest) {
    return this.ops.purchasing(this.tenant(request), this.actor(request), this.branch(request), this.header(request));
  }

  @Post('purchases')
  createPurchase(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(purchaseSchema)) body: z.infer<typeof purchaseSchema>,
  ) {
    return this.ops.createPurchase(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body);
  }

  @Get('finance')
  finance(@Req() request: AuthenticatedRequest) {
    return this.ops.finance(this.tenant(request));
  }

  @Post('expenses')
  createExpense(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(expenseSchema)) body: z.infer<typeof expenseSchema>,
  ) {
    return this.ops.createExpense(this.tenant(request), this.branch(request), this.actor(request), body);
  }

  @Get('users')
  users(@Req() request: AuthenticatedRequest) {
    return this.ops.users(this.tenant(request));
  }

  @Post('users')
  createUser(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(userSchema)) body: z.infer<typeof userSchema>) {
    return this.ops.createUser(this.tenant(request), this.branch(request), this.actor(request), body);
  }

  @Post('users/:id/active')
  setActive(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(activeSchema)) body: z.infer<typeof activeSchema>,
  ) {
    return this.ops.setUserActive(this.tenant(request), this.actor(request), id, body.isActive);
  }

  @Get('settings')
  settings(@Req() request: AuthenticatedRequest) {
    return this.ops.settings(this.tenant(request));
  }

  @Put('settings')
  saveSetting(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(settingSchema)) body: z.infer<typeof settingSchema>,
  ) {
    return this.ops.saveSetting(this.tenant(request), this.actor(request), body);
  }

  @Get('reports')
  reports(@Req() request: AuthenticatedRequest) {
    return this.ops.reports(this.tenant(request), this.actor(request), this.branch(request), this.header(request));
  }

  @Get('reports/table')
  reportTable(
    @Req() request: AuthenticatedRequest,
    @Query('kind') kind = 'sales',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ops.reportTable(
      this.tenant(request),
      this.actor(request),
      this.branch(request),
      this.header(request),
      kind,
      from ?? null,
      to ?? null,
    );
  }

  @Get('reports/export.xlsx')
  @Header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async reportXlsx(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Query('kind') kind = 'sales',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const table = await this.ops.reportTable(
      this.tenant(request),
      this.actor(request),
      this.branch(request),
      this.header(request),
      kind,
      from ?? null,
      to ?? null,
    );
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(kind.slice(0, 31));
    sheet.addRow([table.titleAr, table.accountCode, `${table.from} → ${table.to}`]);
    sheet.addRow(table.columns.map((column) => column.labelAr));
    const header = sheet.getRow(2);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7EDE4' } };
    for (const row of table.rows) {
      const values = table.columns.map((column) => {
        const value = row[column.key];
        if (column.kind === 'number') return Number(value);
        if (column.kind === 'money') return Number(value);
        return value;
      });
      sheet.addRow(values);
    }
    sheet.addRow(['', '', table.total]);
    const arabic = (request.header('accept-language') ?? '').toLowerCase().includes('ar');
    sheet.views = [{ state: 'frozen', ySplit: 2, rightToLeft: arabic }];
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: table.columns.length } };
    table.columns.forEach((column, index) => {
      const cell = sheet.getColumn(index + 1);
      cell.width = Math.max(14, column.labelAr.length + 4);
      if (column.kind === 'money') cell.numFmt = '#,##0.00';
    });
    response.setHeader('content-disposition', `attachment; filename="dawaa-${kind}.xlsx"`);
    await book.xlsx.write(response);
    response.end();
  }

  @Get('catalog')
  catalog(@Req() request: AuthenticatedRequest, @Query('q') q?: string) {
    return this.ops.catalog(this.tenant(request), q ?? null);
  }

  @Get('dosage-forms')
  dosageForms() {
    return this.ops.dosageForms();
  }

  @Get('catalog/template')
  catalogTemplate() {
    const csv =
      'code,nameAr,nameEn,genericName,form,strength,categoryAr,categoryEn,gtin,manufacturer,ingredients\nPARA-500,باراسيتامول,Paracetamol,Paracetamol,TABLET,500 mg,مسكنات,Analgesics,,,\n';
    return { csv };
  }

  @Post('catalog/publish')
  publishCatalog(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({
      rows: z.array(z.object({
        code: z.string().trim().min(1).max(64),
        nameAr: z.string().trim().max(200),
        nameEn: z.string().trim().max(200),
        genericName: z.string().trim().max(200),
        form: z.string().trim().max(40),
        strength: z.string().trim().max(80).optional().default(''),
        categoryAr: z.string().trim().max(200).optional().default(''),
        categoryEn: z.string().trim().max(200).optional().default(''),
        gtin: z.string().trim().max(32).optional().default(''),
        manufacturer: z.string().trim().max(200).optional().default(''),
        ingredients: z.string().trim().max(400).optional().default(''),
      })).max(200),
    })))
    body: {
      rows: {
        code: string;
        nameAr: string;
        nameEn: string;
        genericName: string;
        form: string;
        strength: string;
        categoryAr: string;
        categoryEn: string;
        gtin: string;
        manufacturer: string;
        ingredients: string;
      }[];
    },
  ) {
    return this.ops.publishCatalog(this.tenant(request), this.actor(request), body.rows);
  }

  @Post('receipts')
  saveReceipt(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(goodsReceiptSchema)) body: z.infer<typeof goodsReceiptSchema>,
  ) {
    return this.ops.saveGoodsReceipt(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body);
  }

  @Get('stock/pending')
  pendingStock(@Req() request: AuthenticatedRequest, @Query('clientKey') clientKey?: string) {
    const key = clientKey && z.string().uuid().safeParse(clientKey).success ? clientKey : null;
    return this.ops.pendingStock(this.tenant(request), this.branch(request), this.actor(request), this.header(request), key);
  }

  @Post('stock/entries/open')
  openInventoryEntry(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({ clientKey: uuid }))) body: { clientKey: string },
  ) {
    return this.ops.openInventoryEntry(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body.clientKey);
  }

  @Post('stock/entries')
  saveInventoryEntry(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(inventoryEntrySchema)) body: z.infer<typeof inventoryEntrySchema>,
  ) {
    return this.ops.saveInventoryEntry(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body);
  }

  @Post('stock/receive')
  receive(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(receiveSchema)) body: z.infer<typeof receiveSchema>,
  ) {
    return this.ops.receiveStock(this.tenant(request), this.branch(request), this.actor(request), this.header(request), body.lines);
  }

  @Post('catalog/requests')
  requestCatalogItem(
    @Req() request: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          nameAr: z.string().trim().min(2).max(200),
          nameEn: z.string().trim().min(2).max(200),
          genericName: z.string().trim().min(2).max(200),
          barcode: z.string().trim().max(32).optional().default(''),
          note: z.string().trim().max(500).optional().default(''),
          manufacturer: z.string().trim().max(200).optional().default(''),
          strength: z.string().trim().max(80).optional().default(''),
          packaging: z.string().trim().max(80).optional().default(''),
          itemKind: z.enum(['GENERIC', 'BRAND']).optional().default('BRAND'),
          itemType: z.string().trim().max(32).optional().default('Medicine'),
        }),
      ),
    )
    body: {
      nameAr: string;
      nameEn: string;
      genericName: string;
      barcode: string;
      note: string;
      manufacturer: string;
      strength: string;
      packaging: string;
      itemKind: 'GENERIC' | 'BRAND';
      itemType: string;
    },
  ) {
    return this.ops.requestCatalogItem(this.tenant(request), this.actor(request), this.branch(request), body);
  }

  @Post('catalog/import')
  importMedicines(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(importSchema)) body: z.infer<typeof importSchema>,
  ) {
    return this.ops.importMedicines(this.tenant(request), this.actor(request), body.codes);
  }

  @Get('prices')
  prices(@Req() request: AuthenticatedRequest, @Query('listId') listId?: string) {
    const selected = listId && z.string().uuid().safeParse(listId).success ? listId : null;
    return this.ops.prices(this.tenant(request), this.actor(request), this.branch(request), this.header(request), selected);
  }

  @Post('prices/lists')
  createPriceList(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(priceListSchema)) body: z.infer<typeof priceListSchema>,
  ) {
    return this.ops.createPriceList(this.tenant(request), this.actor(request), this.branch(request), this.header(request), body);
  }

  @Put('prices/items/batch')
  savePriceLines(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(priceBatchSchema)) body: z.infer<typeof priceBatchSchema>,
  ) {
    return this.ops.savePriceLines(this.tenant(request), this.actor(request), body);
  }

  @Put('prices/items')
  setPrice(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(priceItemSchema)) body: z.infer<typeof priceItemSchema>,
  ) {
    return this.ops.setPrice(this.tenant(request), this.actor(request), body);
  }

  @Post('prices/copy')
  copyPrice(
    @Req() request: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          priceListId: uuid,
          adjust: z.enum(['SAME', 'PCT', 'AMOUNT']).optional().default('SAME'),
          value: z.string().trim().regex(/^-?\d+(\.\d{1,2})?$/).optional().default('0.00'),
          nameAr: z.string().trim().min(1).max(200),
          nameEn: z.string().trim().min(1).max(200),
          effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
      ),
    )
    body: { priceListId: string; adjust: 'SAME' | 'PCT' | 'AMOUNT'; value: string; nameAr: string; nameEn: string; effectiveFrom?: string },
  ) {
    return this.ops.copyPriceList(this.tenant(request), this.actor(request), body.priceListId, body.adjust, body.value, {
      nameAr: body.nameAr,
      nameEn: body.nameEn,
    }, body.effectiveFrom);
  }

  @Post('prices/link')
  linkPrice(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({ priceListId: uuid, branchId: uuid })))
    body: { priceListId: string; branchId: string },
  ) {
    return this.ops.linkPriceBranch(this.tenant(request), this.actor(request), body);
  }

  @Post('prices/effective')
  setPriceDate(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({
      priceListId: uuid,
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })))
    body: { priceListId: string; effectiveFrom: string },
  ) {
    return this.ops.updatePriceDate(this.tenant(request), this.actor(request), body);
  }

  @Post('prices/bulk')
  bulkPrices(
    @Req() request: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          priceListId: uuid,
          op: z.enum(['PCT', 'AMOUNT', 'MARGIN', 'FX']),
          value: z.string().trim().regex(/^-?\d+(\.\d{1,2})?$/),
          rounding: z.enum(['NONE', '10', '50', '100']),
          roundMode: z.enum(['NEAREST', 'UP']),
          filter: z.enum(['ALL', 'USD']),
          apply: z.boolean(),
        }),
      ),
    )
    body: {
      priceListId: string;
      op: 'PCT' | 'AMOUNT' | 'MARGIN' | 'FX';
      value: string;
      rounding: 'NONE' | '10' | '50' | '100';
      roundMode: 'NEAREST' | 'UP';
      filter: 'ALL' | 'USD';
      apply: boolean;
    },
  ) {
    return this.ops.changePrices(this.tenant(request), this.actor(request), body);
  }

  @Get('prices/rates')
  rates(@Req() request: AuthenticatedRequest) {
    return this.ops.rates(this.tenant(request));
  }

  @Post('prices/rates')
  saveRate(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({ rate: moneyText }))) body: { rate: string },
  ) {
    return this.ops.saveRate(this.tenant(request), this.actor(request), body.rate);
  }

  @Post('prices/rates/propose')
  proposeRate(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({
      rate: moneyText,
      action: z.enum(['preview', 'draft', 'submit', 'reject', 'approve', 'rate']),
      proposalId: uuid.optional(),
      reason: z.string().trim().max(400).optional().default(''),
      effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })))
    body: { rate: string; action: 'preview' | 'draft' | 'submit' | 'reject' | 'approve' | 'rate'; proposalId?: string; reason?: string; effectiveOn?: string },
  ) {
    return this.ops.proposeUsdRate(this.tenant(request), this.actor(request), body);
  }

  @Get('prices/export')
  exportPrices(@Req() request: AuthenticatedRequest, @Query('listId') listId: string) {
    return this.ops.exportPrices(this.tenant(request), listId);
  }

  @Post('prices/import')
  importPrices(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({ priceListId: uuid, csv: z.string().min(1).max(500000) })))
    body: { priceListId: string; csv: string },
  ) {
    return this.ops.importPrices(this.tenant(request), this.actor(request), body.priceListId, body.csv);
  }

  @Post('prices/deactivate')
  deactivatePrice(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({ priceListId: uuid }))) body: { priceListId: string },
  ) {
    return this.ops.deactivatePriceList(
      this.tenant(request),
      this.actor(request),
      this.branch(request),
      this.header(request),
      body.priceListId,
    );
  }

  @Post('prices/delete')
  deletePrice(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({ priceListId: uuid }))) body: { priceListId: string },
  ) {
    return this.ops.deletePriceList(this.tenant(request), this.actor(request), body.priceListId);
  }

  @Post('prices/activate')
  activatePrice(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(activatePriceSchema)) body: z.infer<typeof activatePriceSchema>,
  ) {
    return this.ops.activatePriceList(
      this.tenant(request),
      this.actor(request),
      this.branch(request),
      this.header(request),
      body,
    );
  }

  @Get('network')
  network(@Req() request: AuthenticatedRequest) {
    return this.ops.network(this.tenant(request), this.actor(request));
  }

  @Get('suppliers')
  supplierDesk(@Req() request: AuthenticatedRequest) {
    return this.ops.supplierDesk(this.tenant(request), this.actor(request));
  }

  @Post('suppliers')
  createSupplier(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(supplierSchema)) body: z.infer<typeof supplierSchema>,
  ) {
    return this.ops.createSupplier(this.tenant(request), this.actor(request), body);
  }

  @Put('suppliers/:id')
  updateSupplier(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supplierSchema)) body: z.infer<typeof supplierSchema>,
  ) {
    return this.ops.updateSupplier(this.tenant(request), this.actor(request), id, body);
  }

  @Post('suppliers/:id/active')
  setSupplierActive(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(activeSchema)) body: z.infer<typeof activeSchema>,
  ) {
    return this.ops.setSupplierActive(this.tenant(request), this.actor(request), id, body.isActive);
  }

  @Post('branches')
  createBranch(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(branchSchema)) body: z.infer<typeof branchSchema>,
  ) {
    return this.ops.createBranch(this.tenant(request), this.actor(request), body);
  }

  @Put('network')
  setManagement(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(managementSchema)) body: z.infer<typeof managementSchema>,
  ) {
    return this.ops.setManagement(this.tenant(request), this.actor(request), body.management);
  }

  private tenant(request: AuthenticatedRequest): string {
    const tenantId = request.auth?.tenantId;
    if (!tenantId) throw new DomainError('UNAUTHORIZED', 401);
    return tenantId;
  }

  private actor(request: AuthenticatedRequest): string {
    const userId = request.auth?.userId;
    if (!userId) throw new DomainError('UNAUTHORIZED', 401);
    return userId;
  }

  private branch(request: AuthenticatedRequest): string | null {
    return request.auth?.branchId ?? null;
  }

  private header(request: AuthenticatedRequest): string | null {
    const value = request.header('x-dawaa-branch');
    return value && value.length > 0 ? value : null;
  }
}
