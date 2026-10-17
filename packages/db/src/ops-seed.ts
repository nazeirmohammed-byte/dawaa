import { randomUUID } from 'node:crypto';
import { missingSudanSuppliers } from '@dawaa/shared';
import type { Prisma, PrismaClient } from './generated/client';
import { STANDARD_MEDICINES } from './standard-medicines';

type Tx = Prisma.TransactionClient;

const CATEGORIES = [
  { code: 'antibiotics', nameAr: 'مضادات حيوية', nameEn: 'Antibiotics' },
  { code: 'chronic', nameAr: 'أدوية مزمنة', nameEn: 'Chronic medicines' },
  { code: 'vitamins', nameAr: 'فيتامينات', nameEn: 'Vitamins' },
  { code: 'pain', nameAr: 'مسكنات', nameEn: 'Pain relief' },
] as const;

type Item = {
  sku: string;
  category: (typeof CATEGORIES)[number]['code'];
  nameAr: string;
  nameEn: string;
  generic: string;
  form: string;
  strength: string;
  reorder: number;
  sell: string;
  cost: string;
  qty: number;
  expiryDays: number;
  batch: string;
  location: string;
};

const ITEMS: Item[] = [
  {
    sku: 'AMOX-500',
    category: 'antibiotics',
    nameAr: 'أموكسيسيلين 500',
    nameEn: 'Amoxicillin 500',
    generic: 'Amoxicillin',
    form: 'كبسولة',
    strength: '500 mg',
    reorder: 50,
    sell: '2500.00',
    cost: '1800.00',
    qty: 40,
    expiryDays: 18,
    batch: 'AMX-2401',
    location: 'رف أ',
  },
  {
    sku: 'INS-100',
    category: 'chronic',
    nameAr: 'إنسولين 100',
    nameEn: 'Insulin 100',
    generic: 'Insulin',
    form: 'قلم',
    strength: '100 IU',
    reorder: 10,
    sell: '18500.00',
    cost: '14000.00',
    qty: 8,
    expiryDays: 210,
    batch: 'INS-118',
    location: 'ثلاجة',
  },
  {
    sku: 'VITC-1',
    category: 'vitamins',
    nameAr: 'فيتامين سي فوار',
    nameEn: 'Vitamin C effervescent',
    generic: 'Ascorbic acid',
    form: 'علبة',
    strength: '1000 mg',
    reorder: 30,
    sell: '4500.00',
    cost: '2800.00',
    qty: 119,
    expiryDays: 400,
    batch: 'VC-77',
    location: 'رف ب',
  },
  {
    sku: 'PARA-CH',
    category: 'pain',
    nameAr: 'باراسيتامول أطفال',
    nameEn: 'Paediatric paracetamol',
    generic: 'Paracetamol',
    form: 'شريط',
    strength: '250 mg',
    reorder: 40,
    sell: '1250.00',
    cost: '700.00',
    qty: 200,
    expiryDays: 280,
    batch: 'PR-19',
    location: 'رف ج',
  },
  {
    sku: 'MET-850',
    category: 'chronic',
    nameAr: 'ميتفورمين 850',
    nameEn: 'Metformin 850',
    generic: 'Metformin',
    form: 'شريط',
    strength: '850 mg',
    reorder: 20,
    sell: '1200.00',
    cost: '650.00',
    qty: 15,
    expiryDays: 70,
    batch: 'MT-3',
    location: 'رف أ',
  },
];

