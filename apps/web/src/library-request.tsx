import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, formatUserError } from './api';
import { useUi } from './ui';

export function LibraryRequest({ query }: { query: string }) {
  const { t } = useTranslation();
  const ui = useUi();
  const seed = query.trim();
  const [form, setForm] = useState({
    nameAr: /[\u0600-\u06FF]/.test(seed) ? seed : '',
    nameEn: /[\u0600-\u06FF]/.test(seed) ? '' : seed,
    genericName: '',
    manufacturer: '',
    strength: '',
    packaging: '',
    barcode: '',
    note: '',
    itemKind: 'BRAND' as 'BRAND' | 'GENERIC',
  });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nameAr = form.nameAr.trim() || form.nameEn.trim();
    const nameEn = form.nameEn.trim() || form.nameAr.trim();
    const genericName = form.genericName.trim() || (form.itemKind === 'GENERIC' ? nameEn : nameEn);
    setError('');
    try {
      await api('/api/v1/ops/catalog/requests', {
        method: 'POST',
        body: JSON.stringify({
          nameAr,
          nameEn,
          genericName,
          manufacturer: form.manufacturer,
          strength: form.strength,
          packaging: form.packaging,
          barcode: form.barcode,
          note: form.note,
          itemKind: form.itemKind,
          itemType: 'Medicine',
        }),
      });
      setSent(true);
      ui.push({ tone: 'ok', title: t('saved'), body: t('askItem') });
    } catch (caught) {
      setError(formatUserError(caught, t('apiError')));
    }
  }

  if (sent) return <p className="lede">{t('askItem')}</p>;

  return (
    <form className="ask-more" onSubmit={(event) => void submit(event)}>
      <p className="lede">{t('productMissing')}</p>
      <div className="modal-fields">
        <label className="field">
          <span>{t('itemKind')}</span>
          <select value={form.itemKind} onChange={(event) => setForm({ ...form, itemKind: event.target.value === 'GENERIC' ? 'GENERIC' : 'BRAND' })}>
            <option value="BRAND">{t('brand')}</option>
            <option value="GENERIC">{t('generic')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('nameAr')}</span>
          <input value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('nameEn')}</span>
          <input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('generic')}</span>
          <input value={form.genericName} onChange={(event) => setForm({ ...form, genericName: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('manufacturer')}</span>
          <input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('strength')}</span>
          <input value={form.strength} onChange={(event) => setForm({ ...form, strength: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('packaging')}</span>
          <input value={form.packaging} onChange={(event) => setForm({ ...form, packaging: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('barcode')}</span>
          <input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} />
        </label>
        <label className="field span-2">
          <span>{t('supportingNote')}</span>
          <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
        </label>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button className="ghost" type="submit">{t('sendRequest')}</button>
    </form>
  );
}
