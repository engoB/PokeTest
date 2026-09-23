// Pure, dependency-free helpers. IDs and prices are always tied to one printing.
const ALIASES = new Map([['elector', 'electhor']]);
export const PRICE_TTL = 24 * 60 * 60 * 1000;
export function normalize(value) {
  let text = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
  for (const [alias, correct] of ALIASES) if (text.startsWith(alias)) text = correct + text.slice(alias.length);
  return text;
}
export function normalizeSet(value) {
  return normalize(value).replace(/pok[eé]mon/g, 'pokemon').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function parsePrice(card) {
  const cm = card?.pricing?.cardmarket ?? card?.cardmarket?.prices ?? card?.cardmarket;
  if (!cm || (cm.unit && cm.unit !== 'EUR')) return null;
  const trend = numeric(cm.trend ?? cm.trendPrice);
  const avg30 = numeric(cm.avg30 ?? cm.avg30Price);
  const low = numeric(cm.low ?? cm.lowPrice);
  if (trend === null && avg30 === null && low === null) return null;
  return {trend, avg30, low, updated:cm.updated || null, fetchedAt:Date.now()};
}
export function formatEuro(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(value) : '—';
}
export function readCollection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const cleaned = {};
  for (const [id, amount] of Object.entries(raw)) {
    if (/^[\w.-]{1,100}$/.test(id) && Number.isSafeInteger(amount) && amount > 0 && amount <= 9999) cleaned[id] = amount;
  }
  return cleaned;
}
// Import defaults to preserving the largest recorded quantity, not replacing or double-counting.
export function mergeCollections(current, incoming) {
  const result = {...readCollection(current)};
  for (const [id, quantity] of Object.entries(readCollection(incoming))) result[id] = Math.max(result[id] || 0, quantity);
  return result;
}
export function imageUrls(base, quality='low') {
  if (typeof base !== 'string' || !/^https:\/\/assets\.tcgdex\.net\/[\w./-]+$/.test(base)) return [];
  const qualities = quality === 'high' ? ['high', 'low'] : ['low'];
  return qualities.flatMap(size => [`${base}/${size}.webp`, `${base}/${size}.png`]);
}
export function trustedImageUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !['assets.tcgdex.net','images.pokemontcg.io'].includes(u.hostname) || u.username || u.password) return null;
    return u.href;
  } catch {return null;}
}
export function sameNumber(a, b) {
  const normalizeNumber = value => String(value ?? '').trim().toUpperCase().replace(/^([A-Z]*?)0+(\d+)$/, '$1$2');
  return Boolean(a && b) && normalizeNumber(a) === normalizeNumber(b);
}
// Never accept a similarly named card from a different expansion or printing.
export function matchAlternativeCard(target, candidates) {
  if (!target?.number || !target?.englishSet || !Array.isArray(candidates)) return null;
  const valid = candidates.filter(card => {
    if (!sameNumber(target.number, card.number)) return false;
    if (normalizeSet(card.set?.name) !== normalizeSet(target.englishSet)) return false;
    if (target.englishName && normalize(card.name) !== normalize(target.englishName)) return false;
    if (!target.englishName && !(target.printedTotal > 0 && Number(card.set?.printedTotal) === Number(target.printedTotal))) return false;
    if (target.printedTotal > 0 && card.set?.printedTotal > 0 && Number(target.printedTotal) !== Number(card.set.printedTotal)) return false;
    return Boolean(trustedImageUrl(card.images?.small) && trustedImageUrl(card.images?.large || card.images?.small));
  });
  if (valid.length !== 1) return null;
  const card = valid[0];
  return {source:'pokemon-tcg-api',small:trustedImageUrl(card.images.small),large:trustedImageUrl(card.images.large || card.images.small),matchedId:card.id};
}
export function cardMatchesType(card, type, price) {
  const name = normalize(card?.name);
  const rarity = normalize(card?.rarity);
  switch(type) {
    case 'ex': return /(?:^|[\s-])ex$/.test(name) && !/^m(?:ega|ega)?[-\s]/.test(name);
    case 'mega': return /(?:^m[-\s]|mega|mega[-\s])/.test(name);
    case 'v': return /(?:^|[\s-])(?:v|vmax|vstar)$/.test(name);
    case 'gx': return /(?:^|[\s-])gx$/.test(name);
    case 'illustration': return /illustration|\bsar\b|\bar\b|alternative/.test(rarity);
    case 'secret': return /secret|gold|dore/.test(rarity);
    case 'over10': return price !== null && price >= 10;
    case 'over50': return price !== null && price >= 50;
    default: return true;
  }
}
export function sortCards(cards, mode, prices) {
  const num = card => Number.parseInt(String(card.localId ?? '').replace(/^\D+/,''),10) || 0;
  return [...cards].sort((a,b) => {
    if (mode === 'name') return String(a.name).localeCompare(String(b.name),'fr') || a.id.localeCompare(b.id);
    if (mode.startsWith('price')) {
      const x=prices[a.id]?.trend, y=prices[b.id]?.trend;
      if (Number.isFinite(x) !== Number.isFinite(y)) return Number.isFinite(x)?-1:1;
      if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return mode === 'price-desc'? y-x : x-y;
    }
    return num(a)-num(b) || String(a.localId).localeCompare(String(b.localId),'fr',{numeric:true}) || a.id.localeCompare(b.id);
  });
}
export function priceCoverage(cards, prices, now=Date.now()) {
  let checked=0, quoted=0, missing=0;
  for (const card of cards) {
    const p=prices[card.id];
    if (Number.isFinite(p?.trend)) quoted++;
    if (p && Number.isFinite(p.fetchedAt) && p.fetchedAt > 0 && now-p.fetchedAt < PRICE_TTL) {
      checked++;
      if (!Number.isFinite(p.trend)) missing++;
    }
  }
  return {total:cards.length,checked,quoted,missing,remaining:cards.length-checked};
}
