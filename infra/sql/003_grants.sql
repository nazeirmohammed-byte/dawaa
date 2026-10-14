-- Least privilege for the API login. The migrator remains the database owner.

IF DATABASE_PRINCIPAL_ID(N'dawaa_app') IS NOT NULL
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO dawaa_app;
  GRANT EXECUTE ON dbo.usp_FindUserForLogin TO dawaa_app;
END
GO
