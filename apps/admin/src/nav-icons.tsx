import {
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Library,
  LogOut,
  Package,
  PackagePlus,
  Receipt,
  Settings,
  Shield,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  board: LayoutDashboard,
  pharmacies: Store,
  accounts: Users,
  library: Library,
  catalog: Package,
  requests: PackagePlus,
  plans: CreditCard,
  invoices: Receipt,
  proofs: FileText,
  partners: Building2,
  users: Shield,
  audit: ClipboardList,
  settings: Settings,
  logout: LogOut,
  groupAccounts: Store,
  groupMedicine: Package,
  groupBilling: CreditCard,
  groupSystem: Settings,
};

const ART: Record<string, string> = {
  catalog: '/assets/medicine-illustrations/tablets.svg',
  library: '/assets/medicine-illustrations/capsules.svg',
  requests: '/assets/medicine-illustrations/syrup.svg',
  pharmacies: '/assets/medicine-illustrations/generic.svg',
  groupMedicine: '/assets/medicine-illustrations/tablets.svg',
  groupAccounts: '/assets/medicine-illustrations/equipment.svg',
};

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const src = ART[name];
  if (src) {
    return <img className="nav-ico-img" src={src} width={size} height={size} alt="" aria-hidden="true" />;
  }
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className="nav-ico-lucide" size={size} strokeWidth={2} aria-hidden="true" />;
}
