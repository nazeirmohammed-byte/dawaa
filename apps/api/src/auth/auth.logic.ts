import { createHash, randomUUID } from 'node:crypto';

export type LoginRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
  tenantStatus: string;
  tradeNameAr: string;
  tradeNameEn: string | null;
  tenantType: string;
  featureFlags: string;
};

export type SessionRow = {
  id: string;
  tenantId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function decideLogin(input: {
  user: LoginRecord | null;
  passwordOk: boolean;
}):
  | { ok: true; user: LoginRecord }
  | { ok: false; code: 'AUTH_INVALID_CREDENTIALS' | 'ACCOUNT_DISABLED' | 'TENANT_CANCELLED' } {
  if (!input.user || !input.passwordOk) {
    return { ok: false, code: 'AUTH_INVALID_CREDENTIALS' };
  }
  if (!input.user.isActive) return { ok: false, code: 'ACCOUNT_DISABLED' };
  if (input.user.tenantStatus === 'CANCELLED') return { ok: false, code: 'TENANT_CANCELLED' };
  return { ok: true, user: input.user };
}

export function decideRefresh(input: {
  session: SessionRow | null;
  tokenUserId: string;
  now: Date;
}): 'ok' | 'reuse' | 'reject' {
  if (!input.session) return 'reject';
  if (input.session.userId !== input.tokenUserId) return 'reject';
  if (input.session.revokedAt) return 'reuse';
  if (input.session.expiresAt.getTime() <= input.now.getTime()) return 'reject';
  return 'ok';
}

export function newSessionId(): string {
  return randomUUID();
}
