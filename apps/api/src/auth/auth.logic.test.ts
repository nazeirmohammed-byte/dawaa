import { describe, expect, it } from 'vitest';
import { decideLogin, decideRefresh, type LoginRecord, type SessionRow } from './auth.logic';

const user: LoginRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  branchId: null,
  email: 'owner@demo.dawaa.local',
  phone: '+249912345678',
  passwordHash: 'hash',
  displayName: 'أمين',
  isActive: true,
  tenantStatus: 'TRIAL',
  tradeNameAr: 'صيدلية',
  tradeNameEn: null,
  tenantType: 'INDIVIDUAL',
  featureFlags: '[]',
};

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    tenantId: user.tenantId,
    userId: user.id,
    tokenHash: 'abc',
    expiresAt: new Date('2026-12-01T00:00:00Z'),
    revokedAt: null,
    ...overrides,
  };
}

describe('decideLogin', () => {
  it('rejects an unknown user and a wrong password the same way', () => {
    expect(decideLogin({ user: null, passwordOk: false }).ok).toBe(false);
    expect(decideLogin({ user, passwordOk: false })).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(decideLogin({ user: null, passwordOk: true })).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('allows trial, active, past-due, and suspended tenants', () => {
    for (const tenantStatus of ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED']) {
      const decision = decideLogin({ user: { ...user, tenantStatus }, passwordOk: true });
      expect(decision.ok).toBe(true);
    }
  });

  it('blocks disabled users and cancelled tenants', () => {
    expect(decideLogin({ user: { ...user, isActive: false }, passwordOk: true })).toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    expect(decideLogin({ user: { ...user, tenantStatus: 'CANCELLED' }, passwordOk: true })).toMatchObject({
      code: 'TENANT_CANCELLED',
    });
  });
});

describe('decideRefresh', () => {
  const now = new Date('2026-10-10T00:00:00Z');

  it('accepts a live session and treats a revoked token as reuse', () => {
    expect(decideRefresh({ session: session(), tokenUserId: user.id, now })).toBe('ok');
    expect(
      decideRefresh({
        session: session({ revokedAt: new Date('2026-10-01T00:00:00Z') }),
        tokenUserId: user.id,
        now,
      }),
    ).toBe('reuse');
  });

  it('rejects a missing, expired, or mismatched session', () => {
    expect(decideRefresh({ session: null, tokenUserId: user.id, now })).toBe('reject');
    expect(
      decideRefresh({
        session: session({ expiresAt: new Date('2026-01-01T00:00:00Z') }),
        tokenUserId: user.id,
        now,
      }),
    ).toBe('reject');
    expect(decideRefresh({ session: session(), tokenUserId: 'other', now })).toBe('reject');
  });
});
