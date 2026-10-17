import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { parseGs1 } from './expiry';
import { formatMoney } from './locale';
import { useUi } from './ui';

export type Stocking = {
  pendingReceipts: number;
  receivedLines: number;
  awaitingPosting: number;
  fullyStocked: number;
  pendingQty: number;
  availableQty: number;
  newlyStocked: number;
};

type Place = { code: string; kind: string; nameAr: string; nameEn: string };

type PendingLine = {
  receiptLineId: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  strength: string;
  form: string;
  pack: string;
  barcode: string;
  supplierAr: string;
  supplierEn: string;
  purchaseDoc: string;
  receiptDoc: string;
  batchNo: string;
  expiry: string;
  receivedQty: number;
  postedQty: number;
  available: number;
  unitCost: string;
  sellPrice: string;
  location: string;
  storage: 'COLD' | 'CONTROLLED' | 'NORMAL';
};

type StockDesk = {
  docNo: string;
  status: string;
  date: string;
  branchAr: string;
  branchEn: string;
  receiver: string;
  locations: Place[];
  lines: PendingLine[];
  selected: { receiptLineId: string; qty: number; location: string }[];
};

type Pick = { on: boolean; qty: number; location: string };

const KEY = 'dawaa.inventoryEntry';

function clientKey(): string {
  const stored = sessionStorage.getItem(KEY);
  if (stored) return stored;
  const next = crypto.randomUUID();
  sessionStorage.setItem(KEY, next);
  return next;
}

export function clearInventoryDraft(): void {
  sessionStorage.removeItem(KEY);
}

function count(value: number, language: string): string {
  return value.toLocaleString(language.startsWith('ar') ? 'ar' : 'en');
}

