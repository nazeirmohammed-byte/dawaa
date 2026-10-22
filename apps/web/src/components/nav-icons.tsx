import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  FileBarChart,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { medicineArtSrc } from '../design-system/medicine-art';

const ICONS: Record<string, LucideIcon> = {
  control: LayoutDashboard,
  quickPos: ShoppingCart,
  sales: Receipt,
  medicines: Package,
  inventory: Package,
  alerts: AlertTriangle,
  prices: CircleDollarSign,
  procurement: Truck,
  suppliers: Store,
  customers: Users,
  prescriptions: Stethoscope,
  accounts: Wallet,
  finance: Wallet,
  reports: FileBarChart,
  branches: Building2,
  users: Users,
  permissions: ShieldCheck,
  settings: Settings,
  support: LifeBuoy,
  logout: LogOut,
  collapse: PanelLeftClose,
  expand: PanelLeftOpen,
  groupSell: ShoppingCart,
  groupStock: Package,
  groupBuy: Truck,
  groupPeople: Users,
  groupMoney: Wallet,
  groupSetup: Settings,
};

const ART: Record<string, string> = {
  quickPos: medicineArtSrc('syrup'),
  sales: medicineArtSrc('tablets'),
  medicines: medicineArtSrc('tablets'),
  inventory: medicineArtSrc('syrup'),
  prices: medicineArtSrc('sachet'),
  alerts: medicineArtSrc('generic'),
  procurement: medicineArtSrc('infusion'),
  prescriptions: medicineArtSrc('capsules'),
  groupSell: medicineArtSrc('syrup'),
  groupStock: medicineArtSrc('tablets'),
  groupBuy: medicineArtSrc('infusion'),
  groupPeople: medicineArtSrc('capsules'),
};

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const src = ART[name];
  if (src) {
    return <img className="nav-ico-img" src={src} width={size} height={size} alt="" aria-hidden="true" />;
  }
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className="nav-ico-lucide" size={size} strokeWidth={2} aria-hidden="true" />;
}
