import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { HelpTip } from '../../admin/src/hint';
import { ApiError, api, type HomeBoard, type Profile, type ReceiptPreview } from './api';
import { ReceiptSlip } from './ReceiptPage';
import { defaultShelfExpiry, expiryTone, parseGs1 } from './expiry';
import { clearInventoryDraft, StockPostDialog, type Stocking } from './stock-post';
import { LibraryRequest } from './library-request';
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

function mapEmbed(latitude: string, longitude: string): string {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const pad = 0.02;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad].map((value) => value.toFixed(5)).join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
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
  outer: PackKind;
  inner: InnerKind;
  perBox: number;
  perInner: number;
  trackSerial: boolean;
  condition: 'AVAILABLE' | 'REJECTED' | 'QUARANTINE' | 'DAMAGED';
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
  condition: 'AVAILABLE' | 'REJECTED' | 'QUARANTINE' | 'DAMAGED';
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

function writtenBatch(value: string): string {
  const text = value.trim();
  if (!text || text.toUpperCase() === 'OPEN' || text.toUpperCase() === 'N/A') return 'N/A';
  return text;
}

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
    batchNo: 'N/A',
    manufacturedAt: '',
    serialNo: '',
    bonusQty: 0,
    condition: 'AVAILABLE',
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

function piecesEach(pack: { outer: PackKind; inner: InnerKind; perBox: number; perInner: number }): number {
  if (pack.outer === 'PIECE') return 1;
  if (pack.outer === 'STRIP' || pack.outer === 'BOTTLE') return Math.max(1, pack.perInner);
  if (pack.inner === 'PIECE') return Math.max(1, pack.perBox);
  return Math.max(1, pack.perBox) * Math.max(1, pack.perInner);
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

function RequestPack({ draft, onChange }: { draft: EntryDraft; onChange: (next: EntryDraft) => void }) {
  const { t } = useTranslation();
  const ui = useUi();
  const word = (key: 'packBox' | 'packStrip' | 'packBottle' | 'packPiece') => t(key);
  const qtyLabel =
    draft.outer === 'BOX' ? t('orderQtyBox') : draft.outer === 'STRIP' ? t('orderQtyStrip') : draft.outer === 'BOTTLE' ? t('orderQtyBottle') : t('orderQtyPiece');
  const pieces = piecesOf(draft);
  const formula = packSentence(draft, word, ui.language);
  const sizeChips = [1, 5, 10, 20];
  return (
    <div className="pack-steps">
      <div className="pack-step">
        <span>{t('orderUnit')}</span>
        <div className="place-picks">
          {(['PIECE', 'STRIP', 'BOTTLE', 'BOX'] as PackKind[]).map((kind) => (
            <button key={kind} type="button" className={draft.outer === kind ? 'on' : ''} onClick={() => onChange({ ...draft, outer: kind })}>
              {t(PACK_WORD[kind])}
            </button>
          ))}
        </div>
      </div>
      <div className="pack-step">
        <div className="entry-controls">
          <span>{qtyLabel}</span>
          <CountStep value={draft.count} min={1} onChange={(count) => onChange({ ...draft, count })} />
        </div>
        <div className="place-picks">
          {[1, 5, 10, 20, 50, 100].map((count) => (
            <button key={count} type="button" className={draft.count === count ? 'on' : ''} onClick={() => onChange({ ...draft, count })}>
              {showCount(count, ui.language)}
            </button>
          ))}
        </div>
      </div>
      {draft.outer === 'BOX' ? (
        <div className="pack-step">
          <span>{t('orderInside')}</span>
          <div className="place-picks">
            {(['STRIP', 'BOTTLE', 'PIECE'] as InnerKind[]).map((kind) => (
              <button key={kind} type="button" className={draft.inner === kind ? 'on' : ''} onClick={() => onChange({ ...draft, inner: kind })}>
                {t(PACK_WORD[kind])}
              </button>
            ))}
          </div>
          <div className="entry-controls">
            <span>{t('orderPerBox')}</span>
            <CountStep value={draft.perBox} min={1} onChange={(perBox) => onChange({ ...draft, perBox })} />
          </div>
          <div className="place-picks">
            {sizeChips.map((perBox) => (
              <button key={perBox} type="button" className={draft.perBox === perBox ? 'on' : ''} onClick={() => onChange({ ...draft, perBox })}>
                {showCount(perBox, ui.language)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {draft.outer === 'STRIP' || draft.outer === 'BOTTLE' || (draft.outer === 'BOX' && draft.inner !== 'PIECE') ? (
        <div className="pack-step">
          <div className="entry-controls">
            <span>
              {draft.outer === 'BOTTLE' || draft.inner === 'BOTTLE'
                ? t(draft.outer === 'BOX' ? 'orderPerBottle' : 'orderPerBottleOnly')
                : t(draft.outer === 'BOX' ? 'orderPerStrip' : 'orderPerStripOnly')}
            </span>
            <CountStep value={draft.perInner} min={1} onChange={(perInner) => onChange({ ...draft, perInner })} />
          </div>
          <div className="place-picks">
            {sizeChips.map((perInner) => (
              <button key={perInner} type="button" className={draft.perInner === perInner ? 'on' : ''} onClick={() => onChange({ ...draft, perInner })}>
                {showCount(perInner, ui.language)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="pack-total">{draft.outer === 'PIECE' ? t('orderPieces', { count: showCount(pieces, ui.language) }) : t('orderResult', { formula, count: showCount(pieces, ui.language) })}</p>
    </div>
  );
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
  const { data, error } = useData<{ categories: Named[]; products: Product[]; stocking?: Stocking }>('/api/v1/ops/inventory', tick);
  const receipts = useData<{
    orders: {
      id: string;
      docNo: string;
      status: string;
      total: string;
      orderedAt: string;
      supplierAr: string;
      supplierEn: string;
      lines: { id: string; productId: string; qty: number; receivedQty: number; unitCost: string; nameAr: string; nameEn: string }[];
    }[];
  }>('/api/v1/ops/purchasing', tick);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanCode, setScanCode] = useState('');
  const [pick, setPick] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [hits, setHits] = useState<CatalogItem[]>([]);
  const [hitQuery, setHitQuery] = useState('');
  const [receipt, setReceipt] = useState<EntryLine[]>([]);
  const [entryOpen, setEntryOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [seedScan, setSeedScan] = useState('');
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [justAdded, setJustAdded] = useState('');
  const [saving, setSaving] = useState('');
  const [purchaseId, setPurchaseId] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [opening, setOpening] = useState(false);
  const [allowOver, setAllowOver] = useState(false);
  const [receiptDoc, setReceiptDoc] = useState('');
  const clientKey = useRef(crypto.randomUUID());
  const findRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const carry = useRef({ expiry: '', location: '' });

  useEffect(() => {
    if (!entryOpen) return;
    const asked = pick.trim();
    const handle = window.setTimeout(() => {
      api<CatalogItem[]>(`/api/v1/ops/catalog?q=${encodeURIComponent(asked)}`)
        .then((body) => {
          setHits(Array.isArray(body) ? body : []);
          setHitQuery(asked);
        })
        .catch(() => {
          setHits([]);
          setHitQuery(asked);
        });
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
    beep(true);
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
      batchNo: parsed?.batch || 'N/A',
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
      batchNo: parsed?.batch || 'N/A',
      manufacturedAt: parsed?.manufactured || '',
      serialNo: parsed?.serial || '',
      more: Boolean(parsed?.batch || parsed?.serial || item.trackSerial),
    });
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
    if (draft.condition === 'AVAILABLE' && draft.expiry <= new Date().toISOString().slice(0, 10)) {
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
      batchNo: writtenBatch(draft.batchNo),
      manufacturedAt: draft.manufacturedAt,
      expiry: draft.expiry,
      serialNo: draft.serialNo,
      unitCost: draft.unitCost,
      sellPrice: draft.sellPrice,
      location: draft.location,
      unitCode: draft.outer,
      outer: draft.outer,
      inner: draft.inner,
      perBox: draft.perBox,
      perInner: draft.perInner,
      trackSerial: draft.trackSerial,
      condition: draft.condition,
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

  const openOrders = (receipts.data?.orders ?? []).filter((order) => order.status === 'ORDERED' || order.status === 'PARTIAL');
  const chosenOrder = openOrders.find((order) => order.id === purchaseId) ?? null;
  const ready =
    receipt.length > 0 &&
    !saving &&
    (opening || Boolean(purchaseId)) &&
    (opening || supplierInvoice.trim().length > 0) &&
    receipt.every(
      (line) =>
        line.qty > 0 &&
        line.qty <= 1_000_000 &&
        line.expiry &&
        moneyOk(line.unitCost) &&
        moneyOk(line.sellPrice),
    );
  const pieceTotal = receipt.reduce((sum, line) => sum + line.qty + line.bonusQty, 0);
  const purchaseValue = receipt.reduce((sum, line) => {
    const each = piecesEach(line);
    const cents = Math.round(Number(line.unitCost) * 100);
    if (!Number.isFinite(cents)) return sum;
    const piece = each > 1 ? Math.round(cents / each) : cents;
    return sum + (piece * line.qty) / 100;
  }, 0);

  async function saveReceipt(post: boolean) {
    if (!ready) {
      if (!opening && !purchaseId) setNote(t('needPurchase'));
      else if (!opening && supplierInvoice.trim() === '') setNote(t('needInvoice'));
      else if (receipt.some((line) => !line.expiry)) setNote(t('entryNeedExpiry'));
      else setNote(t('entryCost'));
      return;
    }
    setNote('');
    setSaving(t('receiptSaving'));
    try {
      const result = await api<{ docNo: string; status: string; quantity: number; warnings: string[] }>('/api/v1/ops/receipts', {
        method: 'POST',
        body: JSON.stringify({
          clientKey: clientKey.current,
          purchaseId: opening ? undefined : purchaseId,
          opening,
          override: allowOver,
          supplierInvoice: supplierInvoice.trim(),
          post,
          lines: receipt.map((line) => ({
            ...(line.productId ? { productId: line.productId } : { code: line.code }),
            qty: line.qty,
            unitCost: line.unitCost,
            sellPrice: line.sellPrice || undefined,
            batchNo: writtenBatch(line.batchNo),
            expiry: line.expiry,
            location: line.location,
            condition: line.condition,
            manufacturedAt: line.manufacturedAt,
            serialNo: line.serialNo,
            bonusQty: line.bonusQty,
            unitCode: line.unitCode,
            pack: { outer: line.outer, inner: line.inner, perBox: line.perBox, perInner: line.perInner },
          })),
        }),
      });
      setReceiptDoc(result.docNo);
      if (!post) {
        setNote('');
        ui.push({ tone: 'info', title: t('saved'), body: t('draftKept', { doc: result.docNo }) });
        return;
      }
      ui.push({
        tone: result.warnings.length ? 'watch' : 'info',
        title: t('posted'),
        body: result.warnings.length ? t('shortShelf') : `${result.docNo} · ${showCount(result.quantity, ui.language)}`,
      });
      setReceipt([]);
      setDraft(blankDraft());
      setPick('');
      setSupplierInvoice('');
      setReceiptDoc('');
      setEntryOpen(false);
      clientKey.current = crypto.randomUUID();
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
  const catalogReady = hitQuery === pick.trim();
  const linked = new Set(
    needle.length >= 2 && catalogReady
      ? hits.flatMap((item) => [item.code.toLowerCase(), item.genericName.toLowerCase(), ...(item.aliases ?? []).map((alias) => alias.toLowerCase())])
      : [],
  );
  const locals = (data?.products ?? [])
    .filter((product) => {
      if (!needle) return true;
      const own = [product.sku, product.nameAr, product.nameEn, product.genericName, product.gtin ?? '', product.strength, product.form].some((value) =>
        value.toLowerCase().includes(needle),
      );
      return own || linked.has(product.sku.toLowerCase()) || linked.has(product.genericName.toLowerCase());
    })
    .slice(0, needle ? 12 : 8);
  const localKeys = new Set(locals.flatMap((product) => [product.sku, product.gtin ?? '']));
  const library = catalogReady
    ? hits.filter((item) => !(localKeys.has(item.code) || (item.gtin && localKeys.has(item.gtin)))).slice(0, 24)
    : [];

  return (
    <Page title={t('inventory')} error={note || error}>
      <section className="kpis">
        <article className="kpi">
          <em>{t('invReady')}</em>
          <strong>{showCount(data?.stocking?.awaitingPosting ?? 0, ui.language)}</strong>
        </article>
        <article className="kpi">
          <em>{t('invPendingQty')}</em>
          <strong>{showCount(data?.stocking?.pendingQty ?? 0, ui.language)}</strong>
        </article>
        <article className="kpi">
          <em>{t('invNewStock')}</em>
          <strong>{showCount(data?.stocking?.newlyStocked ?? 0, ui.language)}</strong>
        </article>
        <article className="kpi">
          <em>{t('invOnHand')}</em>
          <strong>{showCount(data?.stocking?.availableQty ?? 0, ui.language)}</strong>
        </article>
      </section>
      <form
        className="panel-card entry-card"
        onSubmit={(event) => {
          event.preventDefault();
          setSeedScan(scanCode.trim());
          setPostOpen(true);
        }}
      >
        <div className="entry-top">
          <h2>
            {t('invNew')}
            <HelpTip text={t('hintInventory')} />
          </h2>
          <p className="lede">{t('receiveHelp')}</p>
          <div className="row">
            <button className="primary fit" type="submit">
              {t('invNew')}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setOpening(true);
                setPurchaseId('');
                setDraft(blankDraft());
                setDraftNote('');
                setEntryOpen(true);
              }}
            >
              {t('openingBalance')}
            </button>
          </div>
        </div>
        <label className="field">
          <span>{t('scan')}</span>
          <input
            ref={scanRef}
            value={scanCode}
            placeholder={t('invScan')}
            onChange={(event) => setScanCode(event.target.value)}
          />
        </label>
      </form>
      {postOpen ? (
        <StockPostDialog
          seed={seedScan}
          onClose={() => setPostOpen(false)}
          onPosted={(docNo, quantity) => {
            clearInventoryDraft();
            ui.push({ tone: 'info', title: t('posted'), body: `${t('invPostedOk', { doc: docNo })} · ${showCount(quantity, ui.language)}` });
            setPostOpen(false);
            setScanCode('');
            setSeedScan('');
            setTick((value) => value + 1);
          }}
        />
      ) : null}
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
                <h2>{t('openingBalance')}</h2>
                <button className="ghost" type="button" onClick={() => setEntryOpen(false)}>
                  {t('entryClose')}
                </button>
              </div>
              <div className="entry-money">
                <label className="field">
                  <span>{t('receiptRef')}</span>
                  <input readOnly value={receiptDoc || '—'} />
                </label>
                <label className="field">
                  <span>{t('receivedOn')}</span>
                  <input readOnly value={new Date().toISOString().slice(0, 10)} />
                </label>
                <label className="field">
                  <span>{t('supplierInvoice')}</span>
                  <input value={supplierInvoice} onChange={(event) => setSupplierInvoice(event.target.value)} />
                </label>
              </div>
              <p className="lede">{t('receivedByYou')}</p>
              <label className="checkline">
                <input type="checkbox" checked readOnly />
                {t('openingBalance')}
              </label>
              <label className="checkline">
                <input type="checkbox" checked={allowOver} onChange={(event) => setAllowOver(event.target.checked)} />
                {t('allowOver')}
              </label>
              {chosenOrder ? (
                <ul className="med-list">
                  {chosenOrder.lines.map((line) => {
                    const left = line.qty - line.receivedQty;
                    return (
                      <li key={line.id}>
                        <button
                          type="button"
                          className="med-row"
                          onClick={() => {
                            const product = data?.products.find((item) => item.id === line.productId);
                            if (!product) return;
                            fillProduct(product, null);
                            setDraft((current) =>
                              current
                                ? { ...current, outer: 'PIECE', count: Math.max(left, 1), unitCost: line.unitCost || current.unitCost, batchNo: current.batchNo || 'N/A' }
                                : current,
                            );
                          }}
                        >
                          <strong>{label(line, ui.language)}</strong>
                          <small>
                            {t('remainingQty')} {showCount(left, ui.language)} / {showCount(line.qty, ui.language)}
                          </small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
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
                  {needle.length >= 2 && catalogReady && locals.length === 0 && library.length === 0 ? <LibraryRequest query={pick} /> : null}
                  {!needle && locals.length === 0 && library.length === 0 ? <p className="lede">{t('entryNone')}</p> : null}
                </>
              )}
              {draft.code || draft.productId ? (
                <div className="pack-body">
                  <div className="entry-fast">
                    <label className={`field${moneyOk(draft.sellPrice) ? '' : ' bad'}`}>
                      <span>{draft.outer === 'PIECE' ? t('price') : t('containerPrice')}</span>
                      <input
                        ref={priceRef}
                        required
                        inputMode="decimal"
                        value={draft.sellPrice}
                        onChange={(event) => setDraft({ ...draft, sellPrice: event.target.value })}
                      />
                    </label>
                    <label className={`field${moneyOk(draft.unitCost) ? '' : ' bad'}`}>
                      <span>{draft.outer === 'PIECE' ? t('cost') : t('containerCost')}</span>
                      <input required inputMode="decimal" value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>{t('mfrBatch')}</span>
                      <input value={draft.batchNo} placeholder="N/A" onChange={(event) => setDraft({ ...draft, batchNo: event.target.value })} />
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
                  <label className="field">
                    <span>{t('lotCondition')}</span>
                    <select value={draft.condition} onChange={(event) => setDraft({ ...draft, condition: event.target.value as EntryDraft['condition'] })}>
                      <option value="AVAILABLE">{t('condAvailable')}</option>
                      <option value="REJECTED">{t('condRejected')}</option>
                      <option value="QUARANTINE">{t('condQuarantine')}</option>
                      <option value="DAMAGED">{t('condDamaged')}</option>
                    </select>
                  </label>
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
                  {draft.outer !== 'PIECE' ? <p className="lede">{t('containerPriceNote')}</p> : null}
                  <button type="button" className="ghost" onClick={() => setDraft({ ...draft, more: !draft.more })}>
                    {t('entryMore')}
                  </button>
                  {draft.more || draft.trackSerial ? (
                    <div className="entry-money">
                      <label className="field">
                        <span>{t('batch')}</span>
                        <input value={draft.batchNo} placeholder="N/A" onChange={(event) => setDraft({ ...draft, batchNo: event.target.value })} />
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
            {receipt.length > 0 ? (
              <div className="sheet receipt-mini">
                <table>
                  <thead>
                    <tr>
                      <th>{t('entryMedicine')}</th>
                      <th>{t('mfrBatch')}</th>
                      <th>{t('qty')}</th>
                      <th>{t('cost')}</th>
                      <th>{t('price')}</th>
                      <th>{t('expiry')}</th>
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
                        <td>
                          <input value={line.batchNo} placeholder="N/A" onChange={(event) => setReceipt((rows) => rows.map((row) => (row.key === line.key ? { ...row, batchNo: event.target.value } : row)))} />
                        </td>
                        <td>
                          <input
                            inputMode="numeric"
                            value={String(line.qty)}
                            onChange={(event) => {
                              const qty = Number(event.target.value);
                              if (!Number.isInteger(qty)) return;
                              setReceipt((rows) => rows.map((row) => (row.key === line.key ? { ...row, qty } : row)));
                            }}
                          />
                        </td>
                        <td>
                          <input value={line.unitCost} onChange={(event) => setReceipt((rows) => rows.map((row) => (row.key === line.key ? { ...row, unitCost: event.target.value } : row)))} />
                        </td>
                        <td>
                          <input value={line.sellPrice} onChange={(event) => setReceipt((rows) => rows.map((row) => (row.key === line.key ? { ...row, sellPrice: event.target.value } : row)))} />
                        </td>
                        <td>
                          <input type="date" value={line.expiry} onChange={(event) => setReceipt((rows) => rows.map((row) => (row.key === line.key ? { ...row, expiry: event.target.value } : row)))} />
                        </td>
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
            ) : (
              <p className="lede">{t('entryEmpty')}</p>
            )}
            {note ? <p className="error">{note}</p> : null}
            <div className="pack-bar">
              <p className="pack-total">
                {t('receiptMedicines')} {showCount(receipt.length, ui.language)} · {t('receiptQty')} {showCount(pieceTotal, ui.language)} · {t('receiptValue')} {purchaseValue.toFixed(2)}
              </p>
              {draft.code || draft.productId ? (
                <button className="primary fit" type="submit">
                  {t('entryKeep')}
                </button>
              ) : null}
              <button className="ghost" type="button" disabled={Boolean(saving)} onClick={() => saveReceipt(false)}>
                {t('saveDraft')}
              </button>
              <button className="primary" type="button" disabled={!ready} onClick={() => saveReceipt(true)}>
                {saving || t('saveClose')}
              </button>
            </div>
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
                    <td>{order.lines.map((line) => `${label(line, ui.language)} × ${showCount(line.qty, ui.language)}`).join(' · ')}</td>
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
    lines?: { nameAr: string; nameEn: string; qty: number; lineTotal: string }[];
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
              <th>{t('drug')}</th>
              <th>{t('qty')}</th>
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
                <td>{(sale.lines ?? []).map((line) => label(line, ui.language)).join(' · ')}</td>
                <td>{(sale.lines ?? []).map((line) => showCount(line.qty, ui.language)).join(' · ')}</td>
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
  stocking?: Stocking;
  canCreateSupplier?: boolean;
  suppliers: (Named & { balance: string; phone: string | null; city?: string | null; system?: boolean })[];
  products: BuyProduct[];
  orders: {
    id: string;
    docNo: string;
    total: string;
    orderedAt: string;
    supplierAr: string;
    supplierEn: string;
    status: string;
    stockStatus?: string;
    lines: {
      id: string;
      productId: string;
      qty: number;
      receivedQty: number;
      unitCost: string;
      lineTotal: string;
      nameAr: string;
      nameEn: string;
      strength?: string;
      form?: string;
    }[];
  }[];
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function supplierRequestDocument(input: {
  arabic: boolean;
  title: string;
  pharmacy: string;
  code: string;
  phone: string;
  docNo: string;
  supplier: string;
  supplierPhone: string;
  priority: string;
  notes: string;
  medicine: string;
  pack: string;
  pieces: string;
  totalLabel: string;
  total: string;
  lines: { name: string; detail: string; pack: string; qty: string }[];
}): string {
  const rows = input.lines
    .map(
      (line, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(line.name)}<br><small>${escapeHtml(line.detail)}</small></td><td>${escapeHtml(line.pack)}</td><td>${escapeHtml(line.qty)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="${input.arabic ? 'ar' : 'en'}" dir="${input.arabic ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escapeHtml(input.title)} ${escapeHtml(input.docNo)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: "IBM Plex Sans Arabic", Tahoma, sans-serif; color: #12342c; }
      h1 { font-size: 20px; margin: 0 0 6px; }
      p { margin: 0 0 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #c9d6d1; padding: 6px 8px; text-align: start; vertical-align: top; }
      th { background: #e7f3ee; }
      td:last-child, th:last-child { text-align: end; }
      tfoot td { font-weight: 700; }
    </style></head><body>
    <h1>${escapeHtml(input.title)}</h1>
    <p>${escapeHtml(input.pharmacy)}${input.code ? ` · ${escapeHtml(input.code)}` : ''}${input.phone ? ` · ${escapeHtml(input.phone)}` : ''}</p>
    <p>${escapeHtml(input.docNo)} · ${escapeHtml(input.supplier)}${input.supplierPhone ? ` · ${escapeHtml(input.supplierPhone)}` : ''}</p>
    <p>${escapeHtml(input.priority)}</p>
    ${input.notes ? `<p>${escapeHtml(input.notes)}</p>` : ''}
    <table><thead><tr><th>#</th><th>${escapeHtml(input.medicine)}</th><th>${escapeHtml(input.pack)}</th><th>${escapeHtml(input.pieces)}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">${escapeHtml(input.totalLabel)}</td><td>${escapeHtml(input.total)}</td></tr></tfoot>
    </table></body></html>`;
}

function poStatusLabel(status: string, t: (key: string) => string): string {
  if (status === 'DRAFT') return t('poDraft');
  if (status === 'ORDERED') return t('poApproved');
  if (status === 'PARTIAL') return t('poPartialRecv');
  if (status === 'RECEIVED') return t('poReceived');
  if (status === 'CANCELLED') return t('poCancelled');
  return status;
}

function stockStatusLabel(status: string | undefined, t: (key: string) => string): string {
  if (status === 'PENDING') return t('stockPending');
  if (status === 'PARTIAL') return t('stockPartial');
  if (status === 'STOCKED') return t('stockFull');
  if (status === 'REJECTED') return t('stockRejected');
  return '';
}

export function PurchasingPage() {
  const [params] = useSearchParams();
  return params.get('suppliers') === '1' ? <SuppliersPage /> : <PurchaseOrders />;
}

type SupplierRow = {
  id: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  city: string;
  balance: string;
  active: boolean;
  batchNotes: string;
  receivedBatches: string[];
};

function SuppliersPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState({ nameAr: '', nameEn: '', phone: '', city: '', batchNotes: '' });
  const board = useData<{ canManage: boolean; suppliers: SupplierRow[] }>('/api/v1/ops/suppliers', tick);
  const needle = query.trim().toLowerCase();
  const rows = (board.data?.suppliers ?? []).filter((row) => {
    if (!needle) return true;
    return [row.nameAr, row.nameEn, row.phone, row.city, row.batchNotes, ...row.receivedBatches].some((value) =>
      value.toLowerCase().includes(needle),
    );
  });

  function openNew() {
    setEditing('new');
    setForm({ nameAr: '', nameEn: '', phone: '', city: '', batchNotes: '' });
  }

  function openEdit(row: SupplierRow) {
    setEditing(row.id);
    setForm({ nameAr: row.nameAr, nameEn: row.nameEn, phone: row.phone, city: row.city, batchNotes: row.batchNotes });
  }

  async function saveSupplier() {
    setNote('');
    const body = JSON.stringify(form);
    if (editing === 'new') {
      await api('/api/v1/ops/suppliers', { method: 'POST', body });
    } else if (editing) {
      await api(`/api/v1/ops/suppliers/${editing}`, { method: 'PUT', body });
    }
    setEditing(null);
    setTick((value) => value + 1);
    ui.push({ tone: 'info', title: t('saved'), body: t('saveSupplier') });
  }

  async function setActive(row: SupplierRow, active: boolean) {
    setNote('');
    await api(`/api/v1/ops/suppliers/${row.id}/active`, { method: 'POST', body: JSON.stringify({ isActive: active }) });
    setTick((value) => value + 1);
    ui.push({ tone: 'info', title: t('saved'), body: active ? t('activateSupplier') : t('deactivateSupplier') });
  }

  const ready = form.nameAr.trim().length >= 2 && form.nameEn.trim().length >= 2;

  return (
    <Page title={t('suppliers')} error={note || board.error}>
      <ol className="price-steps">
        <li className="on">{t('supplierFlow1')}</li>
        <li className={editing ? 'on' : ''}>{t('supplierFlow2')}</li>
        <li>{t('supplierFlow3')}</li>
      </ol>
      <p className="lede">{t('supplierFlowBody')}</p>
      {board.data?.canManage ? (
        <button className="primary fit" type="button" onClick={openNew}>
          {t('supplierNew')}
        </button>
      ) : null}
      <label className="field">
        <span>{t('find')}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {editing ? (
        <div className="panel-card">
          <h2>{editing === 'new' ? t('supplierNew') : t('supplierEdit')}</h2>
          <div className="modal-fields">
            <Field label={t('nameAr')} value={form.nameAr} onChange={(nameAr) => setForm({ ...form, nameAr })} />
            <Field label={t('nameEn')} value={form.nameEn} onChange={(nameEn) => setForm({ ...form, nameEn })} />
            <Field label={t('phone')} value={form.phone} onChange={(phone) => setForm({ ...form, phone })} optional />
            <Field label={t('city')} value={form.city} onChange={(city) => setForm({ ...form, city })} optional />
            <label className="field span-2">
              <span>{t('supplierBatches')}</span>
              <input value={form.batchNotes} onChange={(event) => setForm({ ...form, batchNotes: event.target.value })} />
            </label>
          </div>
          <p className="lede">{t('supplierBatchesHint')}</p>
          <div className="row">
            <button
              className="primary fit"
              type="button"
              disabled={!ready}
              onClick={() => void saveSupplier().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : t('empty')))}
            >
              {t('saveSupplier')}
            </button>
            <button className="ghost" type="button" onClick={() => setEditing(null)}>
              {t('close')}
            </button>
          </div>
        </div>
      ) : null}
      <div className="sheet">
        <table>
          <thead>
            <tr>
              <th>{t('supplier')}</th>
              <th>{t('phone')}</th>
              <th>{t('city')}</th>
              <th>{t('balance')}</th>
              <th>{t('supplierBatches')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{label(row, ui.language)}</strong>
                  <small className="lede"> {row.active ? t('supplierActive') : t('supplierInactive')}</small>
                </td>
                <td>{row.phone}</td>
                <td>{row.city}</td>
                <td>{formatMoney(row.balance)}</td>
                <td>
                  {row.batchNotes}
                  {row.receivedBatches.length > 0 ? (
                    <small className="lede">
                      {t('receivedBatches')}: {row.receivedBatches.join(ui.language.startsWith('ar') ? '، ' : ', ')}
                    </small>
                  ) : null}
                </td>
                <td>
                  {board.data?.canManage ? (
                    <div className="row">
                      <button className="ghost" type="button" onClick={() => openEdit(row)}>
                        {t('supplierEdit')}
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() =>
                          void setActive(row, !row.active).catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : t('empty')))
                        }
                      >
                        {row.active ? t('deactivateSupplier') : t('activateSupplier')}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="lede">{t('empty')}</p> : null}
    </Page>
  );
}

function PurchaseOrders() {
  const { t } = useTranslation();
  const ui = useUi();
  const word = (key: 'packBox' | 'packStrip' | 'packBottle' | 'packPiece') => t(key);
  const [tick, setTick] = useState(0);
  const { data, error } = useData<PurchaseBook>('/api/v1/ops/purchasing', tick);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [pick, setPick] = useState('');
  const scanRef = useRef<{ batch?: string } | null>(null);
  const [hits, setHits] = useState<CatalogItem[]>([]);
  const [hitQuery, setHitQuery] = useState('');
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH'>('NORMAL');
  const [orderNotes, setOrderNotes] = useState('');
  const [adding, setAdding] = useState(true);
  const [savedOrder, setSavedOrder] = useState<{ docNo: string } | null>(null);
  const [mailTo, setMailTo] = useState('');
  const [pharmacy, setPharmacy] = useState<{ nameAr: string; nameEn: string | null; phone: string | null; code: string } | null>(null);
  const [saving, setSaving] = useState('');
  const [contract, setContract] = useState({ nameAr: '', nameEn: '', phone: '', city: '' });
  const [receive, setReceive] = useState<{
    orderId: string;
    docNo: string;
    supplier: string;
    invoice: string;
    currency: 'SDG' | 'USD';
    discount: string;
    tax: string;
    charges: string;
    rate: string;
    rows: {
      key: string;
      productId: string;
      name: string;
      detail: string;
      left: number;
      qty: number;
      unitCost: string;
      batchNo: string;
      expiry: string;
      location: string;
      rejectedQty: number;
    }[];
  } | null>(null);
  const receiveKey = useRef('');

  useEffect(() => {
    const sku = new URLSearchParams(window.location.search).get('sku');
    if (!sku) return;
    setOpen(true);
    setPick(sku);
  }, []);

  useEffect(() => {
    api<Profile>('/api/v1/auth/me')
      .then((profile) =>
        setPharmacy({
          nameAr: profile.tenant.tradeNameAr,
          nameEn: profile.tenant.tradeNameEn,
          phone: profile.user.phone,
          code: profile.tenant.accountCode ?? '',
        }),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open || draft) return;
    const asked = pick.trim();
    const handle = window.setTimeout(() => {
      const q = new URLSearchParams({ q: asked });
      api<CatalogItem[]>(`/api/v1/ops/catalog?${q}`)
        .then((body) => {
          setHits(Array.isArray(body) ? body : []);
          setHitQuery(asked);
        })
        .catch(() => {
          setHits([]);
          setHitQuery(asked);
        });
    }, 180);
    return () => window.clearTimeout(handle);
  }, [open, draft, pick, tick]);

  useEffect(() => {
    if (!open || draft || !scanRef.current) return;
    const code = pick.trim().replace(/^0+/, '');
    if (code.length < 8) return;
    const stock = (data?.products ?? []).filter((row) => row.gtin.replace(/^0+/, '') === code);
    if (stock.length === 1) {
      chooseStock(stock[0]);
      return;
    }
    if (hitQuery !== pick.trim()) return;
    const found = hits.filter((item) => (item.gtin ?? '').replace(/^0+/, '') === code);
    if (stock.length === 0 && found.length === 1) chooseCatalog(found[0]);
  }, [open, draft, pick, hitQuery, hits, data]);

  const needle = pick.trim().toLowerCase();
  const catalogReady = hitQuery === pick.trim();
  const linked = new Set(
    needle.length >= 2 && catalogReady
      ? hits.flatMap((item) => [item.code.toLowerCase(), item.genericName.toLowerCase(), ...(item.aliases ?? []).map((alias) => alias.toLowerCase())])
      : [],
  );
  const stockHits = (data?.products ?? [])
    .filter((row) => {
      if (!needle) return true;
      const own = `${row.nameAr} ${row.nameEn} ${row.sku} ${row.genericName} ${row.gtin}`.toLowerCase().includes(needle);
      return own || linked.has(row.sku.toLowerCase()) || linked.has(row.genericName.toLowerCase());
    })
    .slice(0, 8);
  const library = catalogReady ? hits.filter((item) => !stockHits.some((row) => row.sku === item.code)).slice(0, 12) : [];
  const step = !supplierId ? 1 : lines.length === 0 ? 2 : 3;
  const pieceTotal = lines.reduce((sum, line) => sum + line.qty + line.bonusQty, 0);
  const supplier = data?.suppliers.find((row) => row.id === supplierId);
  const supplierName = supplier ? label(supplier, ui.language) : '';
  const priorityLabel = priority === 'LOW' ? t('priorityLow') : priority === 'HIGH' ? t('priorityHigh') : t('priorityNormal');

  function requestDocument(docNo: string) {
    const arabic = ui.language.startsWith('ar');
    return supplierRequestDocument({
      arabic,
      title: t('orderReport'),
      pharmacy: pharmacy ? label({ nameAr: pharmacy.nameAr, nameEn: pharmacy.nameEn ?? pharmacy.nameAr }, ui.language) : '',
      code: pharmacy?.code ?? '',
      phone: pharmacy?.phone ?? '',
      docNo,
      supplier: supplierName,
      supplierPhone: supplier?.phone ?? '',
      priority: `${t('priority')}: ${priorityLabel}`,
      notes: orderNotes.trim(),
      medicine: t('entryMedicine'),
      pack: t('packHow'),
      pieces: t('packPiece'),
      totalLabel: t('orderTotal'),
      total: showCount(pieceTotal, ui.language),
      lines: lines.map((line) => ({
        name: line.name,
        detail: line.detail,
        pack: line.packText,
        qty: showCount(line.qty, ui.language),
      })),
    });
  }

  function printRequest(docNo: string) {
    const popup = window.open('', 'po-request', 'noopener,width=900,height=700');
    if (!popup) return;
    popup.document.write(requestDocument(docNo));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function downloadRequest(docNo: string) {
    const blob = new Blob([requestDocument(docNo)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docNo || 'purchase-request'}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function emailRequest(docNo: string) {
    const address = mailTo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setNote(t('needSupplierEmail'));
      return;
    }
    const body = [
      t('orderReport'),
      docNo,
      supplierName,
      '',
      ...lines.map((line, index) => `${index + 1}. ${line.name} — ${line.packText} — ${showCount(line.qty, ui.language)}`),
      '',
      `${t('orderTotal')}: ${showCount(pieceTotal, ui.language)}`,
    ].join('\n');
    window.open(`mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(`${t('orderReport')} ${docNo}`)}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
  }

  function closeOrder() {
    if (saving) return;
    setOpen(false);
    if (savedOrder) {
      setLines([]);
      setDraft(null);
      setSavedOrder(null);
      setOrderNotes('');
      setMailTo('');
      setAdding(true);
    }
  }

  function scannedBatch() {
    const batch = scanRef.current?.batch?.trim() ?? '';
    scanRef.current = null;
    if (!batch || batch.toUpperCase() === 'N/A' || batch.toUpperCase() === 'OPEN') return 'N/A';
    return batch.slice(0, 64);
  }

  function onFind(value: string) {
    const parsed = parseGs1(value);
    if (parsed?.gtin) {
      scanRef.current = { batch: parsed.batch };
      setPick(parsed.gtin.replace(/^0+/, '') || parsed.gtin);
      return;
    }
    scanRef.current = null;
    setPick(value);
  }

  function chooseTyped() {
    const code = pick.trim().replace(/^0+/, '');
    const same = (gtin: string, sku: string) => {
      const bare = gtin.replace(/^0+/, '');
      return (bare !== '' && bare === code) || sku.toLowerCase() === pick.trim().toLowerCase();
    };
    const stock = stockHits.find((row) => same(row.gtin, row.sku)) ?? (stockHits.length === 1 ? stockHits[0] : undefined);
    if (stock && (stockHits.length === 1 || same(stock.gtin, stock.sku))) {
      chooseStock(stock);
      return;
    }
    const item = library.find((row) => same(row.gtin ?? '', row.code)) ?? (library.length === 1 ? library[0] : undefined);
    if (item && (library.length === 1 || same(item.gtin ?? '', item.code))) chooseCatalog(item);
  }

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
      batchNo: scannedBatch(),
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
      batchNo: scannedBatch(),
    });
    setNote('');
  }

  function addLine(keepOpen: boolean) {
    if (!draft || (!draft.code && !draft.productId)) {
      setNote(t('entryPickFirst'));
      return;
    }
    if (draft.sellPrice !== '' && !moneyOk(draft.sellPrice)) {
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
        batchNo: writtenBatch(draft.batchNo),
        manufacturedAt: draft.manufacturedAt,
        expiry: draft.expiry,
        serialNo: draft.serialNo,
        unitCost: draft.unitCost,
        sellPrice: draft.sellPrice,
        location: draft.location,
        unitCode: draft.outer,
        outer: draft.outer,
        inner: draft.inner,
        perBox: draft.perBox,
        perInner: draft.perInner,
        trackSerial: draft.trackSerial,
        condition: draft.condition,
      },
    ]);
    setNote('');
    setAdding(keepOpen);
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
          priority,
          notes: orderNotes,
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
            pack: { outer: line.outer, inner: line.inner, perBox: line.perBox, perInner: line.perInner },
          })),
        }),
      });
      ui.push({ tone: 'info', title: t('posted'), body: `${result.docNo} · ${t('buyOrdered')}` });
      setSavedOrder({ docNo: result.docNo });
      setAdding(false);
      setDraft(null);
      setTick((value) => value + 1);
    } catch (err) {
      setNote(err instanceof Error ? err.message : t('entryCost'));
    } finally {
      setSaving('');
    }
  }

  function beginReceive(order: PurchaseBook['orders'][number]) {
    receiveKey.current = crypto.randomUUID();
    setReceive({
      orderId: order.id,
      docNo: order.docNo,
      supplier: label({ nameAr: order.supplierAr, nameEn: order.supplierEn }, ui.language),
      invoice: '',
      currency: 'SDG',
      discount: '0.00',
      tax: '0.00',
      charges: '0.00',
      rate: '',
      rows: order.lines
        .filter((line) => line.qty - line.receivedQty > 0)
        .map((line) => {
          const product = data?.products.find((row) => row.id === line.productId);
          const left = line.qty - line.receivedQty;
          return {
            key: line.id,
            productId: line.productId,
            name: label(line, ui.language),
            detail: `${line.strength ?? ''} · ${line.form ?? ''}`,
            left,
            qty: left,
            unitCost: line.unitCost && line.unitCost !== '0.00' ? line.unitCost : '',
            batchNo: 'N/A',
            expiry: '',
            location: placeFor([line.nameAr, line.nameEn, line.strength, line.form, product?.genericName]),
            rejectedQty: 0,
          };
        }),
    });
    setNote('');
    void api<{ rate: string; status?: string }[]>('/api/v1/ops/prices/rates')
      .then((rows) => {
        const approved = rows.find((row) => !row.status || row.status === 'APPROVED');
        setReceive((current) => (current && current.orderId === order.id ? { ...current, rate: approved?.rate ?? '' } : current));
      })
      .catch(() => undefined);
  }

  async function postReceive() {
    if (!receive) return;
    const lines = receive.rows.filter((row) => row.qty > 0);
    if (receive.invoice.trim() === '') {
      setNote(t('needInvoice'));
      return;
    }
    if (lines.length === 0 || lines.some((row) => !moneyOk(row.unitCost) || Number(row.unitCost) <= 0 || row.expiry === '')) {
      setNote(lines.some((row) => row.expiry === '') ? t('entryNeedExpiry') : t('entryCost'));
      return;
    }
    setSaving(t('receiptSaving'));
    setNote('');
    try {
      const result = await api<{ docNo: string }>('/api/v1/ops/receipts', {
        method: 'POST',
        body: JSON.stringify({
          clientKey: receiveKey.current,
          purchaseId: receive.orderId,
          supplierInvoice: receive.invoice.trim(),
          currency: receive.currency,
          discount: receive.discount || '0.00',
          tax: receive.tax || '0.00',
          charges: receive.charges || '0.00',
          post: true,
          lines: lines.map((row) => ({
            productId: row.productId,
            qty: row.qty,
            unitCost: row.unitCost,
            batchNo: writtenBatch(row.batchNo),
            expiry: row.expiry,
            location: row.location,
            rejectedQty: row.rejectedQty,
            condition: 'AVAILABLE',
          })),
        }),
      });
      ui.push({ tone: 'info', title: t('posted'), body: `${result.docNo} · ${t('receiveSaved')}` });
      setReceive(null);
      setTick((value) => value + 1);
    } catch (err) {
      setNote(err instanceof Error ? err.message : t('needBatch'));
    } finally {
      setSaving('');
    }
  }

  return (
    <Page title={t('procurement')} error={error}>
      <section className="kpis">
        <article className="kpi">
          <em>{t('buyPendingReceipts')}</em>
          <strong>{showCount(data?.stocking?.pendingReceipts ?? 0, ui.language)}</strong>
        </article>
        <article className="kpi">
          <em>{t('buyReceived')}</em>
          <strong>{showCount(data?.stocking?.receivedLines ?? 0, ui.language)}</strong>
        </article>
        <article className="kpi">
          <em>{t('buyAwaiting')}</em>
          <strong>{showCount(data?.stocking?.awaitingPosting ?? 0, ui.language)}</strong>
          <small>{showCount(data?.stocking?.pendingQty ?? 0, ui.language)}</small>
        </article>
        <article className="kpi">
          <em>{t('buyStocked')}</em>
          <strong>{showCount(data?.stocking?.fullyStocked ?? 0, ui.language)}</strong>
        </article>
      </section>
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
                    <small>{poStatusLabel(order.status, t)}{stockStatusLabel(order.stockStatus, t) ? ` · ${stockStatusLabel(order.stockStatus, t)}` : ''}</small>
                  </td>
                  <td>{label({ nameAr: order.supplierAr, nameEn: order.supplierEn }, ui.language)}</td>
                  <td>{order.lines.map((line) => `${label(line, ui.language)} × ${showCount(line.qty, ui.language)}`).join(' · ')}</td>
                  <td>{showCount(order.lines.reduce((sum, line) => sum + line.qty, 0), ui.language)}</td>
                  <td>{formatMoney(order.total)} {t('sdg')}</td>
                  <td>
                    <div className="row">
                      {order.status === 'ORDERED' || order.status === 'PARTIAL' ? (
                        <button className="primary fit" type="button" onClick={() => beginReceive(order)}>
                          {order.status === 'PARTIAL' ? t('buyPartial') : t('receiveThis')}
                        </button>
                      ) : null}
                      {order.stockStatus === 'PENDING' || order.stockStatus === 'PARTIAL' ? (
                        <Link className="ghost" to="/app/inventory">
                          {t('stockThis')}
                        </Link>
                      ) : null}
                      {order.stockStatus === 'STOCKED' ? <em className="med-tag stock">{t('stockFull')}</em> : null}
                    </div>
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
                <td>
                  {label(supplier, ui.language)}
                  {supplier.system ? <em className="med-tag lib">{t('systemSupplier')}</em> : <em className="med-tag stock">{t('contractSupplier')}</em>}
                  {supplier.city ? <small> {supplier.city}</small> : null}
                </td>
                <td>{formatMoney(supplier.balance)} {t('sdg')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.canCreateSupplier ? (
        <form
          className="panel-card"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              try {
                const saved = await api<{ id: string; created: boolean; nameAr: string; nameEn: string }>('/api/v1/ops/suppliers', {
                  method: 'POST',
                  body: JSON.stringify(contract),
                });
                ui.push({
                  tone: 'info',
                  title: t('saved'),
                  body: saved.created ? t('supplierAdded') : t('supplierFound'),
                });
                setSupplierId(saved.id);
                setContract({ nameAr: '', nameEn: '', phone: '', city: '' });
                setTick((value) => value + 1);
              } catch (caught) {
                ui.push({ tone: 'urgent', title: t('addSupplier'), body: caught instanceof Error ? caught.message : t('empty') });
              }
            })();
          }}
        >
          <h2>{t('addSupplier')}</h2>
          <div className="form-grid">
            <Field label={t('nameAr')} value={contract.nameAr} onChange={(nameAr) => setContract({ ...contract, nameAr })} />
            <Field label={t('nameEn')} value={contract.nameEn} onChange={(nameEn) => setContract({ ...contract, nameEn })} />
            <Field label={t('city')} value={contract.city} onChange={(city) => setContract({ ...contract, city })} optional />
            <label className="field">
              <span>{t('phone')}</span>
              <input value={contract.phone} onChange={(event) => setContract({ ...contract, phone: event.target.value })} />
            </label>
          </div>
          <button className="primary fit" type="submit">{t('addSupplier')}</button>
        </form>
      ) : null}
      {open ? (
        <div
          className="modal-back"
          onClick={closeOrder}
        >
          <form
            className="modal pack-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (draft && !savedOrder) addLine(true);
            }}
          >
            <div className="entry-top">
              <h2>{t('buyNew')}</h2>
              <button className="ghost" type="button" onClick={closeOrder}>
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
              <select value={supplierId} disabled={Boolean(savedOrder)} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="" />
                {data?.suppliers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {label(row, ui.language)}
                  </option>
                ))}
              </select>
            </label>
            {(data?.suppliers.length ?? 0) === 0 ? <p className="lede">{t('buyNeedSupplier')}</p> : null}
            {!savedOrder && draft ? (
              <button className="med-row" type="button" onClick={() => setDraft(null)}>
                <strong>{draft.name}</strong>
                <small>{draft.detail}</small>
                <em className="med-tag stock">{t('entryChange')}</em>
              </button>
            ) : !savedOrder && (lines.length === 0 || adding) ? (
              <>
                <label className="field">
                  <span>{t('find')}</span>
                  <input
                    value={pick}
                    placeholder={t('findScan')}
                    onChange={(event) => onFind(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      chooseTyped();
                    }}
                    autoFocus
                  />
                </label>
                <p className="lede">{t('findScan')}</p>
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
                {needle.length >= 2 && catalogReady && stockHits.length === 0 && library.length === 0 ? <LibraryRequest query={pick} /> : null}
                {needle.length < 2 && stockHits.length === 0 && library.length === 0 ? <p className="lede">{t('entryNone')}</p> : null}
              </>
            ) : null}
            {draft ? (
              <div className="pack-body">
                <RequestPack draft={draft} onChange={setDraft} />
                <p className="lede">{t('buyNoCost')}</p>
                <p className="lede">{t('containerPriceNote')}</p>
                <button type="button" className="ghost" onClick={() => setDraft({ ...draft, more: !draft.more })}>
                  {t('entryMore')}
                </button>
                {draft.more || draft.trackSerial ? (
                  <div className="entry-money">
                    <label className="field">
                      <span>{t('batch')}</span>
                      <input value={draft.batchNo} placeholder="N/A" onChange={(event) => setDraft({ ...draft, batchNo: event.target.value })} />
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
              <section className="order-report">
                <h3>{t('orderReport')}</h3>
                <p className="lede">{savedOrder ? t('orderSaved', { doc: savedOrder.docNo }) : t('orderReportHint')}</p>
                <p>
                  <strong>{supplierName || t('supplier')}</strong>
                  {supplier?.phone ? <small> · {supplier.phone}</small> : null}
                  {supplier?.city ? <small> · {supplier.city}</small> : null}
                </p>
                {savedOrder ? (
                  <p>{priorityLabel}{orderNotes.trim() ? ` · ${orderNotes.trim()}` : ''}</p>
                ) : (
                  <>
                    <label className="field">
                      <span>{t('priority')}</span>
                      <select value={priority} onChange={(event) => setPriority(event.target.value as 'LOW' | 'NORMAL' | 'HIGH')}>
                        <option value="LOW">{t('priorityLow')}</option>
                        <option value="NORMAL">{t('priorityNormal')}</option>
                        <option value="HIGH">{t('priorityHigh')}</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{t('notes')}</span>
                      <input value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} />
                    </label>
                  </>
                )}
                <div className="sheet receipt-mini">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('entryMedicine')}</th>
                        <th>{t('packHow')}</th>
                        <th>{t('packPiece')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => (
                        <tr key={line.key}>
                          <td>{index + 1}</td>
                          <td>
                            <strong>{line.name}</strong>
                            <small>{line.detail}</small>
                          </td>
                          <td>{line.packText}</td>
                          <td>{showCount(line.qty, ui.language)}</td>
                          <td>
                            {savedOrder ? null : (
                              <button type="button" className="ghost" onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}>
                                {t('entryRemove')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="pack-total">{t('orderPieces', { count: showCount(pieceTotal, ui.language) })}</p>
                {!savedOrder && !draft && !adding ? (
                  <button className="ghost" type="button" onClick={() => setAdding(true)}>
                    {t('addAnother')}
                  </button>
                ) : null}
                {savedOrder ? (
                  <div className="order-send">
                    <button className="primary fit" type="button" onClick={() => printRequest(savedOrder.docNo)}>
                      {t('printOrder')}
                    </button>
                    <button className="ghost" type="button" onClick={() => downloadRequest(savedOrder.docNo)}>
                      {t('downloadOrder')}
                    </button>
                    <label className="field">
                      <span>{t('supplierEmail')}</span>
                      <input type="email" value={mailTo} onChange={(event) => setMailTo(event.target.value)} />
                    </label>
                    <button className="ghost" type="button" onClick={() => emailRequest(savedOrder.docNo)}>
                      {t('emailOrder')}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}
            {note ? <p className="error">{note}</p> : null}
            {saving ? <p className="lede">{saving}</p> : null}
            {savedOrder ? null : (
              <button className="primary" type="button" disabled={Boolean(saving) || lines.length === 0 || !supplierId} onClick={save}>
                {saving || t('buySave')}
              </button>
            )}
          </form>
        </div>
      ) : null}
      {receive ? (
        <div className="modal-back" onClick={() => { if (!saving) setReceive(null); }}>
          <form
            className="modal pack-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void postReceive();
            }}
          >
            <div className="entry-top">
              <h2>{t('receiveGoods')}</h2>
              <button className="ghost" type="button" onClick={() => setReceive(null)}>
                {t('entryClose')}
              </button>
            </div>
            <p className="lede">
              {receive.docNo} · {receive.supplier}
            </p>
            <div className="entry-money">
              <label className="field">
                <span>{t('supplierInvoice')}</span>
                <input value={receive.invoice} onChange={(event) => setReceive({ ...receive, invoice: event.target.value })} />
              </label>
              <label className="field">
                <span>{t('currency')}</span>
                <select value={receive.currency} onChange={(event) => setReceive({ ...receive, currency: event.target.value as 'SDG' | 'USD' })}>
                  <option value="SDG">SDG</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="field">
                <span>{t('discount')}</span>
                <input inputMode="decimal" value={receive.discount} onChange={(event) => setReceive({ ...receive, discount: event.target.value })} />
              </label>
              <label className="field">
                <span>{t('tax')}</span>
                <input inputMode="decimal" value={receive.tax} onChange={(event) => setReceive({ ...receive, tax: event.target.value })} />
              </label>
              <label className="field">
                <span>{t('charges')}</span>
                <input inputMode="decimal" value={receive.charges} onChange={(event) => setReceive({ ...receive, charges: event.target.value })} />
              </label>
            </div>
            {receive.currency === 'USD' ? <p className="lede">{t('approvedRate')}: {receive.rate || '—'}</p> : null}
            {receive.rows.length === 0 ? <p className="lede">{t('invNone')}</p> : null}
            {receive.rows.map((row) => (
              <div className="pack-body" key={row.key}>
                <strong>{row.name}</strong>
                <small>{row.detail}</small>
                <p className="lede">{t('remainingQty')} {showCount(row.left, ui.language)}</p>
                <div className="entry-money">
                  <label className="field">
                    <span>{t('actualCost')}</span>
                    <input inputMode="decimal" value={row.unitCost} onChange={(event) => setReceive({ ...receive, rows: receive.rows.map((item) => (item.key === row.key ? { ...item, unitCost: event.target.value } : item)) })} />
                  </label>
                  <label className="field">
                    <span>{t('invQty')}</span>
                    <CountStep value={row.qty} min={0} onChange={(qty) => setReceive({ ...receive, rows: receive.rows.map((item) => (item.key === row.key ? { ...item, qty: Math.min(row.left, qty) } : item)) })} />
                  </label>
                  <label className="field">
                    <span>{t('mfrBatch')}</span>
                    <input value={row.batchNo} placeholder="N/A" onChange={(event) => setReceive({ ...receive, rows: receive.rows.map((item) => (item.key === row.key ? { ...item, batchNo: event.target.value } : item)) })} />
                  </label>
                  <label className="field">
                    <span>{t('expiry')}</span>
                    <input type="date" value={row.expiry} onChange={(event) => setReceive({ ...receive, rows: receive.rows.map((item) => (item.key === row.key ? { ...item, expiry: event.target.value } : item)) })} />
                  </label>
                  <label className="field">
                    <span>{t('rejectedQty')}</span>
                    <CountStep value={row.rejectedQty} min={0} onChange={(rejectedQty) => setReceive({ ...receive, rows: receive.rows.map((item) => (item.key === row.key ? { ...item, rejectedQty } : item)) })} />
                  </label>
                </div>
              </div>
            ))}
            <p className="pack-total">
              {t('receiptValue')} {receive.rows.reduce((sum, row) => {
                const qty = row.qty;
                const cost = Number(row.unitCost);
                if (!Number.isFinite(cost) || qty <= 0) return sum;
                const rate = receive.currency === 'USD' ? Number(receive.rate) || 0 : 1;
                return sum + Math.round(cost * rate * qty * 100) / 100;
              }, 0).toFixed(2)} SDG
            </p>
            {note ? <p className="error">{note}</p> : null}
            <button className="primary" type="submit" disabled={Boolean(saving) || receive.rows.length === 0}>
              {saving || t('receiveGoods')}
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
  phone: string | null;
  isActive: boolean;
  roles: string[];
};

const ROLE_HELP: Record<string, string> = {
  OWNER: 'roleOwner',
  BRANCH_MANAGER: 'roleManager',
  PHARMACIST: 'rolePharmacist',
  ASSISTANT_PHARMACIST: 'roleAssistant',
  CASHIER: 'roleCashier',
  STOREKEEPER: 'roleStore',
  ACCOUNTANT: 'roleAccountant',
};

export function UsersPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [params] = useSearchParams();
  const rolesView = params.get('roles') === '1';
  const [tick, setTick] = useState(0);
  const { data, error } = useData<{ users: UserRow[]; roles: { code: string; nameAr: string; nameEn: string }[] }>(
    '/api/v1/ops/users',
    tick,
  );
  const [form, setForm] = useState({ displayName: '', email: '', phone: '', password: '', roleCode: 'CASHIER', branchId: '' });
  const [note, setNote] = useState('');
  const network = useData<Network>('/api/v1/ops/network', tick);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setNote('');
    try {
      await api('/api/v1/ops/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, branchId: form.branchId || undefined }),
      });
      ui.push({ tone: 'info', title: t('saved'), body: form.displayName });
      setForm({ displayName: '', email: '', phone: '', password: '', roleCode: 'CASHIER', branchId: '' });
      setTick((value) => value + 1);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : t('empty'));
    }
  }

  async function toggle(user: UserRow) {
    await api(`/api/v1/ops/users/${user.id}/active`, {
      method: 'POST',
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    setTick((value) => value + 1);
  }

  if (rolesView) {
    return (
      <Page title={t('permissions')} error={error}>
        <p className="lede">{t('rolesLead')}</p>
        <div className="sheet">
          <table>
            <thead>
              <tr>
                <th>{t('role')}</th>
                <th>{t('permissions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.roles.map((role) => (
                <tr key={role.code}>
                  <td>{ui.language.startsWith('ar') ? role.nameAr : role.nameEn}</td>
                  <td>{ROLE_HELP[role.code] ? t(ROLE_HELP[role.code]) : role.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><Link to="/app/users">{t('addPerson')}</Link></p>
      </Page>
    );
  }

  return (
    <Page title={t('users')} error={error || note}>
      <form className="panel-card" onSubmit={createUser}>
        <div className="form-grid">
          <Field label={t('nameAr')} value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} />
          <Field label={t('userName')} value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <Field label={t('emailOptional')} value={form.email} optional onChange={(email) => setForm({ ...form, email })} />
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
              <th>{t('userName')}</th>
              <th>{t('role')}</th>
              <th>{t('active')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((user) => (
              <tr key={user.id}>
                <td>{user.displayName}</td>
                <td dir="ltr">{user.phone || '—'}</td>
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

const RECEIPT_KEYS = ['receiptWidth', 'receiptFooter', 'receiptShowPhone'];

const ALERT_STANDARD: Record<string, string> = {
  alertNearDays: '14',
  alertFastPct: '50',
  alertSlowDays: '60',
  alertDeadDays: '180',
  alertExpiryDays: '180,90,60,30,7',
  alertPricePct: '10',
  alertMinMargin: '20',
  alertPayDueDays: '7',
  alertPayTerms: '30',
  alertHistoryDays: '30',
  alertExcessDays: '180',
  alertPoDelayDays: '14',
  alertCreditLimit: '0.00',
  alertRevenueDropPct: '25',
  alertHighValue: '50000.00',
};

const ALERT_MAIN: { title: 'alertGroupStock' | 'alertGroupExpiry' | 'alertGroupMoney'; fields: { key: string; unit: 'days' | 'pct' | '' }[] }[] = [
  {
    title: 'alertGroupStock',
    fields: [
      { key: 'alertNearDays', unit: 'days' },
      { key: 'alertSlowDays', unit: 'days' },
      { key: 'alertDeadDays', unit: 'days' },
    ],
  },
  { title: 'alertGroupExpiry', fields: [{ key: 'alertExpiryDays', unit: 'days' }] },
  {
    title: 'alertGroupMoney',
    fields: [
      { key: 'alertMinMargin', unit: 'pct' },
      { key: 'alertCreditLimit', unit: '' },
    ],
  },
];

const ALERT_MORE: { key: string; unit: 'days' | 'pct' | '' }[] = [
  { key: 'alertFastPct', unit: 'pct' },
  { key: 'alertExcessDays', unit: 'days' },
  { key: 'alertPricePct', unit: 'pct' },
  { key: 'alertPayDueDays', unit: 'days' },
  { key: 'alertPayTerms', unit: 'days' },
  { key: 'alertPoDelayDays', unit: 'days' },
  { key: 'alertRevenueDropPct', unit: 'pct' },
  { key: 'alertHighValue', unit: '' },
];

const ALERT_FIELDS = [...ALERT_MAIN.flatMap((group) => group.fields), ...ALERT_MORE];

function shownExpiry(stored: string) {
  const days = stored.split(',').map((part) => Number(part.trim())).filter((part) => Number.isInteger(part) && part > 0);
  return days.length ? String(Math.max(...days)) : stored;
}

function AlertThresholds({ rows, onSaved }: { rows: { key: string; valueAr: string; valueEn: string }[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const ui = useUi();
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<{ id: string; nameAr: string; nameEn: string | null }[]>([]);
  const [canSave, setCanSave] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [expiryRaw, setExpiryRaw] = useState(ALERT_STANDARD.alertExpiryDays);
  const [note, setNote] = useState('');
  useEffect(() => {
    api<{ permissions?: string[]; network: { branches: { id: string; nameAr: string; nameEn: string | null }[] } }>('/api/v1/auth/me')
      .then((profile) => {
        setBranches(profile.network.branches);
        const perms = profile.permissions ?? [];
        setCanSave(perms.length === 0 || perms.includes('users.manage') || (perms.includes('stock.adjust') && perms.includes('accounting.view')));
      })
      .catch(() => setCanSave(false));
  }, []);
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const field of ALERT_FIELDS) {
      const scoped = branch ? rows.find((row) => row.key === `${field.key}@${branch}`) : undefined;
      next[field.key] = (scoped ?? rows.find((row) => row.key === field.key))?.valueEn || ALERT_STANDARD[field.key];
    }
    const storedExpiry = next.alertExpiryDays || ALERT_STANDARD.alertExpiryDays;
    setExpiryRaw(storedExpiry);
    next.alertExpiryDays = shownExpiry(storedExpiry);
    setDraft(next);
  }, [rows, branch]);
  function unitLabel(unit: 'days' | 'pct' | '') {
    if (unit === 'days') return t('alertUnitDays');
    if (unit === 'pct') return '%';
    return '';
  }
  function limitRow(field: { key: string; unit: 'days' | 'pct' | '' }) {
    return (
      <label className="limit-row" key={field.key}>
        <span>{t(field.key)}</span>
        <input
          value={draft[field.key] ?? ''}
          inputMode="decimal"
          disabled={!canSave}
          onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
        />
        <small>{unitLabel(field.unit)}</small>
      </label>
    );
  }
  return (
    <form
      className="panel-card"
      onSubmit={(event) => {
        event.preventDefault();
        setNote('');
        void Promise.all(ALERT_FIELDS.map((field) => {
          const stored = branch ? `${field.key}@${branch}` : field.key;
          const shown = draft[field.key] ?? '';
          const value = field.key === 'alertExpiryDays' && shown === shownExpiry(expiryRaw) ? expiryRaw : shown;
          return api('/api/v1/ops/settings', { method: 'PUT', body: JSON.stringify({ key: stored, valueAr: value, valueEn: value }) });
        }))
          .then(() => {
            ui.push({ tone: 'info', title: t('saved'), body: t('alertThresholds') });
            onSaved();
          })
          .catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : t('empty')));
      }}
    >
      <h2>{t('alertThresholds')}</h2>
      <p className="lede">{t('alertStandardLead')}</p>
      {branches.length > 1 ? (
        <label className="field">
          <span>{t('branches')}</span>
          <select value={branch} onChange={(event) => setBranch(event.target.value)}>
            <option value="">{t('alertBranchDefault')}</option>
            {branches.map((row) => (
              <option key={row.id} value={row.id}>{ui.language.startsWith('ar') ? row.nameAr : row.nameEn || row.nameAr}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="limit-groups">
        {ALERT_MAIN.map((group) => (
          <section key={group.title}>
            <h3>{t(group.title)}</h3>
            {group.fields.map(limitRow)}
          </section>
        ))}
        <details className="limit-more">
          <summary>{t('alertMore')}</summary>
          {ALERT_MORE.map(limitRow)}
        </details>
      </div>
      {note ? <p className="error">{note}</p> : null}
      <button className="primary fit" type="submit" disabled={!canSave}>{t('save')}</button>
    </form>
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
  const [slip, setSlip] = useState<ReceiptPreview | null>(null);
  useEffect(() => {
    if (data) setRows(data.settings);
  }, [data]);
  useEffect(() => {
    api<ReceiptPreview>('/api/v1/receipts/preview').then(setSlip).catch(() => setSlip(null));
  }, [tick]);
  useEffect(() => {
    if (window.location.hash === '#receipt') document.getElementById('receipt')?.scrollIntoView({ block: 'start' });
  }, [rows.length]);

  async function save(row: { key: string; valueAr: string; valueEn: string }) {
    await api('/api/v1/ops/settings', { method: 'PUT', body: JSON.stringify(row) });
    ui.push({ tone: 'info', title: t('saved'), body: row.key });
    setTick((value) => value + 1);
  }

  function setting(key: string) {
    return rows.find((row) => row.key === key) ?? { key, valueAr: '', valueEn: '' };
  }

  function patch(key: string, next: { valueAr: string; valueEn: string }) {
    setRows(rows.map((row) => (row.key === key ? { ...row, ...next } : row)));
  }

  const width = setting('receiptWidth');
  const footer = setting('receiptFooter');
  const phone = setting('receiptShowPhone');
  const preview = slip
    ? {
        ...slip,
        widthMm: width.valueEn === '80' ? 80 : 58,
        footerAr: footer.valueAr,
        footerEn: footer.valueEn,
        showPhone: phone.valueAr !== '0',
      }
    : null;
  const general = rows.filter((row) => !row.key.toLowerCase().startsWith('receipt') && !row.key.startsWith('alert'));

  return (
    <Page title={t('settings')} error={error}>
      <NetworkPanel />
      <p className="lede">
        {ui.language.startsWith('ar') ? data?.pharmacyAr : data?.pharmacyEn}
      </p>
      <form
        id="receipt"
        className="panel-card"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            await Promise.all([width, footer, phone].map((row) => api('/api/v1/ops/settings', { method: 'PUT', body: JSON.stringify(row) })));
            ui.push({ tone: 'info', title: t('saved'), body: t('receipt') });
            setTick((value) => value + 1);
          })();
        }}
      >
        <h2>{t('receipt')}</h2>
        <p className="lede">{t('receiptPurpose')}</p>
        <div className="form-grid">
          <label className="field">
            <span>{t('receiptPaper')}</span>
            <select
              value={width.valueEn === '80' ? '80' : '58'}
              onChange={(event) => patch('receiptWidth', { valueAr: event.target.value, valueEn: event.target.value })}
            >
              <option value="58">{t('receiptPaper58')}</option>
              <option value="80">{t('receiptPaper80')}</option>
            </select>
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={phone.valueAr !== '0'}
              onChange={(event) => patch('receiptShowPhone', { valueAr: event.target.checked ? '1' : '0', valueEn: event.target.checked ? '1' : '0' })}
            />
            {t('receiptShowPhone')}
          </label>
          <Field label={`${t('receiptFooter')} · ${t('nameAr')}`} value={footer.valueAr} onChange={(valueAr) => patch('receiptFooter', { valueAr, valueEn: footer.valueEn })} />
          <Field label={`${t('receiptFooter')} · ${t('nameEn')}`} value={footer.valueEn} onChange={(valueEn) => patch('receiptFooter', { valueAr: footer.valueAr, valueEn })} />
        </div>
        <button className="primary fit" type="submit" disabled={!RECEIPT_KEYS.every((key) => rows.some((row) => row.key === key))}>
          {t('save')}
        </button>
        {preview ? (
          <div className="desk" style={{ marginTop: 16 }}>
            <p style={{ color: '#d7efe4', margin: 0 }}>{t('receiptPreview')}</p>
            <ReceiptSlip receipt={preview} />
            <button className="primary" type="button" style={{ width: 'auto' }} onClick={() => window.print()}>
              {t('print')}
            </button>
          </div>
        ) : null}
      </form>
      <AlertThresholds rows={rows} onSaved={() => setTick((value) => value + 1)} />
      {general.map((row) => { const index = rows.indexOf(row); return (
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
      ); })}
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
  const [form, setForm] = useState({ nameAr: '', nameEn: '', city: '', addressLine: '', phone: '' });
  const [pin, setPin] = useState<{ latitude: string; longitude: string; label: string; precision: 'address' | 'city' } | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState('');

  function editPlace(patch: Partial<typeof form>) {
    setPin(null);
    setMapError('');
    setForm((current) => ({ ...current, ...patch }));
  }

  async function checkMap() {
    if (form.city.trim().length < 2 || form.addressLine.trim().length < 2) {
      setMapError(t('mapNeed'));
      return;
    }
    setMapBusy(true);
    setMapError('');
    try {
      const result = await api<{ latitude: string; longitude: string; label: string; precision: 'address' | 'city' }>('/api/v1/platform/places/check', {
        method: 'POST',
        body: JSON.stringify({ city: form.city, cityEn: form.city, addressLine: form.addressLine, stateName: '', stateEn: '' }),
      });
      setPin(result);
    } catch (caught) {
      setPin(null);
      const code = caught instanceof ApiError ? caught.fields.addressLine : '';
      setMapError(code === 'mapdown' ? t('mapDown') : t('mapMiss'));
    } finally {
      setMapBusy(false);
    }
  }

  async function addBranch(event: React.FormEvent) {
    event.preventDefault();
    if (!pin) {
      setMapError(t('mapNeed'));
      return;
    }
    await api('/api/v1/ops/branches', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        latitude: Number(pin.latitude),
        longitude: Number(pin.longitude),
      }),
    });
    ui.push({ tone: 'info', title: t('saved'), body: form.nameAr });
    setForm({ nameAr: '', nameEn: '', city: '', addressLine: '', phone: '' });
    setPin(null);
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
            <Field label={t('city')} value={form.city} onChange={(city) => editPlace({ city })} />
            <Field label={t('address')} value={form.addressLine} onChange={(addressLine) => editPlace({ addressLine })} />
            <label className="field">
              <span>{t('phone')}</span>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
          </div>
          <div className="place-check">
            <button className="ghost" type="button" disabled={mapBusy} onClick={() => void checkMap()}>
              {mapBusy ? t('pleaseWait') : t('checkMap')}
            </button>
            {mapError ? <p className="error">{mapError}</p> : null}
            {pin ? (
              <>
                <p className="lede">{pin.precision === 'city' ? t('mapCity') : t('mapAddress')} {pin.label}</p>
                <iframe title={t('checkMap')} src={mapEmbed(pin.latitude, pin.longitude)} />
              </>
            ) : null}
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
  aliases?: string[];
  modelNumber?: string;
};

type PriceBoard = {
  using: 'PHARMACY' | 'BRANCH';
  branchId: string | null;
  sellingOn: string | null;
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
  items: { productId: string; sku: string; nameAr: string; nameEn: string; amount: string; cost?: string; qty?: number; listedPrice?: string }[];
};

type PricePick = { code: string; name: string; amount: string; selected: boolean; stockPrice: string; qty: number; fresh?: boolean };

function dayAfter(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function PricesPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const [tick, setTick] = useState(0);
  const [listId, setListId] = useState('');
  const [composer, setComposer] = useState<'create' | 'add' | 'renew' | null>(null);
  const [priceStep, setPriceStep] = useState<1 | 2>(1);
  const [finder, setFinder] = useState('');
  const [chosen, setChosen] = useState<PricePick[]>([]);
  const [effectiveOn, setEffectiveOn] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [bulkValue, setBulkValue] = useState('15');
  const [bulkOp, setBulkOp] = useState('PCT');
  const [previewRows, setPreviewRows] = useState<{ sku: string; oldPrice: string; newPrice: string | null; belowCost: boolean }[]>([]);
  const [rate, setRate] = useState('');
  const [rateReason, setRateReason] = useState('');
  const [rateEffective, setRateEffective] = useState('');
  const [rateOpen, setRateOpen] = useState(false);
  const [ratePlan, setRatePlan] = useState<{
    oldRate: string;
    newRate: string;
    changePct: string;
    status: string;
    proposalId?: string;
    rows: { sku: string; nameAr: string; nameEn: string; oldPrice: string; newPrice: string; changePct: string }[];
  } | null>(null);
  const [csvText, setCsvText] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [names, setNames] = useState({ nameAr: '', nameEn: '' });
  const [adjust, setAdjust] = useState<'SAME' | 'PCT' | 'AMOUNT'>('SAME');
  const [adjustValue, setAdjustValue] = useState('10');
  const [note, setNote] = useState('');
  const rates = useData<{ rate: string; notedAt: string; status?: string }[]>('/api/v1/ops/prices/rates', tick);
  const board = useData<PriceBoard>(listId ? `/api/v1/ops/prices?listId=${listId}` : '/api/v1/ops/prices', tick);
  const branchChosen = (localStorage.getItem('dawaa.branch') ?? '') !== '' && localStorage.getItem('dawaa.branch') !== 'all';
  const sellingOn = board.data?.sellingOn ?? null;
  const dateBlocked = Boolean(sellingOn && /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) && effectiveOn <= sellingOn);

  useEffect(() => {
    if (!board.data) return;
    setAmounts(Object.fromEntries(board.data.items.map((item) => [item.productId, item.amount])));
  }, [board.data]);

  const selected = board.data?.lists.find((list) => list.id === (listId || board.data?.selectedId)) ?? null;
  const copyNameTaken = Boolean(selected && names.nameAr.trim() === selected.nameAr && names.nameEn.trim() === selected.nameEn);

  function stockOffers(mode: 'create' | 'add'): PricePick[] {
    const priced = new Set((board.data?.items ?? []).filter((item) => item.amount !== '').map((item) => item.sku));
    return (board.data?.items ?? [])
      .filter((item) => (item.qty ?? 0) > 0)
      .filter((item) => mode === 'create' || !priced.has(item.sku))
      .map((item) => {
        const stockPrice = item.listedPrice && item.listedPrice !== '0.00' ? item.listedPrice : '';
        return {
          code: item.sku,
          name: label({ nameAr: item.nameAr, nameEn: item.nameEn }, ui.language),
          amount: stockPrice,
          selected: mode === 'create' && stockPrice !== '',
          stockPrice,
          qty: item.qty ?? 0,
        };
      });
  }

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
      <ol className="price-steps">
        <li className="on">{t('priceFlow1')}</li>
        <li className={selected ? 'on' : ''}>{t('priceFlow2')}</li>
        <li className={selected?.status === 'ACTIVE' ? 'done' : ''}>{t('priceFlow3')}</li>
      </ol>
      <p className="lede">{t('priceFlowBody')}</p>
      <p className="lede">{t('priceDateRule')}</p>
      <p className="lede">{t('priceHelp')}</p>
      <div className="row">
        <button
          className="primary fit"
          type="button"
          onClick={() => {
            setComposer('create');
            setPriceStep(1);
            setFinder('');
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
              setChosen(stockOffers('add'));
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
            {selected.status === 'ACTIVE' ? t('statusActive') : selected.status === 'ARCHIVED' ? t('statusArchived') : selected.status === 'PENDING' ? t('statusPending') : selected.status === 'SCHEDULED' ? t('statusScheduled') : selected.status === 'REJECTED' ? t('statusRejected') : t('statusDraft')}
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
            <div className="row">
              <button
                className="primary fit"
                type="button"
                onClick={() => {
                  setAdjust('SAME');
                  setAdjustValue('10');
                  setNames({ nameAr: `${selected.nameAr} نسخة`, nameEn: `${selected.nameEn} copy` });
                  setPriceStep(1);
                  setFinder('');
                  setChosen([]);
                  setComposer('renew');
                }}
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
        <p className="lede">{t('approvedRate')}: {(rates.data ?? []).find((row) => !row.status || row.status === 'APPROVED')?.rate ?? '—'}</p>
        <div className="row">
          <Field label={t('newRate')} value={rate} onChange={setRate} />
          <button
            className="primary fit"
            type="button"
            onClick={() =>
              void run(async () => {
                const plan = await api<{
                  oldRate: string;
                  newRate: string;
                  changePct: string;
                  status: string;
                  proposalId?: string;
                  rows: { sku: string; nameAr: string; nameEn: string; oldPrice: string; newPrice: string; changePct: string }[];
                }>('/api/v1/ops/prices/rates/propose', { method: 'POST', body: JSON.stringify({ rate, action: 'preview' }) });
                setRatePlan(plan);
                setRateOpen(true);
              })
            }
          >
            {t('changeRate')}
          </button>
        </div>
      </div>
      {rateOpen && ratePlan ? (
        <div className="modal-back" onClick={() => setRateOpen(false)}>
          <form className="modal pack-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => event.preventDefault()}>
            <div className="entry-top">
              <h2>{t('changeRate')}</h2>
              <button className="ghost" type="button" onClick={() => setRateOpen(false)}>{t('entryClose')}</button>
            </div>
            <p className="lede">{t('oldRate')} {ratePlan.oldRate} · {t('newRate')} {ratePlan.newRate} · {ratePlan.changePct}%</p>
            <div className="sheet">
              <table>
                <thead>
                  <tr>
                    <th>{t('product')}</th>
                    <th>{t('oldPrice')}</th>
                    <th>{t('newPrice')}</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {ratePlan.rows.map((row) => (
                    <tr key={row.sku}>
                      <td>{ui.language.startsWith('ar') ? row.nameAr : row.nameEn}</td>
                      <td>{row.oldPrice}</td>
                      <td>{row.newPrice}</td>
                      <td>{row.changePct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="entry-money">
              <label className="field">
                <span>{t('rejectReason')}</span>
                <input value={rateReason} onChange={(event) => setRateReason(event.target.value)} />
              </label>
              <label className="field">
                <span>{t('effectiveOn')}</span>
                <input type="date" value={rateEffective} onChange={(event) => setRateEffective(event.target.value)} />
              </label>
            </div>
            <div className="row">
              <button className="ghost" type="button" onClick={() => void run(async () => {
                const saved = await api<{ proposalId?: string; status: string }>('/api/v1/ops/prices/rates/propose', { method: 'POST', body: JSON.stringify({ rate: ratePlan.newRate, action: 'draft', effectiveOn: rateEffective || undefined }) });
                setRatePlan({ ...ratePlan, proposalId: saved.proposalId, status: saved.status });
                ui.push({ tone: 'info', title: t('saved'), body: t('saveDraft') });
              })}>{t('saveDraft')}</button>
              <button className="ghost" type="button" disabled={!ratePlan.proposalId || rateReason.trim().length < 3} onClick={() => void run(async () => {
                await api('/api/v1/ops/prices/rates/propose', { method: 'POST', body: JSON.stringify({ rate: ratePlan.newRate, action: 'reject', proposalId: ratePlan.proposalId, reason: rateReason.trim() }) });
                setRateOpen(false);
                ui.push({ tone: 'info', title: t('rejected'), body: rateReason.trim() });
              })}>{t('rejectRate')}</button>
              <button className="ghost" type="button" onClick={() => void run(async () => {
                const saved = await api<{ proposalId?: string; status: string }>('/api/v1/ops/prices/rates/propose', { method: 'POST', body: JSON.stringify({ rate: ratePlan.newRate, action: 'submit', effectiveOn: rateEffective || undefined }) });
                setRatePlan({ ...ratePlan, proposalId: saved.proposalId, status: saved.status });
                ui.push({ tone: 'info', title: t('submitted'), body: t('rate') });
              })}>{t('submitRate')}</button>
              <button className="primary fit" type="button" disabled={!ratePlan.proposalId} onClick={() => void run(async () => {
                await api('/api/v1/ops/prices/rates/propose', { method: 'POST', body: JSON.stringify({ rate: ratePlan.newRate, action: 'approve', proposalId: ratePlan.proposalId, effectiveOn: rateEffective || undefined }) });
                setRateOpen(false);
                setTick((value) => value + 1);
                ui.push({ tone: 'info', title: t('approved'), body: t('rate') });
              })}>{t('approveRate')}</button>
            </div>
          </form>
        </div>
      ) : null}
      {!branchChosen ? <p className="lede">{t('pickBranchPrice')}</p> : null}
      {selected?.locked ? <p className="lede">{t('priceRenewHint')}</p> : null}
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
            <h2>{composer === 'create' ? t('newPriceList') : composer === 'renew' ? t('renewList') : t('addMedicines')}</h2>
            {composer === 'create' || composer === 'renew' ? (
              <ol className="price-steps">
                <li className={priceStep === 1 ? 'on' : 'done'}>{composer === 'renew' ? t('priceRenewStart') : t('priceStepDetails')}</li>
                <li className={priceStep === 2 ? 'on' : ''}>{composer === 'renew' ? t('priceRenewReview') : t('priceStepItems')}</li>
              </ol>
            ) : null}
            {composer === 'create' && priceStep === 1 ? (
              <>
                <div className="modal-fields">
                  <Field label={t('nameAr')} value={names.nameAr} onChange={(nameAr) => setNames({ ...names, nameAr })} />
                  <Field label={t('nameEn')} value={names.nameEn} onChange={(nameEn) => setNames({ ...names, nameEn })} />
                  <label className="field span-2">
                    <span>{t('effectiveOn')}</span>
                    <input
                      type="date"
                      value={effectiveOn}
                      min={sellingOn ? dayAfter(sellingOn) : undefined}
                      onChange={(event) => setEffectiveOn(event.target.value)}
                      required
                    />
                    {dateBlocked ? <small>{t('priceDateRule')}</small> : null}
                  </label>
                </div>
                <div className="row">
                  <button
                    className="primary fit"
                    type="button"
                    disabled={names.nameAr.trim() === '' || names.nameEn.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) || dateBlocked}
                    onClick={() => {
                      setChosen(stockOffers('create'));
                      setFinder('');
                      setPriceStep(2);
                    }}
                  >
                    {t('nextStep')}
                  </button>
                  <button className="ghost" type="button" onClick={() => setComposer(null)}>
                    {t('close')}
                  </button>
                </div>
              </>
            ) : null}
            {composer === 'renew' && priceStep === 1 ? (
              <>
                <p className="lede">{t('priceDateRule')}</p>
                <p className="lede">{t('priceRenewStartBody')}</p>
                <div className="modal-fields">
                  <Field label={t('nameAr')} value={names.nameAr} onChange={(nameAr) => setNames({ ...names, nameAr })} />
                  <Field label={t('nameEn')} value={names.nameEn} onChange={(nameEn) => setNames({ ...names, nameEn })} />
                  {copyNameTaken ? <p className="lede">{t('priceDateRule')}</p> : null}
                  <label className="field span-2">
                    <span>{t('renewList')}</span>
                    <select value={adjust} onChange={(event) => setAdjust(event.target.value as 'SAME' | 'PCT' | 'AMOUNT')}>
                      <option value="SAME">{t('adjustSame')}</option>
                      <option value="PCT">{t('adjustPercent')}</option>
                      <option value="AMOUNT">{t('adjustAmount')}</option>
                    </select>
                  </label>
                  {adjust === 'SAME' ? null : <Field label={adjust === 'PCT' ? '%' : t('amount')} value={adjustValue} onChange={setAdjustValue} />}
                </div>
                <div className="row">
                  <button
                    className="primary fit"
                    type="button"
                    disabled={
                      names.nameAr.trim() === '' ||
                      names.nameEn.trim() === '' ||
                      copyNameTaken ||
                      (adjust !== 'SAME' && !/^-?\d+(\.\d{1,2})?$/.test(adjustValue.trim()))
                    }
                    onClick={() => {
                      const priced = new Set((board.data?.items ?? []).filter((item) => item.amount !== '').map((item) => item.sku));
                      const current: PricePick[] = (board.data?.items ?? [])
                        .filter((item) => item.amount !== '')
                        .map((item) => ({
                          code: item.sku,
                          name: label({ nameAr: item.nameAr, nameEn: item.nameEn }, ui.language),
                          amount: previewPrice(item.amount, adjust, adjust === 'SAME' ? '0' : adjustValue),
                          selected: true,
                          stockPrice: item.amount,
                          qty: item.qty ?? 0,
                          fresh: false,
                        }));
                      const extras = (board.data?.items ?? [])
                        .filter((item) => (item.qty ?? 0) > 0 && !priced.has(item.sku))
                        .map((item) => {
                          const stockPrice = item.listedPrice && item.listedPrice !== '0.00' ? item.listedPrice : '';
                          return {
                            code: item.sku,
                            name: label({ nameAr: item.nameAr, nameEn: item.nameEn }, ui.language),
                            amount: stockPrice,
                            selected: false,
                            stockPrice,
                            qty: item.qty ?? 0,
                            fresh: true,
                          };
                        });
                      setChosen([...current, ...extras]);
                      setFinder('');
                      setPriceStep(2);
                    }}
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
            <p className="lede">{composer === 'create' ? t('priceHold') : composer === 'renew' ? t('priceRenewReviewBody') : t('addAfterSave')}</p>
            <label className="field">
              <span>{t('searchMedicines')}</span>
              <input value={finder} onChange={(event) => setFinder(event.target.value)} />
            </label>
            <div className="row">
              <button className="ghost" type="button" onClick={() => setChosen(chosen.map((row) => ({ ...row, selected: true })))}>
                {t('priceSelectAll')}
              </button>
              <button className="ghost" type="button" onClick={() => setChosen(chosen.map((row) => ({ ...row, selected: false })))}>
                {t('priceClear')}
              </button>
            </div>
            <div className="pick-list">
              {chosen
                .filter((row) => {
                  const needle = finder.trim().toLowerCase();
                  return needle === '' || row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle);
                })
                .map((row) => (
                  <div className="chosen-row" key={row.code}>
                    <label className="pick-name price-pick">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) =>
                          setChosen(chosen.map((item) => (item.code === row.code ? { ...item, selected: event.target.checked } : item)))
                        }
                      />
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {row.fresh === false
                            ? `${t('priceOnList')}${row.stockPrice ? ` · ${t('priceCurrent')} ${row.stockPrice}` : ''}`
                            : `${t('entryInStock')} · ${showCount(row.qty, ui.language)}${row.stockPrice ? ` · ${t('priceCurrent')} ${row.stockPrice}` : ''}`}
                        </small>
                      </span>
                    </label>
                    <input
                      value={row.amount}
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={!row.selected}
                      aria-label={`${t('price')} ${row.name}`}
                      onChange={(event) =>
                        setChosen(chosen.map((item) => (item.code === row.code ? { ...item, amount: event.target.value } : item)))
                      }
                    />
                  </div>
                ))}
            </div>
            {chosen.length === 0 ? <p className="lede">{t('priceNoneStock')}</p> : null}
            {finder.trim() !== '' && chosen.every((row) => !row.name.toLowerCase().includes(finder.trim().toLowerCase()) && !row.code.toLowerCase().includes(finder.trim().toLowerCase())) ? (
              <p className="lede">{t('priceNoneStock')}</p>
            ) : null}
            <div className="row">
              <button
                className="primary fit"
                type="button"
                disabled={
                  (composer !== 'renew' && !chosen.some((row) => row.selected)) ||
                  chosen.some((row) => row.selected && !/^\d+(\.\d{1,2})?$/.test(row.amount)) ||
                  (composer === 'create' && (names.nameAr.trim() === '' || names.nameEn.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) || dateBlocked)) ||
                  (composer === 'renew' && (names.nameAr.trim() === '' || names.nameEn.trim() === '' || copyNameTaken))
                }
                onClick={() =>
                  void run(async () => {
                    const items = chosen.filter((row) => row.selected).map((row) => ({ code: row.code, amount: row.amount }));
                    if (composer === 'renew' && selected) {
                      const created = await api<{ id: string }>('/api/v1/ops/prices/copy', {
                        method: 'POST',
                        body: JSON.stringify({
                          priceListId: selected.id,
                          adjust,
                          value: adjust === 'SAME' ? '0.00' : adjustValue.trim(),
                          nameAr: names.nameAr.trim(),
                          nameEn: names.nameEn.trim(),
                        }),
                      });
                      if (items.length > 0) {
                        await api('/api/v1/ops/prices/items/batch', {
                          method: 'PUT',
                          body: JSON.stringify({ priceListId: created.id, items }),
                        });
                      }
                      if (selected.isActive) {
                        await api('/api/v1/ops/prices/activate', {
                          method: 'POST',
                          body: JSON.stringify({ priceListId: created.id, useShared: false }),
                        });
                      }
                      setListId(created.id);
                      setAdjust('SAME');
                    } else if (composer === 'create') {
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
                    ui.push({
                      tone: 'info',
                      title: t('saved'),
                      body: composer === 'create' ? names.nameAr : composer === 'renew' ? t('renewList') : t('addMedicines'),
                    });
                    setComposer(null);
                    setChosen([]);
                    setPriceStep(1);
                  })
                }
              >
                {composer === 'create' ? t('saveListOnce') : composer === 'renew' ? t('renewList') : t('savePrices')}
              </button>
              {composer === 'create' || composer === 'renew' ? (
                <button className="ghost" type="button" onClick={() => setPriceStep(1)}>
                  {t('back')}
                </button>
              ) : null}
              <button className="ghost" type="button" onClick={() => setComposer(null)}>
                {t('close')}
              </button>
            </div>
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

function previewPrice(amount: string, adjust: 'SAME' | 'PCT' | 'AMOUNT', value: string): string {
  const base = Number(amount);
  if (!Number.isFinite(base) || base <= 0) return amount;
  if (adjust === 'SAME') return base.toFixed(2);
  const delta = Number(value);
  if (!Number.isFinite(delta)) return base.toFixed(2);
  const next = adjust === 'PCT' ? base * (1 + delta / 100) : base + delta;
  if (!(next > 0)) return base.toFixed(2);
  return next.toFixed(2);
}

function Field({ label, value, onChange, optional = false }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={!optional} />
    </label>
  );
}
