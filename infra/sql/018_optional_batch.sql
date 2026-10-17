-- Manufacturer batch is optional on goods receipts and stock lots.
-- A blank value and the old OPEN placeholder are stored as N/A.
-- Existing written batch numbers are left unchanged.
--
-- The update runs with tenant isolation off, then turns the policy back on.

DECLARE @policy bit = 0;
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'TenantIsolation' AND is_enabled = 1)
BEGIN
  SET @policy = 1;
  ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = OFF);
END
BEGIN TRY
  IF COL_LENGTH(N'dbo.StockLots', N'batchNo') IS NOT NULL
  BEGIN
    UPDATE dbo.StockLots
    SET batchNo = N'N/A'
    WHERE batchNo IS NULL
       OR LTRIM(RTRIM(batchNo)) = N''
       OR UPPER(LTRIM(RTRIM(batchNo))) = N'OPEN';
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_StockLots_batchNo')
      ALTER TABLE dbo.StockLots ADD CONSTRAINT DF_StockLots_batchNo DEFAULT (N'N/A') FOR batchNo;
  END

  IF COL_LENGTH(N'dbo.GoodsReceiptLines', N'batchNo') IS NOT NULL
  BEGIN
    UPDATE dbo.GoodsReceiptLines
    SET batchNo = N'N/A'
    WHERE batchNo IS NULL
       OR LTRIM(RTRIM(batchNo)) = N''
       OR UPPER(LTRIM(RTRIM(batchNo))) = N'OPEN';
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_GoodsReceiptLines_batchNo')
      ALTER TABLE dbo.GoodsReceiptLines ADD CONSTRAINT DF_GoodsReceiptLines_batchNo DEFAULT (N'N/A') FOR batchNo;
  END

  IF @policy = 1 ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = ON);
END TRY
BEGIN CATCH
  IF @policy = 1 ALTER SECURITY POLICY dbo.TenantIsolation WITH (STATE = ON);
  THROW;
END CATCH
GO
