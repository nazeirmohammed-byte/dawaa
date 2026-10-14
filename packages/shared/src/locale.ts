export const KHARTOUM_TZ = 'Africa/Khartoum';

const ARABIC_INDIC = /[\u0660-\u0669\u06F0-\u06F9]/;

export function directionFor(language: string): 'rtl' | 'ltr' {
  return language.toLowerCase().startsWith('ar') ? 'rtl' : 'ltr';
}

export function formatKhartoum(iso: string, language: string): string {
  const locale = language.toLowerCase().startsWith('ar') ? 'ar-SD-u-nu-latn' : 'en-GB';
  return new Intl.DateTimeFormat(locale, {
    timeZone: KHARTOUM_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function usesWesternDigits(value: string): boolean {
  return !ARABIC_INDIC.test(value);
}
