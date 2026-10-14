import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DomainError } from '../http/domain-error';
import { TokenService } from '../auth/token.service';
import { PLATFORM_COOKIE } from './platform.cookies';
import { PlatformService, type PlatformActor } from './platform.service';

export type PlatformRequest = Request & { platform?: PlatformActor };

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly platform: PlatformService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const token = request.cookies?.[PLATFORM_COOKIE] as string | undefined;
    if (!token) throw new DomainError('UNAUTHORIZED', 401);
    try {
      const claims = await this.tokens.verifyPlatform(token);
      const actor = await this.platform.actor(claims.sub);
      request.platform = actor;
      return true;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('UNAUTHORIZED', 401);
    }
  }
}
