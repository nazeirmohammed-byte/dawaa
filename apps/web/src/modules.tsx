import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type HomeBoard } from './api';
import { defaultShelfExpiry, expiryTone, parseGs1 } from './expiry';
import { formatKhartoum, formatMoney, sumAmounts } from './locale';
import { useUi } from './ui';

type Named = { id: string; nameAr: string; nameEn: string };

function plainMedicineName(value: string): string {
  let name = value.normalize('NFKC').trim();
  if (!name) return value;
  name = name.replace(/\s*\[(?:\+|\-|−|–|±)\]/g, ' ');
  name = name.replace(/\s*\[[^\[\]()]{0,48}\]$/g, '');
  let guard = 0;
  while (name.startsWith('((') && name.endsWith(')') && guard++ < 4) name = name.slice(1, -1).trim();
  guard = 0;
  while (guard++ < 6) {
    const next = name.replace(/^\(([^)]{1,24})\)\s*-?\s*/u, (full, inner) => (/^[+\-−–±/0-9,RSrsEZezab]+$/.test(inner) ? '' : full)).replace(/^[+\-−–]\s*/u, '');
    if (next === name) break;
    name = next.trim();
  }
  name = name.replace(/-\((?:[+\-−–±]|[RSrs]{1,2})\)-?/gu, '-');
  name = name.replace(/\s*\([^)]*(?:isomer|wikidata|according to|WHO INN)[^)]*\)$/i, '');
  name = name.replace(/--+/g, '-').replace(/\s{2,}/g, ' ').replace(/^[-–−+\s]+/u, '').trim();
  if (/^[a-z]/.test(name)) name = name[0].toUpperCase() + name.slice(1);
  return name || value.trim();
}

function label(row: { nameAr: string; nameEn: string }, language: string): string {
  return plainMedicineName(language.startsWith('ar') ? row.nameAr : row.nameEn);
}

function ExpiryCell({ iso }: { iso: string | null }) {
  const tone = expiryTone(iso);
  if (!iso || !tone) return <td />;
  return (
    <td>
      <span className={`exp exp-${tone}`}>
        {tone === 'bad' ? <span aria-hidden="true">🔒</span> : null}
        {iso.slice(0, 10)}
      </span>
    </td>
  );
}

function useData<T>(path: string, reloadKey: number) {
  const { t } = useTranslation();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    api<T>(path)
      .then((body) => {
        if (live) setData(body);
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : t('empty'));
      });
    return () => {
      live = false;
    };
  }, [path, reloadKey, t]);
  return { data, error };
}

function Page({ title, error, children }: { title: string; error: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {error ? <div className="error">{error}</div> : null}
      {children}
    </section>
  );
}

type PackKind = 'BOX' | 'STRIP' | 'BOTTLE' | 'PIECE';
type InnerKind = 'STRIP' | 'BOTTLE' | 'PIECE';

type EntryLine = {
  key: string;
  productId: string;
  code: string;
  name: string;
  detail: string;
  packText: string;
  qty: number;
  bonusQty: number;
  batchNo: string;
  manufacturedAt: string;
  expiry: string;
  serialNo: string;
  unitCost: string;
  sellPrice: string;
  location: string;
  unitCode: string;
  trackSerial: boolean;
};

type EntryDraft = {
  productId: string;
  code: string;
  name: string;
  detail: string;
  trackSerial: boolean;
  unitCost: string;
  sellPrice: string;
  outer: PackKind;
  count: number;
  inner: InnerKind;
  perBox: number;
  perInner: number;
  location: string;
  expiry: string;
  estimated: boolean;
  batchNo: string;
  manufacturedAt: string;
  serialNo: string;
  bonusQty: number;
  more: boolean;
  storage: string;
  suggested: 'رف' | 'ثلاجة' | 'مخزن';
};

const PACK_WORD: Record<PackKind, 'packBox' | 'packStrip' | 'packBottle' | 'packPiece'> = {
  BOX: 'packBox',
  STRIP: 'packStrip',
  BOTTLE: 'packBottle',
  PIECE: 'packPiece',
};

function blankDraft(): EntryDraft {
  return {
    productId: '',
    code: '',
    name: '',
    detail: '',
    trackSerial: false,
    unitCost: '0.00',
    sellPrice: '',
    outer: 'BOX',
    count: 1,
    inner: 'STRIP',
    perBox: 10,
    perInner: 10,
    location: 'رف',
    expiry: defaultShelfExpiry(),
    estimated: true,
    batchNo: 'OPEN',
    manufacturedAt: '',
    serialNo: '',
    bonusQty: 0,
    more: false,
    storage: '',
    suggested: 'رف',
  };
}

function countOf(raw: string, min: number): number {
  const digits = raw.replace(/\D/g, '');
  const value = digits ? Number(digits) : min;
  if (!Number.isFinite(value)) return min;
  return Math.min(1_000_000, Math.max(min, Math.floor(value)));
}

function piecesOf(draft: EntryDraft): number {
  if (draft.outer === 'PIECE') return draft.count;
  if (draft.outer === 'STRIP' || draft.outer === 'BOTTLE') return draft.count * Math.max(1, draft.perInner);
  if (draft.inner === 'PIECE') return draft.count * Math.max(1, draft.perBox);
  return draft.count * Math.max(1, draft.perBox) * Math.max(1, draft.perInner);
}

function readUnits(raw?: string): Partial<Pick<EntryDraft, 'outer' | 'inner' | 'perBox' | 'perInner'>> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const box = Number(data.box);
    const strip = Number(data.strip);
    const bottle = Number(data.bottle);
    if (box > 1 && strip > 0) return { outer: 'BOX', inner: 'STRIP', perBox: box, perInner: Math.max(1, strip) };
    if (box > 1 && bottle > 0) return { outer: 'BOX', inner: 'BOTTLE', perBox: box, perInner: Math.max(1, bottle) };
    if (strip > 1) return { outer: 'STRIP', perInner: strip };
    if (bottle > 1) return { outer: 'BOTTLE', perInner: bottle };
    if (box > 1) return { outer: 'BOX', inner: 'PIECE', perBox: box };
  } catch {
    return {};
  }
  return {};
}

function showCount(value: number, language: string): string {
  return value.toLocaleString(language.startsWith('ar') ? 'ar' : 'en');
}

function packSentence(draft: EntryDraft, word: (key: 'packBox' | 'packStrip' | 'packBottle' | 'packPiece') => string, language: string): string {
  const n = (value: number) => showCount(value, language);
  if (draft.outer === 'PIECE') return `${n(draft.count)} ${word('packPiece')}`;
  if (draft.outer === 'STRIP') return `${n(draft.count)} ${word('packStrip')} × ${n(draft.perInner)} ${word('packPiece')}`;
  if (draft.outer === 'BOTTLE') return `${n(draft.count)} ${word('packBottle')} × ${n(draft.perInner)} ${word('packPiece')}`;
  if (draft.inner === 'PIECE') return `${n(draft.count)} ${word('packBox')} × ${n(draft.perBox)} ${word('packPiece')}`;
  const inner = draft.inner === 'STRIP' ? word('packStrip') : word('packBottle');
  return `${n(draft.count)} ${word('packBox')} × ${n(draft.perBox)} ${inner} × ${n(draft.perInner)} ${word('packPiece')}`;
}

function CountStep({ value, min, onChange }: { value: number; min: number; onChange: (next: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <input inputMode="numeric" value={String(value)} onChange={(event) => onChange(countOf(event.target.value, min))} />
      <button type="button" onClick={() => onChange(Math.min(1_000_000, value + 1))}>
        +
      </button>
    </span>
  );
}

const SHELVES = [
  ['رف', 'shelf'],
  ['ثلاجة', 'fridge'],
  ['مخزن', 'storeRoom'],
] as const;

function placeFor(parts: Array<string | undefined>): 'رف' | 'ثلاجة' | 'مخزن' {
  const text = parts.filter(Boolean).join(' ');
  if (/ثلاج|مبرد|تبريد|لقاح|أنسولين|إنسولين|انسولين|مصل|vaccine|insulin|immunoglobulin|interferon|oxytocin|refriger|cold|2\s*[-–to]+\s*8/i.test(text)) return 'ثلاجة';
  if (/مخزن|جاف|warehouse|dry store/i.test(text)) return 'مخزن';
  return 'رف';
}

function moneyOk(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value);
}

type Product = Named & {
  sku: string;
  categoryId: string;
  genericName: string;
  form: string;
  strength: string;
  reorderLevel: number;
  sellPrice: string;
  costPrice: string;
  qty: number;
  isLocal?: boolean;
  trackSerial?: boolean;
  gtin?: string;
  nearestExpiry: string | null;
  location: string;
};

