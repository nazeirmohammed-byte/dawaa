BEGIN TRY

BEGIN TRAN;

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- CreateTable
CREATE TABLE [dbo].[Categories] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nameAr] NVARCHAR(200) NOT NULL,
    [nameEn] NVARCHAR(200) NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Categories_isDeleted_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Categories_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [Categories_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Categories_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[Products] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [categoryId] UNIQUEIDENTIFIER NOT NULL,
    [sku] NVARCHAR(64) NOT NULL,
    [nameAr] NVARCHAR(200) NOT NULL,
    [nameEn] NVARCHAR(200) NOT NULL,
    [genericName] NVARCHAR(200) NOT NULL,
    [form] NVARCHAR(80) NOT NULL,
    [strength] NVARCHAR(80) NOT NULL,
    [reorderLevel] INT NOT NULL,
    [sellPrice] DECIMAL(18,2) NOT NULL,
    [costPrice] DECIMAL(18,2) NOT NULL,
    [isControlled] BIT NOT NULL CONSTRAINT [Products_isControlled_df] DEFAULT 0,
    [isDeleted] BIT NOT NULL CONSTRAINT [Products_isDeleted_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Products_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [Products_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Products_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id]),
    CONSTRAINT [Products_tenantId_sku_key] UNIQUE NONCLUSTERED ([tenantId],[sku])
);

