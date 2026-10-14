import { describe, expect, it } from 'vitest';
import { applyTenantScope, TenantScopeError } from './tenant-scope';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('applyTenantScope', () => {
  it('leaves platform models untouched', () => {
    const args = { where: { email: 'a@b.c' } };
    expect(
      applyTenantScope({ model: 'Tenant', operation: 'findMany', args, tenantId: null }),
    ).toEqual(args);
  });

  it('throws when a tenant model is queried without a tenant', () => {
    expect(() =>
      applyTenantScope({ model: 'User', operation: 'findMany', args: {}, tenantId: null }),
    ).toThrow(TenantScopeError);
  });

  it('injects tenantId into list filters', () => {
    const scoped = applyTenantScope({
      model: 'User',
      operation: 'findMany',
      args: { where: { isActive: true } },
      tenantId: TENANT,
    });
    expect(scoped.where).toEqual({ AND: [{ isActive: true }, { tenantId: TENANT }] });
  });

  it('rewrites unique lookups to the compound tenant key', () => {
    const scoped = applyTenantScope({
      model: 'Branch',
      operation: 'update',
      args: { where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, data: { nameAr: 'فرع' } },
      tenantId: TENANT,
    });
    expect(scoped.where).toEqual({
      tenantId_id: { tenantId: TENANT, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
  });

  it('refuses a unique lookup that is not by id', () => {
    expect(() =>
      applyTenantScope({
        model: 'User',
        operation: 'findUnique',
        args: { where: { email: 'a@b.c' } },
        tenantId: TENANT,
      }),
    ).toThrow(TenantScopeError);
  });

  it('stamps tenantId on create and rejects a mismatched payload', () => {
    const scoped = applyTenantScope({
      model: 'AuditLog',
      operation: 'create',
      args: { data: { action: 'auth.login' } },
      tenantId: TENANT,
    });
    expect(scoped.data).toMatchObject({ tenantId: TENANT, action: 'auth.login' });

    expect(() =>
      applyTenantScope({
        model: 'User',
        operation: 'create',
        args: { data: { tenantId: OTHER, displayName: 'x' } },
        tenantId: TENANT,
      }),
    ).toThrow(TenantScopeError);
  });

  it('rejects nested writes that would skip the tenant stamp', () => {
    expect(() =>
      applyTenantScope({
        model: 'User',
        operation: 'create',
        args: { data: { displayName: 'x', branchRoles: { create: { roleId: 'y' } } } },
        tenantId: TENANT,
      }),
    ).toThrow(TenantScopeError);
  });
});
