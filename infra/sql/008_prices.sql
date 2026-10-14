-- Standard medicine catalog (platform, no tenant) and pharmacy price lists.
-- A pharmacy list is shared by every branch until that branch activates its own list.

IF OBJECT_ID(N'dbo.StandardMedicines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StandardMedicines (
    id uniqueidentifier NOT NULL CONSTRAINT PK_StandardMedicines PRIMARY KEY,
    code nvarchar(64) NOT NULL,
    nameAr nvarchar(200) NOT NULL,
    nameEn nvarchar(200) NOT NULL,
    genericName nvarchar(200) NOT NULL,
    form nvarchar(80) NOT NULL,
    strength nvarchar(80) NOT NULL,
    categoryAr nvarchar(200) NOT NULL,
    categoryEn nvarchar(200) NOT NULL,
    CONSTRAINT UQ_StandardMedicines_code UNIQUE (code)
  );
END
GO

IF OBJECT_ID(N'dbo.PriceLists', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PriceLists (
    id uniqueidentifier NOT NULL CONSTRAINT PK_PriceLists PRIMARY KEY,
    tenantId uniqueidentifier NOT NULL,
    nameAr nvarchar(200) NOT NULL,
    nameEn nvarchar(200) NOT NULL,
    scope nvarchar(16) NOT NULL,
    isActive bit NOT NULL CONSTRAINT DF_PriceLists_isActive DEFAULT (0),
    createdAt datetime2 NOT NULL CONSTRAINT DF_PriceLists_createdAt DEFAULT (SYSUTCDATETIME()),
    createdBy uniqueidentifier NULL,
    updatedAt datetime2 NOT NULL CONSTRAINT DF_PriceLists_updatedAt DEFAULT (SYSUTCDATETIME()),
    updatedBy uniqueidentifier NULL,
    rowVersion timestamp NOT NULL,
    CONSTRAINT UQ_PriceLists_tenant_id UNIQUE (tenantId, id)
  );
  CREATE INDEX IX_PriceLists_tenant ON dbo.PriceLists(tenantId);
  ALTER TABLE dbo.PriceLists ADD CONSTRAINT FK_PriceLists_tenant
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
END
GO

IF OBJECT_ID(N'dbo.BranchPriceActivations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.BranchPriceActivations (
    id uniqueidentifier NOT NULL CONSTRAINT PK_BranchPriceActivations PRIMARY KEY,
    tenantId uniqueidentifier NOT NULL,
    branchId uniqueidentifier NOT NULL,
    priceListId uniqueidentifier NOT NULL,
    isActive bit NOT NULL CONSTRAINT DF_BranchPriceActivations_isActive DEFAULT (0),
    createdAt datetime2 NOT NULL CONSTRAINT DF_BranchPriceActivations_createdAt DEFAULT (SYSUTCDATETIME()),
    createdBy uniqueidentifier NULL,
    updatedAt datetime2 NOT NULL CONSTRAINT DF_BranchPriceActivations_updatedAt DEFAULT (SYSUTCDATETIME()),
    updatedBy uniqueidentifier NULL,
    rowVersion timestamp NOT NULL,
    CONSTRAINT UQ_BranchPriceActivations_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT UQ_BranchPriceActivations_list UNIQUE (tenantId, branchId, priceListId)
  );
  CREATE INDEX IX_BranchPriceActivations_tenant ON dbo.BranchPriceActivations(tenantId);
  ALTER TABLE dbo.BranchPriceActivations ADD CONSTRAINT FK_BranchPriceActivations_tenant
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
  ALTER TABLE dbo.BranchPriceActivations ADD CONSTRAINT FK_BranchPriceActivations_branch
    FOREIGN KEY (tenantId, branchId) REFERENCES dbo.Branches(tenantId, id);
  ALTER TABLE dbo.BranchPriceActivations ADD CONSTRAINT FK_BranchPriceActivations_list
    FOREIGN KEY (tenantId, priceListId) REFERENCES dbo.PriceLists(tenantId, id);
END
GO

IF OBJECT_ID(N'dbo.ProductPrices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductPrices (
    id uniqueidentifier NOT NULL CONSTRAINT PK_ProductPrices PRIMARY KEY,
    tenantId uniqueidentifier NOT NULL,
    priceListId uniqueidentifier NOT NULL,
    productId uniqueidentifier NOT NULL,
    amount decimal(18, 2) NOT NULL,
    createdAt datetime2 NOT NULL CONSTRAINT DF_ProductPrices_createdAt DEFAULT (SYSUTCDATETIME()),
    createdBy uniqueidentifier NULL,
    updatedAt datetime2 NOT NULL CONSTRAINT DF_ProductPrices_updatedAt DEFAULT (SYSUTCDATETIME()),
    updatedBy uniqueidentifier NULL,
    rowVersion timestamp NOT NULL,
    CONSTRAINT UQ_ProductPrices_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT UQ_ProductPrices_item UNIQUE (tenantId, priceListId, productId)
  );
  CREATE INDEX IX_ProductPrices_tenant ON dbo.ProductPrices(tenantId);
  ALTER TABLE dbo.ProductPrices ADD CONSTRAINT FK_ProductPrices_tenant
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
  ALTER TABLE dbo.ProductPrices ADD CONSTRAINT FK_ProductPrices_list
    FOREIGN KEY (tenantId, priceListId) REFERENCES dbo.PriceLists(tenantId, id);
  ALTER TABLE dbo.ProductPrices ADD CONSTRAINT FK_ProductPrices_product
    FOREIGN KEY (tenantId, productId) REFERENCES dbo.Products(tenantId, id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PriceLists_scope')
  ALTER TABLE dbo.PriceLists ADD CONSTRAINT CK_PriceLists_scope
    CHECK (scope IN (N'PHARMACY', N'BRANCH'));
GO
