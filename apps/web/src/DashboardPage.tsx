import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, type BoardCard, type Profile } from './api';
import { HelpTip } from '../../admin/src/hint';
import { HomeDash } from './HomeDash';
import { useUi } from './ui';

export function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(true);
  const [alertCount, setAlertCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellItems, setBellItems] = useState<{ id: string; severity: string; titleAr: string; titleEn: string }[]>([]);
  const [scopeKey, setScopeKey] = useState(localStorage.getItem('dawaa.branch') ?? '');

  useEffect(() => {
    api<Profile>('/api/v1/auth/me')
      .then(setProfile)
      .catch(() => navigate('/'));
    const loadBell = () => {
      api<{ unread: number; items: { id: string; severity: string; titleAr: string; titleEn: string }[] }>('/api/v1/alerts?view=bell')
        .then((bell) => {
          setAlertCount(bell.unread);
          setBellItems(bell.items);
        })
        .catch(() => setAlertCount(0));
    };
    loadBell();
    const bellTimer = window.setInterval(loadBell, 60000);
    const timer = window.setInterval(() => {
      api<{ status: string }>('/api/v1/health')
        .then((health) => setOnline(health.status !== 'error'))
        .catch(() => setOnline(false));
    }, 30000);
    api<{ status: string }>('/api/v1/health')
      .then((health) => setOnline(health.status !== 'error'))
      .catch(() => setOnline(false));
    return () => {
      window.clearInterval(timer);
      window.clearInterval(bellTimer);
    };
  }, [navigate, scopeKey]);

  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    localStorage.removeItem('dawaa.impersonating');
    navigate('/');
  }

  const name = ui.language.startsWith('ar')
    ? profile?.tenant.tradeNameAr
    : profile?.tenant.tradeNameEn || profile?.tenant.tradeNameAr;
  const roleName = ui.language.startsWith('ar') ? profile?.role?.nameAr : profile?.role?.nameEn || profile?.role?.nameAr;
  const pageTitle =
    location.pathname === '/app/users' && location.search.includes('roles=1')
      ? t('permissions')
      : location.pathname === '/app/purchasing' && location.search.includes('suppliers=1')
        ? t('suppliers')
      : (
      {
        '/app': t('control'),
        '/app/pos': t('quickPos'),
        '/app/sales': t('sales'),
        '/app/inventory': t('inventory'),
        '/app/purchasing': t('procurement'),
        '/app/finance': t('accounts'),
        '/app/reports': t('reports'),
        '/app/users': t('users'),
        '/app/settings': t('settings'),
        '/app/prices': t('prices'),
        '/app/alerts': t('alerts'),
        '/app/receipt': t('receipt'),
        '/app/customers': t('customers'),
        '/app/prescriptions': t('prescriptions'),
        '/app/branches': t('branches'),
      } as Record<string, string>
    )[location.pathname] ?? t('control');
  const pageHint =
    (
      {
        '/app': t('hintHome'),
        '/app/pos': t('hintPos'),
        '/app/sales': t('hintSales'),
        '/app/inventory': t('hintInventory'),
        '/app/purchasing': location.search.includes('suppliers=1') ? t('hintSuppliers') : t('hintPurchasing'),
        '/app/finance': t('hintFinance'),
        '/app/reports': t('hintReports'),
        '/app/users': location.search.includes('roles=1') ? t('hintRoles') : t('hintUsers'),
        '/app/settings': t('hintSettings'),
        '/app/prices': t('hintPrices'),
        '/app/alerts': t('hintAlerts'),
        '/app/customers': t('hintCustomers'),
        '/app/prescriptions': t('hintPrescriptions'),
        '/app/branches': t('hintBranches'),
      } as Record<string, string>
    )[location.pathname] ?? '';
  const selectedBranch = scopeKey || profile?.branch?.id || '';
  const selected = profile?.network.branches.find((branch) => branch.id === selectedBranch);
  const branchName =
    selectedBranch === 'all'
      ? t('allBranches')
      : ui.language.startsWith('ar')
        ? selected?.nameAr || profile?.branch?.nameAr
        : selected?.nameEn || selected?.nameAr || profile?.branch?.nameEn || profile?.branch?.nameAr;

  function chooseBranch(value: string) {
    localStorage.setItem('dawaa.branch', value);
    setScopeKey(value);
  }

  const perms = profile?.permissions ?? [];
  const canAlerts = ['stock.count', 'purchasing.receive', 'accounting.view', 'reports.view', 'users.manage'].some((code) => perms.includes(code));
  const allow = (need: string) => need === 'alerts.any' ? perms.length === 0 || canAlerts : perms.length === 0 || perms.includes(need);
  type NavItem = [string, boolean, string, string];
  const groups = ([
    {
      id: 'sell',
      label: 'groupSell',
      items: [
        ['/app/pos', false, 'quickPos', 'pos.sell'],
        ['/app/sales', false, 'sales', 'pos.sell'],
      ],
    },
    {
      id: 'stock',
      label: 'groupStock',
      items: [
        ['/app/inventory', false, 'medicines', 'stock.count'],
        ['/app/alerts', false, 'alerts', 'alerts.any'],
        ['/app/prices', false, 'prices', 'dashboard.view'],
      ],
    },
    {
      id: 'buy',
      label: 'groupBuy',
      items: [
        ['/app/purchasing', false, 'procurement', 'purchasing.receive'],
        ['/app/purchasing?suppliers=1', false, 'suppliers', 'purchasing.receive'],
      ],
    },
    {
      id: 'people',
      label: 'groupPeople',
      items: [
        ['/app/customers', false, 'customers', 'pos.sell'],
        ['/app/prescriptions', false, 'prescriptions', 'controlled.dispense'],
      ],
    },
    {
      id: 'money',
      label: 'groupMoney',
      items: [
        ['/app/finance', false, 'accounts', 'accounting.view'],
        ['/app/reports', false, 'reports', 'reports.view'],
      ],
    },
    {
      id: 'setup',
      label: 'groupSetup',
      items: [
        ['/app/branches', false, 'branches', 'users.manage'],
        ['/app/users', false, 'users', 'users.manage'],
        ['/app/users?roles=1', false, 'permissions', 'users.manage'],
        ['/app/settings', false, 'settings', 'dashboard.view'],
      ],
    },
  ] as { id: string; label: string; items: NavItem[] }[]).map((group) => ({ ...group, items: group.items.filter((item) => allow(item[3])) })).filter((group) => group.items.length > 0);
  const herePath = `${location.pathname}${location.search}`;
  const currentGroup =
    groups.find((group) => group.items.some(([to, end]) => (end ? location.pathname === to : herePath === to)))?.id ?? 'sell';
  const [openGroup, setOpenGroup] = useState<string>(currentGroup);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    setOpenGroup(currentGroup);
  }, [currentGroup]);

  return (
    <div className="app">
      <aside className="side">
        <Link to="/app" className="logo side-logo">
          <span className="logo-mark plus-mark">+</span>
          <span>
            <strong>{name || t('product')}</strong>
            <span className="tagline">{t('tagline')}</span>
          </span>
        </Link>
        <nav className="modnav">
          <Link to="/app" title={t('control')} aria-current={location.pathname === '/app' ? 'page' : undefined} className={location.pathname === '/app' ? 'active' : undefined}>
            <span className="nav-label">{t('control')}</span>
          </Link>
          {groups.map((group) => (
            <div className={`nav-group ${group.id}`} key={group.id}>
              <button type="button" aria-expanded={openGroup === group.id} onClick={() => setOpenGroup(openGroup === group.id ? '' : group.id)}>
                <span className="nav-swatch" aria-hidden="true" />
                <span className="nav-label">{t(group.label)}</span>
                <span className={`nav-caret${openGroup === group.id ? ' open' : ''}`} aria-hidden="true" />
              </button>
              {openGroup === group.id
                ? group.items.map(([to, end, key]) => {
                    const here = end ? location.pathname === to : herePath === to;
                    return (
                      <Link
                        key={`${to}-${key}`}
                        to={to}
                        title={t(key)}
                        aria-label={ui.side === 'icons' ? t(key) : undefined}
                        aria-current={here ? 'page' : undefined}
                        className={here ? 'active' : undefined}
                      >
                        <span className="nav-label">{t(key)}</span>
                      </Link>
                    );
                  })
                : null}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <Link to="/app/settings">{t('support')}</Link>
          <button type="button" onClick={logout}>
            {t('logout')}
          </button>
          <button type="button" className="side-toggle" onClick={ui.toggleSide}>
            {ui.side === 'icons' ? t('expand') : t('collapse')}
          </button>
        </div>
      </aside>
      <div className="workspace">
      {localStorage.getItem('dawaa.impersonating') === '1' ? (
        <p className="panel">دخول بالنيابة عن هذه الصيدلية. أنهِ الجلسة بالخروج.</p>
      ) : null}
      <header className="topbar">
        <div className="top-title">
          <h1>
            {pageTitle}
            {pageHint ? <HelpTip text={pageHint} /> : null}
          </h1>
          <p>{t('welcomeLine', { name: profile?.user.displayName ?? '' })}</p>
          {profile && profile.network.branches.length > 0 ? (
            <select className="branch-switch" value={selectedBranch} onChange={(event) => chooseBranch(event.target.value)}>
              {profile.network.canViewAll ? <option value="all">{t('allBranches')}</option> : null}
              {profile.network.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {ui.language.startsWith('ar') ? branch.nameAr : branch.nameEn || branch.nameAr}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <form
          className="top-search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(`/app/inventory?q=${encodeURIComponent(query)}`);
          }}
        >
          <input value={query} placeholder={t('searchPh')} onChange={(event) => setQuery(event.target.value)} />
        </form>
        <div className="top-actions">
          <span className="tool-btn" title={t('country')}>
            <svg className="tool-ico" viewBox="0 0 24 16" aria-hidden="true">
              <rect width="24" height="16" fill="#000" />
              <rect width="24" height="5.34" fill="#D21034" />
              <rect y="5.33" width="24" height="5.34" fill="#fff" />
              <polygon points="0,0 9,8 0,16" fill="#007229" />
            </svg>
            <span>{t('country')}</span>
          </span>
          <button
            type="button"
            className={ui.touch ? 'tool-btn on' : 'tool-btn'}
            title={ui.touch ? t('touchOff') : t('touchOn')}
            onClick={() => {
              ui.toggleTouch();
              ui.push({
                tone: 'info',
                title: ui.touch ? t('deskTitle') : t('touchTitle'),
                body: ui.touch ? t('deskBody') : t('touchBody'),
              });
            }}
          >
            <svg className="tool-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M12 10.5V4.2a1.5 1.5 0 0 1 3 0V12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M15 11.2V6.4a1.5 1.5 0 0 1 3 0V14c0 4-2.2 6.5-6.2 6.5-3.2 0-5.3-1.6-6.4-3.6L4 14.2a1.6 1.6 0 0 1 2.6-1.8L9 14.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{ui.touch ? t('touchOff') : t('touchOn')}</span>
          </button>
          <button type="button" className="tool-btn" onClick={ui.toggleLanguage} title={t('language')}>
            <svg className="tool-ico" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3.8 12h16.4M12 3.8c2.2 2.4 3.4 5.2 3.4 8.2s-1.2 5.8-3.4 8.2c-2.2-2.4-3.4-5.2-3.4-8.2s1.2-5.8 3.4-8.2z" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span>{t('language')}</span>
          </button>
          <button type="button" className="tool-btn" onClick={() => navigate('/app/settings')} title={t('settings')}>
            <svg className="tool-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="9" cy="7" r="2.1" fill="var(--paper)" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="15" cy="12" r="2.1" fill="var(--paper)" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="8" cy="17" r="2.1" fill="var(--paper)" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span>{t('settings')}</span>
          </button>
          <div className="user-menu">
          <button type="button" className="tool-btn" onClick={() => setBellOpen((open) => !open)} title={t('alerts')}>
            <svg className="tool-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 16.5h11l-1.2-1.6a3 3 0 0 1-.6-1.8V10a3.7 3.7 0 0 0-7.4 0v3.1c0 .7-.2 1.3-.6 1.8L6.5 16.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M10 16.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>{t('alerts')}</span>
            {alertCount > 0 ? <span className="count">{alertCount}</span> : null}
          </button>
          {bellOpen ? (
            <div className="user-pop bell-pop">
              {bellItems.length === 0 ? <span>{t('alertEmpty')}</span> : bellItems.slice(0, 6).map((item) => (
                <Link key={item.id} to={`/app/alerts?id=${item.id}`} onClick={() => setBellOpen(false)}>
                  {ui.language.startsWith('ar') ? item.titleAr : item.titleEn}
                </Link>
              ))}
              <Link to="/app/alerts" onClick={() => setBellOpen(false)}>{t('viewAll')}</Link>
            </div>
          ) : null}
          </div>
          <div className="user-menu">
            <button type="button" className="who" title={profile?.user.displayName} onClick={() => setAccountOpen((open) => !open)}>
              <span className="avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <circle cx="12" cy="8" r="3.2" fill="currentColor" />
                  <path d="M5.5 19.2c1.2-3 3.5-4.4 6.5-4.4s5.3 1.4 6.5 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span>
                <strong>{profile?.user.displayName}</strong>
                <span>{roleName || branchName}</span>
              </span>
            </button>
            {accountOpen ? (
              <div className="user-pop">
                <strong>{profile?.user.displayName}</strong>
                <span>{roleName}</span>
                <span>{name}</span>
                <span>{branchName}</span>
                <Link to="/app/account" onClick={() => setAccountOpen(false)}>{t('myAccount')}</Link>
                <Link to="/app/settings" onClick={() => setAccountOpen(false)}>{t('accountDetails')}</Link>
                <Link to="/app/account#password" onClick={() => setAccountOpen(false)}>{t('changePassword')}</Link>
                {(profile?.permissions ?? []).includes('users.manage') ? (
                  <Link to="/app/settings" onClick={() => setAccountOpen(false)}>{t('subscription')}</Link>
                ) : null}
                <button type="button" onClick={logout}>{t('logout')}</button>
              </div>
            ) : null}
          </div>
          <span className={online ? 'chip' : 'chip warn'} title={online ? t('online') : t('offline')}>
            <i className="status-dot" />
            {online ? t('online') : t('offline')}
          </span>
        </div>
      </header>
      <div className="stage">
        <div key={scopeKey}>{children}</div>
      </div>
      </div>
      {ui.touch ? (
        <nav className="thumb">
          <NavLink to="/app" end>
            {t('control')}
          </NavLink>
          <NavLink to="/app/pos">{t('quickPos')}</NavLink>
          <NavLink to="/app/sales">{t('sales')}</NavLink>
        </nav>
      ) : null}
    </div>
  );
}

export function unseen(alerts: BoardCard[]): BoardCard[] {
  const seen = new Set(JSON.parse(localStorage.getItem('dawaa.seen') ?? '[]') as string[]);
  return alerts.filter((alert) => !seen.has(alert.id));
}

export function markSeen(id: string): void {
  const seen = new Set(JSON.parse(localStorage.getItem('dawaa.seen') ?? '[]') as string[]);
  seen.add(id);
  localStorage.setItem('dawaa.seen', JSON.stringify([...seen]));
}

export function DashboardPage() {
  return <HomeDash />;
}

export function AccountPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<Profile>('/api/v1/auth/me').then(setProfile).catch(() => setProfile(null));
  }, []);
  return (
    <section className="stack">
      <h2 style={{ margin: 0 }}>{t('myAccount')}</h2>
      <article className="panel-card">
        <p><b>{profile?.user.displayName}</b></p>
        <p>{profile?.role?.nameAr} / {profile?.role?.nameEn}</p>
        <p>{profile?.tenant.tradeNameAr}</p>
        <p dir="ltr">{profile?.user.phone} · {profile?.tenant.accountCode}</p>
      </article>
      <form
        id="password"
        className="panel-card"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          setMessage('');
          api('/api/v1/auth/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, nextPassword }),
          })
            .then(() => setMessage(t('save')))
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('empty')));
        }}
      >
        <h3>{t('changePassword')}</h3>
        <label className="field">{t('currentPassword')}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label className="field">{t('nextPassword')}<input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} /></label>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p>{message}</p> : null}
        <button className="primary" type="submit">{t('save')}</button>
      </form>
    </section>
  );
}

export { AlertsPage } from './AlertsCenter';
