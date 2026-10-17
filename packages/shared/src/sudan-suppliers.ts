/**
 * Sudan-based pharmaceutical companies and suppliers.
 * Copied onto every pharmacy when the account is opened.
 * South Sudan distributors are not included. Bayer is omitted because the
 * published address is Cairo, not a Sudan depot.
 * Phones are the published switchboard numbers, digits only, within 20 characters.
 */
export type SudanSupplier = {
  nameAr: string;
  nameEn: string;
  phone: string | null;
  city: string;
};

export const SUDAN_SUPPLIERS: readonly SudanSupplier[] = [
  { nameAr: 'عبد المنعم للصناعات الطبية', nameEn: 'Abdel Moneim Medical Industries', phone: '249183780706', city: 'الخرطوم' },
  { nameAr: 'الفرات الطبية', nameEn: 'Alforat Medical', phone: '249912307680', city: 'الخرطوم' },
  { nameAr: 'أميفارما', nameEn: 'Amipharma', phone: '249325199', city: 'بحري' },
  { nameAr: 'المصنع العربي للأدوية', nameEn: 'Arab Factory for Drugs', phone: '249183744469', city: 'الخرطوم' },
  { nameAr: 'أزال للصناعات الدوائية', nameEn: 'Azal Pharmaceutical Industries', phone: '249185322770', city: 'بحري' },
  { nameAr: 'باش فارما', nameEn: 'Bash Pharma', phone: '249120906091', city: 'الخرطوم' },
  { nameAr: 'النيل الأزرق للأدوية', nameEn: 'Blue Nile Pharmaceuticals', phone: '249185317776', city: 'الخرطوم' },
  { nameAr: 'مجموعة دال', nameEn: 'DAL Group', phone: '249185444130', city: 'بحري' },
  { nameAr: 'الشركة العامة للأدوية', nameEn: 'General Medicine Company', phone: '249154952870', city: 'الخرطوم' },
  { nameAr: 'حكمة', nameEn: 'Hikma', phone: '249156552300', city: 'الخرطوم' },
  { nameAr: 'هيومفيت للأدوية', nameEn: 'Humavet Drugs', phone: '249185336846', city: 'بحري' },
  { nameAr: 'كينغستون', nameEn: 'Kingstone Holding', phone: '249185317776', city: 'الخرطوم' },
  { nameAr: 'مصنع ليليام', nameEn: 'Liliam Pharmaceutical Factory', phone: null, city: 'الخرطوم' },
  { nameAr: 'لوناتوس الطبية', nameEn: 'Lunatus Medical', phone: '249183280299', city: 'الخرطوم' },
  { nameAr: 'فارمالاند', nameEn: 'PharmaLand Pharmaceuticals', phone: null, city: 'الباقير' },
  { nameAr: 'شنغهاي السودان للأدوية', nameEn: 'Shanghai-Sudan Pharmaceutical', phone: '249912880780', city: 'بحري' },
  { nameAr: 'تبوك للأدوية', nameEn: 'Tabuk Pharmaceuticals', phone: '249185335244', city: 'بحري' },
];

const SYSTEM_NAMES = new Set(SUDAN_SUPPLIERS.map((row) => row.nameEn));

export function isSystemSupplier(nameEn: string): boolean {
  return SYSTEM_NAMES.has(nameEn);
}

export function missingSudanSuppliers(existingNameEn: Iterable<string>): SudanSupplier[] {
  const have = new Set(existingNameEn);
  return SUDAN_SUPPLIERS.filter((row) => !have.has(row.nameEn));
}
