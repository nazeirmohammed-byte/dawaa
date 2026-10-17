-- Shared Global Medical Library.
-- Additive only: new columns, new platform tables, and a link from existing tenant
-- products to the global item. Does not delete products, stock, prices, or documents.
--
-- Before applying on a live database: back up dawaa.
-- Rollback (after restoring the backup, or manually if no rows depend on the new link):
--   ALTER TABLE dbo.Products DROP CONSTRAINT FK_Products_GlobalItem;
--   DROP INDEX IX_Products_globalItem ON dbo.Products;
--   ALTER TABLE dbo.Products DROP COLUMN globalItemId;
--   DROP TABLE dbo.GlobalCatalogRevisions, dbo.GlobalCatalogSearchTokens,
--     dbo.GlobalProductIngredients, dbo.GlobalMedicineSynonyms, dbo.GlobalMedicineIngredients;
--   Then drop the added GlobalCatalogItems / NewCatalogItemRequests columns if required.

IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'descriptionEn') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD descriptionEn NVARCHAR(1000) NOT NULL CONSTRAINT DF_Gci_descEn DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'descriptionAr') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD descriptionAr NVARCHAR(1000) NOT NULL CONSTRAINT DF_Gci_descAr DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'brandNameEn') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD brandNameEn NVARCHAR(200) NOT NULL CONSTRAINT DF_Gci_brandEn DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'brandNameAr') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD brandNameAr NVARCHAR(200) NOT NULL CONSTRAINT DF_Gci_brandAr DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'packSize') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD packSize NVARCHAR(80) NOT NULL CONSTRAINT DF_Gci_pack DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'packUnit') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD packUnit NVARCHAR(40) NOT NULL CONSTRAINT DF_Gci_packUnit DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'registrationNumber') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD registrationNumber NVARCHAR(80) NOT NULL CONSTRAINT DF_Gci_reg DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'modelNumber') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD modelNumber NVARCHAR(80) NOT NULL CONSTRAINT DF_Gci_model DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'regulatoryReference') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD regulatoryReference NVARCHAR(120) NOT NULL CONSTRAINT DF_Gci_regref DEFAULT N'';
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'versionNo') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD versionNo INT NOT NULL CONSTRAINT DF_Gci_version DEFAULT 1;
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'publishedAt') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD publishedAt DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.GlobalCatalogItems', N'updatedAt') IS NULL
  ALTER TABLE dbo.GlobalCatalogItems ADD updatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Gci_updated DEFAULT SYSUTCDATETIME();
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Gci_status_name' AND object_id = OBJECT_ID(N'dbo.GlobalCatalogItems'))
  CREATE INDEX IX_Gci_status_name ON dbo.GlobalCatalogItems(status, nameEn);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Gci_generic' AND object_id = OBJECT_ID(N'dbo.GlobalCatalogItems'))
  CREATE INDEX IX_Gci_generic ON dbo.GlobalCatalogItems(genericName);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Gcb_code' AND object_id = OBJECT_ID(N'dbo.GlobalCatalogBarcodes'))
  CREATE INDEX IX_Gcb_code ON dbo.GlobalCatalogBarcodes(code);
GO

IF OBJECT_ID(N'dbo.GlobalMedicineIngredients', N'U') IS NULL
CREATE TABLE dbo.GlobalMedicineIngredients (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  innEn NVARCHAR(200) NOT NULL,
  innAr NVARCHAR(200) NOT NULL CONSTRAINT DF_Gmi_ar DEFAULT N'',
  atcCode NVARCHAR(16) NOT NULL CONSTRAINT DF_Gmi_atc DEFAULT N'',
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Gmi_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Gmi_inn UNIQUE (innEn)
);
GO

