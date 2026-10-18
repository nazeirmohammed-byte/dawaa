import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, formatUserError } from './api';
import { useUi } from './ui';

type Column = { key: string; labelAr: string; labelEn: string; kind: string };
type Table = {
  kind: string;
  titleAr: string;
  titleEn: string;
  phone: string;
  accountCode: string;
  from: string;
  to: string;
  generatedAt: string;
  columns: Column[];
  rows: Record<string, string | number>[];
  total: string;
  rowCount: number;
};

const KINDS = [
  ['sales', 'فواتير المبيعات', 'Sales invoices'],
  ['sales-items', 'المبيعات حسب الصنف', 'Sales by item'],
  ['payments', 'طرق الدفع', 'Payment methods'],
  ['stock', 'أرصدة المخزون', 'Stock balances'],
  ['low-stock', 'النواقص', 'Low stock'],
  ['expiry', 'قرب انتهاء الصلاحية', 'Near expiry'],
  ['valuation', 'تقييم المخزون', 'Stock valuation'],
  ['movements', 'حركات المخزون', 'Stock movements'],
  ['purchases', 'أوامر الشراء', 'Purchase orders'],
  ['receipts', 'استلام الموردين', 'Supplier receipts'],
  ['customers', 'أرصدة العملاء', 'Customer balances'],
  ['suppliers', 'أرصدة الموردين', 'Supplier balances'],
  ['prices', 'تاريخ الأسعار', 'Price history'],
  ['profit', 'الهامش', 'Margin'],
] as const;

export function ReportsHub() {
  const { t } = useTranslation();
  const ui = useUi();
  const arabic = ui.language.startsWith('ar');
  const [kind, setKind] = useState('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Table | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load(nextKind = kind, nextFrom = from, nextTo = to) {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ kind: nextKind });
    if (nextFrom) query.set('from', nextFrom);
    if (nextTo) query.set('to', nextTo);
    api<Table>(`/api/v1/ops/reports/table?${query}`)
      .then(setData)
      .catch((caught: unknown) => setError(formatUserError(caught, t('apiError'))))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    load();
  }

  function printPdf() {
    if (!data) return;
    const title = arabic ? data.titleAr : data.titleEn;
    const heads = data.columns.map((column) => `<th>${arabic ? column.labelAr : column.labelEn}</th>`).join('');
    const body = data.rows
      .map((row) => `<tr>${data.columns.map((column) => `<td>${row[column.key] ?? ''}</td>`).join('')}</tr>`)
      .join('');
    const popup = window.open('', '_blank', 'noopener,width=960,height=720');
    if (!popup) return;
    popup.document.write(`<!doctype html><html lang="${arabic ? 'ar' : 'en'}" dir="${arabic ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${title}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: "IBM Plex Sans Arabic", Tahoma, sans-serif; color: #123; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        p { margin: 0 0 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #c9d6d1; padding: 6px; font-size: 12px; }
        th { background: #e7f3ee; }
        td:last-child, th:last-child { text-align: end; }
        thead { display: table-header-group; }
      </style></head><body>
      <h1>${title}</h1>
      <p>${data.accountCode} · ${data.phone}</p>
      <p>${data.from} — ${data.to}</p>
      <p>${data.generatedAt}</p>
      <p>${t('demoPrices')}</p>
      <table><thead><tr>${heads}</tr></thead><tbody>${body}</tbody>
      <tfoot><tr><td colspan="${Math.max(1, data.columns.length - 1)}">${t('total')}</td><td>${data.total}</td></tr></tfoot></table>
      </body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function excel() {
    const query = new URLSearchParams({ kind });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    window.location.assign(`/api/v1/ops/reports/export.xlsx?${query}`);
  }

  return (
    <section className="stack">
      <h2 style={{ margin: 0 }}>{t('reports')}</h2>
      <p className="lede">{t('demoPrices')}</p>
      <form className="tools" onSubmit={submit}>
        <label className="field fit">
          {t('reportKind')}
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map(([code, ar, en]) => (
              <option key={code} value={code}>{arabic ? ar : en}</option>
            ))}
          </select>
        </label>
        <label className="field fit">{t('fromDate')}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="field fit">{t('toDate')}<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="primary" type="submit">{t('enter')}</button>
        <button type="button" onClick={printPdf} disabled={!data}>{t('exportPdf')}</button>
        <button type="button" onClick={excel} disabled={!data}>{t('exportExcel')}</button>
      </form>
      {loading ? <p>{arabic ? 'جار التحميل…' : 'Loading…'}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {data && data.rows.length === 0 ? <p>{t('empty')}</p> : null}
      {data && data.rows.length > 0 ? (
        <div className="sheet">
          <table>
            <thead>
              <tr>
                {data.columns.map((column) => <th key={column.key}>{arabic ? column.labelAr : column.labelEn}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={index}>
                  {data.columns.map((column) => <td key={column.key}>{String(row[column.key] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p><b>{t('total')}</b> {data.total} · {data.rowCount}</p>
        </div>
      ) : null}
    </section>
  );
}
