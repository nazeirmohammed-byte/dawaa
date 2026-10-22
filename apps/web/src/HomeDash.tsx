import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Banknote,
  CalendarClock,
  CalendarX2,
  ClipboardList,
  Layers,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  type LucideIcon,
} from 'lucide-react';
import { ApiError, api, formatUserError, type HomeBoard, type ReceiptPreview } from './api';
import { MedicineIllustration } from './components/MedicineIllustration';
import { LibraryRequest } from './library-request';
import { ReceiptSlip } from './ReceiptPage';
import type { MedicineArtKey } from './design-system/medicine-art';
import { formatKhartoum, formatMoney, lineAmount, percentAmount, subAmount, sumAmounts } from './locale';
import { useUi } from './ui';

type SaleUnit = 'BOX' | 'STRIP' | 'BOTTLE' | 'PIECE';
type ItemPack = NonNullable<HomeBoard['products'][number]['pack']>;
type SaleChoice = { unit: SaleUnit; pieces: number; divide: number };
type CartLine = {
  key: string;
  productId: string;
  name: string;
  unit: string;
  unitCode: SaleUnit;
  pieces: number;
  qty: number;
  price: string;
  stock: number;
};

type WaitingSale = {
  id: string;
  docNo: string;
  customerName: string;
  cashierName: string;
  total: string;
  lines: { nameAr: string; nameEn: string; qty: number; lineTotal: string }[];
};

const UNIT_KEY: Record<SaleUnit, 'packBox' | 'packStrip' | 'packBottle' | 'packPiece'> = {
  BOX: 'packBox',
  STRIP: 'packStrip',
  BOTTLE: 'packBottle',
  PIECE: 'packPiece',
};

function saleChoices(pack: ItemPack | null | undefined): SaleChoice[] {
  if (!pack || pack.outer === 'PIECE') return [{ unit: 'PIECE', pieces: 1, divide: 1 }];
  if (pack.outer === 'STRIP' || pack.outer === 'BOTTLE') {
    const pieces = Math.max(1, pack.perInner);
    return pieces > 1
      ? [{ unit: pack.outer, pieces, divide: 1 }, { unit: 'PIECE', pieces: 1, divide: pieces }]
      : [{ unit: pack.outer, pieces: 1, divide: 1 }];
  }
  const innerPieces = pack.inner === 'PIECE' ? 1 : Math.max(1, pack.perInner);
  const perBox = Math.max(1, pack.perBox);
  const boxPieces = perBox * innerPieces;
  const choices: SaleChoice[] = [{ unit: 'BOX', pieces: boxPieces, divide: 1 }];
  if ((pack.inner === 'STRIP' || pack.inner === 'BOTTLE') && perBox > 1) choices.push({ unit: pack.inner, pieces: innerPieces, divide: perBox });
  if (boxPieces > 1) choices.push({ unit: 'PIECE', pieces: 1, divide: boxPieces });
  return choices;
}

