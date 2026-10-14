import { Injectable } from '@nestjs/common';
import { applyTenantScope, isTenantScopedModel } from '@dawaa/shared';
import { currentTenantId } from '../context';
import { DomainError } from '../http/domain-error';
import { PrismaService } from './prisma.service';

@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Client for request handlers that already passed the auth guard.
   * Platform models are unchanged. Tenant models throw without a tenant id.
   */
  scoped(): ReturnType<PrismaService['client']['$extends']> {
    return this.prisma.client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = isTenantScopedModel(model) ? (currentTenantId() ?? null) : null;
            if (isTenantScopedModel(model) && !tenantId) {
              throw new DomainError('UNAUTHORIZED', 401);
            }
            try {
              const scoped = applyTenantScope({
                model,
                operation,
                args: args as never,
                tenantId,
              });
              return query(scoped);
            } catch (error) {
              if (error instanceof Error && error.name === 'TenantScopeError') {
                throw new DomainError('UNAUTHORIZED', 403, error.message);
              }
              throw error;
            }
          },
        },
      },
    });
  }
}
