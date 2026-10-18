import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { applyLanguage } from './i18n';

type Toast = { id: number; tone: 'ok' | 'watch' | 'urgent' | 'info'; title: string; body: string };

type UiApi = {
  touch: boolean;
  toggleTouch: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  sideCompact: boolean;
  toggleSideCompact: () => void;
  push: (toast: Omit<Toast, 'id'>) => void;
  language: string;
  toggleLanguage: () => void;
};

const UiContext = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const value = useContext(UiContext);
  if (!value) throw new Error('UI provider missing');
  return value;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [touch, setTouch] = useState(() => localStorage.getItem('dawaa.touch') === '1');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('dawaa.theme') === 'dark' ? 'dark' : 'light'));
  const [sideCompact, setSideCompact] = useState(() => localStorage.getItem('dawaa.side') === 'icons');
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    document.documentElement.dataset.touch = touch ? 'on' : 'off';
    localStorage.setItem('dawaa.touch', touch ? '1' : '0');
  }, [touch]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dawaa.theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.side = sideCompact ? 'icons' : 'full';
    localStorage.setItem('dawaa.side', sideCompact ? 'icons' : 'full');
  }, [sideCompact]);

  const api = useMemo<UiApi>(
    () => ({
      touch,
      toggleTouch: () => setTouch((value) => !value),
      theme,
      toggleTheme: () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
      sideCompact,
      toggleSideCompact: () => setSideCompact((value) => !value),
      push: (toast) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((current) => [...current, { ...toast, id }]);
        window.setTimeout(() => {
          setToasts((current) => current.filter((item) => item.id !== id));
        }, 4200);
      },
      language: i18n.language,
      toggleLanguage: () => {
        const next = i18n.language.startsWith('ar') ? 'en' : 'ar';
        void i18n.changeLanguage(next);
        localStorage.setItem('dawaa.lang', next);
        applyLanguage(next);
      },
    }),
    [i18n, i18n.language, touch, theme, sideCompact],
  );

  return (
    <UiContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id}>
            <i />
            <div>
              <strong>{toast.title}</strong>
              <span>{toast.body}</span>
            </div>
          </div>
        ))}
      </div>
    </UiContext.Provider>
  );
}

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dawaa-logo-grad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0B93A6" />
          <stop offset="0.52" stopColor="#087F8C" />
          <stop offset="1" stopColor="#20A684" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#dawaa-logo-grad)" />
      <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" />
      <ellipse cx="22" cy="12" rx="18" ry="8" fill="#FFFFFF" opacity="0.14" />
      <path
        d="M32 8.5c6.9 7.2 13.5 14.3 13.5 21.9a13.5 13.5 0 1 1-27 0C18.5 22.8 25.1 15.7 32 8.5Z"
        fill="#FFFFFF"
      />
      <path d="M32 23.5v13M25.5 30h13" stroke="#087F8C" strokeWidth="5" strokeLinecap="round" />
      <circle cx="26.5" cy="25.5" r="2" fill="#DFF7EF" opacity="0.9" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`logo${light ? ' logo-light' : ''}`}>
      <LogoMark />
      <span className="logo-text">
        <strong className="logo-name">
          {t('product')}
          <span className="brand-ver">2.0</span>
        </strong>
        <span className="logo-tag">{t('tagline')}</span>
      </span>
    </span>
  );
}

export function textOf(card: { titleAr: string; titleEn: string; detailAr: string; detailEn: string; figureAr: string; figureEn: string }, language: string) {
  const arabic = language.startsWith('ar');
  return {
    title: arabic ? card.titleAr : card.titleEn,
    detail: arabic ? card.detailAr : card.detailEn,
    figure: arabic ? card.figureAr : card.figureEn,
  };
}
