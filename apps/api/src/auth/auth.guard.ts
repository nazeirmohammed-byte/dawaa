import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { setCurrentTenantId } from '../context';
import { DomainError } from '../http/domain-error';
import { ACCESS_COOKIE } from './auth.cookies';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

export type AuthenticatedRequest = Request & {
  auth?: { userId: string; tenantId: string; branchId: string | null };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw new DomainError('UNAUTHORIZED', 401);
    try {
      const claims = await this.tokens.verifyAccess(token);
      request.auth = { userId: claims.sub, tenantId: claims.tid, branchId: claims.bid };
      setCurrentTenantId(claims.tid);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const tenant = await this.prisma.client.tenant.findUnique({
          where: { id: claims.tid },
          select: { readOnly: true, status: true },
        });
        if (tenant?.readOnly || tenant?.status === 'SUSPENDED') throw new DomainError('TENANT_READ_ONLY', 403);
      }
      return true;
    } catch {
      throw new DomainError('UNAUTHORIZED', 401);
    }
  }
}
