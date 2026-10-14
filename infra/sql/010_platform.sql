-- Platform admin tables. Not tenant-owned, so they stay outside row-level security.
-- Existing pharmacies stay verified so the live demo is not locked.

IF COL_LENGTH(N'dbo.Tenants', N'verificationStatus') IS NULL
  ALTER TABLE dbo.Tenants ADD verificationStatus NVARCHAR(16) NOT NULL CONSTRAINT DF_Tenants_verification DEFAULT N'VALID';
IF COL_LENGTH(N'dbo.Tenants', N'ownerName') IS NULL
  ALTER TABLE dbo.Tenants ADD ownerName NVARCHAR(200) NOT NULL CONSTRAINT DF_Tenants_ownerName DEFAULT N'';
IF COL_LENGTH(N'dbo.Tenants', N'addressLine') IS NULL
  ALTER TABLE dbo.Tenants ADD addressLine NVARCHAR(300) NOT NULL CONSTRAINT DF_Tenants_address DEFAULT N'';
IF COL_LENGTH(N'dbo.Tenants', N'pharmacistName') IS NULL
  ALTER TABLE dbo.Tenants ADD pharmacistName NVARCHAR(200) NOT NULL CONSTRAINT DF_Tenants_pharmacist DEFAULT N'';
IF COL_LENGTH(N'dbo.Tenants', N'pharmacistLicense') IS NULL
  ALTER TABLE dbo.Tenants ADD pharmacistLicense NVARCHAR(100) NOT NULL CONSTRAINT DF_Tenants_pharmLic DEFAULT N'';
IF COL_LENGTH(N'dbo.Tenants', N'readOnly') IS NULL
  ALTER TABLE dbo.Tenants ADD readOnly BIT NOT NULL CONSTRAINT DF_Tenants_readOnly DEFAULT 0;
IF COL_LENGTH(N'dbo.Tenants', N'supportNotes') IS NULL
  ALTER TABLE dbo.Tenants ADD supportNotes NVARCHAR(1000) NOT NULL CONSTRAINT DF_Tenants_notes DEFAULT N'';
IF COL_LENGTH(N'dbo.Users', N'lastLoginAt') IS NULL
  ALTER TABLE dbo.Users ADD lastLoginAt DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.Users', N'failedLogins') IS NULL
  ALTER TABLE dbo.Users ADD failedLogins INT NOT NULL CONSTRAINT DF_Users_failed DEFAULT 0;
IF COL_LENGTH(N'dbo.Users', N'lockedAt') IS NULL
  ALTER TABLE dbo.Users ADD lockedAt DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.Users', N'forceOtp') IS NULL
  ALTER TABLE dbo.Users ADD forceOtp BIT NOT NULL CONSTRAINT DF_Users_forceOtp DEFAULT 0;
IF COL_LENGTH(N'dbo.Users', N'otpHash') IS NULL
  ALTER TABLE dbo.Users ADD otpHash NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.Users', N'otpExpiresAt') IS NULL
  ALTER TABLE dbo.Users ADD otpExpiresAt DATETIME2(3) NULL;
GO

IF OBJECT_ID(N'dbo.PlatformRoles', N'U') IS NULL
CREATE TABLE dbo.PlatformRoles (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  code NVARCHAR(64) NOT NULL UNIQUE,
  nameAr NVARCHAR(200) NOT NULL,
  nameEn NVARCHAR(200) NOT NULL
);
IF OBJECT_ID(N'dbo.PlatformPermissions', N'U') IS NULL
CREATE TABLE dbo.PlatformPermissions (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  code NVARCHAR(100) NOT NULL UNIQUE,
  nameAr NVARCHAR(200) NOT NULL,
  nameEn NVARCHAR(200) NOT NULL
);
IF OBJECT_ID(N'dbo.PlatformRolePermissions', N'U') IS NULL
CREATE TABLE dbo.PlatformRolePermissions (
  roleId UNIQUEIDENTIFIER NOT NULL,
  permissionId UNIQUEIDENTIFIER NOT NULL,
  CONSTRAINT PK_PlatformRolePermissions PRIMARY KEY (roleId, permissionId),
  CONSTRAINT FK_Prp_Role FOREIGN KEY (roleId) REFERENCES dbo.PlatformRoles(id),
  CONSTRAINT FK_Prp_Perm FOREIGN KEY (permissionId) REFERENCES dbo.PlatformPermissions(id)
);
IF OBJECT_ID(N'dbo.PlatformUsers', N'U') IS NULL
CREATE TABLE dbo.PlatformUsers (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  email NVARCHAR(320) NOT NULL UNIQUE,
  displayName NVARCHAR(200) NOT NULL,
  passwordHash NVARCHAR(255) NOT NULL,
  roleId UNIQUEIDENTIFIER NOT NULL,
  isActive BIT NOT NULL CONSTRAINT DF_PlatformUsers_active DEFAULT 1,
  lastLoginAt DATETIME2(3) NULL,
  failedLogins INT NOT NULL CONSTRAINT DF_PlatformUsers_failed DEFAULT 0,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_PlatformUsers_created DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2(3) NULL,
  rowVersion ROWVERSION,
  CONSTRAINT FK_PlatformUsers_Role FOREIGN KEY (roleId) REFERENCES dbo.PlatformRoles(id)
);
GO

