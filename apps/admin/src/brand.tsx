import type { PlatformLang } from './locale';
import { tx } from './locale';

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dawaa-admin-logo-grad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0B93A6" />
          <stop offset="0.52" stopColor="#087F8C" />
          <stop offset="1" stopColor="#20A684" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#dawaa-admin-logo-grad)" />
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

export function BrandLogo({ lang, light = false }: { lang: PlatformLang; light?: boolean }) {
  return (
    <span className={`logo${light ? ' logo-light' : ''}`}>
      <LogoMark />
      <span className="logo-text">
        <strong className="logo-name">
          {tx(lang, 'دواء', 'Dawaa')}
          <span className="brand-ver">2.0</span>
        </strong>
        <span className="logo-tag">{tx(lang, 'لوحة المالك', 'Owner console')}</span>
      </span>
    </span>
  );
}
