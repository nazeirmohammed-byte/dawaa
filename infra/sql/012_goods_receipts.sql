SET QUOTED_IDENTIFIER ON;
GO

-- Receiving batch (goods receipt) is separate from the manufacturer lot on each medicine.
-- Existing RECEIVED purchase lines are marked fully received so historical stock is not posted again.

IF COL_LENGTH(N'dbo.PurchaseLines', N'receivedQty') IS NULL
  ALTER TABLE dbo.PurchaseLines ADD receivedQty INT NOT NULL CONSTRAINT DF_PurchaseLines_receivedQty DEFAULT (0);
GO

UPDATE pl
SET receivedQty = pl.qty
FROM dbo.PurchaseLines pl
INNER JOIN dbo.PurchaseOrders po ON po.tenantId = pl.tenantId AND po.id = pl.purchaseId
WHERE po.status = N'RECEIVED' AND pl.receivedQty = 0;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PurchaseOrders_status')
  ALTER TABLE dbo.PurchaseOrders DROP CONSTRAINT CK_PurchaseOrders_status;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PurchaseOrders_status')
  ALTER TABLE dbo.PurchaseOrders ADD CONSTRAINT CK_PurchaseOrders_status
    CHECK (status IN (N'DRAFT', N'ORDERED', N'PARTIAL', N'RECEIVED', N'CANCELLED'));
GO

IF COL_LENGTH(N'dbo.StockLots', N'condition') IS NULL
  ALTER TABLE dbo.StockLots ADD condition NVARCHAR(32) NOT NULL CONSTRAINT DF_StockLots_condition DEFAULT (N'AVAILABLE');
GO

IF COL_LENGTH(N'dbo.StockLots', N'unitCost') IS NULL
  ALTER TABLE dbo.StockLots ADD unitCost DECIMAL(18, 2) NULL;
GO

