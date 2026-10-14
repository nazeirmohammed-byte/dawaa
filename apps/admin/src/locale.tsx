import { createContext, useContext, type ReactNode } from 'react';

export type PlatformLang = 'ar' | 'en';

type LangValue = { lang: PlatformLang; toggle: () => void };

const LangContext = createContext<LangValue>({ lang: 'ar', toggle: () => undefined });

export function LangProvider({ value, children }: { value: LangValue; children: ReactNode }) {
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function usePlatformLang(): LangValue {
  return useContext(LangContext);
}

export function tx(lang: PlatformLang, ar: string, en: string): string {
  return lang === 'ar' ? ar : en;
}
