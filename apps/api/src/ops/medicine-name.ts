/** Drops chemistry marks that are not part of the medicine name: (−), (+), (RS), [+], and similar notes. */
export function plainMedicineName(value: string): string {
  let name = value.normalize('NFKC').trim();
  if (!name) return value;
  name = name.replace(/\s*\[(?:\+|\-|−|–|±)\]/g, ' ');
  name = name.replace(/\s*\[[^\[\]()]{0,48}\]$/g, '');
  let guard = 0;
  while (name.startsWith('((') && name.endsWith(')') && guard++ < 4) {
    name = name.slice(1, -1).trim();
  }
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
