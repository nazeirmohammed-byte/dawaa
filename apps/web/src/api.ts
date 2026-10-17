import i18n from './i18n';

export class ApiError extends Error {
  readonly fields: Record<string, string>;
  constructor(
    message: string,
    readonly status: number,
    readonly code = '',
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.fields = fields;
  }
}

function fieldsOf(details: unknown): Record<string, string> {
  if (!details || typeof details !== 'object') return {};
  const fields = (details as { fields?: unknown }).fields;
  if (!fields || typeof fields !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('accept-language', i18n.language);
  const branch = localStorage.getItem('dawaa.branch');
  if (branch) headers.set('x-dawaa-branch', branch);
  if (init?.body) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; code?: string; details?: unknown } | null;
    throw new ApiError(
      body?.message ?? i18n.t('empty'),
      response.status,
      body?.code ?? '',
      fieldsOf(body?.details),
    );
  }
  return response.json() as Promise<T>;
}

export type Profile = {
  user: { id: string; displayName: string; email: string | null; phone: string | null };
  tenant: {
    tradeNameAr: string;
    tradeNameEn: string | null;
    status: string;
    trialEndsAt: string | null;
    accountCode?: string;
  };
  branch: { id: string; nameAr: string; nameEn: string | null } | null;
  role: { code: string; nameAr: string; nameEn: string } | null;
  permissions?: string[];
  network: {
    management: 'INDEPENDENT' | 'SHARED';
    branchLimit: number;
    canViewAll: boolean;
    branches: { id: string; nameAr: string; nameEn: string | null; isHeadOffice: boolean }[];
  };
};

export type BoardCard = {
  id: string;
  lane: string;
  severity: string;
  code: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  figureAr: string;
  figureEn: string;
};

export type HomeBoard = {
  salesToday: string;
  salesCount: number;
  purchasesMonth: string;
  lowCount: number;
  expiredCount: number;
  days: { date: string; total: string; count: number; heightPct: number; countPct: number }[];
  branches: { id: string; nameAr: string; nameEn: string; salesToday: string; alertCount: number }[];
  lowStock: { id: string; nameAr: string; nameEn: string; qty: number; reorderLevel: number }[];
  expiry: { nameAr: string; nameEn: string; batchNo: string; expiry: string; qty: number; daysLeft: number }[];
  purchases: { docNo: string; supplierAr: string; supplierEn: string; orderedAt: string; total: string; status: string }[];
  stocking?: {
    pendingReceipts: number;
    receivedLines: number;
    awaitingPosting: number;
    fullyStocked: number;
    pendingQty: number;
    availableQty: number;
    newlyStocked: number;
  } | null;
  sales: { soldAt: string; docNo: string; customerName: string; total: string; paymentMethod: string; status: string }[];
  accounts: { receiptsToday: string; paymentsToday: string; customerDue: string; supplierDue: string };
  customers: { nameAr: string; nameEn: string; balance: string }[];
  products: {
    id: string;
    nameAr: string;
    nameEn: string;
    genericName: string;
    sku: string;
    form: string;
    sellPrice: string;
    qty: number;
    pack?: { outer: 'BOX' | 'STRIP' | 'BOTTLE' | 'PIECE'; inner: 'STRIP' | 'BOTTLE' | 'PIECE'; perBox: number; perInner: number } | null;
  }[];
};

export type Board = {
  kpis: BoardCard[];
  inventory: BoardCard[];
  procurement: BoardCard[];
  marketing: BoardCard[];
  alerts: BoardCard[];
  home: HomeBoard;
};

export type ReceiptLine = {
  nameAr: string;
  nameEn: string;
  qty: string;
  unitAr: string;
  unitEn: string;
  price: string;
  total: string;
};

export type ReceiptPreview = {
  pharmacyAr: string;
  pharmacyEn: string | null;
  branchAr: string;
  branchEn: string | null;
  phone: string | null;
  receiptNo: string;
  cashierName: string;
  soldAt: string;
  lines: ReceiptLine[];
  subtotal: string;
  discount: string;
  total: string;
  paid: string;
  changeDue: string;
  paymentMethod: string;
  widthMm: number;
  footerAr?: string;
  footerEn?: string;
  showPhone?: boolean;
};
