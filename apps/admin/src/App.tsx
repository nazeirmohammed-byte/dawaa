import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { BrandLogo } from './brand';
import { LangProvider, tx, type PlatformLang } from './locale';
import { NavIcon } from './nav-icons';
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
  SettingsPage,
  SubscribePage,
  TenantPage,
  TenantsPage,
  UsersPage,
  roleName,
} from './screens';
import { LibraryPage } from './library';

type Me = { id: string; displayName: string; roleCode: string; permissions?: string[] };

function ownerHint(lang: PlatformLang, path: string): string {
  const notes: [string, string, string][] = [
    ['/admin/dashboard', 'اعتمد الطلبات المعلقة، ثم راجع الصيدليات والفواتير من الأرقام أعلاه.', 'Approve waiting requests, then open pharmacies or invoices from the numbers above.'],
    ['/admin/tenants', 'الطلبات للمراجعة. الصيدليات بعد إنشاء الدخول.', 'Requests are for review. Pharmacies appear after sign-in is created.'],
    ['/admin/pharmacy-accounts', 'إعادة كلمة المرور أو الدخول بالنيابة. الكلمة الجديدة تظهر مرة واحدة.', 'Reset a password or sign in as the pharmacy. A new password is shown once.'],
    ['/admin/catalog/library', 'تنزيل يضيف أصنافاً جديدة. تحديث ينعش الأسماء الموجودة.', 'Download adds new items. Update refreshes names already in the library.'],
    ['/admin/catalog/master-items', 'صنف منشور يظهر فوراً في بحث كل صيدلية.', 'A published item appears at once in every pharmacy search.'],
    ['/admin/catalog/new-item-requests', 'اعتماد ينشر للجميع. الربط يلحق الطلب بصنف موجود.', 'Approve publishes it for everyone. Link attaches it to an existing item.'],
    ['/admin/billing/plans', 'هذه الأسعار تظهر للعميل في طلب الاشتراك.', 'These prices are what the customer sees on the subscription request.'],
    ['/admin/billing/invoices', 'سجّل إثبات الدفع هنا، ثم اعتمده من إثباتات الدفع.', 'Record the payment proof here, then approve it under Payment proofs.'],
    ['/admin/payment-proofs', 'الاعتماد يؤكد التحويل. الرفض يترك الفاتورة مفتوحة.', 'Approve confirms the transfer. Reject leaves the invoice open.'],
    ['/admin/platform-users', 'دخول المنصة باسم المستخدم وكلمة المرور، لا بالبريد.', 'Platform sign-in is username and password, not email.'],
    ['/admin/settings', 'ينطبق على المنصة كلها، لا على صيدلية واحدة.', 'Applies to the whole platform, not one pharmacy.'],
  ];
  if (path.startsWith('/admin/subscription-requests/')) {
    return tx(lang, 'راجع الترخيص، اعتمد، ثم أنشئ الحساب. كلمة المرور تظهر مرة واحدة.', 'Check the license, approve, then create the account. The password is shown once.');
  }
  if (/^\/admin\/tenants\/[^/]+/.test(path)) {
    return tx(lang, 'السجل للبيانات. الحسابات لتسليم الدخول. الإعداد للاشتراك.', 'Record is the file. Accounts hand over sign-in. Setup is the subscription.');
  }
  const found = notes.find(([to]) => path === to);
  return found ? tx(lang, found[1], found[2]) : '';
}

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
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const profile = await api<Me>('/api/v1/platform/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
      onIn(profile);
      navigate('/admin/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الدخول');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login admin-console">
      <section className="brand">
        <div>
          <BrandLogo lang="ar" light />
          <p className="console-chip">منصة الإدارة</p>
          <h1>دواء</h1>
          <p>لوحة تحكم مالك المنصة. ليست شاشة الصيدلية.</p>
        </div>
        <div className="brand-points">
          <div>اعتماد الصيدليات والتجارب</div>
          <div>الدليل الدوائي العالمي</div>
          <div>الفوترة وإثباتات الدفع</div>
        </div>
      </section>
      <section className="panel">
        <form className="card" onSubmit={submit}>
          <p className="console-chip ink">Platform admin</p>
          <h2>دخول الإدارة</h2>
          <p className="lede">هذه الشاشة لمالك المنصة فقط. موظفو الصيدلية يدخلون من تطبيق الصيدلية.</p>
          {error ? <p className="error">{error}</p> : null}
          <label className="field">
            <span>اسم المستخدم</span>
            <input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
          <p className="hint" style={{ marginTop: 14 }}>
            <a href="/subscribe">طلب اشتراك صيدلية</a>
          </p>
        </form>
      </section>
    </div>
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
  const groups: {
    id: string;
    icon: string;
    ar: string;
    en: string;
    links: { to: string; icon: string; ar: string; en: string; end?: boolean }[];
  }[] = [
    {
      id: 'accounts',
      icon: 'groupAccounts',
      ar: 'الحسابات',
      en: 'Accounts',
      links: [
        { to: '/admin/tenants', icon: 'pharmacies', ar: 'الصيدليات', en: 'Pharmacies' },
        { to: '/admin/pharmacy-accounts', icon: 'accounts', ar: 'حسابات الدخول', en: 'Sign-in accounts' },
      ],
    },
    {
      id: 'medicine',
      icon: 'groupMedicine',
      ar: 'الأدوية',
      en: 'Medicines',
      links: [
        { to: '/admin/catalog/library', icon: 'library', ar: 'تنزيل وتحديث', en: 'Download and update' },
        { to: '/admin/catalog/master-items', icon: 'catalog', ar: 'الدليل الدوائي', en: 'Catalog' },
        { to: '/admin/catalog/new-item-requests', icon: 'requests', ar: 'طلبات الأصناف', en: 'Item requests' },
      ],
    },
    {
      id: 'billing',
      icon: 'groupBilling',
      ar: 'الاشتراك',
      en: 'Billing',
      links: [
        { to: '/admin/billing/plans', icon: 'plans', ar: 'الباقات', en: 'Plans' },
        { to: '/admin/billing/invoices', icon: 'invoices', ar: 'الفواتير', en: 'Invoices' },
        { to: '/admin/payment-proofs', icon: 'proofs', ar: 'إثباتات الدفع', en: 'Payment proofs' },
        { to: '/admin/partners', icon: 'partners', ar: 'الشركاء', en: 'Partners' },
      ],
    },
    {
      id: 'system',
      icon: 'groupSystem',
      ar: 'النظام',
      en: 'System',
      links: [
        { to: '/admin/platform-users', icon: 'users', ar: 'مستخدمو المنصة', en: 'Platform users' },
        { to: '/admin/audit', icon: 'audit', ar: 'السجل', en: 'Audit' },
      ],
    },
  ];
  const flat = [
    { to: '/admin/dashboard', ar: 'لوحة المنصة', en: 'Platform board' },
    ...groups.flatMap((group) => group.links.map((link) => ({ to: link.to, ar: link.ar, en: link.en }))),
  ];
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
  const nestedTitle: [string, string] | undefined = /^\/admin\/tenants\/[^/]+/.test(location.pathname)
    ? ['الصيدلية', 'Pharmacy']
    : /^\/admin\/subscription-requests\/[^/]+/.test(location.pathname)
      ? ['طلب الاشتراك', 'Join request']
      : undefined;
  const current = nestedTitle
    ? { to: '', ar: nestedTitle[0], en: nestedTitle[1] }
    : flat.find((row) => location.pathname === row.to || location.pathname.startsWith(`${row.to}/`));
  const pageTitle = current ? tx(lang, current.ar, current.en) : tx(lang, 'المنصة', 'Platform');
  const hint = ownerHint(lang, location.pathname);
  const role = roleName(me.roleCode);

  function logout() {
    void api('/api/v1/platform/logout', { method: 'POST' }).finally(() => {
      onOut();
      navigate(home);
    });
  }

  return (
    <LangProvider value={{ lang, toggle: toggleLanguage }}>
      <div className="app admin-console" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <aside className="side">
          <div className="side-head">
            <Link to="/admin/dashboard" className="side-brand-main" aria-label={tx(lang, 'لوحة المنصة', 'Platform board')}>
              <BrandLogo lang={lang} light />
            </Link>
            <div className="side-tenant" title={me.displayName}>
              <span className="side-tenant-avatar" aria-hidden="true">
                {me.displayName.trim().charAt(0) || 'د'}
              </span>
              <span className="side-tenant-text">
                <small>{tx(lang, role[0], role[1])}</small>
                <strong>{me.displayName}</strong>
              </span>
              <span className="side-tenant-dot" aria-hidden="true" />
            </div>
          </div>
          <nav className="modnav" aria-label={tx(lang, 'المنصة', 'Platform')}>
            <NavLink to="/admin/dashboard" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={tx(lang, 'لوحة المنصة', 'Platform board')}>
              <span className="nav-icon"><NavIcon name="board" /></span>
              <span className="nav-label">{tx(lang, 'لوحة المنصة', 'Platform board')}</span>
              {signupCount > 0 ? <span className="nav-badge">{signupCount}</span> : null}
            </NavLink>
            {groups.map((group) => (
              <section className={`nav-section ${group.id}`} key={group.id} aria-label={tx(lang, group.ar, group.en)}>
                <p className="nav-section-title">
                  <span>{tx(lang, group.ar, group.en)}</span>
                </p>
                <div className="nav-section-items">
                  {group.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      title={tx(lang, link.ar, link.en)}
                      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                      <span className="nav-icon"><NavIcon name={link.icon} /></span>
                      <span className="nav-label">{tx(lang, link.ar, link.en)}</span>
                    </NavLink>
                  ))}
                </div>
              </section>
            ))}
          </nav>
          <div className="side-foot">
            <NavLink to="/admin/settings" className="side-foot-btn" title={tx(lang, 'الإعدادات', 'Settings')}>
              <span className="nav-icon"><NavIcon name="settings" /></span>
              <span className="nav-label">{tx(lang, 'الإعدادات', 'Settings')}</span>
            </NavLink>
            <button type="button" className="side-foot-btn side-logout" onClick={logout} title={tx(lang, 'خروج', 'Sign out')}>
              <span className="nav-icon"><NavIcon name="logout" /></span>
              <span className="nav-label">{tx(lang, 'خروج', 'Sign out')}</span>
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="top-title">
              <span className="console-chip ink">{tx(lang, 'لوحة الإدارة', 'Admin console')}</span>
              <h1>{pageTitle}</h1>
              {hint ? <p className="page-hint">{hint}</p> : null}
            </div>
            <div className="top-actions">
              <span className="top-user">{me.displayName}</span>
              <button type="button" className="ghost" onClick={toggleLanguage}>
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
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
              <Route path="subscription-requests" element={<Navigate to="/admin/tenants?view=requests" replace />} />
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
