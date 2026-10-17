import { Injectable } from '@nestjs/common';
import { Prisma } from '@dawaa/db';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginRecord } from './auth.logic';

type LoginRow = {
  id: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  displayName: string;
  isActive: boolean | number;
  tenantStatus: string;
  tradeNameAr: string;
  tradeNameEn: string | null;
  tenantType: string;
  featureFlags: string;
  branchId: string | null;
};

@Injectable()
export class LoginLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantAndPhone(tenantCode: string, phone: string): Promise<LoginRecord | null> {
    const rows = await this.prisma.client.$queryRaw<LoginRow[]>(
      Prisma.sql`EXEC dbo.usp_FindUserForLogin @TenantCode = ${tenantCode}, @Phone = ${phone}`,
    );
    if (rows.length > 1) return null;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      email: row.email,
      phone: row.phone,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      isActive: row.isActive === true || row.isActive === 1,
      tenantStatus: row.tenantStatus,
      tradeNameAr: row.tradeNameAr,
      tradeNameEn: row.tradeNameEn,
      tenantType: row.tenantType,
      featureFlags: row.featureFlags,
    };
  }

  async emailTaken(email: string): Promise<boolean> {
    const rows = await this.prisma.client.$queryRaw<{ id: string }[]>(
      Prisma.sql`EXEC dbo.usp_FindUserEmail @Email = ${email}`,
    );
    return rows.length > 0;
  }
}
