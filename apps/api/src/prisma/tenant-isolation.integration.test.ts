import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@dawaa/db';
import { afterAll, describe, expect, it } from 'vitest';

loadEnvFile({ path: resolve(__dirname, '../../../../.env') });

const enabled = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('tenant isolation against SQL Server', () => {
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const suffix = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  afterAll(async () => {
    await cleanup(prisma, tenantA);
    await cleanup(prisma, tenantB);
    await prisma.$disconnect();
  });

  it('hides tenant B from tenant A and from a session with no tenant', async () => {
    await prisma.tenant.create({
      data: {
        id: tenantA,
        accountCode: `T${suffix.slice(0, 8)}A`,
        type: 'INDIVIDUAL',
        status: 'TRIAL',
        tradeNameAr: 'عزل أ',
        email: `a-${suffix}@isolation.test`,
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantB,
        accountCode: `T${suffix.slice(0, 8)}B`,
        type: 'INDIVIDUAL',
        status: 'TRIAL',
        tradeNameAr: 'عزل ب',
        email: `b-${suffix}@isolation.test`,
      },
    });

    await insertUser(prisma, tenantA, userA, `a-${suffix}@isolation.test`);
    await insertUser(prisma, tenantB, userB, `b-${suffix}@isolation.test`);

    await expect(
      prisma.user.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          email: `blocked-${suffix}@isolation.test`,
          passwordHash: 'x',
          displayName: 'blocked',
        },
      }),
    ).rejects.toThrow();

    const visibleToA = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${tenantA}, @read_only = 0`;
      const rows = await tx.user.findMany({ select: { id: true } });
      const crossed = await tx.user.updateMany({
        where: { id: userB },
        data: { displayName: 'hacked' },
      });
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
      return { ids: rows.map((row) => row.id), crossed: crossed.count };
    });

    expect(visibleToA.ids).toContain(userA);
    expect(visibleToA.ids).not.toContain(userB);
    expect(visibleToA.crossed).toBe(0);

    const withoutContext = await prisma.user.findMany({ select: { id: true } });
    expect(withoutContext).toEqual([]);

    const found = await prisma.$queryRaw<Array<{ id: string }>>`
      EXEC dbo.usp_FindUserForLogin @Identifier = ${`a-${suffix}@isolation.test`}
    `;
    expect(found.map((row) => row.id)).toContain(userA);

    const victim = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${tenantB}, @read_only = 0`;
      const row = await tx.user.findFirst({ where: { id: userB }, select: { displayName: true } });
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
      return row;
    });
    expect(victim?.displayName).toBe('B');
  });
});

async function insertUser(prisma: PrismaClient, tenantId: string, userId: string, email: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${tenantId}, @read_only = 0`;
    await tx.user.create({
      data: {
        id: userId,
        tenantId,
        email,
        passwordHash: 'not-a-login',
        displayName: email.startsWith('a-') ? 'A' : 'B',
      },
    });
    await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
  });
}

async function cleanup(prisma: PrismaClient, tenantId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${tenantId}, @read_only = 0`;
      await tx.receiptDraft.deleteMany({ where: { tenantId } });
      await tx.operationalSignal.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.refreshSession.deleteMany({ where: { tenantId } });
      await tx.userBranchRole.deleteMany({ where: { tenantId } });
      await tx.rolePermission.deleteMany({ where: { tenantId } });
      await tx.device.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.role.deleteMany({ where: { tenantId } });
      await tx.permission.deleteMany({ where: { tenantId } });
      await tx.branch.deleteMany({ where: { tenantId } });
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
    });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  } catch {
    // The fixture may not exist if setup failed before insert.
  }
}
