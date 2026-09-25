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
// A Cardmarket trend is NOT the current asking price of a seller. Modern TCGdex
// exposes separate prices by finish; never silently substitute a normal quote
// for a holo or reverse printing.
export function parsePrice(card) {
  const cm=card?.pricing?.cardmarket ?? card?.cardmarket?.prices ?? card?.cardmarket;
  if(!cm || (cm.unit && cm.unit!=='EUR'))return null;
  const definitions=[
    ['normal','Standard',cm.trend??cm.trendPrice,cm.avg30??cm.avg30Price,cm.low??cm.lowPrice],
    ['holo','Holographique',cm['trend-holo']??cm.trendHolo,cm['avg30-holo']??cm.avg30Holo,cm['low-holo']??cm.lowHolo],
    ['reverse','Reverse holographique',cm['trend-reverse-holo']??cm.trendReverseHolo,cm['avg30-reverse-holo']??cm.avg30ReverseHolo,cm['low-reverse-holo']??cm.lowReverseHolo]
  ];
  const quotes=definitions.map(([id,label,t,a,l])=>({id,label,trend:numeric(t),avg30:numeric(a),low:numeric(l)}))
    .filter(q=>q.trend!==null||q.avg30!==null||q.low!==null);
  if(!quotes.length)return null;
  const selectedVariant=quotes.length===1?quotes[0].id:null;
  return selectPriceVariant({quotes,selectedVariant:null,source:'tcgdex-cardmarket',updated:cm.updated||null,fetchedAt:Date.now()},selectedVariant);
}
export function selectPriceVariant(price,id){
  const quote=price?.quotes?.find(q=>q.id===id);
  return {...price,selectedVariant:quote?.id||null,trend:quote?.trend??null,avg30:quote?.avg30??null,low:quote?.low??null};
}
export function restorePrice(entry){
  if(entry?.source!=='tcgdex-cardmarket'||!Array.isArray(entry.quotes))return {trend:null,avg30:null,low:null,source:'legacy-unverified',updated:null,fetchedAt:0,quotes:[],selectedVariant:null};
  const quotes=entry.quotes.filter(q=>['normal','holo','reverse'].includes(q?.id)).map(q=>({...q,trend:numeric(q.trend),avg30:numeric(q.avg30),low:numeric(q.low)}));
  return selectPriceVariant({...entry,quotes},entry.selectedVariant|| (quotes.length===1?quotes[0].id:null));
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
    if (u.protocol !== 'https:' || !['assets.tcgdex.net','images.pokemontcg.io','images.scrydex.com'].includes(u.hostname) || u.username || u.password) return null;
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

// Direct marketplace links are used ONLY when supplied by the card's source.
// Otherwise show a labelled search, never an unverified product page.
export function safeCardmarketProductUrl(raw){
  try{const u=new URL(raw);if(u.protocol!=='https:'||!['www.cardmarket.com','cardmarket.com'].includes(u.hostname)||u.username||u.password||u.port||!/^\/(?:fr|en|de|es|it)\/Pokemon\/Products\/Singles\//.test(u.pathname))return null;return u.href;}catch{return null;}
}
export function cardmarketPurchaseLink(card,detail=null,setName='',reviewedUrl=null){
  // A detailed URL is trusted only when the API detail has the EXACT card ID.
  // Reviewed mappings are keyed by the same exact ID; no fuzzy product guessing.
  const sources=[reviewedUrl,...(detail?.id===card?.id?[detail?.pricing?.cardmarket?.url,detail?.cardmarket?.url,detail?.cardmarket?.productUrl,detail?.links?.cardmarket]:[]),card?.pricing?.cardmarket?.url,card?.cardmarket?.url];
  for(const raw of sources){const url=safeCardmarketProductUrl(raw);if(url)return {url,direct:true};}
  // Cardmarket's own search is name-oriented: including set AND number can
  // result in zero hits, even when the card is on sale. Search broadly, then
  // show the exact expansion/number to compare on the results page.
  const name=String(card?.name||detail?.name||'').trim();
  return {url:`https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(name)}`,direct:false};
}
export function targetedCardmarketSearch(card,setName=''){
  const q=['site:cardmarket.com/fr/Pokemon/Products/Singles/',card?.name,setName,card?.localId].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
// Small bounded, synchronous suggestions; the catalogue is already loaded in
// memory, so typing never sends an API request or waits for a debounce.
export function suggestCards(cards,raw,limit=8){
  const q=normalize(raw);if(!q||!Array.isArray(cards))return [];
  const buckets=[[],[],[]];
  for(const card of cards){
    const name=card._searchName??normalize(card.name);
    const hay=card._searchKey??normalize(`${card.name} ${card.localId} ${card.id}`);
    const id=normalize(card.localId);
    const rank=name.startsWith(q)||id===q?0:name.includes(q)?1:hay.includes(q)?2:-1;
    if(rank>=0&&buckets[rank].length<limit)buckets[rank].push(card);
  }
  return buckets.flat().slice(0,limit);
}
export const IMAGE_RESEARCH_SOURCES=Object.freeze([
  {key:'pkmncards',name:'PkmnCards',domain:'pkmncards.com'},
  {key:'pokecardex',name:'Pokécardex',domain:'pokecardex.com'},
  {key:'bulbapedia',name:'Bulbapedia',domain:'bulbapedia.bulbagarden.net'},
  {key:'tcgcollector',name:'TCG Collector',domain:'tcgcollector.com'},
  {key:'pokellector',name:'Pokélector',domain:'pokellector.com'},
  {key:'limitless',name:'Limitless TCG',domain:'limitlesstcg.com'}
]);
export function imageResearchLinks(card,setName='',englishName=''){
  const name=String(card?.name||'').slice(0,100);const number=String(card?.localId||'').slice(0,30);const set=String(setName||card?.set?.name||'').slice(0,100);
  return IMAGE_RESEARCH_SOURCES.map(source=>{
    const title=['pkmncards','bulbapedia','pokellector','limitless'].includes(source.key)&&englishName?englishName:name;
    const q=`site:${source.domain} ${[title,number,set].filter(Boolean).join(' ')}`;
    return {...source,url:`https://www.google.com/search?q=${encodeURIComponent(q)}`};
  });
}
export function safeCardId(id){return typeof id==='string'&&(/^[A-Za-z0-9_.-]{1,110}$/.test(id)||id==='exu-!'||id==='exu-%3F')&&!['__proto__','prototype','constructor','.','..'].includes(id);}
