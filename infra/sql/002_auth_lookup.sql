-- Login lookup. The caller cannot see Users until a tenant is known,
-- so this procedure runs as a user with no login of its own.

IF DATABASE_PRINCIPAL_ID(N'dawaa_rls_bypass') IS NULL
  CREATE USER dawaa_rls_bypass WITHOUT LOGIN;
GO

GRANT SELECT ON dbo.Users TO dawaa_rls_bypass;
GRANT SELECT ON dbo.Tenants TO dawaa_rls_bypass;
GRANT SELECT ON dbo.UserBranchRoles TO dawaa_rls_bypass;
GO

CREATE OR ALTER PROCEDURE dbo.usp_FindUserForLogin
  @Identifier NVARCHAR(320)
WITH EXECUTE AS N'dawaa_rls_bypass'
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP (2)
    u.id,
    u.tenantId,
    u.email,
    u.phone,
    u.passwordHash,
    u.displayName,
    u.isActive,
    t.status AS tenantStatus,
    t.tradeNameAr,
    t.tradeNameEn,
    t.type AS tenantType,
    t.featureFlags,
    b.branchId
  FROM dbo.Users AS u
  INNER JOIN dbo.Tenants AS t ON t.id = u.tenantId
  OUTER APPLY (
    SELECT TOP (1) ubr.branchId
    FROM dbo.UserBranchRoles AS ubr
    WHERE ubr.tenantId = u.tenantId
      AND ubr.userId = u.id
    ORDER BY ubr.createdAt ASC
  ) AS b
  WHERE u.isDeleted = 0
    AND (u.email = @Identifier OR u.phone = @Identifier);
END
GO

IF DATABASE_PRINCIPAL_ID(N'dawaa_app') IS NOT NULL
BEGIN
  GRANT EXECUTE ON dbo.usp_FindUserForLogin TO dawaa_app;
END
GO
