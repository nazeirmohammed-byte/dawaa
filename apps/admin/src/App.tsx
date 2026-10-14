import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { LangProvider, tx, type PlatformLang } from './locale';
import {
  AccountsPage,
  AuditPage,
  CatalogPage,
  DashboardPage,
  InvoicesPage,
  ItemRequestsPage,
  PartnersPage,
  PlansPage,
  ProofsPage,
  RequestDetailPage,
  RequestsPage,
  SettingsPage,
  SubscribePage,
  TenantPage,
  TenantsPage,
  UsersPage,
  roleName,
} from './screens';
import { LibraryPage } from './library';

type Me = { id: string; displayName: string; roleCode: string; permissions?: string[] };

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    api<Me>('/api/v1/platform/me').then(setMe).catch(() => setMe(null));
  }, []);
  if (me === undefined) return <p className="main">جار التحميل…</p>;
  return (
    <Routes>
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/login" element={me ? <Navigate to="/admin/dashboard" /> : <LoginPage onIn={setMe} />} />
      <Route path="/admin/*" element={me ? <AdminShell me={me} onOut={() => setMe(null)} /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={me ? '/admin/dashboard' : '/login'} />} />
    </Routes>
  );
}

function LoginPage({ onIn }: { onIn: (me: Me) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@dawaa.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const profile = await api<Me>('/api/v1/platform/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      onIn(profile);
      navigate('/admin/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الدخول');
    }
  }
  return (
    <form className="login panel" onSubmit={submit}>
      <h1>إدارة منصة دواء</h1>
      <p>هذه الشاشة لمالك المنصة، وليست لموظفي الصيدلية.</p>
      <label className="field">البريد<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field">كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">دخول</button>
      <p><a href="/subscribe">طلب اشتراك صيدلية</a></p>
    </form>
  );
}

