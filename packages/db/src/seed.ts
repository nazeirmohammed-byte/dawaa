import { hash } from '@node-rs/argon2';
import {
  ARGON2_OPTIONS,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  type PermissionCode,
  type RoleCode,
} from '@dawaa/shared';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { seedOperationsBoard } from './board-seed';
import { ensureBranchNetwork, ensureDemoCatalog, ensurePriceLists, ensureSudanSuppliers, seedPharmacyOperations, seedStandardMedicines } from './ops-seed';
import { PrismaClient } from './generated/client';

config({ path: resolve(__dirname, '../../../.env') });

const ROLE_LABELS: Record<RoleCode, { ar: string; en: string }> = {
  OWNER: { ar: 'المالك', en: 'Owner' },
  BRANCH_MANAGER: { ar: 'مدير الفرع', en: 'Branch manager' },
  PHARMACIST: { ar: 'صيدلي', en: 'Pharmacist' },
  ASSISTANT_PHARMACIST: { ar: 'مساعد صيدلي', en: 'Assistant pharmacist' },
  CASHIER: { ar: 'كاشير', en: 'Cashier' },
  STOREKEEPER: { ar: 'أمين المخزن', en: 'Storekeeper' },
  ACCOUNTANT: { ar: 'محاسب', en: 'Accountant' },
};

async function main(): Promise<void> {
  const databaseUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@demo.dawaa.local';
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!databaseUrl) throw new Error('MIGRATE_DATABASE_URL is required');
  if (!password || password.length < 10) {
    throw new Error('SEED_OWNER_PASSWORD must be at least 10 characters');
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await seedStandardMedicines(prisma);
    await seedPlatformAdmin(prisma);
    const existing = await prisma.tenant.findFirst({ where: { email } });
    if (existing) {
      if (!existing.accountCode) {
        await prisma.tenant.update({ where: { id: existing.id }, data: { accountCode: 'DW0001' } });
      }
      const passwordHash = await hash(password, ARGON2_OPTIONS);
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${existing.id}, @read_only = 0`;
        const branch = await tx.branch.findFirst({
          where: { tenantId: existing.id, isDeleted: false },
          orderBy: { createdAt: 'asc' },
        });
        await tx.tenant.update({
          where: { id: existing.id },
          data: { phone: '0912345678' },
        });
        await tx.user.updateMany({
          where: { tenantId: existing.id, email, isDeleted: false },
          data: { phone: '0912345678', passwordHash },
        });
        await ensureSudanSuppliers(tx, existing.id);
        if (branch) {
          await seedOperationsBoard(tx, existing.id, branch.id);
          await seedPharmacyOperations(tx, existing.id, branch.id, passwordHash);
          await ensureDemoCatalog(tx, existing.id, branch.id);
          await ensureBranchNetwork(tx, existing.id);
          await ensurePriceLists(tx, existing.id);
        }
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
      });
      console.log(`Tenant already exists for ${email}. Operations data checked.`);
      return;
    }

    const tenantId = randomUUID();
    const branchId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await hash(password, ARGON2_OPTIONS);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${tenantId}, @read_only = 0`;

      await tx.tenant.create({
        data: {
          id: tenantId,
          accountCode: 'DW0001',
          type: 'INDIVIDUAL',
          dbMode: 'SHARED',
          status: 'TRIAL',
          tradeNameAr: 'صيدلية النيل',
          tradeNameEn: 'Nile Pharmacy',
          licenseNumber: 'SD-KH-DEMO-001',
          phone: '0912345678',
          email,
          featureFlags: JSON.stringify(['POS', 'INVENTORY', 'EXPIRY', 'PRICING', 'BASIC_REPORTS']),
          trialEndsAt,
        },
      });

      await tx.branch.create({
        data: {
          id: branchId,
          tenantId,
          code: 'MAIN',
          nameAr: 'الفرع الرئيسي',
          nameEn: 'Main branch',
          isHeadOffice: true,
          state: 'الخرطوم',
          city: 'الخرطوم',
          phone: '0912345678',
        },
      });

      const permissionIds = new Map<PermissionCode, string>();
      for (const code of PERMISSIONS) {
        const id = randomUUID();
        permissionIds.set(code, id);
        await tx.permission.create({
          data: {
            id,
            tenantId,
            code,
            nameAr: code,
            nameEn: code,
          },
        });
      }

      const roleIds = new Map<RoleCode, string>();
      for (const code of ROLE_CODES) {
        const id = randomUUID();
        roleIds.set(code, id);
        const labels = ROLE_LABELS[code];
        await tx.role.create({
          data: {
            id,
            tenantId,
            code,
            nameAr: labels.ar,
            nameEn: labels.en,
            isSystem: true,
          },
        });
        for (const permissionCode of ROLE_PERMISSIONS[code]) {
          const permissionId = permissionIds.get(permissionCode);
          if (!permissionId) throw new Error(`Missing permission ${permissionCode}`);
          await tx.rolePermission.create({
            data: {
              id: randomUUID(),
              tenantId,
              roleId: id,
              permissionId,
            },
          });
        }
      }

      const ownerRoleId = roleIds.get('OWNER');
      if (!ownerRoleId) throw new Error('Missing OWNER role');

      await tx.user.create({
        data: {
          id: userId,
          tenantId,
          email,
          phone: '0912345678',
          passwordHash,
          displayName: 'أمين النيل',
          isActive: true,
        },
      });

      await tx.userBranchRole.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId,
          branchId,
          roleId: ownerRoleId,
        },
      });

      await seedOperationsBoard(tx, tenantId, branchId);
      await seedPharmacyOperations(tx, tenantId, branchId, passwordHash);
      await ensureSudanSuppliers(tx, tenantId);
      await ensureDemoCatalog(tx, tenantId, branchId);
      await ensureBranchNetwork(tx, tenantId);
      await ensurePriceLists(tx, tenantId);

      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          tenantId,
          actorId: userId,
          action: 'seed.tenant',
          entityType: 'Tenant',
          entityId: tenantId,
          details: JSON.stringify({ type: 'INDIVIDUAL' }),
          createdBy: userId,
        },
      });

      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
    });

    console.log(`Seeded demo tenant ${email} (${tenantId}).`);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedPlatformAdmin(prisma: PrismaClient): Promise<void> {
  const phone = process.env.PLATFORM_ADMIN_PHONE?.trim() || '0915138500';
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim() || `super+${phone}@dwaa.local`;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!password || password.length < 10) {
    console.log('PLATFORM_ADMIN_PASSWORD missing; platform admin not seeded.');
    return;
  }
  const role = await prisma.platformRole.findUnique({ where: { code: 'SUPER_ADMIN' } });
  if (!role) throw new Error('Platform roles are missing. Apply infra/sql/010_platform.sql first.');
  const passwordHash = await hash(password, ARGON2_OPTIONS);
  const found = await prisma.platformUser.findFirst({ where: { OR: [{ phone }, { email }] } });
  if (found) {
    await prisma.platformUser.update({
      where: { id: found.id },
      data: { phone, email, passwordHash, isActive: true },
    });
    console.log(`Updated platform admin ${phone}.`);
    return;
  }
  await prisma.platformUser.create({
    data: {
      email,
      phone,
      displayName: 'مدير المنصة',
      passwordHash,
      roleId: role.id,
    },
  });
  console.log(`Seeded platform admin ${phone}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
