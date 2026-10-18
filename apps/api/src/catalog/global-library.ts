import { Prisma, type PrismaClient } from '@dawaa/db';
import { DomainError } from '../http/domain-error';
import { plainMedicineName } from '../ops/medicine-name';
import {
  INN_ALIASES,
  duplicateGroups,
  expandQuery,
  foldSearchText,
  ingredientParts,
  isSameCommercial,
  scoreLibraryRow,
  searchTokens,
  type CommercialIdentity,
  type ScoreRow,
} from './library-search';

type Db = PrismaClient | Prisma.TransactionClient;

const published = { in: ['active', 'PUBLISHED'] };

const itemInclude = {
  barcodes: true,
  units: true,
  synonyms: true,
  ingredients: { include: { ingredient: { include: { synonyms: true } } } },
} satisfies Prisma.GlobalCatalogItemInclude;

type ItemRow = Prisma.GlobalCatalogItemGetPayload<{ include: typeof itemInclude }>;

export type LibraryHit = {
  id: string;
  code: string;
  itemType: string;
  nameAr: string;
  nameEn: string;
  genericName: string;
  brandNameAr: string;
  brandNameEn: string;
  form: string;
  strength: string;
  categoryAr: string;
  categoryEn: string;
  manufacturer: string;
  gtin: string;
  unitsJson: string;
  packDescription: string;
  route: string;
  ingredients: string;
  status: string;
  isControlled: boolean;
  requiresPrescription: boolean;
  trackSerial: boolean;
  storageCondition: string;
  modelNumber: string;
  aliases: string[];
  versionNo: number;
};

function unitsJson(row: ItemRow): string {
  if (row.units.length === 0) return '{"box":1}';
  const units: Record<string, number> = {};
  for (const unit of row.units) units[unit.unitName] = unit.factorToBase;
  return JSON.stringify(units);
}

function present(row: ItemRow): LibraryHit {
  const aliases = [
    ...row.synonyms.map((synonym) => synonym.alias),
    ...row.ingredients.flatMap((link) => [link.ingredient.innEn, link.ingredient.innAr, ...link.ingredient.synonyms.map((synonym) => synonym.alias)]),
  ].filter(Boolean);
  return {
    id: row.id,
    code: row.code,
    itemType: row.itemType,
    nameAr: plainMedicineName(row.brandNameAr || row.nameAr),
    nameEn: plainMedicineName(row.brandNameEn || row.nameEn),
    genericName: plainMedicineName(row.genericName),
    brandNameAr: row.brandNameAr,
    brandNameEn: row.brandNameEn,
    form: row.dosageForm,
    strength: row.strength,
    categoryAr: row.categoryName,
    categoryEn: row.categoryName,
    manufacturer: row.manufacturer,
    gtin: row.barcodes[0]?.code ?? '',
    unitsJson: unitsJson(row),
    packDescription: [row.packSize, row.packUnit].filter(Boolean).join(' '),
    route: '',
    ingredients: row.ingredients.map((link) => link.ingredient.innEn).join(', ') || row.genericName,
    status: row.status,
    isControlled: row.isControlled,
    requiresPrescription: row.requiresPrescription,
    trackSerial: false,
    storageCondition: row.storageCondition,
    modelNumber: row.modelNumber,
    aliases: [...new Set(aliases)],
    versionNo: row.versionNo,
  };
}

function scoreOf(query: string, row: ItemRow): number {
  const hit = present(row);
  const scored: ScoreRow = {
    code: hit.code,
    nameEn: hit.nameEn,
    nameAr: hit.nameAr,
    genericName: hit.genericName,
    strength: hit.strength,
    dosageForm: hit.form,
    manufacturer: hit.manufacturer,
    brandNameEn: hit.brandNameEn,
    brandNameAr: hit.brandNameAr,
    modelNumber: hit.modelNumber,
    barcode: hit.gtin,
    aliases: hit.aliases,
    ingredients: row.ingredients.map((link) => link.ingredient.innEn),
  };
  return scoreLibraryRow(query, scored);
}