export function StockPostDialog({
  seed,
  onClose,
  onPosted,
}: {
  seed: string;
  onClose: () => void;
  onPosted: (docNo: string, quantity: number) => void;
}) {
  const { t } = useTranslation();
  const ui = useUi();
  const [desk, setDesk] = useState<StockDesk | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [query, setQuery] = useState(seed);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const arabic = ui.language.startsWith('ar');

  useEffect(() => {
    let cancel = false;
    async function load(key: string) {
      const body = await api<StockDesk>('/api/v1/ops/stock/entries/open', {
        method: 'POST',
        body: JSON.stringify({ clientKey: key }),
      });
      if (body.status === 'POSTED') {
        clearInventoryDraft();
        return load(clientKey());
      }
      return body;
    }
    load(clientKey())
      .then((body) => {
        if (cancel) return;
        setDesk(body);
        const next: Record<string, Pick> = {};
        for (const line of body.lines) {
          const saved = body.selected.find((row) => row.receiptLineId === line.receiptLineId);
          next[line.receiptLineId] = {
            on: Boolean(saved),
            qty: Math.min(line.available, saved?.qty ?? line.available),
            location: saved?.location || line.location,
          };
        }
        setPicks(next);
        if (seed.trim()) applySeed(body, next, seed.trim());
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : t('empty'));
      });
    return () => {
      cancel = true;
    };
  }, [seed, t]);

  function applySeed(body: StockDesk, current: Record<string, Pick>, raw: string) {
    const place = body.locations.find(
      (item) => item.code.toLowerCase() === raw.toLowerCase() || item.nameEn.toLowerCase() === raw.toLowerCase() || item.nameAr === raw,
    );
    if (place) {
      const copy = { ...current };
      for (const id of Object.keys(copy)) copy[id] = { ...copy[id], location: place.code };
      setPicks(copy);
      return;
    }
    const parsed = parseGs1(raw);
    const code = (parsed?.gtin ?? raw).trim();
    const hit = body.lines.find((line) => line.barcode === code || line.sku === code || line.batchNo === raw);
    if (!hit) return;
    setPicks({ ...current, [hit.receiptLineId]: { ...(current[hit.receiptLineId] as Pick), on: true } });
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (desk?.lines ?? []).filter((line) => {
      if (!needle) return true;
      return [line.nameAr, line.nameEn, line.sku, line.barcode, line.batchNo, line.purchaseDoc, line.receiptDoc, line.supplierAr, line.supplierEn]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [desk, query]);

  const chosen = (desk?.lines ?? []).filter((line) => picks[line.receiptLineId]?.on);
  const allOn = shown.length > 0 && shown.every((line) => picks[line.receiptLineId]?.on);

  function placeName(code: string): string {
    const place = desk?.locations.find((item) => item.code === code);
    if (!place) return code;
    return arabic ? place.nameAr : place.nameEn;
  }

  function scan(raw: string) {
    if (!desk) return;
    const text = raw.trim();
    if (!text) return;
    const place = desk.locations.find(
      (item) => item.code.toLowerCase() === text.toLowerCase() || item.nameEn.toLowerCase() === text.toLowerCase() || item.nameAr === text,
    );
    if (place) {
      setPicks((current) => {
        const next = { ...current };
        const marked = Object.entries(next).filter(([, pick]) => pick.on).map(([id]) => id);
        const ids = marked.length > 0 ? marked : shown.map((line) => line.receiptLineId);
        for (const id of ids) {
          if (next[id]) next[id] = { ...next[id], location: place.code };
        }
        return next;
      });
      setQuery('');
      return;
    }
    const parsed = parseGs1(text);
    const code = (parsed?.gtin ?? text).trim();
    const hit = desk.lines.find((line) => line.barcode === code || line.sku === code || line.batchNo === text);
    if (!hit) {
      setQuery(text);
      return;
    }
    setPicks((current) => ({
      ...current,
      [hit.receiptLineId]: { ...(current[hit.receiptLineId] as Pick), on: true },
    }));
    setQuery('');
  }

  async function save(post: boolean) {
    if (!desk) return;
    const lines = chosen
      .map((line) => {
        const pick = picks[line.receiptLineId];
        return pick ? { receiptLineId: line.receiptLineId, qty: Math.min(line.available, pick.qty), location: pick.location } : null;
      })
      .filter((line): line is { receiptLineId: string; qty: number; location: string } => Boolean(line && line.qty > 0));
    if (post && lines.length === 0) {
      setError(t('invPick'));
      return;
    }
    setSaving(post ? t('receiptSaving') : t('saveDraft'));
    setError('');
    try {
      const result = await api<{ docNo: string; status: string; quantity: number; warnings: string[] }>('/api/v1/ops/stock/entries', {
        method: 'POST',
        body: JSON.stringify({ clientKey: clientKey(), post, lines }),
      });
      if (!post) {
        ui.push({ tone: 'info', title: t('saved'), body: t('invDraftOk', { doc: result.docNo }) });
        setDesk({ ...desk, docNo: result.docNo, status: result.status });
        return;
      }
      clearInventoryDraft();
      onPosted(result.docNo, result.quantity);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('empty'));
      try {
        const fresh = await api<StockDesk>(`/api/v1/ops/stock/pending?clientKey=${encodeURIComponent(clientKey())}`);
        setDesk((current) => (current ? { ...current, lines: fresh.lines, locations: fresh.locations } : fresh));
      } catch {
        /* keep the selection the user already made */
      }
    } finally {
      setSaving('');
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal pack-modal entry-modal stock-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void save(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            void save(true);
          }
        }}
      >
        <div className="pack-scroll">
          <div className="entry-top">
            <h2>{t('invNew')}</h2>
            <button className="ghost" type="button" onClick={onClose}>
              {t('entryClose')}
            </button>
          </div>
          <div className="inv-head">
            <label className="field">
              <span>{t('invRef')}</span>
              <input readOnly value={desk?.docNo ?? '…'} />
            </label>
            <label className="field">
              <span>{t('invDate')}</span>
              <input readOnly value={desk?.date ?? ''} />
            </label>
            <label className="field">
              <span>{t('invBranch')}</span>
              <input readOnly value={desk ? (arabic ? desk.branchAr : desk.branchEn) : ''} />
            </label>
            <label className="field">
              <span>{t('invUser')}</span>
              <input readOnly value={desk?.receiver ?? ''} />
            </label>
          </div>
          <label className="field">
            <span>{t('invScan')}</span>
            <input
              value={query}
              autoFocus
              placeholder={t('invSearch')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                scan(event.currentTarget.value);
              }}
            />
          </label>
          {!desk ? <p className="lede">{t('working')}</p> : null}
          {desk && shown.length === 0 ? <p className="lede">{t('invNone')}</p> : null}
          {shown.length > 0 ? (
            <div className="sheet stock-scroll">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allOn}
                        aria-label={t('invSelectAll')}
                        onChange={(event) => {
                          const on = event.target.checked;
                          setPicks((current) => {
                            const next = { ...current };
                            for (const line of shown) {
                              if (next[line.receiptLineId]) next[line.receiptLineId] = { ...next[line.receiptLineId], on };
                            }
                            return next;
                          });
                        }}
                      />
                    </th>
                    <th>{t('entryMedicine')}</th>
                    <th>{t('procurement')}</th>
                    <th>{t('invReceived')}</th>
                    <th>{t('invAvailable')}</th>
                    <th>{t('mfrBatch')}</th>
                    <th>{t('location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((line) => {
                    const pick = picks[line.receiptLineId];
                    const cold = line.storage === 'COLD' && pick?.location !== 'FRIDGE';
                    const controlled = line.storage === 'CONTROLLED' && pick?.location !== 'CONTROLLED';
                    return (
                      <tr key={line.receiptLineId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(pick?.on)}
                            aria-label={arabic ? line.nameAr : line.nameEn}
                            onChange={(event) =>
                              setPicks((current) => ({
                                ...current,
                                [line.receiptLineId]: { ...(current[line.receiptLineId] as Pick), on: event.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <strong>{arabic ? line.nameAr : line.nameEn}</strong>
                          <small>
                            {line.strength} · {line.form}
                            {line.pack && line.pack !== 'BASE' ? ` · ${line.pack}` : ''}
                            {line.barcode ? ` · ${line.barcode}` : ''}
                          </small>
                          <small>
                            {formatMoney(line.unitCost)} / {formatMoney(line.sellPrice || '0.00')} {t('sdg')}
                          </small>
                        </td>
                        <td>
                          <strong>{line.purchaseDoc}</strong>
                          <small>{line.receiptDoc}</small>
                          <small>{arabic ? line.supplierAr : line.supplierEn}</small>
                        </td>
                        <td>{count(line.receivedQty, ui.language)}</td>
                        <td>
                          {count(line.available, ui.language)}
                          {pick?.on ? (
                            <input
                              inputMode="numeric"
                              aria-label={t('invQty')}
                              value={String(pick.qty)}
                              onChange={(event) => {
                                const qty = Math.max(1, Math.min(line.available, Number(event.target.value.replace(/\D/g, '')) || 1));
                                setPicks((current) => ({
                                  ...current,
                                  [line.receiptLineId]: { ...(current[line.receiptLineId] as Pick), qty },
                                }));
                              }}
                            />
                          ) : null}
                          {line.postedQty > 0 ? <small>{t('invPostedPart', { count: count(line.postedQty, ui.language) })}</small> : null}
                        </td>
                        <td>
                          {line.batchNo}
                          <small>{line.expiry}</small>
                        </td>
                        <td>
                          <select
                            aria-label={t('location')}
                            value={pick?.location ?? line.location}
                            onChange={(event) =>
                              setPicks((current) => ({
                                ...current,
                                [line.receiptLineId]: { ...(current[line.receiptLineId] as Pick), location: event.target.value },
                              }))
                            }
                          >
                            {desk?.locations.map((place) => (
                              <option key={place.code} value={place.code}>
                                {place.code} · {arabic ? place.nameAr : place.nameEn}
                              </option>
                            ))}
                          </select>
                          {cold || controlled ? <small>{t('invPlaceWarn', { place: placeName(line.storage === 'COLD' ? 'FRIDGE' : 'CONTROLLED') })}</small> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="pack-bar">
          <p className="pack-total">{t('invChosen', { count: count(chosen.length, ui.language) })}</p>
          <button className="ghost" type="button" disabled={Boolean(saving) || !desk} onClick={() => void save(false)}>
            {t('saveDraft')}
          </button>
          <button className="primary" type="submit" disabled={Boolean(saving) || chosen.length === 0}>
            {saving || t('saveClose')}
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