-- CreateTable
CREATE TABLE [dbo].[StockLots] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [productId] UNIQUEIDENTIFIER NOT NULL,
    [batchNo] NVARCHAR(64) NOT NULL,
    [expiry] DATETIME2 NOT NULL,
    [qtyBase] INT NOT NULL,
    [location] NVARCHAR(100) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockLots_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [StockLots_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StockLots_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[StockMovements] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [productId] UNIQUEIDENTIFIER NOT NULL,
    [lotId] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(32) NOT NULL,
    [qtyBase] INT NOT NULL,
    [note] NVARCHAR(300) NOT NULL,
    [refType] NVARCHAR(32) NOT NULL,
    [refId] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockMovements_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [StockMovements_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StockMovements_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[Suppliers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nameAr] NVARCHAR(200) NOT NULL,
    [nameEn] NVARCHAR(200) NOT NULL,
    [phone] NVARCHAR(20),
    [city] NVARCHAR(100),
    [balance] DECIMAL(18,2) NOT NULL CONSTRAINT [Suppliers_balance_df] DEFAULT 0,
    [isDeleted] BIT NOT NULL CONSTRAINT [Suppliers_isDeleted_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Suppliers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [Suppliers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Suppliers_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseOrders] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [supplierId] UNIQUEIDENTIFIER NOT NULL,
    [docNo] NVARCHAR(32) NOT NULL,
    [status] NVARCHAR(32) NOT NULL,
    [total] DECIMAL(18,2) NOT NULL,
    [orderedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PurchaseOrders_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [PurchaseOrders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseOrders_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id]),
    CONSTRAINT [PurchaseOrders_tenantId_docNo_key] UNIQUE NONCLUSTERED ([tenantId],[docNo])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseLines] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [purchaseId] UNIQUEIDENTIFIER NOT NULL,
    [productId] UNIQUEIDENTIFIER NOT NULL,
    [qty] INT NOT NULL,
    [unitCost] DECIMAL(18,2) NOT NULL,
    [lineTotal] DECIMAL(18,2) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PurchaseLines_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [PurchaseLines_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseLines_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[Customers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nameAr] NVARCHAR(200) NOT NULL,
    [nameEn] NVARCHAR(200) NOT NULL,
    [phone] NVARCHAR(20),
    [balance] DECIMAL(18,2) NOT NULL CONSTRAINT [Customers_balance_df] DEFAULT 0,
    [isDeleted] BIT NOT NULL CONSTRAINT [Customers_isDeleted_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Customers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [Customers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Customers_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[Sales] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [docNo] NVARCHAR(32) NOT NULL,
    [customerName] NVARCHAR(200) NOT NULL,
    [cashierName] NVARCHAR(200) NOT NULL,
    [soldAt] DATETIME2 NOT NULL,
    [subtotal] DECIMAL(18,2) NOT NULL,
    [discount] DECIMAL(18,2) NOT NULL,
    [total] DECIMAL(18,2) NOT NULL,
    [paid] DECIMAL(18,2) NOT NULL,
    [changeDue] DECIMAL(18,2) NOT NULL,
    [paymentMethod] NVARCHAR(32) NOT NULL,
    [status] NVARCHAR(32) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Sales_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [Sales_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Sales_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id]),
    CONSTRAINT [Sales_tenantId_docNo_key] UNIQUE NONCLUSTERED ([tenantId],[docNo])
);

-- CreateTable
CREATE TABLE [dbo].[SaleLines] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [saleId] UNIQUEIDENTIFIER NOT NULL,
    [productId] UNIQUEIDENTIFIER NOT NULL,
    [nameAr] NVARCHAR(200) NOT NULL,
    [nameEn] NVARCHAR(200) NOT NULL,
    [qty] INT NOT NULL,
    [unitPrice] DECIMAL(18,2) NOT NULL,
    [lineTotal] DECIMAL(18,2) NOT NULL,
    [costTotal] DECIMAL(18,2) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SaleLines_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [SaleLines_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SaleLines_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[LedgerAccounts] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [code] NVARCHAR(16) NOT NULL,
    [nameAr] NVARCHAR(200) NOT NULL,
    [nameEn] NVARCHAR(200) NOT NULL,
    [kind] NVARCHAR(32) NOT NULL,
    [balance] DECIMAL(18,2) NOT NULL CONSTRAINT [LedgerAccounts_balance_df] DEFAULT 0,
    [isDeleted] BIT NOT NULL CONSTRAINT [LedgerAccounts_isDeleted_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LedgerAccounts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [LedgerAccounts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LedgerAccounts_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id]),
    CONSTRAINT [LedgerAccounts_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[JournalEntries] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [docNo] NVARCHAR(32) NOT NULL,
    [memoAr] NVARCHAR(300) NOT NULL,
    [memoEn] NVARCHAR(300) NOT NULL,
    [postedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [JournalEntries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [JournalEntries_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [JournalEntries_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id]),
    CONSTRAINT [JournalEntries_tenantId_docNo_key] UNIQUE NONCLUSTERED ([tenantId],[docNo])
);

-- CreateTable
CREATE TABLE [dbo].[JournalLines] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [entryId] UNIQUEIDENTIFIER NOT NULL,
    [accountId] UNIQUEIDENTIFIER NOT NULL,
    [debit] DECIMAL(18,2) NOT NULL,
    [credit] DECIMAL(18,2) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [JournalLines_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [JournalLines_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [JournalLines_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[Expenses] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [branchId] UNIQUEIDENTIFIER NOT NULL,
    [accountId] UNIQUEIDENTIFIER NOT NULL,
    [titleAr] NVARCHAR(200) NOT NULL,
    [titleEn] NVARCHAR(200) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [spentAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Expenses_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [Expenses_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Expenses_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id])
);

-- CreateTable
CREATE TABLE [dbo].[PharmacySettings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [key] NVARCHAR(64) NOT NULL,
    [valueAr] NVARCHAR(400) NOT NULL,
    [valueEn] NVARCHAR(400) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PharmacySettings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [updatedBy] UNIQUEIDENTIFIER,
    [rowVersion] timestamp,
    CONSTRAINT [PharmacySettings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PharmacySettings_tenantId_id_key] UNIQUE NONCLUSTERED ([tenantId],[id]),
    CONSTRAINT [PharmacySettings_tenantId_key_key] UNIQUE NONCLUSTERED ([tenantId],[key])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Categories_tenantId_idx] ON [dbo].[Categories]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Products_tenantId_idx] ON [dbo].[Products]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockLots_tenantId_productId_expiry_idx] ON [dbo].[StockLots]([tenantId], [productId], [expiry]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockMovements_tenantId_createdAt_idx] ON [dbo].[StockMovements]([tenantId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Suppliers_tenantId_idx] ON [dbo].[Suppliers]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrders_tenantId_idx] ON [dbo].[PurchaseOrders]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseLines_tenantId_idx] ON [dbo].[PurchaseLines]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Customers_tenantId_idx] ON [dbo].[Customers]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Sales_tenantId_soldAt_idx] ON [dbo].[Sales]([tenantId], [soldAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SaleLines_tenantId_idx] ON [dbo].[SaleLines]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LedgerAccounts_tenantId_idx] ON [dbo].[LedgerAccounts]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JournalEntries_tenantId_postedAt_idx] ON [dbo].[JournalEntries]([tenantId], [postedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JournalLines_tenantId_idx] ON [dbo].[JournalLines]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Expenses_tenantId_spentAt_idx] ON [dbo].[Expenses]([tenantId], [spentAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PharmacySettings_tenantId_idx] ON [dbo].[PharmacySettings]([tenantId]);

-- AddForeignKey
ALTER TABLE [dbo].[Categories] ADD CONSTRAINT [Categories_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Products] ADD CONSTRAINT [Products_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Products] ADD CONSTRAINT [Products_tenantId_categoryId_fkey] FOREIGN KEY ([tenantId], [categoryId]) REFERENCES [dbo].[Categories]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockLots] ADD CONSTRAINT [StockLots_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockLots] ADD CONSTRAINT [StockLots_tenantId_branchId_fkey] FOREIGN KEY ([tenantId], [branchId]) REFERENCES [dbo].[Branches]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockLots] ADD CONSTRAINT [StockLots_tenantId_productId_fkey] FOREIGN KEY ([tenantId], [productId]) REFERENCES [dbo].[Products]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockMovements] ADD CONSTRAINT [StockMovements_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockMovements] ADD CONSTRAINT [StockMovements_tenantId_branchId_fkey] FOREIGN KEY ([tenantId], [branchId]) REFERENCES [dbo].[Branches]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockMovements] ADD CONSTRAINT [StockMovements_tenantId_productId_fkey] FOREIGN KEY ([tenantId], [productId]) REFERENCES [dbo].[Products]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockMovements] ADD CONSTRAINT [StockMovements_tenantId_lotId_fkey] FOREIGN KEY ([tenantId], [lotId]) REFERENCES [dbo].[StockLots]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Suppliers] ADD CONSTRAINT [Suppliers_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseOrders] ADD CONSTRAINT [PurchaseOrders_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseOrders] ADD CONSTRAINT [PurchaseOrders_tenantId_branchId_fkey] FOREIGN KEY ([tenantId], [branchId]) REFERENCES [dbo].[Branches]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseOrders] ADD CONSTRAINT [PurchaseOrders_tenantId_supplierId_fkey] FOREIGN KEY ([tenantId], [supplierId]) REFERENCES [dbo].[Suppliers]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseLines] ADD CONSTRAINT [PurchaseLines_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseLines] ADD CONSTRAINT [PurchaseLines_tenantId_purchaseId_fkey] FOREIGN KEY ([tenantId], [purchaseId]) REFERENCES [dbo].[PurchaseOrders]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseLines] ADD CONSTRAINT [PurchaseLines_tenantId_productId_fkey] FOREIGN KEY ([tenantId], [productId]) REFERENCES [dbo].[Products]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Customers] ADD CONSTRAINT [Customers_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Sales] ADD CONSTRAINT [Sales_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Sales] ADD CONSTRAINT [Sales_tenantId_branchId_fkey] FOREIGN KEY ([tenantId], [branchId]) REFERENCES [dbo].[Branches]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SaleLines] ADD CONSTRAINT [SaleLines_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SaleLines] ADD CONSTRAINT [SaleLines_tenantId_saleId_fkey] FOREIGN KEY ([tenantId], [saleId]) REFERENCES [dbo].[Sales]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SaleLines] ADD CONSTRAINT [SaleLines_tenantId_productId_fkey] FOREIGN KEY ([tenantId], [productId]) REFERENCES [dbo].[Products]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LedgerAccounts] ADD CONSTRAINT [LedgerAccounts_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[JournalEntries] ADD CONSTRAINT [JournalEntries_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[JournalLines] ADD CONSTRAINT [JournalLines_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[JournalLines] ADD CONSTRAINT [JournalLines_tenantId_entryId_fkey] FOREIGN KEY ([tenantId], [entryId]) REFERENCES [dbo].[JournalEntries]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[JournalLines] ADD CONSTRAINT [JournalLines_tenantId_accountId_fkey] FOREIGN KEY ([tenantId], [accountId]) REFERENCES [dbo].[LedgerAccounts]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Expenses] ADD CONSTRAINT [Expenses_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Expenses] ADD CONSTRAINT [Expenses_tenantId_branchId_fkey] FOREIGN KEY ([tenantId], [branchId]) REFERENCES [dbo].[Branches]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Expenses] ADD CONSTRAINT [Expenses_tenantId_accountId_fkey] FOREIGN KEY ([tenantId], [accountId]) REFERENCES [dbo].[LedgerAccounts]([tenantId],[id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PharmacySettings] ADD CONSTRAINT [PharmacySettings_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
