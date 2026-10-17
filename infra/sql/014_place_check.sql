-- Coordinates confirmed on the map when a pharmacy address or branch location is created.

IF COL_LENGTH(N'dbo.Tenants', N'latitude') IS NULL
  ALTER TABLE dbo.Tenants ADD latitude decimal(9, 6) NULL;
IF COL_LENGTH(N'dbo.Tenants', N'longitude') IS NULL
  ALTER TABLE dbo.Tenants ADD longitude decimal(9, 6) NULL;
GO

IF COL_LENGTH(N'dbo.Branches', N'addressLine') IS NULL
  ALTER TABLE dbo.Branches ADD addressLine nvarchar(300) NOT NULL CONSTRAINT DF_Branches_addressLine DEFAULT (N'');
IF COL_LENGTH(N'dbo.Branches', N'latitude') IS NULL
  ALTER TABLE dbo.Branches ADD latitude decimal(9, 6) NULL;
IF COL_LENGTH(N'dbo.Branches', N'longitude') IS NULL
  ALTER TABLE dbo.Branches ADD longitude decimal(9, 6) NULL;
GO

IF OBJECT_ID(N'dbo.SubscriptionRequests', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SubscriptionRequests', N'latitude') IS NULL
  ALTER TABLE dbo.SubscriptionRequests ADD latitude decimal(9, 6) NULL;
IF OBJECT_ID(N'dbo.SubscriptionRequests', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SubscriptionRequests', N'longitude') IS NULL
  ALTER TABLE dbo.SubscriptionRequests ADD longitude decimal(9, 6) NULL;
GO
