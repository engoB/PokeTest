// Pure helpers for a complete, auditable TCGdex catalogue snapshot.
import {safeId} from './offline-core.mjs';
export const DETAIL_SHARDS=32;
export function mergeCatalogue(french,english){
  const byId=new Map();
  for(const [lang,items] of [['en',english],['fr',french]]){
    if(!Array.isArray(items))throw Error(`Invalid ${lang} catalogue`);
    for(const entry of items){
      if(!safeId(entry?.id))continue;
      const previous=byId.get(entry.id);
      if(lang==='fr'&&previous){
        byId.set(entry.id,{...previous,...entry,image:entry.image||previous.image,language:'fr'});
      }else if(!previous){byId.set(entry.id,{...entry,language:lang});}
    }
  }
  return [...byId.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
// The app's target inventory is the FR catalogue. EN is only an alternate
// source of images/metadata for those SAME exact card IDs, not extra cards.
export function frenchTargetCatalogue(french,english){
  if(!Array.isArray(french)||!french.length)throw Error('French inventory is required');
  const frenchIds=new Set(french.filter(c=>safeId(c?.id)).map(c=>c.id));
  return mergeCatalogue(french,english).filter(card=>frenchIds.has(card.id));
}
export function mergeSets(french,english){
  const byId=new Map();
  for(const [lang,items] of [['en',english],['fr',french]]){
    if(!Array.isArray(items))throw Error(`Invalid ${lang} sets`);
    for(const entry of items){
      if(!safeId(entry?.id))continue;
      const previous=byId.get(entry.id);
      if(lang==='fr'&&previous)byId.set(entry.id,{...previous,...entry,language:'fr'});
      else if(!previous)byId.set(entry.id,{...entry,language:lang});
    }
  }
  return [...byId.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
export function setForCard(cardId,sets){
  // IDs like 2019sm-fr-001 have embedded hyphens; never split on the first '-'.
  const matched=sets.filter(s=>cardId.startsWith(`${s.id}-`)).sort((a,b)=>b.id.length-a.id.length);
  return matched[0]?.id||null;
}
export function detailShard(id){
  let sum=0;
  for(const c of id)sum=(sum*31+c.charCodeAt(0))>>>0;
  return sum%DETAIL_SHARDS;
}
export function trustedIndex(raw){
  const entries=raw?.images&&typeof raw.images==='object'?raw.images:raw;
  const clean=Object.create(null);
  if(!entries||typeof entries!=='object'||Array.isArray(entries))return clean;
  for(const [id,entry] of Object.entries(entries)){
    if(!safeId(id)||typeof entry?.url!=='string'||!Number.isFinite(entry?.checkedAt)||entry.checkedAt<=0)continue;
    try{
      const url=new URL(entry.url);
      if(url.protocol!=='https:'||url.username||url.password||!['assets.tcgdex.net','images.pokemontcg.io','images.scrydex.com'].includes(url.hostname))continue;
      if(!/\.(?:webp|png|jpe?g)$/i.test(url.pathname))continue;
      clean[id]={url:url.href,source:entry.source||'verified-index',checkedAt:entry.checkedAt};
    }catch{}
  }
  return clean;
}