function searchForms(needle: string): string[] {
  return [...new Set(expandQuery(needle).map((value) => foldSearchText(value)).filter((value) => value.length >= 2))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 6);
}

async function matchingItemIds(db: Db, needle: string): Promise<string[]> {
  const forms = searchForms(needle);
  if (forms.length === 0) return [];
  const ids = new Set<string>();
  const add = (values: string[]) => {
    for (const value of values) ids.add(value);
  };
  const [tokenRows, directRows, synonymRows, ingredientRows] = await Promise.all([
    Promise.all(
      forms.map((form) =>
        db.globalCatalogSearchToken.findMany({
          where: { token: { startsWith: form.slice(0, 80) } },
          select: { itemId: true },
          take: 60,
        }),
      ),
    ),
    db.globalCatalogItem.findMany({
      where: {
        status: published,
        OR: [
          ...forms.flatMap((form) => [
            { code: { startsWith: form } },
            { nameEn: { startsWith: form } },
            { genericName: { startsWith: form } },
            { brandNameEn: { startsWith: form } },
            { manufacturer: { startsWith: form } },
            { modelNumber: { startsWith: form } },
          ]),
          { nameAr: { startsWith: needle } },
          { brandNameAr: { startsWith: needle } },
          { genericName: { startsWith: needle } },
          { barcodes: { some: { code: { startsWith: needle } } } },
        ],
      },
      select: { id: true },
      take: 80,
    }),
    db.globalMedicineSynonym.findMany({
      where: {
        verified: true,
        OR: forms.map((form) => ({ aliasKey: { startsWith: form.slice(0, 80) } })),
      },
      select: { itemId: true, ingredientId: true },
      take: 40,
    }),
    db.globalMedicineIngredient.findMany({
      where: { OR: forms.map((form) => ({ innEn: { startsWith: form } })) },
      select: { id: true },
      take: 12,
    }),
  ]);
  for (const rows of tokenRows) add(rows.map((row) => row.itemId));
  add(directRows.map((row) => row.id));
  add(synonymRows.map((row) => row.itemId).filter((id): id is string => Boolean(id)));
  const ingredientIds = [
    ...new Set([
      ...synonymRows.map((row) => row.ingredientId).filter((id): id is string => Boolean(id)),
      ...ingredientRows.map((row) => row.id),
    ]),
  ];
  if (ingredientIds.length > 0) {
    const links = await db.globalProductIngredient.findMany({
      where: { ingredientId: { in: ingredientIds } },
      select: { itemId: true },
      take: 80,
    });
    add(links.map((row) => row.itemId));
  }
  const lead = forms[0];
  if (ids.size < 8 && lead && lead.length >= 4) {
    const extra = await db.globalCatalogSearchToken.findMany({
      where: { token: { contains: lead.slice(0, 40) } },
      select: { itemId: true },
      take: 60,
    });
    add(extra.map((row) => row.itemId));
  }
  return [...ids].slice(0, 80);
}

