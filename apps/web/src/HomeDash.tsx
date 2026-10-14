import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type HomeBoard, type ReceiptPreview } from './api';
import { ReceiptSlip } from './ReceiptPage';
import { formatKhartoum, formatMoney, lineAmount, percentAmount, subAmount, sumAmounts } from './locale';
import { useUi } from './ui';

type CartLine = { productId: string; name: string; unit: string; qty: number; price: string; stock: number };

export function HomeDash() {
  const { t } = useTranslation();
  const ui = useUi();
  const [home, setHome] = useState<HomeBoard | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [chart, setChart] = useState<'money' | 'count'>('money');

  useEffect(() => {
    api<{ home: HomeBoard }>('/api/v1/dashboard')
      .then((board) => {
        setHome(board.home);
        setError('');
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('empty')));
  }, [t, tick]);

  if (error) return <div className="error">{error}</div>;
  if (!home) return <p className="lede">{t('working')}</p>;

  const arabic = ui.language.startsWith('ar');
  const money = (amount: string) => `${formatMoney(amount)} ${t('sdg')}`;

  return (
    <div className="dash">
      <section className="kpi-row">
        <Kpi tone="ok" label={t('salesTodayKpi')} value={money(home.salesToday)} note={`${home.salesCount}`} />
        <Kpi tone="info" label={t('purchasesMonth')} value={money(home.purchasesMonth)} note={t('procurement')} />
        <Kpi tone="watch" label={t('lowDrugs')} value={String(home.lowCount)} note={t('reorderAction')} />
        <Kpi tone="bad" label={t('expiredDrugs')} value={String(home.expiredCount)} note={t('expiryAlerts')} />
      </section>
      <div className="dash-body">
        <QuickPos home={home} onSold={() => setTick((value) => value + 1)} />
        <div className="dash-main">
          <div className="dash-split">
            <Panel title={t('branchState')}>
              <div className="branch-list">
                {home.branches.map((branch) => (
                  <div className="branch-row" key={branch.id}>
                    <div>
                      <strong>{arabic ? branch.nameAr : branch.nameEn}</strong>
                      <small>{money(branch.salesToday)}</small>
                    </div>
                    <span className="pill ok">{t('connected')}</span>
                    <em>{branch.alertCount}</em>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              title={t('dailySales')}
              extra={
                <div className="seg">
                  <button type="button" className={chart === 'money' ? 'on' : ''} onClick={() => setChart('money')}>
                    {t('sales')}
                  </button>
                  <button type="button" className={chart === 'count' ? 'on' : ''} onClick={() => setChart('count')}>
                    {t('invoiceCount')}
                  </button>
                </div>
              }
            >
              <DayChart days={home.days} mode={chart} language={ui.language} />
              <p className="chart-read">{salesReading(home.days, chart, ui.language, t, money)}</p>
              <div className="chart-legend">
                <span><i className="up" />{t('chartUpKey')}</span>
                <span><i className="down" />{t('chartDownKey')}</span>
                <span><i className="flat" />{t('chartFlatKey')}</span>
              </div>
            </Panel>
          </div>
          <div className="chart-row">
            <Panel title={t('cashPicture')}>
              <Meter
                rows={[
                  { label: t('receiptsToday'), tone: 'ok', amount: Number(home.accounts.receiptsToday), text: money(home.accounts.receiptsToday) },
                  { label: t('paymentsToday'), tone: 'info', amount: Number(home.accounts.paymentsToday), text: money(home.accounts.paymentsToday) },
                  { label: t('customerDue'), tone: 'watch', amount: Number(home.accounts.customerDue), text: money(home.accounts.customerDue) },
                  { label: t('supplierDue'), tone: 'bad', amount: Number(home.accounts.supplierDue), text: money(home.accounts.supplierDue) },
                ]}
              />
            </Panel>
            <Panel title={t('stockPicture')}>
              {home.lowCount === 0 && home.expiredCount === 0 ? <p className="chart-read">{t('stockClear')}</p> : (
                <Meter
                  rows={[
                    { label: t('lowDrugs'), tone: 'watch', amount: home.lowCount, text: String(home.lowCount) },
                    { label: t('expiredDrugs'), tone: 'bad', amount: home.expiredCount, text: String(home.expiredCount) },
                  ]}
                />
              )}
            </Panel>
            <Panel title={t('payMix')}>
              <PayMix sales={home.sales} empty={t('chartNoPay')} label={(method) => methodLabel(method, t)} money={money} />
            </Panel>
          </div>
          <div className="dash-split">
            <Panel title={t('lowDrugs')} extra={<Link to="/app/inventory">{t('viewAll')}</Link>}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>{t('drug')}</th>
                    <th>{t('onHand')}</th>
                    <th>{t('minimum')}</th>
                    <th>{t('state')}</th>
                    <th>{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {home.lowStock.length === 0 ? (
                    <tr>
                      <td colSpan={5}>{t('empty')}</td>
                    </tr>
                  ) : (
                    home.lowStock.map((row) => (
                      <tr key={row.id}>
                        <td>{arabic ? row.nameAr : row.nameEn}</td>
                        <td>{row.qty}</td>
                        <td>{row.reorderLevel}</td>
                        <td>
                          <span className="pill watch">{t('low')}</span>
                        </td>
                        <td>
                          <Link to="/app/purchasing">{t('reorderAction')}</Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Panel>
            <Panel title={t('expiryAlerts')} extra={<Link to="/app/alerts">{t('viewAll')}</Link>}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>{t('drug')}</th>
                    <th>{t('batchNo')}</th>
                    <th>{t('expiry')}</th>
                    <th>{t('qty')}</th>
                    <th>{t('daysLeft')}</th>
                    <th>{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {home.expiry.length === 0 ? (
                    <tr>
                      <td colSpan={6}>{t('empty')}</td>
                    </tr>
                  ) : (
                    home.expiry.map((row) => (
                      <tr key={`${row.batchNo}-${row.expiry}`}>
                        <td>{arabic ? row.nameAr : row.nameEn}</td>
                        <td>{row.batchNo}</td>
                        <td>{row.expiry.slice(0, 10)}</td>
                        <td>{row.qty}</td>
                        <td>{row.daysLeft}</td>
                        <td>
                          <span className={row.daysLeft < 0 ? 'pill bad' : row.daysLeft <= 30 ? 'pill watch' : 'pill ok'}>
                            {row.daysLeft < 0 ? t('expired') : row.daysLeft <= 30 ? t('soon') : t('ending')}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Panel>
          </div>
          <div className="dash-three">
            <Panel title={t('latestSales')} extra={<Link to="/app/sales">{t('viewAll')}</Link>}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>{t('when')}</th>
                    <th>{t('invoice')}</th>
                    <th>{t('customer')}</th>
                    <th>{t('value')}</th>
                    <th>{t('method')}</th>
                  </tr>
                </thead>
                <tbody>
                  {home.sales.length === 0 ? (
                    <tr>
                      <td colSpan={5}>{t('empty')}</td>
                    </tr>
                  ) : (
                    home.sales.map((sale) => (
                      <tr key={sale.docNo}>
                        <td>{formatKhartoum(sale.soldAt, ui.language)}</td>
                        <td>{sale.docNo}</td>
                        <td>{sale.customerName}</td>
                        <td>{money(sale.total)}</td>
                        <td>{sale.paymentMethod}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Panel>
            <Panel title={t('poStatus')} extra={<Link to="/app/purchasing">{t('viewAll')}</Link>}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>{t('orderNo')}</th>
                    <th>{t('supplier')}</th>
                    <th>{t('value')}</th>
                    <th>{t('state')}</th>
                  </tr>
                </thead>
                <tbody>
                  {home.purchases.length === 0 ? (
                    <tr>
                      <td colSpan={4}>{t('empty')}</td>
                    </tr>
                  ) : (
                    home.purchases.map((order) => (
                      <tr key={order.docNo}>
                        <td>{order.docNo}</td>
                        <td>{arabic ? order.supplierAr : order.supplierEn}</td>
                        <td>{money(order.total)}</td>
                        <td>{order.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Panel>
            <Panel title={t('accountsSummary')} extra={<Link to="/app/finance">{t('viewAll')}</Link>}>
              <div className="acct">
                <div>
                  <span>{t('receiptsToday')}</span>
                  <strong>{money(home.accounts.receiptsToday)}</strong>
                </div>
                <div>
                  <span>{t('paymentsToday')}</span>
                  <strong>{money(home.accounts.paymentsToday)}</strong>
                </div>
                <div>
                  <span>{t('customerDue')}</span>
                  <strong>{money(home.accounts.customerDue)}</strong>
                </div>
                <div>
                  <span>{t('supplierDue')}</span>
                  <strong>{money(home.accounts.supplierDue)}</strong>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PosPage() {
  const { t } = useTranslation();
  const [home, setHome] = useState<HomeBoard | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api<{ home: HomeBoard }>('/api/v1/dashboard')
      .then((board) => {
        setHome(board.home);
        setError('');
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('empty')));
  }, [t, tick]);

  if (error) return <div className="error">{error}</div>;
  if (!home) return <p className="lede">{t('working')}</p>;
  return (
    <div className="pos-desk">
      <QuickPos home={home} onSold={() => setTick((value) => value + 1)} />
    </div>
  );
}

function QuickPos({ home, onSold }: { home: HomeBoard; onSold: () => void }) {
  const { t } = useTranslation();
  const ui = useUi();
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = useState('0');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [slip, setSlip] = useState<ReceiptPreview | null>(null);
  const allBranches = localStorage.getItem('dawaa.branch') === 'all';
  const arabic = ui.language.startsWith('ar');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return home.products
      .filter((product) =>
        [product.nameAr, product.nameEn, product.genericName, product.sku].some((value) => value.toLowerCase().includes(needle)),
      )
      .slice(0, 6);
  }, [home.products, query]);

  function addProduct(product: HomeBoard['products'][number]) {
    if (product.qty <= 0) {
      ui.push({ tone: 'urgent', title: t('quickPos'), body: t('stockShort') });
      return;
    }
    if (product.sellPrice === '0' || product.sellPrice === '0.00') {
      ui.push({ tone: 'urgent', title: t('quickPos'), body: t('noPrice') });
      return;
    }
    const name = arabic ? product.nameAr : product.nameEn;
    setLines((current) => {
      const found = current.find((line) => line.productId === product.id);
      if (found) {
        if (found.qty >= product.qty) return current;
        return current.map((line) => (line.productId === product.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { productId: product.id, name, unit: product.form, qty: 1, price: product.sellPrice, stock: product.qty }];
    });
    setQuery('');
    setSlip(null);
  }

  const subtotal = sumAmounts(lines.map((line) => lineAmount(line.price, line.qty)));
  const discount = percentAmount(subtotal, discountPct || '0');
  const total = subAmount(subtotal, discount);

  async function sell() {
    if (lines.length === 0 || allBranches || busy) return;
    setBusy(true);
    setProgress(15);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 20, 90)), 80);
    try {
      const result = await api<{ docNo: string; total: string }>('/api/v1/ops/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim() || t('walkIn'),
          discount,
          paid: total,
          paymentMethod,
          lines: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
        }),
      });
      setProgress(100);
      const preview = await api<ReceiptPreview>('/api/v1/receipts/preview');
      setSlip(preview);
      setLines([]);
      setDiscountPct('0');
      setCustomerName('');
      onSold();
      ui.push({ tone: 'ok', title: t('posted'), body: `${result.docNo} · ${formatMoney(result.total)} ${t('sdg')}` });
    } catch (caught: unknown) {
      const code = caught instanceof Error ? caught.message : '';
      const body = code === 'STOCK_SHORT' ? t('stockShort') : code === 'VALIDATION_ERROR' ? t('noPrice') : code === 'PICK_BRANCH' ? t('pickBranchSell') : t('saleFailed');
      ui.push({ tone: 'urgent', title: t('quickPos'), body });
      setProgress(0);
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  const pays = [
    ['CASH', t('cash')],
    ['BANKAK', t('bankak')],
    ['FAWRY', t('fawry')],
    ['TRANSFER', t('transfer')],
  ] as const;

  return (
    <aside className="pos">
      <header>
        <h2>{t('quickPos')}</h2>
      </header>
      <label className="field">
        <span>{t('posSearch')}</span>
        <input
          value={query}
          placeholder={t('posSearch')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              addProduct(matches[0]);
            }
          }}
        />
      </label>
      {matches.length > 0 ? (
        <div className="pos-hits">
          {matches.map((product) => (
            <button className="pos-hit" type="button" key={product.id} onClick={() => addProduct(product)}>
              <span className="pick-name">
                <strong>{arabic ? product.nameAr : product.nameEn}</strong>
                <small>
                  {product.form} · {t('inStock')} {product.qty}
                </small>
              </span>
              <b>
                {formatMoney(product.sellPrice)} {t('sdg')}
              </b>
            </button>
          ))}
        </div>
      ) : null}
      {lines.length === 0 ? (
        <p className="lede pos-empty">{t('posEmpty')}</p>
      ) : (
        <ul className="pos-lines">
          {lines.map((line) => (
            <li className="pos-line" key={line.productId}>
              <div className="pos-line-top">
                <strong title={line.name}>{line.name}</strong>
                <button
                  className="chosen-x"
                  type="button"
                  aria-label="×"
                  onClick={() => setLines(lines.filter((item) => item.productId !== line.productId))}
                >
                  ×
                </button>
              </div>
              <div className="pos-line-bot">
                <span className="stepper">
                  <button
                    type="button"
                    onClick={() =>
                      setLines(lines.flatMap((item) => (item.productId === line.productId ? (item.qty <= 1 ? [] : [{ ...item, qty: item.qty - 1 }]) : [item])))
                    }
                  >
                    −
                  </button>
                  {line.qty}
                  <button
                    type="button"
                    onClick={() =>
                      setLines(lines.map((item) => (item.productId === line.productId && item.qty < item.stock ? { ...item, qty: item.qty + 1 } : item)))
                    }
                  >
                    +
                  </button>
                </span>
                <span className="pos-line-money">
                  <small>
                    {formatMoney(line.price)} {t('sdg')}
                  </small>
                  <b>
                    {formatMoney(lineAmount(line.price, line.qty))} {t('sdg')}
                  </b>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="pos-pay">
        <label className="field">
          <span>{t('customer')}</span>
          <input id="pos-customer" value={customerName} placeholder={t('walkIn')} onChange={(event) => setCustomerName(event.target.value)} />
        </label>
        <label className="field">
          <span>{t('discount')} %</span>
          <input value={discountPct} inputMode="decimal" onChange={(event) => setDiscountPct(event.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <div className="field">
          <span>{t('method')}</span>
          <div className="pos-methods">
            {pays.map(([value, label]) => (
              <button key={value} type="button" className={paymentMethod === value ? 'on' : ''} onClick={() => setPaymentMethod(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="pos-sum">
        <span>{t('subtotal')}</span>
        <b>{formatMoney(subtotal)}</b>
        <span>{t('discount')}</span>
        <b>{formatMoney(discount)}</b>
        <span>{t('total')}</span>
        <b className="grand">
          {formatMoney(total)} {t('sdg')}
        </b>
      </div>
      {allBranches ? <p className="lede">{t('pickBranchSell')}</p> : null}
      {busy ? (
        <div className="pos-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <button className="primary" type="button" disabled={busy || lines.length === 0 || allBranches} onClick={() => void sell()}>
        {t('completeSale')}
      </button>
      {slip ? (
        <div className="modal-back" role="presentation" onClick={() => setSlip(null)}>
          <div className="modal receipt-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="row">
              <button className="primary fit" type="button" onClick={() => window.print()}>
                {t('print')}
              </button>
              <button className="ghost" type="button" onClick={() => setSlip(null)}>
                {t('close')}
              </button>
            </div>
            <div className="desk">
              <ReceiptSlip receipt={slip} />
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function Kpi({ tone, label, value, note }: { tone: string; label: string; value: string; note: string }) {
  return (
    <article className={`kpi-card ${tone}`}>
      <span className="kpi-mark" aria-hidden="true" />
      <em>{label}</em>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Panel({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel-card dash-card">
      <header className="card-head">
        <h2>{title}</h2>
        {extra}
      </header>
      {children}
    </section>
  );
}

function DayChart({ days, mode, language }: { days: HomeBoard['days']; mode: 'money' | 'count'; language: string }) {
  return (
    <div className="bars">
      {days.map((day, index) => {
        const previous = days[index - 1];
        const value = mode === 'money' ? Number(day.total) : day.count;
        const before = previous ? (mode === 'money' ? Number(previous.total) : previous.count) : value;
        const tone = value <= 0 ? 'none' : !previous || value === before ? 'flat' : value > before ? 'up' : 'down';
        const height = mode === 'money' ? day.heightPct : day.countPct;
        return (
          <div className="bar" key={day.date}>
            <b>{mode === 'money' ? shortAmount(day.total) : String(day.count)}</b>
            <i className={tone} style={{ height: `${height}%` }} />
            <span>{dayLabel(day.date, language)}</span>
          </div>
        );
      })}
    </div>
  );
}

function salesReading(
  days: HomeBoard['days'],
  mode: 'money' | 'count',
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  money: (amount: string) => string,
): string {
  if (days.every((day) => Number(day.total) <= 0 && day.count === 0)) return t('chartQuiet');
  const last = days[days.length - 1];
  const prev = days[days.length - 2];
  if (!last || !prev) return t('chartQuiet');
  const current = mode === 'money' ? Number(last.total) : last.count;
  const before = mode === 'money' ? Number(prev.total) : prev.count;
  const move = before <= 0
    ? (current > 0 ? t('chartUp', { pct: 100 }) : t('chartFlat'))
    : current === before
      ? t('chartFlat')
      : current > before
        ? t('chartUp', { pct: Math.round(((current - before) / before) * 100) })
        : t('chartDown', { pct: Math.round(((before - current) / before) * 100) });
  const week = mode === 'money'
    ? money(sumAmounts(days.map((day) => day.total)))
    : String(days.reduce((total, day) => total + day.count, 0));
  const best = [...days].sort((left, right) => (mode === 'money' ? Number(right.total) - Number(left.total) : right.count - left.count))[0];
  const bestText = best && (mode === 'money' ? Number(best.total) > 0 : best.count > 0) ? t('chartBest', { day: dayLabel(best.date, language) }) : '';
  return `${move} ${t('chartWeek', { amount: week })} ${bestText}`.trim();
}

function Meter({ rows }: { rows: { label: string; tone: string; amount: number; text: string }[] }) {
  const max = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <div className="meter">
      {rows.map((row) => (
        <div className={`meter-row ${row.tone}`} key={row.label}>
          <span>{row.label}</span>
          <i><span style={{ width: `${Math.max(row.amount > 0 ? 6 : 0, Math.round((row.amount / max) * 100))}%` }} /></i>
          <strong>{row.text}</strong>
        </div>
      ))}
    </div>
  );
}

function PayMix({
  sales,
  empty,
  label,
  money,
}: {
  sales: HomeBoard['sales'];
  empty: string;
  label: (method: string) => string;
  money: (amount: string) => string;
}) {
  const groups = new Map<string, string[]>();
  for (const sale of sales) {
    const key = sale.paymentMethod || 'CASH';
    groups.set(key, [...(groups.get(key) ?? []), sale.total]);
  }
  if (groups.size === 0) return <p className="chart-read">{empty}</p>;
  const rows = [...groups.entries()].map(([method, amounts]) => ({
    label: label(method),
    tone: method === 'CASH' ? 'ok' : method === 'BANKAK' ? 'info' : 'watch',
    amount: Number(sumAmounts(amounts)),
    text: money(sumAmounts(amounts)),
  }));
  return <Meter rows={rows} />;
}

function methodLabel(method: string, t: (key: string) => string): string {
  if (method === 'CASH') return t('cash');
  if (method === 'BANKAK') return t('bankak');
  return method;
}

function shortAmount(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(Math.round(value));
}

function dayLabel(date: string, language: string): string {
  const locale = language.startsWith('ar') ? 'ar-SD-u-nu-latn' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function CustomersPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [rows, setRows] = useState<HomeBoard['customers']>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ home: HomeBoard }>('/api/v1/dashboard')
      .then((board) => setRows(board.home.customers))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('empty')));
  }, [t]);
  return (
    <section className="panel-card">
      <h2>{t('customers')}</h2>
      {error ? <div className="error">{error}</div> : null}
      {rows.length === 0 ? <p>{t('empty')}</p> : null}
      <table className="grid">
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.nameAr}-${row.balance}`}>
              <td>{ui.language.startsWith('ar') ? row.nameAr : row.nameEn}</td>
              <td>
                {formatMoney(row.balance)} {t('sdg')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function PrescriptionsPage() {
  const { t } = useTranslation();
  return (
    <section className="panel-card">
      <h2>{t('prescriptions')}</h2>
      <p>{t('noRx')}</p>
    </section>
  );
}

export function BranchesPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [rows, setRows] = useState<{ id: string; nameAr: string; nameEn: string | null }[]>([]);
  useEffect(() => {
    api<{ network: { branches: { id: string; nameAr: string; nameEn: string | null }[] } }>('/api/v1/auth/me')
      .then((profile) => setRows(profile.network.branches))
      .catch(() => setRows([]));
  }, []);
  return (
    <section className="panel-card">
      <h2>{t('branches')}</h2>
      {rows.length === 0 ? <p>{t('empty')}</p> : null}
      <ul className="branch-list">
        {rows.map((branch) => (
          <li key={branch.id}>{ui.language.startsWith('ar') ? branch.nameAr : branch.nameEn || branch.nameAr}</li>
        ))}
      </ul>
    </section>
  );
}
