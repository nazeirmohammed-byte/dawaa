import type { PlatformLang } from './locale';
import { tx } from './locale';

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dawaa-admin-logo-grad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="0.55" stopColor="#3F4FD8" />
          <stop offset="1" stopColor="#1A2347" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#dawaa-admin-logo-grad)" />
      <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" />
      <path d="M18 32h28M32 18v28" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLogo({ lang, light = false }: { lang: PlatformLang; light?: boolean }) {
  return (
    <span className={`logo${light ? ' logo-light' : ''}`}>
      <LogoMark />
      <span className="logo-text">
        <strong className="logo-name">
          {tx(lang, 'دواء', 'Dawaa')}
          <span className="brand-ver">{tx(lang, 'إدارة', 'Admin')}</span>
        </strong>
        <span className="logo-tag">{tx(lang, 'منصة الإدارة', 'Platform admin')}</span>
      </span>
    </span>
  );
}
