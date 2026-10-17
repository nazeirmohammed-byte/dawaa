import { Navigate, Route, Routes } from 'react-router-dom';
import { SubscribePage } from '../../admin/src/screens';
import { AccountPage, AlertsPage, DashboardPage, Shell } from './DashboardPage';
import { ReportsHub } from './ReportsHub';
import { BranchesPage, CustomersPage, PosPage, PrescriptionsPage } from './HomeDash';
import { LoginPage } from './LoginPage';
import { PlatformHost } from './PlatformHost';
import { FinancePage, InventoryPage, PricesPage, PurchasingPage, SalesPage, SettingsPage, UsersPage } from './modules';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/admin/*" element={<PlatformHost />} />
      <Route
        path="/app"
        element={
          <Shell>
            <DashboardPage />
          </Shell>
        }
      />
      <Route
        path="/app/alerts"
        element={
          <Shell>
            <AlertsPage />
          </Shell>
        }
      />
      <Route path="/app/receipt" element={<Navigate to="/app/settings#receipt" replace />} />
      <Route path="/app/inventory" element={<Shell><InventoryPage /></Shell>} />
      <Route path="/app/prices" element={<Shell><PricesPage /></Shell>} />
      <Route path="/app/pos" element={<Shell><PosPage /></Shell>} />
      <Route path="/app/sales" element={<Shell><SalesPage /></Shell>} />
      <Route path="/app/purchasing" element={<Shell><PurchasingPage /></Shell>} />
      <Route path="/app/finance" element={<Shell><FinancePage /></Shell>} />
      <Route path="/app/reports" element={<Shell><ReportsHub /></Shell>} />
      <Route path="/app/account" element={<Shell><AccountPage /></Shell>} />
      <Route path="/app/users" element={<Shell><UsersPage /></Shell>} />
      <Route path="/app/settings" element={<Shell><SettingsPage /></Shell>} />
      <Route path="/app/customers" element={<Shell><CustomersPage /></Shell>} />
      <Route path="/app/prescriptions" element={<Shell><PrescriptionsPage /></Shell>} />
      <Route path="/app/branches" element={<Shell><BranchesPage /></Shell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
