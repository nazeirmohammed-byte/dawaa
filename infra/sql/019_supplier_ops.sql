-- Supplier operations: active flag and the supplier's own batch numbers.
-- New columns use defaults, so existing suppliers stay active with a blank batch list.

IF COL_LENGTH(N'dbo.Suppliers', N'isActive') IS NULL
  ALTER TABLE dbo.Suppliers ADD isActive BIT NOT NULL CONSTRAINT DF_Suppliers_isActive DEFAULT (1);
IF COL_LENGTH(N'dbo.Suppliers', N'batches') IS NULL
  ALTER TABLE dbo.Suppliers ADD batches NVARCHAR(400) NOT NULL CONSTRAINT DF_Suppliers_batches DEFAULT (N'');
