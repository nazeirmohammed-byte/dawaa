-- Fail-closed tenant isolation.
-- A missing session tenant matches nothing.
-- dawaa_rls_bypass is the only other match, and that user has no login.
-- See docs/ARCHITECTURE.md.

IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'TenantIsolation')
  DROP SECURITY POLICY dbo.TenantIsolation;
GO

CREATE OR ALTER FUNCTION dbo.fn_rls_tenant(@TenantId uniqueidentifier)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT 1 AS fn_result
  WHERE
    USER_NAME() = N'dawaa_rls_bypass'
    OR @TenantId = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'TenantId'));
GO

CREATE SECURITY POLICY dbo.TenantIsolation
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Branches,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Branches AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Branches AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Users,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Users AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Users AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Roles,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Roles AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Roles AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Permissions,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Permissions AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Permissions AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.RolePermissions,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.RolePermissions AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.RolePermissions AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.UserBranchRoles,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.UserBranchRoles AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.UserBranchRoles AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.RefreshSessions,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.RefreshSessions AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.RefreshSessions AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AuditLogs,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AuditLogs AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.AuditLogs AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Devices,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Devices AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Devices AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.OperationalSignals,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.OperationalSignals AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.OperationalSignals AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ReceiptDrafts,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ReceiptDrafts AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ReceiptDrafts AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Categories,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Categories AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Categories AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Products,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Products AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Products AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.StockLots,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.StockLots AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.StockLots AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.StockMovements,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.StockMovements AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.StockMovements AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Suppliers,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Suppliers AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Suppliers AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PurchaseOrders,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PurchaseOrders AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PurchaseOrders AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PurchaseLines,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PurchaseLines AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PurchaseLines AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Customers,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Customers AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Customers AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Sales,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Sales AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Sales AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.SaleLines,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.SaleLines AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.SaleLines AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.LedgerAccounts,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.LedgerAccounts AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.LedgerAccounts AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.JournalEntries,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.JournalEntries AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.JournalEntries AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.JournalLines,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.JournalLines AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.JournalLines AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Expenses,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Expenses AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.Expenses AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PharmacySettings,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PharmacySettings AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PharmacySettings AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceLists,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceLists AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceLists AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.BranchPriceActivations,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.BranchPriceActivations AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.BranchPriceActivations AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ProductPrices,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ProductPrices AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ProductPrices AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ExchangeRates,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ExchangeRates AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.ExchangeRates AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceListChangeBatches,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceListChangeBatches AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceListChangeBatches AFTER UPDATE,
  ADD FILTER PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceHistories,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceHistories AFTER INSERT,
  ADD BLOCK PREDICATE dbo.fn_rls_tenant(tenantId) ON dbo.PriceHistories AFTER UPDATE
WITH (STATE = ON);
GO
