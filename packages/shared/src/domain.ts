import { z } from 'zod';

export const TENANT_TYPES = ['INDIVIDUAL', 'GROUP'] as const;
export const TENANT_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'] as const;
export const DB_MODES = ['SHARED', 'DEDICATED'] as const;

export const ROLE_CODES = [
  'OWNER',
  'BRANCH_MANAGER',
  'PHARMACIST',
  'ASSISTANT_PHARMACIST',
  'CASHIER',
  'STOREKEEPER',
  'ACCOUNTANT',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSIONS = [
  'dashboard.view',
  'pos.sell',
  'discount.apply',
  'discount.over_limit',
  'price.edit',
  'invoice.void',
  'stock.adjust',
  'stock.count',
  'purchasing.receive',
  'purchasing.approve',
  'controlled.dispense',
  'accounting.view',
  'accounting.post',
  'users.manage',
  'settings.manage',
  'reports.view',
  'reports.export',
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

const ALL: readonly PermissionCode[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  OWNER: ALL,
  BRANCH_MANAGER: ALL.filter((code) => code !== 'users.manage'),
  PHARMACIST: [
    'dashboard.view',
    'pos.sell',
    'discount.apply',
    'controlled.dispense',
    'stock.count',
    'reports.view',
  ],
  ASSISTANT_PHARMACIST: ['dashboard.view', 'pos.sell', 'discount.apply', 'stock.count'],
  CASHIER: ['dashboard.view', 'pos.sell', 'discount.apply'],
  STOREKEEPER: [
    'dashboard.view',
    'stock.adjust',
    'stock.count',
    'purchasing.receive',
    'reports.view',
  ],
  ACCOUNTANT: ['dashboard.view', 'accounting.view', 'accounting.post', 'reports.view', 'reports.export'],
};

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(10).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const ERROR_TEXT = {
  AUTH_INVALID_CREDENTIALS: {
    ar: 'بيانات الدخول غير صحيحة',
    en: 'The email, phone, or password is incorrect',
  },
  ACCOUNT_DISABLED: {
    ar: 'هذا الحساب موقوف. راجع مدير الصيدلية.',
    en: 'This account is disabled. Ask the pharmacy owner.',
  },
  TENANT_CANCELLED: {
    ar: 'اشتراك هذه الصيدلية ملغى.',
    en: 'This pharmacy subscription is cancelled.',
  },
  AWAITING_APPROVAL: {
    ar: 'الحساب بانتظار موافقة المنصة. يمكنك الدخول بعد الاعتماد.',
    en: 'This account is waiting for platform approval. You can sign in after it is approved.',
  },
  SIGNUP_REJECTED: {
    ar: 'رفضت المنصة هذا الحساب. لا يمكن الدخول.',
    en: 'The platform rejected this account. Sign-in is closed.',
  },
  TENANT_READ_ONLY: {
    ar: 'الصيدلية مقفلة للقراءة فقط.',
    en: 'This pharmacy is locked to read-only.',
  },
  REQUEST_STEP: {
    ar: 'لا يمكن نقل الطلب إلى هذه الحالة.',
    en: 'That request status change is not allowed.',
  },
  VERIFICATION_REQUIRED: {
    ar: 'لا يمكن التفعيل قبل اكتمال التحقق من الترخيص.',
    en: 'Verification must be completed before activation.',
  },
  PARTNER_EXPIRED: {
    ar: 'رخصة الشريك منتهية.',
    en: 'The partner license is expired.',
  },
  OTP_REQUIRED: {
    ar: 'أدخل رمز التحقق الذي أرسله مدير المنصة.',
    en: 'Enter the one-time code from the platform admin.',
  },
  UNAUTHORIZED: {
    ar: 'يلزم تسجيل الدخول.',
    en: 'Sign in to continue.',
  },
  FEATURE_DISABLED: {
    ar: 'هذه الميزة غير مشمولة في الخطة الحالية.',
    en: 'This feature is not included in the current plan.',
  },
  VALIDATION_ERROR: {
    ar: 'تحقق من الحقول وأعد المحاولة.',
    en: 'Check the fields and try again.',
  },
  RATE_LIMITED: {
    ar: 'محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.',
    en: 'Too many attempts. Wait a minute and try again.',
  },
  INTERNAL: {
    ar: 'حدث خطأ غير متوقع.',
    en: 'Something went wrong.',
  },
  NOT_FOUND: {
    ar: 'العنصر غير موجود.',
    en: 'That item was not found.',
  },
  STOCK_SHORT: {
    ar: 'الكمية غير متوفرة في التشغيلات السارية.',
    en: 'That quantity is not available in unexpired batches.',
  },
  UNBALANCED: {
    ar: 'القيد غير متوازن.',
    en: 'The journal entry does not balance.',
  },
  BRANCH_LIMIT: {
    ar: 'عدد الفروع بلغ حد الاشتراك.',
    en: 'The subscription branch limit is reached.',
  },
  PICK_BRANCH: {
    ar: 'اختر فرعاً قبل تسجيل الحركة. عرض كل الفروع للقراءة فقط.',
    en: 'Choose one branch before recording a movement. All-branches is read only.',
  },
} as const;

export type ErrorCode = keyof typeof ERROR_TEXT;

export function prefersArabic(acceptLanguage: string | undefined): boolean {
  if (!acceptLanguage) return true;
  const first = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('en')) return false;
  return true;
}

export function errorMessage(code: string, acceptLanguage: string | undefined): string {
  const arabic = prefersArabic(acceptLanguage);
  const known = ERROR_TEXT[code as ErrorCode];
  if (!known) return arabic ? ERROR_TEXT.INTERNAL.ar : ERROR_TEXT.INTERNAL.en;
  return arabic ? known.ar : known.en;
}

export function assertFeature(flags: readonly string[], feature: string): void {
  if (!flags.includes(feature)) {
    const error = new Error('FEATURE_DISABLED');
    error.name = 'FeatureDisabledError';
    throw error;
  }
}