function unitPrice(amount: string, divide: number): string {
  if (divide <= 1) return amount;
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents)) return amount;
  return (Math.round(cents / divide) / 100).toFixed(2);
}

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
      .catch((caught: unknown) => setError(formatUserError(caught, t('apiError'))));
  }, [t, tick]);

  if (error) return <div className="error">{error}</div>;
  if (!home) return <p className="lede">{t('working')}</p>;

  const arabic = ui.language.startsWith('ar');
  const money = (amount: string) => `${formatMoney(amount)} ${t('sdg')}`;
  const nearExpiry = home.expiry.filter((row) => row.daysLeft >= 0 && row.daysLeft <= 90).length;
  const openPurchases = home.purchases.filter((row) => row.status !== 'RECEIVED' && row.status !== 'CANCELLED').length;

  return (
    <div className="dash">
      <section className="dash-hero panel-card">
        <div>
          <h2 className="dash-hero-title">{t('dashGreeting')}</h2>
          <p className="lede">{t('dashLead')}</p>
        </div>
        <div className="dash-quick">
          <Link className="primary fit" to="/app/pos">
            {t('quickPos')}
          </Link>
          <Link className="ghost" to="/app/purchasing">
            {t('procurement')}
          </Link>
        </div>
      </section>
      <WorkflowStrip
        t={t}
        openPurchases={openPurchases}
        stocking={home.stocking}
        salesCount={home.salesCount}
      />
      <section className="kpi-row kpi-row-5">
        <Kpi tone="ok" icon={Banknote} art="syrup" label={t('salesTodayKpi')} value={money(home.salesToday)} note={t('sales')} />
        <Kpi tone="info" icon={ReceiptText} art="sachet" label={t('invoiceCount')} value={String(home.salesCount)} note={t('salesTodayKpi')} />
        <Kpi tone="watch" icon={PackageMinus} art="tablets" label={t('lowDrugs')} value={String(home.lowCount)} note={t('reorderAction')} />
        <Kpi tone="watch" icon={CalendarClock} art="capsules" label={t('nearExpiryKpi')} value={String(nearExpiry)} note={t('expiryAlerts')} />
        <Kpi tone="bad" icon={CalendarX2} art="generic" label={t('expiredDrugs')} value={String(home.expiredCount)} note={t('expired')} />
      </section>
      {home.stocking ? (
        <section className="kpi-row">
          <Kpi tone="watch" icon={ClipboardList} art="infusion" label={t('buyPendingReceipts')} value={String(home.stocking.pendingReceipts)} note={t('poApproved')} />
          <Kpi tone="info" icon={PackagePlus} art="syrup" label={t('buyReceived')} value={String(home.stocking.receivedLines)} note={t('procurement')} />
          <Kpi tone="watch" icon={Layers} art="powder" label={t('invReady')} value={String(home.stocking.awaitingPosting)} note={String(home.stocking.pendingQty)} />
          <Kpi tone="ok" icon={PackageCheck} art="tablets" label={t('invOnHand')} value={String(home.stocking.availableQty)} note={t('invNewStock') + ' ' + home.stocking.newlyStocked} />
        </section>
      ) : null}
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
            <Panel title={t('expiryDistribution')}>
              <ExpiryDistribution expiry={home.expiry} t={t} />
            </Panel>
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
                        <td>{order.status === 'ORDERED' ? t('poApproved') : order.status === 'PARTIAL' ? t('poPartialRecv') : order.status === 'RECEIVED' ? t('poReceived') : order.status === 'CANCELLED' ? t('poCancelled') : order.status === 'DRAFT' ? t('poDraft') : order.status}</td>
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
      .catch((caught: unknown) => setError(formatUserError(caught, t('apiError'))));
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
  const [libraryNames, setLibraryNames] = useState<string[]>([]);
  const [libraryMiss, setLibraryMiss] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = useState('0');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [slip, setSlip] = useState<ReceiptPreview | null>(null);
  const [roleCode, setRoleCode] = useState('');
  const [waiting, setWaiting] = useState<WaitingSale[]>([]);
  const [desk, setDesk] = useState<WaitingSale | null>(null);
  const [taken, setTaken] = useState('');
  const [stamp, setStamp] = useState<WaitingSale & { paid: string; changeDue: string; cashierName: string } | null>(null);
  const allBranches = localStorage.getItem('dawaa.branch') === 'all';
  const arabic = ui.language.startsWith('ar');

  useEffect(() => {
    api<{ role: { code: string } | null }>('/api/v1/auth/me')
      .then((me) => setRoleCode(me.role?.code ?? ''))
      .catch(() => setRoleCode(''));
    api<{ sales: WaitingSale[] }>('/api/v1/ops/sales/waiting')
      .then((body) => setWaiting(body.sales))
      .catch(() => setWaiting([]));
  }, []);

  function reloadWaiting() {
    api<{ sales: WaitingSale[] }>('/api/v1/ops/sales/waiting')
      .then((body) => setWaiting(body.sales))
      .catch(() => setWaiting([]));
  }

  const pharmacist = roleCode === 'PHARMACIST' || roleCode === 'ASSISTANT_PHARMACIST';
  const cashierDesk = roleCode === 'CASHIER' || roleCode === 'OWNER' || roleCode === 'BRANCH_MANAGER';

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setLibraryNames([]);
      setLibraryMiss(false);
      return;
    }
    const handle = window.setTimeout(() => {
      api<{ genericName: string; nameAr: string; nameEn: string; code: string; aliases?: string[] }[]>(
        `/api/v1/ops/catalog?q=${encodeURIComponent(needle)}`,
      )
        .then((rows) => {
          const list = Array.isArray(rows) ? rows : [];
          setLibraryNames(list.flatMap((row) => [row.genericName, row.nameAr, row.nameEn, row.code, ...(row.aliases ?? [])]));
          setLibraryMiss(list.length === 0);
        })
        .catch(() => {
          setLibraryNames([]);
          setLibraryMiss(false);
        });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const extra = new Set(libraryNames.map((value) => value.toLowerCase()));
    return home.products
      .filter((product) => {
        const own = [product.nameAr, product.nameEn, product.genericName, product.sku].some((value) => value.toLowerCase().includes(needle));
        return own || extra.has(product.genericName.toLowerCase()) || extra.has(product.sku.toLowerCase());
      })
      .slice(0, 6);
  }, [home.products, libraryNames, query]);

  function addUnit(product: HomeBoard['products'][number], choice: SaleChoice) {
    if (product.sellPrice === '0' || product.sellPrice === '0.00') {
      ui.push({ tone: 'urgent', title: t('quickPos'), body: t('noPrice') });
      return;
    }
    const held = lines.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.qty * line.pieces, 0);
    if (product.qty - held < choice.pieces) {
      ui.push({ tone: 'urgent', title: t('quickPos'), body: t('stockShort') });
      return;
    }
    const name = arabic ? product.nameAr : product.nameEn;
    const word = t(UNIT_KEY[choice.unit]);
    const key = `${product.id}:${choice.unit}`;
    setLines((current) => {
      const used = current.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.qty * line.pieces, 0);
      if (product.qty - used < choice.pieces) return current;
      const found = current.find((line) => line.key === key);
      if (found) return current.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line));
      return [...current, { key, productId: product.id, name, unit: word, unitCode: choice.unit, pieces: choice.pieces, qty: 1, price: unitPrice(product.sellPrice, choice.divide), stock: product.qty }];
    });
    setQuery('');
    setSlip(null);
  }

  function addProduct(product: HomeBoard['products'][number]) {
    const choices = saleChoices(product.pack);
    if (choices.length === 1) addUnit(product, choices[0]);
  }

  const subtotal = sumAmounts(lines.map((line) => lineAmount(line.price, line.qty)));
  const discount = percentAmount(subtotal, discountPct || '0');
  const total = subAmount(subtotal, discount);

  async function sell(hold = false) {
    if (lines.length === 0 || allBranches || busy) return;
    setBusy(true);
    setProgress(15);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 20, 90)), 80);
    try {
      const result = await api<{ docNo: string; total: string; status?: string }>('/api/v1/ops/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim() || t('walkIn'),
          discount,
          paid: hold ? '0.00' : total,
          paymentMethod,
          hold,
          lines: lines.map((line) => ({ productId: line.productId, qty: line.qty, unit: line.unitCode })),
        }),
      });
      setProgress(100);
      setLines([]);
      setDiscountPct('0');
      setCustomerName('');
      if (hold) {
        reloadWaiting();
        ui.push({ tone: 'ok', title: t('sendCashier'), body: `${result.docNo} · ${formatMoney(result.total)} ${t('sdg')}` });
      } else {
        const preview = await api<ReceiptPreview>('/api/v1/receipts/preview');
        setSlip(preview);
        onSold();
        ui.push({ tone: 'ok', title: t('posted'), body: `${result.docNo} · ${formatMoney(result.total)} ${t('sdg')}` });
      }
    } catch (caught: unknown) {
      const code = caught instanceof ApiError ? caught.code : '';
      const body =
        code === 'STOCK_SHORT'
          ? t('stockShort')
          : code === 'NO_SELL_PRICE' || code === 'VALIDATION_ERROR'
            ? t('noPrice')
            : code === 'PICK_BRANCH'
              ? t('pickBranchSell')
              : formatUserError(caught, t('saleFailed'));
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

  async function takePayment() {
    if (!desk || busy) return;
    const paid = taken.trim() || desk.total;
    setBusy(true);
    try {
      const saved = await api<WaitingSale & { paid: string; changeDue: string; cashierName: string }>('/api/v1/ops/sales/receive', {
        method: 'POST',
        body: JSON.stringify({ saleId: desk.id, paid, paymentMethod }),
      });
      setStamp(saved);
      setDesk(null);
      setTaken('');
      reloadWaiting();
      onSold();
      ui.push({ tone: 'ok', title: t('stamped'), body: saved.docNo });
    } catch (caught: unknown) {
      const code = caught instanceof ApiError ? caught.code : '';
      ui.push({
        tone: 'urgent',
        title: t('cashier'),
        body: code === 'STOCK_SHORT' ? t('stockShort') : formatUserError(caught, t('saleFailed')),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="pos">
      <header>
        <h2>{t('quickPos')}</h2>
      </header>
      {cashierDesk && waiting.length > 0 ? (
        <div className="desk-wait">
          <strong>{t('cashierWaiting', { count: waiting.length })}</strong>
          {waiting.map((sale) => (
            <button key={sale.id} type="button" className={desk?.id === sale.id ? 'on' : ''} onClick={() => { setDesk(sale); setTaken(sale.total); }}>
              <b>{sale.docNo}</b>
              <span>{sale.customerName} · {formatMoney(sale.total)} {t('sdg')}</span>
              <small>{sale.cashierName}</small>
            </button>
          ))}
        </div>
      ) : null}
      {desk ? (
        <div className="desk-wait">
          <p className="lede">{t('cashierDesk')}</p>
          <ul className="pos-lines">
            {desk.lines.map((line) => (
              <li key={`${line.nameEn}-${line.qty}`}>
                <strong>{arabic ? line.nameAr : line.nameEn}</strong>
                <span> × {line.qty} · {formatMoney(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <label className="field">
            <span>{t('amountReceived')}</span>
            <input value={taken} inputMode="decimal" onChange={(event) => setTaken(event.target.value)} />
          </label>
          <button className="primary" type="button" disabled={busy} onClick={() => void takePayment()}>
            {t('amountReceived')}
          </button>
        </div>
      ) : null}
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
          {matches.map((product) => {
            const choices = saleChoices(product.pack);
            const title = (
              <span className="pick-name">
                <strong>{arabic ? product.nameAr : product.nameEn}</strong>
                <small>
                  {product.form} · {t('inStock')} {product.qty}
                </small>
              </span>
            );
            if (choices.length > 1) {
              return (
                <div className="pos-hit pack" key={product.id}>
                  {title}
                  <div className="pos-units">
                    {choices.map((choice) => (
                      <button key={choice.unit} type="button" onClick={() => addUnit(product, choice)}>
                        {t(UNIT_KEY[choice.unit])} · {formatMoney(unitPrice(product.sellPrice, choice.divide))}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <button className="pos-hit" type="button" key={product.id} onClick={() => addProduct(product)}>
                {title}
                <b>
                  {formatMoney(product.sellPrice)} {t('sdg')}
                </b>
              </button>
            );
          })}
        </div>
      ) : null}
      {query.trim().length >= 2 && matches.length === 0 && libraryNames.length > 0 ? <p className="lede">{t('libraryNotStock')}</p> : null}
      {query.trim().length >= 2 && matches.length === 0 && libraryMiss ? <LibraryRequest query={query} /> : null}
      {lines.length === 0 ? (
        <p className="lede pos-empty">{t('posEmpty')}</p>
      ) : (
        <ul className="pos-lines">
          {lines.map((line) => (
            <li className="pos-line" key={line.key}>
              <div className="pos-line-top">
                <strong title={line.name}>
                  {line.name}
                  {line.unitCode !== 'PIECE' || line.pieces > 1 ? <small> · {line.unit}</small> : null}
                </strong>
                <button
                  className="chosen-x"
                  type="button"
                  aria-label="×"
                  onClick={() => setLines(lines.filter((item) => item.key !== line.key))}
                >
                  ×
                </button>
              </div>
              <div className="pos-line-bot">
                <span className="stepper">
                  <button
                    type="button"
                    onClick={() => setLines(lines.flatMap((item) => (item.key === line.key ? (item.qty <= 1 ? [] : [{ ...item, qty: item.qty - 1 }]) : [item])))}
                  >
                    −
                  </button>
                  {line.qty}
                  <button
                    type="button"
                    onClick={() =>
                      setLines(
                        lines.map((item) => {
                          if (item.key !== line.key) return item;
                          const held = lines.filter((row) => row.productId === item.productId && row.key !== item.key).reduce((sum, row) => sum + row.qty * row.pieces, 0);
                          return item.qty * item.pieces + held + item.pieces <= item.stock ? { ...item, qty: item.qty + 1 } : item;
                        }),
                      )
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
      {pharmacist || roleCode === 'OWNER' || roleCode === 'BRANCH_MANAGER' ? (
        <button className="ghost" type="button" disabled={busy || lines.length === 0 || allBranches} onClick={() => void sell(true)}>
          {t('sendCashier')}
        </button>
      ) : null}
      {!pharmacist ? (
        <button className="primary" type="button" disabled={busy || lines.length === 0 || allBranches} onClick={() => void sell(false)}>
          {t('completeSale')}
        </button>
      ) : null}
      {stamp ? (
        <div className="modal-back" role="presentation" onClick={() => setStamp(null)}>
          <div className="modal receipt-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="row">
              <button className="primary fit" type="button" onClick={() => window.print()}>{t('print')}</button>
              <button className="ghost" type="button" onClick={() => setStamp(null)}>{t('close')}</button>
            </div>
            <article className="receipt">
              <p className="receipt-stamp">{t('stamped')}</p>
              <h2>{stamp.docNo}</h2>
              <p>{stamp.customerName}</p>
              <p>{t('cashier')}: {stamp.cashierName}</p>
              {stamp.lines.map((line) => (
                <p key={`${line.nameEn}-${line.qty}`}>{arabic ? line.nameAr : line.nameEn} × {line.qty} · {line.lineTotal}</p>
              ))}
              <p>{t('total')} {stamp.total}</p>
              <p>{t('amountReceived')} {stamp.paid}</p>
              <p>{t('changeDue')} {stamp.changeDue}</p>
            </article>
          </div>
        </div>
      ) : null}
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

function WorkflowStrip({
  t,
  openPurchases,
  stocking,
  salesCount,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  openPurchases: number;
  stocking: HomeBoard['stocking'];
  salesCount: number;
}) {
  const steps = [
    { key: 'dashFlowPo', count: openPurchases, to: '/app/purchasing' },
    { key: 'dashFlowReceive', count: stocking?.pendingReceipts ?? 0, to: '/app/purchasing' },
    { key: 'dashFlowStock', count: stocking?.awaitingPosting ?? 0, to: '/app/inventory' },
    { key: 'dashFlowAvailable', count: stocking?.availableQty ?? 0, to: '/app/inventory' },
    { key: 'prices', count: null, to: '/app/prices' },
    { key: 'sales', count: salesCount, to: '/app/sales' },
  ];
  return (
    <section className="dash-flow panel-card" aria-label={t('dashFlowTitle')}>
      <h2>{t('dashFlowTitle')}</h2>
      <ol className="dash-flow-track">
        {steps.map((step, index) => (
          <li key={step.key}>
            <Link to={step.to} className="dash-flow-step">
              <strong>{t(step.key)}</strong>
              <span>{step.count === null ? '—' : step.count}</span>
            </Link>
            {index < steps.length - 1 ? <span className="dash-flow-chevron" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ExpiryDistribution({
  expiry,
  t,
}: {
  expiry: HomeBoard['expiry'];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const buckets = { expired: 0, under30: 0, under90: 0, safe: 0 };
  for (const row of expiry) {
    if (row.daysLeft < 0) buckets.expired += row.qty;
    else if (row.daysLeft <= 30) buckets.under30 += row.qty;
    else if (row.daysLeft <= 90) buckets.under90 += row.qty;
    else buckets.safe += row.qty;
  }
  const total = buckets.expired + buckets.under30 + buckets.under90 + buckets.safe;
  if (total === 0) return <p className="chart-read">{t('empty')}</p>;
  const pct = (value: number) => `${Math.round((value / total) * 100)}%`;
  const rows = [
    { tone: 'bad', label: t('expiryBucketExpired'), value: buckets.expired },
    { tone: 'watch', label: t('expiryBucket30'), value: buckets.under30 },
    { tone: 'warn', label: t('expiryBucket90'), value: buckets.under90 },
    { tone: 'ok', label: t('expiryBucketSafe'), value: buckets.safe },
  ];
  return (
    <div className="expiry-meter">
      <div className="expiry-meter-bar" role="img" aria-label={t('expiryDistribution')}>
        {rows.map((row) =>
          row.value > 0 ? (
            <span key={row.label} className={`expiry-seg ${row.tone}`} style={{ flex: row.value }} title={`${row.label} ${pct(row.value)}`} />
          ) : null,
        )}
      </div>
      <ul className="expiry-meter-legend">
        {rows.map((row) => (
          <li key={row.label}>
            <i className={row.tone} aria-hidden="true" />
            {row.label} <b>{pct(row.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Kpi({
  tone,
  icon: Icon,
  label,
  value,
  note,
  art,
}: {
  tone: string;
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  art?: MedicineArtKey;
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <span className="kpi-mark" aria-hidden="true">
        {art ? <MedicineIllustration dosageForm={art} size={28} /> : <Icon size={23} strokeWidth={2.1} />}
      </span>
      <em>{label}</em>
      <strong className="kpi-figure">{value}</strong>
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
      .catch((caught: unknown) => setError(formatUserError(caught, t('apiError'))));
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
