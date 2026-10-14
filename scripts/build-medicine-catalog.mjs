import { readFileSync, writeFileSync } from 'node:fs';

const atcPath = process.argv[2];
const emlPath = process.argv[3];
const outPath = process.argv[4];
if (!atcPath || !emlPath || !outPath) {
  console.error('usage: node build-medicine-catalog.mjs <atc.json> <eml.md> <out.json>');
  process.exit(1);
}

const CATEGORIES = {
  A: ['الجهاز الهضمي والأيض', 'Alimentary tract and metabolism'],
  B: ['الدم وأعضاء تكوين الدم', 'Blood and blood forming organs'],
  C: ['القلب والأوعية', 'Cardiovascular system'],
  D: ['الجلد', 'Dermatologicals'],
  G: ['الجهاز البولي والتناسلي', 'Genito-urinary system and sex hormones'],
  H: ['الهرمونات الجهازية', 'Systemic hormonal preparations'],
  J: ['مضادات العدوى', 'Antiinfectives for systemic use'],
  L: ['الأورام والمناعة', 'Antineoplastic and immunomodulating agents'],
  M: ['الجهاز العضلي الهيكلي', 'Musculo-skeletal system'],
  N: ['الجهاز العصبي', 'Nervous system'],
  P: ['مضادات الطفيليات', 'Antiparasitic products'],
  R: ['الجهاز التنفسي', 'Respiratory system'],
  S: ['أعضاء الحس', 'Sensory organs'],
  V: ['متفرقات', 'Various'],
};

function cut(value, max) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : text.slice(0, max);
}

function formOf(text) {
  const s = text.toLowerCase();
  if (s.includes('eye') && (s.includes('drop') || s.includes('ophthal'))) return 'EYE_DROPS';
  if (s.includes('ear') || s.includes('otic')) return 'EAR_DROPS';
  if (s.includes('nasal')) return 'NASAL';
  if (s.includes('nebul')) return 'NEBULISER';
  if (s.includes('inhal')) return 'INHALER';
  if (s.includes('cream')) return 'CREAM';
  if (s.includes('ointment')) return 'OINTMENT';
  if (s.includes('gel')) return 'GEL';
  if (s.includes('lotion')) return 'LOTION';
  if (s.includes('suppository')) return 'SUPPOSITORY';
  if (s.includes('pessary')) return 'PESSARY';
  if (s.includes('patch')) return 'PATCH';
  if (s.includes('infusion')) return 'INFUSION';
  if (s.includes('ampoule')) return 'AMPOULE';
  if (s.includes('syringe')) return 'SYRINGE';
  if (s.includes('injection') || s.includes('parenteral') || s.includes('vial')) return 'VIAL';
  if (s.includes('syrup')) return 'SYRUP';
  if (s.includes('suspension')) return 'SUSPENSION';
  if (s.includes('effervescent')) return 'EFFERVESCENT';
  if (s.includes('lozenge')) return 'LOZENGE';
  if (s.includes('sachet')) return 'SACHET';
  if (s.includes('capsule')) return 'CAPSULE';
  if (s.includes('drop')) return 'ORAL_DROPS';
  if (s.includes('solution') || s.includes('liquid')) return 'ORAL_SOLUTION';
  if (s.includes('powder')) return 'POWDER';
  if (s.includes('tablet') || s.includes('solid') || s.includes('oral')) return 'TABLET';
  return '';
}

function formFromAtc(atc) {
  if (atc.startsWith('S01')) return 'EYE_DROPS';
  if (atc.startsWith('S02')) return 'EAR_DROPS';
  if (atc.startsWith('S03')) return 'EYE_DROPS';
  if (atc.startsWith('R01')) return 'NASAL';
  if (atc.startsWith('R03')) return 'INHALER';
  if (atc.startsWith('R05') || atc.startsWith('R06')) return 'SYRUP';
  if (atc.startsWith('A06')) return 'ORAL_SOLUTION';
  if (atc.startsWith('D')) return 'CREAM';
  if (atc.startsWith('B05')) return 'INFUSION';
  if (atc.startsWith('J06') || atc.startsWith('J07') || atc.startsWith('A10A')) return 'VIAL';
  return 'TABLET';
}

