SET QUOTED_IDENTIFIER ON;
GO

-- Procurement requests can be saved without a cost. The actual cost is snapshotted on the goods receipt.

IF COL_LENGTH(N'dbo.PurchaseOrders', N'priority') IS NULL
  ALTER TABLE dbo.PurchaseOrders ADD priority NVARCHAR(16) NOT NULL CONSTRAINT DF_PurchaseOrders_priority DEFAULT (N'NORMAL');
GO

IF COL_LENGTH(N'dbo.PurchaseOrders', N'notes') IS NULL
  ALTER TABLE dbo.PurchaseOrders ADD notes NVARCHAR(400) NOT NULL CONSTRAINT DF_PurchaseOrders_notes DEFAULT (N'');
GO

IF COL_LENGTH(N'dbo.GoodsReceipts', N'currency') IS NULL
  ALTER TABLE dbo.GoodsReceipts ADD currency NVARCHAR(8) NOT NULL CONSTRAINT DF_GoodsReceipts_currency DEFAULT (N'SDG');
GO

IF COL_LENGTH(N'dbo.GoodsReceipts', N'exchangeRate') IS NULL
  ALTER TABLE dbo.GoodsReceipts ADD exchangeRate DECIMAL(18, 4) NULL;
GO

IF COL_LENGTH(N'dbo.GoodsReceipts', N'discountAmount') IS NULL
  ALTER TABLE dbo.GoodsReceipts ADD discountAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_GoodsReceipts_discount DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.GoodsReceipts', N'taxAmount') IS NULL
  ALTER TABLE dbo.GoodsReceipts ADD taxAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_GoodsReceipts_tax DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.GoodsReceipts', N'chargeAmount') IS NULL
  ALTER TABLE dbo.GoodsReceipts ADD chargeAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_GoodsReceipts_charge DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.GoodsReceiptLines', N'rejectedQty') IS NULL
  ALTER TABLE dbo.GoodsReceiptLines ADD rejectedQty INT NOT NULL CONSTRAINT DF_GoodsReceiptLines_rejected DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.GoodsReceiptLines', N'currency') IS NULL
  ALTER TABLE dbo.GoodsReceiptLines ADD currency NVARCHAR(8) NOT NULL CONSTRAINT DF_GoodsReceiptLines_currency DEFAULT (N'SDG');
GO

IF COL_LENGTH(N'dbo.GoodsReceiptLines', N'foreignUnitCost') IS NULL
  ALTER TABLE dbo.GoodsReceiptLines ADD foreignUnitCost DECIMAL(18, 4) NULL;
GO

IF COL_LENGTH(N'dbo.GoodsReceiptLines', N'exchangeRate') IS NULL
  ALTER TABLE dbo.GoodsReceiptLines ADD exchangeRate DECIMAL(18, 4) NULL;
GO

IF COL_LENGTH(N'dbo.ExchangeRates', N'status') IS NULL
  ALTER TABLE dbo.ExchangeRates ADD status NVARCHAR(16) NOT NULL CONSTRAINT DF_ExchangeRates_status DEFAULT (N'APPROVED');
GO

IF COL_LENGTH(N'dbo.ExchangeRates', N'reason') IS NULL
  ALTER TABLE dbo.ExchangeRates ADD reason NVARCHAR(400) NOT NULL CONSTRAINT DF_ExchangeRates_reason DEFAULT (N'');
GO

IF COL_LENGTH(N'dbo.ExchangeRates', N'priceListId') IS NULL
  ALTER TABLE dbo.ExchangeRates ADD priceListId UNIQUEIDENTIFIER NULL;
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.ExchangeRates') AND name = N'rate' AND scale < 4
)
  ALTER TABLE dbo.ExchangeRates ALTER COLUMN rate DECIMAL(18, 4) NOT NULL;
GO
