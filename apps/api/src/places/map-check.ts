export type PlaceQuery = {
  stateName: string;
  stateEn: string;
  city: string;
  cityEn: string;
  addressLine: string;
};

export type MapHit = {
  lat: string;
  lon: string;
  display_name: string;
};

export type MapPin = {
  latitude: string;
  longitude: string;
  label: string;
  precision: 'address' | 'city';
};

const SUDAN = { minLat: 8.4, maxLat: 22.3, minLon: 21.7, maxLon: 38.7 };

/** Arabic and English names for the same Sudan place, so a map label in either language still matches. */
const PLACE_ALIASES: readonly (readonly string[])[] = [
  ['الخرطوم', 'khartoum'],
  ['أم درمان', 'omdurman'],
  ['بحري', 'bahri', 'khartoum north'],
  ['شرق النيل', 'east nile'],
  ['ود مدني', 'wad madani'],
  ['الحصاحيصا', 'hasahisa'],
  ['المناقل', 'manaqil'],
  ['عطبرة', 'atbara'],
  ['شندي', 'shendi'],
  ['الدامر', 'ad damar'],
  ['دنقلا', 'dongola'],
  ['مروي', 'merowe'],
  ['كريمة', 'karima'],
  ['بورتسودان', 'port sudan'],
  ['سواكن', 'suakin'],
  ['كسلا', 'kassala'],
  ['حلفا الجديدة', 'new halfa'],
  ['القضارف', 'gedaref'],
  ['الفاو', 'al faw'],
  ['سنار', 'sennar'],
  ['سنجة', 'singa'],
  ['كوستي', 'kosti'],
  ['ربك', 'rabak'],
  ['الدويم', 'ed dueim'],
  ['الدمازين', 'ad damazin'],
  ['الروصيرص', 'roseires'],
  ['الأبيض', 'el obeid'],
  ['أم روابة', 'umm rawaba'],
  ['كادوقلي', 'kadugli'],
  ['الدلنج', 'dilling'],
  ['الفولة', 'al fula'],
  ['النهود', 'en nahud'],
  ['الفاشر', 'el fasher'],
  ['كتم', 'kutum'],
  ['نيالا', 'nyala'],
  ['الجنينة', 'geneina'],
  ['زالنجي', 'zalingei'],
  ['الضعين', 'ed daein'],
  ['الجزيرة', 'gezira'],
  ['نهر النيل', 'river nile'],
  ['الشمالية', 'northern'],
  ['البحر الأحمر', 'red sea'],
  ['النيل الأبيض', 'white nile'],
  ['النيل الأزرق', 'blue nile'],
  ['شمال كردفان', 'north kordofan'],
  ['جنوب كردفان', 'south kordofan'],
  ['غرب كردفان', 'west kordofan'],
  ['شمال دارفور', 'north darfur'],
  ['جنوب دارفور', 'south darfur'],
  ['غرب دارفور', 'west darfur'],
  ['وسط دارفور', 'central darfur'],
  ['شرق دارفور', 'east darfur'],
];

export function insideSudan(latitude: number, longitude: number): boolean {
  return latitude >= SUDAN.minLat && latitude <= SUDAN.maxLat && longitude >= SUDAN.minLon && longitude <= SUDAN.maxLon;
}

function fold(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function needlesFor(hints: PlaceQuery): string[] {
  const seeds = [hints.city, hints.cityEn, hints.stateName, hints.stateEn].map(fold).filter((item) => item.length >= 2);
  const extra = PLACE_ALIASES.filter((group) => group.some((name) => seeds.includes(fold(name)))).flat();
  return [...new Set([...seeds, ...extra.map(fold)])];
}

export function matchPlace(hits: MapHit[], hints: PlaceQuery): { latitude: string; longitude: string; label: string } | null {
  const needles = needlesFor(hints);
  for (const hit of hits) {
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !insideSudan(latitude, longitude)) continue;
    const blob = fold(hit.display_name);
    if (!needles.some((needle) => blob.includes(needle))) continue;
    return { latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), label: hit.display_name };
  }
  return null;
}

function joinPlace(parts: string[]): string {
  return parts.map((part) => part.trim()).filter((part) => part.length > 0).join(', ');
}

async function searchMap(query: string): Promise<MapHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=sd&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'accept-language': 'ar,en',
      'user-agent': 'DawaaPharmacy/1.0 (pharmacy address check)',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`map lookup failed (${response.status})`);
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) return [];
  return body.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const hit = row as { lat?: unknown; lon?: unknown; display_name?: unknown };
    if (typeof hit.lat !== 'string' || typeof hit.lon !== 'string' || typeof hit.display_name !== 'string') return [];
    return [{ lat: hit.lat, lon: hit.lon, display_name: hit.display_name }];
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function lookupOnMap(input: PlaceQuery): Promise<MapPin | null> {
  const queries = [
    joinPlace([input.addressLine, input.city, input.stateName, 'Sudan']),
    joinPlace([input.addressLine, input.cityEn || input.city, input.stateEn || input.stateName, 'Sudan']),
    joinPlace([input.city, input.stateName, 'Sudan']),
    joinPlace([input.cityEn || input.city, input.stateEn || input.stateName, 'Sudan']),
  ];
  const seen = new Set<string>();
  let calls = 0;
  for (const query of queries) {
    if (seen.has(query) || query.length < 2) continue;
    seen.add(query);
    if (calls > 0) await wait(1100);
    calls += 1;
    const hits = await searchMap(query);
    const pin = matchPlace(hits, input);
    if (!pin) continue;
    const street = fold(input.addressLine);
    const precision = street.length >= 3 && fold(pin.label).includes(street) ? 'address' : 'city';
    return { ...pin, precision };
  }
  return null;
}