function routeFor(form) {
  if (form === 'EYE_DROPS') return 'ophthalmic';
  if (form === 'EAR_DROPS') return 'otic';
  if (form === 'NASAL') return 'nasal';
  if (form === 'INHALER' || form === 'NEBULISER') return 'inhalation';
  if (form === 'CREAM' || form === 'OINTMENT' || form === 'GEL' || form === 'LOTION') return 'topical';
  if (['VIAL', 'AMPOULE', 'SYRINGE', 'INFUSION'].includes(form)) return 'injection';
  if (form === 'SUPPOSITORY') return 'rectal';
  if (form === 'PESSARY') return 'vaginal';
  if (form === 'PATCH') return 'transdermal';
  return 'oral';
}

function strengthOf(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|iu|ml|%)/i);
  return match ? `${match[1]} ${match[2]}` : '';
}

function norm(value) {
  return value.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
}

const emlText = readFileSync(emlPath, 'utf8');
const eml = new Map();
for (const part of emlText.split(/\n(?=\d+\. ##### )/)) {
  const nameMatch = part.match(/##### (.+?) General information/);
  if (!nameMatch) continue;
  const name = nameMatch[1].trim();
  const lines = [...part.matchAll(/^- (.+)$/gm)].map((match) => match[1].trim());
  const useful = lines.filter((line) => !/^all vaccines/i.test(line) && !/^refer to/i.test(line));
  const sectionMatch = part.match(/\n Section\s*([\s\S]*?)(?:\n- |\n Indications)/);
  const section = sectionMatch ? sectionMatch[1].replace(/\s+/g, ' ').trim() : '';
  eml.set(norm(name), { name, section, lines: useful });
}

const raw = JSON.parse(readFileSync(atcPath, 'utf8'));
const byAtc = new Map();
for (const row of raw.results.bindings) {
  const atc = String(row.atc?.value ?? '').trim().toUpperCase();
  const en = String(row.en?.value ?? '').trim();
  if (!/^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/.test(atc) || en.length < 2) continue;
  const ar = String(row.ar?.value ?? '').trim();
  const current = byAtc.get(atc);
  if (!current || (!/[\u0600-\u06FF]/.test(current.ar) && /[\u0600-\u06FF]/.test(ar))) {
    byAtc.set(atc, { atc, en, ar });
  }
}

const knownEnglish = new Set([...byAtc.values()].map((row) => norm(row.en)));
const catalog = [];
for (const row of byAtc.values()) {
  const letter = row.atc.charAt(0);
  const category = CATEGORIES[letter] ?? ['متفرقات', 'Various'];
  const essential = eml.get(norm(row.en));
  const formulation = essential?.lines[0] ?? '';
  const form = formOf(formulation) || formFromAtc(row.atc);
  const title = row.en.charAt(0).toUpperCase() + row.en.slice(1);
  catalog.push({
    code: `ATC-${row.atc}`,
    nameAr: cut(/[\u0600-\u06FF]/.test(row.ar) ? row.ar : title, 200),
    nameEn: cut(title, 200),
    genericName: cut(title, 200),
    strength: cut(strengthOf(formulation), 80),
    form,
    manufacturer: '',
    country: '',
    categoryAr: category[0],
    categoryEn: category[1],
    atcCode: row.atc,
    ingredients: cut(title, 400),
    route: routeFor(form),
    requiresPrescription: false,
    isControlled: false,
  });
}

let extra = 0;
for (const item of eml.values()) {
  if (knownEnglish.has(norm(item.name))) continue;
  const formulation = item.lines[0] ?? '';
  const form = formOf(formulation) || 'TABLET';
  const slug = item.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  catalog.push({
    code: `EML-${slug || 'ITEM'}`,
    nameAr: cut(item.name, 200),
    nameEn: cut(item.name, 200),
    genericName: cut(item.name, 200),
    strength: cut(strengthOf(formulation), 80),
    form,
    manufacturer: '',
    country: '',
    categoryAr: 'قائمة الأدوية الأساسية',
    categoryEn: cut(item.section || 'WHO essential medicine', 200),
    atcCode: '',
    ingredients: cut(item.name, 400),
    route: routeFor(form),
    requiresPrescription: false,
    isControlled: false,
  });
  extra += 1;
}

const seen = new Set();
const unique = catalog.filter((row) => {
  if (seen.has(row.code)) return false;
  seen.add(row.code);
  return true;
});
writeFileSync(outPath, JSON.stringify(unique));
const arabic = unique.filter((row) => /[\u0600-\u06FF]/.test(row.nameAr)).length;
const dosed = unique.filter((row) => row.strength).length;
console.log(JSON.stringify({ total: unique.length, arabic, dosed, essentialOnly: extra, forms: new Set(unique.map((row) => row.form)).size }));
