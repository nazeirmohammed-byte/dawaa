import type { PrismaClient } from '@dawaa/db';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Letters and digits, starting with a letter. A blank value keeps the next DW code. */
export function cleanAccountCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function accountCodeShape(value: string): boolean {
  return /^[A-Z][A-Z0-9]{3,15}$/.test(value);
}

export async function nextTenantAccountCode(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ maxn: number | null }[]>`
    SELECT MAX(TRY_CAST(SUBSTRING(accountCode, 3, 10) AS INT)) AS maxn
    FROM dbo.Tenants WHERE accountCode LIKE N'DW%'`;
  const maxn = rows[0]?.maxn ?? 0;
  return `DW${String(maxn + 1).padStart(4, '0')}`;
}
