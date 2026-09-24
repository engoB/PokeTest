#!/usr/bin/env node
// Independent of the PWA: resumable GitHub Actions/desktop harvester.
// Does not alter pv_collection or write images into the public repository.
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validIndex,LANGUAGES,cardShard,sourceCandidates,exactScrydexCard,classifyResult,trustedHarvestURL,verifiedImage,migrateAmbiguousProviderStates,migrateFreeOnlyProviderStates,prioritizeHarvestTasks} from './harvest-core.mjs';
import {safeId} from './offline-core.mjs';
import {frenchTargetCatalogue,setForCard} from './catalog-core.mjs';
import {matchAlternativeCard} from '../core.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];},flag=k=>args.includes(k);
if(flag('--help')){console.log('node scripts/harvest-images.mjs --mode resolve|pack --index inputs/pokevault-index-visuels.json [--state .image-harvest-cache/state.json] [--fr-cards file --en-cards file] [--output harvest-output] [--max-cards 400] [--shard 0/16] [--no-network] [--refresh-missing] [--free-only]. Target = FR cards only; pending cards first, then due retries. --free-only disables Scrydex and reports cards exhausted in checked free sources.');process.exit(0);}
const mode=opt('--mode')||'resolve';if(!['resolve','pack'].includes(mode))throw Error('Bad mode');
const freeOnly=flag('--free-only');
const output=resolve(opt('--output')||join(root,'harvest-output'));
const cacheDir=resolve(opt('--cache-dir')||join(root,'.image-harvest-cache'));
const statePath=resolve(opt('--state')||join(cacheDir,'state.json'));
const indexPath=resolve(opt('--index')||join(root,'inputs/pokevault-index-visuels.json'));
const maxCards=opt('--max-cards')?Number(opt('--max-cards')):mode==='resolve'?400:Infinity;
if(!(maxCards===Infinity||Number.isInteger(maxCards)&&maxCards>=1))throw Error('Bad max-cards');
const shardText=opt('--shard')||'0/1',shardMatch=/^(\d+)\/(\d+)$/.exec(shardText);
if(!shardMatch)throw Error('Shard format: N/TOTAL');
const shard=Number(shardMatch[1]),shards=Number(shardMatch[2]);if(shards<1||shards>64||shard>=shards)throw Error('Invalid shard');
const offline=flag('--no-network');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const load=async file=>JSON.parse(await readFile(file,'utf8'));
const existing=await load(indexPath);
const index=validIndex(existing);
const state=await load(statePath).catch(()=>({format:'pokevault-harvest-state-v1',cards:{}}));
if(state.format!=='pokevault-harvest-state-v1'||!state.cards||typeof state.cards!=='object')throw Error('Bad state file');
const migrated=migrateAmbiguousProviderStates(state.cards);
if(migrated)console.log(`Requeued ${migrated} ambiguous v4.4 quota/provider results`);
const freeOnlyMigrated=freeOnly?migrateFreeOnlyProviderStates(state.cards):0;
if(freeOnlyMigrated)console.log(`Marked ${freeOnlyMigrated} previously checked cards as unresolved in free sources (Scrydex not required)`);
await mkdir(cacheDir,{recursive:true});await mkdir(output,{recursive:true});
const imageDir=join(output,'assets/offline/cards');if(mode==='pack')await mkdir(imageDir,{recursive:true});
const imageCacheDir=join(cacheDir,'cards');await mkdir(imageCacheDir,{recursive:true});
const stamped=()=>new Date().toISOString();
async function atomic(file,value){await mkdir(dirname(file),{recursive:true});const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2));const {rename}=await import('node:fs/promises');await rename(tmp,file);}
// Back off 429/503 globally *per provider*; do not spin on temporary outages.
const gates=new Map(),last=new Map();
function retryAfterMs(header){if(!header)return 0;const seconds=Number(header);if(Number.isFinite(seconds))return Math.max(0,seconds*1000);const when=Date.parse(header);return Number.isFinite(when)?Math.max(0,when-Date.now()):0;}
async function request(url,provider,{headers={},timeout=16000,retries=3}={}){
  if(offline)throw Object.assign(Error('fixture-offline'),{transient:true});
  for(let n=0;n<retries;n++){
    const blocked=gates.get(provider)||0;const gap=provider==='legacy'?2200:provider==='tcgdex-api'?220:provider==='tcgdex-image'?120:600;
    const wait=Math.max(blocked-Date.now(),(last.get(provider)||0)+gap-Date.now());
    if(wait>60000)throw Object.assign(Error(`${provider} cooling down; retry in next run`),{transient:true,retryAt:blocked});
    if(wait>0)await sleep(wait);
    last.set(provider,Date.now());
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const r=await fetch(url,{headers,signal:controller.signal,redirect:'error'});
      if(r.status===404||r.status===410)return null;
      if(r.status===429||r.status>=500){
        const after=retryAfterMs(r.headers.get('retry-after'));
        const cooldown=after>0?Math.min(3600_000,after):Math.min(60000,1200*2**n);
        gates.set(provider,Date.now()+cooldown);
        if(cooldown>60000)throw Object.assign(Error(`${provider} HTTP ${r.status}; long Retry-After`),{transient:true,retryAt:Date.now()+cooldown});
        if(n===retries-1)throw Object.assign(Error(`${provider} HTTP ${r.status}`),{transient:true,retryAt:Date.now()+cooldown});
        await sleep(cooldown);continue;
      }
      if(r.status===401||r.status===403)throw Object.assign(Error(`${provider} HTTP ${r.status}`),{transient:true,retryAt:Date.now()+3600_000});
      if(!r.ok)throw Error(`${provider} HTTP ${r.status}`);
      return r;
    }catch(error){
      if(error.retryAt&&error.retryAt-Date.now()>60000)throw error;
      if(n===retries-1)throw Object.assign(error,{transient:true,retryAt:error.retryAt||Date.now()+30*60000});
      await sleep(1000*2**n);
    }finally{clearTimeout(timer);}
  }
}
async function getJSON(url,provider,headers){const r=await request(url,provider,{headers,timeout:35000});return r?r.json():null;}
async function snapshot(lang){
  const supplied=opt(`--${lang}-cards`);
  if(supplied){const rows=await load(resolve(supplied));if(!Array.isArray(rows))throw Error(`Invalid ${lang} fixture`);return rows;}
  const file=join(cacheDir,`catalog-${lang}.json`);
  const cached=await load(file).catch(()=>null);
  const age=await stat(file).then(s=>Date.now()-s.mtimeMs).catch(()=>Infinity);
  if(!flag('--refresh-catalogue')&&Array.isArray(cached)&&cached.length&&age<72*3600_000)return cached;
  try{
    const data=await getJSON(`https://api.tcgdex.net/v2/${lang}/cards`,'tcgdex-api');
    if(data===null&&!['fr','en'].includes(lang))return []; // Locale not supported by this endpoint.
    if(!Array.isArray(data)||(!data.length&&['fr','en'].includes(lang)))throw Error(`Incomplete ${lang} catalogue`);
    await atomic(file,data);return data;
  }catch(error){
    if(Array.isArray(cached)&&cached.length){catalogErrors.push({source:`tcgdex-${lang}-stale-inventory`,error:String(error.message||error)});return cached;}
    throw error;
  }
}
const catalogByLang={};const catalogErrors=[];
for(const lang of LANGUAGES){
  try{const data=await snapshot(lang);catalogByLang[lang]=new Map(data.filter(c=>safeId(c?.id)).map(c=>[c.id,c]));console.log(`${lang}: ${data.length} rows`);}
  catch(error){catalogErrors.push({source:`tcgdex-${lang}-inventory`,error:String(error.message||error)});console.error(`${lang}: ${error.message}`);catalogByLang[lang]=new Map();}
}
if(!catalogByLang.fr.size)throw Error('FR catalogue unavailable: refusing to substitute an EN-only inventory.');
const cards=frenchTargetCatalogue([...catalogByLang.fr.values()],[...catalogByLang.en.values()]);
const targetIds=new Set(cards.map(c=>c.id));
const targetIndex=Object.fromEntries(Object.entries(index).filter(([id])=>targetIds.has(id)));
console.log(`FR target: ${cards.length} exact IDs; EN and other locales are image sources only`);
const enSetsPath=opt('--en-sets');let enSets=[];
try{enSets=enSetsPath?await load(resolve(enSetsPath)):await load(join(cacheDir,'en-sets.json')).catch(()=>null)||await getJSON('https://api.tcgdex.net/v2/en/sets','tcgdex-api');if(enSets?.length&&!enSetsPath)await atomic(join(cacheDir,'en-sets.json'),enSets);}catch(error){catalogErrors.push({source:'tcgdex-en-sets',error:String(error.message||error)});}
const setMap=new Map((enSets||[]).map(s=>[s.id,s]));
function imageCachePath(id,ext){return join(imageCacheDir,`${id}.${ext}`);}
async function cachedImage(id){for(const ext of ['webp','png','jpg']){try{const p=imageCachePath(id,ext);const bytes=await readFile(p);if(verifiedImage(bytes))return {bytes,ext};}catch{}}return null;}
async function downloadImage(url){
  url=trustedHarvestURL(url);if(!url)return null;
  const provider=new URL(url).hostname==='assets.tcgdex.net'?'tcgdex-image':'other-image';
  const r=await request(url,provider,{timeout:20000});if(!r)return null;
  const maxBytes=8_000_000;
  if(Number(r.headers.get('content-length')||0)>maxBytes){await r.body?.cancel();return null;}
  // Bound memory even if the server omits Content-Length.
  const reader=r.body?.getReader();if(!reader)return null;
  let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();return null;}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks,size);
  const ext=verifiedImage(bytes);return ext?{bytes,ext}:null;
}
async function getSetDetail(lang,id){
  const file=join(cacheDir,'set-details',lang,`${id}.json`);
  const prev=await load(file).catch(()=>null);if(prev?.id===id)return prev;
  const detail=await getJSON(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(id)}`,'tcgdex-api');
  if(detail?.id===id){await atomic(file,detail);return detail;}return null;
}
async function getDetail(lang,id){
  const file=join(cacheDir,'details',lang,`${id}.json`);
  const prev=await load(file).catch(()=>null);if(prev)return prev;
  const detail=await getJSON(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(id)}`,'tcgdex-api');
  if(detail?.id===id){await atomic(file,detail);return detail;}return null;
}
async function scrydex(id,english){
  if(freeOnly)return {configured:false};
  if(!process.env.SCRYDEX_API_KEY||!process.env.SCRYDEX_TEAM_ID)return {configured:false};
  const headers={'X-Api-Key':process.env.SCRYDEX_API_KEY,'X-Team-ID':process.env.SCRYDEX_TEAM_ID};
  const result=await getJSON(`https://api.scrydex.com/pokemon/v1/cards/${encodeURIComponent(id)}`,'scrydex',headers);
  const card=result?.data||result?.card||result;
  return {configured:true,candidate:exactScrydexCard({id,localId:cardsById.get(id)?.localId},english,card)};
}
let legacyBudget=Number(opt('--legacy-budget')??(process.env.POKEMONTCG_API_KEY?180:60));
if(!Number.isInteger(legacyBudget)||legacyBudget<0||legacyBudget>1000)throw Error('Invalid legacy budget');
const legacyStats={requests:0,batchSets:0,cacheHits:0};
const legacySetMemory=new Map();
const LEGACY_SET_CACHE_MS=14*24*3600_000;
const LEGACY_PAGE_SIZE=250;
const legacyHeaders=process.env.POKEMONTCG_API_KEY?{'X-Api-Key':process.env.POKEMONTCG_API_KEY}:{};
const phrase=v=>String(v).replace(/["\\]/g,' ').trim();
// A single, strictly matched set lookup can resolve dozens of cards while
// using only one or two free API requests. Never trust a set's card order.
async function legacySetCards(setId,set){
  if(legacySetMemory.has(setId)){legacyStats.cacheHits++;return legacySetMemory.get(setId);}
  const file=join(cacheDir,'legacy-sets',`${setId}.json`);
  const cached=await load(file).catch(()=>null);
  if(cached?.format==='pokevault-legacy-set-cache-v1'&&cached.setName===set.name&&
     Array.isArray(cached.cards)&&Date.now()-cached.fetchedAt<LEGACY_SET_CACHE_MS){
    legacyStats.cacheHits++;legacySetMemory.set(setId,cached.cards);return cached.cards;
  }
  let rows=[],page=1,total=Infinity;
  while(rows.length<total){
    if(legacyBudget<=0)return null; // No incomplete batch is ever cached.
    legacyBudget--;legacyStats.requests++;
    const q=`set.name:"${phrase(set.name)}"`;
    const url=`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&page=${page}&pageSize=${LEGACY_PAGE_SIZE}&select=${encodeURIComponent('id,name,number,set,images')}`;
    const data=await getJSON(url,'legacy',legacyHeaders);
    if(!Array.isArray(data?.data))return null;
    rows.push(...data.data);
    total=Number.isFinite(data.totalCount)?data.totalCount:rows.length;
    if(!data.data.length||rows.length>=total)break;
    // A malformed/very large result must not consume the daily free quota.
    if(page>=8)return null;
    page++;
  }
  legacyStats.batchSets++;
  legacySetMemory.set(setId,rows);
  await atomic(file,{format:'pokevault-legacy-set-cache-v1',setId,setName:set.name,fetchedAt:Date.now(),cards:rows});
  return rows;
}
async function legacy(id,english){
  const card=cardsById.get(id),setId=setForCard(id,[...setMap.values()]);const set=setMap.get(setId);
  if(!set?.name||!card?.localId||!english?.name)return {configured:false,reason:'no-verified-english-metadata'};
  const target={number:card.localId,englishName:english.name,englishSet:set.name,printedTotal:set.cardCount?.official};
  // Batch only if several selected unresolved cards share this exact set.
  if((taskSetCounts.get(setId)||0)>=2){
    const batch=await legacySetCards(setId,set);
    if(batch){
      const match=matchAlternativeCard(target,batch);
      if(match)return {configured:true,candidates:[...new Set([match.small,match.large].filter(trustedHarvestURL))].map(url=>({url,source:'legacy-exact-set-batch'}))};
      // A complete set result is definitive for this provider. An empty set
      // result is not: API set naming can differ from TCGdex naming.
      if(batch.some(row=>String(row.set?.name||'').toLowerCase()===set.name.toLowerCase()))return {configured:true,candidates:[]};
    }
  }
  if(legacyBudget<=0)return {configured:false,reason:'budget-reached'};
  legacyBudget--;legacyStats.requests++;
  const q=`number:"${phrase(card.localId)}" set.name:"${phrase(set.name)}"`;
  const url=`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=100&select=${encodeURIComponent('id,name,number,set,images')}`;
  const data=await getJSON(url,'legacy',legacyHeaders);
  const entry=matchAlternativeCard(target,data?.data||[]);
  return {configured:true,candidates:entry?[...new Set([entry.small,entry.large].filter(trustedHarvestURL))].map(url=>({url,source:'legacy-exact-matched'})):[]};
}
const cardsById=new Map(cards.map(c=>[c.id,c]));
const selected=cards.filter(c=>cardShard(c.id,shards)===shard);
const now=Date.now();
const scrydexReady=!freeOnly&&Boolean(process.env.SCRYDEX_API_KEY&&process.env.SCRYDEX_TEAM_ID);
const tasks=prioritizeHarvestTasks(selected,targetIndex,state.cards,{mode,maxCards,now,refreshMissing:flag('--refresh-missing'),scrydexReady,freeOnly});
const taskSetCounts=new Map();
for(const card of tasks){const setId=setForCard(card.id,[...setMap.values()]);if(setId)taskSetCounts.set(setId,(taskSetCounts.get(setId)||0)+1);}
const resolved={...targetIndex};for(const [id,row] of Object.entries(state.cards))if(targetIds.has(id)&&row?.status==='found'&&trustedHarvestURL(row.url))resolved[id]={url:row.url,source:row.source,checkedAt:row.checkedAt};
const progress={mode,scope:'fr-exact-ids',freeOnly,priority:'pending-then-due-retry-then-weekly-free-recheck',sourceLocales:LANGUAGES,totalCatalog:cards.length,selected:selected.length,originalIndex:Object.keys(targetIndex).length,migratedProviderStates:migrated,freeOnlyMigrated,planned:tasks.length,plannedPending:tasks.filter(c=>!state.cards[c.id]||state.cards[c.id]?.status==='pending').length,plannedRetries:tasks.filter(c=>state.cards[c.id]?.status==='retry').length,plannedRechecks:tasks.filter(c=>state.cards[c.id]?.status==='unavailable-in-checked-sources').length,processed:0,found:0,retry:0,unavailableInCheckedSources:0,packed:0,skippedCached:0,errors:[],catalogErrors};
const packed=Object.create(null);const reportRows=[];
async function checkpoint(){state.updatedAt=stamped();await atomic(statePath,state);await atomic(join(output,'pokevault-index-enrichi.json'),{format:'pokevault-image-index-v1',exportedAt:stamped(),scope:'fr-exact-ids',images:{...targetIndex,...Object.fromEntries(Object.entries(state.cards).filter(([id,v])=>targetIds.has(id)&&v?.status==='found'&&trustedHarvestURL(v.url)).map(([id,v])=>[id,{url:v.url,source:v.source,checkedAt:v.checkedAt}]))}});}
async function handle(card){
  const id=card.id;let bytes=null,entry=resolved[id],old=await cachedImage(id),attempted=0,transient=false,missingScrydex=false,legacyQuota=false,legacyMetadataMissing=false,sourceList=[];
  if(old&&mode==='pack'){
    const ext=old.ext;await copyFile(imageCachePath(id,ext),join(imageDir,`${id}.${ext}`));packed[id]={file:`./assets/offline/cards/${encodeURIComponent(id)}.${ext}`,source:entry?.source||'previous-cache',bytes:old.bytes.length};progress.skippedCached++;progress.packed++;return;
  }
  if(old&&mode==='resolve'&&entry){progress.skippedCached++;return;}
  const tryCandidate=async candidate=>{
    if(!candidate?.url)return false;
    attempted++;sourceList.push(candidate.source);
    try{const image=await downloadImage(candidate.url);if(!image)return false;
      entry={url:candidate.url,source:candidate.source,checkedAt:Date.now()};bytes=image.bytes;
      await writeFile(imageCachePath(id,image.ext),bytes);
      if(mode==='pack'){await copyFile(imageCachePath(id,image.ext),join(imageDir,`${id}.${image.ext}`));packed[id]={file:`./assets/offline/cards/${encodeURIComponent(id)}.${image.ext}`,source:entry.source,bytes:bytes.length};progress.packed++;}
      state.cards[id]={status:'found',...entry};resolved[id]=entry;progress.found++;return true;
    }catch(error){transient=transient||!!error.transient;progress.errors.push({id,source:candidate.source,error:String(error.message||error)});return false;}
  };
  const langCards={};for(const lang of LANGUAGES)langCards[lang]=catalogByLang[lang];
  let candidates=sourceCandidates(card,langCards,entry);
  for(const candidate of candidates){if(await tryCandidate(candidate))return;}
  // TCGdex can omit `image` for subset cards even when its exact CDN path
  // works. Only synthesize that path after checking the set's exact metadata.
  if(mode==='resolve'){
    const setId=setForCard(id,[...setMap.values()]);
    if(setId){try{
      const detail=await getSetDetail('en',setId)||await getSetDetail('fr',setId);
      for(const candidate of sourceCandidates(card,{},null,detail)){
        if(candidates.some(c=>c.url===candidate.url))continue;
        candidates.push(candidate);if(await tryCandidate(candidate))return;
      }
    }catch(error){transient=true;progress.errors.push({id,source:'tcgdex-exact-set-path',error:String(error.message||error)});}}
  }
  if(mode==='pack'){state.cards[id]={status:'retry',reason:'download-failed',nextRetryAt:Date.now()+3600000};progress.retry++;return;}
  // Detail-only image fields can exist when catalogue summary lacks them.
  for(const lang of LANGUAGES){
    if(!catalogByLang[lang].has(id)&&lang!=='fr'&&lang!=='en')continue;
    try{
      const detail=await getDetail(lang,id);
      const base=detail?.image;
      if(base&&/^https:\/\/assets\.tcgdex\.net\/[\w./%!-]+$/.test(base)){
        for(const suffix of ['/low.webp','/low.png','/low.jpg','/high.webp']){
          const url=trustedHarvestURL(base.replace(/\/$/,'')+suffix);
          if(candidates.some(c=>c.url===url))continue;candidates.push({url,source:`tcgdex-${lang}-detail`});
          if(await tryCandidate(candidates.at(-1)))return;
        }
      }
    }catch(error){transient=true;progress.errors.push({id,source:`tcgdex-${lang}-detail`,error:String(error.message||error)});}
  }
  if(!freeOnly){
    try{const remote=await scrydex(id,catalogByLang.en.get(id));if(remote.configured){sourceList.push('scrydex-exact-id');if(remote.candidate){for(const candidate of [remote.candidate,...(remote.candidate.alternatives||[])])if(await tryCandidate(candidate))return;}}
        else missingScrydex=true;
    }catch(error){transient=true;progress.errors.push({id,source:'scrydex',error:String(error.message||error)});}
  }
  try{const remote=await legacy(id,catalogByLang.en.get(id));if(remote.configured){sourceList.push('legacy-strict-match');for(const candidate of remote.candidates||[])if(await tryCandidate(candidate))return;}
      else if(remote.reason==='budget-reached')legacyQuota=true;
      else legacyMetadataMissing=true;
  }catch(error){transient=true;progress.errors.push({id,source:'legacy',error:String(error.message||error)});}
  if(catalogErrors.length)transient=true; // An unreachable language catalogue cannot certify absence.
  // An exhausted per-run legacy quota is NEVER a permanent credentials block.
  const status=transient||legacyQuota?'retry':missingScrydex?'needs-provider-access':classifyResult({attempted,networkError:false,moreProviders:false});
  const prev=state.cards[id];const failures=(prev?.failures||0)+1;
  const delay=Math.min(48*3600_000,Math.max(3600_000,1800_000*2**Math.min(failures,7)));
  state.cards[id]={status,checkedAt:Date.now(),sourcesTried:[...new Set(sourceList)],failures,
    nextRetryAt:status==='retry'?Date.now()+delay:null,
    reason:transient?'remote-temporary-error':legacyQuota?'legacy-quota-exhausted':missingScrydex?'scrydex-credentials-missing':freeOnly&&status==='unavailable-in-checked-sources'?'free-sources-exhausted':legacyMetadataMissing?'no-verified-english-metadata':'no-valid-image-in-checked-sources'};
  if(status==='retry'||status==='needs-provider-access')progress.retry++;else progress.unavailableInCheckedSources++;
  reportRows.push({id,...state.cards[id]});
}
// Deliberately sequential: shared provider quotas must not be multiplied by parallel workers.
let n=0;try{
  for(const card of tasks){await handle(card);progress.processed=++n;
    if(n%10===0||n===tasks.length){await checkpoint();console.log(`${mode} ${n}/${tasks.length} · recovered ${progress.found} · packed ${progress.packed} · retry ${progress.retry} · unavailable ${progress.unavailableInCheckedSources}`);}
  }
}finally{await checkpoint();
  const unresolved=cards.filter(c=>!resolved[c.id]).map(c=>({id:c.id,status:state.cards[c.id]?.status||'pending',reason:state.cards[c.id]?.reason||'not-attempted',checkedAt:state.cards[c.id]?.checkedAt||null,sourcesTried:state.cards[c.id]?.sourcesTried||[],nextRetryAt:state.cards[c.id]?.nextRetryAt||null}));
  const statusCounts=Object.fromEntries(['pending','retry','needs-provider-access','unavailable-in-checked-sources'].map(s=>[s,unresolved.filter(x=>x.status===s).length]));
  const report={format:'pokevault-harvest-report-v1',generatedAt:stamped(),...progress,legacyRequestsUsed:legacyStats.requests,legacyBatchSets:legacyStats.batchSets,legacyCacheHits:legacyStats.cacheHits,statusCounts,freeSourcesExhausted:unresolved.filter(c=>c.reason==='free-sources-exhausted').length,stillUnindexed:unresolved.length,remainingInShard:selected.filter(c=>!resolved[c.id]&&(!state.cards[c.id]||['retry','needs-provider-access'].includes(state.cards[c.id]?.status))).length,coveragePercent:Math.round(10000*(cards.length-unresolved.length)/cards.length)/100,cardsNeedingAttention:reportRows};
  await atomic(join(output,'report.json'),report);
  await atomic(join(output,'missing-images-report.json'),{format:'pokevault-missing-images-v1',catalogueTotal:cards.length,verifiedOrIndexed:cards.length-unresolved.length,unresolved});
  const csv=['id;statut;raison;sources_testees;prochaine_tentative',...unresolved.map(c=>[c.id,c.status,c.reason,c.sourcesTried.join('|'),c.nextRetryAt?new Date(c.nextRetryAt).toISOString():''].join(';'))].join('\n');
  await writeFile(join(output,'missing-images-report.csv'),csv);
  await writeFile(join(output,'report.md'),`# PokéVault — audit illustré\n\n- **Périmètre : catalogue FR uniquement** (${cards.length} identifiants exacts, dont exu-! et exu-%3F).\n- Sources des illustrations : ${LANGUAGES.join(', ')} ; aucune carte uniquement anglaise n'est ajoutée.\n- Index FR validé initial : ${Object.keys(targetIndex).length} URL\n- Anciens blocages de quota reprogrammés : ${migrated}\n- Images récupérées cette exécution : ${progress.found}\n- Images téléchargées dans le pack : ${progress.packed}\n- Couverture URL FR : ${report.coveragePercent}% (${cards.length-unresolved.length}/${cards.length})\n- Cartes FR sans URL : ${unresolved.length}\n- Statuts : ${JSON.stringify(statusCounts)}\n- Erreurs temporaires de cette exécution : ${progress.errors.length}\n- Sources catalogues indisponibles : ${catalogErrors.length}\n\nLes quotas épuisés sont réessayés automatiquement lors des prochains passages. Une absence de clé Scrydex reste signalée séparément. **Aucune absence n'est certifiée sur toutes les sources internet possibles.**\n`);
  if(mode==='pack')await atomic(join(output,`images-part-${shard}-of-${shards}.json`),{format:'pokevault-image-part-v1',shard,shards,images:packed});
}
console.log(`Report: ${join(output,'report.json')}. All image metadata is resumable in ${statePath}.`);