export async function searchPublishedLibrary(db: Db, query: string, page = 1, take = 24): Promise<{ total: number; rows: LibraryHit[] }> {
  const skip = Math.max(0, page - 1) * take;
  const needle = query.trim();
  if (!needle) {
    const where = { status: published };
    const [total, rows] = await Promise.all([
      db.globalCatalogItem.count({ where }),
      db.globalCatalogItem.findMany({ where, orderBy: { nameEn: 'asc' }, skip, take, include: itemInclude }),
    ]);
    return { total, rows: rows.map(present) };
  }
  const ids = await matchingItemIds(db, needle);
  if (ids.length === 0) return { total: 0, rows: [] };
  const rows = await db.globalCatalogItem.findMany({
    where: { id: { in: ids }, status: published },
    include: itemInclude,
  });
  const forms = searchForms(needle);
  const ranked = rows
    .map((row) => {
      const generic = foldSearchText(row.genericName);
      const name = foldSearchText(row.brandNameEn || row.nameEn);
      const exact = forms.some((form) => generic === form || name === form) ? 80 : 0;
      return { row, score: scoreOf(needle, row) + exact };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.row.nameEn.localeCompare(right.row.nameEn));
  return { total: ranked.length, rows: ranked.slice(skip, skip + take).map((entry) => present(entry.row)) };
}

/** Rebuild prefix tokens and known ingredient links for the shared library. */
export async function rebuildSearchIndex(db: PrismaClient): Promise<{ items: number; tokens: number; links: number }> {
  const items = await db.globalCatalogItem.findMany({
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameAr: true,
      genericName: true,
      brandNameEn: true,
      brandNameAr: true,
      manufacturer: true,
      strength: true,
      dosageForm: true,
      modelNumber: true,
      barcodes: { select: { code: true } },
    },
  });
  const tokenRows: { itemId: string; token: string }[] = [];
  const linkRows: { itemId: string; ingredientId: string; strengthText: string }[] = [];
  const ingredientIds = new Map<string, string>();
  for (const entry of INN_ALIASES) {
    const ingredient = await db.globalMedicineIngredient.upsert({
      where: { innEn: entry.inn },
      create: { innEn: entry.inn, innAr: entry.ar },
      update: { innAr: entry.ar },
    });
    ingredientIds.set(entry.inn, ingredient.id);
    for (const alias of [entry.ar, ...entry.aliases]) await rememberSynonym(db, ingredient.id, alias, /[\u0600-\u06FF]/.test(alias) ? 'ar' : 'en');
  }
  for (const item of items) {
    const tokens = new Set<string>();
    const values = [
      item.code,
      item.nameEn,
      item.nameAr,
      item.genericName,
      item.brandNameEn,
      item.brandNameAr,
      item.manufacturer,
      item.strength,
      item.dosageForm,
      item.modelNumber,
      ...item.barcodes.map((barcode) => barcode.code),
    ];
    for (const value of values) {
      for (const token of searchTokens(value)) tokens.add(token.slice(0, 80));
    }
    for (const part of ingredientParts(item.genericName)) {
      const folded = foldSearchText(part);
      const known = INN_ALIASES.find((entry) => entry.inn === folded || foldSearchText(entry.ar) === folded);
      if (!known) continue;
      const ingredientId = ingredientIds.get(known.inn);
      if (ingredientId) linkRows.push({ itemId: item.id, ingredientId, strengthText: item.strength.slice(0, 80) });
      for (const alias of [known.inn, known.ar, ...known.aliases]) {
        for (const token of searchTokens(alias)) tokens.add(token.slice(0, 80));
      }
    }
    for (const token of [...tokens].slice(0, 40)) tokenRows.push({ itemId: item.id, token });
  }
  await db.globalCatalogSearchToken.deleteMany({});
  for (let offset = 0; offset < tokenRows.length; offset += 400) {
    await db.globalCatalogSearchToken.createMany({ data: tokenRows.slice(offset, offset + 400) });
  }
  const knownIngredientIds = [...ingredientIds.values()];
  const existing = knownIngredientIds.length
    ? await db.globalProductIngredient.findMany({
        where: { ingredientId: { in: knownIngredientIds } },
        select: { itemId: true, ingredientId: true },
      })
    : [];
  const have = new Set(existing.map((row) => `${row.itemId}:${row.ingredientId}`));
  const fresh = linkRows.filter((row) => !have.has(`${row.itemId}:${row.ingredientId}`));
  for (let offset = 0; offset < fresh.length; offset += 400) {
    await db.globalProductIngredient.createMany({ data: fresh.slice(offset, offset + 400) });
  }
  return { items: items.length, tokens: tokenRows.length, links: fresh.length };
}