export function InventoryPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const { data, error } = useData<{ categories: Named[]; products: Product[] }>('/api/v1/ops/inventory', tick);
  const receipts = useData<{
    orders: { id: string; docNo: string; total: string; orderedAt: string; supplierAr: string; supplierEn: string; lines: { qty: number; nameAr: string; nameEn: string }[] }[];
  }>('/api/v1/ops/purchasing', tick);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  const scanWait = useRef(0);
  const scanTicket = useRef(0);
  const [scanCode, setScanCode] = useState('');
  const [flash, setFlash] = useState('');
  const [pick, setPick] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [hits, setHits] = useState<CatalogItem[]>([]);
  const [receipt, setReceipt] = useState<EntryLine[]>([]);
  const [entryOpen, setEntryOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [justAdded, setJustAdded] = useState('');
  const [saving, setSaving] = useState('');
  const findRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const carry = useRef({ expiry: '', location: '' });

  useEffect(() => {
    if (!entryOpen) return;
    const handle = window.setTimeout(() => {
      api<CatalogItem[]>(`/api/v1/ops/catalog?q=${encodeURIComponent(pick.trim())}`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [pick, tick, entryOpen]);

  useEffect(() => {
    if (!entryOpen || !draft) return;
    const handle = window.setTimeout(() => {
      if (draft.code || draft.productId) {
        priceRef.current?.focus();
        priceRef.current?.select();
      } else {
        findRef.current?.focus();
      }
    }, 40);
    return () => window.clearTimeout(handle);
  }, [entryOpen, draft?.code, draft?.productId]);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  function beep(ok: boolean) {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const audio = new Ctx();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.08);
  }

  function openDraft(next: EntryDraft) {
    setDraft(next);
    setDraftNote('');
    setJustAdded('');
    setEntryOpen(true);
    setFlash('ok');
    beep(true);
    window.setTimeout(() => setFlash(''), 400);
    setScanCode('');
  }

  function nextExpiry(parsed: ReturnType<typeof parseGs1>) {
    if (parsed?.expiry) return { expiry: parsed.expiry, estimated: false };
    if (carry.current.expiry) return { expiry: carry.current.expiry, estimated: false };
    return { expiry: defaultShelfExpiry(), estimated: true };
  }

  function nextPlace(suggested: 'رف' | 'ثلاجة' | 'مخزن', known: string) {
    if (suggested === 'ثلاجة') return 'ثلاجة';
    if (carry.current.location && carry.current.location !== 'ثلاجة') return carry.current.location;
    return known;
  }

  function fillProduct(product: Product, parsed: ReturnType<typeof parseGs1>, storage = '') {
    const suggested = placeFor([storage, product.location, product.nameAr, product.nameEn, product.genericName, product.form, product.strength]);
    const known = SHELVES.some(([value]) => value === product.location) ? product.location : suggested;
    openDraft({
      ...blankDraft(),
      outer: 'PIECE',
      count: 1,
      productId: product.id,
      code: product.sku,
      name: label(product, ui.language),
      detail: `${product.strength} · ${product.form}`,
      trackSerial: Boolean(product.trackSerial),
      unitCost: product.costPrice && product.costPrice !== '0.00' ? product.costPrice : '0.00',
      sellPrice: product.sellPrice && product.sellPrice !== '0.00' ? product.sellPrice : '',
      location: nextPlace(suggested, known),
      suggested,
      storage,
      ...nextExpiry(parsed),
      batchNo: parsed?.batch || 'OPEN',
      manufacturedAt: parsed?.manufactured || '',
      serialNo: parsed?.serial || '',
      more: Boolean(parsed?.batch || parsed?.serial || product.trackSerial),
    });
  }

  function fillCatalog(item: CatalogItem, parsed: ReturnType<typeof parseGs1>) {
    const local = data?.products.find((product) => product.sku === item.code || (item.gtin !== '' && product.gtin === item.gtin));
    if (local) {
      fillProduct(local, parsed, item.storageCondition ?? '');
      return;
    }
    const suggested = placeFor([item.storageCondition, item.nameAr, item.nameEn, item.genericName, item.form, item.categoryAr, item.categoryEn]);
    openDraft({
      ...blankDraft(),
      outer: 'PIECE',
      count: 1,
      ...readUnits(item.unitsJson),
      code: item.code,
      name: label(item, ui.language),
      detail: `${item.strength} · ${item.form}`,
      trackSerial: Boolean(item.trackSerial),
      location: nextPlace(suggested, suggested),
      suggested,
      storage: item.storageCondition ?? '',
      ...nextExpiry(parsed),
      batchNo: parsed?.batch || 'OPEN',
      manufacturedAt: parsed?.manufactured || '',
      serialNo: parsed?.serial || '',
      more: Boolean(parsed?.batch || parsed?.serial || item.trackSerial),
    });
  }

  async function takeScan(raw: string) {
    const parsed = parseGs1(raw);
    const code = (parsed?.gtin ?? raw).trim();
    if (!code) return;
    const product = data?.products.find((item) => item.sku === code || item.gtin === code);
    if (product) {
      fillProduct(product, parsed);
      return;
    }
    const known = hits.find((item) => item.code === code || item.gtin === code);
    if (known) {
      fillCatalog(known, parsed);
      return;
    }
    try {
      const rows = await api<CatalogItem[]>(`/api/v1/ops/catalog?q=${encodeURIComponent(code)}`);
      const match = rows.find((item) => item.code === code || item.gtin === code);
      if (!match) {
        setFlash('bad');
        beep(false);
        window.setTimeout(() => setFlash(''), 400);
        return;
      }
      setHits(rows);
      fillCatalog(match, parsed);
    } catch {
      setFlash('bad');
      beep(false);
      window.setTimeout(() => setFlash(''), 400);
    }
  }

  function word(key: 'packBox' | 'packStrip' | 'packBottle' | 'packPiece'): string {
    return t(key);
  }

  function commitDraft(keepOpen: boolean) {
    if (!draft || (!draft.code && !draft.productId)) {
      setDraftNote(t('entryPickFirst'));
      return;
    }
    if (!moneyOk(draft.unitCost)) {
      setDraftNote(t('entryCost'));
      return;
    }
    if (!moneyOk(draft.sellPrice)) {
      setDraftNote(t('entryNeedPrice'));
      return;
    }
    if (!draft.expiry) {
      setDraftNote(t('entryNeedExpiry'));
      return;
    }
    if (draft.trackSerial && draft.serialNo.trim() === '') {
      setDraftNote(t('serial'));
      return;
    }
    const qty = piecesOf(draft);
    if (qty < 1 || qty > 1_000_000) {
      setDraftNote(t('entryTooMany'));
      return;
    }
    const line: EntryLine = {
      key: `${draft.code || draft.productId}-${Date.now()}`,
      productId: draft.productId,
      code: draft.code,
      name: draft.name,
      detail: draft.detail,
      packText: packSentence(draft, word, ui.language),
      qty,
      bonusQty: draft.bonusQty,
      batchNo: draft.batchNo || 'OPEN',
      manufacturedAt: draft.manufacturedAt,
      expiry: draft.expiry,
      serialNo: draft.serialNo,
      unitCost: draft.unitCost,
      sellPrice: draft.sellPrice,
      location: draft.location,
      unitCode: draft.outer,
      trackSerial: draft.trackSerial,
    };
    setReceipt((rows) => [...rows, line]);
    carry.current = { expiry: draft.expiry, location: draft.location };
    setDraftNote('');
    if (keepOpen) {
      setJustAdded(draft.name);
      setDraft(blankDraft());
      setPick('');
    } else {
      setJustAdded('');
      setEntryOpen(false);
    }
  }

  const ready = receipt.length > 0 && !saving && receipt.every((line) => line.qty > 0 && line.qty <= 1_000_000 && line.expiry && moneyOk(line.unitCost) && moneyOk(line.sellPrice));
  const pieceTotal = receipt.reduce((sum, line) => sum + line.qty + line.bonusQty, 0);

  async function saveReceipt(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setNote('');
    const pending = [...receipt];
    const saved = new Set<string>();
    let quantity = 0;
    let warnings = 0;
    try {
      for (let index = 0; index < pending.length; index += 100) {
        const chunk = pending.slice(index, index + 100);
        setSaving(t('entrySaving', { done: showCount(index, ui.language), total: showCount(pending.length, ui.language) }));
        const result = await api<{ quantity: number; value: string; warnings: string[] }>('/api/v1/ops/stock/receive', {
          method: 'POST',
          body: JSON.stringify({
            lines: chunk.map((line) => ({
              ...(line.productId ? { productId: line.productId } : { code: line.code }),
              qty: line.qty,
              unitCost: line.unitCost,
              sellPrice: line.sellPrice || undefined,
              batchNo: line.batchNo || 'OPEN',
              expiry: line.expiry,
              location: line.location,
              manufacturedAt: line.manufacturedAt,
              serialNo: line.serialNo,
              bonusQty: line.bonusQty,
              unitCode: line.unitCode,
            })),
          }),
        });
        quantity += result.quantity;
        warnings += result.warnings.length;
        chunk.forEach((line) => saved.add(line.key));
        setReceipt((rows) => rows.filter((row) => !saved.has(row.key)));
      }
      ui.push({
        tone: warnings ? 'watch' : 'info',
        title: t('posted'),
        body: warnings ? t('shortShelf') : showCount(quantity, ui.language),
      });
      setTick((value) => value + 1);
      scanRef.current?.focus();
    } catch (caught: unknown) {
      setNote(caught instanceof Error ? caught.message : t('empty'));
    } finally {
      setSaving('');
    }
  }

  async function adjust(productId: string, qtyDelta: number, name: string) {
    await api('/api/v1/ops/stock/adjust', {
      method: 'POST',
      body: JSON.stringify({ productId, qtyDelta, note: t('note') }),
    });
    ui.push({ tone: 'info', title: t('posted'), body: name });
    setTick((value) => value + 1);
  }

  const needle = pick.trim().toLowerCase();
  const locals = (data?.products ?? [])
    .filter((product) => {
      if (!needle) return true;
      return [product.sku, product.nameAr, product.nameEn, product.genericName, product.gtin ?? '', product.strength, product.form].some((value) =>
        value.toLowerCase().includes(needle),
      );
    })
    .slice(0, needle ? 12 : 8);
  const localKeys = new Set(locals.flatMap((product) => [product.sku, product.gtin ?? '']));
  const library = hits
    .filter((item) => {
      if (localKeys.has(item.code) || (item.gtin && localKeys.has(item.gtin))) return false;
      if (!needle) return true;
      return [item.code, item.nameAr, item.nameEn, item.genericName, item.gtin ?? '', item.strength, item.form].some((value) =>
        value.toLowerCase().includes(needle),
      );
    })
    .slice(0, 24);

  return (
    <Page title={t('inventory')} error={note || error}>
      <form
        className="panel-card entry-card"
        onSubmit={saveReceipt}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            if (!entryOpen) {
              setDraft(blankDraft());
              setDraftNote('');
              setEntryOpen(true);
            } else {
              document.getElementById('stock-find')?.focus();
            }
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}
      >
        <div className="entry-top">
          <h2>{t('receiveStock')}</h2>
          <button
            className="primary fit"
            type="button"
            onClick={() => {
              setDraft(blankDraft());
              setDraftNote('');
              setJustAdded('');
              setPick('');
              setEntryOpen(true);
            }}
          >
            {t('entryAdd')}
          </button>
        </div>
        <div className="entry-find">
          <label className="field">
            <span>{t('scan')}</span>
            <input
              ref={scanRef}
              className={flash === 'ok' ? 'scan-ok' : flash === 'bad' ? 'scan-bad' : ''}
              value={scanCode}
              onChange={(event) => {
                const value = event.target.value;
                setScanCode(value);
                window.clearTimeout(scanWait.current);
                const parsed = parseGs1(value);
                const digits = value.trim();
                if (parsed?.gtin || /^\d{8}$|^\d{12,14}$/.test(digits)) {
                  const ticket = scanTicket.current + 1;
                  scanTicket.current = ticket;
                  scanWait.current = window.setTimeout(() => {
                    if (scanTicket.current === ticket) void takeScan(value);
                  }, 280);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                window.clearTimeout(scanWait.current);
                scanTicket.current += 1;
                void takeScan(event.currentTarget.value);
              }}
            />
          </label>
          <label className="field">
            <span>{t('entrySearch')}</span>
            <input
              value={pick}
              onChange={(event) => {
                setPick(event.target.value);
                if (!entryOpen) {
                  setDraft(blankDraft());
                  setDraftNote('');
                  setEntryOpen(true);
                } else if (draft?.code || draft?.productId) {
                  setDraft(blankDraft());
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const first = locals[0];
                const next = library[0];
                if (first) fillProduct(first, null);
                else if (next) fillCatalog(next, null);
              }}
            />
          </label>
        </div>
        {receipt.length === 0 ? (
          <p className="lede">{t('entryEmpty')}</p>
        ) : (
          <>
            <p className="pack-total">{t('packStored', { count: showCount(pieceTotal, ui.language) })}</p>
            <div className="sheet receipt-mini">
              <table>
                <thead>
                  <tr>
                    <th>{t('entryMedicine')}</th>
                    <th>{t('packHow')}</th>
                    <th>{t('packPiece')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {receipt.map((line) => (
                    <tr key={line.key}>
                      <td>
                        <strong>{line.name}</strong>
                        <small>{line.detail}</small>
                      </td>
                      <td>{line.packText}</td>
                      <td>{showCount(line.qty, ui.language)}</td>
                      <td>
                        <button type="button" className="ghost" onClick={() => setReceipt((rows) => rows.filter((row) => row.key !== line.key))}>
                          {t('entryRemove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <button className="primary" type="submit" disabled={!ready}>
          {saving || t('save')}
        </button>
      </form>
      {entryOpen && draft ? (
        <div className="modal-back" onClick={() => setEntryOpen(false)}>
          <form
            className="modal pack-modal entry-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              commitDraft(true);
            }}
          >
            <div className="pack-scroll">
              <div className="entry-top">
                <h2>{t('entryAdd')}</h2>
                <button className="ghost" type="button" onClick={() => setEntryOpen(false)}>
                  {t('entryClose')}
                </button>
              </div>
              {justAdded && !(draft.code || draft.productId) ? <p className="entry-added">{t('entryAdded', { name: justAdded })}</p> : null}
              {receipt.length > 0 && !(draft.code || draft.productId) ? (
                <p className="lede">
                  {t('entryQueued', { count: showCount(receipt.length, ui.language) })} — {receipt.slice(-4).map((line) => line.name).join(' · ')}
                </p>
              ) : null}
              {draft.code || draft.productId ? (
                <button className="med-row" type="button" onClick={() => setDraft({ ...blankDraft(), location: draft.location })}>
                  <strong>{draft.name}</strong>
                  <small>{draft.detail}</small>
                  <em className="med-tag stock">{t('entryChange')}</em>
                </button>
              ) : (
                <>
                  <label className="field">
                    <span>{t('find')}</span>
                    <input
                      id="stock-find"
                      ref={findRef}
                      value={pick}
                      placeholder={t('entrySearch')}
                      onChange={(event) => setPick(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (locals[0]) fillProduct(locals[0], null);
                        else if (library[0]) fillCatalog(library[0], null);
                      }}
                    />
                  </label>
                  <ul className="med-list">
                    {locals.map((product) => (
                      <li key={product.id}>
                        <button type="button" className="med-row" onClick={() => fillProduct(product, null)}>
                          <strong>{label(product, ui.language)}</strong>
                          <small>
                            {product.strength} · {product.form}
                          </small>
                          <em className="med-tag stock">
                            {t('entryInStock')} · {product.qty}
                          </em>
                        </button>
                      </li>
                    ))}
                    {library.map((item) => (
                      <li key={item.code}>
                        <button type="button" className="med-row" onClick={() => fillCatalog(item, null)}>
                          <strong>{label(item, ui.language)}</strong>
                          <small>
                            {item.strength} · {item.form}
                            {item.gtin ? ` · ${item.gtin}` : ''}
                          </small>
                          <em className="med-tag lib">{t('entryLibrary')}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {locals.length === 0 && library.length === 0 ? <p className="lede">{t('entryNone')}</p> : null}
                </>
              )}
              {draft.code || draft.productId ? (
                <div className="pack-body">
                  <div className="entry-fast">
                    <label className={`field${moneyOk(draft.sellPrice) ? '' : ' bad'}`}>
                      <span>{t('price')}</span>
                      <input
                        ref={priceRef}
                        required
                        inputMode="decimal"
                        value={draft.sellPrice}
                        onChange={(event) => setDraft({ ...draft, sellPrice: event.target.value })}
                      />
                    </label>
                    <label className={`field${moneyOk(draft.unitCost) ? '' : ' bad'}`}>
                      <span>{t('cost')}</span>
                      <input required inputMode="decimal" value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })} />
                    </label>
                    <label className={`field wide${draft.expiry ? '' : ' bad'}`}>
                      <span>{t('expiry')}</span>
                      <input
                        type="date"
                        required
                        value={draft.expiry}
                        onChange={(event) => setDraft({ ...draft, expiry: event.target.value, estimated: false })}
                      />
                      {draft.estimated ? <em className="est">{t('estimated')}</em> : null}
                    </label>
                  </div>
                  <span>{t('location')}</span>
                  <div className="place-picks">
                    {SHELVES.map(([value, key]) => (
                      <button key={value} type="button" className={draft.location === value ? 'on' : ''} onClick={() => setDraft({ ...draft, location: value })}>
                        {t(key)}
                      </button>
                    ))}
                  </div>
                  {draft.suggested === 'ثلاجة' ? <p className="notice">{t('placeCold')}</p> : null}
                  <span>{t('packArrived')}</span>
                  <div className="place-picks">
                    {(['BOX', 'STRIP', 'BOTTLE', 'PIECE'] as PackKind[]).map((kind) => (
                      <button key={kind} type="button" className={draft.outer === kind ? 'on' : ''} onClick={() => setDraft({ ...draft, outer: kind })}>
                        {t(PACK_WORD[kind])}
                      </button>
                    ))}
                  </div>
                  <div className="entry-controls">
                    <span>{t('packHowMany')}</span>
                    <CountStep value={draft.count} min={1} onChange={(count) => setDraft({ ...draft, count })} />
                  </div>
                  <div className="place-picks">
                    {[1, 10, 20, 50, 100, 1000].map((count) => (
                      <button key={count} type="button" className={draft.count === count ? 'on' : ''} onClick={() => setDraft({ ...draft, count })}>
                        {showCount(count, ui.language)}
                      </button>
                    ))}
                  </div>
                  {draft.outer === 'BOX' ? (
                    <>
                      <span>{t('packInside')}</span>
                      <div className="place-picks">
                        {(['STRIP', 'BOTTLE', 'PIECE'] as InnerKind[]).map((kind) => (
                          <button key={kind} type="button" className={draft.inner === kind ? 'on' : ''} onClick={() => setDraft({ ...draft, inner: kind })}>
                            {t(PACK_WORD[kind])}
                          </button>
                        ))}
                      </div>
                      <div className="entry-controls">
                        <span>{t('packEachBox')}</span>
                        <CountStep value={draft.perBox} min={1} onChange={(perBox) => setDraft({ ...draft, perBox })} />
                      </div>
                    </>
                  ) : null}
                  {draft.outer === 'STRIP' || draft.outer === 'BOTTLE' || (draft.outer === 'BOX' && draft.inner !== 'PIECE') ? (
                    <div className="entry-controls">
                      <span>{draft.outer === 'BOTTLE' || draft.inner === 'BOTTLE' ? t('packEachBottle') : t('packEachStrip')}</span>
                      <CountStep value={draft.perInner} min={1} onChange={(perInner) => setDraft({ ...draft, perInner })} />
                    </div>
                  ) : null}
                  <p className="lede">{packSentence(draft, word, ui.language)}</p>
                  <button type="button" className="ghost" onClick={() => setDraft({ ...draft, more: !draft.more })}>
                    {t('entryMore')}
                  </button>
                  {draft.more || draft.trackSerial ? (
                    <div className="entry-money">
                      <label className="field">
                        <span>{t('batch')}</span>
                        <input value={draft.batchNo} onChange={(event) => setDraft({ ...draft, batchNo: event.target.value })} />
                      </label>
                      <label className="field">
                        <span>{t('bonus')}</span>
                        <CountStep value={draft.bonusQty} min={0} onChange={(bonusQty) => setDraft({ ...draft, bonusQty })} />
                      </label>
                      <label className="field">
                        <span>{t('made')}</span>
                        <input type="date" value={draft.manufacturedAt} onChange={(event) => setDraft({ ...draft, manufacturedAt: event.target.value })} />
                      </label>
                      {draft.trackSerial ? (
                        <label className="field">
                          <span>{t('serial')}</span>
                          <input value={draft.serialNo} onChange={(event) => setDraft({ ...draft, serialNo: event.target.value })} />
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  {draftNote ? <p className="error">{draftNote}</p> : null}
                </div>
              ) : null}
            </div>
            {draft.code || draft.productId ? (
              <div className="pack-bar">
                <p className="pack-total">{t('packStored', { count: showCount(piecesOf(draft), ui.language) })}</p>
                <button className="primary fit" type="submit">
                  {t('entryKeep')}
                </button>
                <button className="ghost" type="button" onClick={() => commitDraft(false)}>
                  {t('entryDone')}
                </button>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
      <section className="panel-card">
        <div className="row">
          <h2>{t('fromSupplier')}</h2>
          <Link className="ghost" to="/app/purchasing">
            {t('procurement')}
          </Link>
        </div>
        {receipts.data && receipts.data.orders.length === 0 ? (
          <p className="lede">{t('noSupplierReceipt')}</p>
        ) : receipts.data ? (
          <div className="sheet">
            <table>
              <thead>
                <tr>
                  <th>{t('invoice')}</th>
                  <th>{t('supplier')}</th>
                  <th>{t('buyMedicines')}</th>
                  <th>{t('buyPieces')}</th>
                </tr>
              </thead>
              <tbody>
                {receipts.data?.orders.slice(0, 6).map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.docNo}</strong>
                      <small>{formatKhartoum(order.orderedAt, ui.language)}</small>
                    </td>
                    <td>{label({ nameAr: order.supplierAr, nameEn: order.supplierEn }, ui.language)}</td>
                    <td>{order.lines.map((line) => label(line, ui.language)).join(' · ')}</td>
                    <td>{showCount(order.lines.reduce((sum, line) => sum + line.qty, 0), ui.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <label className="field">
        <span>{t('find')}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('sku')}</th>
              <th>{t('nameAr')}</th>
              <th>{t('qty')}</th>
              <th>{t('expiry')}</th>
              <th>{t('reorder')}</th>
              <th>{t('price')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.products
              .filter((product) => {
                const needle = query.trim().toLowerCase();
                if (!needle) return true;
                return [product.sku, product.nameAr, product.nameEn, product.genericName].some((value) =>
                  value.toLowerCase().includes(needle),
                );
              })
              .map((product) => (
              <tr key={product.id}>
                <td>{product.sku}</td>
                <td>
                  {label(product, ui.language)}
                  {product.isLocal ? <em className="est">{t('localItem')}</em> : null}
                </td>
                <td>{product.qty}</td>
                <ExpiryCell iso={product.nearestExpiry} />
                <td>{product.reorderLevel}</td>
                <td>{product.sellPrice}</td>
                <td>
                  <button type="button" className="ghost" onClick={() => adjust(product.id, 1, label(product, ui.language))}>
                    +1
                  </button>{' '}
                  <button type="button" className="ghost" onClick={() => adjust(product.id, -1, label(product, ui.language))}>
                    −1
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

type SaleBook = {
  products: Product[];
  customers: Named[];
  sales: {
    id: string;
    docNo: string;
    customerName: string;
    cashierName?: string;
    total: string;
    paymentMethod: string;
    soldAt: string;
  }[];
};

export function SalesPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const { data, error } = useData<SaleBook>('/api/v1/ops/sales', 0);
  const pay: Record<string, string> = {
    CASH: t('cash'),
    BANKAK: t('bankak'),
    FAWRY: t('fawry'),
    TRANSFER: t('transfer'),
  };

  return (
    <Page title={t('sales')} error={error}>
      <div className="row">
        <Link className="primary fit" to="/app/pos">
          {t('quickPos')}
        </Link>
      </div>
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('invoice')}</th>
              <th>{t('customer')}</th>
              <th>{t('total')}</th>
              <th>{t('method')}</th>
              <th>{t('users')}</th>
              <th>{t('when')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.sales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.docNo}</td>
                <td>{sale.customerName}</td>
                <td>{formatMoney(sale.total)} {t('sdg')}</td>
                <td>{pay[sale.paymentMethod] ?? sale.paymentMethod}</td>
                <td>{sale.cashierName ?? ''}</td>
                <td>{sale.soldAt ? formatKhartoum(sale.soldAt, ui.language) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

type BuyProduct = Named & {
  sku: string;
  genericName: string;
  form: string;
  strength: string;
  gtin: string;
  costPrice: string;
  sellPrice: string;
  trackSerial: boolean;
};

type PurchaseBook = {
  suppliers: (Named & { balance: string; phone: string | null })[];
  products: BuyProduct[];
  orders: {
    id: string;
    docNo: string;
    total: string;
    orderedAt: string;
    supplierAr: string;
    supplierEn: string;
    status: string;
    lines: { qty: number; lineTotal: string; nameAr: string; nameEn: string }[];
  }[];
};

export function PurchasingPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const word = (key: 'packBox' | 'packStrip' | 'packBottle' | 'packPiece') => t(key);
  const [tick, setTick] = useState(0);
  const { data, error } = useData<PurchaseBook>('/api/v1/ops/purchasing', tick);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [pick, setPick] = useState('');
  const [hits, setHits] = useState<CatalogItem[]>([]);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    if (!open || draft) return;
    const handle = window.setTimeout(() => {
      const q = new URLSearchParams({ q: pick.trim() });
      api<CatalogItem[]>(`/api/v1/ops/catalog?${q}`)
        .then((body) => setHits(Array.isArray(body) ? body : []))
        .catch(() => setHits([]));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [open, draft, pick, tick]);

  const needle = pick.trim().toLowerCase();
  const stockHits = (data?.products ?? [])
    .filter((row) => !needle || `${row.nameAr} ${row.nameEn} ${row.sku} ${row.genericName} ${row.gtin}`.toLowerCase().includes(needle))
    .slice(0, 8);
  const library = hits.filter((item) => !stockHits.some((row) => row.sku === item.code)).filter((item) => {
    if (!needle) return true;
    return `${item.nameAr} ${item.nameEn} ${item.code} ${item.genericName} ${item.gtin} ${item.strength}`.toLowerCase().includes(needle);
  }).slice(0, 12);
  const step = !supplierId ? 1 : lines.length === 0 ? 2 : 3;
  const pieceTotal = lines.reduce((sum, line) => sum + line.qty + line.bonusQty, 0);

  function chooseStock(product: BuyProduct) {
    setDraft({
      ...blankDraft(),
      productId: product.id,
      code: product.sku,
      name: label(product, ui.language),
      detail: `${product.strength} · ${product.form}`,
      unitCost: product.costPrice && product.costPrice !== '0.00' ? product.costPrice : '0.00',
      sellPrice: product.sellPrice && product.sellPrice !== '0.00' ? product.sellPrice : '',
      trackSerial: product.trackSerial,
    });
    setNote('');
  }

  function chooseCatalog(item: CatalogItem) {
    const known = data?.products.find((row) => row.sku === item.code);
    const pack = readUnits(item.unitsJson);
    setDraft({
      ...blankDraft(),
      ...pack,
      productId: known?.id ?? '',
      code: item.code,
      name: label(item, ui.language),
      detail: `${item.strength} · ${item.form}`,
      trackSerial: Boolean(item.trackSerial),
      unitCost: known && known.costPrice !== '0.00' ? known.costPrice : '0.00',
      sellPrice: known && known.sellPrice !== '0.00' ? known.sellPrice : '',
    });
    setNote('');
  }

  function addLine(keepOpen: boolean) {
    if (!draft || (!draft.code && !draft.productId)) {
      setNote(t('entryPickFirst'));
      return;
    }
    if (!moneyOk(draft.unitCost) || (draft.sellPrice !== '' && !moneyOk(draft.sellPrice))) {
      setNote(t('entryCost'));
      return;
    }
    if (draft.trackSerial && draft.serialNo.trim() === '') {
      setNote(t('serial'));
      return;
    }
    const qty = piecesOf(draft);
    if (qty < 1 || qty > 1_000_000) {
      setNote(t('entryTooMany'));
      return;
    }
    setLines((rows) => [
      ...rows,
      {
        key: `${draft.code || draft.productId}-${Date.now()}`,
        productId: draft.productId,
        code: draft.code,
        name: draft.name,
        detail: draft.detail,
        packText: packSentence(draft, word, ui.language),
        qty,
        bonusQty: draft.bonusQty,
        batchNo: draft.batchNo || 'OPEN',
        manufacturedAt: draft.manufacturedAt,
        expiry: draft.expiry,
        serialNo: draft.serialNo,
        unitCost: draft.unitCost,
        sellPrice: draft.sellPrice,
        location: draft.location,
        unitCode: draft.outer,
        trackSerial: draft.trackSerial,
      },
    ]);
    setNote('');
    if (keepOpen) {
      setDraft(null);
      setPick('');
    } else {
      setDraft(null);
    }
  }

  async function save() {
    if (!supplierId) {
      setNote(t('buyNeedSupplier'));
      return;
    }
    if (lines.length === 0) {
      setNote(t('entryEmpty'));
      return;
    }
    setSaving(t('entrySaving', { done: 0, total: lines.length }));
    setNote('');
    try {
      const result = await api<{ docNo: string; total: string }>('/api/v1/ops/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          lines: lines.map((line) => ({
            productId: line.productId || undefined,
            code: line.productId ? undefined : line.code,
            qty: line.qty,
            unitCost: line.unitCost,
            sellPrice: line.sellPrice || undefined,
            batchNo: line.batchNo,
            expiry: line.expiry,
            location: line.location,
            manufacturedAt: line.manufacturedAt || undefined,
            serialNo: line.serialNo || undefined,
            bonusQty: line.bonusQty,
            unitCode: line.unitCode,
          })),
        }),
      });
      ui.push({ tone: 'info', title: t('posted'), body: `${result.docNo} · ${t('buyInStock')} · ${showCount(pieceTotal, ui.language)}` });
      setOpen(false);
      setLines([]);
      setDraft(null);
      setTick((value) => value + 1);
    } catch (err) {
      setNote(err instanceof Error ? err.message : t('entryCost'));
    } finally {
      setSaving('');
    }
  }

  return (
    <Page title={t('procurement')} error={error}>
      <section className="panel-card">
        <p className="lede">{t('buyHelp')}</p>
        <ol className="entry-steps">
          <li className={step > 1 ? 'done' : step === 1 ? 'on' : ''}>1. {t('buyStep1')}</li>
          <li className={step > 2 ? 'done' : step === 2 ? 'on' : ''}>2. {t('buyStep2')}</li>
          <li className={step === 3 ? 'on' : ''}>3. {t('buyStep3')}</li>
        </ol>
        <div className="row">
          <button className="primary fit" type="button" onClick={() => { setOpen(true); setNote(''); setDraft(null); }}>
            {t('buyNew')}
          </button>
          <Link className="ghost" to="/app/inventory">
            {t('inventory')}
          </Link>
        </div>
      </section>
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('invoice')}</th>
              <th>{t('supplier')}</th>
              <th>{t('buyMedicines')}</th>
              <th>{t('buyPieces')}</th>
              <th>{t('total')}</th>
              <th>{t('inventory')}</th>
            </tr>
          </thead>
          <tbody>
            {data && data.orders.length === 0 ? (
              <tr>
                <td colSpan={6}>{t('noSupplierReceipt')}</td>
              </tr>
            ) : (
              data?.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.docNo}</strong>
                    <small>{formatKhartoum(order.orderedAt, ui.language)}</small>
                  </td>
                  <td>{label({ nameAr: order.supplierAr, nameEn: order.supplierEn }, ui.language)}</td>
                  <td>{order.lines.map((line) => label(line, ui.language)).join(' · ')}</td>
                  <td>{showCount(order.lines.reduce((sum, line) => sum + line.qty, 0), ui.language)}</td>
                  <td>{formatMoney(order.total)} {t('sdg')}</td>
                  <td>
                    <em className="med-tag stock">{t('buyInStock')}</em>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('supplier')}</th>
              <th>{t('balance')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td>{label(supplier, ui.language)}</td>
                <td>{formatMoney(supplier.balance)} {t('sdg')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <div
          className="modal-back"
          onClick={() => {
            if (!saving) setOpen(false);
          }}
        >
          <form
            className="modal pack-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (draft) addLine(true);
            }}
          >
            <div className="entry-top">
              <h2>{t('buyNew')}</h2>
              <button className="ghost" type="button" onClick={() => setOpen(false)}>
                {t('entryClose')}
              </button>
            </div>
            <ol className="entry-steps">
              <li className={supplierId ? 'done' : 'on'}>1. {t('buyStep1')}</li>
              <li className={lines.length > 0 ? 'done' : supplierId ? 'on' : ''}>2. {t('buyStep2')}</li>
              <li className={lines.length > 0 ? 'on' : ''}>3. {t('buyStep3')}</li>
            </ol>
            <label className="field">
              <span>{t('supplier')}</span>
              <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="" />
                {data?.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {label(supplier, ui.language)}
                  </option>
                ))}
              </select>
            </label>
            {(data?.suppliers.length ?? 0) === 0 ? <p className="lede">{t('buyNeedSupplier')}</p> : null}
            {draft ? (
              <button className="med-row" type="button" onClick={() => setDraft(null)}>
                <strong>{draft.name}</strong>
                <small>{draft.detail}</small>
                <em className="med-tag stock">{t('entryChange')}</em>
              </button>
            ) : (
              <>
                <label className="field">
                  <span>{t('find')}</span>
                  <input value={pick} onChange={(event) => setPick(event.target.value)} autoFocus />
                </label>
                <ul className="med-list">
                  {stockHits.map((product) => (
                    <li key={product.id}>
                      <button type="button" className="med-row" onClick={() => chooseStock(product)}>
                        <strong>{label(product, ui.language)}</strong>
                        <small>
                          {product.strength} · {product.form}
                        </small>
                        <em className="med-tag stock">{t('entryInStock')}</em>
                      </button>
                    </li>
                  ))}
                  {library.map((item) => (
                    <li key={item.code}>
                      <button type="button" className="med-row" onClick={() => chooseCatalog(item)}>
                        <strong>{label(item, ui.language)}</strong>
                        <small>
                          {item.strength} · {item.form}
                          {item.gtin ? ` · ${item.gtin}` : ''}
                        </small>
                        <em className="med-tag lib">{t('entryLibrary')}</em>
                      </button>
                    </li>
                  ))}
                </ul>
                {stockHits.length === 0 && library.length === 0 ? <p className="lede">{t('entryNone')}</p> : null}
              </>
            )}
            {draft ? (
              <div className="pack-body">
                <span>{t('packArrived')}</span>
                <div className="place-picks">
                  {(['BOX', 'STRIP', 'BOTTLE', 'PIECE'] as PackKind[]).map((kind) => (
                    <button key={kind} type="button" className={draft.outer === kind ? 'on' : ''} onClick={() => setDraft({ ...draft, outer: kind })}>
                      {t(PACK_WORD[kind])}
                    </button>
                  ))}
                </div>
                <div className="entry-controls">
                  <span>{t('packHowMany')}</span>
                  <CountStep value={draft.count} min={1} onChange={(count) => setDraft({ ...draft, count })} />
                </div>
                <div className="place-picks">
                  {[10, 20, 50, 100, 1000].map((count) => (
                    <button key={count} type="button" className={draft.count === count ? 'on' : ''} onClick={() => setDraft({ ...draft, count })}>
                      {showCount(count, ui.language)}
                    </button>
                  ))}
                </div>
                {draft.outer === 'BOX' ? (
                  <>
                    <span>{t('packInside')}</span>
                    <div className="place-picks">
                      {(['STRIP', 'BOTTLE', 'PIECE'] as InnerKind[]).map((kind) => (
                        <button key={kind} type="button" className={draft.inner === kind ? 'on' : ''} onClick={() => setDraft({ ...draft, inner: kind })}>
                          {t(PACK_WORD[kind])}
                        </button>
                      ))}
                    </div>
                    <div className="entry-controls">
                      <span>{t('packEachBox')}</span>
                      <CountStep value={draft.perBox} min={1} onChange={(perBox) => setDraft({ ...draft, perBox })} />
                    </div>
                  </>
                ) : null}
                {draft.outer === 'STRIP' || draft.outer === 'BOTTLE' || (draft.outer === 'BOX' && draft.inner !== 'PIECE') ? (
                  <div className="entry-controls">
                    <span>{draft.outer === 'BOTTLE' || draft.inner === 'BOTTLE' ? t('packEachBottle') : t('packEachStrip')}</span>
                    <CountStep value={draft.perInner} min={1} onChange={(perInner) => setDraft({ ...draft, perInner })} />
                  </div>
                ) : null}
                <p className="pack-total">{t('packStored', { count: showCount(piecesOf(draft), ui.language) })}</p>
                <p className="lede">{packSentence(draft, word, ui.language)}</p>
                <div className="place-picks">
                  {SHELVES.map(([value, key]) => (
                    <button key={value} type="button" className={draft.location === value ? 'on' : ''} onClick={() => setDraft({ ...draft, location: value })}>
                      {t(key)}
                    </button>
                  ))}
                </div>
                <div className="entry-money">
                  <label className="field">
                    <span>{t('expiry')}</span>
                    <input type="date" value={draft.expiry} onChange={(event) => setDraft({ ...draft, expiry: event.target.value, estimated: false })} />
                    {draft.estimated ? <em className="est">{t('estimated')}</em> : null}
                  </label>
                  <label className="field">
                    <span>{t('cost')}</span>
                    <input inputMode="decimal" value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>{t('price')}</span>
                    <input inputMode="decimal" value={draft.sellPrice} onChange={(event) => setDraft({ ...draft, sellPrice: event.target.value })} />
                  </label>
                </div>
                <button type="button" className="ghost" onClick={() => setDraft({ ...draft, more: !draft.more })}>
                  {t('entryMore')}
                </button>
                {draft.more || draft.trackSerial ? (
                  <div className="entry-money">
                    <label className="field">
                      <span>{t('batch')}</span>
                      <input value={draft.batchNo} onChange={(event) => setDraft({ ...draft, batchNo: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>{t('bonus')}</span>
                      <CountStep value={draft.bonusQty} min={0} onChange={(bonusQty) => setDraft({ ...draft, bonusQty })} />
                    </label>
                    <label className="field">
                      <span>{t('made')}</span>
                      <input type="date" value={draft.manufacturedAt} onChange={(event) => setDraft({ ...draft, manufacturedAt: event.target.value })} />
                    </label>
                    {draft.trackSerial ? (
                      <label className="field">
                        <span>{t('serial')}</span>
                        <input value={draft.serialNo} onChange={(event) => setDraft({ ...draft, serialNo: event.target.value })} />
                      </label>
                    ) : null}
                  </div>
                ) : null}
                <div className="row">
                  <button className="primary fit" type="submit">
                    {t('entryKeep')}
                  </button>
                  <button className="ghost" type="button" onClick={() => addLine(false)}>
                    {t('entryDone')}
                  </button>
                </div>
              </div>
            ) : null}
            {lines.length > 0 ? (
              <>
                <p className="pack-total">{t('buyWillStore', { count: showCount(pieceTotal, ui.language) })}</p>
                <div className="sheet receipt-mini">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('entryMedicine')}</th>
                        <th>{t('packHow')}</th>
                        <th>{t('packPiece')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.key}>
                          <td>
                            <strong>{line.name}</strong>
                            <small>{line.detail}</small>
                          </td>
                          <td>{line.packText}</td>
                          <td>{showCount(line.qty, ui.language)}</td>
                          <td>
                            <button type="button" className="ghost" onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}>
                              {t('entryRemove')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            {note ? <p className="error">{note}</p> : null}
            {saving ? <p className="lede">{saving}</p> : null}
            <button className="primary" type="button" disabled={Boolean(saving) || lines.length === 0 || !supplierId} onClick={save}>
              {saving || t('buySave')}
            </button>
          </form>
        </div>
      ) : null}
    </Page>
  );
}

type FinanceBook = {
  accounts: { code: string; nameAr: string; nameEn: string; kind: string; balance: string }[];
  entries: { id: string; docNo: string; memoAr: string; memoEn: string; amount: string }[];
  expenses: { id: string; titleAr: string; titleEn: string; amount: string }[];
};

export function FinancePage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const { data, error } = useData<FinanceBook>('/api/v1/ops/finance', tick);
  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [amount, setAmount] = useState('');

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    await api('/api/v1/ops/expenses', { method: 'POST', body: JSON.stringify({ titleAr, titleEn, amount }) });
    ui.push({ tone: 'info', title: t('posted'), body: amount });
    setTick((value) => value + 1);
  }

  return (
    <Page title={t('finance')} error={error}>
      <section className="kpis">
        {data?.accounts.map((account) => (
          <article className="kpi" key={account.code}>
            <em>{ui.language.startsWith('ar') ? account.nameAr : account.nameEn}</em>
            <strong>{account.balance}</strong>
            <small>{account.code}</small>
          </article>
        ))}
      </section>
      <form className="panel-card" onSubmit={addExpense}>
        <h2>{t('expense')}</h2>
        <div className="form-grid">
          <Field label={t('nameAr')} value={titleAr} onChange={setTitleAr} />
          <Field label={t('nameEn')} value={titleEn} onChange={setTitleEn} />
          <Field label={t('amount')} value={amount} onChange={setAmount} />
        </div>
        <button className="primary fit" type="submit">
          {t('save')}
        </button>
      </form>
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('invoice')}</th>
              <th>{t('note')}</th>
              <th>{t('amount')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.docNo}</td>
                <td>{ui.language.startsWith('ar') ? entry.memoAr : entry.memoEn}</td>
                <td>{entry.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

type UserRow = {
  id: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  roles: string[];
};

export function UsersPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const { data, error } = useData<{ users: UserRow[]; roles: { code: string; nameAr: string; nameEn: string }[] }>(
    '/api/v1/ops/users',
    tick,
  );
  const [form, setForm] = useState({ displayName: '', email: '', password: '', roleCode: 'CASHIER', branchId: '' });
  const network = useData<Network>('/api/v1/ops/network', tick);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    await api('/api/v1/ops/users', {
      method: 'POST',
      body: JSON.stringify({ ...form, branchId: form.branchId || undefined }),
    });
    ui.push({ tone: 'info', title: t('saved'), body: form.displayName });
    setTick((value) => value + 1);
  }

  async function toggle(user: UserRow) {
    await api(`/api/v1/ops/users/${user.id}/active`, {
      method: 'POST',
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    setTick((value) => value + 1);
  }

  return (
    <Page title={t('users')} error={error}>
      <form className="panel-card" onSubmit={createUser}>
        <div className="form-grid">
          <Field label={t('nameAr')} value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} />
          <Field label={t('identifier')} value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <Field label={t('password')} value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <label className="field">
            <span>{t('branches')}</span>
            <select value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}>
              <option value="" />
              {network.data?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {ui.language.startsWith('ar') ? branch.nameAr : branch.nameEn || branch.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('role')}</span>
            <select value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })}>
              {data?.roles.map((role) => (
                <option key={role.code} value={role.code}>
                  {ui.language.startsWith('ar') ? role.nameAr : role.nameEn}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary fit" type="submit">
          {t('add')}
        </button>
      </form>
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('nameAr')}</th>
              <th>{t('identifier')}</th>
              <th>{t('role')}</th>
              <th>{t('active')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((user) => (
              <tr key={user.id}>
                <td>{user.displayName}</td>
                <td>{user.email}</td>
                <td>{user.roles.join(', ')}</td>
                <td>
                  <button type="button" className="ghost" onClick={() => toggle(user)}>
                    {user.isActive ? t('active') : t('paused')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const { data, error } = useData<{ pharmacyAr: string; pharmacyEn: string; settings: { key: string; valueAr: string; valueEn: string }[] }>(
    '/api/v1/ops/settings',
    tick,
  );
  const [rows, setRows] = useState<{ key: string; valueAr: string; valueEn: string }[]>([]);
  useEffect(() => {
    if (data) setRows(data.settings);
  }, [data]);

  async function save(row: { key: string; valueAr: string; valueEn: string }) {
    await api('/api/v1/ops/settings', { method: 'PUT', body: JSON.stringify(row) });
    ui.push({ tone: 'info', title: t('saved'), body: row.key });
    setTick((value) => value + 1);
  }

  return (
    <Page title={t('settings')} error={error}>
      <NetworkPanel />
      <p className="lede">
        {ui.language.startsWith('ar') ? data?.pharmacyAr : data?.pharmacyEn}
      </p>
      {rows.map((row, index) => (
        <form
          className="panel-card"
          key={row.key}
          onSubmit={(event) => {
            event.preventDefault();
            void save(row);
          }}
        >
          <h2>{row.key}</h2>
          <div className="form-grid">
            <Field
              label={t('nameAr')}
              value={row.valueAr}
              onChange={(valueAr) => setRows(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, valueAr } : item)))}
            />
            <Field
              label={t('nameEn')}
              value={row.valueEn}
              onChange={(valueEn) => setRows(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, valueEn } : item)))}
            />
          </div>
          <button className="primary fit" type="submit">
            {t('save')}
          </button>
        </form>
      ))}
    </Page>
  );
}

type Report = {
  salesToday: string;
  salesCount: number;
  stockValue: string;
  grossProfit: string;
  expenseTotal: string;
  lowStock: Product[];
  expiring: Product[];
  purchases: { docNo: string; total: string; supplierAr: string; supplierEn: string; status?: string }[];
  top?: { nameAr: string; nameEn: string; qty: number; total: string }[];
  suppliers?: { nameAr: string; nameEn: string; balance: string }[];
  home?: HomeBoard;
  scope: { management: 'INDEPENDENT' | 'SHARED'; all: boolean; branchLimit: number; branchCount: number };
};

type Network = {
  management: 'INDEPENDENT' | 'SHARED';
  branchLimit: number;
  canViewAll: boolean;
  branches: { id: string; code: string; nameAr: string; nameEn: string | null; city: string | null }[];
};

export function ReportsPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const { data, error } = useData<Report>('/api/v1/ops/reports', 0);
  const arabic = ui.language.startsWith('ar');
  const money = (amount: string) => `${formatMoney(amount)} ${t('sdg')}`;
  const pay: Record<string, string> = {
    CASH: t('cash'),
    BANKAK: t('bankak'),
    FAWRY: t('fawry'),
    TRANSFER: t('transfer'),
  };
  const grouped = new Map<string, string[]>();
  for (const sale of data?.home?.sales ?? []) {
    grouped.set(sale.paymentMethod, [...(grouped.get(sale.paymentMethod) ?? []), sale.total]);
  }
  const payments = [...grouped.entries()].map(([method, totals]) => ({
    method,
    count: totals.length,
    total: sumAmounts(totals),
  }));
  const dues = (data?.home?.customers ?? []).filter((row) => row.balance !== '0.00' && !row.balance.startsWith('-'));
  const supplierDues = (data?.suppliers ?? []).filter((row) => row.balance !== '0.00' && !row.balance.startsWith('-'));

  return (
    <Page title={t('reports')} error={error}>
      <p className="lede">
        {data?.scope?.all ? t('allBranches') : t('thisBranch')}
        {data?.scope ? ` · ${data.scope.management === 'INDEPENDENT' ? t('independent') : t('shared')}` : ''}
      </p>
      <section className="kpis">
        <article className="kpi">
          <em>{t('salesTodayKpi')}</em>
          <strong>{data ? money(data.salesToday) : ''}</strong>
          <small>{data?.salesCount ?? 0}</small>
        </article>
        <article className="kpi">
          <em>{t('stockValue')}</em>
          <strong>{data ? money(data.stockValue) : ''}</strong>
        </article>
        <article className="kpi">
          <em>{t('profit')}</em>
          <strong>{data ? money(data.grossProfit) : ''}</strong>
        </article>
        <article className="kpi">
          <em>{t('purchasesMonth')}</em>
          <strong>{data?.home ? money(data.home.purchasesMonth) : ''}</strong>
        </article>
      </section>
      <div className="dash-split">
        <section className="panel-card">
          <h2>{t('reportDays')}</h2>
          <div className="bars">
            {(data?.home?.days ?? []).map((day) => (
              <div key={day.date} className="bar" title={money(day.total)}>
                <i style={{ height: `${day.heightPct}%` }} />
                <span>{day.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel-card">
          <h2>{t('reportPay')}</h2>
          <div className="sheet">
            <table>
              <thead>
                <tr>
                  <th>{t('method')}</th>
                  <th>{t('invoiceCount')}</th>
                  <th>{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((row) => (
                  <tr key={row.method}>
                    <td>{pay[row.method] ?? row.method}</td>
                    <td>{row.count}</td>
                    <td>{money(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="panel-card">
        <h2>{t('reportTop')}</h2>
        <div className="sheet">
          <table>
            <thead>
              <tr>
                <th>{t('drug')}</th>
                <th>{t('qty')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.top ?? []).map((row) => (
                <tr key={row.nameAr}>
                  <td>{arabic ? row.nameAr : row.nameEn}</td>
                  <td>{row.qty}</td>
                  <td>{money(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {(data?.home?.branches.length ?? 0) > 1 ? (
        <section className="panel-card">
          <h2>{t('reportBranches')}</h2>
          <div className="sheet">
            <table>
              <thead>
                <tr>
                  <th>{t('branches')}</th>
                  <th>{t('salesTodayKpi')}</th>
                  <th>{t('alerts')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.home?.branches.map((branch) => (
                  <tr key={branch.id}>
                    <td>{arabic ? branch.nameAr : branch.nameEn}</td>
                    <td>{money(branch.salesToday)}</td>
                    <td>{branch.alertCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <h2>{t('low')}</h2>
      <ProductTable products={(data?.lowStock ?? []).slice(0, 8)} language={ui.language} />
      <h2>{t('expiring')}</h2>
      <ProductTable products={(data?.expiring ?? []).slice(0, 8)} language={ui.language} />
      <div className="dash-split">
        <section className="panel-card">
          <h2>{t('reportDue')}</h2>
          <div className="sheet">
            <table>
              <tbody>
                {dues.length === 0 ? (
                  <tr>
                    <td>{t('empty')}</td>
                  </tr>
                ) : (
                  dues.map((row) => (
                    <tr key={row.nameAr}>
                      <td>{arabic ? row.nameAr : row.nameEn}</td>
                      <td>{money(row.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel-card">
          <h2>{t('reportSupplierDue')}</h2>
          <div className="sheet">
            <table>
              <tbody>
                {supplierDues.length === 0 ? (
                  <tr>
                    <td>{t('empty')}</td>
                  </tr>
                ) : (
                  supplierDues.map((row) => (
                    <tr key={row.nameAr}>
                      <td>{arabic ? row.nameAr : row.nameEn}</td>
                      <td>{money(row.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="panel-card">
        <h2>{t('procurement')}</h2>
        <div className="sheet">
          <table>
            <thead>
              <tr>
                <th>{t('orderNo')}</th>
                <th>{t('supplier')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.purchases ?? []).map((order) => (
                <tr key={order.docNo}>
                  <td>{order.docNo}</td>
                  <td>{arabic ? order.supplierAr : order.supplierEn}</td>
                  <td>{money(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}

function NetworkPanel() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const { data, error } = useData<Network>('/api/v1/ops/network', tick);
  const [form, setForm] = useState({ nameAr: '', nameEn: '', city: '', phone: '' });

  async function addBranch(event: React.FormEvent) {
    event.preventDefault();
    await api('/api/v1/ops/branches', { method: 'POST', body: JSON.stringify(form) });
    ui.push({ tone: 'info', title: t('saved'), body: form.nameAr });
    setForm({ nameAr: '', nameEn: '', city: '', phone: '' });
    setTick((value) => value + 1);
  }

  async function setMode(management: string) {
    await api('/api/v1/ops/network', { method: 'PUT', body: JSON.stringify({ management }) });
    ui.push({ tone: 'info', title: t('saved'), body: management === 'INDEPENDENT' ? t('independent') : t('shared') });
    setTick((value) => value + 1);
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return null;
  return (
    <section className="panel-card">
      <h2>
        {t('branches')} · {data.branches.length} / {data.branchLimit}
      </h2>
      <p className="lede">{t('branchHelp')}</p>
      {data.canViewAll ? (
        <label className="field">
          <span>{t('management')}</span>
          <select value={data.management} onChange={(event) => void setMode(event.target.value)}>
            <option value="INDEPENDENT">{t('independent')}</option>
            <option value="SHARED">{t('shared')}</option>
          </select>
        </label>
      ) : null}
      <div className="sheet">
        <table>
          <tbody>
            {data.branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.code}</td>
                <td>{ui.language.startsWith('ar') ? branch.nameAr : branch.nameEn || branch.nameAr}</td>
                <td>{branch.city}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.canViewAll && data.branches.length < data.branchLimit ? (
        <form onSubmit={addBranch}>
          <div className="form-grid">
            <Field label={t('nameAr')} value={form.nameAr} onChange={(nameAr) => setForm({ ...form, nameAr })} />
            <Field label={t('nameEn')} value={form.nameEn} onChange={(nameEn) => setForm({ ...form, nameEn })} />
            <Field label={t('city')} value={form.city} onChange={(city) => setForm({ ...form, city })} />
            <label className="field">
              <span>{t('phone')}</span>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
          </div>
          <button className="primary fit" type="submit">
            {t('addBranch')}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function ProductTable({ products, language }: { products: Product[]; language: string }) {
  const { t } = useTranslation();
  return (
    <div className="sheet">
      <table>
        <thead>
          <tr>
            <th>{t('nameAr')}</th>
            <th>{t('qty')}</th>
            <th>{t('expiry')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{label(product, language)}</td>
              <td>{product.qty}</td>
              <td>{product.nearestExpiry?.slice(0, 10) ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CatalogItem = {
  code: string;
  nameAr: string;
  nameEn: string;
  genericName: string;
  form: string;
  strength: string;
  categoryAr: string;
  categoryEn: string;
  manufacturer?: string;
  ingredients?: string;
  gtin?: string;
  unitsJson?: string;
  storageCondition?: string;
  imported: boolean;
  trackSerial?: boolean;
};

type PriceBoard = {
  using: 'PHARMACY' | 'BRANCH';
  branchId: string | null;
  selectedId: string | null;
  lists: {
    id: string;
    nameAr: string;
    nameEn: string;
    scope: string;
    isActive: boolean;
    status?: string;
    versionNo?: number;
    locked?: boolean;
    allowedActions?: string[];
    lockReason?: 'draft' | 'active' | 'usedOnSales';
    sourceNameAr?: string | null;
    sourceNameEn?: string | null;
    effectiveFrom?: string | null;
    branchId: string | null;
    branchAr: string | null;
    branchEn: string | null;
  }[];
  items: { productId: string; sku: string; nameAr: string; nameEn: string; amount: string; cost?: string }[];
};

export function PricesPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const [listId, setListId] = useState('');
  const [composer, setComposer] = useState<'create' | 'add' | null>(null);
  const [priceStep, setPriceStep] = useState<1 | 2>(1);
  const [finder, setFinder] = useState('');
  const [hits, setHits] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<{ code: string; name: string; amount: string }[]>([]);
  const [effectiveOn, setEffectiveOn] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [askItem, setAskItem] = useState({ nameAr: '', nameEn: '', genericName: '', barcode: '' });
  const [bulkValue, setBulkValue] = useState('15');
  const [bulkOp, setBulkOp] = useState('PCT');
  const [previewRows, setPreviewRows] = useState<{ sku: string; oldPrice: string; newPrice: string | null; belowCost: boolean }[]>([]);
  const [rate, setRate] = useState('');
  const [csvText, setCsvText] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [names, setNames] = useState({ nameAr: '', nameEn: '' });
  const [adjust, setAdjust] = useState<'SAME' | 'PCT' | 'AMOUNT'>('SAME');
  const [adjustValue, setAdjustValue] = useState('10');
  const [note, setNote] = useState('');
  const rates = useData<{ rate: string; notedAt: string }[]>('/api/v1/ops/prices/rates', tick);
  const board = useData<PriceBoard>(listId ? `/api/v1/ops/prices?listId=${listId}` : '/api/v1/ops/prices', tick);
  const branchChosen = (localStorage.getItem('dawaa.branch') ?? '') !== '' && localStorage.getItem('dawaa.branch') !== 'all';

  useEffect(() => {
    if (!board.data) return;
    setAmounts(Object.fromEntries(board.data.items.map((item) => [item.productId, item.amount])));
  }, [board.data]);

  useEffect(() => {
    if (!composer) return;
    const needle = finder.trim();
    if (needle.length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      api<CatalogItem[]>(`/api/v1/ops/catalog?q=${encodeURIComponent(needle)}`)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [finder, composer]);

  const selected = board.data?.lists.find((list) => list.id === (listId || board.data?.selectedId)) ?? null;

  async function run(action: () => Promise<void>) {
    try {
      setNote('');
      await action();
      setTick((value) => value + 1);
    } catch (caught: unknown) {
      setNote(caught instanceof Error ? caught.message : t('empty'));
    }
  }

  return (
    <Page title={t('prices')} error={note || board.error}>
      <p className="lede">{t('priceHelp')}</p>
      <div className="row">
        <button
          className="primary fit"
          type="button"
          onClick={() => {
            setComposer('create');
            setPriceStep(1);
            setFinder('');
            setHits([]);
            setChosen([]);
            setNames({ nameAr: '', nameEn: '' });
            setEffectiveOn('');
          }}
        >
          {t('newPriceList')}
        </button>
        {selected && !selected.locked ? (
          <button
            className="ghost"
            type="button"
            onClick={() => {
              setComposer('add');
              setPriceStep(2);
              setFinder('');
              setHits([]);
              setChosen([]);
            }}
          >
            {t('addMedicines')}
          </button>
        ) : null}
      </div>
      <p className="lede">{board.data?.using === 'BRANCH' ? t('usingBranch') : t('usingShared')}</p>
      {board.data && board.data.lists.length > 0 ? (
        <label className="field">
          <span>{t('prices')}</span>
          <select value={listId || board.data.selectedId || ''} onChange={(event) => setListId(event.target.value)}>
            {board.data.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {label(list, ui.language)} · {list.status ?? ''} v{list.versionNo ?? 1}
                {list.scope === 'BRANCH' ? ` · ${ui.language.startsWith('ar') ? list.branchAr : list.branchEn}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selected ? (
        <div className="panel-card">
          <h2>{t('priceOps')}</h2>
          <p className="lede">
            {selected.status === 'ACTIVE' ? t('statusActive') : selected.status === 'ARCHIVED' ? t('statusArchived') : t('statusDraft')}
            {' · '}
            {t('versionLabel')} {selected.versionNo ?? 1}
            {selected.effectiveFrom
              ? ` · ${t('effectiveOn')} ${new Date(selected.effectiveFrom).toLocaleDateString('en-CA', { timeZone: 'Africa/Khartoum' })}`
              : ''}
            {selected.sourceNameAr
              ? ` · ${t('sourceList')} ${ui.language.startsWith('ar') ? selected.sourceNameAr : selected.sourceNameEn}`
              : ''}
          </p>
          {selected.lockReason === 'usedOnSales' ? <p className="lede">{t('lockUsed')}</p> : null}
          {selected.lockReason === 'active' ? <p className="lede">{t('lockActive')}</p> : null}
          <div className="row">
            {selected.allowedActions?.includes('activate') ? (
              <button
                className="primary fit"
                type="button"
                onClick={() =>
                  void run(async () => {
                    await api('/api/v1/ops/prices/activate', {
                      method: 'POST',
                      body: JSON.stringify({ priceListId: selected.id, useShared: false }),
                    });
                    ui.push({ tone: 'info', title: t('saved'), body: t('activateList') });
                  })
                }
              >
                {t('activateList')}
              </button>
            ) : null}
            {selected.allowedActions?.includes('deactivate') ? (
              <button
                className="ghost"
                type="button"
                onClick={() =>
                  void run(async () => {
                    await api('/api/v1/ops/prices/deactivate', {
                      method: 'POST',
                      body: JSON.stringify({ priceListId: selected.id }),
                    });
                    ui.push({ tone: 'info', title: t('saved'), body: t('deactivateList') });
                  })
                }
              >
                {t('deactivateList')}
              </button>
            ) : null}
            {selected.allowedActions?.includes('delete') ? (
              <button
                className="ghost"
                type="button"
                onClick={() =>
                  void run(async () => {
                    await api('/api/v1/ops/prices/delete', {
                      method: 'POST',
                      body: JSON.stringify({ priceListId: selected.id }),
                    });
                    setListId('');
                    ui.push({ tone: 'info', title: t('saved'), body: t('deleteList') });
                  })
                }
              >
                {t('deleteList')}
              </button>
            ) : null}
            <button
              className="ghost"
              type="button"
              onClick={() =>
                void run(async () => {
                  const file = await api<{ csv: string }>(`/api/v1/ops/prices/export?listId=${selected.id}`);
                  const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `prices-${selected.id.slice(0, 8)}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              {t('exportCsv')}
            </button>
          </div>
          {selected.allowedActions?.includes('renew') ? (
            <div className="form-grid">
              <label className="field">
                <span>{t('renewList')}</span>
                <select value={adjust} onChange={(event) => setAdjust(event.target.value as 'SAME' | 'PCT' | 'AMOUNT')}>
                  <option value="SAME">{t('adjustSame')}</option>
                  <option value="PCT">{t('adjustPercent')}</option>
                  <option value="AMOUNT">{t('adjustAmount')}</option>
                </select>
              </label>
              {adjust === 'SAME' ? null : <Field label={adjust === 'PCT' ? '%' : t('amount')} value={adjustValue} onChange={setAdjustValue} />}
              <button
                className="primary fit"
                type="button"
                onClick={() =>
                  void run(async () => {
                    const created = await api<{ id: string }>('/api/v1/ops/prices/copy', {
                      method: 'POST',
                      body: JSON.stringify({
                        priceListId: selected.id,
                        adjust,
                        value: adjust === 'SAME' ? '0.00' : adjustValue,
                      }),
                    });
                    setListId(created.id);
                    setAdjust('SAME');
                    ui.push({ tone: 'info', title: t('saved'), body: t('renewList') });
                  })
                }
              >
                {t('renewList')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {selected && !selected.locked ? (
        <div className="panel-card">
          <h2>{t('bulk')}</h2>
          <div className="form-grid">
            <label className="field">
              <span>{t('bulk')}</span>
              <select value={bulkOp} onChange={(event) => setBulkOp(event.target.value)}>
                <option value="PCT">%</option>
                <option value="AMOUNT">SDG</option>
                <option value="MARGIN">margin</option>
                <option value="FX">USD</option>
              </select>
            </label>
            <Field label={t('amount')} value={bulkValue} onChange={setBulkValue} />
          </div>
          <div className="row">
            <button
              className="ghost"
              type="button"
              onClick={() =>
                void run(async () => {
                  const result = await api<{ preview: { sku: string; oldPrice: string; newPrice: string | null; belowCost: boolean }[] }>(
                    '/api/v1/ops/prices/bulk',
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        priceListId: selected.id,
                        op: bulkOp,
                        value: bulkValue,
                        rounding: '10',
                        roundMode: 'NEAREST',
                        filter: bulkOp === 'FX' ? 'USD' : 'ALL',
                        apply: false,
                      }),
                    },
                  );
                  setPreviewRows(result.preview.filter((row) => row.newPrice && row.newPrice !== row.oldPrice).slice(0, 12));
                })
              }
            >
              {t('preview')}
            </button>
            <button
              className="primary fit"
              type="button"
              onClick={() =>
                void run(async () => {
                  await api('/api/v1/ops/prices/bulk', {
                    method: 'POST',
                    body: JSON.stringify({
                      priceListId: selected.id,
                      op: bulkOp,
                      value: bulkValue,
                      rounding: '10',
                      roundMode: 'NEAREST',
                      filter: bulkOp === 'FX' ? 'USD' : 'ALL',
                      apply: true,
                    }),
                  });
                  setPreviewRows([]);
                  ui.push({ tone: 'info', title: t('saved'), body: t('bulk') });
                })
              }
            >
              {t('apply')}
            </button>
          </div>
          {previewRows.length > 0 ? (
            <div className="sheet">
              <table>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.sku} className={row.belowCost ? 'below' : ''}>
                      <td>{row.sku}</td>
                      <td>{row.oldPrice}</td>
                      <td>{row.newPrice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <label className="field">
            <span>{t('importCsv')}</span>
            <input value={csvText} onChange={(event) => setCsvText(event.target.value)} />
          </label>
          <button
            className="ghost"
            type="button"
            onClick={() =>
              void run(async () => {
                const result = await api<{ changed: string[]; errors: string[] }>('/api/v1/ops/prices/import', {
                  method: 'POST',
                  body: JSON.stringify({ priceListId: selected.id, csv: csvText }),
                });
                ui.push({ tone: 'info', title: t('saved'), body: `${result.changed.length}` });
              })
            }
          >
            {t('importCsv')}
          </button>
        </div>
      ) : null}
      <div className="panel-card">
        <h2>{t('rate')}</h2>
        <p className="lede">{(rates.data ?? []).map((row) => row.rate).join(' · ')}</p>
        <div className="row">
          <Field label={t('rate')} value={rate} onChange={setRate} />
          <button
            className="primary fit"
            type="button"
            onClick={() =>
              void run(async () => {
                await api('/api/v1/ops/prices/rates', { method: 'POST', body: JSON.stringify({ rate }) });
                setRate('');
              })
            }
          >
            {t('save')}
          </button>
        </div>
      </div>
      {!branchChosen ? <p className="lede">{t('pickBranchPrice')}</p> : null}
      <label className="field">
        <span>{t('pricedShown')}</span>
        <input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder={t('searchMedicines')} />
      </label>
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('product')}</th>
              <th>{t('sku')}</th>
              <th>{t('price')}</th>
            </tr>
          </thead>
          <tbody>
            {(board.data?.items ?? [])
              .filter((item) => item.amount !== '')
              .filter((item) => {
                const needle = itemQuery.trim().toLowerCase();
                if (!needle) return true;
                return [item.sku, item.nameAr, item.nameEn].some((value) => value.toLowerCase().includes(needle));
              })
              .slice(0, 20)
              .map((item) => (
              <tr key={item.productId}>
                <td>{ui.language.startsWith('ar') ? item.nameAr : item.nameEn}</td>
                <td>{item.sku}</td>
                <td>
                  <input
                    value={amounts[item.productId] ?? ''}
                    disabled={selected?.locked}
                    onChange={(event) => setAmounts({ ...amounts, [item.productId]: event.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && !selected.locked ? (
        <div className="row">
          <button
            className="primary fit"
            type="button"
            disabled={!dirtyPrices(board.data?.items ?? [], amounts)}
            onClick={() =>
              void run(async () => {
                const priceListId = listId || board.data?.selectedId;
                if (!priceListId) return;
                const items = changedPrices(board.data?.items ?? [], amounts);
                await api('/api/v1/ops/prices/items/batch', {
                  method: 'PUT',
                  body: JSON.stringify({ priceListId, items }),
                });
                ui.push({ tone: 'info', title: t('saved'), body: t('savePrices') });
              })
            }
          >
            {t('savePrices')}
          </button>
        </div>
      ) : null}
      {board.data && board.data.items.every((item) => item.amount === '') ? <p className="lede">{t('noPrices')}</p> : null}
      {composer ? (
        <div className="modal-back" role="presentation" onClick={() => setComposer(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{composer === 'create' ? t('newPriceList') : t('addMedicines')}</h2>
            {composer === 'create' ? (
              <ol className="price-steps">
                <li className={priceStep === 1 ? 'on' : 'done'}>{t('priceStepDetails')}</li>
                <li className={priceStep === 2 ? 'on' : ''}>{t('priceStepItems')}</li>
              </ol>
            ) : null}
            {composer === 'create' && priceStep === 1 ? (
              <>
                <div className="modal-fields">
                  <Field label={t('nameAr')} value={names.nameAr} onChange={(nameAr) => setNames({ ...names, nameAr })} />
                  <Field label={t('nameEn')} value={names.nameEn} onChange={(nameEn) => setNames({ ...names, nameEn })} />
                  <label className="field span-2">
                    <span>{t('effectiveOn')}</span>
                    <input type="date" value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} required />
                  </label>
                </div>
                <div className="row">
                  <button
                    className="primary fit"
                    type="button"
                    disabled={names.nameAr.trim() === '' || names.nameEn.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)}
                    onClick={() => setPriceStep(2)}
                  >
                    {t('nextStep')}
                  </button>
                  <button className="ghost" type="button" onClick={() => setComposer(null)}>
                    {t('close')}
                  </button>
                </div>
              </>
            ) : null}
            {priceStep === 2 ? (
            <>
            <p className="lede">{t('priceHold')}</p>
            <label className="field">
              <span>{t('searchMedicines')}</span>
              <input value={finder} onChange={(event) => setFinder(event.target.value)} />
            </label>
            <p className="lede">{searching ? '…' : t('typeToSearch')}</p>
            <div className="pick-list">
              {hits.map((item) => {
                const name = ui.language.startsWith('ar') ? item.nameAr : item.nameEn;
                const added = chosen.some((row) => row.code === item.code);
                return (
                  <div className="pick-row" key={item.code}>
                    <span className="pick-name">
                      <strong>{name}</strong>
                      <small>{[item.strength, item.form].filter(Boolean).join(' · ')}</small>
                    </span>
                    <button
                      className="plus-btn"
                      type="button"
                      disabled={added}
                      aria-label="+"
                      onClick={() => setChosen([...chosen, { code: item.code, name, amount: '' }])}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
            {chosen.length > 0 ? (
              <div className="chosen">
                <div className="chosen-head">
                  <span>{t('medicine')}</span>
                  <span>{t('price')} ({t('sdg')})</span>
                  <span />
                </div>
                {chosen.map((row) => (
                  <div className="chosen-row" key={row.code}>
                    <span className="pick-name" title={row.name}>
                      <strong>{row.name}</strong>
                    </span>
                    <input
                      value={row.amount}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`${t('price')} ${row.name}`}
                      onChange={(event) =>
                        setChosen(chosen.map((item) => (item.code === row.code ? { ...item, amount: event.target.value } : item)))
                      }
                    />
                    <button
                      className="chosen-x"
                      type="button"
                      aria-label="×"
                      onClick={() => setChosen(chosen.filter((item) => item.code !== row.code))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="row">
              <button
                className="primary fit"
                type="button"
                disabled={
                  chosen.length === 0 ||
                  chosen.some((row) => !/^\d+(\.\d{1,2})?$/.test(row.amount)) ||
                  (composer === 'create' && (names.nameAr.trim() === '' || names.nameEn.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)))
                }
                onClick={() =>
                  void run(async () => {
                    const items = chosen.map((row) => ({ code: row.code, amount: row.amount }));
                    if (composer === 'create') {
                      const created = await api<{ id: string }>('/api/v1/ops/prices/lists', {
                        method: 'POST',
                        body: JSON.stringify({
                          nameAr: names.nameAr,
                          nameEn: names.nameEn,
                          scope: branchChosen ? 'BRANCH' : 'PHARMACY',
                          effectiveFrom: effectiveOn,
                          items,
                        }),
                      });
                      setListId(created.id);
                    } else if (selected) {
                      await api('/api/v1/ops/prices/items/batch', {
                        method: 'PUT',
                        body: JSON.stringify({ priceListId: selected.id, items }),
                      });
                    }
                    ui.push({ tone: 'info', title: t('saved'), body: composer === 'create' ? names.nameAr : t('addMedicines') });
                    setComposer(null);
                    setChosen([]);
                    setPriceStep(1);
                  })
                }
              >
                {composer === 'create' ? t('saveListOnce') : t('savePrices')}
              </button>
              {composer === 'create' ? (
                <button className="ghost" type="button" onClick={() => setPriceStep(1)}>
                  {t('back')}
                </button>
              ) : null}
              <button className="ghost" type="button" onClick={() => setComposer(null)}>
                {t('close')}
              </button>
            </div>
            <details className="ask-more">
              <summary>{t('notInCatalog')}</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await api('/api/v1/ops/catalog/requests', { method: 'POST', body: JSON.stringify(askItem) });
                    ui.push({ tone: 'ok', title: t('saved'), body: t('askItem') });
                    setAskItem({ nameAr: '', nameEn: '', genericName: '', barcode: '' });
                  });
                }}
              >
                <div className="modal-fields">
                  <label className="field"><span>{t('nameAr')}</span><input value={askItem.nameAr} onChange={(event) => setAskItem({ ...askItem, nameAr: event.target.value })} required /></label>
                  <label className="field"><span>{t('nameEn')}</span><input value={askItem.nameEn} onChange={(event) => setAskItem({ ...askItem, nameEn: event.target.value })} required /></label>
                  <label className="field"><span>{t('generic')}</span><input value={askItem.genericName} onChange={(event) => setAskItem({ ...askItem, genericName: event.target.value })} required /></label>
                  <label className="field"><span>{t('barcode')}</span><input value={askItem.barcode} onChange={(event) => setAskItem({ ...askItem, barcode: event.target.value })} /></label>
                </div>
                <button className="ghost" type="submit">{t('sendRequest')}</button>
              </form>
            </details>
            </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Page>
  );
}

function changedPrices(
  items: { productId: string; amount: string }[],
  amounts: Record<string, string>,
) {
  return items.flatMap((item) => {
    const next = amounts[item.productId] ?? '';
    if (next === item.amount || !/^\d+(\.\d{1,2})?$/.test(next)) return [];
    return [{ productId: item.productId, amount: next }];
  });
}

function dirtyPrices(items: { productId: string; amount: string }[], amounts: Record<string, string>) {
  return changedPrices(items, amounts).length > 0;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}
