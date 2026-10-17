import { cloneElement, FormEvent, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api, readFile } from './api';
import { HelpTip } from './hint';
import { tx, usePlatformLang, type PlatformLang } from './locale';

type Row = Record<string, unknown>;

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    api<T>(path)
      .then((row) => {
        if (live) setData(row);
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : 'تعذر التحميل');
      });
    return () => {
      live = false;
    };
  }, [path, tick]);
  return { data, error, loading: data === null && !error, reload: () => setTick((value) => value + 1) };
}

function fieldNote(lang: PlatformLang, field: string, code: string, label: string): string {
  if (code === 'required') return tx(lang, `أدخل ${label}.`, `Enter ${label}.`);
  if (code === 'short') return tx(lang, 'اكتب 10 أحرف على الأقل.', 'Use at least 10 characters.');
  if (code === 'email') return tx(lang, 'أدخل بريداً صالحاً.', 'Enter a valid email.');
  if (code === 'taken' && field === 'phone') return tx(lang, 'هذا الهاتف مستخدم. اختر رقماً آخر.', 'This phone is already used. Choose another.');
  if (code === 'taken') return tx(lang, 'هذا البريد مستخدم. اختر بريداً آخر.', 'This email is already used. Choose another.');
  if (code === 'range') return tx(lang, 'أدخل رقماً من 1 إلى 20.', 'Enter a number from 1 to 20.');
  return tx(lang, 'راجع هذه القيمة.', 'Check this value.');
}

function focusField(name: string) {
  window.setTimeout(() => {
    document.querySelector<HTMLElement>(`[data-field="${name}"] input, [data-field="${name}"] select`)?.focus();
  }, 0);
}

function Flagged({ name, label, message, className, children }: { name: string; label: string; message?: string; className?: string; children: ReactNode }) {
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-invalid': message ? true : undefined,
        'aria-describedby': message ? `${name}-error` : undefined,
      })
    : children;
  return (
    <label className={['field', className, message ? 'bad' : ''].filter(Boolean).join(' ')} data-field={name}>
      {label}
      {control}
      {message ? <small id={`${name}-error`} className="field-error">{message}</small> : null}
    </label>
  );
}

function Badge({ value, label }: { value: string; label?: string }) {
  const bad = ['REJECTED', 'SUSPENDED', 'EXPIRED', 'OVERDUE', 'CANCELLED'].includes(value);
  const ok = ['ACTIVE', 'VALID', 'PAID', 'APPROVED', 'TENANT_CREATED'].includes(value);
  const trial = value === 'TRIAL';
  const review = ['UNDER_REVIEW', 'NEED_MORE_INFO', 'VERIFIED'].includes(value);
  const warn = ['PENDING', 'SUBMITTED', 'NEEDS_RENEWAL', 'DUPLICATE_SUSPECTED'].includes(value);
  const tone = bad ? 'bad' : ok ? 'ok' : trial ? 'trial' : review ? 'review' : warn ? 'warn' : '';
  return <span className={tone ? `badge ${tone}` : 'badge'}>{label ?? value}</span>;
}

function pair(lang: PlatformLang, value: string, labels: Record<string, [string, string]>) {
  const found = labels[value];
  return found ? tx(lang, found[0], found[1]) : value;
}

export function roleName(code: string): [string, string] {
  const labels: Record<string, [string, string]> = {
    SUPER_ADMIN: ['مدير المنصة', 'Platform owner'],
    TENANT_APPROVAL_MANAGER: ['مسؤول الاعتماد', 'Approvals'],
    CATALOG_MANAGER: ['مسؤول الدليل', 'Catalog'],
    BILLING_MANAGER: ['مسؤول الفوترة', 'Billing'],
    SUPPORT_ADMIN: ['الدعم', 'Support'],
    COMPLIANCE_AUDITOR: ['المراجع', 'Auditor'],
    OWNER: ['المالك', 'Owner'],
    BRANCH_MANAGER: ['مدير الفرع', 'Branch manager'],
    PHARMACIST: ['صيدلي', 'Pharmacist'],
    ASSISTANT_PHARMACIST: ['مساعد صيدلي', 'Assistant pharmacist'],
    CASHIER: ['كاشير', 'Cashier'],
    STOREKEEPER: ['أمين المخزن', 'Storekeeper'],
    ACCOUNTANT: ['محاسب', 'Accountant'],
  };
  return labels[code] ?? [code, code];
}

function statusLabel(lang: PlatformLang, value: string) {
  return pair(lang, value, {
    SUBMITTED: ['طلب جديد', 'New request'],
    UNDER_REVIEW: ['قيد المراجعة', 'In review'],
    NEED_MORE_INFO: ['بانتظار معلومات', 'Needs information'],
    VERIFIED: ['تم التحقق', 'Verified'],
    APPROVED: ['معتمد', 'Approved'],
    TENANT_CREATED: ['الحساب جاهز', 'Account created'],
    ACTIVE: ['نشط', 'Active'],
    REJECTED: ['مرفوض', 'Rejected'],
    TRIAL: ['تجريبي', 'Trial'],
    SUSPENDED: ['موقوف', 'Suspended'],
    PENDING: ['بانتظار المراجعة', 'Pending'],
    DUPLICATE_SUSPECTED: ['مكرر محتمل', 'Possible duplicate'],
    MERGED_WITH_EXISTING: ['مدمج مع صنف موجود', 'Merged with an existing item'],
    VALID: ['ساري', 'Valid'],
    EXPIRED: ['منتهٍ', 'Expired'],
    INDIVIDUAL: ['صيدلية مستقلة', 'Single pharmacy'],
    GROUP: ['مجموعة', 'Group'],
    MONTHLY: ['شهري', 'Monthly'],
    YEARLY: ['سنوي', 'Yearly'],
    ISSUED: ['صادرة', 'Issued'],
    PAID: ['مدفوعة', 'Paid'],
    OVERDUE: ['متأخرة', 'Overdue'],
    PHARMACY_LICENSE: ['ترخيص الصيدلية', 'Pharmacy license'],
    PHARMACIST_LICENSE: ['ترخيص الصيدلي', 'Pharmacist license'],
    BASIC: ['أساسية', 'Basic'],
    PRO: ['احترافية', 'Pro'],
    CHAIN: ['سلسلة', 'Chain'],
    POS: ['البيع', 'Sales'],
    INVENTORY: ['المخزون', 'Inventory'],
    EXPIRY: ['الصلاحية', 'Expiry'],
    PRICING: ['الأسعار', 'Pricing'],
    BASIC_REPORTS: ['التقارير', 'Reports'],
  });
}

function actionLabel(lang: PlatformLang, value: string) {
  return pair(lang, value, {
    'tenant.suspend': ['إيقاف الصيدلية', 'Pharmacy suspended'],
    'tenant.reactivate': ['إعادة التفعيل', 'Pharmacy reactivated'],
    'tenant.trial': ['تمديد التجربة', 'Trial extended'],
    'tenant.standard': ['تفعيل النسخة القياسية', 'Activated as standard'],
    'tenant.trial_cancel': ['إلغاء التجربة', 'Trial cancelled'],
    'tenant.plan': ['تغيير الباقة', 'Plan changed'],
    'tenant.readonly': ['قفل للقراءة', 'Locked to read-only'],
    'tenant.writable': ['السماح بالكتابة', 'Writing allowed'],
    'tenant.notes': ['حفظ الملاحظات', 'Notes saved'],
    'tenant.reset_password': ['كلمة مرور جديدة', 'Password reset'],
    'tenant.reset_pin': ['تعيين رقم الدخول', 'Sign-in code set'],
    'tenant.user_lock': ['إيقاف حساب', 'Account disabled'],
    'tenant.user_enable': ['تفعيل حساب', 'Account enabled'],
    'tenant.user_disable': ['إيقاف حساب', 'Account disabled'],
    'tenant.user_otp': ['رمز لمرة واحدة', 'One-time code'],
    'tenant.create_admin': ['إنشاء حساب', 'Account created'],
    'tenant.impersonate': ['دخول بالنيابة', 'Signed in as user'],
    'request.create_tenant': ['إنشاء الصيدلية', 'Pharmacy created'],
    'tenant.register': ['فتح حساب الصيدلية', 'Pharmacy account opened'],
    'tenant.approve': ['اعتماد الدخول', 'Sign-in approved'],
    'tenant.reject': ['رفض الحساب', 'Account rejected'],
  });
}

function when(lang: PlatformLang, value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(lang === 'ar' ? 'ar-SD' : 'en-GB', { timeZone: 'Africa/Khartoum', numberingSystem: 'latn', dateStyle: 'medium', timeStyle: 'short' });
}

function day(lang: PlatformLang, value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(lang === 'ar' ? 'ar-SD' : 'en-GB', { timeZone: 'Africa/Khartoum', numberingSystem: 'latn' });
}

function Ltr({ value }: { value: string }) {
  if (!value) return <>—</>;
  return <bdi dir="ltr">{value}</bdi>;
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'wide' : undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function run(action: () => Promise<void>, reload: () => void, setError: (value: string) => void) {
  try {
    setError('');
    await action();
    reload();
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : 'تعذر التنفيذ');
  }
}

