import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  write(input: { tenantId: string; actorId: string; action: string }): Promise<void> {
    return this.prisma.withTenant(input.tenantId, async (tx) => {
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: input.action,
          entityType: 'User',
          entityId: input.actorId,
          createdBy: input.actorId,
        },
      });
    });
  }
}
