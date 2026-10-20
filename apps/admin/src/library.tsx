import { useEffect, useState } from 'react';
import { api } from './api';
import { tx, usePlatformLang } from './locale';

type MedicinePage = { total: number; rows: Medicine[] };

type Medicine = {
  code: string;
  nameAr: string;
  nameEn: string;
  genericName: string;
  strength: string;
  form: string;
  manufacturer: string;
  ingredients: string;
  categoryAr: string;
  categoryEn: string;
  atcCode: string;
};

const FORMS = [
  'TABLET', 'FILM_TABLET', 'CAPSULE', 'EFFERVESCENT', 'SYRUP', 'SUSPENSION', 'ORAL_SOLUTION', 'ORAL_DROPS',
  'EYE_DROPS', 'EAR_DROPS', 'NASAL', 'AMPOULE', 'VIAL', 'SYRINGE', 'INFUSION', 'CREAM', 'OINTMENT', 'GEL',
  'LOTION', 'INHALER', 'NEBULISER', 'SUPPOSITORY', 'PESSARY', 'PATCH', 'POWDER', 'SACHET', 'LOZENGE',
  'SUPPLEMENT', 'COSMETIC', 'CONSUMABLE', 'DEVICE',
];

const CATEGORIES: [string, string, string][] = [
  ['A', 'الجهاز الهضمي', 'Alimentary'],
  ['B', 'الدم', 'Blood'],
  ['C', 'القلب', 'Heart'],
  ['D', 'الجلد', 'Skin'],
  ['G', 'التناسلي', 'Genito-urinary'],
  ['H', 'الهرمونات', 'Hormones'],
  ['J', 'مضادات العدوى', 'Antiinfectives'],
  ['L', 'الأورام', 'Cancer'],
  ['M', 'العضلات والمفاصل', 'Musculo-skeletal'],
  ['N', 'الأعصاب', 'Nervous system'],
  ['P', 'الطفيليات', 'Antiparasitic'],
  ['R', 'التنفس', 'Respiratory'],
  ['S', 'الحواس', 'Sensory'],
  ['V', 'متفرقات', 'Various'],
];

export function LibraryPage() {
  const { lang } = usePlatformLang();
  const [rows, setRows] = useState<MedicinePage | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState('');
  const [category, setCategory] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setError('');
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (form) params.set('form', form);
    if (category) params.set('category', category);
    const query = params.toString();
    api<MedicinePage>(`/api/v1/platform/medicines${query ? `?${query}` : ''}`)
      .then((body) => {
        if (live) setRows(body);
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : 'تعذر التحميل');
      });
    return () => {
      live = false;
    };
  }, [q, form, category, tick]);

  async function download(mode: 'download' | 'update') {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ created: number; updated: number; total: number; withArabic: number; categories: number; forms: number }>(
        '/api/v1/platform/medicines/download',
        { method: 'POST', body: JSON.stringify({ mode }) },
      );
      setNote(
        mode === 'update'
          ? tx(
              lang,
              `تم تحديث ${result.updated} صنفاً موجوداً، وأُضيف ${result.created}. الدليل المرجعي ${result.total} اسماً علمياً.`,
              `Updated ${result.updated} existing items and added ${result.created}. The reference library has ${result.total} scientific names.`,
            )
          : tx(
              lang,
              `أُضيف ${result.created} صنفاً جديداً. الدليل المرجعي ${result.total} اسماً علمياً، منها ${result.withArabic} بالعربي، في ${result.categories} فئة و${result.forms} شكلاً.`,
              `Added ${result.created} new items. The reference library has ${result.total} scientific names, ${result.withArabic} of them in Arabic, across ${result.categories} categories and ${result.forms} forms.`,
            ),
      );
      setTick((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tx(lang, 'تعذر التنزيل', 'Download failed'));
    } finally {
      setBusy(false);
    }
  }

  const list = rows?.rows ?? [];
  const total = rows?.total ?? 0;
  return (
    <section>
      <div className="page-head">
        <p>
          {tx(
            lang,
            'تنزيل يضيف أصنافاً جديدة للدليل العالمي. تحديث ينعش الأسماء الموجودة.',
            'Download adds new items to the global library. Update refreshes names already there.',
          )}
        </p>
      </div>
      <div className="tools">
        <button type="button" disabled={busy} onClick={() => void download('download')}>
          {busy ? tx(lang, 'جار العمل…', 'Working…') : tx(lang, 'تنزيل الأصناف الجديدة', 'Download new items')}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void download('update')}>
          {tx(lang, 'تحديث الأصناف الموجودة', 'Update existing items')}
        </button>
        <input value={q} placeholder={tx(lang, 'بحث بالاسم العلمي أو الشركة أو المكون', 'Scientific name, manufacturer, or ingredient')} onChange={(event) => setQ(event.target.value)} />
        <select value={form} onChange={(event) => setForm(event.target.value)}>
          <option value="">{tx(lang, 'كل الأشكال', 'All forms')}</option>
          {FORMS.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">{tx(lang, 'كل الفئات', 'All categories')}</option>
          {CATEGORIES.map(([code, ar, en]) => <option key={code} value={code}>{tx(lang, ar, en)}</option>)}
        </select>
      </div>
      {note ? <p>{note}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {rows === null && !error ? <p>{tx(lang, 'جار التحميل…', 'Loading…')}</p> : null}
      {rows && list.length === 0 ? <p>{tx(lang, 'لا توجد نتائج. نزّل الدليل أولاً.', 'Nothing matched. Download the library first.')}</p> : null}
      {rows && total > list.length ? <p>{tx(lang, `عرض ${list.length} من ${total}. ضيّق البحث لرؤية البقية.`, `Showing ${list.length} of ${total}. Narrow the search to see the rest.`)}</p> : null}
      {list.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>{tx(lang, 'الصنف', 'Item')}</th>
              <th>{tx(lang, 'الاسم العلمي', 'Scientific name')}</th>
              <th>{tx(lang, 'الجرعة', 'Dose')}</th>
              <th>{tx(lang, 'الشكل', 'Form')}</th>
              <th>{tx(lang, 'الشركة', 'Manufacturer')}</th>
              <th>{tx(lang, 'المكونات', 'Ingredients')}</th>
              <th>{tx(lang, 'الفئة', 'Category')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.code}>
                <td>{tx(lang, row.nameAr, row.nameEn)}</td>
                <td>{row.genericName}</td>
                <td>{row.strength}</td>
                <td>{row.form}</td>
                <td>{row.manufacturer}</td>
                <td>{row.ingredients}</td>
                <td>{tx(lang, row.categoryAr, row.categoryEn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