export function SignupQueue() {
  const { lang } = usePlatformLang();
  const board = useLoad<Row[]>('/api/v1/platform/signups');
  const [error, setError] = useState('');
  if (board.loading || board.error || !board.data || board.data.length === 0) {
    return board.error ? <p className="error">{board.error}</p> : null;
  }
  function decide(id: string, action: 'approve' | 'reject') {
    void run(
      () => api(`/api/v1/platform/signups/${id}/${action}`, { method: 'POST', body: JSON.stringify({ reason: '' }) }).then(() => {
        window.dispatchEvent(new Event('dawaa-signups'));
      }),
      board.reload,
      setError,
    );
  }
  return (
    <div className="stack" id="signups">
      <div className="page-head">
        <h2>{tx(lang, 'صيدليات تنتظر الموافقة', 'Pharmacies waiting for approval')}</h2>
        <p>{tx(lang, 'هذه حسابات فُتحت وما زال الدخول مغلقاً. الطلب الجديد يبدأ من «تسجيل طلب»، لا من هنا.', 'These accounts were opened and still cannot sign in. A new pharmacy starts from Enter a request, not from here.')}</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {board.data.map((row) => {
        const management = String(row.management) === 'SHARED'
          ? tx(lang, 'مشتركة: تقرير الصيدلية يجمع الفروع', 'Shared: the pharmacy report combines branches')
          : tx(lang, 'مستقلة: مخزون وتقرير لكل فرع', 'Independent: stock and a report for each branch');
        return (
          <article key={String(row.id)} className="panel">
            <p className="badge-row">
              <strong>{lang === 'ar' ? String(row.tradeNameAr) : String(row.tradeNameEn || row.tradeNameAr)}</strong>
              <Badge value="PENDING" label={statusLabel(lang, 'PENDING')} />
            </p>
            <dl className="facts">
              <Fact label={tx(lang, 'الاسم بالعربية', 'Arabic name')}>{String(row.tradeNameAr)}</Fact>
              <Fact label={tx(lang, 'الاسم بالإنجليزية', 'English name')}>{String(row.tradeNameEn || '—')}</Fact>
              <Fact label={tx(lang, 'المالك', 'Owner')}>{String(row.ownerName || '—')}</Fact>
              <Fact label={tx(lang, 'النوع', 'Type')}>{statusLabel(lang, String(row.type))}</Fact>
              <Fact wide label={tx(lang, 'البريد', 'Email')}><Ltr value={String(row.email ?? '')} /></Fact>
              <Fact label={tx(lang, 'الهاتف', 'Phone')}><Ltr value={String(row.phone ?? '')} /></Fact>
              <Fact label={tx(lang, 'عدد الفروع', 'Branches')}>{String(row.branchLimit ?? '')}</Fact>
              <Fact label={tx(lang, 'الفرع', 'Branch')}>{lang === 'ar' ? String(row.branchNameAr || '—') : String(row.branchNameEn || row.branchNameAr || '—')}</Fact>
              <Fact wide label={tx(lang, 'إدارة الفروع', 'Branch management')}>{management}</Fact>
              <Fact label={tx(lang, 'وقت الطلب', 'Requested')}>{when(lang, row.createdAt)}</Fact>
            </dl>
            <div className="tools">
              <button type="button" onClick={() => decide(String(row.id), 'approve')}>{tx(lang, 'اعتماد الدخول', 'Approve sign-in')}</button>
              <button type="button" className="danger" onClick={() => decide(String(row.id), 'reject')}>{tx(lang, 'رفض الحساب', 'Reject account')}</button>
              <Link to={`/admin/tenants/${String(row.id)}`}>{tx(lang, 'كل البيانات', 'Full record')}</Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const { lang } = usePlatformLang();
  const board = useLoad<Row>('/api/v1/platform/dashboard');
  const work = useLoad<Row[]>('/api/v1/platform/requests');
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  const data = board.data ?? {};
  const cards: { id: string; ar: string; en: string; value: unknown }[] = [
    { id: 'total', ar: 'الصيدليات', en: 'Pharmacies', value: data.totalTenants },
    { id: 'active', ar: 'النشطة', en: 'Active', value: data.activeTenants },
    { id: 'trial', ar: 'التجريبية', en: 'Trial', value: data.trialTenants },
    { id: 'requests', ar: 'طلبات معلقة', en: 'Pending requests', value: data.pendingRequests },
    { id: 'verify', ar: 'تحقق معلق', en: 'Pending checks', value: data.pendingVerification },
    { id: 'suspended', ar: 'موقوفة', en: 'Suspended', value: data.suspendedTenants },
    { id: 'overdue', ar: 'فواتير متأخرة', en: 'Overdue invoices', value: data.overdueInvoices },
    { id: 'mrr', ar: 'الإيراد الشهري', en: 'Monthly revenue', value: data.monthlyRecurringRevenue },
    { id: 'items', ar: 'أصناف بانتظار المراجعة', en: 'Items to review', value: data.pendingItems },
  ];
  const partners = (data.expiringPartners as Row[] | undefined) ?? [];
  const openRequests = (work.data ?? []).filter((row) => !['TENANT_CREATED', 'ACTIVE', 'REJECTED'].includes(String(row.status)));
  const jumps: { to: string; ar: string; en: string }[] = [
    { to: '/admin/tenants?view=requests', ar: 'الصيدليات والطلبات', en: 'Pharmacies and requests' },
    { to: '/admin/pharmacy-accounts', ar: 'حسابات الدخول', en: 'Sign-in accounts' },
    { to: '/admin/catalog/library', ar: 'تنزيل الأدوية وتحديثها', en: 'Download and update medicines' },
    { to: '/admin/billing/invoices', ar: 'فواتير الاشتراك', en: 'Subscription invoices' },
  ];
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'عمل المالك', 'Owner work')}</h1>
        <p>{tx(lang, 'طلب من صفحة الدخول يفتح تجربة 14 يوماً فوراً. من سجل الصيدلية تُعتمد كنسخة قياسية أو تُلغى التجربة أو تُمدَّد.', 'A request from the sign-in page opens a 14-day trial at once. From the pharmacy record it becomes the standard edition, or the trial is cancelled or extended.')}</p>
      </div>
      <ol className="steps">
        <li className="step">{tx(lang, '١ طلب الاشتراك', '1 Subscription request')}</li>
        <li className="step">{tx(lang, '٢ مراجعة الترخيص', '2 Check the license')}</li>
        <li className="step">{tx(lang, '٣ الاعتماد', '3 Approve')}</li>
        <li className="step">{tx(lang, '٤ إنشاء حساب الدخول', '4 Create the sign-in')}</li>
        <li className="step">{tx(lang, '٥ تسليم الدخول وتدريب المالك', '5 Hand over the sign-in and train the owner')}</li>
      </ol>
      <div className="tools">
        {jumps.map((jump) => <Link key={jump.to} className="jump" to={jump.to}>{tx(lang, jump.ar, jump.en)}</Link>)}
        <a className="jump" href="/subscribe?from=admin">{tx(lang, 'تسجيل طلب صيدلية', 'Enter a pharmacy request')}</a>
      </div>
      <SignupQueue />
      <div className="panel">
        <strong>{tx(lang, 'صحة المنصة', 'Platform health')}</strong>
        <p>{tx(lang, 'أرقام مجمّعة من الاشتراكات والفواتير. تفاصيل أدوية الصيدليات لا تظهر هنا.', 'Counts from subscriptions and invoices. Pharmacy medicine details stay inside each pharmacy.')}</p>
        <p>{tx(lang, 'موقوف', 'Suspended')}: {String((data.systemHealth as Row | undefined)?.suspended ?? data.suspendedTenants ?? 0)}</p>
        <p>{tx(lang, 'قراءة فقط', 'Read only')}: {String((data.systemHealth as Row | undefined)?.readOnly ?? 0)}</p>
        <p>{tx(lang, 'اشتراك يقارب الانتهاء', 'Subscription ending')}: {String((data.systemHealth as Row | undefined)?.expiringSubscriptions ?? 0)}</p>
        <p>{tx(lang, 'دفع فاشل', 'Failed payment')}: {String((data.systemHealth as Row | undefined)?.failedPayments ?? 0)}</p>
        <p>{tx(lang, 'فاتورة متأخرة', 'Overdue invoice')}: {String((data.systemHealth as Row | undefined)?.overdueInvoices ?? data.overdueInvoices ?? 0)}</p>
        <div className="tools">
          <Link to="/admin/tenants?status=SUSPENDED">{tx(lang, 'الصيدليات الموقوفة', 'Suspended pharmacies')}</Link>
          <Link to="/admin/billing/invoices">{tx(lang, 'فواتير الاشتراك', 'Subscription invoices')}</Link>
        </div>
      </div>
      <div className="cards">
        {cards.map((card) => (
          <article key={card.id} className="card">
            <span>{tx(lang, card.ar, card.en)}</span>
            <strong>{String(card.value ?? 0)}</strong>
          </article>
        ))}
        <article className="card">
          <span>{tx(lang, 'رخص شركاء قاربت الانتهاء', 'Partner licenses due')}</span>
          <strong>{partners.length}</strong>
        </article>
      </div>
      <div className="panel partner-list">
        <strong>{tx(lang, 'رخص قاربت الانتهاء', 'Licenses due soon')}</strong>
        {partners.length === 0 ? <p>{tx(lang, 'لا توجد رخص قريبة من الانتهاء.', 'No licenses are close to expiry.')}</p> : partners.map((row) => (
          <p key={String(row.id)}><span>{String(row.name)}</span><b>{String(row.expiresOn)}</b></p>
        ))}
      </div>
      <div className="panel">
        <strong>{tx(lang, 'طلبات بانتظار إجراء', 'Requests waiting for you')}</strong>
        {openRequests.length === 0 ? <p>{tx(lang, 'لا يوجد طلب مفتوح. سجّل طلباً جديداً أو انتظر صيدلية.', 'No open request. Enter one, or wait for a pharmacy.')}</p> : openRequests.map((row) => (
          <p key={String(row.id)}>
            <span>{String(row.tradeNameAr)} — {String(row.ownerName)}</span>
            <Badge value={String(row.status)} label={statusLabel(lang, String(row.status))} />
            <Link className="raised continue" to={`/admin/subscription-requests/${String(row.id)}`}>{tx(lang, 'متابعة', 'Continue')}</Link>
          </p>
        ))}
      </div>
    </section>
  );
}

export function TenantsPage() {
  const { lang } = usePlatformLang();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'requests' ? 'requests' : 'pharmacies';
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const board = useLoad<{ rows: Row[]; total: number }>(`/api/v1/platform/tenants?q=${encodeURIComponent(query)}&status=${status}`);
  const rows = board.data?.rows ?? [];
  const headers = lang === 'ar'
    ? ['الصيدلية', 'رمز الدخول', 'النوع', 'المالك', 'الهاتف', 'البريد', 'الباقة', 'الحساب', 'التحقق', 'الفروع', 'المستخدمون', 'الأجهزة', 'آخر دخول', 'تاريخ الإنشاء', 'فتح']
    : ['Pharmacy', 'Code', 'Type', 'Owner', 'Phone', 'Email', 'Plan', 'Account', 'Check', 'Branches', 'Users', 'Devices', 'Last sign-in', 'Created', 'Open'];
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'الصيدليات', 'Pharmacies')}</h1>
        <p>{tx(lang, 'طلب صفحة الدخول يفتح تجربة 14 يوماً. الطلب الذي تدخله أنت يبقى للمراجعة.', 'A request from the sign-in page opens a 14-day trial. A request you enter here stays for review.')}</p>
      </div>
      <ol className="steps">
        <li className={view === 'requests' ? 'step on' : 'step'}>{tx(lang, '١ طلب الاشتراك', '1 Subscription request')}</li>
        <li className="step">{tx(lang, '٢ مراجعة الترخيص', '2 Check the license')}</li>
        <li className="step">{tx(lang, '٣ الاعتماد', '3 Approve')}</li>
        <li className="step">{tx(lang, '٤ إنشاء حساب الدخول', '4 Create the sign-in')}</li>
        <li className={view === 'pharmacies' ? 'step on' : 'step'}>{tx(lang, '٥ تسليم الدخول وتدريب المالك', '5 Hand over the sign-in and train the owner')}</li>
      </ol>
      <div className="tools">
        <button type="button" className={view === 'requests' ? 'primary' : 'ghost'} onClick={() => setParams({ view: 'requests' })}>{tx(lang, 'الطلبات', 'Requests')}</button>
        <button type="button" className={view === 'pharmacies' ? 'primary' : 'ghost'} onClick={() => setParams({})}>{tx(lang, 'الصيدليات', 'Pharmacies')}</button>
        <a className="jump" href="/subscribe?from=admin">{tx(lang, 'تسجيل طلب جديد', 'Enter a new request')}</a>
      </div>
      {view === 'requests' ? <RequestsPage embedded /> : null}
      {view === 'requests' ? null : (<>
      <form className="tools" onSubmit={(event) => { event.preventDefault(); setQuery(q); }}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={tx(lang, 'اسم أو بريد', 'Name or email')} />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{tx(lang, 'كل الحالات', 'All statuses')}</option>
          <option value="TRIAL">{statusLabel(lang, 'TRIAL')}</option>
          <option value="ACTIVE">{statusLabel(lang, 'ACTIVE')}</option>
          <option value="SUSPENDED">{statusLabel(lang, 'SUSPENDED')}</option>
        </select>
        <button type="submit">{tx(lang, 'بحث', 'Search')}</button>
      </form>
      {board.loading ? <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p> : board.error ? <p className="error">{board.error}</p> : rows.length === 0 ? <p>{tx(lang, 'لا توجد صيدليات.', 'No pharmacies.')}</p> : (
        <table>
          <thead>
            <tr>{headers.map((cell) => <th key={cell || 'open'}>{cell}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const check = String(row.verificationStatus);
              const account = String(row.status);
              const waiting = check === 'PENDING';
              const rejected = check === 'REJECTED' || account === 'SUSPENDED' || account === 'CANCELLED';
              const tone = waiting ? 'wait' : rejected ? 'bad' : account === 'ACTIVE' ? 'ok' : account === 'TRIAL' ? 'trial' : '';
              const kind = String(row.type) === 'GROUP' ? 'group' : 'single';
              return (
                <tr key={String(row.id)} className={tone ? `tone-${tone}` : undefined}>
                  <td>{lang === 'ar' ? String(row.tradeNameAr) : String(row.tradeNameEn || row.tradeNameAr)}</td>
                  <td><Ltr value={String(row.accountCode ?? '')} /></td>
                  <td><span className={`chip ${kind}`}>{statusLabel(lang, String(row.type))}</span></td>
                  <td>{String(row.ownerName)}</td>
                  <td><Ltr value={String(row.phone ?? '')} /></td>
                  <td><Ltr value={String(row.email ?? '')} /></td>
                  <td>{row.plan ? <span className="chip plan">{statusLabel(lang, String(row.plan))}</span> : '—'}</td>
                  <td><Badge value={waiting ? 'PENDING' : account} label={waiting ? tx(lang, 'بانتظار الموافقة', 'Waiting') : statusLabel(lang, account)} /></td>
                  <td><Badge value={check} label={statusLabel(lang, check)} /></td>
                  <td>{String(row.branchCount)}</td>
                  <td>{String(row.userCount)}</td>
                  <td>{String(row.deviceCount)}</td>
                  <td>{when(lang, row.lastLoginAt)}</td>
                  <td>{day(lang, row.createdAt)}</td>
                  <td>
                    <Link className={waiting ? 'raised continue' : 'raised'} to={`/admin/tenants/${String(row.id)}`}>
                      {waiting ? tx(lang, 'متابعة', 'Continue') : tx(lang, 'إدارة', 'Manage')}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      </>)}
    </section>
  );
}

export function TenantPage() {
  const { id = '' } = useParams();
  const { lang } = usePlatformLang();
  const board = useLoad<Row>(`/api/v1/platform/tenants/${id}`);
  const plans = useLoad<Row[]>('/api/v1/platform/plans');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [days, setDays] = useState('14');
  const [planCode, setPlanCode] = useState('');
  const [notes, setNotes] = useState('');
  const [pin, setPin] = useState('');
  const [pane, setPane] = useState<'record' | 'accounts' | 'setup' | 'log'>('record');
  const [admin, setAdmin] = useState({ displayName: '', email: '', phone: '', branchId: '' });
  const [accountFields, setAccountFields] = useState<Record<string, string>>({});
  useEffect(() => {
    const data = board.data;
    if (!data) return;
    const subscription = data.subscription as Row | null;
    setNotes(String(data.supportNotes ?? ''));
    if (subscription?.planCode) setPlanCode(String(subscription.planCode));
  }, [board.data]);
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error || !board.data) return <p className="error">{board.error || tx(lang, 'غير موجود', 'Not found')}</p>;
  const data = board.data;
  const users = (data.users as Row[]) ?? [];
  const branches = (data.branches as Row[]) ?? [];
  const flags = (data.featureFlags as string[]) ?? [];
  const subscription = (data.subscription as Row | null) ?? null;
  const invoices = (data.invoices as Row[]) ?? [];
  const note = reason.trim().length >= 3 ? reason : tx(lang, 'إجراء من لوحة المالك', 'Action from the owner console');
  async function act(path: string, body: Row) {
    await run(async () => {
      const result = await api<Row>(path, { method: 'POST', body: JSON.stringify(body) });
      if (result.password) setSecret(String(result.password));
      if (result.otp) setSecret(String(result.otp));
      if (result.url) setSecret(String(result.url));
    }, board.reload, setError);
  }
  const title = lang === 'ar' ? String(data.tradeNameAr) : String(data.tradeNameEn || data.tradeNameAr);
  const documents = (data.documents as Row[]) ?? [];
  const audits = (data.audits as Row[]) ?? [];
  const panes: { id: 'record' | 'accounts' | 'setup' | 'log'; ar: string; en: string }[] = [
    { id: 'record', ar: 'السجل', en: 'Record' },
    { id: 'accounts', ar: `الحسابات (${users.length})`, en: `Accounts (${users.length})` },
    { id: 'setup', ar: 'الإعداد', en: 'Setup' },
    { id: 'log', ar: `الإجراءات (${audits.length})`, en: `Activity (${audits.length})` },
  ];
  return (
    <section className="tenant-page">
      <div className="page-head">
        <p className="crumb"><Link to="/admin/tenants">{tx(lang, 'الصيدليات', 'Pharmacies')}</Link></p>
        <h1>{title}</h1>
        <p className="badge-row">
          <Badge value={String(data.status)} label={statusLabel(lang, String(data.status))} />
          <Badge value={String(data.verificationStatus)} label={statusLabel(lang, String(data.verificationStatus))} />
          {data.readOnly ? <Badge value="SUSPENDED" label={tx(lang, 'قراءة فقط', 'Read only')} /> : null}
        </p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {secret ? <p className="panel secret">{tx(lang, 'يظهر مرة واحدة', 'Shown once')}: <Ltr value={secret} /></p> : null}
      <div className="tenant-switch" role="tablist">
        {panes.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={pane === item.id} className={pane === item.id ? 'on' : ''} onClick={() => setPane(item.id)}>
            {tx(lang, item.ar, item.en)}
          </button>
        ))}
      </div>
      {pane === 'record' ? (
        <div className="tenant-split">
          <article className="panel">
            <h2>{tx(lang, 'بيانات الصيدلية', 'Pharmacy record')}</h2>
            <dl className="facts">
              <Fact label={tx(lang, 'رمز الدخول', 'Sign-in code')}><Ltr value={String(data.accountCode ?? '')} /></Fact>
              <Fact label={tx(lang, 'النوع', 'Type')}>{statusLabel(lang, String(data.type))}</Fact>
              <Fact label={tx(lang, 'المالك', 'Owner')}>{String(data.ownerName)}</Fact>
              <Fact label={tx(lang, 'الهاتف', 'Phone')}><Ltr value={String(data.phone ?? '')} /></Fact>
              <Fact wide label={tx(lang, 'البريد', 'Email')}><Ltr value={String(data.email ?? '')} /></Fact>
              <Fact wide label={tx(lang, 'العنوان', 'Address')}>{String(data.addressLine || '—')}</Fact>
              <Fact label={tx(lang, 'الصيدلي', 'Pharmacist')}>{String(data.pharmacistName || '—')}</Fact>
              {String(data.status) === 'TRIAL' ? <Fact wide label={tx(lang, 'النسخة', 'Edition')}>{tx(lang, 'تجريبية حتى', 'Trial until')} {day(lang, data.trialEndsAt)}</Fact> : null}
              {documents.length > 0 ? null : (
                <>
                  <Fact label={tx(lang, 'ترخيص الصيدلية', 'Pharmacy license')}><Ltr value={String(data.licenseNumber ?? '')} /></Fact>
                  <Fact label={tx(lang, 'ترخيص الصيدلي', 'Pharmacist license')}><Ltr value={String(data.pharmacistLicense ?? '')} /></Fact>
                </>
              )}
            </dl>
            <h3>{tx(lang, 'الوحدات', 'Modules')}</h3>
            {flags.length === 0 ? <p className="hint">{tx(lang, 'لا توجد وحدات.', 'No modules.')}</p> : (
              <div className="chips">{flags.map((flag) => <span key={flag}>{statusLabel(lang, flag)}</span>)}</div>
            )}
          </article>
          <div className="stack">
            <article className="panel">
              <h2>{tx(lang, 'الاشتراك', 'Subscription')}</h2>
              {subscription ? (
                <dl className="facts">
                  <Fact label={tx(lang, 'الباقة', 'Plan')}>{statusLabel(lang, String(subscription.planCode))}</Fact>
                  <Fact label={tx(lang, 'الحالة', 'Status')}>{statusLabel(lang, String(subscription.status))}</Fact>
                  <Fact label={tx(lang, 'الدورة', 'Cycle')}>{statusLabel(lang, String(subscription.cycle))}</Fact>
                  <Fact label={tx(lang, 'نهاية التجربة', 'Trial ends')}>{day(lang, data.trialEndsAt)}</Fact>
                </dl>
              ) : <p className="hint">{tx(lang, 'لا يوجد اشتراك.', 'No subscription.')}</p>}
            </article>
            <article className="panel">
              <h2>{tx(lang, 'الفروع', 'Branches')}</h2>
              {branches.length === 0 ? <p className="hint">{tx(lang, 'لا توجد فروع.', 'No branches.')}</p> : (
                <div className="chips">
                  {branches.map((row) => <span key={String(row.id)}>{lang === 'ar' ? String(row.nameAr) : String(row.nameEn || row.nameAr)}</span>)}
                </div>
              )}
            </article>
            <article className="panel">
              <h2>{tx(lang, 'فواتير الاشتراك', 'Subscription invoices')}</h2>
              {invoices.length === 0 ? <p className="hint">{tx(lang, 'لا توجد فواتير.', 'No invoices.')}</p> : (
                <div className="quiet-list">
                  {invoices.map((row) => (
                    <p key={String(row.id)}>
                      <Ltr value={String(row.amount)} />
                      <span><Badge value={String(row.status)} label={statusLabel(lang, String(row.status))} /> {day(lang, row.dueAt)}</span>
                    </p>
                  ))}
                </div>
              )}
            </article>
            <article className="panel">
              <h2>{tx(lang, 'المستندات', 'Documents')}</h2>
              {documents.length === 0 ? <p className="hint">{tx(lang, 'لا توجد مستندات.', 'No documents.')}</p> : (
                <div className="quiet-list">
                  {documents.map((doc) => (
                    <p key={String(doc.id)}>
                      <span>
                        {statusLabel(lang, String(doc.kind))}
                        {doc.licenseNumber ? <> — <Ltr value={String(doc.licenseNumber)} /></> : null}
                        {doc.expiresOn ? <> · {day(lang, doc.expiresOn)}</> : null}
                      </span>
                      <span>
                        <Badge value={String(doc.status)} label={statusLabel(lang, String(doc.status))} />
                        {doc.hasFile ? <> <a href={`/api/v1/platform/documents/${String(doc.id)}`}>{tx(lang, 'عرض', 'View')}</a></> : null}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>
      ) : null}
      {pane === 'setup' ? (
        <div className="stack">
          <article className="panel">
            <h2>{tx(lang, 'سبب الإجراء', 'Reason for this action')}</h2>
            <p className="hint">{tx(lang, 'يُحفظ مع الإيقاف والتفعيل وتغيير الباقة.', 'Saved with suspend, reactivate, and plan changes.')}</p>
            <label className="field">
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tx(lang, 'اكتب سبب الإجراء', 'Write why you are doing this')} />
            </label>
          </article>
          <div className="action-grid">
            <article className="panel">
              <h2>{tx(lang, 'الحالة', 'Status')}</h2>
              <div className="tools">
                {String(data.verificationStatus) === 'PENDING' ? (
                  <button type="button" onClick={() => { void act(`/api/v1/platform/tenants/${id}/approve`, { reason: note }).then(() => window.dispatchEvent(new Event('dawaa-signups'))); }}>{tx(lang, 'اعتماد الدخول', 'Approve sign-in')}</button>
                ) : null}
                <button type="button" className="danger" onClick={() => act(`/api/v1/platform/tenants/${id}/suspend`, { reason: note })}>{tx(lang, 'إيقاف الصيدلية', 'Suspend pharmacy')}</button>
                <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/tenants/${id}/reactivate`, { reason: note })}>{tx(lang, 'إعادة التفعيل', 'Reactivate')}</button>
                <button type="button" className={data.readOnly ? 'ghost' : 'danger'} onClick={() => act(`/api/v1/platform/tenants/${id}/read-only`, { readOnly: data.readOnly !== true, reason: note })}>
                  {data.readOnly ? tx(lang, 'السماح بالكتابة', 'Allow writing') : tx(lang, 'قفل للقراءة فقط', 'Lock to read-only')}
                </button>
              </div>
            </article>
            <article className="panel">
              <h2>{tx(lang, 'التجربة', 'Trial')}</h2>
              <p className="hint">
                {String(data.status) === 'TRIAL'
                  ? tx(lang, 'هذه نسخة تجريبية لـ 14 يوماً عند التسجيل. يمكن تفعيلها كنسخة قياسية، أو إلغاء التجربة، أو إضافة أيام.', 'A new registration starts as a 14-day trial. Activate it as the standard edition, cancel the trial, or add extra days.')
                  : tx(lang, 'يمكن إعادة التجربة بأيام إضافية، أو تفعيل النسخة القياسية.', 'Add extra trial days, or activate the standard edition.')}
                {' '}{tx(lang, 'تنتهي في', 'Ends')} {day(lang, data.trialEndsAt)}
              </p>
              <div className="tools">
                <button type="button" disabled={String(data.status) === 'ACTIVE'} onClick={() => act(`/api/v1/platform/tenants/${id}/standard`, { reason: note })}>{tx(lang, 'تفعيل النسخة القياسية', 'Activate as standard')}</button>
                <button type="button" className="danger" disabled={String(data.status) !== 'TRIAL'} onClick={() => act(`/api/v1/platform/tenants/${id}/trial-cancel`, { reason: note })}>{tx(lang, 'إلغاء التجربة', 'Cancel trial')}</button>
                <label className="field fit">{tx(lang, 'أيام إضافية', 'Extra days')}<input value={days} onChange={(event) => setDays(event.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
                <button type="button" onClick={() => act(`/api/v1/platform/tenants/${id}/trial`, { days: Math.min(90, Math.max(1, Number(days) || 14)), reason: note })}>{tx(lang, 'تمديد التجربة', 'Extend trial')}</button>
              </div>
            </article>
            <article className="panel">
              <h2>{tx(lang, 'الباقة', 'Plan')}</h2>
              <div className="tools">
                <label className="field fit">{tx(lang, 'الباقة', 'Plan')}
                  <select value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
                    {(plans.data ?? []).map((plan) => (
                      <option key={String(plan.code)} value={String(plan.code)}>{lang === 'ar' ? String(plan.nameAr) : String(plan.nameEn)}</option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={!planCode} onClick={() => act(`/api/v1/platform/tenants/${id}/plan`, { planCode, reason: note })}>{tx(lang, 'تغيير الباقة', 'Change plan')}</button>
                <a className="jump" href={`/api/v1/platform/tenants/${id}/export`}>{tx(lang, 'تصدير الملخص', 'Export summary')}</a>
              </div>
            </article>
            <article className="panel">
              <h2>{tx(lang, 'ملاحظات الدعم', 'Support notes')}</h2>
              <label className="field"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <button type="button" onClick={() => act(`/api/v1/platform/tenants/${id}/notes`, { supportNotes: notes })}>{tx(lang, 'حفظ الملاحظات', 'Save notes')}</button>
            </article>
          </div>
        </div>
      ) : null}
      {pane === 'accounts' ? (
        <div className="stack">
          <form className="panel" noValidate onSubmit={(event) => {
            event.preventDefault();
            const bag: Record<string, string> = {};
            if (admin.displayName.trim().length < 2) bag.displayName = fieldNote(lang, 'displayName', 'required', tx(lang, 'الاسم', 'Name'));
            if (admin.phone.trim().length < 6) bag.phone = fieldNote(lang, 'phone', 'required', tx(lang, 'اسم المستخدم (الجوال)', 'Username (mobile)'));
            if (admin.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email.trim())) bag.email = fieldNote(lang, 'email', 'email', '');
            const chosen = admin.branchId || String(branches[0]?.id ?? '');
            if (!chosen) bag.branchId = fieldNote(lang, 'branchId', 'required', tx(lang, 'الفرع', 'Branch'));
            if (Object.keys(bag).length) {
              setAccountFields(bag);
              const first = Object.keys(bag)[0];
              if (first) focusField(first);
              return;
            }
            setAccountFields({});
            setError('');
            void api<Row>(`/api/v1/platform/tenants/${id}/admins`, {
              method: 'POST',
              body: JSON.stringify({ displayName: admin.displayName, email: admin.email, phone: admin.phone, branchId: chosen }),
            }).then((result) => {
              if (result.password) setSecret(`${String(result.phone || admin.phone)} / ${String(result.password)}`);
              setAdmin({ displayName: '', email: '', phone: '', branchId: '' });
              board.reload();
            }).catch((caught: unknown) => {
              if (caught instanceof ApiError && Object.keys(caught.fields).length) {
                const next: Record<string, string> = {};
                for (const [key, code] of Object.entries(caught.fields)) {
                  next[key] = fieldNote(lang, key, code, key === 'phone' ? tx(lang, 'الهاتف', 'Phone') : tx(lang, 'البريد', 'Email'));
                }
                setAccountFields(next);
                const first = Object.keys(next)[0];
                if (first) focusField(first);
                return;
              }
              setError(caught instanceof Error ? caught.message : tx(lang, 'تعذر إنشاء الحساب', 'Could not create the account'));
            });
          }}>
            <h2>{tx(lang, 'إضافة حساب مالك', 'Add an owner account')}</h2>
            <div className="grid">
              <Flagged name="displayName" label={tx(lang, 'الاسم', 'Name')} message={accountFields.displayName}><input value={admin.displayName} onChange={(event) => { setAdmin({ ...admin, displayName: event.target.value }); setAccountFields((current) => ({ ...current, displayName: '' })); }} /></Flagged>
              <Flagged name="phone" label={tx(lang, 'اسم المستخدم (الجوال)', 'Username (mobile)')} message={accountFields.phone}><input dir="ltr" value={admin.phone} onChange={(event) => { setAdmin({ ...admin, phone: event.target.value }); setAccountFields((current) => ({ ...current, phone: '' })); }} required minLength={6} /></Flagged>
              <Flagged name="email" label={tx(lang, 'البريد (اختياري)', 'Email (optional)')} message={accountFields.email}><input type="email" dir="ltr" value={admin.email} onChange={(event) => { setAdmin({ ...admin, email: event.target.value }); setAccountFields((current) => ({ ...current, email: '' })); }} /></Flagged>
              <Flagged name="branchId" label={tx(lang, 'الفرع', 'Branch')} message={accountFields.branchId}>
                <select value={admin.branchId || String(branches[0]?.id ?? '')} onChange={(event) => setAdmin({ ...admin, branchId: event.target.value })}>
                  {branches.map((row) => <option key={String(row.id)} value={String(row.id)}>{lang === 'ar' ? String(row.nameAr) : String(row.nameEn || row.nameAr)}</option>)}
                </select>
              </Flagged>
            </div>
            <button type="submit">{tx(lang, 'إنشاء الحساب', 'Create the account')}</button>
          </form>
          <article className="panel">
            <h2>{tx(lang, 'حسابات الدخول', 'Sign-in accounts')}</h2>
            <p className="hint">{tx(lang, 'اسم المستخدم هو رقم الجوال، لا البريد. اكتب رقم الدخول ثم اضغط «تعيين رقم الدخول» على الشخص المقصود. كلمة المرور الجديدة ورمز المرة الواحدة يظهران مرة واحدة أعلى الصفحة.', 'The username is the mobile number, not the email. Type the sign-in code, then press Set sign-in code on that person. A new password and a one-time code appear once at the top of the page.')}</p>
            <label className="field fit">{tx(lang, 'رقم الدخول الجديد', 'New sign-in code')}<input dir="ltr" value={pin} placeholder="1234" onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            {users.length === 0 ? <p className="hint">{tx(lang, 'لا يوجد مستخدمون.', 'No users.')}</p> : (
              <div className="stack">
                {users.map((user) => {
                  const role = roleName(String(user.role));
                  return (
                    <article key={String(user.id)} className="user-row">
                      <div>
                        <strong>{String(user.displayName)}</strong>
                        <p className="hint">
                          {tx(lang, role[0], role[1])}
                          {' · '}<Ltr value={String(user.phone || '—')} />
                          {' · '}{user.isActive === false ? tx(lang, 'موقوف', 'Disabled') : tx(lang, 'يعمل', 'Active')}
                        </p>
                        <p className="hint">
                          {tx(lang, 'محاولات فاشلة', 'Failed sign-ins')}: {String(user.failedLogins)}
                          {' · '}{tx(lang, 'جلسات مفتوحة', 'Open sessions')}: {String(user.sessions)}
                          {' · '}{tx(lang, 'آخر دخول', 'Last sign-in')}: {when(lang, user.lastLoginAt)}
                        </p>
                      </div>
                      <div className="tools">
                        <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/tenants/${id}/reset-password`, { userId: user.id })}>{tx(lang, 'كلمة مرور جديدة', 'New password')}</button>
                        <button type="button" className="ghost" disabled={pin.length < 4} onClick={() => act(`/api/v1/platform/tenants/${id}/reset-pin`, { userId: user.id, pin })}>{tx(lang, 'تعيين رقم الدخول', 'Set sign-in code')}</button>
                        <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/tenants/${id}/user-state`, { userId: user.id, action: 'otp', reason: note })}>{tx(lang, 'رمز لمرة واحدة', 'One-time code')}</button>
                        <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/tenants/${id}/impersonate`, { userId: user.id, reason: note })}>{tx(lang, 'دخول بالنيابة', 'Sign in as this user')}</button>
                        <button type="button" className={user.isActive === false ? '' : 'danger'} onClick={() => act(`/api/v1/platform/tenants/${id}/user-state`, { userId: user.id, action: user.isActive === false ? 'enable' : 'lock', reason: note })}>
                          {user.isActive === false ? tx(lang, 'تفعيل', 'Enable') : tx(lang, 'إيقاف', 'Disable')}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </div>
      ) : null}
      {pane === 'log' ? (
        <article className="panel">
          <h2>{tx(lang, 'سجل الإجراءات', 'Action log')}</h2>
          {audits.length === 0 ? <p className="hint">{tx(lang, 'لا توجد إجراءات.', 'No actions yet.')}</p> : (
            <div className="quiet-list">
              {audits.map((row) => (
                <p key={String(row.id)}>
                  <span>{actionLabel(lang, String(row.action))}</span>
                  <span>{when(lang, row.createdAt)} · {String(row.reason || '—')}</span>
                </p>
              ))}
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}

export function RequestsPage({ embedded = false }: { embedded?: boolean }) {
  const { lang } = usePlatformLang();
  const [status, setStatus] = useState('');
  const board = useLoad<Row[]>(`/api/v1/platform/requests${status ? `?status=${status}` : ''}`);
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  const rows = board.data ?? [];
  const filters: [string, string, string, string][] = [
    ['', 'الكل', 'All', ''],
    ['SUBMITTED', 'جديد', 'New', 'wait'],
    ['UNDER_REVIEW', 'مراجعة', 'Review', 'trial'],
    ['APPROVED', 'معتمد', 'Approved', 'ok'],
    ['TENANT_CREATED', 'حساب جاهز', 'Account ready', 'ok'],
    ['REJECTED', 'مرفوض', 'Rejected', 'bad'],
  ];
  return (
    <section>
      {embedded ? null : (
        <div className="page-head">
          <h1>{tx(lang, 'طلبات الاشتراك', 'Join requests')}</h1>
          <p>{tx(lang, 'الصيدلية ترسل الطلب، وأنت تراجعه ثم تنشئ حساب الدخول. الترتيب ثابت: استلام، مراجعة الترخيص، اعتماد، إنشاء الحساب.', 'A pharmacy sends the request. You review it, then create the sign-in. The order is fixed: receive, check the license, approve, create the account.')}</p>
        </div>
      )}
      <div className="tools">
        {filters.map(([code, ar, en, tone]) => (
          <button key={code || 'all'} type="button" className={status === code ? `pick ${tone}` : 'ghost'} onClick={() => setStatus(code)}>{tx(lang, ar, en)}</button>
        ))}
        {embedded ? null : <a className="jump" href="/subscribe?from=admin">{tx(lang, 'تسجيل طلب جديد', 'Enter a new request')}</a>}
      </div>
      {rows.length === 0 ? <p>{tx(lang, 'لا توجد طلبات في هذا التصفية.', 'No requests in this filter.')}</p> : (
        <table>
          <thead>
            <tr>
              <th>{tx(lang, 'الصيدلية', 'Pharmacy')}</th>
              <th>{tx(lang, 'المالك', 'Owner')}</th>
              <th>{tx(lang, 'الهاتف', 'Phone')}</th>
              <th>{tx(lang, 'الباقة', 'Plan')}</th>
              <th>{tx(lang, 'الحالة', 'Status')}</th>
              <th>{tx(lang, 'وقت الطلب', 'Requested')}</th>
              <th>{tx(lang, 'فتح', 'Open')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = String(row.status);
              const look = requestLook(state);
              const plan = String(row.planCode || '');
              const primary = lang === 'ar' ? String(row.tradeNameAr) : String(row.tradeNameEn || row.tradeNameAr);
              const secondary = lang === 'ar' ? String(row.tradeNameEn || '') : String(row.tradeNameAr || '');
              const action = look.action === 'create'
                ? tx(lang, 'إنشاء الحساب', 'Create account')
                : look.action === 'open'
                  ? tx(lang, 'فتح', 'Open')
                  : tx(lang, 'متابعة', 'Continue');
              return (
                <tr key={String(row.id)} className={look.tone ? `tone-${look.tone}` : undefined}>
                  <td>
                    <strong>{primary}</strong>
                    {secondary && secondary !== primary ? <small className="sub">{secondary}</small> : null}
                    {row.city ? <small className="sub">{String(row.city)}</small> : null}
                  </td>
                  <td>
                    {String(row.ownerName)}
                    {row.ownerEmail ? <small className="sub"><Ltr value={String(row.ownerEmail)} /></small> : null}
                  </td>
                  <td><Ltr value={String(row.ownerPhone ?? '')} /></td>
                  <td>{plan ? <span className={`chip plan ${plan.toLowerCase()}`}>{statusLabel(lang, plan)}</span> : '—'}</td>
                  <td><Badge value={state} label={statusLabel(lang, state)} /></td>
                  <td>{when(lang, row.createdAt)}</td>
                  <td>
                    <Link className={look.action === 'continue' ? 'raised continue' : look.action === 'open' ? 'raised open' : 'raised'} to={`/admin/subscription-requests/${String(row.id)}`}>
                      {action}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function requestLook(status: string): { tone: string; action: 'continue' | 'create' | 'open' } {
  if (status === 'REJECTED') return { tone: 'bad', action: 'continue' };
  if (status === 'TENANT_CREATED' || status === 'ACTIVE') return { tone: 'ok', action: 'open' };
  if (status === 'APPROVED') return { tone: 'go', action: 'create' };
  if (status === 'VERIFIED') return { tone: 'go', action: 'continue' };
  if (status === 'UNDER_REVIEW' || status === 'NEED_MORE_INFO') return { tone: 'trial', action: 'continue' };
  return { tone: 'wait', action: 'continue' };
}

const BILLING_CYCLES = [
  { code: 'MONTHLY', ar: 'في الشهر', en: 'Per month' },
  { code: 'DAILY', ar: 'في اليوم', en: 'Per day' },
  { code: 'YEARLY', ar: 'في السنة', en: 'Per year' },
  { code: 'PAYG', ar: 'حسب الاستخدام', en: 'Pay as you go' },
] as const;

const FALLBACK_OFFERS: Record<string, PlanOffer> = {
  BASIC: { code: 'BASIC', monthlyPrice: '12000.00', dailyPrice: '400.00', yearlyPrice: '120000.00', paygPrice: '400.00' },
  PRO: { code: 'PRO', monthlyPrice: '24000.00', dailyPrice: '800.00', yearlyPrice: '240000.00', paygPrice: '800.00' },
  CHAIN: { code: 'CHAIN', monthlyPrice: '21000.00', dailyPrice: '700.00', yearlyPrice: '210000.00', paygPrice: '700.00' },
};

type PlanOffer = { code: string; monthlyPrice: string; dailyPrice: string; yearlyPrice: string; paygPrice: string };

function cycleWords(cycle: string): { ar: string; en: string } {
  return BILLING_CYCLES.find((item) => item.code === cycle) ?? BILLING_CYCLES[0];
}

function offerPrice(offers: Record<string, PlanOffer>, code: string, cycle: string): string {
  const offer = offers[code] ?? FALLBACK_OFFERS[code];
  if (!offer) return '';
  if (cycle === 'DAILY') return offer.dailyPrice;
  if (cycle === 'YEARLY') return offer.yearlyPrice;
  if (cycle === 'PAYG') return offer.paygPrice;
  return offer.monthlyPrice;
}

function showMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const REQUEST_FLOW = ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'APPROVED', 'TENANT_CREATED'] as const;

export function RequestDetailPage() {
  const { lang } = usePlatformLang();
  const { id = '' } = useParams();
  const board = useLoad<Row>(`/api/v1/platform/requests/${id}`);
  const [reason, setReason] = useState('تمت مراجعة الترخيص');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [taken, setTaken] = useState('');
  const contactKey = board.data ? `${String(board.data.id)}|${String(board.data.ownerPhone ?? '')}|${String(board.data.ownerEmail ?? '')}|${String(board.data.nextAccountCode ?? '')}` : '';
  useEffect(() => {
    const parts = contactKey.split('|');
    if (parts.length < 4 || !parts[0]) return;
    setPhone(parts[1] ?? '');
    setEmail(parts[2] ?? '');
    setAccountCode(parts[3] ?? '');
    setTaken('');
  }, [contactKey]);
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error || !board.data) return <p className="error">{board.error || tx(lang, 'غير موجود', 'Not found')}</p>;
  const data = board.data;
  const status = String(data.status);
  const docs = (data.documents as Row[]) ?? [];
  const pharmacistDoc = docs.some((doc) => doc.kind === 'PHARMACIST_LICENSE');
  const docsReady = docs.some((doc) => doc.kind === 'PHARMACY_LICENSE' && doc.status === 'VALID')
    && (!pharmacistDoc || docs.some((doc) => doc.kind === 'PHARMACIST_LICENSE' && doc.status === 'VALID'));
  const stepIndex = REQUEST_FLOW.indexOf(status as (typeof REQUEST_FLOW)[number]);
  async function act(path: string, body: Row) {
    await run(async () => {
      const result = await api<Row>(path, { method: 'POST', body: JSON.stringify(body) });
      if (result.password) setSecret(`${String(result.phone || result.email || '')} / ${String(result.password)}`);
    }, board.reload, setError);
  }
  return (
    <section>
      <div className="page-head">
        <p className="crumb"><Link to="/admin/tenants?view=requests">{tx(lang, 'الصيدليات', 'Pharmacies')}</Link></p>
        <h1>{String(data.tradeNameAr)}</h1>
        <p>{String(data.ownerName)} — {String(data.ownerPhone)} — {String(data.ownerEmail ?? '')}</p>
      </div>
      <ol className="steps">
        {REQUEST_FLOW.map((code, index) => (
          <li key={code} className={index < stepIndex ? 'step done' : index === stepIndex ? 'step on' : 'step'}>{statusLabel(lang, code)}</li>
        ))}
      </ol>
      <p><Badge value={status} label={statusLabel(lang, status)} /></p>
      <p>{tx(lang, 'الصيدلي المسؤول', 'Responsible pharmacist')}: {String(data.pharmacistName)}</p>
      <p>
        {tx(lang, 'الباقة', 'Plan')} {String(data.planCode)}
        {' — '}{tx(lang, cycleWords(String(data.billingCycle || 'MONTHLY')).ar, cycleWords(String(data.billingCycle || 'MONTHLY')).en)}
        {data.quotedAmount ? <span dir="ltr"> {showMoney(String(data.quotedAmount))}</span> : null}
      </p>
      {error ? <p className="error">{error}</p> : null}
      {secret ? (
        <div className="panel secret">
          <p>
            {tx(lang, 'حساب الدخول يظهر مرة واحدة. سجّله الآن ثم سلّمه للمالك. الترتيب: رمز الصيدلية، ثم الجوال، ثم كلمة المرور.', 'The sign-in is shown once. Copy it now and give it to the owner. The order is pharmacy code, then mobile, then password.')}
            <strong> {secret}</strong>
          </p>
          <ol className="steps">
            <li className="step on">{tx(lang, '١ ادخل معه من شاشة الصيدلية', '1 Sign in with him on the pharmacy screen')}</li>
            <li className="step">{tx(lang, '٢ الإعدادات: اسم الإيصال وعرض الورق', '2 Settings: receipt name and paper width')}</li>
            <li className="step">{tx(lang, '٣ مستخدم للكاشير بجواله', '3 A cashier user, with that person’s mobile')}</li>
            <li className="step">{tx(lang, '٤ أسعار البيع ثم استلام أول بضاعة', '4 Selling prices, then receive the first goods')}</li>
            <li className="step">{tx(lang, '٥ بيع تجريبي ثم تقرير اليوم', '5 A practice sale, then today’s report')}</li>
          </ol>
        </div>
      ) : null}
      <label className="field">{tx(lang, 'ملاحظة الإجراء', 'Note for this step')}<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {status === 'APPROVED' ? (
        <div className="subscribe-grid">
          <label className={taken === 'phone' ? 'field bad wide' : 'field wide'}>
            {tx(lang, 'هاتف المالك', 'Owner phone')}
            <input dir="ltr" value={phone} autoComplete="tel" onChange={(event) => { setPhone(event.target.value); setTaken(''); }} />
            {taken === 'phone' ? <small className="field-error">{tx(lang, 'هذا الهاتف مستخدم. اختر رقماً آخر ثم حدّث.', 'This phone is already used. Choose another, then update.')}</small> : null}
          </label>
          <label className={taken === 'email' ? 'field bad wide' : 'field wide'}>
            {tx(lang, 'بريد المالك', 'Owner email')}
            <input type="email" dir="ltr" value={email} autoComplete="email" onChange={(event) => { setEmail(event.target.value); setTaken(''); }} />
            {taken === 'email' ? <small className="field-error">{tx(lang, 'هذا البريد مستخدم. اختر بريداً آخر ثم حدّث.', 'This email is already used. Choose another, then update.')}</small> : null}
          </label>
          <label className={taken === 'code' ? 'field bad wide' : 'field wide'}>
            {tx(lang, 'رمز الصيدلية', 'Pharmacy code')}
            <input
              dir="ltr"
              value={accountCode}
              autoComplete="off"
              onChange={(event) => {
                setAccountCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16));
                setTaken('');
              }}
            />
            <small className={taken === 'code' ? 'field-error' : 'hint'}>
              {taken === 'code'
                ? tx(lang, 'هذا الرمز مستخدم أو غير صالح. اختر رمزاً من 4 إلى 16 حرفاً أو رقماً يبدأ بحرف.', 'That code is used or not valid. Use 4 to 16 letters or digits, starting with a letter.')
                : tx(lang, 'الرمز التالي معبّأ. غيّره قبل إنشاء الحساب إن أردت رمزاً آخر.', 'The next code is filled in. Change it before creating the account if you want another.')}
            </small>
          </label>
        </div>
      ) : null}
      <div className="tools">
        {status === 'SUBMITTED' || status === 'NEED_MORE_INFO' ? (
          <button type="button" onClick={() => act(`/api/v1/platform/requests/${id}/status`, { status: 'UNDER_REVIEW', reason })}>{tx(lang, 'بدء المراجعة', 'Start review')}</button>
        ) : null}
        {status === 'UNDER_REVIEW' ? (
          <button type="button" disabled={!docsReady} onClick={() => act(`/api/v1/platform/requests/${id}/status`, { status: 'VERIFIED', reason })}>
            {docsReady ? tx(lang, 'الترخيص ساري، إتمام التحقق', 'The license is valid, finish verification') : tx(lang, 'علّم الترخيص سارياً أولاً', 'Mark the license valid first')}
          </button>
        ) : null}
        {status === 'VERIFIED' ? (
          <button type="button" onClick={() => act(`/api/v1/platform/requests/${id}/status`, { status: 'APPROVED', reason })}>{tx(lang, 'اعتماد الطلب', 'Approve the request')}</button>
        ) : null}
        {status === 'APPROVED' ? (
          <>
            <button type="button" className="ghost" onClick={() => {
              void run(
                () => api(`/api/v1/platform/requests/${id}/contact`, { method: 'POST', body: JSON.stringify({ ownerPhone: phone.trim(), ownerEmail: email.trim() }) }),
                board.reload,
                setError,
              );
            }}>{tx(lang, 'تحديث', 'Update')}</button>
            <button type="button" onClick={() => {
              void (async () => {
                setError('');
                try {
                  const nextPhone = phone.trim();
                  const nextEmail = email.trim();
                  if (nextPhone !== String(data.ownerPhone ?? '') || nextEmail !== String(data.ownerEmail ?? '')) {
                    await api(`/api/v1/platform/requests/${id}/contact`, { method: 'POST', body: JSON.stringify({ ownerPhone: nextPhone, ownerEmail: nextEmail }) });
                  }
                  const result = await api<Row>(`/api/v1/platform/requests/${id}/create-tenant`, { method: 'POST', body: JSON.stringify({ overrideReason: reason, accountCode }) });
                  if (result.password) {
                    setSecret(`${String(result.accountCode ?? '')} / ${String(result.phone || nextPhone)} / ${String(result.password)}`);
                  }
                  board.reload();
                } catch (caught) {
                  const fields = caught instanceof ApiError ? caught.fields : {};
                  if (fields.phone === 'taken' || fields.ownerPhone) {
                    setTaken('phone');
                    setError(tx(lang, 'هذا الهاتف مستخدم في صيدلية أخرى. غيّره ثم اضغط تحديث.', 'That phone is already used by another pharmacy. Change it, then update.'));
                    return;
                  }
                  if (fields.email === 'taken' || fields.ownerEmail) {
                    setTaken('email');
                    setError(tx(lang, 'هذا البريد مستخدم في صيدلية أخرى. غيّره ثم اضغط تحديث.', 'That email is already used by another pharmacy. Change it, then update.'));
                    return;
                  }
                  if (fields.accountCode) {
                    setTaken('code');
                    setError(tx(lang, 'رمز الصيدلية غير متاح. غيّره ثم أنشئ الحساب.', 'That pharmacy code is not available. Change it, then create the account.'));
                    return;
                  }
                  setError(caught instanceof Error ? caught.message : tx(lang, 'تعذر التنفيذ', 'Could not finish'));
                }
              })();
            }}>{tx(lang, 'إنشاء حساب الصيدلية', 'Create the pharmacy account')}</button>
          </>
        ) : null}
        {status === 'TENANT_CREATED' && data.tenantId ? (
          <Link className="jump" to={`/admin/tenants/${String(data.tenantId)}`}>{tx(lang, 'فتح الصيدلية', 'Open the pharmacy')}</Link>
        ) : null}
        {['SUBMITTED', 'UNDER_REVIEW', 'NEED_MORE_INFO', 'VERIFIED'].includes(status) ? (
          <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/requests/${id}/status`, { status: 'REJECTED', reason })}>{tx(lang, 'رفض الطلب', 'Reject the request')}</button>
        ) : null}
        {status === 'UNDER_REVIEW' ? (
          <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/requests/${id}/status`, { status: 'NEED_MORE_INFO', reason })}>{tx(lang, 'طلب معلومات إضافية', 'Ask for more information')}</button>
        ) : null}
      </div>
      <h2>{tx(lang, 'المستندات', 'Documents')}</h2>
      {docs.map((doc) => (
        <article key={String(doc.id)} className="panel">
          <p>
            {doc.kind === 'PHARMACY_LICENSE' ? tx(lang, 'ترخيص الصيدلية', 'Pharmacy license') : tx(lang, 'ترخيص الصيدلي', 'Pharmacist license')}
            {' — '}<Ltr value={String(doc.licenseNumber)} /> <Badge value={String(doc.status)} label={statusLabel(lang, String(doc.status))} />
          </p>
          <p>{tx(lang, 'الصلاحية', 'Expiry')}: {doc.expiresOn ? day(lang, doc.expiresOn) : '—'}</p>
          {doc.hasFile ? <a href={`/api/v1/platform/documents/${String(doc.id)}`}>{tx(lang, 'عرض المستند', 'View document')}</a> : <p>{tx(lang, 'لا يوجد ملف مرفق.', 'No file was attached.')}</p>}
          {status === 'UNDER_REVIEW' || status === 'SUBMITTED' || status === 'NEED_MORE_INFO' ? (
            <div className="tools">
              <button type="button" onClick={() => act(`/api/v1/platform/requests/${id}/verify`, { documentId: doc.id, status: 'VALID', reason })}>{tx(lang, 'ترخيص ساري', 'License is valid')}</button>
              <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/requests/${id}/verify`, { documentId: doc.id, status: 'REJECTED', reason })}>{tx(lang, 'رفض المستند', 'Reject the document')}</button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function mapEmbed(latitude: string, longitude: string): string {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const pad = 0.02;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad].map((value) => value.toFixed(5)).join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
}

const SUDAN_PLACES: { ar: string; en: string; cities: { ar: string; en: string }[] }[] = [
  { ar: 'الخرطوم', en: 'Khartoum', cities: [{ ar: 'الخرطوم', en: 'Khartoum' }, { ar: 'أم درمان', en: 'Omdurman' }, { ar: 'بحري', en: 'Bahri' }, { ar: 'شرق النيل', en: 'East Nile' }] },
  { ar: 'الجزيرة', en: 'Gezira', cities: [{ ar: 'ود مدني', en: 'Wad Madani' }, { ar: 'الحصاحيصا', en: 'Hasahisa' }, { ar: 'المناقل', en: 'Manaqil' }] },
  { ar: 'نهر النيل', en: 'River Nile', cities: [{ ar: 'عطبرة', en: 'Atbara' }, { ar: 'شندي', en: 'Shendi' }, { ar: 'الدامر', en: 'Ad Damar' }] },
  { ar: 'الشمالية', en: 'Northern', cities: [{ ar: 'دنقلا', en: 'Dongola' }, { ar: 'مروي', en: 'Merowe' }, { ar: 'كريمة', en: 'Karima' }] },
  { ar: 'البحر الأحمر', en: 'Red Sea', cities: [{ ar: 'بورتسودان', en: 'Port Sudan' }, { ar: 'سواكن', en: 'Suakin' }] },
  { ar: 'كسلا', en: 'Kassala', cities: [{ ar: 'كسلا', en: 'Kassala' }, { ar: 'حلفا الجديدة', en: 'New Halfa' }] },
  { ar: 'القضارف', en: 'Gedaref', cities: [{ ar: 'القضارف', en: 'Gedaref' }, { ar: 'الفاو', en: 'Al Faw' }] },
  { ar: 'سنار', en: 'Sennar', cities: [{ ar: 'سنار', en: 'Sennar' }, { ar: 'سنجة', en: 'Singa' }] },
  { ar: 'النيل الأبيض', en: 'White Nile', cities: [{ ar: 'كوستي', en: 'Kosti' }, { ar: 'ربك', en: 'Rabak' }, { ar: 'الدويم', en: 'Ed Dueim' }] },
  { ar: 'النيل الأزرق', en: 'Blue Nile', cities: [{ ar: 'الدمازين', en: 'Ad Damazin' }, { ar: 'الروصيرص', en: 'Roseires' }] },
  { ar: 'شمال كردفان', en: 'North Kordofan', cities: [{ ar: 'الأبيض', en: 'El Obeid' }, { ar: 'أم روابة', en: 'Umm Rawaba' }] },
  { ar: 'جنوب كردفان', en: 'South Kordofan', cities: [{ ar: 'كادوقلي', en: 'Kadugli' }, { ar: 'الدلنج', en: 'Dilling' }] },
  { ar: 'غرب كردفان', en: 'West Kordofan', cities: [{ ar: 'الفولة', en: 'Al Fula' }, { ar: 'النهود', en: 'En Nahud' }] },
  { ar: 'شمال دارفور', en: 'North Darfur', cities: [{ ar: 'الفاشر', en: 'El Fasher' }, { ar: 'كتم', en: 'Kutum' }] },
  { ar: 'جنوب دارفور', en: 'South Darfur', cities: [{ ar: 'نيالا', en: 'Nyala' }] },
  { ar: 'غرب دارفور', en: 'West Darfur', cities: [{ ar: 'الجنينة', en: 'Geneina' }] },
  { ar: 'وسط دارفور', en: 'Central Darfur', cities: [{ ar: 'زالنجي', en: 'Zalingei' }] },
  { ar: 'شرق دارفور', en: 'East Darfur', cities: [{ ar: 'الضعين', en: 'Ed Daein' }] },
];

const SUBSCRIBE_PLANS = [
  { code: 'BASIC', tone: 'basic', ar: 'أساسية', en: 'Basic', price: '12,000', arFact: 'فرع واحد، بيع ومخزون', enFact: 'One branch, sales and stock', branches: 1, users: 3, devices: 1 },
  { code: 'PRO', tone: 'pro', ar: 'احترافية', en: 'Pro', price: '24,000', arFact: 'مشتريات وحسابات وتأمين', enFact: 'Purchasing, accounts, and insurance', branches: 1, users: 8, devices: 2 },
  { code: 'CHAIN', tone: 'chain', ar: 'سلسلة', en: 'Chain', price: '21,000', arFact: 'عدة فروع وتحويلات بينها', enFact: 'Several branches, with transfers', branches: 2, users: 10, devices: 4 },
] as const;

function subscribeLabel(lang: PlatformLang, key: string): string {
  const labels: Record<string, [string, string]> = {
    tradeNameAr: ['الاسم بالعربية', 'Arabic name'],
    tradeNameEn: ['الاسم بالإنجليزية', 'English name'],
    ownerName: ['اسم المالك', 'Owner name'],
    ownerPhone: ['هاتف المالك', 'Owner phone'],
    ownerEmail: ['بريد المالك', 'Owner email'],
    pharmacistName: ['الصيدلي المسؤول', 'Responsible pharmacist'],
    pharmacistLicense: ['ترخيص الصيدلي', 'Pharmacist license'],
    pharmacyLicense: ['ترخيص الصيدلية', 'Pharmacy license'],
    stateName: ['الولاية', 'State'],
    city: ['المدينة', 'City'],
    addressLine: ['العنوان', 'Address'],
    branchCount: ['عدد الفروع', 'Branches'],
    userCount: ['عدد المستخدمين', 'Users'],
    deviceCount: ['عدد الأجهزة', 'Devices'],
  };
  const pair = labels[key];
  return pair ? tx(lang, pair[0], pair[1]) : key;
}

function subscribeNote(lang: PlatformLang, key: string, code: string): string {
  if (code === 'email') return tx(lang, 'أدخل بريداً صالحاً.', 'Enter a valid email.');
  if (code === 'map') return tx(lang, 'تحقق من العنوان على الخريطة قبل الإرسال.', 'Check the address on the map before sending.');
  if (code === 'mapdown') return tx(lang, 'خدمة الخريطة لم ترد. أعد المحاولة.', 'The map service did not answer. Try again.');
  if (key === 'ownerPhone') return tx(lang, 'أدخل هاتفاً من 6 أرقام على الأقل.', 'Enter a phone of at least 6 digits.');
  if (code === 'range') return tx(lang, 'أدخل رقماً ضمن الحد المسموح.', 'Enter a number inside the allowed limit.');
  return fieldNote(lang, key, code === 'short' ? 'required' : code, subscribeLabel(lang, key));
}

function LicenseFileField({
  label,
  empty,
  fileName,
  onFile,
}: {
  label: string;
  empty: string;
  fileName: string;
  onFile: (file: File, input: HTMLInputElement) => void;
}) {
  return (
    <label className="field wide license-file">
      {label}
      <span className={fileName ? 'license-file-box set' : 'license-file-box'}>
        <input
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            onFile(file, event.currentTarget);
          }}
        />
        <span>{fileName || empty}</span>
      </span>
    </label>
  );
}

const MAX_LICENSE_FILE_BYTES = 1_000_000;

function licenseFileOk(file: File, lang: PlatformLang): string | null {
  if (file.size > MAX_LICENSE_FILE_BYTES) {
    return tx(lang, 'الملف أكبر من 1 ميجابايت.', 'The file is larger than 1 MB.');
  }
  const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!ok) return tx(lang, 'استخدم PDF أو JPG أو PNG.', 'Use PDF, JPG, or PNG.');
  return null;
}

export function SubscribePage() {
  const fromAdmin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('from') === 'admin';
  const [lang, setLang] = useState<PlatformLang>(() => (localStorage.getItem('dawaa.lang') === 'en' ? 'en' : 'ar'));
  const [sent, setSent] = useState('');
  const [access, setAccess] = useState<{ accountCode: string; phone: string; password: string } | null>(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [samePharmacist, setSamePharmacist] = useState(true);
  const [cityOther, setCityOther] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState('');
  const [pin, setPin] = useState<{ latitude: string; longitude: string; label: string; precision: 'address' | 'city' } | null>(null);
  const [offers, setOffers] = useState<Record<string, PlanOffer>>({});
  const [form, setForm] = useState({
    tradeNameAr: '', tradeNameEn: '', ownerName: '', ownerPhone: '', ownerEmail: '',
    pharmacistName: '', pharmacistLicense: '', pharmacyLicense: '', stateName: '', city: '',
    addressLine: '', planCode: 'BASIC', billingCycle: 'MONTHLY', branchCount: 1, userCount: 3, deviceCount: 1, note: '',
    pharmacyFile: '', pharmacyFileName: '', pharmacistFile: '', pharmacistFileName: '', pharmacyExpiry: '', pharmacistExpiry: '',
  });
  useEffect(() => {
    let live = true;
    api<PlanOffer[]>('/api/v1/platform/plans/public')
      .then((rows) => {
        if (!live) return;
        const next: Record<string, PlanOffer> = {};
        for (const row of rows) next[row.code] = row;
        setOffers(next);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    localStorage.setItem('dawaa.lang', lang);
    document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  function edit<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  function pickState(value: string) {
    setCityOther(false);
    setPin(null);
    setMapError('');
    setForm((current) => ({ ...current, stateName: value, city: '' }));
    setFields((current) => {
      const next = { ...current };
      delete next.stateName;
      delete next.city;
      return next;
    });
  }
  function pickCity(value: string) {
    setPin(null);
    setMapError('');
    if (value === '__other') {
      setCityOther(true);
      edit('city', '');
      return;
    }
    setCityOther(false);
    edit('city', value);
  }
  function bump(key: 'branchCount' | 'userCount' | 'deviceCount', delta: number, min: number, max: number) {
    setForm((current) => ({ ...current, [key]: Math.min(max, Math.max(min, current[key] + delta)) }));
    setFields((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  function choosePlan(code: string) {
    const plan = SUBSCRIBE_PLANS.find((item) => item.code === code) ?? SUBSCRIBE_PLANS[0];
    setForm((current) => ({ ...current, planCode: plan.code, branchCount: plan.branches, userCount: plan.users, deviceCount: plan.devices }));
  }
  async function checkMap() {
    const placeNow = SUDAN_PLACES.find((item) => item.ar === form.stateName);
    const cityEn = placeNow?.cities.find((item) => item.ar === form.city)?.en ?? form.city;
    if (form.stateName.trim().length < 2 || form.city.trim().length < 2 || form.addressLine.trim().length < 2) {
      setMapError(subscribeNote(lang, 'addressLine', 'required'));
      return;
    }
    setMapBusy(true);
    setMapError('');
    try {
      const result = await api<{ latitude: string; longitude: string; label: string; precision: 'address' | 'city' }>('/api/v1/platform/places/check', {
        method: 'POST',
        body: JSON.stringify({
          stateName: form.stateName,
          stateEn: placeNow?.en ?? form.stateName,
          city: form.city,
          cityEn,
          addressLine: form.addressLine,
        }),
      });
      setPin(result);
      setFields((current) => {
        if (!current.addressLine) return current;
        const next = { ...current };
        delete next.addressLine;
        return next;
      });
    } catch (caught) {
      setPin(null);
      const code = caught instanceof ApiError ? caught.fields.addressLine : '';
      setMapError(code ? subscribeNote(lang, 'addressLine', code) : (caught instanceof Error ? caught.message : say('تعذر التحقق.', 'The check failed.')));
    } finally {
      setMapBusy(false);
    }
  }
  function problems(): Record<string, string> {
    const bag: Record<string, string> = {};
    const need = (key: string, value: string) => {
      if (value.trim().length < 2) bag[key] = subscribeNote(lang, key, 'required');
    };
    need('tradeNameAr', form.tradeNameAr);
    need('tradeNameEn', form.tradeNameEn);
    need('ownerName', form.ownerName);
    if (form.ownerPhone.trim().length < 6) bag.ownerPhone = subscribeNote(lang, 'ownerPhone', 'short');
    if (!form.ownerEmail.trim()) bag.ownerEmail = subscribeNote(lang, 'ownerEmail', 'required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())) bag.ownerEmail = subscribeNote(lang, 'ownerEmail', 'email');
    if (!samePharmacist) need('pharmacistName', form.pharmacistName);
    need('pharmacyLicense', form.pharmacyLicense);
    need('stateName', form.stateName);
    need('city', form.city);
    need('addressLine', form.addressLine);
    if (form.branchCount < 1 || form.branchCount > 50) bag.branchCount = subscribeNote(lang, 'branchCount', 'range');
    if (form.userCount < 1 || form.userCount > 500) bag.userCount = subscribeNote(lang, 'userCount', 'range');
    if (form.deviceCount < 1 || form.deviceCount > 200) bag.deviceCount = subscribeNote(lang, 'deviceCount', 'range');
    return bag;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const bag = problems();
    setFields(bag);
    const first = Object.keys(bag)[0];
    if (first) {
      setError(tx(lang, 'راجع الحقول الملونة ثم أعد الإرسال.', 'Check the colored fields, then send again.'));
      focusField(first);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ id: string; accountCode?: string; phone?: string; password?: string }>('/api/v1/platform/requests', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          pharmacistLicense: '',
          pharmacistExpiry: '',
          pharmacistFile: '',
          pharmacistFileName: '',
          pharmacistName: samePharmacist ? form.ownerName.trim() : form.pharmacistName,
          latitude: pin ? Number(pin.latitude) : null,
          longitude: pin ? Number(pin.longitude) : null,
          openTrial: !fromAdmin,
        }),
      });
      setSent(result.id);
      if (result.accountCode && result.password) {
        setAccess({ accountCode: result.accountCode, phone: result.phone || form.ownerPhone.trim(), password: result.password });
      } else if (fromAdmin) window.location.assign(`/admin/subscription-requests/${result.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0) {
        const next: Record<string, string> = {};
        for (const [key, code] of Object.entries(caught.fields)) next[key] = subscribeNote(lang, key, code);
        setFields(next);
        focusField(Object.keys(next)[0] ?? '');
      }
      setError(caught instanceof Error ? caught.message : tx(lang, 'تعذر الإرسال.', 'The request could not be sent.'));
    } finally {
      setBusy(false);
    }
  }
  const say = (ar: string, en: string) => tx(lang, ar, en);
  const place = SUDAN_PLACES.find((item) => item.ar === form.stateName);
  const homeHref = fromAdmin ? '/admin/subscription-requests' : '/';
  const homeLabel = fromAdmin ? say('رجوع لطلبات الاشتراك', 'Back to join requests') : say('العودة للرئيسية', 'Back to home');
  return (
    <section className="subscribe-page" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <aside className="subscribe-hero">
        <div>
          <p className="subscribe-kicker">{say('دواء', 'Dawaa')}</p>
          <h1>{say('طلب اشتراك صيدلية', 'Pharmacy subscription request')}</h1>
          <p>{say('الاسم، الترخيص، والباقة. الولاية والمدينة والحجم تُختار ولا تُكتب.', 'Name, license, and plan. State, city, and size are choices, not typing.')}</p>
        </div>
        <div className="subscribe-tools">
          <a href={homeHref}>{homeLabel}</a>
          <button type="button" onClick={() => setLang((current) => (current === 'ar' ? 'en' : 'ar'))}>{lang === 'ar' ? 'English' : 'العربية'}</button>
        </div>
      </aside>
      {sent ? (
        <div className="subscribe-done">
          <p className="subscribe-kicker">{say('تم الإرسال', 'Sent')}</p>
          <h2>{access ? say('تم إرسال الطلب وفتح النسخة التجريبية', 'The request was sent and the trial is open') : say('وصل طلب الاشتراك', 'The subscription request is in')}</h2>
          {access ? (
            <>
              <p>{say('النسخة التجريبية لمدة 14 يوماً. اسم المستخدم هو رقم الجوال.', 'This is a trial edition for 14 days. The username is the mobile number.')}</p>
              <p>{say('رمز الصيدلية', 'Pharmacy code')}: <bdi dir="ltr">{access.accountCode}</bdi></p>
              <p>{say('اسم المستخدم (الجوال)', 'Username (mobile)')}: <bdi dir="ltr">{access.phone}</bdi></p>
              <p>{say('كلمة المرور', 'Password')}: <bdi dir="ltr">{access.password}</bdi></p>
              <p>{say('يرجى التواصل مع', 'Please contact')} <bdi dir="ltr">sales@dwaa.net</bdi></p>
              <p><bdi dir="ltr">00249123568500</bdi></p>
            </>
          ) : (
            <p>{say('ستراجع المنصة الصيدلية والتراخيص. الدخول يبقى مغلقاً حتى الاعتماد.', 'The platform reviews the pharmacy and the licenses. Sign-in stays closed until it is approved.')}</p>
          )}
          <a className="raised" href={homeHref}>{homeLabel}</a>
        </div>
      ) : (
        <form className="subscribe-form" noValidate onSubmit={submit}>
          <div className="subscribe-band">
            <h2>
              {say('الصيدلية والمالك', 'Pharmacy and owner')}
              <HelpTip text={say('الاسم بالعربية والإنجليزية، ثم الولاية والمدينة، ثم جوال المالك. هذا الجوال هو الذي يدخل به لاحقاً.', 'Arabic and English names, then the state and city, then the owner’s mobile. That mobile is what they will sign in with later.')} />
            </h2>
            <div className="subscribe-grid">
              <Flagged name="tradeNameAr" label={subscribeLabel(lang, 'tradeNameAr')} message={fields.tradeNameAr}>
                <input autoComplete="organization" value={form.tradeNameAr} onChange={(event) => edit('tradeNameAr', event.target.value)} />
              </Flagged>
              <Flagged name="tradeNameEn" label={subscribeLabel(lang, 'tradeNameEn')} message={fields.tradeNameEn}>
                <input autoComplete="organization" value={form.tradeNameEn} onChange={(event) => edit('tradeNameEn', event.target.value)} />
              </Flagged>
              <Flagged name="stateName" label={subscribeLabel(lang, 'stateName')} message={fields.stateName}>
                <select value={form.stateName} onChange={(event) => pickState(event.target.value)}>
                  <option value="">{say('اختر الولاية', 'Choose the state')}</option>
                  {SUDAN_PLACES.map((item) => <option key={item.ar} value={item.ar}>{say(item.ar, item.en)}</option>)}
                </select>
              </Flagged>
              <label className={fields.city ? 'field bad' : 'field'} data-field="city">
                {subscribeLabel(lang, 'city')}
                <select value={cityOther ? '__other' : form.city} disabled={!place} onChange={(event) => pickCity(event.target.value)} aria-invalid={fields.city ? true : undefined}>
                  <option value="">{place ? say('اختر المدينة', 'Choose the city') : say('اختر الولاية أولاً', 'Choose the state first')}</option>
                  {(place?.cities ?? []).map((item) => <option key={item.ar} value={item.ar}>{say(item.ar, item.en)}</option>)}
                  {place ? <option value="__other">{say('مدينة أخرى', 'Another city')}</option> : null}
                </select>
                {cityOther ? <input value={form.city} onChange={(event) => edit('city', event.target.value)} placeholder={say('اسم المدينة', 'City name')} /> : null}
                {fields.city ? <small id="city-error" className="field-error">{fields.city}</small> : null}
              </label>
              <Flagged className="wide" name="addressLine" label={subscribeLabel(lang, 'addressLine')} message={fields.addressLine}>
                <input autoComplete="street-address" value={form.addressLine} onChange={(event) => {
                  setPin(null);
                  setMapError('');
                  edit('addressLine', event.target.value);
                }} />
              </Flagged>
              <div className="wide place-check">
                <button type="button" className="ghost" disabled={mapBusy} onClick={() => void checkMap()}>
                  {mapBusy ? say('لحظة…', 'One moment…') : say('الخريطة اختيارية', 'Map (optional)')}
                </button>
                <p className="hint">{say('العنوان المكتوب يكفي. الخريطة اختيار لإظهار المكان، وليست شرطاً للإرسال.', 'The written address is enough. The map only shows the place, and sending does not require it.')}</p>
                {mapError ? <small className="field-error">{mapError}</small> : null}
                {pin ? (
                  <>
                    <p className="hint">
                      {pin.precision === 'city'
                        ? say('الخريطة وجدت المدينة. يمكنك الإرسال من دونها.', 'The map found the city. You can send without it.')
                        : say('الخريطة وجدت العنوان. يمكنك الإرسال من دونها.', 'The map found this address. You can send without it.')}
                      {' '}{pin.label}
                    </p>
                    <iframe title={say('خريطة العنوان', 'Address map')} src={mapEmbed(pin.latitude, pin.longitude)} />
                  </>
                ) : null}
              </div>
              <Flagged name="ownerName" label={subscribeLabel(lang, 'ownerName')} message={fields.ownerName}>
                <input autoComplete="name" value={form.ownerName} onChange={(event) => edit('ownerName', event.target.value)} />
              </Flagged>
              <Flagged name="ownerPhone" label={subscribeLabel(lang, 'ownerPhone')} message={fields.ownerPhone}>
                <input autoComplete="tel" dir="ltr" value={form.ownerPhone} onChange={(event) => edit('ownerPhone', event.target.value)} />
              </Flagged>
              <Flagged className="wide" name="ownerEmail" label={subscribeLabel(lang, 'ownerEmail')} message={fields.ownerEmail}>
                <input type="email" autoComplete="email" dir="ltr" value={form.ownerEmail} onChange={(event) => edit('ownerEmail', event.target.value)} />
              </Flagged>
            </div>
          </div>
          <div className="subscribe-band">
            <h2>
              {say('التراخيص', 'Licenses')}
              <HelpTip text={say('رقم ترخيص الصيدلية مطلوب، وتاريخ الصلاحية إن وُجد. الملف اختياري (PDF أو صورة، حتى 1 ميجابايت).', 'The pharmacy license number is required, and the expiry date if you have it. The file is optional (PDF or image, up to 1 MB).')} />
            </h2>
            <label className="subscribe-check">
              <input type="checkbox" checked={samePharmacist} onChange={(event) => {
                setSamePharmacist(event.target.checked);
                if (event.target.checked) setFields((current) => {
                  if (!current.pharmacistName) return current;
                  const next = { ...current };
                  delete next.pharmacistName;
                  return next;
                });
              }} />
              {say('المالك هو الصيدلي المسؤول', 'The owner is the responsible pharmacist')}
            </label>
            <div className="subscribe-grid">
              {samePharmacist ? null : (
                <Flagged className="wide" name="pharmacistName" label={subscribeLabel(lang, 'pharmacistName')} message={fields.pharmacistName}>
                  <input autoComplete="name" value={form.pharmacistName} onChange={(event) => edit('pharmacistName', event.target.value)} />
                </Flagged>
              )}
              <Flagged name="pharmacyLicense" label={subscribeLabel(lang, 'pharmacyLicense')} message={fields.pharmacyLicense}>
                <input value={form.pharmacyLicense} onChange={(event) => edit('pharmacyLicense', event.target.value)} />
              </Flagged>
              <Flagged name="pharmacyExpiry" label={say('صلاحية الترخيص', 'License expiry')} message={fields.pharmacyExpiry}>
                <input type="date" value={form.pharmacyExpiry} onChange={(event) => edit('pharmacyExpiry', event.target.value)} />
              </Flagged>
              <LicenseFileField
                label={say('ملف الصيدلية', 'Pharmacy file')}
                empty={say('لم يُختر ملف', 'No file chosen')}
                fileName={form.pharmacyFileName}
                onFile={(file, input) => {
                  const problem = licenseFileOk(file, lang);
                  if (problem) { setError(problem); input.value = ''; return; }
                  setError('');
                  void readFile(file).then((content) => setForm((current) => ({ ...current, pharmacyFile: content, pharmacyFileName: file.name })));
                }}
              />
            </div>
          </div>
          <div className="subscribe-band">
            <h2>
              {say('الباقة', 'Plan')}
              <HelpTip text={say('الباقة تحدد عدد الفروع والمستخدمين. سعر السلسلة لكل فرع. يمكنك زيادة العدد بالأزرار ضمن حد الباقة.', 'The plan sets how many branches and users are included. The chain price is per branch. Use the buttons to raise the count within the plan limit.')} />
            </h2>
            <div className="cycle-pick">
              {BILLING_CYCLES.map((cycle) => (
                <button key={cycle.code} type="button" className={form.billingCycle === cycle.code ? 'cycle on' : 'cycle'} onClick={() => edit('billingCycle', cycle.code)}>
                  {say(cycle.ar, cycle.en)}
                </button>
              ))}
            </div>
            <div className="plan-pick">
              {SUBSCRIBE_PLANS.map((plan) => (
                <button key={plan.code} type="button" className={form.planCode === plan.code ? `plan-card on ${plan.tone}` : `plan-card ${plan.tone}`} onClick={() => choosePlan(plan.code)}>
                  <strong>{say(plan.ar, plan.en)}</strong>
                  <span>{say(plan.arFact, plan.enFact)}</span>
                  <b dir="ltr">{showMoney(offerPrice(offers, plan.code, form.billingCycle))} <small>{say(cycleWords(form.billingCycle).ar, cycleWords(form.billingCycle).en)}</small></b>
                </button>
              ))}
            </div>
            <p className="subscribe-hint">{say('الحجم يأتي من الباقة. زده أو انقصه بالأزرار.', 'Size comes from the plan. Use the buttons to change it.')}</p>
            <div className="subscribe-counts">
              {([
                ['branchCount', 1, 50],
                ['userCount', 1, 500],
                ['deviceCount', 1, 200],
              ] as const).map(([key, min, max]) => (
                <div key={key} className={fields[key] ? 'field bad' : 'field'} data-field={key}>
                  <span>{subscribeLabel(lang, key)}</span>
                  <span className="stepper">
                    <button type="button" aria-label={say('أنقص', 'Decrease')} onClick={() => bump(key, -1, min, max)}>−</button>
                    <input type="number" min={min} max={max} value={form[key]} onChange={(event) => edit(key, Number(event.target.value))} />
                    <button type="button" aria-label={say('زد', 'Increase')} onClick={() => bump(key, 1, min, max)}>+</button>
                  </span>
                  {fields[key] ? <small className="field-error">{fields[key]}</small> : null}
                </div>
              ))}
            </div>
            {showNote ? (
              <Flagged name="note" label={say('ملاحظة', 'Note')} message={fields.note}>
                <textarea rows={2} value={form.note} onChange={(event) => edit('note', event.target.value)} />
              </Flagged>
            ) : (
              <button type="button" className="subscribe-note" onClick={() => setShowNote(true)}>{say('إضافة ملاحظة', 'Add a note')}</button>
            )}
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="subscribe-send" type="submit" disabled={busy}>{busy ? say('لحظة…', 'One moment…') : say('إرسال الطلب', 'Send the request')}</button>
        </form>
      )}
    </section>
  );
}

export function CatalogPage() {
  const { lang } = usePlatformLang();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const board = useLoad<{ total: number; rows: Row[] }>(`/api/v1/platform/catalog?q=${encodeURIComponent(query)}`);
  const dupes = useLoad<{ groups: { codes: string[] }[] }>('/api/v1/platform/catalog/duplicates');
  const [error, setError] = useState('');
  const [csv, setCsv] = useState('');
  const [form, setForm] = useState({
    code: '', itemType: 'Medicine', nameAr: '', nameEn: '', genericName: '', strength: '', dosageForm: 'TABLET',
    manufacturer: '', country: 'SD', categoryName: 'عام', atcCode: '', barcode: '', unitName: 'علبة', factorToBase: 1,
    isControlled: false, requiresPrescription: true, storageCondition: 'درجة الغرفة', status: 'active',
  });
  if (board.loading) return <p>جار التحميل…</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'الدليل الدوائي العالمي', 'Global medical library')}</h1>
        <p>{tx(lang, 'النشر يجعل الصنف قابلاً للبحث في كل صيدلية فوراً. لا يُنسخ سجل الدواء إلى كل صيدلية.', 'Publishing makes the item searchable in every pharmacy at once. The medicine record is not copied into each pharmacy.')}</p>
      </div>
      <form className="tools" onSubmit={(event) => { event.preventDefault(); setQuery(q); }}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={tx(lang, 'اسم أو رمز', 'Name or code')} />
        <button type="submit">{tx(lang, 'بحث', 'Search')}</button>
      </form>
      {dupes.data && dupes.data.groups.length > 0 ? <p className="hint">{tx(lang, `تكرارات محتملة: ${dupes.data.groups.length}`, `Possible duplicates: ${dupes.data.groups.length}`)} — {dupes.data.groups.slice(0, 3).map((group) => group.codes.join(' / ')).join(' · ')}</p> : null}
      <p><a href="/api/v1/platform/catalog/export.xlsx">{tx(lang, 'تصدير إكسل', 'Excel export')}</a></p>
      <form className="panel" onSubmit={(event) => {
        event.preventDefault();
        void run(() => api('/api/v1/platform/catalog/import', { method: 'POST', body: JSON.stringify({ csv, publish: true }) }).then(() => undefined), board.reload, setError);
      }}>
        <label className="field">{tx(lang, 'استيراد CSV', 'Import CSV')}<textarea rows={3} value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="code,nameAr,nameEn,genericName,dosageForm,strength,manufacturer,barcode" /></label>
        <button type="submit">{tx(lang, 'استيراد ونشر', 'Import and publish')}</button>
      </form>
      <form className="panel" onSubmit={(event) => {
        event.preventDefault();
        void run(() => api('/api/v1/platform/catalog', { method: 'POST', body: JSON.stringify(form) }).then(() => undefined), board.reload, setError);
      }}>
        <div className="grid">
          <label className="field">الرمز<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></label>
          <label className="field">النوع
            <select value={form.itemType} onChange={(event) => setForm({ ...form, itemType: event.target.value })}>
              {['Medicine', 'Medical supplies', 'OTC', 'Cosmetics', 'Consumables', 'Medical devices', 'Service item'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field">الاسم العربي<input value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} required /></label>
          <label className="field">الاسم الإنجليزي<input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} required /></label>
          <label className="field">الاسم العلمي<input value={form.genericName} onChange={(event) => setForm({ ...form, genericName: event.target.value })} required /></label>
          <label className="field">الباركود<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">حفظ وتفعيل</button>
      </form>
      {(board.data?.rows ?? []).length === 0 ? <p>{tx(lang, 'لا توجد نتائج. نزّل الدليل أو غيّر البحث.', 'Nothing matched. Download the library or change the search.')}</p> : (
        <table>
          <tbody>
            {(board.data?.rows ?? []).map((row) => (
              <tr key={String(row.id)}>
                <td>{String(row.nameAr)}</td>
                <td>{String(row.itemType)}</td>
                <td><Badge value={String(row.status)} /></td>
                <td><button onClick={() => run(() => api(`/api/v1/platform/catalog/${String(row.id)}/push`, { method: 'POST' }).then(() => undefined), board.reload, setError)}>{tx(lang, 'نشر للجميع', 'Publish to all')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function suggestionsOf(row: Row): { id: string; nameAr: string }[] {
  if (!Array.isArray(row.suggestions)) return [];
  return row.suggestions.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const suggestion = item as Row;
    const id = String(suggestion.id ?? '');
    if (!id) return [];
    return [{ id, nameAr: String(suggestion.nameAr ?? '') }];
  });
}

export function ItemRequestsPage() {
  const { lang } = usePlatformLang();
  const board = useLoad<Row[]>('/api/v1/platform/catalog-requests');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  const rows = board.data ?? [];
  function decide(id: string, status: string, mergedItemId = '') {
    if (status === 'REJECTED' && reason.trim().length < 3) {
      setReasonError(tx(lang, 'أدخل سبب الرفض.', 'Enter a reason for the rejection.'));
      focusField('reason');
      return;
    }
    setReasonError('');
    void run(
      () => api(`/api/v1/platform/catalog-requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ status, reason, mergedItemId }) }).then(() => undefined),
      board.reload,
      setError,
    );
  }
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'طلبات الأصناف الجديدة', 'New medicine requests')}</h1>
        <p>{tx(lang, 'اعتمد الصنف لينشر في الدليل العالمي، أو اربطه بصنف موجود، أو ارفضه.', 'Approve the item so it is published in the global library, link it to an existing item, or reject it.')}</p>
      </div>
      <Flagged name="reason" label={tx(lang, 'السبب', 'Reason')} message={reasonError}>
        <input value={reason} onChange={(event) => { setReason(event.target.value); setReasonError(''); }} />
      </Flagged>
      {error ? <p className="error">{error}</p> : null}
      {rows.length === 0 ? <p>{tx(lang, 'لا توجد طلبات.', 'No requests.')}</p> : rows.map((row) => {
        const suggestions = suggestionsOf(row);
        const status = String(row.status);
        return (
          <article key={String(row.id)} className="panel">
            <p>{String(row.nameAr)} — {String(row.nameEn)} <Badge value={status} label={statusLabel(lang, status)} /></p>
            <p className="hint">{[row.genericName, row.manufacturer, row.strength, row.packaging, row.barcode].filter(Boolean).map(String).join(' · ')}</p>
            {suggestions.length > 0 ? (
              <p className="hint">{tx(lang, 'يشبه صنفاً موجوداً', 'Looks like an existing item')}: {suggestions.map((item) => item.nameAr).join(lang === 'ar' ? '، ' : ', ')}</p>
            ) : null}
            <div className="tools">
              <button type="button" onClick={() => decide(String(row.id), 'APPROVED')}>{tx(lang, 'نشر في الدليل', 'Publish to the library')}</button>
              {suggestions.map((item) => (
                <button key={item.id} type="button" className="ghost" onClick={() => decide(String(row.id), 'MERGED_WITH_EXISTING', item.id)}>{tx(lang, 'ربط بـ', 'Link to')} {item.nameAr}</button>
              ))}
              <button type="button" className="ghost" onClick={() => decide(String(row.id), 'REJECTED')}>{tx(lang, 'رفض', 'Reject')}</button>
              <button type="button" className="ghost" onClick={() => decide(String(row.id), 'DUPLICATE_SUSPECTED', suggestions[0]?.id ?? '')}>{tx(lang, 'مكرر محتمل', 'Possible duplicate')}</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export function PartnersPage() {
  const board = useLoad<Row[]>('/api/v1/platform/partners');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', partnerType: 'Supplier/distributor', contactName: '', phone: '', email: '', licenseNumber: '',
    issuedOn: '2026-01-01', expiresOn: '2026-11-01', modules: 'POS', notes: '',
  });
  if (board.loading) return <p>جار التحميل…</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  return (
    <section>
      <h1>الشركاء المرخصون</h1>
      <form className="panel" onSubmit={(event) => {
        event.preventDefault();
        void run(() => api('/api/v1/platform/partners', { method: 'POST', body: JSON.stringify(form) }).then(() => undefined), board.reload, setError);
      }}>
        <div className="grid">
          <label className="field">الاسم<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label className="field">النوع
            <select value={form.partnerType} onChange={(event) => setForm({ ...form, partnerType: event.target.value })}>
              {['Pharmacy group', 'Individual pharmacy', 'Supplier/distributor', 'Insurance company', 'Payment provider', 'Implementation/support partner', 'Reseller/agent'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field">جهة الاتصال<input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} required /></label>
          <label className="field">الهاتف<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
          <label className="field">البريد<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label className="field">رقم الترخيص<input value={form.licenseNumber} onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })} required /></label>
          <label className="field">الانتهاء<input type="date" value={form.expiresOn} onChange={(event) => setForm({ ...form, expiresOn: event.target.value })} /></label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">حفظ الشريك</button>
      </form>
      {(board.data ?? []).map((row) => (
        <article key={String(row.id)} className="panel">
          <p>{String(row.name)} — {String(row.partnerType)} <Badge value={String(row.status)} /></p>
          {((row.licenses as Row[]) ?? []).map((license) => (
            <p key={String(license.id)}>ينتهي {String(license.expiresOn)} {license.alert ? <Badge value="NEEDS_RENEWAL" /> : null}</p>
          ))}
        </article>
      ))}
    </section>
  );
}

export function AccountsPage() {
  const { lang } = usePlatformLang();
  const board = useLoad<Row[]>('/api/v1/platform/pharmacy-accounts');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  const rows = board.data ?? [];
  async function act(path: string, body: Row) {
    await run(async () => {
      const result = await api<Row>(path, { method: 'POST', body: JSON.stringify(body) });
      if (result.password) setSecret(String(result.password));
    }, board.reload, setError);
  }
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'حسابات الدخول', 'Sign-in accounts')}</h1>
        <p>{tx(lang, 'كل حساب يدخل باسم المستخدم وهو رقم الجوال، لا البريد. من هنا تعيد كلمة المرور أو توقف الدخول.', 'Each account signs in with the username, which is the mobile number, not the email. Reset the password or stop the sign-in here.')}</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {secret ? <p className="panel">{tx(lang, 'كلمة المرور الجديدة، تظهر مرة واحدة:', 'New password, shown once:')} <strong>{secret}</strong></p> : null}
      {rows.length === 0 ? <p>{tx(lang, 'لا توجد حسابات.', 'No accounts.')}</p> : (
        <table>
          <thead>
            <tr>
              <th>{tx(lang, 'الصيدلية', 'Pharmacy')}</th>
              <th>{tx(lang, 'الاسم', 'Name')}</th>
              <th>{tx(lang, 'اسم المستخدم (الجوال)', 'Username (mobile)')}</th>
              <th>{tx(lang, 'الدور', 'Role')}</th>
              <th>{tx(lang, 'الحالة', 'Status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${String(row.tenantId)}-${String(row.id)}`}>
                <td><Link to={`/admin/tenants/${String(row.tenantId)}`}>{String(row.tenantName)}</Link></td>
                <td>{String(row.displayName)}</td>
                <td><Ltr value={String(row.phone || '—')} /></td>
                <td>{tx(lang, roleName(String(row.role))[0], roleName(String(row.role))[1])}</td>
                <td>{row.isActive === false ? tx(lang, 'موقوف', 'Disabled') : tx(lang, 'يعمل', 'Active')}</td>
                <td className="tools">
                  <button type="button" onClick={() => act(`/api/v1/platform/tenants/${String(row.tenantId)}/reset-password`, { userId: row.id })}>{tx(lang, 'كلمة مرور جديدة', 'New password')}</button>
                  <button type="button" className="ghost" onClick={() => act(`/api/v1/platform/tenants/${String(row.tenantId)}/user-state`, { userId: row.id, action: row.isActive === false ? 'enable' : 'lock', reason: row.isActive === false ? 'إعادة تفعيل الحساب' : 'إيقاف الحساب من المنصة' })}>
                    {row.isActive === false ? tx(lang, 'تفعيل', 'Enable') : tx(lang, 'إيقاف', 'Disable')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const PRICE_FIELDS = [
  ['monthlyPrice', 'في الشهر', 'Per month'],
  ['dailyPrice', 'في اليوم', 'Per day'],
  ['yearlyPrice', 'في السنة', 'Per year'],
  ['paygPrice', 'حسب الاستخدام', 'Pay as you go'],
] as const;

type PriceDraft = {
  code: string;
  nameAr: string;
  nameEn: string;
  headOfficeFee: string;
  monthlyPrice: string;
  dailyPrice: string;
  yearlyPrice: string;
  paygPrice: string;
};

export function PlanPriceSettings() {
  const { lang } = usePlatformLang();
  const board = useLoad<Row[]>('/api/v1/platform/plans');
  const [draft, setDraft] = useState<PriceDraft[] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!board.data) return;
    setDraft(board.data.map((row) => ({
      code: String(row.code),
      nameAr: String(row.nameAr),
      nameEn: String(row.nameEn),
      headOfficeFee: String(row.headOfficeFee ?? '0'),
      monthlyPrice: String(row.monthlyPrice ?? ''),
      dailyPrice: String(row.dailyPrice ?? ''),
      yearlyPrice: String(row.yearlyPrice ?? ''),
      paygPrice: String(row.paygPrice ?? ''),
    })));
  }, [board.data]);
  if (board.loading || !draft) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  function editPrice(code: string, key: (typeof PRICE_FIELDS)[number][0], value: string) {
    setSaved(false);
    setDraft((current) => (current ?? []).map((row) => (row.code === code ? { ...row, [key]: value } : row)));
    setFields((current) => {
      const name = `${code}-${key}`;
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const bag: Record<string, string> = {};
    for (const row of draft ?? []) {
      for (const [key, ar, en] of PRICE_FIELDS) {
        if (!/^\d+(\.\d{1,2})?$/.test(row[key].trim())) bag[`${row.code}-${key}`] = tx(lang, `أدخل سعر ${ar}.`, `Enter the ${en.toLowerCase()} price.`);
      }
    }
    setFields(bag);
    if (Object.keys(bag).length > 0) {
      setError(tx(lang, 'راجع الأسعار الملونة.', 'Check the colored prices.'));
      focusField(Object.keys(bag)[0] ?? '');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/v1/platform/plans/prices', {
        method: 'POST',
        body: JSON.stringify({
          plans: (draft ?? []).map((row) => ({
            code: row.code,
            monthlyPrice: row.monthlyPrice.trim(),
            dailyPrice: row.dailyPrice.trim(),
            yearlyPrice: row.yearlyPrice.trim(),
            paygPrice: row.paygPrice.trim(),
          })),
        }),
      });
      setSaved(true);
      board.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tx(lang, 'تعذر الحفظ.', 'The prices could not be saved.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="price-settings" noValidate onSubmit={save}>
      <p className="hint">{tx(lang, 'هذه الأسعار تظهر في طلب اشتراك الصيدلية. سعر السلسلة لكل فرع، وتُضاف رسوم المكتب الرئيسي على الفاتورة الشهرية فقط.', 'These prices appear on the pharmacy subscription request. A chain price is per branch, and the head-office fee is added only on the monthly bill.')}</p>
      {(draft ?? []).map((row) => (
        <article key={row.code} className="card">
          <h2>{lang === 'ar' ? row.nameAr : row.nameEn}</h2>
          <p>{row.code}{Number(row.headOfficeFee) > 0 ? ` — ${tx(lang, 'مكتب رئيسي', 'Head office')} ${showMoney(row.headOfficeFee)}` : ''}</p>
          <div className="price-config">
            {PRICE_FIELDS.map(([key, ar, en]) => (
              <Flagged key={key} name={`${row.code}-${key}`} label={tx(lang, ar, en)} message={fields[`${row.code}-${key}`]}>
                <input inputMode="decimal" value={row[key]} onChange={(event) => editPrice(row.code, key, event.target.value)} />
              </Flagged>
            ))}
          </div>
        </article>
      ))}
      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="notice">{tx(lang, 'حُفظت الأسعار. طلب الاشتراك يستخدمها الآن.', 'Prices saved. The subscription request uses them now.')}</p> : null}
      <button type="submit" disabled={busy}>{busy ? tx(lang, 'لحظة…', 'One moment…') : tx(lang, 'حفظ الأسعار', 'Save prices')}</button>
    </form>
  );
}

export function PlansPage() {
  const { lang } = usePlatformLang();
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'أسعار الباقات', 'Plan prices')}</h1>
        <p>{tx(lang, 'حدد سعر كل باقة في الشهر واليوم والسنة وحسب الاستخدام.', 'Set each plan per month, per day, per year, and pay as you go.')}</p>
      </div>
      <PlanPriceSettings />
    </section>
  );
}

export function InvoicesPage() {
  const board = useLoad<Row[]>('/api/v1/platform/invoices');
  const [error, setError] = useState('');
  if (board.loading) return <p>جار التحميل…</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  return (
    <section>
      <h1>فواتير الاشتراك</h1>
      {error ? <p className="error">{error}</p> : null}
      {(board.data ?? []).length === 0 ? <p>لا توجد فواتير.</p> : (board.data ?? []).map((row) => (
        <div key={String(row.id)} className="tools">
          <span>{String(row.amount)} — <Badge value={String(row.status)} /></span>
          <button onClick={() => run(() => api('/api/v1/platform/proofs', { method: 'POST', body: JSON.stringify({ invoiceId: row.id, method: 'BANKAK', note: 'إثبات بنكك', fileName: 'proof.txt' }) }).then(() => undefined), board.reload, setError)}>تسجيل إثبات بنكك</button>
        </div>
      ))}
    </section>
  );
}

export function ProofsPage() {
  const board = useLoad<Row[]>('/api/v1/platform/proofs');
  const [error, setError] = useState('');
  if (board.loading) return <p>جار التحميل…</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  const rows = board.data ?? [];
  return (
    <section>
      <h1>إثباتات الدفع</h1>
      {error ? <p className="error">{error}</p> : null}
      {rows.length === 0 ? <p>لا توجد إثباتات.</p> : rows.map((row) => (
        <div key={String(row.id)} className="tools">
          <span>{String(row.method)} <Badge value={String(row.status)} /></span>
          <button onClick={() => run(() => api(`/api/v1/platform/proofs/${String(row.id)}/review`, { method: 'POST', body: JSON.stringify({ status: 'APPROVED', reason: 'تم التحقق من الدفع' }) }).then(() => undefined), board.reload, setError)}>اعتماد</button>
          <button className="ghost" onClick={() => run(() => api(`/api/v1/platform/proofs/${String(row.id)}/review`, { method: 'POST', body: JSON.stringify({ status: 'REJECTED', reason: 'الإثبات غير واضح' }) }).then(() => undefined), board.reload, setError)}>رفض</button>
        </div>
      ))}
    </section>
  );
}

export function UsersPage() {
  const { lang } = usePlatformLang();
  const board = useLoad<Row[]>('/api/v1/platform/users');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', phone: '', displayName: '', password: '', roleCode: 'SUPPORT_ADMIN' });
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'مستخدمو المنصة', 'Platform users')}</h1>
        <p>{tx(lang, 'حسابات فريق المنصة، وليست حسابات الصيدليات. كلمة المرور ١٠ أحرف على الأقل.', 'These are platform staff accounts, separate from pharmacy sign-ins. The password needs at least 10 characters.')}</p>
      </div>
      <form className="panel" onSubmit={(event) => {
        event.preventDefault();
        void run(() => api('/api/v1/platform/users', { method: 'POST', body: JSON.stringify(form) }).then(() => undefined), board.reload, setError);
      }}>
        <div className="grid">
          <label className="field">{tx(lang, 'الاسم', 'Name')}<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></label>
          <label className="field">{tx(lang, 'البريد', 'Email')}<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label className="field">{tx(lang, 'الجوال', 'Mobile')}<input dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required minLength={6} /></label>
          <label className="field">{tx(lang, 'كلمة المرور', 'Password')}<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={10} /></label>
          <label className="field">{tx(lang, 'الدور', 'Role')}
            <select value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })}>
              {['SUPER_ADMIN', 'TENANT_APPROVAL_MANAGER', 'CATALOG_MANAGER', 'BILLING_MANAGER', 'SUPPORT_ADMIN', 'COMPLIANCE_AUDITOR'].map((code) => <option key={code}>{code}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">{tx(lang, 'إضافة مستخدم المنصة', 'Add a platform user')}</button>
      </form>
      {(board.data ?? []).map((row) => (
        <p key={String(row.id)}>{String(row.displayName)} — <Ltr value={String(row.phone ?? '')} /> — {String(row.email)} — {String(row.roleCode)} {row.isActive === false ? <Badge value="SUSPENDED" label={tx(lang, 'موقوف', 'Disabled')} /> : null}</p>
      ))}
    </section>
  );
}

export function AuditPage() {
  const board = useLoad<Row[]>('/api/v1/platform/audit');
  if (board.loading) return <p>جار التحميل…</p>;
  if (board.error) return <p className="error">{board.error}</p>;
  const rows = board.data ?? [];
  return (
    <section>
      <h1>سجل المنصة</h1>
      {rows.length === 0 ? <p>لا توجد أحداث.</p> : rows.map((row) => (
        <p key={String(row.id)}>{String(row.createdAt)} — {String(row.action)} — {String(row.reason)}</p>
      ))}
    </section>
  );
}

export function SettingsPage() {
  const { lang } = usePlatformLang();
  const board = useLoad<Row>('/api/v1/platform/settings');
  if (board.loading) return <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p>;
  if (board.error || !board.data) return <p className="error">{board.error || tx(lang, 'تعذر التحميل', 'Could not load')}</p>;
  return (
    <section>
      <div className="page-head">
        <h1>{tx(lang, 'إعدادات المنصة', 'Platform settings')}</h1>
        <p>{tx(lang, 'أسعار الاشتراك التي يراها الصيدلي عند طلب التسجيل.', 'The subscription prices a pharmacy sees when it asks to register.')}</p>
      </div>
      <PlanPriceSettings />
      <p className="hint">{tx(lang, 'التفعيل يتطلب اكتمال التحقق', 'Activation waits until verification is complete')}: {String(board.data.verificationRequired)}</p>
    </section>
  );
}
