import { Injectable } from '@nestjs/common';
import { ROLE_PERMISSIONS, type RoleCode } from '@dawaa/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type AuthProfile = {
  user: { id: string; displayName: string; email: string | null; phone: string | null };
  tenant: {
    id: string;
    tradeNameAr: string;
    tradeNameEn: string | null;
    type: string;
    status: string;
    featureFlags: string[];
    trialEndsAt: string | null;
    accountCode: string;
    phone: string | null;
  };
  branch: { id: string; nameAr: string; nameEn: string | null } | null;
  role: { code: string; nameAr: string; nameEn: string } | null;
  permissions: string[];
  network: {
    management: 'INDEPENDENT' | 'SHARED';
    branchLimit: number;
    canViewAll: boolean;
    branches: { id: string; nameAr: string; nameEn: string | null; isHeadOffice: boolean }[];
  };
};

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  homeBranch(tenantId: string, userId: string): Promise<string | null> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const link = await tx.userBranchRole.findFirst({
        where: { tenantId, userId },
        orderBy: { createdAt: 'asc' },
      });
      return link?.branchId ?? null;
    });
  }

  load(tenantId: string, userId: string, branchId: string | null): Promise<AuthProfile | null> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, tenantId, isDeleted: false },
        select: { id: true, displayName: true, email: true, phone: true, isActive: true },
      });
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
      if (!user || !user.isActive || !tenant) return null;
      const [branch, branches, links, mode] = await Promise.all([
        branchId
          ? tx.branch.findFirst({
              where: { id: branchId, tenantId, isDeleted: false },
              select: { id: true, nameAr: true, nameEn: true },
            })
          : Promise.resolve(null),
        tx.branch.findMany({
          where: { tenantId, isDeleted: false },
          orderBy: { createdAt: 'asc' },
          select: { id: true, nameAr: true, nameEn: true, isHeadOffice: true },
        }),
        tx.userBranchRole.findMany({ where: { tenantId, userId }, include: { role: true } }),
        tx.pharmacySetting.findFirst({ where: { tenantId, key: 'management' } }),
      ]);
      const canViewAll = links.some((link) => link.role.code === 'OWNER');
      const roleLink = links.find((link) => branch?.id && link.branchId === branch.id) ?? links[0];
      const visible = canViewAll ? branches : branches.filter((row) => links.some((link) => link.branchId === row.id));
      return {
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
        },
        tenant: {
          id: tenant.id,
          tradeNameAr: tenant.tradeNameAr,
          tradeNameEn: tenant.tradeNameEn,
          type: tenant.type,
          status: tenant.status,
          featureFlags: parseFlags(tenant.featureFlags),
          trialEndsAt: tenant.trialEndsAt ? tenant.trialEndsAt.toISOString() : null,
          accountCode: tenant.accountCode,
          phone: tenant.phone,
        },
        branch,
        role: roleLink
          ? { code: roleLink.role.code, nameAr: roleLink.role.nameAr, nameEn: roleLink.role.nameEn }
          : null,
        permissions: roleLink && roleLink.role.code in ROLE_PERMISSIONS
          ? [...ROLE_PERMISSIONS[roleLink.role.code as RoleCode]]
          : [],
        network: {
          management: mode?.valueEn === 'SHARED' ? 'SHARED' : 'INDEPENDENT',
          branchLimit: tenant.branchLimit,
          canViewAll,
          branches: visible,
        },
      };
    });
  }
}

function parseFlags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function auditId(): string {
  return randomUUID();
}
