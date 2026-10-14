-- Constrained strings for the pharmacy operations tables.

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StockMovements_type')
  ALTER TABLE dbo.StockMovements ADD CONSTRAINT CK_StockMovements_type
    CHECK (type IN (N'RECEIVE', N'SALE', N'RETURN', N'ADJUST', N'TRANSFER_OUT', N'TRANSFER_IN', N'DAMAGE', N'EXPIRE'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PurchaseOrders_status')
  ALTER TABLE dbo.PurchaseOrders ADD CONSTRAINT CK_PurchaseOrders_status
    CHECK (status IN (N'DRAFT', N'ORDERED', N'RECEIVED', N'CANCELLED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Sales_status')
  ALTER TABLE dbo.Sales ADD CONSTRAINT CK_Sales_status
    CHECK (status IN (N'POSTED', N'VOID'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Sales_payment')
  ALTER TABLE dbo.Sales ADD CONSTRAINT CK_Sales_payment
    CHECK (paymentMethod IN (N'CASH', N'BANKAK', N'FAWRY', N'TRANSFER', N'CREDIT', N'INSURANCE'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_LedgerAccounts_kind')
  ALTER TABLE dbo.LedgerAccounts ADD CONSTRAINT CK_LedgerAccounts_kind
    CHECK (kind IN (N'ASSET', N'LIABILITY', N'EQUITY', N'INCOME', N'EXPENSE'));
GO
