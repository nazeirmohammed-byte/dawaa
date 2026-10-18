-- PO line container unit (box/strip/bottle/piece) for receive qty in order units, not total pieces.
IF COL_LENGTH(N'dbo.PurchaseLines', N'unitCode') IS NULL
  ALTER TABLE dbo.PurchaseLines ADD unitCode NVARCHAR(16) NOT NULL CONSTRAINT DF_PurchaseLines_unitCode DEFAULT (N'PIECE');
