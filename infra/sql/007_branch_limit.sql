-- How many branches this pharmacy subscribed for. Existing rows stay at 1 until the seed raises the demo.

IF COL_LENGTH(N'dbo.Tenants', N'branchLimit') IS NULL
  ALTER TABLE dbo.Tenants ADD branchLimit int NOT NULL CONSTRAINT DF_Tenants_branchLimit DEFAULT (1);
GO