export function AdminShell({
  me,
  onOut,
  home = '/login',
  language,
  onLanguage,
}: {
  me: Me;
  onOut: () => void;
  home?: string;
  language?: PlatformLang;
  onLanguage?: (next: PlatformLang) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [localLang, setLocalLang] = useState<PlatformLang>(() => (localStorage.getItem('dawaa.lang') === 'en' ? 'en' : 'ar'));
  const lang = language ?? localLang;
  useEffect(() => {
    document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  function toggleLanguage() {
    const next: PlatformLang = lang === 'ar' ? 'en' : 'ar';
    if (onLanguage) onLanguage(next);
    else {
      localStorage.setItem('dawaa.lang', next);
      setLocalLang(next);
    }
  }
  const groups: { id: string; ar: string; en: string; tone: string; links: [string, string, string][] }[] = [
    {
      id: 'accounts',
      ar: 'الحسابات',
      en: 'Accounts',
      tone: 'accounts',
      links: [
        ['/admin/subscription-requests', 'طلبات الاشتراك', 'Join requests'],
        ['/admin/tenants', 'الصيدليات', 'Pharmacies'],
        ['/admin/pharmacy-accounts', 'حسابات الدخول', 'Sign-in accounts'],
      ],
    },
    {
      id: 'medicine',
      ar: 'الأدوية',
      en: 'Medicines',
      tone: 'medicine',
      links: [
        ['/admin/catalog/library', 'تنزيل وتحديث', 'Download and update'],
        ['/admin/catalog/master-items', 'الدليل الدوائي', 'Catalog'],
        ['/admin/catalog/new-item-requests', 'طلبات الأصناف', 'Item requests'],
      ],
    },
    {
      id: 'billing',
      ar: 'الاشتراك',
      en: 'Billing',
      tone: 'billing',
      links: [
        ['/admin/billing/plans', 'الباقات', 'Plans'],
        ['/admin/billing/invoices', 'الفواتير', 'Invoices'],
        ['/admin/payment-proofs', 'إثباتات الدفع', 'Payment proofs'],
        ['/admin/partners', 'الشركاء', 'Partners'],
      ],
    },
    {
      id: 'system',
      ar: 'النظام',
      en: 'System',
      tone: 'system',
      links: [
        ['/admin/platform-users', 'مستخدمو المنصة', 'Platform users'],
        ['/admin/audit', 'السجل', 'Audit'],
        ['/admin/settings', 'الإعدادات', 'Settings'],
      ],
    },
  ];
  const flat: [string, string, string][] = [['/admin/dashboard', 'اللوحة', 'Board'], ...groups.flatMap((group) => group.links)];
  function groupFor(path: string) {
    return groups.find((group) => group.links.some(([to]) => path === to || path.startsWith(`${to}/`)))?.id ?? '';
  }
  const [openGroup, setOpenGroup] = useState(() => groupFor(location.pathname));
  const [signupCount, setSignupCount] = useState(0);
  useEffect(() => {
    let live = true;
    function loadSignups() {
      api<{ id: string }[]>('/api/v1/platform/signups')
        .then((rows) => { if (live) setSignupCount(rows.length); })
        .catch(() => { if (live) setSignupCount(0); });
    }
    loadSignups();
    const timer = window.setInterval(loadSignups, 20000);
    window.addEventListener('dawaa-signups', loadSignups);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('dawaa-signups', loadSignups);
    };
  }, [location.pathname]);
  useEffect(() => {
    setOpenGroup(groupFor(location.pathname));
  }, [location.pathname]);
  const nestedTitle: [string, string] | undefined = /^\/admin\/tenants\/[^/]+/.test(location.pathname)
    ? ['الصيدلية', 'Pharmacy']
    : /^\/admin\/subscription-requests\/[^/]+/.test(location.pathname)
      ? ['طلب الاشتراك', 'Join request']
      : undefined;
  const current = nestedTitle
    ? (['', nestedTitle[0], nestedTitle[1]] as [string, string, string])
    : flat.find(([to]) => location.pathname === to || location.pathname.startsWith(`${to}/`));
  return (
    <LangProvider value={{ lang, toggle: toggleLanguage }}>
    <div className="platform shell" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <aside className="nav">
        <div className="brandline">
          <span className="owner-mark">د</span>
          <div>
            <strong>{tx(lang, 'منصة دواء', 'Dawaa platform')}</strong>
            <small>{tx(lang, 'لوحة المالك', 'Owner console')}</small>
          </div>
        </div>
        <NavLink to="/admin/dashboard" end>{tx(lang, 'اللوحة', 'Board')}</NavLink>
        {groups.map((group) => (
          <div key={group.id} className={`nav-group ${group.tone}`}>
            <button type="button" aria-expanded={openGroup === group.id} onClick={() => setOpenGroup((currentId) => (currentId === group.id ? '' : group.id))}>
              <span>{tx(lang, group.ar, group.en)}</span>
              <span>{openGroup === group.id ? '−' : '+'}</span>
            </button>
            {openGroup === group.id ? group.links.map(([to, ar, en]) => (
              <NavLink key={to} to={to}>{tx(lang, ar, en)}</NavLink>
            )) : null}
          </div>
        ))}
        <div className="nav-foot">
          <p>{me.displayName}</p>
          <small>{tx(lang, roleName(me.roleCode)[0], roleName(me.roleCode)[1])}</small>
          <button
            className="ghost"
            onClick={() => {
              void api('/api/v1/platform/logout', { method: 'POST' }).finally(() => {
                onOut();
                navigate(home);
              });
            }}
          >
            {tx(lang, 'خروج', 'Sign out')}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="owner-bar">
          <div>
            <h1>{current ? tx(lang, current[1], current[2]) : tx(lang, 'المنصة', 'Platform')}</h1>
            <p>{me.displayName}</p>
          </div>
          <button type="button" className="ghost" onClick={toggleLanguage}>
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </header>
      <main className="main">
        {signupCount > 0 ? (
          <Link className="signup-alert" to="/admin/dashboard#signups">
            {tx(
              lang,
              `${signupCount} صيدلية تنتظر الموافقة. راجع بيانات مقدم الطلب ثم اعتمد الدخول أو ارفض الحساب.`,
              `${signupCount} ${signupCount === 1 ? 'pharmacy is' : 'pharmacies are'} waiting for approval. Review who applied, then approve sign-in or reject the account.`,
            )}
          </Link>
        ) : null}
        <Routes>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="tenants/:id" element={<TenantPage />} />
          <Route path="subscription-requests" element={<RequestsPage />} />
          <Route path="subscription-requests/:id" element={<RequestDetailPage />} />
          <Route path="catalog/master-items" element={<CatalogPage />} />
          <Route path="catalog/library" element={<LibraryPage />} />
          <Route path="catalog/new-item-requests" element={<ItemRequestsPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="pharmacy-accounts" element={<AccountsPage />} />
          <Route path="billing/plans" element={<PlansPage />} />
          <Route path="billing/invoices" element={<InvoicesPage />} />
          <Route path="payment-proofs" element={<ProofsPage />} />
          <Route path="platform-users" element={<UsersPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
      </div>
    </div>
    </LangProvider>
  );
}
