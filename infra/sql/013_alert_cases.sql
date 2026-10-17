SET QUOTED_IDENTIFIER ON;
GO

-- Alert workflow state for the existing alerts center.
-- Live conditions are recalculated from pharmacy documents.
-- These tables remember acknowledgement, snooze, assignment, and history.

IF OBJECT_ID(N'dbo.AlertCases', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AlertCases (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    branchId UNIQUEIDENTIFIER NULL,
    fingerprint NVARCHAR(200) NOT NULL,
    category NVARCHAR(32) NOT NULL,
    severity NVARCHAR(16) NOT NULL,
    code NVARCHAR(64) NOT NULL,
    status NVARCHAR(32) NOT NULL,
    titleAr NVARCHAR(200) NOT NULL,
    titleEn NVARCHAR(200) NOT NULL,
    detailAr NVARCHAR(800) NOT NULL,
    detailEn NVARCHAR(800) NOT NULL,
    figureAr NVARCHAR(80) NOT NULL,
    figureEn NVARCHAR(80) NOT NULL,
    currentValue NVARCHAR(80) NOT NULL,
    thresholdValue NVARCHAR(80) NOT NULL,
    entityType NVARCHAR(32) NOT NULL,
    entityId NVARCHAR(80) NOT NULL,
    recommendedAr NVARCHAR(400) NOT NULL,
    recommendedEn NVARCHAR(400) NOT NULL,
    actionHref NVARCHAR(200) NOT NULL,
    estimate BIT NOT NULL CONSTRAINT DF_AlertCases_estimate DEFAULT (0),
    exposure DECIMAL(18, 2) NOT NULL CONSTRAINT DF_AlertCases_exposure DEFAULT (0),
    assigneeId UNIQUEIDENTIFIER NULL,
    snoozeUntil DATETIME2 NULL,
    openedAt DATETIME2 NOT NULL,
    resolvedAt DATETIME2 NULL,
    escalatedAt DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_AlertCases_createdAt DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AlertCases_updatedAt DEFAULT CURRENT_TIMESTAMP,
    rowVersion timestamp,
    CONSTRAINT AlertCases_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT AlertCases_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT AlertCases_tenant_print UNIQUE (tenantId, fingerprint)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_AlertCases_status')
  ALTER TABLE dbo.AlertCases ADD CONSTRAINT CK_AlertCases_status
    CHECK (status IN (N'OPEN', N'ACKNOWLEDGED', N'SNOOZED', N'RESOLVED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_AlertCases_severity')
  ALTER TABLE dbo.AlertCases ADD CONSTRAINT CK_AlertCases_severity
    CHECK (severity IN (N'critical', N'high', N'medium', N'info'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'AlertCases_tenant_fkey')
  ALTER TABLE dbo.AlertCases ADD CONSTRAINT AlertCases_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF OBJECT_ID(N'dbo.AlertEvents', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AlertEvents (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    caseId UNIQUEIDENTIFIER NOT NULL,
    kind NVARCHAR(32) NOT NULL,
    note NVARCHAR(400) NOT NULL,
    actorId UNIQUEIDENTIFIER NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_AlertEvents_createdAt DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT AlertEvents_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT AlertEvents_tenant_id UNIQUE (tenantId, id)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'AlertEvents_case_fkey')
  ALTER TABLE dbo.AlertEvents ADD CONSTRAINT AlertEvents_case_fkey
    FOREIGN KEY (tenantId, caseId) REFERENCES dbo.AlertCases(tenantId, id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'AlertEvents_tenant_fkey')
  ALTER TABLE dbo.AlertEvents ADD CONSTRAINT AlertEvents_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF OBJECT_ID(N'dbo.AlertNotices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AlertNotices (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    userId UNIQUEIDENTIFIER NOT NULL,
    fingerprint NVARCHAR(200) NOT NULL,
    kind NVARCHAR(32) NOT NULL,
    periodKey NVARCHAR(32) NOT NULL,
    titleAr NVARCHAR(200) NOT NULL,
    titleEn NVARCHAR(200) NOT NULL,
    bodyAr NVARCHAR(400) NOT NULL,
    bodyEn NVARCHAR(400) NOT NULL,
    readAt DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_AlertNotices_createdAt DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT AlertNotices_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT AlertNotices_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT AlertNotices_once UNIQUE (tenantId, userId, fingerprint, kind, periodKey)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'AlertNotices_tenant_fkey')
  ALTER TABLE dbo.AlertNotices ADD CONSTRAINT AlertNotices_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF OBJECT_ID(N'dbo.AlertPreferences', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AlertPreferences (
    id UNIQUEIDENTIFIER NOT NULL,
    tenantId UNIQUEIDENTIFIER NOT NULL,
    userId UNIQUEIDENTIFIER NOT NULL,
    immediate BIT NOT NULL CONSTRAINT DF_AlertPreferences_immediate DEFAULT (1),
    daily BIT NOT NULL CONSTRAINT DF_AlertPreferences_daily DEFAULT (1),
    weekly BIT NOT NULL CONSTRAINT DF_AlertPreferences_weekly DEFAULT (0),
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_AlertPreferences_createdAt DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AlertPreferences_updatedAt DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT AlertPreferences_pkey PRIMARY KEY CLUSTERED (id),
    CONSTRAINT AlertPreferences_tenant_id UNIQUE (tenantId, id),
    CONSTRAINT AlertPreferences_user UNIQUE (tenantId, userId)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'AlertPreferences_tenant_fkey')
  ALTER TABLE dbo.AlertPreferences ADD CONSTRAINT AlertPreferences_tenant_fkey
    FOREIGN KEY (tenantId) REFERENCES dbo.Tenants(id);
GO

IF OBJECT_ID(N'dbo.AlertCases', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.security_predicates sp
  INNER JOIN sys.objects o ON o.object_id = sp.target_object_id
  WHERE o.name = N'AlertCases'
)
  ALTER SECURITY POLICY dbo.TenantIsolation
    ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertCases,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertCases AFTER INSERT,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertCases AFTER UPDATE;
GO

IF OBJECT_ID(N'dbo.AlertEvents', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.security_predicates sp
  INNER JOIN sys.objects o ON o.object_id = sp.target_object_id
  WHERE o.name = N'AlertEvents'
)
  ALTER SECURITY POLICY dbo.TenantIsolation
    ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertEvents,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertEvents AFTER INSERT,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertEvents AFTER UPDATE;
GO

IF OBJECT_ID(N'dbo.AlertNotices', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.security_predicates sp
  INNER JOIN sys.objects o ON o.object_id = sp.target_object_id
  WHERE o.name = N'AlertNotices'
)
  ALTER SECURITY POLICY dbo.TenantIsolation
    ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertNotices,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertNotices AFTER INSERT,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertNotices AFTER UPDATE;
GO

IF OBJECT_ID(N'dbo.AlertPreferences', N'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.security_predicates sp
  INNER JOIN sys.objects o ON o.object_id = sp.target_object_id
  WHERE o.name = N'AlertPreferences'
)
  ALTER SECURITY POLICY dbo.TenantIsolation
    ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertPreferences,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertPreferences AFTER INSERT,
    ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AlertPreferences AFTER UPDATE;
GO
