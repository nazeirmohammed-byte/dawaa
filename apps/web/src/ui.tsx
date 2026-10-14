import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { applyLanguage } from './i18n';

type Toast = { id: number; tone: 'ok' | 'watch' | 'urgent' | 'info'; title: string; body: string };

type UiApi = {
  touch: boolean;
  toggleTouch: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  side: 'full' | 'icons';
  toggleSide: () => void;
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
  const [side, setSide] = useState<'full' | 'icons'>(() => (localStorage.getItem('dawaa.side') === 'icons' ? 'icons' : 'full'));
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
    document.documentElement.dataset.side = side;
    localStorage.setItem('dawaa.side', side);
  }, [side]);

  const api = useMemo<UiApi>(
    () => ({
      touch,
      toggleTouch: () => setTouch((value) => !value),
      theme,
      toggleTheme: () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
      side,
      toggleSide: () => setSide((value) => (value === 'icons' ? 'full' : 'icons')),
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
    [i18n, i18n.language, touch, theme, side],
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

export function Logo({ light = false }: { light?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="logo" style={light ? { color: '#f8fafc' } : undefined}>
      <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#c23b4a" />
        <path d="M32 12c7 7 10 12 10 19a10 10 0 1 1-20 0c0-7 3-12 10-19z" fill="#e5f6ee" />
        <rect x="28.5" y="38" width="7" height="14" rx="2" fill={light ? '#ffffff' : '#1d4e89'} />
      </svg>
      <span>
        <strong>{t('product')}</strong>
        <span className={light ? 'tagline' : undefined}>{t('tagline')}</span>
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
