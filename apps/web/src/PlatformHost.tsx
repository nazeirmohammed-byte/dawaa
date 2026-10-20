import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AdminShell } from '../../admin/src/App';
import { api } from '../../admin/src/api';
import type { PlatformLang } from '../../admin/src/locale';
import '../../admin/src/index.css';
import i18n, { applyLanguage } from './i18n';
import { useUi } from './ui';

type PlatformMe = { id: string; displayName: string; roleCode: string; permissions?: string[] };

export function PlatformHost() {
  const ui = useUi();
  const lang: PlatformLang = ui.language.startsWith('ar') ? 'ar' : 'en';
  const [me, setMe] = useState<PlatformMe | null | undefined>(undefined);
  useEffect(() => {
    api<PlatformMe>('/api/v1/platform/me')
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  if (me === undefined) return <p className="platform main" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{lang === 'ar' ? 'جار التحميل…' : 'Loading…'}</p>;
  if (!me) return <Navigate to="/?tab=admin" replace />;
  return (
    <AdminShell
      me={me}
      onOut={() => setMe(null)}
      home="/?tab=admin"
      language={lang}
      onLanguage={(next) => {
        void i18n.changeLanguage(next);
        localStorage.setItem('dawaa.lang', next);
        applyLanguage(next);
      }}
    />
  );
}