const ACCOUNTS = [
  { code: '1000', nameAr: 'الصندوق', nameEn: 'Cash', kind: 'ASSET', balance: '454500.00' },
  { code: '1200', nameAr: 'المخزون', nameEn: 'Inventory', kind: 'ASSET', balance: '666950.00' },
  { code: '2000', nameAr: 'ذمم الموردين', nameEn: 'Supplier payables', kind: 'LIABILITY', balance: '64000.00' },
  { code: '3000', nameAr: 'رأس المال الافتتاحي', nameEn: 'Opening equity', kind: 'EQUITY', balance: '1055750.00' },
  { code: '4000', nameAr: 'المبيعات', nameEn: 'Sales', kind: 'INCOME', balance: '4500.00' },
  { code: '5000', nameAr: 'تكلفة المبيعات', nameEn: 'Cost of sales', kind: 'EXPENSE', balance: '2800.00' },
  { code: '5100', nameAr: 'مصروفات التشغيل', nameEn: 'Operating expenses', kind: 'EXPENSE', balance: '0.00' },
] as const;

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export async function seedStandardMedicines(prisma: PrismaClient): Promise<void> {
  for (const item of STANDARD_MEDICINES) {
    const existing = await prisma.standardMedicine.findUnique({ where: { code: item.code } });
    if (!existing) await prisma.standardMedicine.create({ data: { ...item } });
  }
}

export async function ensurePriceLists(tx: Tx, tenantId: string): Promise<void> {
  let shared = await tx.priceList.findFirst({ where: { tenantId, scope: 'PHARMACY' } });
  if (!shared) {
    shared = await tx.priceList.create({
      data: {
        tenantId,
        nameAr: 'قائمة الصيدلية',
        nameEn: 'Pharmacy price list',
        scope: 'PHARMACY',
        isActive: true,
      },
    });
  }
  const products = await tx.product.findMany({ where: { tenantId, isDeleted: false } });
  for (const product of products) {
    const row = await tx.productPrice.findFirst({
      where: { tenantId, priceListId: shared.id, productId: product.id },
    });
    if (!row) {
      await tx.productPrice.create({
        data: { tenantId, priceListId: shared.id, productId: product.id, amount: product.sellPrice },
      });
    }
  }
  const north = await tx.branch.findFirst({ where: { tenantId, code: 'NORTH', isDeleted: false } });
  const para = products.find((product) => product.sku === 'PARA-CH');
  if (!north || !para) return;
  const named = await tx.priceList.findFirst({ where: { tenantId, scope: 'BRANCH', nameEn: 'Bahri price list' } });
  if (named) return;
  const branchList = await tx.priceList.create({
    data: {
      tenantId,
      nameAr: 'أسعار بحري',
      nameEn: 'Bahri price list',
      scope: 'BRANCH',
      isActive: false,
    },
  });
  await tx.branchPriceActivation.create({
    data: { tenantId, branchId: north.id, priceListId: branchList.id, isActive: false },
  });
  await tx.productPrice.create({
    data: { tenantId, priceListId: branchList.id, productId: para.id, amount: '1100.00' },
  });
}

/** Demo pharmacy: a branch allowance, a second store, and independent stock. */
export async function ensureBranchNetwork(tx: Tx, tenantId: string): Promise<void> {
  const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
  if (tenant && tenant.branchLimit < 3) {
    await tx.tenant.update({ where: { id: tenantId }, data: { branchLimit: 3, type: 'GROUP' } });
  }
  const mode = await tx.pharmacySetting.findFirst({ where: { tenantId, key: 'management' } });
  if (!mode) {
    await tx.pharmacySetting.create({
      data: {
        tenantId,
        key: 'management',
        valueAr: 'مستقل',
        valueEn: 'INDEPENDENT',
      },
    });
  }
  const existing = await tx.branch.findFirst({ where: { tenantId, code: 'NORTH', isDeleted: false } });
  if (existing) return;
  const main = await tx.branch.findFirst({ where: { tenantId, isHeadOffice: true, isDeleted: false } });
  const product = await tx.product.findFirst({ where: { tenantId, sku: 'PARA-CH', isDeleted: false } });
  const northId = randomUUID();
  await tx.branch.create({
    data: {
      id: northId,
      tenantId,
      code: 'NORTH',
      nameAr: 'فرع بحري',
      nameEn: 'Bahri branch',
      isHeadOffice: false,
      state: 'الخرطوم',
      city: 'بحري',
      phone: '+249912345679',
    },
  });
  if (!main || !product) return;
  const lot = await tx.stockLot.findFirst({ where: { tenantId, branchId: main.id, productId: product.id, qtyBase: { gte: 12 } } });
  if (!lot) return;
  const northLot = randomUUID();
  await tx.stockLot.update({ where: { id: lot.id }, data: { qtyBase: lot.qtyBase - 12 } });
  await tx.stockLot.create({
    data: {
      id: northLot,
      tenantId,
      branchId: northId,
      productId: product.id,
      batchNo: 'PR-NORTH',
      expiry: lot.expiry,
      qtyBase: 12,
      location: 'رف بحري',
    },
  });
  await tx.stockMovement.create({
    data: {
      tenantId,
      branchId: main.id,
      productId: product.id,
      lotId: lot.id,
      type: 'TRANSFER_OUT',
      qtyBase: -12,
      note: 'إلى فرع بحري',
      refType: 'TRANSFER',
    },
  });
  await tx.stockMovement.create({
    data: {
      tenantId,
      branchId: northId,
      productId: product.id,
      lotId: northLot,
      type: 'TRANSFER_IN',
      qtyBase: 12,
      note: 'من الفرع الرئيسي',
      refType: 'TRANSFER',
    },
  });
}

