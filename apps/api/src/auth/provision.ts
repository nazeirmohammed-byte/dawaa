import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@dawaa/db';
import { PERMISSIONS, ROLE_CODES, ROLE_PERMISSIONS, type PermissionCode, type RoleCode } from '@dawaa/shared';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const ROLE_LABELS: Record<RoleCode, { ar: string; en: string }> = {
  OWNER: { ar: 'المالك', en: 'Owner' },
  BRANCH_MANAGER: { ar: 'مدير الفرع', en: 'Branch manager' },
  PHARMACIST: { ar: 'صيدلي', en: 'Pharmacist' },
  ASSISTANT_PHARMACIST: { ar: 'مساعد صيدلي', en: 'Assistant pharmacist' },
  CASHIER: { ar: 'كاشير', en: 'Cashier' },
  STOREKEEPER: { ar: 'أمين المخزن', en: 'Storekeeper' },
  ACCOUNTANT: { ar: 'محاسب', en: 'Accountant' },
};

const ACCOUNTS = [
  { code: '1000', nameAr: 'الصندوق', nameEn: 'Cash', kind: 'ASSET' },
  { code: '1200', nameAr: 'المخزون', nameEn: 'Inventory', kind: 'ASSET' },
  { code: '2000', nameAr: 'ذمم الموردين', nameEn: 'Supplier payables', kind: 'LIABILITY' },
  { code: '3000', nameAr: 'رأس المال الافتتاحي', nameEn: 'Opening equity', kind: 'EQUITY' },
  { code: '4000', nameAr: 'المبيعات', nameEn: 'Sales', kind: 'INCOME' },
  { code: '5000', nameAr: 'تكلفة المبيعات', nameEn: 'Cost of sales', kind: 'EXPENSE' },
  { code: '5100', nameAr: 'مصروفات التشغيل', nameEn: 'Operating expenses', kind: 'EXPENSE' },
] as const;

export type PharmacySignup = {
  tradeNameAr: string;
  tradeNameEn: string;
  phone: string;
  email: string;
  displayName: string;
  passwordHash: string;
  branchCount: number;
  management: 'INDEPENDENT' | 'SHARED';
  branchNameAr: string;
  branchNameEn: string;
  verificationStatus?: 'PENDING' | 'VALID';
};

export async function provisionPharmacy(tx: Tx, input: PharmacySignup): Promise<{ tenantId: string; userId: string; branchId: string }> {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await tx.tenant.create({
    data: {
      id: tenantId,
      type: input.branchCount > 1 ? 'GROUP' : 'INDIVIDUAL',
      dbMode: 'SHARED',
      status: 'TRIAL',
      verificationStatus: input.verificationStatus ?? 'VALID',
      ownerName: input.displayName,
      tradeNameAr: input.tradeNameAr,
      tradeNameEn: input.tradeNameEn,
      phone: input.phone || null,
      email: input.email,
      featureFlags: JSON.stringify(['POS', 'INVENTORY', 'EXPIRY', 'PRICING', 'BASIC_REPORTS']),
      trialEndsAt,
      branchLimit: input.branchCount,
    },
  });
  await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${tenantId}, @read_only = 0`;
  await tx.branch.create({
    data: {
      id: branchId,
      tenantId,
      code: 'MAIN',
      nameAr: input.branchNameAr,
      nameEn: input.branchNameEn,
      isHeadOffice: true,
      phone: input.phone || null,
    },
  });
  const permissionIds = new Map<PermissionCode, string>();
  for (const code of PERMISSIONS) {
    const id = randomUUID();
    permissionIds.set(code, id);
    await tx.permission.create({ data: { id, tenantId, code, nameAr: code, nameEn: code } });
  }
  let ownerRoleId = '';
  for (const code of ROLE_CODES) {
    const id = randomUUID();
    if (code === 'OWNER') ownerRoleId = id;
    const labels = ROLE_LABELS[code];
    await tx.role.create({
      data: { id, tenantId, code, nameAr: labels.ar, nameEn: labels.en, isSystem: true },
    });
    for (const permissionCode of ROLE_PERMISSIONS[code]) {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) throw new Error(`Missing permission ${permissionCode}`);
      await tx.rolePermission.create({ data: { id: randomUUID(), tenantId, roleId: id, permissionId } });
    }
  }
  await tx.user.create({
    data: {
      id: userId,
      tenantId,
      email: input.email,
      phone: input.phone || null,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      isActive: true,
    },
  });
  await tx.userBranchRole.create({
    data: { id: randomUUID(), tenantId, userId, branchId, roleId: ownerRoleId },
  });
  await tx.category.create({
    data: { tenantId, nameAr: 'عام', nameEn: 'General' },
  });
  for (const account of ACCOUNTS) {
    await tx.ledgerAccount.create({ data: { tenantId, ...account, balance: '0.00' } });
  }
  await tx.customer.create({
    data: { tenantId, nameAr: 'عميل نقدي', nameEn: 'Cash customer', balance: '0.00' },
  });
  const settings = [
    { key: 'currency', valueAr: 'ج.س', valueEn: 'SDG' },
    { key: 'receipt_footer', valueAr: 'شكراً لزيارتكم', valueEn: 'Thank you' },
    { key: 'shelf_months', valueAr: '6', valueEn: '6' },
    { key: 'round_increment', valueAr: '50', valueEn: '50' },
    { key: 'management', valueAr: input.management === 'INDEPENDENT' ? 'مستقل' : 'مشترك', valueEn: input.management },
  ];
  for (const setting of settings) {
    await tx.pharmacySetting.create({ data: { tenantId, ...setting } });
  }
  await tx.auditLog.create({
    data: {
      tenantId,
      actorId: userId,
      action: 'tenant.register',
      entityType: 'Tenant',
      entityId: tenantId,
      details: JSON.stringify({ branchLimit: input.branchCount, management: input.management }),
    },
  });
  return { tenantId, userId, branchId };
}
