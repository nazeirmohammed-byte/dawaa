import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { DomainError } from '../http/domain-error';
import { takenField } from '../http/field-errors';
import { logger } from '../logger';
import { AuditRepository } from './audit.repository';
import { decideLogin, decideRefresh, hashToken, newSessionId } from './auth.logic';
import { LoginLookup } from './login.lookup';
import { PasswordService } from './password.service';
import { ProfileRepository, type AuthProfile } from './profile.repository';
import { provisionPharmacy, type PharmacySignup } from './provision';
import { SessionRepository } from './session.repository';
import { TokenService } from './token.service';
import { PrismaService } from '../prisma/prisma.service';

export type AuthTokens = { accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: LoginLookup,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionRepository,
    private readonly profiles: ProfileRepository,
    private readonly audit: AuditRepository,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(input: PharmacySignup): Promise<{ pending: true; email: string }> {
    if (await this.users.emailTaken(input.email)) {
      throw new DomainError('VALIDATION_ERROR', 409, { fields: { email: 'taken' } });
    }
    await this.prisma.client.$transaction(async (tx) => {
      try {
        return await provisionPharmacy(tx, { ...input, verificationStatus: 'PENDING' });
      } catch (error) {
        const field = takenField(error);
        if (field) throw new DomainError('VALIDATION_ERROR', 409, { fields: { [field]: 'taken' } });
        throw error;
      } finally {
        try {
          await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
        } catch (error) {
          logger.warn({ err: error }, 'failed to clear tenant session context');
        }
      }
    });
    return { pending: true, email: input.email };
  }

  async login(
    input: { tenantCode: string; phone: string; password: string; otp?: string },
    meta: { userAgent: string | null; ipAddress: string | null },
  ): Promise<{ profile: AuthProfile; tokens: AuthTokens }> {
    const user = await this.users.findByTenantAndPhone(input.tenantCode.trim(), input.phone.trim());
    const passwordOk = await this.passwords.verify(user?.passwordHash ?? this.passwords.dummyHash, input.password);
    if (user && !passwordOk) {
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } } }),
      );
    }
    const decision = decideLogin({ user, passwordOk });
    if (!decision.ok) {
      logger.warn({ action: 'auth.login_failed', code: decision.code }, 'login rejected');
      const status = decision.code === 'AUTH_INVALID_CREDENTIALS' ? 401 : 403;
      throw new DomainError(decision.code, status);
    }
    const approval = await this.prisma.client.tenant.findUnique({
      where: { id: decision.user.tenantId },
      select: { verificationStatus: true },
    });
    if (approval?.verificationStatus === 'PENDING') throw new DomainError('AWAITING_APPROVAL', 403);
    if (approval?.verificationStatus === 'REJECTED') throw new DomainError('SIGNUP_REJECTED', 403);

    const gate = await this.prisma.withTenant(decision.user.tenantId, (tx) =>
      tx.user.findFirst({
        where: { id: decision.user.id, tenantId: decision.user.tenantId },
        select: { forceOtp: true, otpHash: true, otpExpiresAt: true },
      }),
    );
    if (gate?.forceOtp) {
      if (!input.otp || !gate.otpHash || !gate.otpExpiresAt || gate.otpExpiresAt.getTime() < Date.now()) {
        throw new DomainError('OTP_REQUIRED', 401);
      }
      const otpOk = await this.passwords.verify(gate.otpHash, input.otp);
      if (!otpOk) throw new DomainError('AUTH_INVALID_CREDENTIALS', 401);
    }
    const issued = await this.issue(decision.user.id, decision.user.tenantId, decision.user.branchId, meta);
    await this.prisma.withTenant(decision.user.tenantId, (tx) =>
      tx.user.update({
        where: { id: decision.user.id },
        data: { lastLoginAt: new Date(), failedLogins: 0, otpHash: null, otpExpiresAt: null },
      }),
    );
    const profile = await this.profiles.load(decision.user.tenantId, decision.user.id, decision.user.branchId);
    if (!profile) throw new DomainError('ACCOUNT_DISABLED', 403);
    await this.audit.write({ tenantId: decision.user.tenantId, actorId: decision.user.id, action: 'auth.login' });
    return { profile, tokens: issued };
  }

  async refresh(
    refreshToken: string | undefined,
    meta: { userAgent: string | null; ipAddress: string | null },
  ): Promise<AuthTokens> {
    if (!refreshToken) throw new DomainError('UNAUTHORIZED', 401);
    const claims = await this.tokens.verifyRefresh(refreshToken).catch(() => null);
    if (!claims) throw new DomainError('UNAUTHORIZED', 401);
    const session = await this.sessions.find(claims.tid, hashToken(refreshToken));
    const outcome = decideRefresh({ session, tokenUserId: claims.sub, now: new Date() });
    if (outcome === 'reuse') {
      await this.sessions.revokeAllForUser(claims.tid, claims.sub);
      await this.audit.write({ tenantId: claims.tid, actorId: claims.sub, action: 'auth.refresh_reuse' });
      throw new DomainError('UNAUTHORIZED', 401);
    }
    if (outcome === 'reject' || !session) throw new DomainError('UNAUTHORIZED', 401);
    const branchId = await this.profiles.homeBranch(claims.tid, claims.sub);
    const issued = await this.issue(claims.sub, claims.tid, branchId, meta);
    await this.sessions.revoke(claims.tid, session.id, null);
    return issued;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const claims = await this.tokens.verifyRefresh(refreshToken).catch(() => null);
    if (!claims) return;
    const session = await this.sessions.find(claims.tid, hashToken(refreshToken));
    if (!session || session.revokedAt) return;
    await this.sessions.revoke(claims.tid, session.id, null);
    await this.audit.write({ tenantId: claims.tid, actorId: claims.sub, action: 'auth.logout' });
  }

  async redeemImpersonation(
    code: string,
    meta: { userAgent: string | null; ipAddress: string | null },
  ): Promise<{ profile: AuthProfile; tokens: AuthTokens }> {
    const grant = await this.prisma.client.impersonationGrant.findFirst({
      where: { codeHash: hashToken(code), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!grant) throw new DomainError('UNAUTHORIZED', 401);
    await this.prisma.client.impersonationGrant.update({ where: { id: grant.id }, data: { usedAt: new Date() } });
    const branchId = await this.profiles.homeBranch(grant.tenantId, grant.userId);
    const tokens = await this.issue(grant.userId, grant.tenantId, branchId, meta);
    const profile = await this.profiles.load(grant.tenantId, grant.userId, branchId);
    if (!profile) throw new DomainError('UNAUTHORIZED', 401);
    await this.audit.write({ tenantId: grant.tenantId, actorId: grant.userId, action: 'auth.impersonate' });
    return { profile, tokens };
  }

  async changePassword(userId: string, tenantId: string, currentPassword: string, nextPassword: string): Promise<{ ok: true }> {
    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { id: userId, tenantId, isDeleted: false } }),
    );
    if (!user) throw new DomainError('UNAUTHORIZED', 401);
    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) throw new DomainError('AUTH_INVALID_CREDENTIALS', 401);
    const passwordHash = await this.passwords.hash(nextPassword);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { passwordHash } }),
    );
    await this.audit.write({ tenantId, actorId: userId, action: 'auth.password_change' });
    return { ok: true };
  }

  async me(userId: string, tenantId: string, branchId: string | null): Promise<AuthProfile> {
    const profile = await this.profiles.load(tenantId, userId, branchId);
    if (!profile) throw new DomainError('UNAUTHORIZED', 401);
    return profile;
  }

  private async issue(
    userId: string,
    tenantId: string,
    branchId: string | null,
    meta: { userAgent: string | null; ipAddress: string | null },
  ): Promise<AuthTokens> {
    const sessionId = newSessionId();
    const accessToken = await this.tokens.signAccess({ sub: userId, tid: tenantId, bid: branchId });
    const refreshToken = await this.tokens.signRefresh({ sub: userId, tid: tenantId, jti: sessionId });
    await this.sessions.save({
      id: sessionId,
      tenantId,
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + this.config.refreshTtlSeconds * 1000),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });
    return { accessToken, refreshToken };
  }
}
