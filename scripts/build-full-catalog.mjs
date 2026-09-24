#!/usr/bin/env node
// Reproducible complete catalogue snapshot, including optional full card details.
// All remote work is resumable; run in a networked Work session or on a PC.
import {readFile,writeFile,mkdir,cp,copyFile,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeCatalogue,frenchTargetCatalogue,mergeSets,setForCard,detailShard,DETAIL_SHARDS,trustedIndex} from './catalog-core.mjs';
import {safeId} from './offline-core.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2),has=flag=>args.includes(flag);
const opt=flag=>{const n=args.indexOf(flag);return n>=0?args[n+1]:null;};
if(has('--help')){
  console.log(`node scripts/build-full-catalog.mjs --index pokevault-index-visuels.json [--inventory-only] [--fr-only] [--fr-cards FILE --en-cards FILE --fr-sets FILE --en-sets FILE] [--fixture-details-dir DIR --fixture-set-details-dir DIR] [--cache-dir DIR] [--output dist] [--limit-details N] [--refresh]\nDefault: fetch ALL FR and EN cards/sets. --fr-only keeps only FR card IDs, with EN as an exact-ID fallback. --inventory-only skips full card metadata. Networked Node >=20 required except for fixtures. Does not download card illustrations; artwork redistribution needs a separate rights review.`);
  process.exit(0);
}
const output=resolve(opt('--output')||join(root,'dist'));
if(output===root||!output.startsWith(resolve(root,'..')+'/'))throw Error('Unsafe output directory');
const cacheDir=resolve(opt('--cache-dir')||join(root,'.catalogue-cache'));
const frCardsPath=opt('--fr-cards'),enCardsPath=opt('--en-cards'),frSetsPath=opt('--fr-sets'),enSetsPath=opt('--en-sets');
const fixtureDetails=opt('--fixture-details-dir'),fixtureSetDetails=opt('--fixture-set-details-dir');
const indexPath=opt('--index');
const inventoryOnly=has('--inventory-only');
const frOnly=has('--fr-only');
const maxDetails=opt('--limit-details')===null?Infinity:Number(opt('--limit-details'));
if(!Number.isInteger(maxDetails)&&maxDetails!==Infinity||maxDetails<0)throw Error('Invalid --limit-details');
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let lastRequest=0,requestTail=Promise.resolve();
async function throttle(){
  const next=requestTail.catch(()=>{}).then(async()=>{
    const wait=Math.max(0,150-(Date.now()-lastRequest));if(wait)await pause(wait);
    lastRequest=Date.now();
  });requestTail=next;await next;
}
async function getJSON(url){
  for(let retry=0;retry<5;retry++){
    await throttle();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await fetch(url,{signal:controller.signal});
      if(response.status===404)return null;
      if(response.status===429||response.status>=500){
        const delay=Math.min(45000,Math.max(1000,Number(response.headers.get('retry-after')||0)*1000,1500*2**retry));
        if(retry===4)throw Error(`HTTP ${response.status} ${url}`);
        await pause(delay);continue;
      }
      if(!response.ok)throw Error(`HTTP ${response.status} ${url}`);
      return await response.json();
    }catch(error){if(retry===4)throw error;await pause(1500*2**retry);}
    finally{clearTimeout(timeout);}
  }
  return null;
}
async function snapshot(name,file,url){
  if(file)return readJSON(resolve(file));
  const cached=join(cacheDir,'snapshots',`${name}.json`);
  if(!has('--refresh'))try{return await readJSON(cached);}catch{}
  console.log(`Downloading ${name}...`);
  const data=await getJSON(url);
  if(!Array.isArray(data)||data.length<1)throw Error(`Empty/invalid ${name}: aborting instead of emitting an incomplete catalogue`);
  await mkdir(dirname(cached),{recursive:true});await writeFile(cached,JSON.stringify(data));
  return data;
}
const [frCards,enCards,frSets,enSets]=await Promise.all([
  snapshot('fr-cards',frCardsPath,'https://api.tcgdex.net/v2/fr/cards'),
  snapshot('en-cards',enCardsPath,'https://api.tcgdex.net/v2/en/cards'),
  snapshot('fr-sets',frSetsPath,'https://api.tcgdex.net/v2/fr/sets'),
  snapshot('en-sets',enSetsPath,'https://api.tcgdex.net/v2/en/sets')
]);
const catalog=frOnly?frenchTargetCatalogue(frCards,enCards):mergeCatalogue(frCards,enCards);
const allSets=mergeSets(frSets,enSets);
const wantedSetIds=frOnly?new Set([...frSets.map(s=>s.id),...catalog.map(c=>setForCard(c.id,allSets)).filter(Boolean)]):null;
const sets=frOnly?allSets.filter(s=>wantedSetIds.has(s.id)):allSets;
if(!catalog.length||!sets.length)throw Error('No cards or sets: aborting.');
const cardIds=new Set(catalog.map(c=>c.id)),setIds=new Set(sets.map(s=>s.id));
const orphanCards=catalog.filter(c=>!setForCard(c.id,sets)).map(c=>c.id);
const rawIndex=indexPath?trustedIndex(await readJSON(resolve(indexPath))):{};
const index=frOnly?Object.fromEntries(Object.entries(rawIndex).filter(([id])=>cardIds.has(id))):rawIndex;
const indexIds=Object.keys(index).filter(id=>cardIds.has(id));
const withoutIndexedVisual=catalog.filter(c=>!index[c.id]).map(c=>c.id);
const setDetailMap=Object.create(null),details=Object.create(null),setErrors=[],cardErrors=[];
const localSetDir=fixtureSetDetails?resolve(fixtureSetDetails):null;
const localCardDir=fixtureDetails?resolve(fixtureDetails):null;
let cardProcessed=0,cardDownloaded=0,setProcessed=0;
async function runJobs(entries,job,concurrency=3){
  let n=0;
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(n<entries.length){const entry=entries[n++];await job(entry);}
  }));
}
async function cacheOrFetch(kind,id,lang){
  if(!safeId(id))return null;
  const fixture=kind==='cards'?localCardDir:localSetDir;
  if(fixture){try{return await readJSON(join(fixture,`${id}.json`));}catch{return null;}}
  const cached=join(cacheDir,kind,`${id}.json`);
  if(!has('--refresh'))try{return await readJSON(cached);}catch{}
  let value=await getJSON(`https://api.tcgdex.net/v2/${lang}/${kind}/${encodeURIComponent(id)}`);
  if(!value&&lang==='fr')value=await getJSON(`https://api.tcgdex.net/v2/en/${kind}/${encodeURIComponent(id)}`);
  if(value&&value.id===id){await mkdir(dirname(cached),{recursive:true});await writeFile(cached,JSON.stringify(value));return value;}
  return null;
}
console.log(`Inventory: ${catalog.length} unique cards (${frCards.length} FR, ${enCards.length} EN), ${sets.length} sets; ${indexIds.length} previously verified image URLs.`);
if(!inventoryOnly){
  // Set-detail records contain the official card list for each set. A failure
  // must be reported, not mistaken for a nonexistent set/card.
  await runJobs(sets,async set=>{
    try{
      const detail=await cacheOrFetch('sets',set.id,set.language==='fr'?'fr':'en');
      if(detail&&Array.isArray(detail.cards))setDetailMap[set.id]=detail;
      else setErrors.push({id:set.id,reason:'Set details unavailable'});
    }catch(error){setErrors.push({id:set.id,reason:String(error.message||error)});}
    setProcessed++;if(setProcessed%75===0||setProcessed===sets.length)console.log(`Set details: ${setProcessed}/${sets.length}`);
  });
  await runJobs(catalog.slice(0,maxDetails),async card=>{
    try{
      const detail=await cacheOrFetch('cards',card.id,card.language==='fr'?'fr':'en');
      if(detail&&detail.id===card.id){details[card.id]=detail;cardDownloaded++;}
      else cardErrors.push({id:card.id,reason:'Card details unavailable'});
    }catch(error){cardErrors.push({id:card.id,reason:String(error.message||error)});}
    cardProcessed++;if(cardProcessed%200===0||cardProcessed===Math.min(maxDetails,catalog.length))console.log(`Card details: ${cardProcessed}/${catalog.length} · available ${cardDownloaded} · errors ${cardErrors.length}`);
  });
}
await mkdir(join(output,'assets/offline'),{recursive:true});
for(const file of ['index.html','app.bundle.js','app.js','core.mjs','db.mjs','virtual-grid.mjs','image-state.mjs','style.css','manifest.webmanifest','sw.js'])await copyFile(join(root,file),join(output,file));
await cp(join(root,'assets'),join(output,'assets'),{recursive:true,filter:src=>!src.includes('/offline/')});
const offline=join(output,'assets/offline');
const cardsBySet=new Map(sets.map(s=>[s.id,[]]));
for(const card of catalog){const id=setForCard(card.id,sets);if(id)cardsBySet.get(id).push(card);}
const setDetails=Object.create(null);
for(const set of sets){
  // Even an unavailable set-detail endpoint cannot remove a set from the local catalogue.
  const known=setDetailMap[set.id];
  setDetails[set.id]={...(known||set),cards:cardsBySet.get(set.id)||[]};
}
const chunks=Array.from({length:DETAIL_SHARDS},()=>Object.create(null));
for(const [id,detail] of Object.entries(details))chunks[detailShard(id)][id]=detail;
const shardFiles=[];
await mkdir(join(offline,'details'),{recursive:true});
for(let n=0;n<DETAIL_SHARDS;n++){
  const filename=`details/${String(n).padStart(2,'0')}.json`;
  await writeFile(join(offline,filename),JSON.stringify(chunks[n]));shardFiles.push(`./assets/offline/${filename}`);
}
const fullDetails=!inventoryOnly&&cardDownloaded===catalog.length&&setErrors.length===0&&cardErrors.length===0;
const manifest={format:'pokevault-catalogue-manifest-v1',source:frOnly?'TCGdex FR exact IDs; EN exact-ID fallback':'TCGdex FR + EN exact ID fallback',generatedAt:new Date().toISOString(),catalogueCount:catalog.length,setCount:sets.length,detailCount:cardDownloaded,detailsComplete:fullDetails,detailShards:DETAIL_SHARDS,files:shardFiles};
const report={format:'pokevault-catalogue-report-v1',scope:frOnly?'fr-exact-ids':'fr-en-union',generatedAt:manifest.generatedAt,inventoryComplete:true,detailsComplete:fullDetails,frCardRows:frCards.length,enCardRows:enCards.length,uniqueCardIds:catalog.length,frSetRows:frSets.length,enSetRows:enSets.length,uniqueSets:sets.length,englishOnlyCards:catalog.filter(c=>c.language==='en').length,englishOnlySets:sets.filter(s=>s.language==='en').length,orphanCards,cardDetailsAvailable:cardDownloaded,cardDetailsUnretrieved:catalog.length-cardDownloaded,setDetailsErrors:setErrors,cardDetailsErrors:cardErrors,verifiedImageUrlsInIndex:indexIds.length,notInIndex:withoutIndexedVisual.length,notInIndexIds:withoutIndexedVisual,orphanIndexIds:Object.keys(rawIndex).filter(id=>!cardIds.has(id)),localImageFiles:0,offlineCatalogue:fullDetails?'full-in-native-package':'inventory-and-set-lists-only',offlineIllustrations:false,note:'Previously verified image URLs are not embedded image files. Unknown URLs are not proven missing scans. Prices still require their own source.'};
await writeFile(join(offline,'catalog-fr.json'),JSON.stringify(catalog));
await writeFile(join(offline,'sets-fr.json'),JSON.stringify(sets));
await writeFile(join(offline,'sets-detailed.json'),JSON.stringify(setDetails));
await writeFile(join(offline,'details-manifest.json'),JSON.stringify(manifest));
await writeFile(join(offline,'images.json'),JSON.stringify({version:1,generatedAt:manifest.generatedAt,total:0,images:{}}));
await writeFile(join(offline,'precache.json'),'[]');
await writeFile(join(offline,'verified-index.json'),JSON.stringify({format:'pokevault-image-index-v1',images:index}));
await writeFile(join(offline,'catalogue-report.json'),JSON.stringify(report,null,2));
console.log(`DIST ${output}\nCards ${report.uniqueCardIds}, sets ${report.uniqueSets}, full details ${report.cardDetailsAvailable}/${report.uniqueCardIds}, indexed image URLs ${report.verifiedImageUrlsInIndex}, actual image files 0`);
console.log(`Catalogue report: assets/offline/catalogue-report.json · full details ${fullDetails?'YES':'NO'}`);
if(has('--strict')&&!fullDetails)process.exitCode=2;
