-- Additive catalog, versioned price lists, receipt fields, and audit columns.
-- Does not rebuild dawaa and does not alter rowversion columns.

IF OBJECT_ID(N'dbo.DosageForms', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.DosageForms (
    id uniqueidentifier NOT NULL CONSTRAINT PK_DosageForms PRIMARY KEY,
    code nvarchar(40) NOT NULL,
    nameEn nvarchar(80) NOT NULL,
    nameAr nvarchar(80) NOT NULL,
    CONSTRAINT UQ_DosageForms_code UNIQUE (code)
  );
END
GO

INSERT INTO dbo.DosageForms (id, code, nameEn, nameAr)
SELECT NEWID(), v.code, v.nameEn, v.nameAr
FROM (VALUES
  (N'TABLET', N'tablet', N'قرص'),
  (N'FILM_TABLET', N'film-coated tablet', N'قرص مغلف'),
  (N'EFFERVESCENT', N'effervescent tablet', N'قرص فوار'),
  (N'CAPSULE', N'capsule', N'كبسولة'),
  (N'SYRUP', N'syrup', N'شراب'),
  (N'SUSPENSION', N'suspension', N'معلق'),
  (N'ORAL_SOLUTION', N'oral solution', N'محلول فموي'),
  (N'ORAL_DROPS', N'oral drops', N'قطرة فموية'),
  (N'EYE_DROPS', N'eye drops', N'قطرة عين'),
  (N'EAR_DROPS', N'ear drops', N'قطرة أذن'),
  (N'NASAL', N'nasal drops/spray', N'قطرة أو بخاخ أنف'),
  (N'AMPOULE', N'injection — ampoule', N'حقن أمبول'),
  (N'VIAL', N'injection — vial', N'حقن فيال'),
  (N'SYRINGE', N'pre-filled syringe', N'حقنة جاهزة'),
  (N'INFUSION', N'IV infusion', N'محلول وريدي'),
  (N'CREAM', N'cream', N'كريم'),
  (N'OINTMENT', N'ointment', N'مرهم'),
  (N'GEL', N'gel', N'جل'),
  (N'LOTION', N'lotion', N'لوشن'),
  (N'SUPPOSITORY', N'suppository', N'تحميلة'),
  (N'PESSARY', N'pessary', N'لبوس مهبلي'),
  (N'INHALER', N'inhaler', N'بخاخ'),
  (N'NEBULISER', N'nebuliser solution', N'محلول رذاذ'),
  (N'SACHET', N'sachet', N'كيس'),
  (N'POWDER', N'powder', N'مسحوق'),
  (N'LOZENGE', N'lozenge', N'قرص مص'),
  (N'PATCH', N'transdermal patch', N'لصقة'),
  (N'DEVICE', N'medical device', N'جهاز طبي'),
  (N'CONSUMABLE', N'consumable', N'مستهلك'),
  (N'COSMETIC', N'cosmetic', N'مستحضر تجميل'),
  (N'SUPPLEMENT', N'supplement', N'مكمل')
) AS v(code, nameEn, nameAr)
WHERE NOT EXISTS (SELECT 1 FROM dbo.DosageForms d WHERE d.code = v.code);
GO

IF COL_LENGTH(N'dbo.StandardMedicines', N'route') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD route nvarchar(80) NOT NULL CONSTRAINT DF_StandardMedicines_route DEFAULT (N'');
IF COL_LENGTH(N'dbo.StandardMedicines', N'manufacturer') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD manufacturer nvarchar(200) NOT NULL CONSTRAINT DF_StandardMedicines_manufacturer DEFAULT (N'');
IF COL_LENGTH(N'dbo.StandardMedicines', N'country') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD country nvarchar(80) NOT NULL CONSTRAINT DF_StandardMedicines_country DEFAULT (N'');
IF COL_LENGTH(N'dbo.StandardMedicines', N'packDescription') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD packDescription nvarchar(200) NOT NULL CONSTRAINT DF_StandardMedicines_pack DEFAULT (N'');
IF COL_LENGTH(N'dbo.StandardMedicines', N'unitsJson') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD unitsJson nvarchar(400) NOT NULL CONSTRAINT DF_StandardMedicines_units DEFAULT (N'{"box":1}');
IF COL_LENGTH(N'dbo.StandardMedicines', N'gtin') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD gtin nvarchar(32) NOT NULL CONSTRAINT DF_StandardMedicines_gtin DEFAULT (N'');
IF COL_LENGTH(N'dbo.StandardMedicines', N'isControlled') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD isControlled bit NOT NULL CONSTRAINT DF_StandardMedicines_controlled DEFAULT (0);
IF COL_LENGTH(N'dbo.StandardMedicines', N'requiresPrescription') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD requiresPrescription bit NOT NULL CONSTRAINT DF_StandardMedicines_rx DEFAULT (0);
IF COL_LENGTH(N'dbo.StandardMedicines', N'trackSerial') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD trackSerial bit NOT NULL CONSTRAINT DF_StandardMedicines_serial DEFAULT (0);
IF COL_LENGTH(N'dbo.StandardMedicines', N'atcCode') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD atcCode nvarchar(16) NOT NULL CONSTRAINT DF_StandardMedicines_atc DEFAULT (N'');
IF COL_LENGTH(N'dbo.StandardMedicines', N'status') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD status nvarchar(16) NOT NULL CONSTRAINT DF_StandardMedicines_status DEFAULT (N'PUBLISHED');
IF COL_LENGTH(N'dbo.StandardMedicines', N'ingredients') IS NULL
  ALTER TABLE dbo.StandardMedicines ADD ingredients nvarchar(400) NOT NULL CONSTRAINT DF_StandardMedicines_ingredients DEFAULT (N'');
GO

IF COL_LENGTH(N'dbo.Products', N'masterCode') IS NULL
  ALTER TABLE dbo.Products ADD masterCode nvarchar(64) NULL;
IF COL_LENGTH(N'dbo.Products', N'isLocal') IS NULL
  ALTER TABLE dbo.Products ADD isLocal bit NOT NULL CONSTRAINT DF_Products_isLocal DEFAULT (1);
IF COL_LENGTH(N'dbo.Products', N'trackSerial') IS NULL
  ALTER TABLE dbo.Products ADD trackSerial bit NOT NULL CONSTRAINT DF_Products_trackSerial DEFAULT (0);
IF COL_LENGTH(N'dbo.Products', N'gtin') IS NULL
  ALTER TABLE dbo.Products ADD gtin nvarchar(32) NULL;
IF COL_LENGTH(N'dbo.Products', N'shelfLifeMonths') IS NULL
  ALTER TABLE dbo.Products ADD shelfLifeMonths int NULL;
IF COL_LENGTH(N'dbo.Products', N'costUsd') IS NULL
  ALTER TABLE dbo.Products ADD costUsd decimal(18, 2) NULL;
GO

-- Product and price-list backfill runs later, inside each tenant session, because row-level security hides rows otherwise.
GO

IF COL_LENGTH(N'dbo.StockLots', N'manufacturedAt') IS NULL
  ALTER TABLE dbo.StockLots ADD manufacturedAt datetime2 NULL;
IF COL_LENGTH(N'dbo.StockLots', N'serialNo') IS NULL
  ALTER TABLE dbo.StockLots ADD serialNo nvarchar(64) NULL;
IF COL_LENGTH(N'dbo.StockLots', N'unitCode') IS NULL
  ALTER TABLE dbo.StockLots ADD unitCode nvarchar(32) NOT NULL CONSTRAINT DF_StockLots_unit DEFAULT (N'BASE');
IF COL_LENGTH(N'dbo.StockLots', N'bonusQty') IS NULL
  ALTER TABLE dbo.StockLots ADD bonusQty int NOT NULL CONSTRAINT DF_StockLots_bonus DEFAULT (0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_StockLots_serial' AND object_id = OBJECT_ID(N'dbo.StockLots'))
  CREATE UNIQUE INDEX UQ_StockLots_serial ON dbo.StockLots(tenantId, serialNo) WHERE serialNo IS NOT NULL AND serialNo <> N'';
GO

IF COL_LENGTH(N'dbo.PriceLists', N'code') IS NULL
  ALTER TABLE dbo.PriceLists ADD code nvarchar(32) NOT NULL CONSTRAINT DF_PriceLists_code DEFAULT (N'');
IF COL_LENGTH(N'dbo.PriceLists', N'listType') IS NULL
  ALTER TABLE dbo.PriceLists ADD listType nvarchar(16) NOT NULL CONSTRAINT DF_PriceLists_type DEFAULT (N'GENERAL');
IF COL_LENGTH(N'dbo.PriceLists', N'status') IS NULL
  ALTER TABLE dbo.PriceLists ADD status nvarchar(16) NOT NULL CONSTRAINT DF_PriceLists_status DEFAULT (N'DRAFT');
IF COL_LENGTH(N'dbo.PriceLists', N'versionNo') IS NULL
  ALTER TABLE dbo.PriceLists ADD versionNo int NOT NULL CONSTRAINT DF_PriceLists_version DEFAULT (1);
IF COL_LENGTH(N'dbo.PriceLists', N'sourcePriceListId') IS NULL
  ALTER TABLE dbo.PriceLists ADD sourcePriceListId uniqueidentifier NULL;
IF COL_LENGTH(N'dbo.PriceLists', N'exchangeRateUsed') IS NULL
  ALTER TABLE dbo.PriceLists ADD exchangeRateUsed decimal(18, 2) NULL;
IF COL_LENGTH(N'dbo.PriceLists', N'effectiveFrom') IS NULL
  ALTER TABLE dbo.PriceLists ADD effectiveFrom datetime2 NULL;
IF COL_LENGTH(N'dbo.PriceLists', N'effectiveTo') IS NULL
  ALTER TABLE dbo.PriceLists ADD effectiveTo datetime2 NULL;
IF COL_LENGTH(N'dbo.PriceLists', N'activatedAt') IS NULL
  ALTER TABLE dbo.PriceLists ADD activatedAt datetime2 NULL;
IF COL_LENGTH(N'dbo.PriceLists', N'activatedBy') IS NULL
  ALTER TABLE dbo.PriceLists ADD activatedBy uniqueidentifier NULL;
IF COL_LENGTH(N'dbo.PriceLists', N'notes') IS NULL
  ALTER TABLE dbo.PriceLists ADD notes nvarchar(400) NOT NULL CONSTRAINT DF_PriceLists_notes DEFAULT (N'');
GO

DECLARE @tenant uniqueidentifier;
DECLARE tenant_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT id FROM dbo.Tenants;
OPEN tenant_cursor;
FETCH NEXT FROM tenant_cursor INTO @tenant;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC sp_set_session_context @key = N'TenantId', @value = @tenant;
  UPDATE dbo.Products
  SET isLocal = 0, masterCode = sku
  WHERE masterCode IS NULL
    AND sku IN (SELECT code FROM dbo.StandardMedicines);
  UPDATE dbo.PriceLists
  SET code = LEFT(REPLACE(CONVERT(nvarchar(36), id), N'-', N''), 8)
  WHERE code = N'';
  UPDATE dbo.PriceLists
  SET status = N'ACTIVE', activatedAt = COALESCE(activatedAt, createdAt)
  WHERE status = N'DRAFT'
    AND (
      isActive = 1
      OR id IN (SELECT priceListId FROM dbo.BranchPriceActivations WHERE isActive = 1 AND tenantId = @tenant)
    );
  FETCH NEXT FROM tenant_cursor INTO @tenant;
END
CLOSE tenant_cursor;
DEALLOCATE tenant_cursor;
EXEC sp_set_session_context @key = N'TenantId', @value = NULL;
GO

IF COL_LENGTH(N'dbo.ProductPrices', N'costReference') IS NULL
  ALTER TABLE dbo.ProductPrices ADD costReference decimal(18, 2) NULL;
IF COL_LENGTH(N'dbo.ProductPrices', N'marginPct') IS NULL
  ALTER TABLE dbo.ProductPrices ADD marginPct decimal(18, 2) NULL;
IF COL_LENGTH(N'dbo.ProductPrices', N'isManualOverride') IS NULL
  ALTER TABLE dbo.ProductPrices ADD isManualOverride bit NOT NULL CONSTRAINT DF_ProductPrices_manual DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.SaleLines', N'priceListId') IS NULL
  ALTER TABLE dbo.SaleLines ADD priceListId uniqueidentifier NULL;
IF COL_LENGTH(N'dbo.SaleLines', N'priceListVersionNo') IS NULL
  ALTER TABLE dbo.SaleLines ADD priceListVersionNo int NULL;
IF COL_LENGTH(N'dbo.SaleLines', N'unitCost') IS NULL
  ALTER TABLE dbo.SaleLines ADD unitCost decimal(18, 2) NULL;
IF COL_LENGTH(N'dbo.SaleLines', N'discountAmount') IS NULL
  ALTER TABLE dbo.SaleLines ADD discountAmount decimal(18, 2) NOT NULL CONSTRAINT DF_SaleLines_discount DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'branchId') IS NULL
  ALTER TABLE dbo.AuditLogs ADD branchId uniqueidentifier NULL;
IF COL_LENGTH(N'dbo.AuditLogs', N'ipAddress') IS NULL
  ALTER TABLE dbo.AuditLogs ADD ipAddress nvarchar(64) NULL;
IF COL_LENGTH(N'dbo.AuditLogs', N'oldJson') IS NULL
  ALTER TABLE dbo.AuditLogs ADD oldJson nvarchar(max) NULL;
IF COL_LENGTH(N'dbo.AuditLogs', N'newJson') IS NULL
  ALTER TABLE dbo.AuditLogs ADD newJson nvarchar(max) NULL;
GO

IF OBJECT_ID(N'dbo.ExchangeRates', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ExchangeRates (
    id uniqueidentifier NOT NULL CONSTRAINT PK_ExchangeRates PRIMARY KEY,
    tenantId uniqueidentifier NOT NULL,
    currency nvarchar(8) NOT NULL CONSTRAINT DF_ExchangeRates_currency DEFAULT (N'USD'),
    rate decimal(18, 2) NOT NULL,
    notedAt datetime2 NOT NULL,
    createdAt datetime2 NOT NULL CONSTRAINT DF_ExchangeRates_createdAt DEFAULT (SYSUTCDATETIME()),
    createdBy uniqueidentifier NULL,
    updatedAt datetime2 NOT NULL CONSTRAINT DF_ExchangeRates_updatedAt DEFAULT (SYSUTCDATETIME()),
    updatedBy uniqueidentifier NULL,
    rowVersion timestamp NOT NULL,
    CONSTRAINT UQ_ExchangeRates_tenant_id UNIQUE (tenantId, id)
  );
  CREATE INDEX IX_ExchangeRates_tenant ON dbo.ExchangeRates(tenantId, notedAt);
  ALTER TABLE dbo.ExchangeRates ADD CONSTRAINT FK_ExchangeRates_tenant
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
END
GO

IF OBJECT_ID(N'dbo.PriceListChangeBatches', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PriceListChangeBatches (
    id uniqueidentifier NOT NULL CONSTRAINT PK_PriceListChangeBatches PRIMARY KEY,
    tenantId uniqueidentifier NOT NULL,
    priceListId uniqueidentifier NOT NULL,
    ruleName nvarchar(32) NOT NULL,
    filterText nvarchar(200) NOT NULL,
    valueText nvarchar(64) NOT NULL,
    rowsAffected int NOT NULL,
    createdAt datetime2 NOT NULL CONSTRAINT DF_PriceBatches_createdAt DEFAULT (SYSUTCDATETIME()),
    createdBy uniqueidentifier NULL,
    updatedAt datetime2 NOT NULL CONSTRAINT DF_PriceBatches_updatedAt DEFAULT (SYSUTCDATETIME()),
    updatedBy uniqueidentifier NULL,
    rowVersion timestamp NOT NULL,
    CONSTRAINT UQ_PriceBatches_tenant_id UNIQUE (tenantId, id)
  );
  CREATE INDEX IX_PriceBatches_tenant ON dbo.PriceListChangeBatches(tenantId, priceListId);
  ALTER TABLE dbo.PriceListChangeBatches ADD CONSTRAINT FK_PriceBatches_tenant
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
  ALTER TABLE dbo.PriceListChangeBatches ADD CONSTRAINT FK_PriceBatches_list
    FOREIGN KEY (tenantId, priceListId) REFERENCES dbo.PriceLists(tenantId, id);
END
GO

IF OBJECT_ID(N'dbo.PriceHistories', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PriceHistories (
    id uniqueidentifier NOT NULL CONSTRAINT PK_PriceHistories PRIMARY KEY,
    tenantId uniqueidentifier NOT NULL,
    priceListId uniqueidentifier NOT NULL,
    productId uniqueidentifier NOT NULL,
    oldAmount decimal(18, 2) NOT NULL,
    newAmount decimal(18, 2) NOT NULL,
    createdAt datetime2 NOT NULL CONSTRAINT DF_PriceHistories_createdAt DEFAULT (SYSUTCDATETIME()),
    createdBy uniqueidentifier NULL,
    updatedAt datetime2 NOT NULL CONSTRAINT DF_PriceHistories_updatedAt DEFAULT (SYSUTCDATETIME()),
    updatedBy uniqueidentifier NULL,
    rowVersion timestamp NOT NULL,
    CONSTRAINT UQ_PriceHistories_tenant_id UNIQUE (tenantId, id)
  );
  CREATE INDEX IX_PriceHistories_tenant ON dbo.PriceHistories(tenantId, productId, createdAt);
  ALTER TABLE dbo.PriceHistories ADD CONSTRAINT FK_PriceHistories_tenant
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
  ALTER TABLE dbo.PriceHistories ADD CONSTRAINT FK_PriceHistories_list
    FOREIGN KEY (tenantId, priceListId) REFERENCES dbo.PriceLists(tenantId, id);
  ALTER TABLE dbo.PriceHistories ADD CONSTRAINT FK_PriceHistories_product
    FOREIGN KEY (tenantId, productId) REFERENCES dbo.Products(tenantId, id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PriceLists_status')
  ALTER TABLE dbo.PriceLists ADD CONSTRAINT CK_PriceLists_status
    CHECK (status IN (N'DRAFT', N'ACTIVE', N'ARCHIVED'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PriceLists_type')
  ALTER TABLE dbo.PriceLists ADD CONSTRAINT CK_PriceLists_type
    CHECK (listType IN (N'GENERAL', N'INSURANCE', N'WHOLESALE', N'STAFF'));
GO

CREATE OR ALTER TRIGGER dbo.TR_StockMovements_AppendOnly
ON dbo.StockMovements
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  THROW 51001, N'Stock movements are append-only', 1;
END
GO

CREATE OR ALTER TRIGGER dbo.TR_AuditLogs_AppendOnly
ON dbo.AuditLogs
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  THROW 51002, N'Audit log is append-only', 1;
END
GO

CREATE OR ALTER TRIGGER dbo.TR_JournalEntries_AppendOnly
ON dbo.JournalEntries
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  THROW 51003, N'Posted journal entries are append-only', 1;
END
GO

CREATE OR ALTER TRIGGER dbo.TR_JournalLines_AppendOnly
ON dbo.JournalLines
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  THROW 51004, N'Posted journal lines are append-only', 1;
END
GO

CREATE OR ALTER TRIGGER dbo.TR_BranchPrice_OneActive
ON dbo.BranchPriceActivations
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1
    FROM inserted i
    INNER JOIN dbo.PriceLists p ON p.tenantId = i.tenantId AND p.id = i.priceListId
    INNER JOIN dbo.BranchPriceActivations a
      ON a.tenantId = i.tenantId AND a.branchId = i.branchId AND a.isActive = 1 AND a.id <> i.id
    INNER JOIN dbo.PriceLists otherList ON otherList.tenantId = a.tenantId AND otherList.id = a.priceListId AND otherList.listType = p.listType
    WHERE i.isActive = 1
  )
  BEGIN
    THROW 51000, N'Only one active price list per type per branch', 1;
  END
END
GO
