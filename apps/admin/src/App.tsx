import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { HelpTip } from './hint';
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
    ['/admin/dashboard', 'طلب من صفحة الدخول يفتح تجربة 14 يوماً فوراً. من سجل الصيدلية يمكن اعتمادها كنسخة قياسية أو إلغاء التجربة أو تمديدها.', 'A request from the sign-in page opens a 14-day trial at once. From the pharmacy record you can make it the standard edition, cancel the trial, or extend it.'],
    ['/admin/tenants', 'الطلبات هي البداية. الصيدليات هي الحسابات الجاهزة بعد إنشاء الدخول.', 'Requests are the start. Pharmacies are the accounts that exist after the sign-in is created.'],
    ['/admin/pharmacy-accounts', 'من هنا تعيد كلمة المرور أو تدخل بالنيابة. الكلمة الجديدة تظهر مرة واحدة.', 'Reset a password or sign in as the pharmacy from here. A new password is shown once.'],
    ['/admin/catalog/library', 'التنزيل يضيف أدوية جديدة للدليل العالمي وينشرها لكل الصيدليات. التحديث ينعش الأسماء الموجودة دون نسخها داخل كل صيدلية.', 'Download adds medicines to the global library and publishes them for every pharmacy. Update refreshes names that are already there without copying them into each pharmacy.'],
    ['/admin/catalog/master-items', 'هذا الدليل العالمي. الصنف المنشور يظهر فوراً في بحث كل صيدلية. الصيدلية لا تنشئ سجل دواء آخر.', 'This is the global library. A published item appears at once in every pharmacy search. A pharmacy does not create another medicine record.'],
    ['/admin/catalog/new-item-requests', 'صيدلية طلبت صنفاً غير موجود. الاعتماد ينشره للجميع. الربط يلحق الطلب بصنف موجود دون تكرار.', 'A pharmacy asked for an item that is not in the library. Approving publishes it for everyone. Linking attaches the request to an item that already exists.'],
    ['/admin/billing/plans', 'هذه الأسعار هي التي يراها العميل في طلب الاشتراك. سعر السلسلة لكل فرع.', 'These are the prices the customer sees on the subscription request. The chain price is per branch.'],
    ['/admin/billing/invoices', 'فاتورة الاشتراك تُنشأ مع الحساب. سجّل إثبات الدفع هنا، ثم اعتمده من إثباتات الدفع.', 'The subscription invoice is created with the account. Record the payment proof here, then approve it under Payment proofs.'],
    ['/admin/payment-proofs', 'اعتماد الإثبات يعني أن التحويل تم التحقق منه. الرفض يترك الفاتورة مفتوحة.', 'Approving the proof means the transfer was checked. Rejecting it leaves the invoice open.'],
    ['/admin/platform-users', 'دخول المنصة بالجوال وكلمة المرور، لا بالبريد. أدخل جوال الموظف حتى يستطيع الدخول.', 'Platform sign-in is the mobile number and password, not the email. Enter the person’s mobile so they can sign in.'],
    ['/admin/settings', 'ما يُضبط هنا ينطبق على المنصة كلها، لا على صيدلية واحدة.', 'What you set here applies to the whole platform, not to one pharmacy.'],
  ];
  if (path.startsWith('/admin/subscription-requests/')) {
    return tx(lang, 'اتبع الشريط بالترتيب: ابدأ المراجعة، علّم الترخيصين ساريين، اعتمد، ثم أنشئ الحساب. كلمة المرور تظهر مرة واحدة فسلّمها للمالك فوراً.', 'Follow the strip in order: start the review, mark both licenses valid, approve, then create the account. The password is shown once, so give it to the owner immediately.');
  }
  if (/^\/admin\/tenants\/[^/]+/.test(path)) {
    return tx(lang, 'السجل للبيانات. الحسابات لتسليم الدخول أو كلمة مرور جديدة. الإعداد لاعتماد التجربة كنسخة قياسية أو إلغائها أو تمديدها.', 'Record is the file. Accounts is where you hand over sign-in or a new password. Setup turns a trial into the standard edition, cancels it, or extends it.');
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const profile = await api<Me>('/api/v1/platform/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
      onIn(profile);
      navigate('/admin/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الدخول');
    }
  }
  return (
    <form className="login panel" onSubmit={submit}>
      <h1>إدارة منصة دواء</h1>
      <p>هذه الشاشة لمالك المنصة، وليست لموظفي الصيدلية. الدخول بالجوال وكلمة المرور.</p>
      <label className="field">الجوال<input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="username" /></label>
      <label className="field">كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
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
    if (path.startsWith('/admin/subscription-requests') || path.startsWith('/admin/tenants')) return 'accounts';
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
  const hint = ownerHint(lang, location.pathname);
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
            <h1>
              {current ? tx(lang, current[1], current[2]) : tx(lang, 'المنصة', 'Platform')}
              {hint ? <HelpTip text={hint} /> : null}
            </h1>
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
