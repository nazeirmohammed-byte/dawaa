import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SessionRow } from './auth.logic';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  save(input: {
    id: string;
    tenantId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<void> {
    return this.prisma.withTenant(input.tenantId, async (tx) => {
      await tx.refreshSession.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          userAgent: input.userAgent,
          ipAddress: input.ipAddress,
          createdBy: input.userId,
        },
      });
    });
  }

  find(tenantId: string, tokenHash: string): Promise<SessionRow | null> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.refreshSession.findFirst({
        where: { tenantId, tokenHash },
        select: {
          id: true,
          tenantId: true,
          userId: true,
          tokenHash: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      return row;
    });
  }

  revoke(tenantId: string, sessionId: string, replacedById: string | null): Promise<void> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.refreshSession.updateMany({
        where: { tenantId, id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), replacedById },
      });
    });
  }

  revokeAllForUser(tenantId: string, userId: string): Promise<void> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.refreshSession.updateMany({
        where: { tenantId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