export async function ensureSudanSuppliers(tx: Tx, tenantId: string): Promise<void> {
  const existing = await tx.supplier.findMany({
    where: { tenantId, isDeleted: false },
    select: { nameEn: true },
  });
  const missing = missingSudanSuppliers(existing.map((row) => row.nameEn));
  if (missing.length === 0) return;
  await tx.supplier.createMany({
    data: missing.map((supplier) => ({
      id: randomUUID(),
      tenantId,
      nameAr: supplier.nameAr,
      nameEn: supplier.nameEn,
      phone: supplier.phone,
      city: supplier.city,
      balance: '0.00',
    })),
  });
}

export async function seedPharmacyOperations(
  tx: Tx,
  tenantId: string,
  branchId: string,
  passwordHash: string,
): Promise<void> {
  const already = await tx.product.count({ where: { tenantId } });
  if (already > 0) return;

  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const id = randomUUID();
    categoryIds.set(category.code, id);
    await tx.category.create({
      data: { id, tenantId, nameAr: category.nameAr, nameEn: category.nameEn },
    });
  }

  const productIds = new Map<string, string>();
  for (const item of ITEMS) {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) throw new Error(`Missing category ${item.category}`);
    const productId = randomUUID();
    const lotId = randomUUID();
    productIds.set(item.sku, productId);
    await tx.product.create({
      data: {
        id: productId,
        tenantId,
        categoryId,
        sku: item.sku,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        genericName: item.generic,
        form: item.form,
        strength: item.strength,
        reorderLevel: item.reorder,
        sellPrice: item.sell,
        costPrice: item.cost,
      },
    });
    await tx.stockLot.create({
      data: {
        id: lotId,
        tenantId,
        branchId,
        productId,
        batchNo: item.batch,
        expiry: daysFromNow(item.expiryDays),
        qtyBase: item.qty,
        location: item.location,
      },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        productId,
        lotId,
        type: 'RECEIVE',
        qtyBase: item.sku === 'VITC-1' ? 120 : item.qty,
        note: 'رصيد افتتاحي',
        refType: 'OPENING',
      },
    });
  }

  const supplierId = randomUUID();
  await tx.supplier.create({
    data: {
      id: supplierId,
      tenantId,
      nameAr: 'الشفاء للأدوية',
      nameEn: 'Al-Shifa Medicines',
      phone: '+249912000111',
      city: 'الخرطوم',
      balance: '64000.00',
    },
  });
  await tx.supplier.create({
    data: {
      tenantId,
      nameAr: 'النيل للمستلزمات',
      nameEn: 'Nile Supplies',
      phone: '+249912000222',
      city: 'بحري',
      balance: '0.00',
    },
  });

  const purchaseId = randomUUID();
  await tx.purchaseOrder.create({
    data: {
      id: purchaseId,
      tenantId,
      branchId,
      supplierId,
      docNo: 'PO-640',
      status: 'RECEIVED',
      total: '64000.00',
      orderedAt: new Date(),
    },
  });
  const amoxId = productIds.get('AMOX-500');
  const insulinId = productIds.get('INS-100');
  if (!amoxId || !insulinId) throw new Error('Missing seeded products');
  await tx.purchaseLine.create({
    data: {
      tenantId,
      purchaseId,
      productId: amoxId,
      qty: 20,
      unitCost: '1800.00',
      lineTotal: '36000.00',
    },
  });
  await tx.purchaseLine.create({
    data: {
      tenantId,
      purchaseId,
      productId: insulinId,
      qty: 2,
      unitCost: '14000.00',
      lineTotal: '28000.00',
    },
  });

  await tx.customer.create({
    data: {
      tenantId,
      nameAr: 'عميل نقدي',
      nameEn: 'Cash customer',
      phone: null,
      balance: '0.00',
    },
  });

  const accountIds = new Map<string, string>();
  for (const account of ACCOUNTS) {
    const id = randomUUID();
    accountIds.set(account.code, id);
    await tx.ledgerAccount.create({
      data: { id, tenantId, ...account },
    });
  }

  await postOpening(tx, tenantId, accountIds);
  await postSampleSale(tx, tenantId, branchId, productIds, accountIds);

  const settings: { key: string; valueAr: string; valueEn: string }[] = [
    { key: 'currency', valueAr: 'ج.س', valueEn: 'SDG' },
    { key: 'receipt_footer', valueAr: 'شكراً لزيارتكم', valueEn: 'Thank you' },
    { key: 'shelf_months', valueAr: '6', valueEn: '6' },
    { key: 'round_increment', valueAr: '50', valueEn: '50' },
    { key: 'city', valueAr: 'الخرطوم', valueEn: 'Khartoum' },
  ];
  for (const setting of settings) {
    await tx.pharmacySetting.create({ data: { tenantId, ...setting } });
  }

  await addStaff(tx, tenantId, branchId, passwordHash);
}

