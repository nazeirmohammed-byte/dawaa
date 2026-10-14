export const TENANT_SCOPED_MODELS = [
  'Branch',
  'User',
  'Role',
  'Permission',
  'RolePermission',
  'UserBranchRole',
  'RefreshSession',
  'AuditLog',
  'Device',
  'OperationalSignal',
  'ReceiptDraft',
  'Category',
  'Product',
  'StockLot',
  'StockMovement',
  'Supplier',
  'PurchaseOrder',
  'PurchaseLine',
  'Customer',
  'Sale',
  'SaleLine',
  'LedgerAccount',
  'JournalEntry',
  'JournalLine',
  'Expense',
  'PharmacySetting',
  'PriceList',
  'BranchPriceActivation',
  'ProductPrice',
  'ExchangeRate',
  'PriceListChangeBatch',
  'PriceHistory',
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export const TENANT_TABLES = [
  'Branches',
  'Users',
  'Roles',
  'Permissions',
  'RolePermissions',
  'UserBranchRoles',
  'RefreshSessions',
  'AuditLogs',
  'Devices',
  'OperationalSignals',
  'ReceiptDrafts',
  'Categories',
  'Products',
  'StockLots',
  'StockMovements',
  'Suppliers',
  'PurchaseOrders',
  'PurchaseLines',
  'Customers',
  'Sales',
  'SaleLines',
  'LedgerAccounts',
  'JournalEntries',
  'JournalLines',
  'Expenses',
  'PharmacySettings',
  'PriceLists',
  'BranchPriceActivations',
  'ProductPrices',
  'ExchangeRates',
  'PriceListChangeBatches',
  'PriceHistories',
] as const;

const SCOPED = new Set<string>(TENANT_SCOPED_MODELS);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

export type FlatRecord = Record<string, unknown>;

export type TenantQueryArgs = {
  where?: FlatRecord;
  data?: FlatRecord | FlatRecord[];
  create?: FlatRecord;
  update?: FlatRecord;
};

const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

const UNIQUE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert',
]);

export function isTenantScopedModel(model: string): boolean {
  return SCOPED.has(model);
}

function assertTenantId(tenantId: string | null): string {
  if (!tenantId || !UUID.test(tenantId)) {
    throw new TenantScopeError('A tenant context is required for this query');
  }
  return tenantId;
}

function assertFlat(data: FlatRecord): void {
  for (const value of Object.values(data)) {
    if (value === null || value === undefined) continue;
    if (value instanceof Date) continue;
    if (typeof value === 'object') {
      throw new TenantScopeError('Nested writes are not allowed on tenant-scoped models');
    }
  }
}

function assertSameTenant(data: FlatRecord, tenantId: string): void {
  if ('tenantId' in data && data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantScopeError('Refusing to write a row for a different tenant');
  }
}

function scopeUniqueWhere(where: FlatRecord | undefined, tenantId: string): FlatRecord {
  if (!where) {
    throw new TenantScopeError('A unique filter is required');
  }
  if (Object.keys(where).length === 1 && 'tenantId_id' in where) {
    const compound = where.tenantId_id;
    if (!compound || typeof compound !== 'object') {
      throw new TenantScopeError('Invalid tenant compound key');
    }
    const record = compound as FlatRecord;
    if (record.tenantId !== tenantId) {
      throw new TenantScopeError('Refusing to read another tenant by compound key');
    }
    return where;
  }
  if (Object.keys(where).length === 1 && typeof where.id === 'string') {
    return { tenantId_id: { tenantId, id: where.id } };
  }
  throw new TenantScopeError('Unique lookups must be by id so the tenant constraint can be applied');
}

export function applyTenantScope(input: {
  model: string;
  operation: string;
  args: TenantQueryArgs;
  tenantId: string | null;
}): TenantQueryArgs {
  if (!isTenantScopedModel(input.model)) {
    return input.args;
  }
  const tenantId = assertTenantId(input.tenantId);
  const args: TenantQueryArgs = { ...input.args };

  if (WHERE_OPS.has(input.operation)) {
    args.where = { AND: [args.where ?? {}, { tenantId }] };
    return args;
  }

  if (input.operation === 'create') {
    const data = { ...(args.data as FlatRecord | undefined) };
    assertFlat(data);
    assertSameTenant(data, tenantId);
    data.tenantId = tenantId;
    args.data = data;
    return args;
  }

  if (input.operation === 'createMany') {
    if (!Array.isArray(args.data)) {
      throw new TenantScopeError('createMany expects an array of rows');
    }
    args.data = args.data.map((row) => {
      const data = { ...row };
      assertFlat(data);
      assertSameTenant(data, tenantId);
      data.tenantId = tenantId;
      return data;
    });
    return args;
  }

  if (UNIQUE_OPS.has(input.operation)) {
    args.where = scopeUniqueWhere(args.where, tenantId);
    if (input.operation === 'upsert') {
      const create = { ...(args.create ?? {}) };
      assertFlat(create);
      assertSameTenant(create, tenantId);
      create.tenantId = tenantId;
      args.create = create;
      if (args.update) {
        assertFlat(args.update);
        assertSameTenant(args.update, tenantId);
      }
    }
    if ((input.operation === 'update' || input.operation === 'upsert') && args.data) {
      const data = args.data as FlatRecord;
      assertFlat(data);
      assertSameTenant(data, tenantId);
    }
    return args;
  }

  throw new TenantScopeError(`Operation ${input.operation} is not tenant-scoped`);
}
