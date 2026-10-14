import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TENANT_TABLES } from '@dawaa/shared';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../infra/sql/001_rls.sql'), 'utf8');

describe('row-level security script', () => {
  it('fails closed when the session has no tenant', () => {
    expect(sql).toContain('SESSION_CONTEXT(N\'TenantId\')');
    expect(sql).toContain('USER_NAME() = N\'dawaa_rls_bypass\'');
    expect(sql).not.toContain('@read_only = 1');
  });

  it.each(TENANT_TABLES)('filters and blocks %s', (table) => {
    expect(sql).toContain(`ON dbo.${table},`);
    expect(sql).toContain(`ON dbo.${table} AFTER INSERT`);
    expect(sql).toContain(`ON dbo.${table} AFTER UPDATE`);
  });
});
