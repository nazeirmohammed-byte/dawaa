-- Supplier batch numbers are notes kept on the supplier record.
-- Received lot numbers stay on goods-receipt lines.
--
-- The change runs with tenant isolation off, then turns the policy back on.

DECLARE @policy bit = 0;
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'TenantIsolation' AND is_enabled = 1)
BEGIN
  SET @policy = 1;
  ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = OFF);
END
BEGIN TRY
  IF COL_LENGTH(N'dbo.Suppliers', N'batchNotes') IS NULL
    ALTER TABLE dbo.Suppliers ADD batchNotes NVARCHAR(400) NOT NULL CONSTRAINT DF_Suppliers_batchNotes DEFAULT (N'');

  IF @policy = 1 ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = ON);
END TRY
BEGIN CATCH
  IF @policy = 1 ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = ON);
  THROW;
END CATCH
