import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  Cloud,
  FileSpreadsheet,
  History,
  Info,
  Package,
  Printer,
  Search,
  ShoppingCart,
  BadgeDollarSign,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, formatUserError } from './api';
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, StatusBadge } from './components/ds';
import { useUi } from './ui';

type Severity = 'critical' | 'high' | 'medium' | 'info';

type AlertItem = {
  id: string;
  category: string;
  severity: Severity;
  code: string;
  status: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  figureAr: string;
  figureEn: string;
  currentValue: string;
  thresholdValue: string;
  recommendedAr: string;
  recommendedEn: string;
  actionHref: string;
  estimate: boolean;
  exposure: string;
  branchNameAr: string;
  branchNameEn: string;
  assigneeId: string | null;
  assigneeName: string;
  openedAt: string;
  escalated: boolean;
  history: { at: string; kind: string; note: string }[];
};

type Center = {
  cards: { id: string; count: number; exposure: string }[];
  charts: {
    categories: { id: string; count: number }[];
    severities: { id: string; count: number }[];
    stock: { out: number; low: number; expiring: number; excess: number; negative: number };
    exposure: { expiry: string; pricing: string; payable: string; receivable: string };
    trend: { day: string; count: number }[];
    trendMode: 'history' | 'snapshot';
  };
  items: AlertItem[];
  historyCount: number;
  snoozedCount: number;
  staff: { id: string; name: string }[];
  prefs: { immediate: boolean; daily: boolean; weekly: boolean };
  canAssign: boolean;
};

const CARDS = ['critical', 'expiry', 'stock', 'fast', 'slow', 'excess', 'procurement', 'pricing', 'payments', 'profit', 'discrepancy'] as const;
const CATS = ['STOCK', 'EXPIRY', 'DEMAND', 'PROCUREMENT', 'PRICING', 'FINANCE', 'SAAS'] as const;

const cardKey: Record<string, string> = {
  critical: 'alertCritical',
  expiry: 'alertExpiryCard',
  stock: 'alertStockCard',
  fast: 'alertFastCard',
  slow: 'alertSlowCard',
  excess: 'alertExcessCard',
  procurement: 'alertBuyCard',
  pricing: 'alertPriceCard',
  payments: 'alertPayCard',
  profit: 'alertProfitCard',
  discrepancy: 'alertGapCard',
};

const catKey: Record<string, string> = {
  STOCK: 'alertCatStock',
  EXPIRY: 'alertCatExpiry',
  DEMAND: 'alertCatDemand',
  PROCUREMENT: 'alertCatProcurement',
  PRICING: 'alertCatPricing',
  FINANCE: 'alertCatFinance',
  SAAS: 'alertCatSaas',
};

const sevKey: Record<string, string> = {
  critical: 'sevCritical',
  high: 'sevHigh',
  medium: 'sevMedium',
  info: 'sevInfo',
};

const cardIcon: Record<string, LucideIcon> = {
  critical: AlertOctagon,
  expiry: CalendarClock,
  stock: Package,
  fast: TrendingUp,
  slow: TrendingUp,
  excess: Package,
  procurement: ShoppingCart,
  pricing: BadgeDollarSign,
  payments: Wallet,
  profit: BadgeDollarSign,
  discrepancy: AlertCircle,
};

const catIcon: Record<string, LucideIcon> = {
  STOCK: Package,
  EXPIRY: CalendarClock,
  DEMAND: TrendingUp,
  PROCUREMENT: ShoppingCart,
  PRICING: BadgeDollarSign,
  FINANCE: Wallet,
  SAAS: Cloud,
};

function severityTone(severity: Severity): 'danger' | 'warning' | 'info' | 'neutral' {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  if (severity === 'info') return 'info';
  return 'neutral';
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const props = { size: 16, strokeWidth: 2.25, 'aria-hidden': true as const };
  if (severity === 'critical') return <AlertOctagon {...props} />;
  if (severity === 'high') return <AlertTriangle {...props} />;
  if (severity === 'medium') return <AlertCircle {...props} />;
  return <Info {...props} />;
}

