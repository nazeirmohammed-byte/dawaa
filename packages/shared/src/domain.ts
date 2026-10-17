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
  tenantCode: z.string().trim().min(2).max(32),
  phone: z.string().trim().min(6).max(20),
  password: z.string().min(10).max(200),
});

export const platformLoginSchema = z.object({
  phone: z.string().trim().min(6).max(20),
  password: z.string().min(10).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const ERROR_TEXT = {
  AUTH_INVALID_CREDENTIALS: {
    ar: 'رمز الصيدلية أو الجوال أو كلمة المرور غير صحيحة',
    en: 'The pharmacy code, mobile number, or password is incorrect',
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
  DUPLICATE_PRODUCT: {
    ar: 'هذا الصنف موجود في الدليل العالمي. اختره من البحث ولا تنشئ سجلاً آخر.',
    en: 'This product is already in the global library. Select it from search instead of creating another record.',
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
  NEED_PURCHASE: {
    ar: 'اختر أمر الشراء قبل إدخال المخزون، أو سجّل رصيداً افتتاحياً بموافقة المالك.',
    en: 'Choose a purchase order before receiving stock, or record an opening balance with owner approval.',
  },
  PRICE_DATE: {
    ar: 'لا تسري قائمتان في نفس التاريخ. اجعل تاريخ القائمة بعد القائمة الحالية، أو انسخ القائمة الحالية باسم جديد ليصبح ذلك النسخ هو المستخدم في البيع.',
    en: 'Two price lists cannot be active on the same date. Start the new list after the current one, or copy the current list with a new name so that copy is the one used in sales.',
  },
  NO_SELL_PRICE: {
    ar: 'لا يوجد سعر بيع معتمد لهذا الدواء في قائمة الأسعار النشطة.',
    en: 'This medicine has no selling price on the active price list.',
  },
  NEED_INVOICE: {
    ar: 'أدخل رقم فاتورة المورد.',
    en: 'Enter the supplier invoice number.',
  },
  NEED_BATCH: {
    ar: 'تشغيلة المصنع اختيارية. إذا تُركت فارغة تُحفظ N/A.',
    en: 'Manufacturer batch is optional. A blank value is saved as N/A.',
  },
  EXPIRED: {
    ar: 'لا يدخل الدواء منتهي الصلاحية إلى المخزون القابل للبيع.',
    en: 'An expired medicine cannot enter sellable inventory.',
  },
  OVER_RECEIVE: {
    ar: 'الكمية المستلمة أكبر من المتبقي في أمر الشراء.',
    en: 'The received quantity is higher than the quantity still open on the purchase order.',
  },
  OVER_POST: {
    ar: 'الكمية أكبر من المتبقي لهذا الاستلام، أو تم إدخالها للمخزون من مستخدم آخر.',
    en: 'That quantity is above what is still waiting to be stocked, or another user already posted it.',
  },
  NOT_ON_ORDER: {
    ar: 'هذا الدواء غير موجود في أمر الشراء.',
    en: 'That medicine is not on the purchase order.',
  },
  OPENING_FORBIDDEN: {
    ar: 'الرصيد الافتتاحي وتجاوز الكمية يحتاج موافقة المالك.',
    en: 'An opening balance or an over-receipt needs the owner.',
  },
  CONDITION_OPEN: {
    ar: 'ما زال سبب التنبيه قائماً. عالج السبب ثم أغلق التنبيه.',
    en: 'The alert condition is still true. Correct it, then resolve the alert.',
  },
  SNOOZE_BLOCKED: {
    ar: 'لا يمكن تأجيل هذا التنبيه بهذه المدة.',
    en: 'This alert cannot be snoozed for that long.',
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