async function postOpening(tx: Tx, tenantId: string, accountIds: Map<string, string>): Promise<void> {
  const entryId = randomUUID();
  await tx.journalEntry.create({
    data: {
      id: entryId,
      tenantId,
      docNo: 'JE-OPEN',
      memoAr: 'قيد افتتاح المخزون والصندوق',
      memoEn: 'Opening stock and cash',
      postedAt: new Date(),
    },
  });
  const lines = [
    { code: '1000', debit: '450000.00', credit: '0.00' },
    { code: '1200', debit: '669750.00', credit: '0.00' },
    { code: '2000', debit: '0.00', credit: '64000.00' },
    { code: '3000', debit: '0.00', credit: '1055750.00' },
  ];
  for (const line of lines) {
    const accountId = accountIds.get(line.code);
    if (!accountId) throw new Error(`Missing account ${line.code}`);
    await tx.journalLine.create({
      data: { tenantId, entryId, accountId, debit: line.debit, credit: line.credit },
    });
  }
}

async function postSampleSale(
  tx: Tx,
  tenantId: string,
  branchId: string,
  productIds: Map<string, string>,
  accountIds: Map<string, string>,
): Promise<void> {
  const productId = productIds.get('VITC-1');
  if (!productId) throw new Error('Missing vitamin product');
  const lot = await tx.stockLot.findFirst({ where: { tenantId, productId } });
  if (!lot) throw new Error('Missing vitamin lot');
  const saleId = randomUUID();
  await tx.sale.create({
    data: {
      id: saleId,
      tenantId,
      branchId,
      docNo: 'S-10483',
      customerName: 'عميل نقدي',
      cashierName: 'أمين النيل',
      soldAt: new Date(),
      subtotal: '4500.00',
      discount: '0.00',
      total: '4500.00',
      paid: '5000.00',
      changeDue: '500.00',
      paymentMethod: 'CASH',
      status: 'POSTED',
    },
  });
  await tx.saleLine.create({
    data: {
      tenantId,
      saleId,
      productId,
      nameAr: 'فيتامين سي فوار',
      nameEn: 'Vitamin C effervescent',
      qty: 1,
      unitPrice: '4500.00',
      lineTotal: '4500.00',
      costTotal: '2800.00',
    },
  });
  await tx.stockMovement.create({
    data: {
      tenantId,
      branchId,
      productId,
      lotId: lot.id,
      type: 'SALE',
      qtyBase: -1,
      note: 'S-10483',
      refType: 'SALE',
      refId: saleId,
    },
  });

  const entryId = randomUUID();
  await tx.journalEntry.create({
    data: {
      id: entryId,
      tenantId,
      docNo: 'JE-SALE-1',
      memoAr: 'بيع فيتامين سي',
      memoEn: 'Vitamin C sale',
      postedAt: new Date(),
    },
  });
  const lines = [
    { code: '1000', debit: '4500.00', credit: '0.00' },
    { code: '4000', debit: '0.00', credit: '4500.00' },
    { code: '5000', debit: '2800.00', credit: '0.00' },
    { code: '1200', debit: '0.00', credit: '2800.00' },
  ];
  for (const line of lines) {
    const accountId = accountIds.get(line.code);
    if (!accountId) throw new Error(`Missing account ${line.code}`);
    await tx.journalLine.create({
      data: { tenantId, entryId, accountId, debit: line.debit, credit: line.credit },
    });
  }
}