IF OBJECT_ID(N'dbo.GlobalMedicineSynonyms', N'U') IS NULL
CREATE TABLE dbo.GlobalMedicineSynonyms (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  ingredientId UNIQUEIDENTIFIER NULL,
  itemId UNIQUEIDENTIFIER NULL,
  alias NVARCHAR(200) NOT NULL,
  aliasKey NVARCHAR(80) NOT NULL,
  language NVARCHAR(8) NOT NULL CONSTRAINT DF_Gms_lang DEFAULT N'en',
  verified BIT NOT NULL CONSTRAINT DF_Gms_verified DEFAULT 1,
  CONSTRAINT FK_Gms_Ingredient FOREIGN KEY (ingredientId) REFERENCES dbo.GlobalMedicineIngredients(id),
  CONSTRAINT FK_Gms_Item FOREIGN KEY (itemId) REFERENCES dbo.GlobalCatalogItems(id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Gms_alias' AND object_id = OBJECT_ID(N'dbo.GlobalMedicineSynonyms'))
  CREATE INDEX IX_Gms_alias ON dbo.GlobalMedicineSynonyms(aliasKey);
GO

IF OBJECT_ID(N'dbo.GlobalProductIngredients', N'U') IS NULL
CREATE TABLE dbo.GlobalProductIngredients (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  itemId UNIQUEIDENTIFIER NOT NULL,
  ingredientId UNIQUEIDENTIFIER NOT NULL,
  strengthText NVARCHAR(80) NOT NULL CONSTRAINT DF_Gpi_strength DEFAULT N'',
  CONSTRAINT UQ_Gpi_item_inn UNIQUE (itemId, ingredientId),
  CONSTRAINT FK_Gpi_Item FOREIGN KEY (itemId) REFERENCES dbo.GlobalCatalogItems(id),
  CONSTRAINT FK_Gpi_Ingredient FOREIGN KEY (ingredientId) REFERENCES dbo.GlobalMedicineIngredients(id)
);
GO

IF OBJECT_ID(N'dbo.GlobalCatalogSearchTokens', N'U') IS NULL
CREATE TABLE dbo.GlobalCatalogSearchTokens (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  itemId UNIQUEIDENTIFIER NOT NULL,
  token NVARCHAR(80) NOT NULL,
  CONSTRAINT FK_Gcst_Item FOREIGN KEY (itemId) REFERENCES dbo.GlobalCatalogItems(id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Gcst_token' AND object_id = OBJECT_ID(N'dbo.GlobalCatalogSearchTokens'))
  CREATE INDEX IX_Gcst_token ON dbo.GlobalCatalogSearchTokens(token);
GO

IF OBJECT_ID(N'dbo.GlobalCatalogRevisions', N'U') IS NULL
CREATE TABLE dbo.GlobalCatalogRevisions (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  itemId UNIQUEIDENTIFIER NOT NULL,
  versionNo INT NOT NULL,
  snapshot NVARCHAR(MAX) NOT NULL,
  actorId UNIQUEIDENTIFIER NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Gcr_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Gcr_Item FOREIGN KEY (itemId) REFERENCES dbo.GlobalCatalogItems(id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Gcr_item' AND object_id = OBJECT_ID(N'dbo.GlobalCatalogRevisions'))
  CREATE INDEX IX_Gcr_item ON dbo.GlobalCatalogRevisions(itemId, versionNo);
GO

IF COL_LENGTH(N'dbo.Products', N'globalItemId') IS NULL
  ALTER TABLE dbo.Products ADD globalItemId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_globalItem' AND object_id = OBJECT_ID(N'dbo.Products'))
  CREATE INDEX IX_Products_globalItem ON dbo.Products(tenantId, globalItemId) WHERE globalItemId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Products_GlobalItem')
  ALTER TABLE dbo.Products ADD CONSTRAINT FK_Products_GlobalItem FOREIGN KEY (globalItemId) REFERENCES dbo.GlobalCatalogItems(id);
GO

IF COL_LENGTH(N'dbo.NewCatalogItemRequests', N'manufacturer') IS NULL
  ALTER TABLE dbo.NewCatalogItemRequests ADD manufacturer NVARCHAR(200) NOT NULL CONSTRAINT DF_Ncir_mfr DEFAULT N'';
IF COL_LENGTH(N'dbo.NewCatalogItemRequests', N'strength') IS NULL
  ALTER TABLE dbo.NewCatalogItemRequests ADD strength NVARCHAR(80) NOT NULL CONSTRAINT DF_Ncir_strength DEFAULT N'';
IF COL_LENGTH(N'dbo.NewCatalogItemRequests', N'packaging') IS NULL
  ALTER TABLE dbo.NewCatalogItemRequests ADD packaging NVARCHAR(80) NOT NULL CONSTRAINT DF_Ncir_pack DEFAULT N'';
IF COL_LENGTH(N'dbo.NewCatalogItemRequests', N'itemKind') IS NULL
  ALTER TABLE dbo.NewCatalogItemRequests ADD itemKind NVARCHAR(16) NOT NULL CONSTRAINT DF_Ncir_kind DEFAULT N'BRAND';
IF COL_LENGTH(N'dbo.NewCatalogItemRequests', N'itemType') IS NULL
  ALTER TABLE dbo.NewCatalogItemRequests ADD itemType NVARCHAR(32) NOT NULL CONSTRAINT DF_Ncir_type DEFAULT N'Medicine';
GO

DECLARE @para UNIQUEIDENTIFIER;
SELECT @para = id FROM dbo.GlobalMedicineIngredients WHERE innEn = N'Paracetamol';
IF @para IS NULL
BEGIN
  SET @para = NEWID();
  INSERT INTO dbo.GlobalMedicineIngredients (id, innEn, innAr, atcCode)
  VALUES (@para, N'Paracetamol', N'باراسيتامول', N'N02BE01');
END
IF NOT EXISTS (SELECT 1 FROM dbo.GlobalMedicineSynonyms WHERE aliasKey = N'acetaminophen')
  INSERT INTO dbo.GlobalMedicineSynonyms (id, ingredientId, alias, aliasKey, language, verified)
  VALUES (NEWID(), @para, N'Acetaminophen', N'acetaminophen', N'en', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.GlobalMedicineSynonyms WHERE aliasKey = N'باراسيتامول')
  INSERT INTO dbo.GlobalMedicineSynonyms (id, ingredientId, alias, aliasKey, language, verified)
  VALUES (NEWID(), @para, N'باراسيتامول', N'باراسيتامول', N'ar', 1);
INSERT INTO dbo.GlobalProductIngredients (id, itemId, ingredientId, strengthText)
SELECT NEWID(), item.id, @para, item.strength
FROM dbo.GlobalCatalogItems AS item
WHERE item.genericName LIKE N'%Paracetamol%'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.GlobalProductIngredients AS link
    WHERE link.itemId = item.id AND link.ingredientId = @para
  );
GO

-- Link existing tenant products to the shared item by code. Names, prices, stock, and
-- documents stay as they are. Row-level security is off only for this statement.
IF COL_LENGTH(N'dbo.Products', N'globalItemId') IS NOT NULL
AND OBJECT_ID(N'dbo.GlobalCatalogItems', N'U') IS NOT NULL
BEGIN
  DECLARE @policy bit = 0;
  IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'TenantIsolation' AND is_enabled = 1)
  BEGIN
    SET @policy = 1;
    ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = OFF);
  END
  BEGIN TRY
    UPDATE product
    SET globalItemId = item.id
    FROM dbo.Products AS product
    INNER JOIN dbo.GlobalCatalogItems AS item ON item.code = product.masterCode
    WHERE product.globalItemId IS NULL AND product.masterCode IS NOT NULL AND product.masterCode <> N'';

    UPDATE product
    SET globalItemId = item.id
    FROM dbo.Products AS product
    INNER JOIN dbo.GlobalCatalogItems AS item ON item.code = product.sku
    WHERE product.globalItemId IS NULL;

    IF @policy = 1 ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = ON);
  END TRY
  BEGIN CATCH
    IF @policy = 1 ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = ON);
    THROW;
  END CATCH
END
GO