export function AlertsPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const arabic = ui.language.startsWith('ar');
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Center | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [assignee, setAssignee] = useState('');
  const [snoozeDays, setSnoozeDays] = useState('1');
  const [prefs, setPrefs] = useState({ immediate: true, daily: true, weekly: false });
  const [actionError, setActionError] = useState('');
  const [prefsOpen, setPrefsOpen] = useState(false);
  const card = params.get('card') ?? '';
  const status = params.get('status') === 'history' || params.get('status') === 'snoozed' ? params.get('status')! : 'active';
  const severity = params.get('severity') ?? 'all';
  const sort = params.get('sort') === 'newest' || params.get('sort') === 'oldest' ? params.get('sort')! : 'severity';
  const q = params.get('q') ?? '';

  function load(next = params) {
    const query = new URLSearchParams();
    const category = next.get('card');
    const nextStatus = next.get('status');
    const nextSeverity = next.get('severity');
    const nextSort = next.get('sort');
    const nextQ = next.get('q');
    if (category) query.set('category', category);
    if (nextStatus) query.set('status', nextStatus);
    if (nextSeverity) query.set('severity', nextSeverity);
    if (nextSort) query.set('sort', nextSort);
    if (nextQ) query.set('q', nextQ);
    api<Center>(`/api/v1/alerts?${query}`)
      .then((body) => {
        setData(body);
        setPrefs(body.prefs);
        setError('');
        const openId = next.get('id');
        if (openId) setSelected(body.items.find((item) => item.id === openId) ?? null);
      })
      .catch((caught: unknown) => setError(formatUserError(caught, t('apiError'))));
  }

  useEffect(() => {
    load(params);
    // Reload when the branch scope or the filter query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString(), localStorage.getItem('dawaa.branch')]);

  function setFilter(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  }

  const maxTrend = Math.max(1, ...(data?.charts.trend.map((row) => row.count) ?? [1]));
  const maxCat = Math.max(1, ...(data?.charts.categories.map((row) => row.count) ?? [1]));
  const stockBars = useMemo(() => {
    if (!data) return [];
    return [
      [t('alertStockCard'), data.charts.stock.out + data.charts.stock.low],
      [t('alertExpiryCard'), data.charts.stock.expiring],
      [t('alertExcessCard'), data.charts.stock.excess],
      [t('alertGapCard'), data.charts.stock.negative],
    ] as const;
  }, [data, t]);

  const summary = useMemo(() => {
    if (!data) return { critical: 0, high: 0, total: 0, exposure: '0.00' };
    const critical = data.cards.find((row) => row.id === 'critical')?.count ?? 0;
    const high = data.charts.severities.find((row) => row.id === 'high')?.count ?? 0;
    const total = data.charts.severities.reduce((sum, row) => sum + row.count, 0);
    const exposure = data.cards.find((row) => row.id === 'critical')?.exposure ?? '0.00';
    return { critical, high, total, exposure };
  }, [data]);

  async function act(type: 'ack' | 'snooze' | 'resolve' | 'assign', extra: { days?: number; assigneeId?: string | null } = {}) {
    if (!selected) return;
    setActionError('');
    try {
      await api(`/api/v1/alerts/${selected.id}`, { method: 'POST', body: JSON.stringify({ type, ...extra }) });
      setSelected(null);
      load(params);
    } catch (caught: unknown) {
      setActionError(formatUserError(caught, t('apiError')));
    }
  }

  function printPdf() {
    if (!data) return;
    const popup = window.open('', 'alerts-print', 'width=900,height=700');
    if (!popup) return;
    const rows = data.items
      .map((item) => `<tr><td>${item.severity}</td><td>${arabic ? item.titleAr : item.titleEn}</td><td>${arabic ? item.detailAr : item.detailEn}</td><td>${item.currentValue}</td><td>${item.openedAt.slice(0, 10)}</td></tr>`)
      .join('');
    popup.document.write(`<!doctype html><html dir="${arabic ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${t('alerts')}</title>
      <style>body{font-family:sans-serif} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ccc;padding:6px;text-align:start}</style>
      </head><body><h1>${t('alerts')}</h1><table><thead><tr><th>${t('alertSeverity')}</th><th>${t('drug')}</th><th>${t('alertRecommended')}</th><th>${t('alertCurrent')}</th><th>${t('state')}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function excel() {
    const query = new URLSearchParams();
    if (card) query.set('category', card);
    if (status !== 'active') query.set('status', status);
    if (severity !== 'all') query.set('severity', severity);
    if (sort !== 'severity') query.set('sort', sort);
    if (q) query.set('q', q);
    window.location.assign(`/api/v1/alerts/export.xlsx?${query}`);
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => load(params)} />;
  }
  if (!data) {
    return (
      <section className="alerts-center">
        <PageHeader title={t('alerts')} hint={t('hintAlerts')} />
        <LoadingSkeleton lines={6} />
      </section>
    );
  }

  const text = (item: AlertItem) =>
    arabic
      ? { title: item.titleAr, detail: item.detailAr, figure: item.figureAr, action: item.recommendedAr, branch: item.branchNameAr }
      : { title: item.titleEn, detail: item.detailEn, figure: item.figureEn, action: item.recommendedEn, branch: item.branchNameEn };

  return (
    <section className="alerts-center">
      <PageHeader
        title={t('alerts')}
        hint={t('hintAlerts')}
        actions={
          <div className="alerts-header-actions">
            <button type="button" className="ghost" onClick={printPdf}>
              <Printer size={16} aria-hidden />
              {t('exportPdf')}
            </button>
            <button type="button" className="ghost" onClick={excel}>
              <FileSpreadsheet size={16} aria-hidden />
              {t('exportExcel')}
            </button>
            <button type="button" className="ghost" onClick={() => setPrefsOpen((open) => !open)}>
              <Bell size={16} aria-hidden />
              {t('alertPrefs')}
            </button>
          </div>
        }
      />

      <div className="alerts-summary">
        <article className="alerts-summary-card tone-danger">
          <span>{t('sevCritical')}</span>
          <strong>{summary.critical}</strong>
          <small>{summary.exposure !== '0.00' ? summary.exposure : '—'}</small>
        </article>
        <article className="alerts-summary-card tone-warn">
          <span>{t('sevHigh')}</span>
          <strong>{summary.high}</strong>
          <small>{t('alertActive')}</small>
        </article>
        <article className="alerts-summary-card tone-info">
          <span>{t('alertActive')}</span>
          <strong>{status === 'active' ? data.items.length : summary.total}</strong>
          <small>{t('alertAll')}</small>
        </article>
        <article className="alerts-summary-card">
          <span>{t('alertSnoozed')}</span>
          <strong>{data.snoozedCount}</strong>
          <small>{t('alertHistory')}: {data.historyCount}</small>
        </article>
      </div>

      <div className="alerts-metric-grid" role="list">
        {CARDS.map((id) => {
          const row = data.cards.find((cardRow) => cardRow.id === id);
          const Icon = cardIcon[id] ?? AlertCircle;
          const active = card === id;
          return (
            <button
              key={id}
              type="button"
              role="listitem"
              className={`alerts-metric${active ? ' on' : ''}${id === 'critical' ? ' critical' : ''}`}
              onClick={() => setFilter({ card: active ? '' : id, status: 'active' })}
            >
              <span className="alerts-metric-icon" aria-hidden>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <span className="alerts-metric-body">
                <em>{t(cardKey[id] ?? id)}</em>
                <strong>{row?.count ?? 0}</strong>
              </span>
              {row && row.exposure !== '0.00' ? <small>{row.exposure}</small> : <small aria-hidden>&nbsp;</small>}
            </button>
          );
        })}
      </div>

      <div className="alerts-insights">
        <article className="alerts-panel">
          <header>
            <h2>{t('alertTrend')}</h2>
            <p>{data.charts.trendMode === 'snapshot' ? t('alertSnapshot') : t('alertTrend')}</p>
          </header>
          <div className="alerts-bars" aria-hidden>
            {data.charts.trend.map((row) => (
              <span key={row.day} title={`${row.day}: ${row.count}`}>
                <i style={{ height: `${Math.max(8, (row.count / maxTrend) * 100)}%` }} />
              </span>
            ))}
          </div>
        </article>
        <article className="alerts-panel">
          <header>
            <h2>{t('alertCategories')}</h2>
          </header>
          <div className="alerts-cat-bars">
            {data.charts.categories.map((row) => {
              const Icon = catIcon[row.id] ?? AlertCircle;
              return (
                <div key={row.id} className="alerts-cat-row">
                  <span className="alerts-cat-label">
                    <Icon size={14} aria-hidden />
                    {t(catKey[row.id] ?? row.id)}
                  </span>
                  <span className="alerts-cat-track">
                    <i style={{ width: `${Math.max(6, (row.count / maxCat) * 100)}%` }} />
                  </span>
                  <b>{row.count}</b>
                </div>
              );
            })}
          </div>
        </article>
        <article className="alerts-panel">
          <header>
            <h2>{t('stockPicture')}</h2>
          </header>
          <ul className="alerts-risk-list">
            {stockBars.map(([label, count]) => (
              <li key={label}>
                <span>{label}</span>
                <b>{count}</b>
              </li>
            ))}
          </ul>
          <p className="alerts-exposure-line">
            {t('alertExposure')}: {data.charts.exposure.expiry} / {data.charts.exposure.payable} / {data.charts.exposure.receivable}
          </p>
        </article>
      </div>

      <div className="alerts-toolbar">
        <div className="alerts-status-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={status === 'active'} className={status === 'active' ? 'on' : ''} onClick={() => setFilter({ status: '' })}>
            <Bell size={15} aria-hidden />
            {t('alertActive')}
          </button>
          <button type="button" role="tab" aria-selected={status === 'snoozed'} className={status === 'snoozed' ? 'on' : ''} onClick={() => setFilter({ status: 'snoozed' })}>
            <BellOff size={15} aria-hidden />
            {t('alertSnoozed')}
            <em>{data.snoozedCount}</em>
          </button>
          <button type="button" role="tab" aria-selected={status === 'history'} className={status === 'history' ? 'on' : ''} onClick={() => setFilter({ status: 'history' })}>
            <History size={15} aria-hidden />
            {t('alertHistory')}
            <em>{data.historyCount}</em>
          </button>
        </div>

        <div className="alerts-cat-chips">
          <button type="button" className={!card ? 'on' : ''} onClick={() => setFilter({ card: '' })}>
            {t('alertAll')}
          </button>
          {CATS.map((id) => {
            const Icon = catIcon[id] ?? AlertCircle;
            return (
              <button key={id} type="button" className={card === id ? 'on' : ''} onClick={() => setFilter({ card: id })}>
                <Icon size={14} aria-hidden />
                {t(catKey[id] ?? id)}
              </button>
            );
          })}
        </div>

        <div className="alerts-filters">
          <label className="alerts-search">
            <Search size={16} aria-hidden />
            <input
              value={q}
              onChange={(event) => setFilter({ q: event.target.value })}
              placeholder={t('alertSearch')}
              aria-label={t('alertSearch')}
            />
          </label>
          <label className="field fit">
            <span>{t('alertSeverity')}</span>
            <select value={severity} onChange={(event) => setFilter({ severity: event.target.value === 'all' ? '' : event.target.value })}>
              <option value="all">{t('alertAll')}</option>
              {(['critical', 'high', 'medium', 'info'] as const).map((id) => (
                <option key={id} value={id}>{t(sevKey[id] ?? id)}</option>
              ))}
            </select>
          </label>
          <label className="field fit">
            <span>{t('alertSort')}</span>
            <select value={sort} onChange={(event) => setFilter({ sort: event.target.value === 'severity' ? '' : event.target.value })}>
              <option value="severity">{t('alertSeverity')}</option>
              <option value="newest">{t('alertNewest')}</option>
              <option value="oldest">{t('alertOldest')}</option>
            </select>
          </label>
        </div>
      </div>

      {prefsOpen ? (
        <form
          className="alerts-prefs"
          onSubmit={(event) => {
            event.preventDefault();
            void api('/api/v1/alerts/preferences', { method: 'PUT', body: JSON.stringify(prefs) }).then(() => {
              setPrefsOpen(false);
              load(params);
            });
          }}
        >
          <h2>{t('alertPrefs')}</h2>
          <div className="alerts-prefs-grid">
            <label className="checkline"><input type="checkbox" checked={prefs.immediate} onChange={(event) => setPrefs({ ...prefs, immediate: event.target.checked })} />{t('alertImmediate')}</label>
            <label className="checkline"><input type="checkbox" checked={prefs.daily} onChange={(event) => setPrefs({ ...prefs, daily: event.target.checked })} />{t('alertDaily')}</label>
            <label className="checkline"><input type="checkbox" checked={prefs.weekly} onChange={(event) => setPrefs({ ...prefs, weekly: event.target.checked })} />{t('alertWeekly')}</label>
          </div>
          <button className="primary fit" type="submit">{t('save')}</button>
        </form>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState title={t('alertEmpty')} body={t('hintAlerts')} />
      ) : (
        <div className="alerts-list">
          {data.items.map((item) => {
            const copy = text(item);
            const CatIcon = catIcon[item.category] ?? AlertCircle;
            return (
              <article key={item.id} className={`alerts-item sev-${item.severity}`}>
                <button
                  type="button"
                  className="alerts-item-open"
                  onClick={() => {
                    setSelected(item);
                    setAssignee(item.assigneeId ?? '');
                    setActionError('');
                  }}
                >
                  <div className="alerts-item-rail" aria-hidden>
                    <SeverityIcon severity={item.severity} />
                  </div>
                  <div className="alerts-item-main">
                    <div className="alerts-item-top">
                      <StatusBadge tone={severityTone(item.severity)}>{t(sevKey[item.severity] ?? item.severity)}</StatusBadge>
                      <span className="alerts-item-cat">
                        <CatIcon size={13} aria-hidden />
                        {t(catKey[item.category] ?? item.category)}
                      </span>
                      {item.escalated ? <StatusBadge tone="danger">!</StatusBadge> : null}
                      {item.estimate ? <span className="alerts-item-flag">{t('alertEstimate')}</span> : null}
                    </div>
                    <h3>{copy.title}</h3>
                    <p>{copy.detail}</p>
                    <div className="alerts-item-meta">
                      {copy.figure ? <strong>{copy.figure}</strong> : null}
                      {copy.branch ? <span>{copy.branch}</span> : null}
                      <span>{item.openedAt.slice(0, 16).replace('T', ' ')}</span>
                      {item.assigneeName ? <span>{item.assigneeName}</span> : null}
                    </div>
                  </div>
                  <span className="alerts-item-chevron" aria-hidden />
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="alerts-drawer-back" onClick={() => setSelected(null)}>
          <aside className="alerts-drawer" role="dialog" aria-modal="true" aria-labelledby="alert-drawer-title" onClick={(event) => event.stopPropagation()}>
            <header className="alerts-drawer-head">
              <div>
                <StatusBadge tone={severityTone(selected.severity)}>{t(sevKey[selected.severity] ?? selected.severity)}</StatusBadge>
                <h2 id="alert-drawer-title">{text(selected).title}</h2>
              </div>
              <button type="button" className="ghost icon-btn" onClick={() => setSelected(null)} aria-label={t('close')}>
                <X size={18} />
              </button>
            </header>
            {actionError ? <p className="error">{actionError}</p> : null}
            <p className="alerts-drawer-detail">{text(selected).detail}</p>
            {text(selected).figure ? <p className="alerts-drawer-figure">{text(selected).figure}</p> : null}

            <dl className="alerts-facts">
              <div><dt>{t('alertCurrent')}</dt><dd>{selected.currentValue || '—'}</dd></div>
              <div><dt>{t('alertThreshold')}</dt><dd>{selected.thresholdValue || '—'}</dd></div>
              <div><dt>{t('alertExposure')}</dt><dd>{selected.exposure || '—'}</dd></div>
              <div className="wide"><dt>{t('alertRecommended')}</dt><dd>{text(selected).action || '—'}</dd></div>
              {selected.assigneeName ? <div className="wide"><dt>{t('alertAssign')}</dt><dd>{selected.assigneeName}</dd></div> : null}
            </dl>

            <p className="alerts-drawer-link">
              <Link to={selected.actionHref}>{t('alertOpen')}</Link>
            </p>

            <div className="alerts-drawer-actions">
              {selected.status === 'OPEN' ? (
                <button type="button" className="ghost" onClick={() => void act('ack')}>{t('alertAck')}</button>
              ) : null}
              {selected.severity !== 'critical' ? (
                <div className="alerts-snooze">
                  <select value={snoozeDays} onChange={(event) => setSnoozeDays(event.target.value)} aria-label={t('alertSnooze')}>
                    <option value="1">1</option>
                    {selected.severity === 'high' ? null : [2, 3, 7].map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  <button type="button" className="ghost" onClick={() => void act('snooze', { days: Number(snoozeDays) })}>{t('alertSnooze')}</button>
                </div>
              ) : null}
              <button type="button" className="primary" onClick={() => void act('resolve')}>{t('alertResolve')}</button>
            </div>

            {data.canAssign ? (
              <form
                className="alerts-assign"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act('assign', { assigneeId: assignee || null });
                }}
              >
                <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                  <option value="">{t('alertAssign')}</option>
                  {data.staff.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
                <button type="submit">{t('save')}</button>
              </form>
            ) : null}

            <h3>{t('alertHistory')}</h3>
            {selected.history.length === 0 ? (
              <p className="lede">{t('alertEmpty')}</p>
            ) : (
              <ul className="alerts-history">
                {selected.history.map((entry) => (
                  <li key={`${entry.at}-${entry.kind}`}>
                    <span>{entry.kind}</span>
                    <time>{entry.at.slice(0, 16).replace('T', ' ')}</time>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
