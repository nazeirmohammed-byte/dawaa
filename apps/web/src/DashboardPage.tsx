import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, type Board, type BoardCard, type Profile } from './api';
import { HomeDash } from './HomeDash';
import { textOf, useUi } from './ui';

export function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(true);
  const [alertCount, setAlertCount] = useState(0);
  const [scopeKey, setScopeKey] = useState(localStorage.getItem('dawaa.branch') ?? '');

  useEffect(() => {
    api<Profile>('/api/v1/auth/me')
      .then(setProfile)
      .catch(() => navigate('/'));
    api<Board>('/api/v1/dashboard')
      .then((board) => setAlertCount(unseen(board.alerts).length))
      .catch(() => setAlertCount(0));
    const timer = window.setInterval(() => {
      api<{ status: string }>('/api/v1/health')
        .then((health) => setOnline(health.status !== 'error'))
        .catch(() => setOnline(false));
    }, 30000);
    api<{ status: string }>('/api/v1/health')
      .then((health) => setOnline(health.status !== 'error'))
      .catch(() => setOnline(false));
    return () => window.clearInterval(timer);
  }, [navigate]);

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
    (
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
        '/app/alerts': t('expiryAlerts'),
        '/app/receipt': t('receipt'),
        '/app/customers': t('customers'),
        '/app/prescriptions': t('prescriptions'),
        '/app/branches': t('branches'),
      } as Record<string, string>
    )[location.pathname] ?? t('control');
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

  const groups = [
    {
      id: 'sell',
      label: 'groupSell',
      items: [
        ['/app/pos', false, 'quickPos'],
        ['/app/sales', false, 'sales'],
        ['/app/customers', false, 'customers'],
        ['/app/prescriptions', false, 'prescriptions'],
        ['/app/receipt', false, 'receipt'],
      ],
    },
    {
      id: 'stock',
      label: 'groupStock',
      items: [
        ['/app/inventory', false, 'inventory'],
        ['/app/alerts', false, 'expiryAlerts'],
        ['/app/purchasing', false, 'procurement'],
        ['/app/purchasing?suppliers=1', false, 'suppliers'],
      ],
    },
    {
      id: 'money',
      label: 'groupMoney',
      items: [
        ['/app/prices', false, 'prices'],
        ['/app/finance', false, 'accounts'],
        ['/app/reports', false, 'reports'],
      ],
    },
    {
      id: 'setup',
      label: 'groupSetup',
      items: [
        ['/app/branches', false, 'branches'],
        ['/app/users', false, 'users'],
        ['/app/users?roles=1', false, 'permissions'],
        ['/app/settings', false, 'settings'],
      ],
    },
  ] as const;
  const herePath = `${location.pathname}${location.search}`;
  const currentGroup =
    groups.find((group) => group.items.some(([to, end]) => (end ? location.pathname === to : herePath === to)))?.id ?? 'sell';
  const [openGroup, setOpenGroup] = useState(currentGroup);
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
          <h1>{pageTitle}</h1>
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
          <button type="button" className="tool-btn" onClick={() => navigate('/app/alerts')} title={t('alerts')}>
            <svg className="tool-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 16.5h11l-1.2-1.6a3 3 0 0 1-.6-1.8V10a3.7 3.7 0 0 0-7.4 0v3.1c0 .7-.2 1.3-.6 1.8L6.5 16.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M10 16.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>{t('alerts')}</span>
            {alertCount > 0 ? <span className="count">{alertCount}</span> : null}
          </button>
          <div className="who" title={profile?.user.displayName}>
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
            {t('home')}
          </NavLink>
          <NavLink to="/app/pos">{t('quickPos')}</NavLink>
          <NavLink to="/app/receipt">{t('receipt')}</NavLink>
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

export function AlertsPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [alerts, setAlerts] = useState<BoardCard[]>([]);

  function reload() {
    api<Board>('/api/v1/dashboard')
      .then((board) => setAlerts(board.alerts))
      .catch(() => setAlerts([]));
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <section className="stack">
      <h2 style={{ margin: 0 }}>{t('alerts')}</h2>
      {alerts.length === 0 ? <p>{t('empty')}</p> : null}
      {alerts.map((card) => {
        const copy = textOf(card, ui.language);
        return (
          <article className={`signal ${card.severity}`} key={card.id}>
            <h3>{copy.title}</h3>
            <p>{copy.detail}</p>
            <b>{copy.figure}</b>
            <button
              className="brass"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => {
                markSeen(card.id);
                ui.push({ tone: card.severity === 'urgent' ? 'urgent' : 'watch', title: copy.title, body: copy.figure });
                reload();
              }}
            >
              {t('seen')}
            </button>
          </article>
        );
      })}
    </section>
  );
}