export async function ensureDemoCatalog(tx: Tx, tenantId: string, branchId: string): Promise<void> {
  const marker = await tx.product.findFirst({ where: { tenantId, sku: 'DEMO-001' } });
  if (marker) return;
  let category = await tx.category.findFirst({ where: { tenantId, isDeleted: false } });
  if (!category) {
    category = await tx.category.create({ data: { tenantId, nameAr: 'تجريبي', nameEn: 'Demonstration' } });
  }
  const names = [
    ['باراسيتامول', 'Paracetamol'],
    ['أموكسيسيلين', 'Amoxicillin'],
    ['أوميبرازول', 'Omeprazole'],
    ['ميتفورمين', 'Metformin'],
    ['أملوديبين', 'Amlodipine'],
    ['أتورفاستاتين', 'Atorvastatin'],
    ['سيتريزين', 'Cetirizine'],
    ['أزيثرومايسين', 'Azithromycin'],
    ['لوسارتان', 'Losartan'],
    ['فيتامين د', 'Vitamin D'],
  ] as const;
  for (let index = 1; index <= 46; index += 1) {
    const pair = names[index % names.length] ?? names[0];
    const sku = `DEMO-${String(index).padStart(3, '0')}`;
    const productId = randomUUID();
    const lotId = randomUUID();
    const qty = 8 + (index % 30);
    const expiryDays = index % 7 === 0 ? -5 : index % 5 === 0 ? 20 : 120 + index;
    await tx.product.create({
      data: {
        id: productId,
        tenantId,
        categoryId: category.id,
        sku,
        nameAr: `${pair[0]} تجريبي ${index}`,
        nameEn: `${pair[1]} demo ${index}`,
        genericName: pair[1],
        form: index % 2 === 0 ? 'قرص' : 'شراب',
        strength: `${250 + index} mg`,
        reorderLevel: 12,
        sellPrice: (1500 + index * 25).toFixed(2),
        costPrice: (900 + index * 15).toFixed(2),
        gtin: `629${String(100000000 + index)}`,
      },
    });
    await tx.stockLot.create({
      data: {
        id: lotId,
        tenantId,
        branchId,
        productId,
        batchNo: `B-${sku}`,
        expiry: daysFromNow(expiryDays),
        qtyBase: qty,
        location: index % 4 === 0 ? 'ثلاجة' : 'رف تجريبي',
      },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        productId,
        lotId,
        type: 'RECEIVE',
        qtyBase: qty,
        note: 'رصيد توضيحي',
        refType: 'DEMO',
      },
    });
  }
  const supplierCount = await tx.supplier.count({ where: { tenantId, isDeleted: false } });
  for (let index = supplierCount; index < 5; index += 1) {
    await tx.supplier.create({
      data: {
        tenantId,
        nameAr: `مورد تجريبي ${index + 1}`,
        nameEn: `Demo supplier ${index + 1}`,
        phone: `09120000${index}`,
        city: 'الخرطوم',
        balance: '0.00',
      },
    });
  }
  const customerCount = await tx.customer.count({ where: { tenantId, isDeleted: false } });
  for (let index = customerCount; index < 20; index += 1) {
    await tx.customer.create({
      data: {
        tenantId,
        nameAr: `عميل تجريبي ${index + 1}`,
        nameEn: `Demo customer ${index + 1}`,
        phone: `09220000${index}`,
        balance: index % 4 === 0 ? '1500.00' : '0.00',
      },
    });
  }
  const sample = await tx.product.findFirst({ where: { tenantId, sku: 'DEMO-001' } });
  const lot = sample ? await tx.stockLot.findFirst({ where: { tenantId, productId: sample.id, branchId } }) : null;
  if (sample && lot && lot.qtyBase > 12) {
    for (let day = 1; day <= 12; day += 1) {
      const docNo = `DEMO-S-${day}`;
      const existingSale = await tx.sale.findFirst({ where: { tenantId, docNo } });
      if (existingSale) continue;
      const saleId = randomUUID();
      const soldAt = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
      await tx.sale.create({
        data: {
          id: saleId,
          tenantId,
          branchId,
          docNo,
          customerName: `عميل تجريبي ${day}`,
          cashierName: 'كاشير النيل',
          soldAt,
          subtotal: '1500.00',
          discount: '0.00',
          total: '1500.00',
          paid: '1500.00',
          changeDue: '0.00',
          paymentMethod: day % 2 === 0 ? 'CASH' : 'BANKAK',
          status: 'POSTED',
        },
      });
      await tx.saleLine.create({
        data: {
          tenantId,
          saleId,
          productId: sample.id,
          nameAr: sample.nameAr,
          nameEn: sample.nameEn,
          qty: 1,
          unitPrice: '1500.00',
          lineTotal: '1500.00',
          costTotal: '900.00',
        },
      });
      await tx.stockLot.update({ where: { id: lot.id }, data: { qtyBase: { decrement: 1 } } });
      await tx.stockMovement.create({
        data: {
          tenantId,
          branchId,
          productId: sample.id,
          lotId: lot.id,
          type: 'SALE',
          qtyBase: -1,
          note: docNo,
          refType: 'SALE',
          refId: saleId,
        },
      });
    }
  }
  const current = await tx.pharmacySetting.findFirst({ where: { tenantId, key: 'demo' } });
  if (!current) {
    await tx.pharmacySetting.create({ data: { tenantId, key: 'demo', valueAr: 'بيانات توضيحية', valueEn: 'Demonstration data' } });
  }
}

async function addStaff(tx: Tx, tenantId: string, branchId: string, passwordHash: string): Promise<void> {
  const staff = [
    { email: 'cashier@demo.dawaa.local', name: 'كاشير النيل', role: 'CASHIER', phone: '0912000001' },
    { email: 'accountant@demo.dawaa.local', name: 'محاسب النيل', role: 'ACCOUNTANT', phone: '0912000002' },
  ];
  for (const person of staff) {
    const role = await tx.role.findFirst({ where: { tenantId, code: person.role } });
    if (!role) throw new Error(`Missing role ${person.role}`);
    const found = await tx.user.findFirst({ where: { tenantId, email: person.email, isDeleted: false } });
    if (found) {
      await tx.user.update({ where: { id: found.id }, data: { phone: person.phone, passwordHash, isActive: true } });
      continue;
    }
    const userId = randomUUID();
    await tx.user.create({
      data: {
        id: userId,
        tenantId,
        email: person.email,
        phone: person.phone,
        passwordHash,
        displayName: person.name,
        isActive: true,
      },
    });
    await tx.userBranchRole.create({
      data: { tenantId, userId, branchId, roleId: role.id },
    });
  }
}
