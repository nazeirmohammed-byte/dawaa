-- Prisma cannot declare SQL Server enums or filtered unique indexes.

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Tenants_type')
  ALTER TABLE dbo.Tenants ADD CONSTRAINT CK_Tenants_type
    CHECK (type IN (N'INDIVIDUAL', N'GROUP'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Tenants_status')
  ALTER TABLE dbo.Tenants ADD CONSTRAINT CK_Tenants_status
    CHECK (status IN (N'TRIAL', N'ACTIVE', N'PAST_DUE', N'SUSPENDED', N'CANCELLED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Tenants_dbMode')
  ALTER TABLE dbo.Tenants ADD CONSTRAINT CK_Tenants_dbMode
    CHECK (dbMode IN (N'SHARED', N'DEDICATED'));
GO

-- SQL Server unique indexes allow only one NULL, so phone-only users need a filter.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Users_email' AND object_id = OBJECT_ID(N'dbo.Users'))
  CREATE UNIQUE INDEX UX_Users_email ON dbo.Users(email) WHERE email IS NOT NULL AND isDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Users_phone' AND object_id = OBJECT_ID(N'dbo.Users'))
  CREATE UNIQUE INDEX UX_Users_phone ON dbo.Users(phone) WHERE phone IS NOT NULL AND isDeleted = 0;
GO