IF OBJECT_ID(N'dbo.Plans', N'U') IS NULL
CREATE TABLE dbo.Plans (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  code NVARCHAR(32) NOT NULL UNIQUE,
  tenantType NVARCHAR(32) NOT NULL,
  nameAr NVARCHAR(200) NOT NULL,
  nameEn NVARCHAR(200) NOT NULL,
  monthlyPrice DECIMAL(18,2) NOT NULL,
  yearlyPrice DECIMAL(18,2) NOT NULL,
  setupFee DECIMAL(18,2) NOT NULL CONSTRAINT DF_Plans_setup DEFAULT 0,
  headOfficeFee DECIMAL(18,2) NOT NULL CONSTRAINT DF_Plans_ho DEFAULT 0,
  features NVARCHAR(MAX) NOT NULL,
  limits NVARCHAR(MAX) NOT NULL,
  isActive BIT NOT NULL CONSTRAINT DF_Plans_active DEFAULT 1
);
IF OBJECT_ID(N'dbo.SubscriptionRequests', N'U') IS NULL
CREATE TABLE dbo.SubscriptionRequests (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  status NVARCHAR(32) NOT NULL,
  tradeNameAr NVARCHAR(200) NOT NULL,
  tradeNameEn NVARCHAR(200) NOT NULL,
  ownerName NVARCHAR(200) NOT NULL,
  ownerPhone NVARCHAR(20) NOT NULL,
  ownerEmail NVARCHAR(320) NOT NULL,
  pharmacistName NVARCHAR(200) NOT NULL,
  pharmacistLicense NVARCHAR(100) NOT NULL,
  pharmacyLicense NVARCHAR(100) NOT NULL,
  stateName NVARCHAR(100) NOT NULL,
  city NVARCHAR(100) NOT NULL,
  addressLine NVARCHAR(300) NOT NULL,
  planCode NVARCHAR(32) NOT NULL,
  branchCount INT NOT NULL,
  userCount INT NOT NULL,
  deviceCount INT NOT NULL,
  note NVARCHAR(1000) NOT NULL CONSTRAINT DF_SubReq_note DEFAULT N'',
  rejectionReason NVARCHAR(500) NOT NULL CONSTRAINT DF_SubReq_reject DEFAULT N'',
  tenantId UNIQUEIDENTIFIER NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_SubReq_created DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2(3) NULL
);
IF OBJECT_ID(N'dbo.VerificationDocuments', N'U') IS NULL
CREATE TABLE dbo.VerificationDocuments (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  requestId UNIQUEIDENTIFIER NULL,
  tenantId UNIQUEIDENTIFIER NULL,
  kind NVARCHAR(40) NOT NULL,
  licenseNumber NVARCHAR(100) NOT NULL,
  expiresOn DATE NULL,
  status NVARCHAR(32) NOT NULL,
  fileName NVARCHAR(200) NOT NULL CONSTRAINT DF_VerDoc_file DEFAULT N'',
  content NVARCHAR(MAX) NULL,
  verifiedBy UNIQUEIDENTIFIER NULL,
  verifiedAt DATETIME2(3) NULL,
  rejectionReason NVARCHAR(500) NOT NULL CONSTRAINT DF_VerDoc_reject DEFAULT N'',
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_VerDoc_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.Subscriptions', N'U') IS NULL
CREATE TABLE dbo.Subscriptions (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  tenantId UNIQUEIDENTIFIER NOT NULL,
  planCode NVARCHAR(32) NOT NULL,
  status NVARCHAR(32) NOT NULL,
  cycle NVARCHAR(16) NOT NULL,
  trialEndsAt DATETIME2(3) NULL,
  currentPeriodEnd DATETIME2(3) NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Subs_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.SubscriptionInvoices', N'U') IS NULL
CREATE TABLE dbo.SubscriptionInvoices (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  tenantId UNIQUEIDENTIFIER NOT NULL,
  subscriptionId UNIQUEIDENTIFIER NULL,
  amount DECIMAL(18,2) NOT NULL,
  status NVARCHAR(32) NOT NULL,
  dueAt DATETIME2(3) NOT NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_SubInv_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.PaymentProofs', N'U') IS NULL
CREATE TABLE dbo.PaymentProofs (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  invoiceId UNIQUEIDENTIFIER NOT NULL,
  method NVARCHAR(32) NOT NULL,
  status NVARCHAR(32) NOT NULL,
  fileName NVARCHAR(200) NOT NULL CONSTRAINT DF_PayProof_file DEFAULT N'',
  note NVARCHAR(500) NOT NULL CONSTRAINT DF_PayProof_note DEFAULT N'',
  reviewedBy UNIQUEIDENTIFIER NULL,
  reviewedAt DATETIME2(3) NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_PayProof_created DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID(N'dbo.Partners', N'U') IS NULL
CREATE TABLE dbo.Partners (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  name NVARCHAR(200) NOT NULL,
  partnerType NVARCHAR(40) NOT NULL,
  contactName NVARCHAR(200) NOT NULL,
  phone NVARCHAR(20) NOT NULL,
  email NVARCHAR(320) NOT NULL,
  status NVARCHAR(32) NOT NULL,
  modules NVARCHAR(500) NOT NULL CONSTRAINT DF_Partners_modules DEFAULT N'',
  notes NVARCHAR(1000) NOT NULL CONSTRAINT DF_Partners_notes DEFAULT N'',
  tenantIds NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Partners_tenants DEFAULT N'[]',
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Partners_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.PartnerLicenses', N'U') IS NULL
CREATE TABLE dbo.PartnerLicenses (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  partnerId UNIQUEIDENTIFIER NOT NULL,
  licenseNumber NVARCHAR(100) NOT NULL,
  fileName NVARCHAR(200) NOT NULL CONSTRAINT DF_PartLic_file DEFAULT N'',
  issuedOn DATE NULL,
  expiresOn DATE NOT NULL,
  status NVARCHAR(32) NOT NULL,
  CONSTRAINT FK_PartLic_Partner FOREIGN KEY (partnerId) REFERENCES dbo.Partners(id)
);
IF OBJECT_ID(N'dbo.GlobalCatalogItems', N'U') IS NULL
CREATE TABLE dbo.GlobalCatalogItems (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  code NVARCHAR(64) NOT NULL UNIQUE,
  itemType NVARCHAR(32) NOT NULL,
  nameAr NVARCHAR(200) NOT NULL,
  nameEn NVARCHAR(200) NOT NULL,
  genericName NVARCHAR(200) NOT NULL,
  strength NVARCHAR(80) NOT NULL CONSTRAINT DF_Gci_strength DEFAULT N'',
  dosageForm NVARCHAR(80) NOT NULL CONSTRAINT DF_Gci_form DEFAULT N'',
  manufacturer NVARCHAR(200) NOT NULL CONSTRAINT DF_Gci_mfr DEFAULT N'',
  country NVARCHAR(80) NOT NULL CONSTRAINT DF_Gci_country DEFAULT N'',
  categoryName NVARCHAR(200) NOT NULL CONSTRAINT DF_Gci_cat DEFAULT N'',
  atcCode NVARCHAR(16) NOT NULL CONSTRAINT DF_Gci_atc DEFAULT N'',
  isControlled BIT NOT NULL CONSTRAINT DF_Gci_ctrl DEFAULT 0,
  requiresPrescription BIT NOT NULL CONSTRAINT DF_Gci_rx DEFAULT 0,
  storageCondition NVARCHAR(200) NOT NULL CONSTRAINT DF_Gci_store DEFAULT N'',
  status NVARCHAR(32) NOT NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Gci_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.GlobalCatalogBarcodes', N'U') IS NULL
CREATE TABLE dbo.GlobalCatalogBarcodes (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  itemId UNIQUEIDENTIFIER NOT NULL,
  code NVARCHAR(32) NOT NULL,
  CONSTRAINT FK_Gcb_Item FOREIGN KEY (itemId) REFERENCES dbo.GlobalCatalogItems(id)
);
IF OBJECT_ID(N'dbo.GlobalCatalogUnits', N'U') IS NULL
CREATE TABLE dbo.GlobalCatalogUnits (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  itemId UNIQUEIDENTIFIER NOT NULL,
  unitName NVARCHAR(40) NOT NULL,
  factorToBase INT NOT NULL,
  CONSTRAINT FK_Gcu_Item FOREIGN KEY (itemId) REFERENCES dbo.GlobalCatalogItems(id)
);
IF OBJECT_ID(N'dbo.NewCatalogItemRequests', N'U') IS NULL
CREATE TABLE dbo.NewCatalogItemRequests (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  tenantId UNIQUEIDENTIFIER NOT NULL,
  branchId UNIQUEIDENTIFIER NULL,
  requestedBy UNIQUEIDENTIFIER NULL,
  nameAr NVARCHAR(200) NOT NULL,
  nameEn NVARCHAR(200) NOT NULL,
  genericName NVARCHAR(200) NOT NULL,
  barcode NVARCHAR(32) NOT NULL CONSTRAINT DF_Ncir_barcode DEFAULT N'',
  note NVARCHAR(500) NOT NULL CONSTRAINT DF_Ncir_note DEFAULT N'',
  status NVARCHAR(32) NOT NULL,
  decisionNote NVARCHAR(500) NOT NULL CONSTRAINT DF_Ncir_decision DEFAULT N'',
  mergedItemId UNIQUEIDENTIFIER NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Ncir_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.PlatformAuditLogs', N'U') IS NULL
CREATE TABLE dbo.PlatformAuditLogs (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  actorId UNIQUEIDENTIFIER NULL,
  action NVARCHAR(80) NOT NULL,
  entityType NVARCHAR(80) NOT NULL,
  entityId NVARCHAR(64) NOT NULL,
  reason NVARCHAR(500) NOT NULL CONSTRAINT DF_Pal_reason DEFAULT N'',
  details NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Pal_details DEFAULT N'{}',
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Pal_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.ImpersonationGrants', N'U') IS NULL
CREATE TABLE dbo.ImpersonationGrants (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  codeHash NVARCHAR(128) NOT NULL,
  tenantId UNIQUEIDENTIFIER NOT NULL,
  userId UNIQUEIDENTIFIER NOT NULL,
  reason NVARCHAR(500) NOT NULL,
  expiresAt DATETIME2(3) NOT NULL,
  usedAt DATETIME2(3) NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Imp_created DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.TenantAdminInvites', N'U') IS NULL
CREATE TABLE dbo.TenantAdminInvites (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  tenantId UNIQUEIDENTIFIER NOT NULL,
  email NVARCHAR(320) NOT NULL,
  displayName NVARCHAR(200) NOT NULL,
  status NVARCHAR(32) NOT NULL,
  createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Tai_created DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Plans WHERE code = N'BASIC')
INSERT INTO dbo.Plans (id, code, tenantType, nameAr, nameEn, monthlyPrice, yearlyPrice, setupFee, headOfficeFee, features, limits)
VALUES
(NEWID(), N'BASIC', N'INDIVIDUAL', N'أساسي', N'Basic', 12000, 120000, 60000, 0, N'["POS","INVENTORY","EXPIRY","PRICING","BASIC_REPORTS"]', N'{"maxDevices":1,"maxBranches":1,"maxUsers":5}'),
(NEWID(), N'PRO', N'INDIVIDUAL', N'احترافي', N'Pro', 24000, 240000, 60000, 0, N'["POS","INVENTORY","EXPIRY","PRICING","PURCHASING","ACCOUNTING","INSURANCE","CONTROLLED"]', N'{"maxDevices":3,"maxBranches":1,"maxUsers":15}'),
(NEWID(), N'CHAIN', N'GROUP', N'سلسلة', N'Chain', 21000, 210000, 60000, 30000, N'["POS","INVENTORY","EXPIRY","PRICING","PURCHASING","ACCOUNTING","TRANSFERS"]', N'{"maxDevices":10,"maxBranches":20,"maxUsers":100}');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PlatformRoles WHERE code = N'SUPER_ADMIN')
BEGIN
  DECLARE @super UNIQUEIDENTIFIER = NEWID();
  DECLARE @approve UNIQUEIDENTIFIER = NEWID();
  DECLARE @catalog UNIQUEIDENTIFIER = NEWID();
  DECLARE @billing UNIQUEIDENTIFIER = NEWID();
  DECLARE @support UNIQUEIDENTIFIER = NEWID();
  DECLARE @audit UNIQUEIDENTIFIER = NEWID();
  INSERT INTO dbo.PlatformRoles (id, code, nameAr, nameEn) VALUES
  (@super, N'SUPER_ADMIN', N'مدير المنصة', N'Super admin'),
  (@approve, N'TENANT_APPROVAL_MANAGER', N'مدير اعتماد الصيدليات', N'Tenant approval'),
  (@catalog, N'CATALOG_MANAGER', N'مدير الدليل', N'Catalog manager'),
  (@billing, N'BILLING_MANAGER', N'مدير الفوترة', N'Billing manager'),
  (@support, N'SUPPORT_ADMIN', N'دعم المنصة', N'Support admin'),
  (@audit, N'COMPLIANCE_AUDITOR', N'مراجع الامتثال', N'Compliance auditor');

  DECLARE @p TABLE (id UNIQUEIDENTIFIER, code NVARCHAR(100), nameAr NVARCHAR(200), nameEn NVARCHAR(200));
  INSERT INTO @p VALUES
  (NEWID(), N'tenant.read', N'عرض الصيدليات', N'Read tenants'),
  (NEWID(), N'tenant.approve', N'اعتماد الصيدليات', N'Approve tenants'),
  (NEWID(), N'tenant.suspend', N'إيقاف الصيدليات', N'Suspend tenants'),
  (NEWID(), N'tenant.impersonate', N'الدخول نيابة', N'Impersonate'),
  (NEWID(), N'request.review', N'مراجعة الطلبات', N'Review requests'),
  (NEWID(), N'catalog.write', N'إدارة الدليل', N'Write catalog'),
  (NEWID(), N'billing.write', N'إدارة الفوترة', N'Write billing'),
  (NEWID(), N'partner.write', N'إدارة الشركاء', N'Write partners'),
  (NEWID(), N'user.manage', N'إدارة المستخدمين', N'Manage users'),
  (NEWID(), N'audit.read', N'قراءة السجل', N'Read audit');
  INSERT INTO dbo.PlatformPermissions (id, code, nameAr, nameEn) SELECT id, code, nameAr, nameEn FROM @p;

  INSERT INTO dbo.PlatformRolePermissions (roleId, permissionId)
  SELECT @super, id FROM @p;
  INSERT INTO dbo.PlatformRolePermissions (roleId, permissionId)
  SELECT @approve, id FROM @p WHERE code IN (N'tenant.read', N'tenant.approve', N'request.review');
  INSERT INTO dbo.PlatformRolePermissions (roleId, permissionId)
  SELECT @catalog, id FROM @p WHERE code IN (N'catalog.write');
  INSERT INTO dbo.PlatformRolePermissions (roleId, permissionId)
  SELECT @billing, id FROM @p WHERE code IN (N'billing.write', N'tenant.read');
  INSERT INTO dbo.PlatformRolePermissions (roleId, permissionId)
  SELECT @support, id FROM @p WHERE code IN (N'tenant.read', N'user.manage');
  INSERT INTO dbo.PlatformRolePermissions (roleId, permissionId)
  SELECT @audit, id FROM @p WHERE code IN (N'audit.read', N'tenant.read');
END
GO

IF COL_LENGTH(N'dbo.Partners', N'tenantIds') IS NULL
  ALTER TABLE dbo.Partners ADD tenantIds NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Partners_tenants DEFAULT N'[]';
GO
