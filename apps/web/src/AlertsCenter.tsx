import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatUserError } from './api';
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

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="lede">{t('working')}</p>;
  const text = (item: AlertItem) => (arabic ? { title: item.titleAr, detail: item.detailAr, figure: item.figureAr, action: item.recommendedAr, branch: item.branchNameAr } : { title: item.titleEn, detail: item.detailEn, figure: item.figureEn, action: item.recommendedEn, branch: item.branchNameEn });

  return (
    <section className="stack alerts-center">
      <div className="alert-cards">
        {CARDS.map((id) => {
          const row = data.cards.find((cardRow) => cardRow.id === id);
          return (
            <button key={id} type="button" className={`kpi-card ${card === id ? 'on' : ''} ${id === 'critical' ? 'bad' : ''}`} onClick={() => setFilter({ card: card === id ? '' : id, status: 'active' })}>
              <em>{t(cardKey[id] ?? id)}</em>
              <strong>{row?.count ?? 0}</strong>
              <small>{row && row.exposure !== '0.00' ? row.exposure : ''}</small>
            </button>
          );
        })}
      </div>
      <div className="alert-charts">
        <article className="panel-card">
          <h2>{t('alertTrend')}</h2>
          <p className="lede">{data.charts.trendMode === 'snapshot' ? t('alertSnapshot') : t('alertTrend')}</p>
          <div className="bars">
            {data.charts.trend.map((row) => (
              <span key={row.day} title={`${row.day}: ${row.count}`}>
                <i style={{ height: `${Math.max(4, (row.count / maxTrend) * 100)}%` }} />
              </span>
            ))}
          </div>
        </article>
        <article className="panel-card">
          <h2>{t('alertCategories')}</h2>
          <div className="bars cats">
            {data.charts.categories.map((row) => (
              <span key={row.id} title={t(catKey[row.id] ?? row.id)}>
                <i style={{ height: `${Math.max(4, (row.count / maxCat) * 100)}%` }} />
                <small>{row.count}</small>
              </span>
            ))}
          </div>
        </article>
        <article className="panel-card">
          <h2>{t('stockPicture')}</h2>
          <ul className="risk-list">
            {stockBars.map(([label, count]) => (
              <li key={label}><span>{label}</span><b>{count}</b></li>
            ))}
          </ul>
          <p>{t('alertExposure')}: {data.charts.exposure.expiry} / {data.charts.exposure.payable} / {data.charts.exposure.receivable}</p>
        </article>
      </div>
      <div className="tabs">
        <button type="button" className={!card ? 'on' : ''} onClick={() => setFilter({ card: '' })}>{t('alertAll')}</button>
        {CATS.map((id) => (
          <button key={id} type="button" className={card === id ? 'on' : ''} onClick={() => setFilter({ card: id })}>{t(catKey[id] ?? id)}</button>
        ))}
      </div>
      <form className="tools" onSubmit={(event) => event.preventDefault()}>
        <label className="field fit">{t('alertSearch')}<input value={q} onChange={(event) => setFilter({ q: event.target.value })} /></label>
        <label className="field fit">{t('alertSeverity')}
          <select value={severity} onChange={(event) => setFilter({ severity: event.target.value === 'all' ? '' : event.target.value })}>
            <option value="all">{t('alertAll')}</option>
            {(['critical', 'high', 'medium', 'info'] as const).map((id) => <option key={id} value={id}>{t(sevKey[id] ?? id)}</option>)}
          </select>
        </label>
        <label className="field fit">{t('alertSort')}
          <select value={sort} onChange={(event) => setFilter({ sort: event.target.value === 'severity' ? '' : event.target.value })}>
            <option value="severity">{t('alertSeverity')}</option>
            <option value="newest">{t('alertNewest')}</option>
            <option value="oldest">{t('alertOldest')}</option>
          </select>
        </label>
        <button type="button" className={status === 'active' ? 'primary' : ''} onClick={() => setFilter({ status: '' })}>{t('alertActive')}</button>
        <button type="button" className={status === 'snoozed' ? 'primary' : ''} onClick={() => setFilter({ status: 'snoozed' })}>{t('alertSnoozed')} {data.snoozedCount}</button>
        <button type="button" className={status === 'history' ? 'primary' : ''} onClick={() => setFilter({ status: 'history' })}>{t('alertHistory')} {data.historyCount}</button>
        <button type="button" onClick={printPdf}>{t('exportPdf')}</button>
        <button type="button" onClick={excel}>{t('exportExcel')}</button>
      </form>
      {data.items.length === 0 ? <p>{t('alertEmpty')}</p> : null}
      {data.items.map((item) => {
        const copy = text(item);
        return (
          <article key={item.id} className={`signal ${item.severity}`}>
            <button type="button" className="alert-open" onClick={() => { setSelected(item); setAssignee(item.assigneeId ?? ''); }}>
              <h3>{copy.title}</h3>
              <p>{copy.detail}</p>
              <b>{copy.figure}</b>
              <small>{t(sevKey[item.severity] ?? item.severity)} · {t(catKey[item.category] ?? item.category)}{copy.branch ? ` · ${copy.branch}` : ''}{item.estimate ? ` · ${t('alertEstimate')}` : ''}{item.escalated ? ' · !' : ''}</small>
            </button>
          </article>
        );
      })}
      <form
        className="panel-card"
        onSubmit={(event) => {
          event.preventDefault();
          void api('/api/v1/alerts/preferences', { method: 'PUT', body: JSON.stringify(prefs) }).then(() => load(params));
        }}
      >
        <h2>{t('alertPrefs')}</h2>
        <label className="checkline"><input type="checkbox" checked={prefs.immediate} onChange={(event) => setPrefs({ ...prefs, immediate: event.target.checked })} />{t('alertImmediate')}</label>
        <label className="checkline"><input type="checkbox" checked={prefs.daily} onChange={(event) => setPrefs({ ...prefs, daily: event.target.checked })} />{t('alertDaily')}</label>
        <label className="checkline"><input type="checkbox" checked={prefs.weekly} onChange={(event) => setPrefs({ ...prefs, weekly: event.target.checked })} />{t('alertWeekly')}</label>
        <button className="primary fit" type="submit">{t('save')}</button>
      </form>
      {selected ? (
        <div className="modal-back" onClick={() => setSelected(null)}>
          <article className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>{text(selected).title}</h2>
            {actionError ? <p className="error">{actionError}</p> : null}
            <p>{text(selected).detail}</p>
            <p><b>{text(selected).figure}</b></p>
            <p>{t('alertCurrent')}: {selected.currentValue}</p>
            <p>{t('alertThreshold')}: {selected.thresholdValue}</p>
            <p>{t('alertExposure')}: {selected.exposure}</p>
            <p>{t('alertRecommended')}: {text(selected).action}</p>
            {selected.assigneeName ? <p>{t('alertAssign')}: {selected.assigneeName}</p> : null}
            <p><Link to={selected.actionHref}>{t('alertOpen')}</Link></p>
            <div className="tools">
              {selected.status === 'OPEN' ? <button type="button" onClick={() => void act('ack')}>{t('alertAck')}</button> : null}
              {selected.severity !== 'critical' ? (
                <>
                  <select value={snoozeDays} onChange={(event) => setSnoozeDays(event.target.value)}>
                    <option value="1">1</option>
                    {selected.severity === 'high' ? null : [2, 3, 7].map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                  <button type="button" onClick={() => void act('snooze', { days: Number(snoozeDays) })}>{t('alertSnooze')}</button>
                </>
              ) : null}
              <button type="button" className="primary" onClick={() => void act('resolve')}>{t('alertResolve')}</button>
            </div>
            {data.canAssign ? (
              <form className="tools" onSubmit={(event) => { event.preventDefault(); void act('assign', { assigneeId: assignee || null }); }}>
                <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                  <option value="">{t('alertAssign')}</option>
                  {data.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
                <button type="submit">{t('save')}</button>
              </form>
            ) : null}
            <h3>{t('alertHistory')}</h3>
            <ul className="risk-list">
              {selected.history.map((entry) => <li key={`${entry.at}-${entry.kind}`}><span>{entry.kind}</span><b>{entry.at.slice(0, 16).replace('T', ' ')}</b></li>)}
            </ul>
            <button type="button" onClick={() => setSelected(null)}>{t('close')}</button>
          </article>
        </div>
      ) : null}
    </section>
  );
}