export async function findCommercialDuplicate(
  db: Db,
  input: CommercialIdentity & { code?: string },
  exceptId?: string,
): Promise<{ id: string; code: string } | null> {
  if (input.barcode) {
    const barcode = await db.globalCatalogBarcode.findFirst({
      where: { code: input.barcode, ...(exceptId ? { itemId: { not: exceptId } } : {}) },
      include: { item: true },
    });
    if (barcode) return { id: barcode.itemId, code: barcode.item.code };
  }
  const candidates = await db.globalCatalogItem.findMany({
    where: {
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [
        { genericName: input.genericName, strength: input.strength, dosageForm: input.dosageForm },
        ...(input.code ? [{ code: input.code }] : []),
        { nameEn: input.nameEn, strength: input.strength, dosageForm: input.dosageForm },
      ],
    },
    take: 40,
    include: { barcodes: true },
  });
  const match = candidates.find((row) =>
    isSameCommercial(input, {
      nameEn: row.brandNameEn || row.nameEn,
      genericName: row.genericName,
      strength: row.strength,
      dosageForm: row.dosageForm,
      manufacturer: row.manufacturer,
      brandNameEn: row.brandNameEn || row.nameEn,
      barcode: row.barcodes[0]?.code,
    }),
  );
  return match ? { id: match.id, code: match.code } : null;
}

export function assertUniqueProduct(match: { id: string; code: string } | null): void {
  if (!match) return;
  throw new DomainError('DUPLICATE_PRODUCT', 409, { fields: { nameEn: 'duplicate', matchId: match.id, matchCode: match.code } });
}

async function rememberSynonym(db: Db, ingredientId: string, alias: string, language: string): Promise<void> {
  const aliasKey = foldSearchText(alias).slice(0, 80);
  if (!aliasKey) return;
  const existing = await db.globalMedicineSynonym.findFirst({ where: { aliasKey, ingredientId } });
  if (existing) return;
  await db.globalMedicineSynonym.create({ data: { ingredientId, alias: alias.slice(0, 200), aliasKey, language, verified: true } });
}

export async function indexCatalogItem(db: Db, itemId: string): Promise<void> {
  const item = await db.globalCatalogItem.findUnique({ where: { id: itemId }, include: { barcodes: true } });
  if (!item) return;
  const tokens = [
    ...searchTokens(item.code),
    ...searchTokens(item.nameEn),
    ...searchTokens(item.nameAr),
    ...searchTokens(item.genericName),
    ...searchTokens(item.brandNameEn),
    ...searchTokens(item.brandNameAr),
    ...searchTokens(item.manufacturer),
    ...searchTokens(item.strength),
    ...searchTokens(item.dosageForm),
    ...searchTokens(item.modelNumber),
    ...item.barcodes.flatMap((barcode) => searchTokens(barcode.code)),
  ];
  await db.globalCatalogSearchToken.deleteMany({ where: { itemId } });
  if (tokens.length > 0) {
    await db.globalCatalogSearchToken.createMany({ data: [...new Set(tokens)].slice(0, 40).map((token) => ({ itemId, token })) });
  }
  const names = ingredientParts(item.genericName);
  for (const part of names) {
    const folded = foldSearchText(part);
    const known = INN_ALIASES.find((entry) => entry.inn === folded || foldSearchText(entry.ar) === folded);
    const innEn = known?.inn ?? part.slice(0, 200);
    const ingredient = await db.globalMedicineIngredient.upsert({
      where: { innEn },
      create: { innEn, innAr: known?.ar ?? '', atcCode: names.length === 1 ? item.atcCode : '' },
      update: known?.ar ? { innAr: known.ar } : {},
    });
    const linked = await db.globalProductIngredient.findFirst({ where: { itemId, ingredientId: ingredient.id } });
    if (!linked) {
      await db.globalProductIngredient.create({ data: { itemId, ingredientId: ingredient.id, strengthText: item.strength } });
    }
    if (known) {
      await rememberSynonym(db, ingredient.id, known.ar, 'ar');
      for (const alias of known.aliases) await rememberSynonym(db, ingredient.id, alias, /[\u0600-\u06FF]/.test(alias) ? 'ar' : 'en');
    }
  }
}

export async function reindexMissing(db: Db, limit = 40): Promise<number> {
  const rows = await db.globalCatalogItem.findMany({
    where: { tokens: { none: {} }, status: published },
    select: { id: true },
    take: limit,
  });
  for (const row of rows) await indexCatalogItem(db, row.id);
  return rows.length;
}

