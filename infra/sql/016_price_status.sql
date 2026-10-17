SET QUOTED_IDENTIFIER ON;
GO

-- Price list versions can wait, be scheduled, or be rejected without replacing the active list.

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PriceLists_status')
  ALTER TABLE dbo.PriceLists DROP CONSTRAINT CK_PriceLists_status;
GO

ALTER TABLE dbo.PriceLists ADD CONSTRAINT CK_PriceLists_status
  CHECK (status IN (N'DRAFT', N'PENDING', N'SCHEDULED', N'ACTIVE', N'REJECTED', N'ARCHIVED'));
GO
