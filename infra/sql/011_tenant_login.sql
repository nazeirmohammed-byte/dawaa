-- Tenant account codes, platform admin phone login, per-tenant user phone uniqueness.

IF COL_LENGTH(N'dbo.Tenants', N'accountCode') IS NULL
  ALTER TABLE dbo.Tenants ADD accountCode NVARCHAR(32) NULL;
GO

;WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY createdAt, id) AS rn
  FROM dbo.Tenants
  WHERE accountCode IS NULL OR LTRIM(RTRIM(accountCode)) = N''
)
UPDATE t
SET accountCode = CONCAT(N'DW', RIGHT(CONCAT(N'0000', n.rn), 4))
FROM dbo.Tenants AS t
INNER JOIN numbered AS n ON n.id = t.id;
GO

IF EXISTS (SELECT 1 FROM dbo.Tenants WHERE accountCode IS NULL OR LTRIM(RTRIM(accountCode)) = N'')
  THROW 50001, N'Tenant accountCode backfill incomplete', 1;
GO

-- Match Prisma: required column. Safe only after backfill above.
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Tenants') AND name = N'accountCode' AND is_nullable = 1
)
  ALTER TABLE dbo.Tenants ALTER COLUMN accountCode NVARCHAR(32) NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Tenants_accountCode' AND object_id = OBJECT_ID(N'dbo.Tenants'))
  CREATE UNIQUE INDEX UX_Tenants_accountCode ON dbo.Tenants(accountCode);
GO

IF COL_LENGTH(N'dbo.PlatformUsers', N'phone') IS NULL
  ALTER TABLE dbo.PlatformUsers ADD phone NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_PlatformUsers_phone' AND object_id = OBJECT_ID(N'dbo.PlatformUsers'))
  CREATE UNIQUE INDEX UX_PlatformUsers_phone ON dbo.PlatformUsers(phone) WHERE phone IS NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Users_phone' AND object_id = OBJECT_ID(N'dbo.Users'))
  DROP INDEX UX_Users_phone ON dbo.Users;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Users_tenant_phone' AND object_id = OBJECT_ID(N'dbo.Users'))
  CREATE UNIQUE INDEX UX_Users_tenant_phone ON dbo.Users(tenantId, phone)
    WHERE phone IS NOT NULL AND isDeleted = 0;
GO

CREATE OR ALTER PROCEDURE dbo.usp_FindUserEmail
  @Email NVARCHAR(320)
WITH EXECUTE AS N'dawaa_rls_bypass'
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP (1) id FROM dbo.Users WHERE isDeleted = 0 AND email = @Email;
END
GO

IF DATABASE_PRINCIPAL_ID(N'dawaa_app') IS NOT NULL
  GRANT EXECUTE ON dbo.usp_FindUserEmail TO dawaa_app;
GO