export async function writeCatalogRevision(db: Db, itemId: string, versionNo: number, snapshot: unknown, actorId: string | null): Promise<void> {
  await db.globalCatalogRevision.create({
    data: { itemId, versionNo, snapshot: JSON.stringify(snapshot), actorId },
  });
}

type Tx = Prisma.TransactionClient;

export async function ensureTenantReference(tx: Tx, tenantId: string, actorId: string, codes: string[]): Promise<number> {
  const wanted = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  if (wanted.length === 0) return 0;
  const globals = await tx.globalCatalogItem.findMany({
    where: { code: { in: wanted }, status: published },
    include: { barcodes: true },
  });
  const byCode = new Map(globals.map((item) => [item.code, item]));
  const missing = wanted.filter((code) => !byCode.has(code));
  const standards = missing.length === 0
    ? []
    : await tx.standardMedicine.findMany({ where: { code: { in: missing }, status: 'PUBLISHED' } });
  let created = 0;
  for (const code of wanted) {
    const global = byCode.get(code);
    const standard = standards.find((row) => row.code === code);
    if (!global && !standard) continue;
    const existing = await tx.product.findFirst({
      where: {
        tenantId,
        isDeleted: false,
        OR: [
          { sku: code },
          { masterCode: code },
          ...(global ? [{ globalItemId: global.id }] : []),
        ],
      },
    });
    if (existing) {
      if (global && existing.globalItemId !== global.id) {
        await tx.product.update({
          where: { id: existing.id },
          data: { globalItemId: global.id, masterCode: existing.masterCode ?? code, isLocal: false },
        });
      }
      continue;
    }
    const nameAr = plainMedicineName(global?.nameAr ?? standard?.nameAr ?? code);
    const nameEn = plainMedicineName(global?.nameEn ?? standard?.nameEn ?? code);
    const genericName = plainMedicineName(global?.genericName ?? standard?.genericName ?? nameEn);
    const categoryEn = global?.categoryName || standard?.categoryEn || 'General';
    const categoryAr = standard?.categoryAr || global?.categoryName || 'عام';
    let category = await tx.category.findFirst({ where: { tenantId, nameEn: categoryEn, isDeleted: false } });
    if (!category) {
      category = await tx.category.create({ data: { tenantId, nameAr: categoryAr, nameEn: categoryEn, createdBy: actorId } });
    }
    await tx.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        sku: code,
        nameAr,
        nameEn,
        genericName,
        form: global?.dosageForm || standard?.form || 'TABLET',
        strength: global?.strength || standard?.strength || '',
        reorderLevel: 0,
        sellPrice: '0.00',
        costPrice: '0.00',
        isLocal: false,
        masterCode: code,
        globalItemId: global?.id,
        gtin: global?.barcodes[0]?.code || standard?.gtin || null,
        trackSerial: standard?.trackSerial ?? false,
        isControlled: global?.isControlled ?? standard?.isControlled ?? false,
        createdBy: actorId,
      },
    });
    created += 1;
  }
  return created;
}

export async function globalDuplicateReport(db: Db): Promise<{ key: string; codes: string[] }[]> {
  const rows = await db.globalCatalogItem.findMany({
    where: { status: { not: 'inactive' } },
    select: {
      id: true,
      code: true,
      nameEn: true,
      genericName: true,
      strength: true,
      dosageForm: true,
      manufacturer: true,
      brandNameEn: true,
      barcodes: { select: { code: true }, take: 1 },
    },
  });
  return duplicateGroups(
    rows.map((row) => ({
      id: row.id,
      code: row.code,
      nameEn: row.brandNameEn || row.nameEn,
      genericName: row.genericName,
      strength: row.strength,
      dosageForm: row.dosageForm,
      manufacturer: row.manufacturer,
      brandNameEn: row.brandNameEn || row.nameEn,
      barcode: row.barcodes[0]?.code,
    })),
  ).map((group) => ({ key: group.key, codes: group.codes }));
}
