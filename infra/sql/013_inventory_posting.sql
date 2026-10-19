SET QUOTED_IDENTIFIER ON;
GO

-- Stock posting is separate from the procurement goods receipt.
-- Lines that already created a stock lot are marked fully posted so they are not stocked again.

IF COL_LENGTH(N'dbo.GoodsReceiptLines', N'postedQty') IS NULL
  ALTER TABLE dbo.GoodsReceiptLines ADD postedQty INT NOT NULL CONSTRAINT DF_GoodsReceiptLines_postedQty DEFAULT (0);
GO

-- Row-level security hides these rows unless the session tenant is set.
DECLARE @tenant uniqueidentifier;
DECLARE tenant_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT id FROM dbo.Tenants;
OPEN tenant_cursor;
FETCH NEXT FROM tenant_cursor INTO @tenant;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC sp_set_session_context @key = N'TenantId', @value = @tenant, @read_only = 0;
  UPDATE grl
  SET postedQty = grl.qty + grl.bonusQty
  FROM dbo.GoodsReceiptLines grl
  WHERE grl.postedQty = 0
    AND EXISTS (
      SELECT 1 FROM dbo.StockLots sl
      WHERE sl.tenantId = grl.tenantId AND sl.receiptLineId = grl.id
    );
  FETCH NEXT FROM tenant_cursor INTO @tenant;
END
CLOSE tenant_cursor;
DEALLOCATE tenant_cursor;
EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_GoodsReceiptLines_postedQty')
  ALTER TABLE dbo.GoodsReceiptLines ADD CONSTRAINT CK_GoodsReceiptLines_postedQty
    CHECK (postedQty >= 0 AND postedQty <= qty + bonusQty);
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_StockLots_receiptLine' AND object_id = OBJECT_ID(N'dbo.StockLots'))
  DROP INDEX UX_StockLots_receiptLine ON dbo.StockLots;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StockLots_receiptLine' AND object_id = OBJECT_ID(N'dbo.StockLots'))
  CREATE NONCLUSTERED INDEX IX_StockLots_receiptLine ON dbo.StockLots(tenantId, receiptLineId) WHERE receiptLineId IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.InventoryEntries', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.InventoryEntries (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    branchId UNIQUEIDENTIFIER NOT NULL,
    clientKey UNIQUEIDENTIFIER NOT NULL,
    docNo NVARCHAR(32) NOT NULL,
    status NVARCHAR(32) NOT NULL,
    receivedAt DATETIME2 NOT NULL,
    postedAt DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_InventoryEntries_createdAt DEFAULT CURRENT_TIMESTAMP,
    createdBy UNIQUEIDENTIFIER NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_InventoryEntries_updatedAt DEFAULT CURRENT_TIMESTAMP,
    updatedBy UNIQUEIDENTIFIER NULL,
    rowVersion timestamp,
    CONSTRAINT InventoryEntries_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT InventoryEntries_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT InventoryEntries_tenant_doc UNIQUE (tenantId, docNo),
    CONSTRAINT InventoryEntries_tenant_key UNIQUE (tenantId, clientKey)
  );
END
GO

IF OBJECT_ID(N'dbo.InventoryEntryLines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.InventoryEntryLines (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    entryId UNIQUEIDENTIFIER NOT NULL,
    receiptLineId UNIQUEIDENTIFIER NOT NULL,
    qty INT NOT NULL,
    location NVARCHAR(32) NOT NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_InventoryEntryLines_createdAt DEFAULT CURRENT_TIMESTAMP,
    createdBy UNIQUEIDENTIFIER NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_InventoryEntryLines_updatedAt DEFAULT CURRENT_TIMESTAMP,
    updatedBy UNIQUEIDENTIFIER NULL,
    rowVersion timestamp,
    CONSTRAINT InventoryEntryLines_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT InventoryEntryLines_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT InventoryEntryLines_entry_line UNIQUE (tenantId, entryId, receiptLineId)
  );
END
GO

IF OBJECT_ID(N'dbo.StorageLocations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StorageLocations (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    branchId UNIQUEIDENTIFIER NOT NULL,
    code NVARCHAR(32) NOT NULL,
    nameAr NVARCHAR(100) NOT NULL,
    nameEn NVARCHAR(100) NOT NULL,
    kind NVARCHAR(32) NOT NULL,
    isDeleted BIT NOT NULL CONSTRAINT DF_StorageLocations_deleted DEFAULT (0),
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_StorageLocations_createdAt DEFAULT CURRENT_TIMESTAMP,
    createdBy UNIQUEIDENTIFIER NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_StorageLocations_updatedAt DEFAULT CURRENT_TIMESTAMP,
    updatedBy UNIQUEIDENTIFIER NULL,
    rowVersion timestamp,
    CONSTRAINT StorageLocations_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT StorageLocations_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT StorageLocations_branch_code UNIQUE (tenantId, branchId, code)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_InventoryEntries_status')
  ALTER TABLE dbo.InventoryEntries ADD CONSTRAINT CK_InventoryEntries_status CHECK (status IN (N'DRAFT', N'POSTED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StorageLocations_kind')
  ALTER TABLE dbo.StorageLocations ADD CONSTRAINT CK_StorageLocations_kind
    CHECK (kind IN (N'PHARMACY', N'SHELF', N'FRIDGE', N'CONTROLLED', N'WAREHOUSE'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'InventoryEntries_tenant_fkey')
  ALTER TABLE dbo.InventoryEntries ADD CONSTRAINT InventoryEntries_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'InventoryEntries_branch_fkey')
  ALTER TABLE dbo.InventoryEntries ADD CONSTRAINT InventoryEntries_branch_fkey
    FOREIGN KEY (tenantId, branchId) REFERENCES dbo.Branches(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'InventoryEntryLines_tenant_fkey')
  ALTER TABLE dbo.InventoryEntryLines ADD CONSTRAINT InventoryEntryLines_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'InventoryEntryLines_entry_fkey')
  ALTER TABLE dbo.InventoryEntryLines ADD CONSTRAINT InventoryEntryLines_entry_fkey
    FOREIGN KEY (tenantId, entryId) REFERENCES dbo.InventoryEntries(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'InventoryEntryLines_receiptLine_fkey')
  ALTER TABLE dbo.InventoryEntryLines ADD CONSTRAINT InventoryEntryLines_receiptLine_fkey
    FOREIGN KEY (tenantId, receiptLineId) REFERENCES dbo.GoodsReceiptLines(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'StorageLocations_tenant_fkey')
  ALTER TABLE dbo.StorageLocations ADD CONSTRAINT StorageLocations_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'StorageLocations_branch_fkey')
  ALTER TABLE dbo.StorageLocations ADD CONSTRAINT StorageLocations_branch_fkey
    FOREIGN KEY (tenantId, branchId) REFERENCES dbo.Branches(tenantId, id);
GO

-- RLS predicates for inventory/storage tables are applied by 001_rls.sql (runs after this script).

