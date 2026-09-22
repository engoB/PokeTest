// Small, dependency-free helpers shared by the app and Node's built-in test runner.
const ALIASES = new Map([['elector', 'electhor']]);
export const PRICE_TTL = 24 * 60 * 60 * 1000;
export function normalize(value) {
  let text = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
  for (const [alias, correct] of ALIASES) if (text.startsWith(alias)) text = correct + text.slice(alias.length);
  return text;
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
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
export function imageUrls(base, quality='low') {
  if (typeof base !== 'string' || !/^https:\/\/assets\.tcgdex\.net\//.test(base)) return [];
  // TCGdex image field is an extensionless URL; never guess set IDs or alternate card art.
  return [`${base}/${quality}.webp`, `${base}/${quality}.png`];
}
export function cardMatchesType(card, type, price) {
  const name = normalize(card?.name);
  const rarity = normalize(card?.rarity);
  switch(type) {
    case 'ex': return /(?:^|[\s-])ex$/.test(name) && !/^m(?:ega|ega|éga)?[-\s]/.test(name);
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
