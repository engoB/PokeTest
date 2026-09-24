// Pure helpers for the resumable, exact-ID image harvester.
import {safeId,sniffImage} from './offline-core.mjs';
// Exact IDs are shared across TCGdex locales; a foreign-language scan is preferable to no scan.
export const LANGUAGES=['fr','en','de','es','it','pt','pt-br','ja','zh-tw','id','th'];
export const IMAGE_HOSTS=new Set(['assets.tcgdex.net','images.pokemontcg.io','images.scrydex.com']);
export function trustedHarvestURL(raw){
  try{if(typeof raw!=='string'||/(?:^|\/)(?:\.\.|(?:%2e){2})(?=\/|$)/i.test(raw))return null;const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||!IMAGE_HOSTS.has(u.hostname)||u.port)return null;
    if(!/^\/[\w./%!-]+$/.test(u.pathname)||u.pathname.includes('..'))return null;
    return u.href;
  }catch{return null;}
}
export function validIndex(input){
  const rows=input?.images&&typeof input.images==='object'?input.images:input;
  const out=Object.create(null);
  if(!rows||typeof rows!=='object'||Array.isArray(rows))return out;
  for(const [id,row] of Object.entries(rows)){
    const url=trustedHarvestURL(row?.url);
    if(safeId(id)&&url&&row?.source!=='missing')out[id]={url,source:row.source||'previously-verified',checkedAt:Number(row.checkedAt)||0};
  }
  return out;
}
export function cardShard(id,numberOfShards=16){let h=2166136261;for(const c of id){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)%numberOfShards;}
export function sourceCandidates(card,langCards={},indexed=null,verifiedSet=null){
  const rows=[],seen=new Set();
  function add(url,source){url=trustedHarvestURL(url);if(url&&!seen.has(url)){seen.add(url);rows.push({url,source});}}
  if(indexed?.url)add(indexed.url,indexed.source||'previously-verified');
  for(const lang of LANGUAGES){
    const cardInLang=langCards[lang]?.get(card.id);
    const base=cardInLang?.image;
    if(typeof base!=='string'||!/^https:\/\/assets\.tcgdex\.net\/[\w./%!-]+$/.test(base))continue;
    for(const suffix of ['/low.webp','/low.png','/low.jpg','/high.webp'])add(base.replace(/\/$/,'')+suffix,`tcgdex-${lang}`);
  }
  // Some TCGdex subset cards have no `image` in the API despite their exact
  // asset existing on the CDN. Build the documented path ONLY from a set
  // detail with an exact matching set ID and a known series ID.
  if(verifiedSet?.id&&card.id.startsWith(`${verifiedSet.id}-`)&&safeId(verifiedSet.serie?.id)&&safeId(card.localId)){
    for(const lang of LANGUAGES){
      const base=`https://assets.tcgdex.net/${lang}/${verifiedSet.serie.id}/${verifiedSet.id}/${card.localId}`;
      for(const suffix of ['/low.webp','/low.png','/high.webp'])add(base+suffix,`tcgdex-${lang}-exact-set-path`);
    }
  }
  return rows;
}
export function normalizedName(name){return String(name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'').trim();}
export function exactScrydexCard(target,english,record){
  if(!record||String(record.id||'').toLowerCase()!==String(target.id||'').toLowerCase())return null;
  if(english?.name&&normalizedName(record.name)!==normalizedName(english.name))return null;
  const num=String(target.localId||target.id.slice(target.id.lastIndexOf('-')+1)).replace(/^0+(?=\d)/,'');
  if(record.number&&String(record.number).replace(/^0+(?=\d)/,'')!==num)return null;
  const fronts=Array.isArray(record.images)?record.images.filter(x=>x?.type==='front'):[];
  const urls=[...new Set(fronts.flatMap(x=>[x.small,x.medium,x.large]).map(trustedHarvestURL).filter(Boolean))];
  return urls.length?{url:urls[0],source:'scrydex-exact-id',alternatives:urls.slice(1).map(url=>({url,source:'scrydex-exact-id'}))}:null;
}
export function classifyResult({loaded=false,attempted=0,networkError=false,moreProviders=false}){
  if(loaded)return 'found';
  if(networkError||moreProviders||attempted===0)return 'retry';
  return 'unavailable-in-checked-sources';
}
// v4.4 combined "legacy API quota reached" with "Scrydex key missing".
// Those old records were permanently skipped without Scrydex credentials.
// Requeue them once; the new resolver assigns a precise reason afterwards.
export function migrateAmbiguousProviderStates(cards){
  let changed=0;
  for(const row of Object.values(cards||{})){
    if(row?.status==='needs-provider-access'&&row.reason==='additional-provider-not-configured-or-budget'){
      row.status='retry';row.reason='recheck-legacy-quota-or-provider';row.nextRetryAt=0;changed++;
    }
  }
  return changed;
}
export function verifiedImage(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>8_000_000)return null;
  const ext=sniffImage(bytes);if(!ext)return null;
  // Reject obviously truncated downloads, not just a valid magic header.
  if(ext==='png')return bytes.length>=12&&bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082','hex'))?'png':null;
  if(ext==='webp')return bytes.length>=20&&bytes.readUInt32LE(4)+8===bytes.length?'webp':null;
  if(ext==='jpg')return bytes.length>=4&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9?'jpg':null;
  return null;
}
