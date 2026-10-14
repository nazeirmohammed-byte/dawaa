import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatKhartoum } from './locale';
import { api, type ReceiptPreview } from './api';
import { THERMAL_WIDTH_MM } from './paper';
import { useUi } from './ui';

export function ReceiptPage() {
  const { t } = useTranslation();
  const [receipt, setReceipt] = useState<ReceiptPreview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ReceiptPreview>('/api/v1/receipts/preview')
      .then(setReceipt)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('empty')));
  }, [t]);

  if (error) return <div className="error">{error}</div>;
  if (!receipt) return <p>{t('working')}</p>;

  return (
    <div>
      <div className="desk-actions">
        <Link className="ghost" to="/app" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none', padding: '0 16px' }}>
          {t('back')}
        </Link>
        <button className="primary" type="button" style={{ width: 'auto' }} onClick={() => window.print()}>
          {t('print')}
        </button>
      </div>
      <div className="desk">
        <p style={{ color: '#d7efe4', margin: 0 }}>{t('paper')}</p>
        <ReceiptSlip receipt={receipt} />
      </div>
    </div>
  );
}

export function ReceiptSlip({ receipt }: { receipt: ReceiptPreview }) {
  const { t } = useTranslation();
  const ui = useUi();
  const arabic = ui.language.startsWith('ar');
  return (
    <article className="receipt" style={{ width: `${THERMAL_WIDTH_MM}mm` }}>
      <h2>{arabic ? receipt.pharmacyAr : receipt.pharmacyEn || receipt.pharmacyAr}</h2>
      <p className="en">{arabic ? receipt.pharmacyEn : receipt.pharmacyAr}</p>
      <p>{arabic ? receipt.branchAr : receipt.branchEn || receipt.branchAr}</p>
      <p>
        {t('phone')}: {receipt.phone}
      </p>
      <hr />
      <p>
        {t('invoice')} {receipt.receiptNo}
      </p>
      <p>{formatKhartoum(receipt.soldAt, ui.language)}</p>
      <p>
        {t('cashier')}: {receipt.cashierName}
      </p>
      <hr />
      <table>
        <tbody>
          {receipt.lines.map((line) => (
            <tr key={`${line.nameAr}-${line.qty}`}>
              <td>
                {arabic ? line.nameAr : line.nameEn}
                <br />
                {line.qty} {arabic ? line.unitAr : line.unitEn} × {line.price}
              </td>
              <td className="num">{line.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <div className="totals">
        <div>
          <span>{t('subtotal')}</span>
          <span>{receipt.subtotal}</span>
        </div>
        <div>
          <span>{t('discount')}</span>
          <span>{receipt.discount}</span>
        </div>
        <div className="grand">
          <span>{t('total')}</span>
          <span>{receipt.total}</span>
        </div>
        <div>
          <span>{t('paid')}</span>
          <span>{receipt.paid}</span>
        </div>
        <div>
          <span>{t('change')}</span>
          <span>{receipt.changeDue}</span>
        </div>
      </div>
      <hr />
      <p>{t('thanks')}</p>
    </article>
  );
}