IF COL_LENGTH(N'dbo.StockLots', N'receiptLineId') IS NULL
  ALTER TABLE dbo.StockLots ADD receiptLineId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StockLots_condition')
  ALTER TABLE dbo.StockLots ADD CONSTRAINT CK_StockLots_condition
    CHECK (condition IN (N'AVAILABLE', N'REJECTED', N'QUARANTINE', N'DAMAGED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_StockLots_receiptLine' AND object_id = OBJECT_ID(N'dbo.StockLots'))
  CREATE UNIQUE NONCLUSTERED INDEX UX_StockLots_receiptLine ON dbo.StockLots(tenantId, receiptLineId) WHERE receiptLineId IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.GoodsReceipts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.GoodsReceipts (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    branchId UNIQUEIDENTIFIER NOT NULL,
    supplierId UNIQUEIDENTIFIER NULL,
    purchaseId UNIQUEIDENTIFIER NULL,
    clientKey UNIQUEIDENTIFIER NOT NULL,
    docNo NVARCHAR(32) NOT NULL,
    supplierInvoice NVARCHAR(64) NOT NULL CONSTRAINT DF_GoodsReceipts_invoice DEFAULT (N''),
    status NVARCHAR(32) NOT NULL,
    source NVARCHAR(32) NOT NULL,
    receivedAt DATETIME2 NOT NULL,
    postedAt DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_GoodsReceipts_createdAt DEFAULT CURRENT_TIMESTAMP,
    createdBy UNIQUEIDENTIFIER NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_GoodsReceipts_updatedAt DEFAULT CURRENT_TIMESTAMP,
    updatedBy UNIQUEIDENTIFIER NULL,
    rowVersion timestamp,
    CONSTRAINT GoodsReceipts_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT GoodsReceipts_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT GoodsReceipts_tenant_doc UNIQUE (tenantId, docNo),
    CONSTRAINT GoodsReceipts_tenant_key UNIQUE (tenantId, clientKey)
  );
END
GO

IF OBJECT_ID(N'dbo.GoodsReceiptLines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.GoodsReceiptLines (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    receiptId UNIQUEIDENTIFIER NOT NULL,
    productId UNIQUEIDENTIFIER NOT NULL,
    purchaseLineId UNIQUEIDENTIFIER NULL,
    batchNo NVARCHAR(64) NOT NULL,
    qty INT NOT NULL,
    bonusQty INT NOT NULL CONSTRAINT DF_GoodsReceiptLines_bonus DEFAULT (0),
    unitCost DECIMAL(18, 2) NOT NULL,
    sellPrice DECIMAL(18, 2) NULL,
    expiry DATETIME2 NOT NULL,
    location NVARCHAR(100) NOT NULL,
    condition NVARCHAR(32) NOT NULL,
    manufacturedAt DATETIME2 NULL,
    serialNo NVARCHAR(64) NULL,
    unitCode NVARCHAR(32) NOT NULL CONSTRAINT DF_GoodsReceiptLines_unit DEFAULT (N'BASE'),
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_GoodsReceiptLines_createdAt DEFAULT CURRENT_TIMESTAMP,
    createdBy UNIQUEIDENTIFIER NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_GoodsReceiptLines_updatedAt DEFAULT CURRENT_TIMESTAMP,
    updatedBy UNIQUEIDENTIFIER NULL,
    rowVersion timestamp,
    CONSTRAINT GoodsReceiptLines_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT GoodsReceiptLines_tenant_id UNIQUE (tenantId, id)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_GoodsReceipts_status')
  ALTER TABLE dbo.GoodsReceipts ADD CONSTRAINT CK_GoodsReceipts_status CHECK (status IN (N'DRAFT', N'POSTED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_GoodsReceipts_source')
  ALTER TABLE dbo.GoodsReceipts ADD CONSTRAINT CK_GoodsReceipts_source CHECK (source IN (N'PROCUREMENT', N'OPENING'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_GoodsReceiptLines_condition')
  ALTER TABLE dbo.GoodsReceiptLines ADD CONSTRAINT CK_GoodsReceiptLines_condition
    CHECK (condition IN (N'AVAILABLE', N'REJECTED', N'QUARANTINE', N'DAMAGED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'GoodsReceipts_tenant_fkey')
  ALTER TABLE dbo.GoodsReceipts ADD CONSTRAINT GoodsReceipts_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'GoodsReceipts_branch_fkey')
  ALTER TABLE dbo.GoodsReceipts ADD CONSTRAINT GoodsReceipts_branch_fkey
    FOREIGN KEY (tenantId, branchId) REFERENCES dbo.Branches(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'GoodsReceipts_supplier_fkey')
  ALTER TABLE dbo.GoodsReceipts ADD CONSTRAINT GoodsReceipts_supplier_fkey
    FOREIGN KEY (tenantId, supplierId) REFERENCES dbo.Suppliers(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'GoodsReceipts_purchase_fkey')
  ALTER TABLE dbo.GoodsReceipts ADD CONSTRAINT GoodsReceipts_purchase_fkey
    FOREIGN KEY (tenantId, purchaseId) REFERENCES dbo.PurchaseOrders(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'GoodsReceiptLines_receipt_fkey')
  ALTER TABLE dbo.GoodsReceiptLines ADD CONSTRAINT GoodsReceiptLines_receipt_fkey
    FOREIGN KEY (tenantId, receiptId) REFERENCES dbo.GoodsReceipts(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'GoodsReceiptLines_product_fkey')
  ALTER TABLE dbo.GoodsReceiptLines ADD CONSTRAINT GoodsReceiptLines_product_fkey
    FOREIGN KEY (tenantId, productId) REFERENCES dbo.Products(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'GoodsReceiptLines_purchaseLine_fkey')
  ALTER TABLE dbo.GoodsReceiptLines ADD CONSTRAINT GoodsReceiptLines_purchaseLine_fkey
    FOREIGN KEY (tenantId, purchaseLineId) REFERENCES dbo.PurchaseLines(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'StockLots_receiptLine_fkey')
  ALTER TABLE dbo.StockLots ADD CONSTRAINT StockLots_receiptLine_fkey
    FOREIGN KEY (tenantId, receiptLineId) REFERENCES dbo.GoodsReceiptLines(tenantId, id);
GO

IF OBJECT_ID(N'dbo.GoodsReceipts', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.security_predicates sp
  INNER JOIN sys.objects o ON o.object_id = sp.target_object_id
  WHERE o.name = N'GoodsReceipts'
)
  ALTER SECURITY POLICY dbo.TenantIsolation
    ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.GoodsReceipts,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.GoodsReceipts AFTER INSERT,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.GoodsReceipts AFTER UPDATE;
GO

IF OBJECT_ID(N'dbo.GoodsReceiptLines', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.security_predicates sp
  INNER JOIN sys.objects o ON o.object_id = sp.target_object_id
  WHERE o.name = N'GoodsReceiptLines'
)
  ALTER SECURITY POLICY dbo.TenantIsolation
    ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.GoodsReceiptLines,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.GoodsReceiptLines AFTER INSERT,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.GoodsReceiptLines AFTER UPDATE;
GO
