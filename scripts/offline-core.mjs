// Shared, deterministic helpers for building a portable card-image pack.
export const SAFE_ID=/^[A-Za-z0-9_.-]{1,110}$/;
// TCGdex uses two non-standard, exact IDs for the Unown ! and ? cards.
// Whitelist only these exceptions: arbitrary '%' sequences or punctuation
// would make filesystem paths and browser URLs ambiguous.
const SPECIAL_CARD_IDS=new Set(['exu-!','exu-%3F']);
export function safeId(id){return typeof id==='string'&&(SAFE_ID.test(id)||SPECIAL_CARD_IDS.has(id))&&id!=='..'&&id!=='.'&&!['__proto__','prototype','constructor'].includes(id);}
export function candidateBases(card,english,exported,override,extra=[],allowedHosts=[]){
  const out=[];
  const add=(url,source)=>{if(typeof url==='string'&&/^https:\/\/(?:assets\.tcgdex\.net|images\.pokemontcg\.io)\//.test(url)&&!out.some(x=>x.url===url))out.push({url,source});};
  if(override?.reviewed===true&&typeof override.url==='string'){
    try{const u=new URL(override.url);if(u.protocol==='https:'&&!u.username&&!u.password&&allowedHosts.includes(u.hostname)&&!out.some(x=>x.url===u.href))out.push({url:u.href,source:'manual-reviewed'});}catch{}
  }
  if(exported?.source!=='missing')add(exported?.url,'previously-verified');
  for(const [entry,source] of [[card,'tcgdex-fr'],[english,'tcgdex-en'],...extra]){
    if(!entry?.image||!/^https:\/\/assets\.tcgdex\.net\/[\w./-]+$/.test(entry.image))continue;
    add(`${entry.image}/low.webp`,source);add(`${entry.image}/low.png`,source);
  }
  return out;
}
export function sniffImage(bytes){
  if(bytes.length<300)return null;
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
  return null;
}
export function normalizeExport(raw){
  const items=raw?.images&&typeof raw.images==='object'?raw.images:raw;
  if(!items||typeof items!=='object'||Array.isArray(items))return {};
  return Object.fromEntries(Object.entries(items).filter(([id,value])=>safeId(id)&&value&&typeof value==='object'));
}
