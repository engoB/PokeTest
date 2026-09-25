/* PokéVault 5.1.1 self-contained browser bundle. Generated with node scripts/build.mjs. */
(()=>{
'use strict';
// Pure, dependency-free helpers. IDs and prices are always tied to one printing.
const ALIASES = new Map([['elector', 'electhor']]);
const PRICE_TTL = 24 * 60 * 60 * 1000;
function normalize(value) {
  let text = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
  for (const [alias, correct] of ALIASES) if (text.startsWith(alias)) text = correct + text.slice(alias.length);
  return text;
}
function normalizeSet(value) {
  return normalize(value).replace(/pok[eé]mon/g, 'pokemon').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
// A Cardmarket trend is NOT the current asking price of a seller. Modern TCGdex
// exposes separate prices by finish; never silently substitute a normal quote
// for a holo or reverse printing.
function parsePrice(card) {
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
  return selectPriceVariant({quotes,selectedVariant:null,source:'tcgdex-cardmarket',updated:cm.updated||null,fetchedAt:Date.now()},defaultPriceVariant(quotes));
}
// Standard is the default when available. If absent, use the first REAL finish;
// never label a holo-only card as standard or invent a missing price.
function defaultPriceVariant(quotes){return quotes?.find(q=>q.id==='normal')?.id||quotes?.[0]?.id||null;}
function selectPriceVariant(price,id){
  const quote=price?.quotes?.find(q=>q.id===id);
  return {...price,selectedVariant:quote?.id||null,trend:quote?.trend??null,avg30:quote?.avg30??null,low:quote?.low??null};
}
function restorePrice(entry){
  if(entry?.source!=='tcgdex-cardmarket'||!Array.isArray(entry.quotes))return {trend:null,avg30:null,low:null,source:'legacy-unverified',updated:null,fetchedAt:0,quotes:[],selectedVariant:null};
  const quotes=entry.quotes.filter(q=>['normal','holo','reverse'].includes(q?.id)).map(q=>({...q,trend:numeric(q.trend),avg30:numeric(q.avg30),low:numeric(q.low)}));
  return selectPriceVariant({...entry,quotes},quotes.some(q=>q.id===entry.selectedVariant)?entry.selectedVariant:defaultPriceVariant(quotes));
}
function formatEuro(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(value) : '—';
}
function readCollection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const cleaned = {};
  for (const [id, amount] of Object.entries(raw)) {
    if (/^[\w.-]{1,100}$/.test(id) && Number.isSafeInteger(amount) && amount > 0 && amount <= 9999) cleaned[id] = amount;
  }
  return cleaned;
}
// Import defaults to preserving the largest recorded quantity, not replacing or double-counting.
function mergeCollections(current, incoming) {
  const result = {...readCollection(current)};
  for (const [id, quantity] of Object.entries(readCollection(incoming))) result[id] = Math.max(result[id] || 0, quantity);
  return result;
}
function imageUrls(base, quality='low') {
  if (typeof base !== 'string' || !/^https:\/\/assets\.tcgdex\.net\/[\w./-]+$/.test(base)) return [];
  const qualities = quality === 'high' ? ['high', 'low'] : ['low'];
  return qualities.flatMap(size => [`${base}/${size}.webp`, `${base}/${size}.png`]);
}
function trustedImageUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !['assets.tcgdex.net','images.pokemontcg.io','images.scrydex.com'].includes(u.hostname) || u.username || u.password) return null;
    return u.href;
  } catch {return null;}
}
function sameNumber(a, b) {
  const normalizeNumber = value => String(value ?? '').trim().toUpperCase().replace(/^([A-Z]*?)0+(\d+)$/, '$1$2');
  return Boolean(a && b) && normalizeNumber(a) === normalizeNumber(b);
}
// Never accept a similarly named card from a different expansion or printing.
function matchAlternativeCard(target, candidates) {
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
function cardMatchesType(card, type, price) {
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
function sortCards(cards, mode, prices) {
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
function priceCoverage(cards, prices, now=Date.now()) {
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
function safeCardmarketProductUrl(raw){
  try{const u=new URL(raw);if(u.protocol!=='https:'||!['www.cardmarket.com','cardmarket.com'].includes(u.hostname)||u.username||u.password||u.port||!/^\/(?:fr|en|de|es|it)\/Pokemon\/Products\/Singles\//.test(u.pathname))return null;return u.href;}catch{return null;}
}
function cardmarketPurchaseLink(card,detail=null,setName='',reviewedUrl=null){
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
function targetedCardmarketSearch(card,setName=''){
  const q=['site:cardmarket.com/fr/Pokemon/Products/Singles/',card?.name,setName,card?.localId].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
// Small bounded, synchronous suggestions; the catalogue is already loaded in
// memory, so typing never sends an API request or waits for a debounce.
function suggestCards(cards,raw,limit=8){
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
const IMAGE_RESEARCH_SOURCES=Object.freeze([
  {key:'pkmncards',name:'PkmnCards',domain:'pkmncards.com'},
  {key:'pokecardex',name:'Pokécardex',domain:'pokecardex.com'},
  {key:'bulbapedia',name:'Bulbapedia',domain:'bulbapedia.bulbagarden.net'},
  {key:'tcgcollector',name:'TCG Collector',domain:'tcgcollector.com'},
  {key:'pokellector',name:'Pokélector',domain:'pokellector.com'},
  {key:'limitless',name:'Limitless TCG',domain:'limitlesstcg.com'}
]);
function imageResearchLinks(card,setName='',englishName=''){
  const name=String(card?.name||'').slice(0,100);const number=String(card?.localId||'').slice(0,30);const set=String(setName||card?.set?.name||'').slice(0,100);
  return IMAGE_RESEARCH_SOURCES.map(source=>{
    const title=['pkmncards','bulbapedia','pokellector','limitless'].includes(source.key)&&englishName?englishName:name;
    const q=`site:${source.domain} ${[title,number,set].filter(Boolean).join(' ')}`;
    return {...source,url:`https://www.google.com/search?q=${encodeURIComponent(q)}`};
  });
}
function safeCardId(id){return typeof id==='string'&&(/^[A-Za-z0-9_.-]{1,110}$/.test(id)||id==='exu-!'||id==='exu-%3F')&&!['__proto__','prototype','constructor','.','..'].includes(id);}


// IndexedDB is a replaceable performance cache. The user's collection remains in pv_collection.
const NAME='pokevault-cache-v2';
function openCache() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  return new Promise(resolve => {
    let request;
    try {request=indexedDB.open(NAME,1);} catch {resolve(null);return;}
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('prices')) db.createObjectStore('prices',{keyPath:'id'});
      if(!db.objectStoreNames.contains('images')) db.createObjectStore('images',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
  });
}
function loadCache(db,store) {
  if (!db) return Promise.resolve([]);
  return new Promise(resolve=>{
    try {const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>resolve([]);} catch {resolve([]);}
  });
}
function putCache(db,store,items) {
  if (!db || !items.length) return Promise.resolve(false);
  return new Promise(resolve=>{
    try {const tx=db.transaction(store,'readwrite');const bucket=tx.objectStore(store);for(const item of items)bucket.put(item);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);} catch {resolve(false);}
  });
}
function deleteCache(db,store,id){
  if(!db)return Promise.resolve(false);
  return new Promise(resolve=>{
    try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}
    catch{resolve(false);}
  });
}


// Pure viewport math. Only a few overscanned rows exist in the DOM at a time.
function windowRows({total,columns,rowStride,scrollTop,viewportHeight,originTop,overscan=900}) {
  if(!total || !columns || !rowStride) return {startRow:0,endRow:0,start:0,end:0,top:0,bottom:0,totalRows:0};
  const totalRows=Math.ceil(total/columns);
  const startRow=Math.max(0,Math.min(totalRows-1,Math.floor((scrollTop-originTop-overscan)/rowStride)));
  const endRow=Math.min(totalRows,Math.max(startRow+1,Math.ceil((scrollTop+viewportHeight-originTop+overscan)/rowStride)));
  return {startRow,endRow,start:startRow*columns,end:Math.min(total,endRow*columns),top:startRow*rowStride,bottom:(totalRows-endRow)*rowStride,totalRows};
}


// Image checks are deliberately separate from image presence in a catalog response.
// A URL in TCGdex is only a candidate; an image counts as found after a real load.
function imageState(id, records, transient, now=Date.now()) {
  const record=records.get(id);
  if(record?.source==='missing' && record.verificationVersion===3 && record.missingUntil>now)return 'missing';
  if(record?.source && record.source!=='missing' && record.checkedAt>0)return 'found';
  const current=transient.get(id);
  return ['checking','error'].includes(current)?current:'pending';
}
function imageCoverage(cards, records, transient, now=Date.now()) {
  const stats={total:cards.length,found:0,missing:0,checking:0,error:0,pending:0,checked:0};
  for(const card of cards){
    const state=imageState(card.id,records,transient,now);
    stats[state]++;
  }
  stats.checked=stats.found+stats.missing;
  return stats;
}
function reconcileIds(existingIds, wantedIds) {
  const wanted=new Set(wantedIds);
  return {retained:existingIds.filter(id=>wanted.has(id)),added:wantedIds.filter(id=>!existingIds.includes(id)),removed:existingIds.filter(id=>!wanted.has(id))};
}

// The scheduled GitHub harvest publishes URL candidates, not browser-verified images.
// Keep this index separate from local imageRecords so the two counters remain honest.
function parseHarvestIndex(payload,validId,validUrl){
  if(payload?.format!=='pokevault-image-index-v1'||!payload.images||typeof payload.images!=='object'||Array.isArray(payload.images))throw Error('Invalid harvest index');
  const entries=Object.entries(payload.images);
  if(entries.length>30000)throw Error('Harvest index exceeds the French catalog');
  const images=new Map();
  for(const [id,entry] of entries){
    if(!validId(id)||!entry||typeof entry!=='object')continue;
    const url=validUrl(entry.url);
    if(!url)continue;
    images.set(id,{url,source:entry.source||'github-harvest',checkedAt:Number.isFinite(entry.checkedAt)?entry.checkedAt:0});
  }
  if(!images.size)throw Error('Empty or invalid harvest index');
  const exportedAt=Date.parse(payload.exportedAt);
  return {images,exportedAt:Number.isFinite(exportedAt)?exportedAt:null};
}


const API='https://api.tcgdex.net/v2';
// Transitional, unauthenticated fallback only. The legacy provider retires March 2027.
const ALTERNATE_API='https://api.pokemontcg.io/v2/cards';
const OFFLINE_ROOT='./assets/offline/';
const HARVEST_INDEX_URL='https://raw.githubusercontent.com/engoB/PokeTest/pokevault-image-data/index.json';
const LIBRARY_CONFIG_URL='./image-library-config.json?v=5.1.1';
const imageLibrary={baseUrl:null,images:new Map(),version:null,status:'unconfigured',loading:false};
const HARVEST_CACHE_KEY='./assets/offline/harvest-index-cache';
const HARVEST_CACHE_NAME='pokevault-harvest-index-v1';
const offlinePack={images:Object.create(null),sealed:false,catalog:null,sets:null,setDetails:null,detailsManifest:null,detailShards:new Map()};
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state={
  allSets:[],allCards:[],cards:[],catalogStatus:'loading',cardIndex:new Map(),selectedSet:'all',status:'all',type:'all',sort:'number',
  layout:'comfortable',collection:{},prices:{},marketLinks:new Map(),db:null,dirtyPrices:new Set(),details:new Map(),pendingDetails:new Map(),
  options:{animateCards:true,showPrices:true},suggestions:[],suggestionIndex:-1,
  imageRecords:new Map(),imageExtras:new Map(),imageFailures:new Map(),imageRetryAt:new Map(),imageRetryCount:new Map(),pendingFallback:new Map(),english:new Map(),
  tileCache:new Map(),imageProviderErrors:new Set(),imageTransient:new Map(),imageScanToken:0,imageScanning:false,imagePaused:false,imageScanScope:[],imageScanLimit:0,
  pendingEnglish:new Map(),imageCoverageTimer:0,imageAutoTimer:0,
  harvestIndex:new Map(),harvestExportedAt:null,harvestSource:'pending',harvestSyncing:false,
  englishSets:new Map(),altChecked:new Set(),altAttempted:new Set(),altCalls:0,altLastCall:0,altTail:Promise.resolve(),queue:[],running:0,
  scope:[],display:[],viewport:{startRow:-1,endRow:-1,columns:0,stride:0},scrollFrame:0,lastScroll:0,
  inspected:null,requestId:0,scanToken:0,scanning:false,scanAll:false,pendingResort:false,installEvent:null
};

function storage(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function saveCollection(next){
  try{localStorage.setItem('pv_collection',JSON.stringify(next));return true;}
  catch{showToast('Stockage indisponible. Exportez votre collection avant de continuer.');return false;}
}
// Never clear or migrate pv_collection on startup. Old installations retain their cards.
state.collection=readCollection(storage('pv_collection',{}));
state.imagePaused=storage('pv_image_scan_paused',false)===true;
const savedOptions=storage('pv_options_v1',{});
state.options={animateCards:savedOptions.animateCards!==false,showPrices:savedOptions.showPrices!==false};
for(const [id,p] of Object.entries(storage('pv_prices',{}))){
  const trend=numeric(p?.trend);
  if(trend!==null)state.prices[id]=restorePrice(p); // Old cached quotes lack a verified finish: re-fetch them.
}
for(const [id,p] of Object.entries(storage('pv_prices_v2',{}))){
  if(p&&typeof p==='object')state.prices[id]=restorePrice(p);
}

function showToast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.hidden=true,3600);}
function enqueue(task,priority=false){return new Promise((resolve,reject)=>{const job={task,resolve,reject};if(priority)state.queue.unshift(job);else state.queue.push(job);pumpQueue();});}
function pumpQueue(){while(state.running<3&&state.queue.length){const job=state.queue.shift();state.running++;Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{state.running--;pumpQueue();});}}
function detailShard(id){let sum=0;for(const c of id)sum=(sum*31+c.charCodeAt(0))>>>0;return sum%32;}
async function localCardDetail(id){
  if(!offlinePack.detailsManifest||!safeCardId(id))return null;
  const shard=String(detailShard(id)).padStart(2,'0');
  if(!offlinePack.detailShards.has(shard)){
    const task=fetch(`${OFFLINE_ROOT}details/${shard}.json`).then(r=>r.ok?r.json():null).catch(()=>null);
    offlinePack.detailShards.set(shard,task);
  }
  const data=await offlinePack.detailShards.get(shard);
  return data?.[id]||null;
}
async function getJSON(path){
  if(path==='fr/cards'&&offlinePack.catalog)return offlinePack.catalog;
  if(path==='fr/sets'&&offlinePack.sets)return offlinePack.sets;
  if(path.startsWith('fr/sets/')&&offlinePack.setDetails){
    const id=decodeURIComponent(path.slice('fr/sets/'.length));
    if(Object.hasOwn(offlinePack.setDetails,id))return offlinePack.setDetails[id];
  }
  if(path.startsWith('fr/cards/')&&offlinePack.detailsManifest){
    const id=decodeURIComponent(path.slice('fr/cards/'.length));
    const local=await localCardDetail(id);if(local)return local;
  }
  // An API request must never leave the entire interface on an infinite skeleton.
  // The full FR catalog can be large; individual card requests have a shorter limit.
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),/^(?:fr|en)\/(?:cards|sets)$/.test(path)?35000:14000);
  try{
    const response=await fetch(`${API}/${path}`,{signal:controller.signal});
    if(!response.ok)throw new Error(`TCGdex ${response.status}`);
    return await response.json();
  }catch(error){
    if(error?.name==='AbortError')throw new Error('Délai dépassé : le catalogue ne répond pas.');
    throw error;
  }finally{clearTimeout(timeout);}
}
async function loadOfflinePack(){
  // Optional native/static pack. Missing manifest means ordinary online PWA.
  let manifest;
  try{const response=await fetch(`${OFFLINE_ROOT}images.json`,{cache:'no-store'});if(!response.ok)return;manifest=await response.json();}
  catch{return;}
  if(manifest?.version!==1||!manifest.images||typeof manifest.images!=='object')return;
  offlinePack.sealed=manifest.mode==='sealed';
  for(const [id,entry] of Object.entries(manifest.images)){
    if(!safeCardId(id)||!entry?.file||entry.file!==`./assets/offline/cards/${encodeURIComponent(id)}.${entry.file.split('.').pop()}`||!/\.(webp|png|jpg)$/.test(entry.file))continue;
    offlinePack.images[id]=entry;
    state.imageRecords.set(id,{source:'bundled',url:entry.file,checkedAt:Date.now(),verificationVersion:4});
  }
  const load=file=>fetch(`${OFFLINE_ROOT}${file}`).then(r=>r.ok?r.json():null);
  const [catalog,sets,setDetails,detailsManifest,index]=await Promise.allSettled([
    load('catalog-fr.json'),load('sets-fr.json'),load('sets-detailed.json'),
    load('details-manifest.json'),load('verified-index.json')
  ]);
  if(catalog.status==='fulfilled'&&Array.isArray(catalog.value))offlinePack.catalog=catalog.value;
  if(sets.status==='fulfilled'&&Array.isArray(sets.value))offlinePack.sets=sets.value;
  if(setDetails.status==='fulfilled'&&setDetails.value&&typeof setDetails.value==='object'&&!Array.isArray(setDetails.value))offlinePack.setDetails=setDetails.value;
  if(detailsManifest.status==='fulfilled'&&detailsManifest.value?.format==='pokevault-catalogue-manifest-v1')offlinePack.detailsManifest=detailsManifest.value;
  if(!offlinePack.sealed&&index.status==='fulfilled'&&index.value?.format==='pokevault-image-index-v1'){
    for(const [id,entry] of Object.entries(index.value.images||{})){
      if(!safeCardId(id)||offlinePack.images[id]||!trustedImageUrl(entry?.url)||!Number.isFinite(entry?.checkedAt))continue;
      state.imageRecords.set(id,{url:entry.url,source:entry.source||'previously-verified',checkedAt:entry.checkedAt});
    }
  }
}
// Prefer our own hash-addressed image library. Only the small manifest is downloaded.
async function loadImageLibrary(){
 if(imageLibrary.loading)return;imageLibrary.loading=true;
 try{
  const configResponse=await fetch(LIBRARY_CONFIG_URL,{cache:'no-store'});
  if(!configResponse.ok)throw Error('No library config');
  const config=await configResponse.json();
  if(!config?.baseUrl){imageLibrary.status='unconfigured';return;}
  const base=new URL(config.baseUrl,document.baseURI);
  if(base.origin!==location.origin||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/assets/library/'))throw Error('Library must be hosted by this GitHub Pages site');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);let response;
  try{response=await fetch(new URL('manifest.json',base),{cache:'no-cache',signal:controller.signal});}finally{clearTimeout(timer);}
  if(!response.ok)throw Error('Library HTTP '+response.status);
  const manifest=await response.json();
  if(manifest?.format!=='pokevault-owned-library-v1'||!manifest.images||typeof manifest.images!=='object'||Array.isArray(manifest.images))throw Error('Invalid library manifest');
  const next=new Map();
  for(const [id,row] of Object.entries(manifest.images)){
   if(!safeCardId(id)||typeof row?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||typeof row?.file!=='string')continue;
   const ext=row.file.split('.').pop();
   if(!['webp','png','jpg'].includes(ext)||row.file!==`cards/${encodeURIComponent(id)}/${row.sha256.slice(0,16)}.${ext}`)continue;
   const url=new URL(row.file,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))continue;
   next.set(id,{url:url.href,source:'owned-library',checkedAt:Number(row.checkedAt)||0});
  }
  // The GitHub Pages library starts empty until an authorized batch is committed.
  imageLibrary.baseUrl=base.href;imageLibrary.images=next;imageLibrary.version=manifest.version||null;imageLibrary.status='ready';
  for(const tile of $('cards-grid').querySelectorAll('.card-tile')){
   const id=tile.dataset.id,img=tile.querySelector('img.card-art');
   if(next.has(id)&&img&&!img.__loading&&!img.classList.contains('is-loaded'))applyImageToVisible(id);
  }
 }catch(error){imageLibrary.status='unavailable';console.warn('Owner library unavailable; using external fallbacks',error);}
 finally{imageLibrary.loading=false;scheduleImageCoverage();}
}
// Pull the latest metadata branch directly, with a cached copy and the repository
// snapshot as fallbacks. Never import URLs as locally verified browser images.
async function loadHarvestIndex(){
  if(offlinePack.sealed||state.harvestSyncing)return;
  state.harvestSyncing=true;updateImageCoverage();
  let parsed=null,source='unavailable';
  const cache=typeof caches!=='undefined'?await caches.open(HARVEST_CACHE_NAME).catch(()=>null):null;
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    try{
      const response=await fetch(`${HARVEST_INDEX_URL}?v=${Math.floor(Date.now()/21600000)}`,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error(`Harvest index HTTP ${response.status}`);
      const copy=response.clone();
      parsed=parseHarvestIndex(await response.json(),safeCardId,trustedImageUrl);
      source='github';
      // A 3 MB metadata response is cheaper to cache than to reverify 22k cards.
      if(cache)cache.put(HARVEST_CACHE_KEY,copy).catch(()=>{});
    }finally{clearTimeout(timer);}
  }catch(error){
    console.warn('Live harvest index unavailable; trying cached index',error);
    if(cache)try{
      const response=await cache.match(HARVEST_CACHE_KEY);
      if(response){parsed=parseHarvestIndex(await response.json(),safeCardId,trustedImageUrl);source='cached';}
    }catch{}
    if(!parsed)try{
      const response=await fetch('./inputs/pokevault-index-visuels.json?v=4.9.0');
      if(response.ok){parsed=parseHarvestIndex(await response.json(),safeCardId,trustedImageUrl);source='snapshot';}
    }catch{}
  }finally{state.harvestSyncing=false;}
  if(parsed){
    // A stale CDN response must not replace a newer cached index.
    if(!state.harvestExportedAt||!parsed.exportedAt||parsed.exportedAt>=state.harvestExportedAt){
      state.harvestIndex=parsed.images;state.harvestExportedAt=parsed.exportedAt;state.harvestSource=source;
      for(const tile of $('cards-grid').querySelectorAll('.card-tile')){
        const id=tile.dataset.id,img=tile.querySelector('img.card-art');
        if(state.harvestIndex.has(id)&&img&&!img.classList.contains('is-loaded')&&!img.__loading)applyImageToVisible(id);
      }
      startAutomaticImageScan();
    }
  }else if(!state.harvestIndex.size)state.harvestSource='unavailable';
  updateImageCoverage();
}
function isFresh(id){const p=state.prices[id];return Boolean(p?.source==='tcgdex-cardmarket'&&p.fetchedAt&&Date.now()-p.fetchedAt<PRICE_TTL);}
function trend(id){const p=state.prices[id];return p?.source==='tcgdex-cardmarket'&&p.selectedVariant&&Number.isFinite(p.trend)?p.trend:null;}
// The displayed quote defaults to Standard. If only its 30-day average is
// available, mark it as approximate; never pass it off as a market trend.
function displayedQuote(id){
 const p=state.prices[id];
 if(p?.source!=='tcgdex-cardmarket'||!p.selectedVariant)return {text:'Cote —',average:false};
 if(Number.isFinite(p.trend))return {text:formatEuro(p.trend),average:false};
 if(Number.isFinite(p.avg30))return {text:`≈ ${formatEuro(p.avg30)}`,average:true};
 return {text:'Cote —',average:false};
}
function networkStatus(){const offline=!navigator.onLine;$('network-indicator').hidden=!offline;if(offline)$('network-indicator').textContent='Hors connexion · cache local';}

async function hydrateCache(){
  state.db=await openCache();
  const [prices,images]=await Promise.all([loadCache(state.db,'prices'),loadCache(state.db,'images')]);
  for(const {id,...entry} of prices){if((entry.fetchedAt||0)>(state.prices[id]?.fetchedAt||0))state.prices[id]=restorePrice(entry);}
  for(const {id,...entry} of images)if(!offlinePack.images[id]&&(entry.checkedAt||0)>(state.imageRecords.get(id)?.checkedAt||0))state.imageRecords.set(id,entry);
  // Browsers in private mode can deny IndexedDB. Preserve a small localStorage fallback.
  if(!state.db)for(const [id,entry] of Object.entries(storage('pv_image_resolutions_v1',{})))if(!offlinePack.images[id])state.imageRecords.set(id,entry);
  updateSummary();
  if(state.cards.length){refreshResults();startAutomaticImageScan();}
}
let priceFlushTimer;
function flushPricesSoon(){clearTimeout(priceFlushTimer);priceFlushTimer=setTimeout(async()=>{
  const ids=[...state.dirtyPrices];state.dirtyPrices.clear();
  if(!ids.length)return;
  const entries=ids.map(id=>({id,...state.prices[id]}));
  await putCache(state.db,'prices',entries);
  // Backward-compatible small snapshot. No collection keys are touched.
  const snapshot=Object.entries(state.prices).sort((a,b)=>(b[1].fetchedAt||0)-(a[1].fetchedAt||0)).slice(0,350);
  try{localStorage.setItem('pv_prices_v2',JSON.stringify(Object.fromEntries(snapshot)));}catch{}
},850);}
function rememberPrice(id,detail){
  const parsed=parsePrice(detail);
  const previous=state.prices[id];
  state.prices[id]=parsed?(previous?.selectedVariant&&parsed.quotes.some(q=>q.id===previous.selectedVariant)?selectPriceVariant(parsed,previous.selectedVariant):parsed):{trend:null,avg30:null,low:null,quotes:[],selectedVariant:null,source:'tcgdex-cardmarket',updated:null,fetchedAt:Date.now()};
  state.dirtyPrices.add(id);flushPricesSoon();updateTilePrice(id);
  if(state.inspected===id)updateDialogPrice(id);
  if(state.collection[id])updateSummary();
  if(state.sort.startsWith('price')||state.type.startsWith('over'))schedulePriceRefresh();
}
function updateSummary(){
  let count=0,unique=0,value=0,valued=0;
  for(const [id,quantity] of Object.entries(state.collection)){
    count+=quantity;unique++;
    if(trend(id)!==null){value+=trend(id)*quantity;valued++;}
  }
  $('owned-total').textContent=count.toLocaleString('fr-FR');
  $('owned-unique').textContent=unique.toLocaleString('fr-FR');
  $('portfolio-value').textContent=formatEuro(value);
  $('portfolio-value').title=`${valued} référence(s) cotée(s) sur ${unique}. Estimation indicative, correspondance produit non garantie.`;
}
function closeSidebar(){$('sidebar').classList.remove('is-open');$('sidebar-scrim').hidden=true;$('sidebar-open').setAttribute('aria-expanded','false');}
function openSidebar(){$('sidebar').classList.add('is-open');$('sidebar-scrim').hidden=false;$('sidebar-open').setAttribute('aria-expanded','true');$('sidebar-close').focus();}
function renderSets(){
  const query=normalize($('set-search').value);
  const sets=state.allSets.filter(s=>normalize(`${s.name} ${s.id}`).includes(query));
  $('sets-list').innerHTML=sets.length?sets.map(s=>`<button type="button" class="set-button ${s.id===state.selectedSet?'is-selected':''}" data-set="${escapeHtml(s.id)}" aria-pressed="${s.id===state.selectedSet}"><span title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span><span class="set-count">${escapeHtml(s.cardCount?.total??'')}</span></button>`).join(''):'<p class="hint">Aucune extension trouvée.</p>';
  $('all-sets').classList.toggle('is-selected',state.selectedSet==='all');
  $('all-sets').setAttribute('aria-pressed',String(state.selectedSet==='all'));
}
function indexCards(cards){for(const card of cards){state.cardIndex.set(card.id,card);card._searchName=normalize(card.name);card._searchKey=normalize(`${card.name} ${card.localId} ${card.id}`);}}
function cancelScan(){state.scanToken++;state.scanning=false;state.scanAll=false;}
async function loadCatalog(){
  const seq=++state.requestId;
  cancelScan();cancelImageScan();state.catalogStatus='loading';$('counter').textContent='Chargement du catalogue…';updateImageCoverage();$('cards-grid').setAttribute('aria-busy','true');
  const [sets,cards]=await Promise.allSettled([getJSON('fr/sets'),getJSON('fr/cards')]);
  if(seq!==state.requestId)return;
  if(sets.status==='fulfilled'){
    state.allSets=sets.value.sort((a,b)=>String(b.releaseDate||'').localeCompare(String(a.releaseDate||'')));
    renderSets();
  }else $('sets-list').innerHTML='<p class="hint">Extensions indisponibles. Réessayez en ligne.</p>';
  if(cards.status==='fulfilled'){
    state.catalogStatus='ready';
    state.allCards=cards.value;state.cards=cards.value;indexCards(cards.value);
    $('all-sets-count').textContent=cards.value.length.toLocaleString('fr-FR');
    $('empty-state').querySelector('h2').textContent='Aucune carte trouvée';
    $('empty-state').querySelector('p').textContent='Modifiez votre recherche ou vos filtres.';
    $('clear-filters').textContent='Réinitialiser les filtres';delete $('clear-filters').dataset.action;
    refreshResults();updateSuggestions();startAutomaticImageScan();
    // Owned cards get priority for portfolio accuracy without touching the collection itself.
    if(state.options.showPrices)for(const id of Object.keys(state.collection).slice(0,60))if(!isFresh(id))requestDetail(id).catch(()=>{});
  }else{
    state.catalogStatus='error';
    state.cards=[];refreshResults();$('counter').textContent='Catalogue indisponible : vérifiez votre connexion ou réessayez.';
    $('image-status').textContent='Catalogue non chargé';
    $('image-warning').textContent='La recherche des visuels commencera dès que le catalogue sera disponible.';
    $('empty-state').querySelector('h2').textContent='Catalogue indisponible';
    $('empty-state').querySelector('p').textContent=location.protocol==='file:'?'Ouvrez l’application depuis un serveur local ou publiez-la sur HTTPS.':'La connexion ou TCGdex ne répond pas. Cliquez sur Réessayer.';
    $('clear-filters').textContent='Réessayer';$('clear-filters').dataset.action='retry';$('empty-state').hidden=false;
  }
}
async function selectSet(id){
  const seq=++state.requestId;cancelScan();cancelImageScan();closeSidebar();state.selectedSet=id;
  const set=state.allSets.find(s=>s.id===id);
  $('current-set-title').textContent=id==='all'?'Toutes les cartes':set?.name||id;
  $('set-subtitle').textContent=id==='all'?'Retrouvez chaque carte, série par série.':`${set?.cardCount?.total??'—'} cartes dans cette extension`;
  renderSets();
  if(id==='all'){state.cards=state.allCards;refreshResults();scrollCatalog();startAutomaticScan();startAutomaticImageScan();return;}
  $('counter').textContent='Chargement de l’extension…';state.cards=[];refreshResults();
  try{
    const detail=await getJSON(`fr/sets/${encodeURIComponent(id)}`);
    if(seq!==state.requestId)return;
    state.cards=detail.cards||[];indexCards(state.cards);refreshResults();scrollCatalog();startAutomaticScan();startAutomaticImageScan();
  }catch{if(seq===state.requestId){state.cards=[];refreshResults();showToast('Extension momentanément indisponible.');}}
}
function baseScope(){
  const query=normalize($('card-search').value);
  return state.cards.filter(c=>{
    if(query&&!(c._searchKey??normalize(`${c.name} ${c.localId} ${c.id}`)).includes(query))return false;
    const quantity=state.collection[c.id]||0;
    if(state.status==='owned'&&!quantity)return false;
    if(state.status==='missing'&&quantity)return false;
    if(state.type==='over10'||state.type==='over50')return true;
    return cardMatchesType(c,state.type,trend(c.id));
  });
}
function needsScan(){return (state.options.showPrices&&(state.sort.startsWith('price')||['over10','over50'].includes(state.type)))||['illustration','secret'].includes(state.type);}
function refreshResults({keepScroll=false}={}){
  state.scope=baseScope();
  const filtered=state.scope.filter(c=>cardMatchesType(c,state.type,trend(c.id)));
  state.display=sortCards(filtered,state.sort,state.prices);
  state.viewport.startRow=-1;state.viewport.endRow=-1;
  $('counter').textContent=`${state.display.length.toLocaleString('fr-FR')} carte${state.display.length>1?'s':''} · ${state.scope.length.toLocaleString('fr-FR')} dans le périmètre`;
  $('empty-state').hidden=state.display.length>0 || (needsScan()&&state.scope.length>0);
  if(!state.display.length&&needsScan()&&state.scope.length){
    $('empty-state').hidden=false;
    $('empty-state').querySelector('h2').textContent=priceCoverage(state.scope,state.prices).remaining?'Cotes en cours de vérification':'Aucune carte au-dessus du seuil';
    $('empty-state').querySelector('p').textContent='Les cartes sans cote connue ne sont pas considérées comme bon marché.';
    $('clear-filters').textContent='Réinitialiser les filtres';
  }else if(state.display.length){
    $('empty-state').querySelector('h2').textContent='Aucune carte trouvée';
    $('empty-state').querySelector('p').textContent='Modifiez votre recherche ou vos filtres.';
  }
  updateCoverage();scheduleImageCoverage();renderViewport(true);
  if(!keepScroll)updateScrollTools();
}
function updateCoverage(){
  const active=state.options.showPrices&&needsScan();$('price-coverage').hidden=!active;
  if(!active)return;
  const stats=priceCoverage(state.scope,state.prices);
  $('price-progress').textContent=`${stats.checked.toLocaleString('fr-FR')} / ${stats.total.toLocaleString('fr-FR')} fiches vérifiées · ${stats.quoted.toLocaleString('fr-FR')} cotées${stats.missing?' · '+stats.missing+' sans cote':''}`;
  $('price-progress-bar').value=stats.checked;$('price-progress-bar').max=Math.max(stats.total,1);
  $('price-warning').textContent=stats.remaining>0
    ?`Résultats provisoires : ${stats.remaining.toLocaleString('fr-FR')} fiche(s) à vérifier. Les prix inconnus restent hors des seuils, pas à 0 €.`
    :'Périmètre vérifié. Certaines cartes peuvent ne pas avoir de cote Cardmarket.';
  $('scan-next').hidden=stats.remaining===0;
  $('scan-next').disabled=state.scanning;
  $('scan-next').textContent=state.scanning?'Analyse en cours…':`Analyser ${Math.min(150,stats.remaining)} fiches de plus`;
  $('scan-all').hidden=stats.remaining===0 || stats.remaining<=150;
  $('scan-all').disabled=state.scanning;
  $('scan-stop').hidden=!state.scanning;
  $('apply-prices').hidden=!state.pendingResort;
}
// The visual scanner is independent of price verification. It keeps working while
// users browse and never writes to pv_collection. Only a successfully loaded image
// or a completed multi-source miss counts as verified.
function currentImageScope(){return state.allCards.length?state.allCards:state.scope;}
// Artwork coverage is for the ENTIRE catalogue, independent of the selected extension or filters.
const LEGACY_DAILY_LIMIT=400;
function legacyBudget(){
  const windowStart=Math.floor(Date.now()/86400000)*86400000;
  const previous=storage('pv_secondary_budget_v1',{});
  return previous.windowStart===windowStart?{windowStart,used:Number(previous.used)||0}:{windowStart,used:0};
}
function nextLegacyWindow(){return (Math.floor(Date.now()/86400000)+1)*86400000;}
function useLegacyBudget(){const value=legacyBudget();if(value.used>=LEGACY_DAILY_LIMIT)return false;value.used++;try{localStorage.setItem('pv_secondary_budget_v1',JSON.stringify(value));}catch{}return true;}
function scheduleImageCoverage(){
  if(state.imageCoverageTimer)return;
  state.imageCoverageTimer=setTimeout(()=>{state.imageCoverageTimer=0;updateImageCoverage();},350);
}
function updateImageCoverage(){
  if(state.catalogStatus!=='ready'){
    $('image-status').textContent=state.catalogStatus==='error'?'Catalogue indisponible':'Chargement du catalogue';
    $('image-progress').textContent='En attente du catalogue';
    $('image-harvest-progress').textContent='Synchronisation de l’index GitHub…';
    $('image-progress-bar').max=1;$('image-progress-bar').value=0;
    $('image-warning').textContent=state.catalogStatus==='error'
      ?'Impossible de rechercher les illustrations avant le chargement du catalogue. Cliquez sur Réessayer.'
      :'La vérification des visuels démarrera automatiquement après le chargement du catalogue.';
    $('image-next').disabled=true;$('image-all').disabled=true;
    $('image-stop').hidden=true;
    return;
  }
  if(offlinePack.sealed){
    $('image-harvest-progress').textContent='Pack local figé · moisson distante désactivée';
    $('image-harvest-source').textContent='Cette édition utilise exclusivement les illustrations embarquées.';
    $('image-harvest-bar').max=1;$('image-harvest-bar').value=0;
    const scope=currentImageScope(),local=scope.filter(c=>offlinePack.images[c.id]).length;
    $('image-progress').textContent=`${local.toLocaleString('fr-FR')} / ${scope.length.toLocaleString('fr-FR')} visuels locaux · ${(scope.length-local).toLocaleString('fr-FR')} non embarqués`;
    $('image-progress-bar').max=Math.max(1,scope.length);$('image-progress-bar').value=local;
    $('image-warning').textContent=local===scope.length?'Toutes les illustrations de ce périmètre sont embarquées. Aucune vérification réseau.':`Pack figé : ${scope.length-local} illustrations non embarquées. Consulter le rapport de la moisson GitHub ; aucune vérification réseau automatique.`;
    $('image-next').hidden=true;$('image-all').hidden=true;$('image-stop').hidden=true;
    $('image-status').textContent='Pack local';return;
  }
  const scope=currentImageScope();
  const indexed=scope.reduce((count,card)=>count+(state.harvestIndex.has(card.id)?1:0),0);
  const hosted=scope.reduce((count,card)=>count+(imageLibrary.images.has(card.id)?1:0),0);
  const fr=value=>value.toLocaleString('fr-FR');
  $('image-harvest-progress').textContent=state.harvestIndex.size
    ?`${fr(indexed)} / ${fr(scope.length)} URL indexées · ${(indexed/Math.max(1,scope.length)*100).toLocaleString('fr-FR',{maximumFractionDigits:2})} %`
    :state.harvestSyncing?'Synchronisation de l’index GitHub…':'Index indisponible · vérification locale active';
  $('image-harvest-bar').max=Math.max(1,scope.length);$('image-harvest-bar').value=indexed;
  const origin={github:'Moisson GitHub à jour',cached:'Dernier index GitHub enregistré sur cet appareil',snapshot:'Index de secours intégré au dépôt',unavailable:'GitHub indisponible : les visuels locaux restent accessibles'};
  const date=state.harvestExportedAt?` · ${new Date(state.harvestExportedAt).toLocaleString('fr-FR')}`:'';
  $('image-harvest-source').textContent=(imageLibrary.status==='ready'?`Bibliothèque GitHub : ${fr(hosted)} / ${fr(scope.length)} fichiers hébergés · version ${imageLibrary.version||'inconnue'}. `:imageLibrary.status==='unconfigured'?'Bibliothèque non configurée : ':imageLibrary.status==='unavailable'?'Bibliothèque indisponible, secours actif : ':'Bibliothèque en cours de chargement : ')+(origin[state.harvestSource]||'Connexion à la moisson…')+date+' · URL candidates, pas toutes testées sur cet appareil.';
  const stats=imageCoverage(scope,state.imageRecords,state.imageTransient);
  $('image-progress').textContent=`${stats.checked.toLocaleString('fr-FR')} / ${stats.total.toLocaleString('fr-FR')} vérifiés sur cet appareil · ${stats.found.toLocaleString('fr-FR')} trouvés · ${stats.missing.toLocaleString('fr-FR')} introuvables`;
  $('image-progress-bar').max=Math.max(1,stats.total);
  $('image-progress-bar').value=stats.checked;
  const remaining=stats.pending+stats.error+stats.checking;
  const suffix=stats.error?` · ${stats.error.toLocaleString('fr-FR')} à réessayer`:'';
  const quota=legacyBudget().used>=400?' · Source secondaire en pause jusqu’à demain (quota prudent).':'';
  $('image-warning').textContent=state.imageScanning
    ?`Recherche en arrière-plan · ${stats.checking} en cours · ${stats.pending} en attente${suffix}${quota}. Vous pouvez continuer à défiler.`
    :state.imagePaused?`Recherche en pause · ${remaining} à vérifier${suffix}${quota}. Les images déjà trouvées restent en cache.`
    :remaining?`${stats.pending} non encore recherchés${suffix}${quota}. « Introuvable » signifie que les sources ont été vérifiées.`
    :'Catalogue analysé selon les sources disponibles. Les échecs confirmés seront retentés après 24 h.';
  $('image-next').hidden=remaining===0;
  $('image-next').disabled=state.imageScanning||!navigator.onLine;
  $('image-next').textContent=`Vérifier ${Math.min(100,remaining)} visuels`;
  $('image-all').hidden=remaining<=100;
  $('image-all').disabled=state.imageScanning||!navigator.onLine;
  $('image-stop').hidden=!state.imageScanning;
  $('image-status').textContent=state.imageScanning?'Analyse automatique':state.imagePaused?'En pause':remaining?'Analyse automatique programmée':'À jour';
}
function markImageStatus(id,status){
  if(status==='found'||status==='missing'){state.imageTransient.delete(id);state.imageRetryAt.delete(id);state.imageRetryCount.delete(id);}
  else{state.imageTransient.set(id,status);if(status==='error'){const attempts=(state.imageRetryCount.get(id)||0)+1;state.imageRetryCount.set(id,attempts);const dailyBudget=legacyBudget().used>=400;state.imageRetryAt.set(id,Date.now()+(dailyBudget?Math.max(3600000,nextLegacyWindow()-Date.now()):Math.min(3600000,20000*2**Math.min(attempts,7))));}}
  for(const tile of $('cards-grid').querySelectorAll('.card-tile'))if(tile.dataset.id===id){
    const label=tile.querySelector('.ghost-label');if(label)label.textContent=imageLabel(id);
  }
  if(state.inspected===id){$('dialog-image-holder').querySelector('.ghost-label').textContent=imageLabel(id);updateImageSource(id);}
  scheduleImageCoverage();
}
function imageLabel(id){
  if(offlinePack.sealed&&!offlinePack.images[id])return 'Visuel non embarqué';
  const status=imageState(id,state.imageRecords,state.imageTransient);
  return status==='checking'?'Recherche en cours…':status==='missing'?(state.harvestIndex.has(id)?'Nouveau visuel indexé · à vérifier':'Aucun visuel trouvé'):status==='error'?'Nouvel essai automatique prévu':status==='found'?'':state.harvestIndex.has(id)?'Visuel indexé · à vérifier':'Recherche non commencée';
}
function cancelImageScan(){state.imageScanToken++;state.imageScanning=false;clearTimeout(state.imageAutoTimer);scheduleImageCoverage();}
function stopImageScan(){state.imagePaused=true;try{localStorage.setItem('pv_image_scan_paused','true');}catch{}cancelImageScan();}
function imageCandidates(){
  const cards=currentImageScope();
  const owned=[],visible=[],rest=[];
  const displayed=new Set([...$('cards-grid').querySelectorAll('.card-tile')].map(tile=>tile.dataset.id));
  for(const card of cards){
    const status=imageState(card.id,state.imageRecords,state.imageTransient);
    if(imageLibrary.images.has(card.id)||state.harvestIndex.has(card.id)||status==='found'||(status==='missing'&&!state.harvestIndex.has(card.id))||status==='checking'||(status==='error'&&(state.imageRetryAt.get(card.id)||0)>Date.now()))continue;
    if(state.collection[card.id])owned.push(card);
    else if(displayed.has(card.id))visible.push(card);
    else rest.push(card);
  }
  return [...owned,...visible,...rest];
}
function startAutomaticImageScan(){
  if(offlinePack.sealed)return;
  if(state.imagePaused||state.imageScanning||!state.allCards.length||!navigator.onLine)return;
  clearTimeout(state.imageAutoTimer);
  const ready=imageCandidates().length;
  const earliest=Math.min(...[...state.imageRetryAt.values()].filter(t=>t>Date.now()));
  if(!ready&&!Number.isFinite(earliest))return;
  const wait=ready?950:Math.max(2000,Math.min(600000,earliest-Date.now()));
  state.imageAutoTimer=setTimeout(()=>{
    if(state.imagePaused||state.imageScanning||!navigator.onLine)return;
    const remaining=imageCandidates().length;
    if(remaining)scanImages(Math.min(remaining,60));
    else startAutomaticImageScan();
  },wait);
}
function probeImage(url,timeout=8500){
  return new Promise(resolve=>{
    const img=new Image();let finished=false;
    const done=result=>{if(finished)return;finished=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(result);};
    const timer=setTimeout(()=>done('timeout'),timeout);
    img.onload=()=>done('loaded');img.onerror=()=>done('failed');img.src=url;
  });
}
async function verifyCardImage(id){
  if(imageState(id,state.imageRecords,state.imageTransient)==='found'||(imageState(id,state.imageRecords,state.imageTransient)==='missing'&&!state.harvestIndex.has(id)))return;
  markImageStatus(id,'checking');
  const tried=new Set();let uncertain=false;
  try{
    for(let pass=0;pass<5;pass++){
      if(!navigator.onLine){uncertain=true;break;}
      const options=imageOptions(id,'low').filter(item=>!tried.has(item.url)&&!state.imageFailures.get(id)?.has(item.url));
      for(const candidate of options){
        if(imageState(id,state.imageRecords,state.imageTransient)==='found')return; // A visible image already succeeded.
        tried.add(candidate.url);
        const outcome=await probeImage(candidate.url);
        if(outcome==='loaded'){
          if(imageState(id,state.imageRecords,state.imageTransient)!=='found')persistImage(id,{...candidate.entry,url:candidate.url});
          applyImageToVisible(id);
          return;
        }
        if(outcome==='timeout')uncertain=true;
        else{
          const failed=state.imageFailures.get(id)||new Set();failed.add(candidate.url);state.imageFailures.set(id,failed);
        }
      }
      if(imageState(id,state.imageRecords,state.imageTransient)==='found')return;
      const before=state.imageExtras.get(id)?.length||0;
      const found=await ensureFallback(id);
      if(!found&&before===(state.imageExtras.get(id)?.length||0))break;
    }
    if(imageState(id,state.imageRecords,state.imageTransient)==='found')return;
    // A successful secondary catalog query with no image match is a confirmed miss.
    // Broken image URLs, quota exhaustion and network errors are NOT confirmed misses.
    if(!uncertain&&!state.imageProviderErrors.has(id)&&state.altChecked.has(id)&&!tried.size&&!imageOptions(id,'low').length){
      persistImage(id,{source:'missing',verificationVersion:3,missingUntil:Date.now()+24*60*60*1000});
    }else if(imageState(id,state.imageRecords,state.imageTransient)!=='missing')markImageStatus(id,'error');
  }catch{markImageStatus(id,'error');}
}
async function scanImages(limit=100){
  if(state.imageScanning||!navigator.onLine)return;
  state.imagePaused=false;try{localStorage.setItem('pv_image_scan_paused','false');}catch{}const token=++state.imageScanToken;
  const candidates=imageCandidates().slice(0,limit);
  for(const card of candidates)if(state.imageTransient.get(card.id)==='error'){state.imageFailures.delete(card.id);state.imageProviderErrors.delete(card.id);if(!state.altChecked.has(card.id))state.altAttempted.delete(card.id);}
  state.imageScanning=true;updateImageCoverage();
  try{
    for(let i=0;i<candidates.length;i+=2){
      if(token!==state.imageScanToken||!navigator.onLine)break;
      // Don't compete with rendering during a fast scroll.
      if(Date.now()-state.lastScroll<140)await sleep(180);
      if(token!==state.imageScanToken)break;
      await Promise.allSettled(candidates.slice(i,i+2).map(card=>verifyCardImage(card.id)));
      if(i%8===0)updateImageCoverage();
      await sleep(140);
    }
  }finally{if(token===state.imageScanToken){state.imageScanning=false;updateImageCoverage();startAutomaticImageScan();}}
}
function scanAllImages(){
  const count=imageCandidates().length;
  if(count>500&&!confirm(`Vérifier ${count.toLocaleString('fr-FR')} illustrations peut durer longtemps et solliciter les catalogues externes. Continuer ?`))return;
  scanImages(count);
}
let refreshPriceTimer;
function schedulePriceRefresh(){
  clearTimeout(refreshPriceTimer);
  refreshPriceTimer=setTimeout(()=>{
    const gridY=$('grid-origin').getBoundingClientRect().top;
    if(gridY<140){state.pendingResort=true;updateCoverage();return;}
    state.pendingResort=false;refreshResults({keepScroll:true});
  },500);
}
function scanCandidates(){
  const all=baseScope().filter(c=>!isFresh(c.id));
  const owned=[],visible=[],rest=[];
  const displayed=new Set(state.display.map(c=>c.id));
  for(const c of all){if(state.collection[c.id])owned.push(c);else if(displayed.has(c.id))visible.push(c);else rest.push(c);}
  return [...owned,...visible,...rest];
}
function startAutomaticScan(){
  if(!needsScan()||!state.cards.length)return;
  const remaining=scanCandidates().length;
  if(!remaining)return;
  const limit=state.selectedSet==='all'?Math.min(75,remaining):Math.min(300,remaining);
  scanPrices(limit);
}
async function scanPrices(limit=150){
  if(state.scanning)return;
  const token=++state.scanToken;
  state.scanning=true;updateCoverage();
  const candidates=scanCandidates().slice(0,limit);
  for(let i=0;i<candidates.length;i+=3){
    if(token!==state.scanToken||!navigator.onLine)break;
    await Promise.allSettled(candidates.slice(i,i+3).map(c=>requestDetail(c.id)));
    if(token!==state.scanToken)break;
    if(i%12===0)updateCoverage();
    // Be considerate to a public API, and keep viewport requests responsive.
    await sleep(190);
  }
  if(token===state.scanToken){state.scanning=false;updateCoverage();schedulePriceRefresh();}
}
function stopScan(){cancelScan();updateCoverage();}
function scanAll(){
  const n=scanCandidates().length;
  if(n>500&&!confirm(`Analyser ${n.toLocaleString('fr-FR')} fiches peut durer longtemps et solliciter TCGdex. Continuer ?`))return;
  scanPrices(n);
}

// The DOM contains at most a few overscanned rows, regardless of catalog size.
function gridGeometry(){
  const grid=$('cards-grid');
  const template=getComputedStyle(grid).gridTemplateColumns;
  const columns=Math.max(1,template.split(/\s+/).filter(x=>x&&x!=='none').length);
  const gap=parseFloat(getComputedStyle(grid).rowGap)||12;
  const first=grid.querySelector('.card-tile');
  const estimated=grid.clientWidth/columns*337/245+66;
  const measured=first?.getBoundingClientRect().height||estimated;
  return {columns,stride:measured+gap};
}
function renderViewport(force=false){
  if($('catalog').hidden)return;
  const grid=$('cards-grid');
  const geometry=gridGeometry();
  if(force||state.viewport.columns!==geometry.columns||!state.viewport.stride){
    state.viewport.columns=geometry.columns;
    // Recompute on resize, otherwise retain the measured row height across DOM recycling.
    if(force||Math.abs(state.viewport.stride-geometry.stride)>12)state.viewport.stride=geometry.stride;
  }
  const origin=$('grid-origin').getBoundingClientRect().top+window.scrollY;
  const range=windowRows({total:state.display.length,columns:state.viewport.columns,rowStride:state.viewport.stride,
    scrollTop:window.scrollY,viewportHeight:window.innerHeight,originTop:origin,overscan:850});
  if(!force&&range.startRow===state.viewport.startRow&&range.endRow===state.viewport.endRow)return;
  state.viewport.startRow=range.startRow;state.viewport.endRow=range.endRow;
  $('grid-top').style.height=`${range.top}px`;
  $('grid-bottom').style.height=`${range.bottom}px`;
  const wanted=state.display.slice(range.start,range.end);
  const previous=new Map([...grid.querySelectorAll('.card-tile')].map(tile=>[tile.dataset.id,tile]));
  const created=[];
  const desired=wanted.map((card,i)=>{
    let tile=previous.get(card.id)||state.tileCache.get(card.id);
    if(state.tileCache.has(card.id))state.tileCache.delete(card.id);
    if(!tile){
      const holder=document.createElement('template');holder.innerHTML=cardMarkup(card,range.start+i);
      tile=holder.content.firstElementChild;created.push(tile);
      const image=tile.querySelector('img.card-art');
      image.addEventListener('load',()=>onImageLoad(image));
      image.addEventListener('error',()=>onImageError(image));
    }
    tile.setAttribute('aria-posinset',String(range.start+i+1));
    const price=tile.querySelector('[data-role=price]');if(price){const p=state.prices[card.id];const shown=displayedQuote(card.id);price.textContent=shown.text;price.title=p?.selectedVariant?`${shown.average?'Moyenne 30 jours':'Cote indicative'} TCGdex · ${p.quotes.find(q=>q.id===p.selectedVariant)?.label||''} · pas un prix de vente`:'';}
    const qty=state.collection[card.id]||0;tile.dataset.owned=String(qty>0);
    const owned=tile.querySelector('[data-role=owned]');if(qty){if(owned)owned.textContent=`×${qty}`;else tile.querySelector('.card-open').insertAdjacentHTML('beforeend',`<span class="owned-pill" data-role="owned">×${qty}</span>`);}else owned?.remove();
    tile.querySelector('[data-action=minus]').hidden=!qty;
    const label=tile.querySelector('.ghost-label');if(label)label.textContent=imageLabel(card.id);
    return tile;
  });
  // insertBefore moves retained elements in place, preserving their <img> load state.
  let cursor=grid.firstElementChild;
  for(const tile of desired){
    if(tile===cursor){cursor=cursor.nextElementSibling;continue;}
    grid.insertBefore(tile,cursor);
  }
  while(cursor){
    const next=cursor.nextElementSibling;imageObserver?.unobserve(cursor);cursor.remove();
    if(cursor.classList.contains('card-tile')){
      state.tileCache.delete(cursor.dataset.id);state.tileCache.set(cursor.dataset.id,cursor);
      while(state.tileCache.size>65)state.tileCache.delete(state.tileCache.keys().next().value);
    }
    cursor=next;
  }
  grid.setAttribute('aria-busy','false');
  for(const tile of desired){
    const img=tile.querySelector('img.card-art');
    if(img?.__loading&&img.complete){if(img.naturalWidth)onImageLoad(img);else onImageError(img);}
    if(!img?.classList.contains('is-loaded')&&!img?.__loading){if(imageObserver)imageObserver.observe(tile);else activateTile(tile);}
  }
  const first=grid.querySelector('.card-tile');
  if(first){
    const actual=first.getBoundingClientRect().height+(parseFloat(getComputedStyle(grid).rowGap)||12);
    if(Math.abs(actual-state.viewport.stride)>2){state.viewport.stride=actual;requestAnimationFrame(()=>renderViewport(true));}
  }
  $('grid-end-status').textContent=state.display.length?`Fin du catalogue · ${state.display.length.toLocaleString('fr-FR')} cartes`:' ';
}
function onScroll(){
  state.lastScroll=Date.now();
  if(state.scrollFrame)return;
  state.scrollFrame=requestAnimationFrame(()=>{state.scrollFrame=0;renderViewport();updateScrollTools();});
}
function updateScrollTools(){
  const enough=state.display.length>20&&!$('catalog').hidden;
  const atTop=window.scrollY<320;
  const atBottom=window.scrollY+window.innerHeight>document.documentElement.scrollHeight-280;
  $('scroll-tools').hidden=!enough;
  $('jump-top').disabled=atTop;
  $('jump-bottom').disabled=atBottom;
}
function scrollCatalog(){
  const top=window.scrollY+$('catalog').getBoundingClientRect().top-80;
  window.scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function jumpTop(){window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
function jumpBottom(){window.scrollTo({top:document.documentElement.scrollHeight-window.innerHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
function ghostMarkup(id){return `<div class="card-ghost" aria-hidden="true"><span class="ghost-label">${escapeHtml(imageLabel(id))}</span></div>`;}
function cardMarkup(c,index){
  const quantity=state.collection[c.id]||0;
  const p=displayedQuote(c.id);
  return `<article class="card-tile" aria-posinset="${index+1}" aria-setsize="${state.display.length}" data-id="${escapeHtml(c.id)}" data-owned="${quantity>0}"><button type="button" class="card-open" style="--card-delay:${(index%13)*-170}ms" data-action="open" data-id="${escapeHtml(c.id)}" aria-label="Voir ${escapeHtml(c.name)}, carte ${escapeHtml(c.localId)}">${ghostMarkup(c.id)}<img class="card-art" alt="Illustration de ${escapeHtml(c.name)}" loading="lazy" decoding="async" hidden><span class="price-pill" data-role="price">${p.text}</span>${quantity?`<span class="owned-pill" data-role="owned">×${quantity}</span>`:''}</button><div class="card-footer"><div class="card-ident"><strong title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</strong><small>№ ${escapeHtml(c.localId)}</small></div><div class="card-quantity"><button type="button" class="qty-btn minus" data-action="minus" data-id="${escapeHtml(c.id)}" aria-label="Retirer ${escapeHtml(c.name)}" ${quantity?'':'hidden'}>−</button><button type="button" class="qty-btn add" data-action="plus" data-id="${escapeHtml(c.id)}" aria-label="Ajouter ${escapeHtml(c.name)}">+</button></div></div></article>`;
}
function updateTilePrice(id){for(const tile of $('cards-grid').querySelectorAll('.card-tile'))if(tile.dataset.id===id){const el=tile.querySelector('[data-role=price]');if(el){const p=state.prices[id];const shown=displayedQuote(id);el.textContent=shown.text;el.title=p?.selectedVariant?`${shown.average?'Moyenne 30 jours':'Cote indicative'} TCGdex · ${p.quotes.find(q=>q.id===p.selectedVariant)?.label||''} · pas un prix de vente`:'';}}}
function updateTileQuantity(id){
  const quantity=state.collection[id]||0;
  for(const tile of $('cards-grid').querySelectorAll('.card-tile')){
    if(tile.dataset.id!==id)continue;
    tile.dataset.owned=String(quantity>0);
    const badge=tile.querySelector('[data-role=owned]');
    if(quantity){if(badge)badge.textContent=`×${quantity}`;else tile.querySelector('.card-open').insertAdjacentHTML('beforeend',`<span class="owned-pill" data-role="owned">×${quantity}</span>`);}else badge?.remove();
    tile.querySelector('[data-action=minus]').hidden=!quantity;
  }
}
function changeQuantity(id,delta){
  const old=state.collection[id]||0;
  const next=Math.max(0,Math.min(9999,old+delta));if(old===next)return;
  const candidate={...state.collection};if(next)candidate[id]=next;else delete candidate[id];
  if(!saveCollection(candidate))return;
  state.collection=candidate;updateSummary();updateTileQuantity(id);
  if(state.inspected===id)updateDialogQuantity(id);
  if(state.status!=='all'){refreshResults({keepScroll:true});if(needsScan())startAutomaticScan();}
  if(next&&!isFresh(id))requestDetail(id,true).catch(()=>{});
}

function trimDetails(){while(state.details.size>380)state.details.delete(state.details.keys().next().value);}
function requestDetail(id,priority=false){
  if(state.pendingDetails.has(id))return state.pendingDetails.get(id);
  if(state.details.has(id)&&isFresh(id))return Promise.resolve(state.details.get(id));
  const promise=enqueue(async()=>{
    const detail=await getJSON(`fr/cards/${encodeURIComponent(id)}`);
    state.details.set(id,detail);trimDetails();
    if(!isFresh(id))rememberPrice(id,detail);
    const card=state.cardIndex.get(id);
    if(card&&detail.rarity)card.rarity=detail.rarity;
    if(detail.image&&detail.image!==card?.image)addExtra(id,{source:'tcgdex-fr',base:detail.image});
    return detail;
  },priority);
  state.pendingDetails.set(id,promise);
  promise.finally(()=>state.pendingDetails.delete(id)).catch(()=>{});
  return promise;
}

// Image resolution: FR brief/detail -> EN exact ID -> independently verified secondary match.
function addExtra(id,entry){
  const extras=state.imageExtras.get(id)||[];
  if(!extras.some(e=>e.source===entry.source&&e.base===entry.base&&e.small===entry.small))extras.push(entry);
  state.imageExtras.set(id,extras);
}
function candidateUrls(entry,quality){
  if(entry?.source==='owned-library'&&imageLibrary.baseUrl&&typeof entry.url==='string'&&entry.url.startsWith(imageLibrary.baseUrl))return [{url:entry.url,entry}];
  if(entry?.source==='bundled'&&/^\.\/assets\/offline\/cards\/(?:[A-Za-z0-9_.-]+|exu-!|exu-%253F)\.(webp|png|jpg)$/.test(entry.url))return [{url:entry.url,entry}];
  const verified=trustedImageUrl(entry.url);
  if(entry.base){
    const normal=imageUrls(entry.base,quality);
    const urls=quality==='low'&&verified?.includes('/high.')?[...normal,verified]:[verified,...normal];
    return [...new Set(urls.filter(Boolean))].map(url=>({url,entry}));
  }
  const urls=quality==='high'?[entry.large,verified,entry.small]:[verified===entry.large?entry.small:verified,entry.small,entry.large];
  return [...new Set(urls.map(trustedImageUrl).filter(Boolean))].map(url=>({url,entry}));
}
function imageOptions(id,quality){
  if(offlinePack.sealed&&!offlinePack.images[id])return [];
  const card=state.cardIndex.get(id);
  const record=state.imageRecords.get(id);
  const harvested=state.harvestIndex.get(id);
  if(record?.verificationVersion===3&&record?.missingUntil>Date.now()&&!harvested)return [];
  const candidates=[];
  const owned=imageLibrary.images.get(id);
  if(owned)candidates.push(owned);
  if(record?.source&&record.source!=='missing'&&record.url!==owned?.url)candidates.push(record);
  if(harvested)candidates.push(harvested);
  if(card?.image)candidates.push({source:'tcgdex-fr',base:card.image});
  if(state.details.get(id)?.image)candidates.push({source:'tcgdex-fr',base:state.details.get(id).image});
  candidates.push(...(state.imageExtras.get(id)||[]));
  const seen=new Set();
  return candidates.flatMap(entry=>candidateUrls(entry,quality)).filter(c=>{if(seen.has(c.url))return false;seen.add(c.url);return true;});
}
function imageId(img){return img.id==='dialog-image'?state.inspected:img.closest('.card-tile')?.dataset.id;}
function imageQuality(img){return img.id==='dialog-image'?'high':'low';}
function nextImage(img,id){
  if(!img.isConnected||!id)return false;
  const failed=state.imageFailures.get(id)||new Set();
  const options=imageOptions(id,imageQuality(img));
  const candidate=options.find(item=>!failed.has(item.url)&&!img.__tried?.has(item.url));
  if(!candidate)return false;
  if(!img.__tried)img.__tried=new Set();
  img.__tried.add(candidate.url);img.__candidate=candidate;
  img.hidden=false;img.__loading=true;img.classList.remove('is-loaded');
  const status=imageState(id,state.imageRecords,state.imageTransient);
  if(status==='pending'||status==='error')markImageStatus(id,'checking');
  img.src=candidate.url;
  return true;
}
function applyImageToVisible(id){
  for(const tile of $('cards-grid').querySelectorAll('.card-tile'))if(tile.dataset.id===id){
    const img=tile.querySelector('img.card-art');
    if(img&&!img.classList.contains('is-loaded')&&!img.__resolving&&!img.__loading)nextImage(img,id);
  }
  if(state.inspected===id){const img=$('dialog-image');if(!img.classList.contains('is-loaded')&&!img.__resolving&&!img.__loading)nextImage(img,id);}
}
function persistImage(id,entry){
  const saved={...entry,checkedAt:Date.now()};
  state.imageRecords.set(id,saved);markImageStatus(id,saved.source==='missing'?'missing':'found');
  putCache(state.db,'images',[{id,...saved}]).then(ok=>{
    if(ok)return;
    const fallback=storage('pv_image_resolutions_v1',{});
    fallback[id]=saved;
    const latest=Object.entries(fallback).sort((a,b)=>(b[1].checkedAt||0)-(a[1].checkedAt||0)).slice(0,100);
    try{localStorage.setItem('pv_image_resolutions_v1',JSON.stringify(Object.fromEntries(latest)));}catch{}
  });
}
function forgetImage(id){
  state.imageRecords.delete(id);
  deleteCache(state.db,'images',id).catch(()=>{});
  const fallback=storage('pv_image_resolutions_v1',{});
  if(Object.hasOwn(fallback,id)){
    delete fallback[id];
    try{localStorage.setItem('pv_image_resolutions_v1',JSON.stringify(fallback));}catch{}
  }
  scheduleImageCoverage();
}
function onImageLoad(img){
  img.__loading=false;img.classList.add('is-loaded');img.hidden=false;
  const id=imageId(img),entry=img.__candidate?.entry;
  if(!id||!entry)return;
  const url=img.__candidate.url;
  if(state.imageRecords.get(id)?.url!==url)persistImage(id,{...entry,url});
  else markImageStatus(id,'found');
  if(state.inspected===id)updateImageSource(id);
}
function onImageError(img){
  const id=imageId(img);if(!id)return;
  const failed=state.imageFailures.get(id)||new Set();
  if(img.__candidate?.url)failed.add(img.__candidate.url);
  state.imageFailures.set(id,failed);
  img.__loading=false;img.classList.remove('is-loaded');img.hidden=true;
  if(state.imageRecords.get(id)?.url===img.__candidate?.url){addExtra(id,state.imageRecords.get(id));forgetImage(id);markImageStatus(id,'checking');}
  if(!nextImage(img,id))findFallbackForElement(img,id);
}
async function getEnglish(id){
  if(state.english.has(id))return state.english.get(id);
  if(state.pendingEnglish.has(id))return state.pendingEnglish.get(id);
  const promise=enqueue(()=>getJSON(`en/cards/${encodeURIComponent(id)}`),true).then(result=>{state.english.set(id,result);return result;}).catch(error=>{if(error.message==='TCGdex 404')state.english.set(id,null);else state.imageProviderErrors.add(id);return null;});
  state.pendingEnglish.set(id,promise);
  promise.finally(()=>state.pendingEnglish.delete(id)).catch(()=>{});
  return promise;
}
async function secondaryImage(id,english){
  if(state.altChecked.has(id)||state.altAttempted.has(id)||legacyBudget().used>=LEGACY_DAILY_LIMIT||!navigator.onLine)return false;
  const card=state.cardIndex.get(id);
  let set=english?.set;
  if(!set?.name){
    const setId=String(id).split('-')[0];
    if(!state.englishSets.has(setId))state.englishSets.set(setId,enqueue(()=>getJSON(`en/sets/${encodeURIComponent(setId)}`),true).catch(()=>null));
    set=await state.englishSets.get(setId);
  }
  if(!set?.name||!card?.localId)return false;
  state.altAttempted.add(id);
  // Serialize secondary calls: rapid scrolling must not cause a burst of requests.
  const run=state.altTail.catch(()=>{}).then(async()=>{
    if(legacyBudget().used>=LEGACY_DAILY_LIMIT)return false;
    const wait=Math.max(0,2300-(Date.now()-state.altLastCall));
    if(wait)await sleep(wait);
    if(!useLegacyBudget())return false;state.altLastCall=Date.now();state.altCalls++;
    const phrase=value=>String(value).replace(/["\\]/g,' ').trim();
    const query=`number:"${phrase(card.localId)}" set.name:"${phrase(set.name)}"`;
    const url=`${ALTERNATE_API}?q=${encodeURIComponent(query)}&pageSize=100&select=${encodeURIComponent('id,name,number,set,images')}`;
    const response=await fetch(url);
    if(!response.ok)throw new Error(`Source secondaire ${response.status}`);
    const result=await response.json();
    state.altChecked.add(id);
    const match=matchAlternativeCard({number:card.localId,englishName:english?.name,englishSet:set.name,printedTotal:set.cardCount?.official},result.data);
    if(match){addExtra(id,match);return true;}
    return false;
  });
  state.altTail=run.catch(()=>{});
  return run.catch(error=>{state.altAttempted.delete(id);state.imageProviderErrors.add(id);throw error;});
}
async function ensureFallback(id,{force=false}={}){
  if(offlinePack.sealed)return false;
  if(state.pendingFallback.has(id))return state.pendingFallback.get(id);
  if(!navigator.onLine)return false;
  const cached=state.imageRecords.get(id);
  if(!force&&cached?.verificationVersion===3&&cached?.missingUntil>Date.now())return false;
  const promise=(async()=>{
    const card=state.cardIndex.get(id);
    try{
      const detail=await requestDetail(id,true);
      if(detail.image&&detail.image!==card?.image){
        addExtra(id,{source:'tcgdex-fr',base:detail.image});
        const failed=state.imageFailures.get(id)||new Set();
        if(imageUrls(detail.image).some(url=>!failed.has(url)))return true;
      }
    }catch(error){if(error.message!=='TCGdex 404')state.imageProviderErrors.add(id);/* Continue with EN even if FR fails. */}
    if(!state.english.has(id)){
      const english=await getEnglish(id);
      if(english?.image){addExtra(id,{source:'tcgdex-en',base:english.image});if(imageOptions(id,'low').some(c=>!state.imageFailures.get(id)?.has(c.url)))return true;}
    }
    const english=state.english.get(id);
    if(english?.image&&!state.imageExtras.get(id)?.some(e=>e.source==='tcgdex-en')){
      addExtra(id,{source:'tcgdex-en',base:english.image});if(imageOptions(id,'low').some(c=>!state.imageFailures.get(id)?.has(c.url)))return true;
    }
    if(!state.altChecked.has(id)&&!state.altAttempted.has(id)){
      try{if(await secondaryImage(id,english)&&imageOptions(id,'low').some(c=>!state.imageFailures.get(id)?.has(c.url)))return true;}
      catch{return false;} // Network errors must never become permanent negative cache entries.
    }
    // Cache only a confirmed miss, never a quota, offline or network failure.
    if(state.altChecked.has(id)&&!state.imageProviderErrors.has(id)&&!(state.imageFailures.get(id)?.size))persistImage(id,{source:'missing',verificationVersion:3,missingUntil:Date.now()+24*60*60*1000});
    return false;
  })();
  state.pendingFallback.set(id,promise);
  promise.finally(()=>state.pendingFallback.delete(id)).catch(()=>{});
  return promise;
}
async function findFallbackForElement(img,id){
  if(img.__resolving)return;
  img.__resolving=true;if(imageState(id,state.imageRecords,state.imageTransient)!=='found')markImageStatus(id,'checking');
  try{
    const found=await ensureFallback(id);
    if(img.isConnected&&imageId(img)===id){
      if(found&&!nextImage(img,id))img.hidden=true;
      else if(!found){img.hidden=true;if(imageState(id,state.imageRecords,state.imageTransient)!=='missing')markImageStatus(id,'error');}
    }
    applyImageToVisible(id);
  }finally{img.__resolving=false;}
}
const imageObserver=('IntersectionObserver'in window)?new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){imageObserver.unobserve(entry.target);activateTile(entry.target);}
},{rootMargin:'300px 0px'}):null;
function activateTile(tile){
  const id=tile.dataset.id,img=tile.querySelector('img.card-art');
  if(!img||!state.cardIndex.has(id))return;
  if(!img.classList.contains('is-loaded')&&!img.__loading){
    if(!nextImage(img,id))findFallbackForElement(img,id);
  }
  // Only visible cards request details; price-mode scanning is a separate bounded operation.
  if((state.options.showPrices||['illustration','secret'].includes(state.type))&&!isFresh(id))requestDetail(id,true).catch(()=>{});
}
function updateImageSource(id){
  const source=state.imageRecords.get(id)?.source;
  const status=imageState(id,state.imageRecords,state.imageTransient);
  $('dialog-image-source').textContent=status==='checking'?'Illustration : recherche en cours…'
    :status==='error'?'Illustration : nouvel essai automatique prévu'
    :status==='pending'?'Illustration : pas encore vérifiée'
    :source==='bundled'?'Illustration : intégrée à l’application'
    :source==='pokemon-tcg-api'?'Illustration : Pokémon TCG API (source secondaire)'
    :source==='tcgdex-en'?'Illustration : TCGdex EN':source==='missing'?'Illustration non trouvée · recherche automatique ultérieure':'Illustration : TCGdex';
}

function updateDialogQuantity(id){const quantity=state.collection[id]||0;$('dialog-quantity').textContent=`${quantity} exemplaire${quantity>1?'s':''}`;$('dialog-minus').disabled=quantity===0;}
async function loadReviewedMarketLinks(){
  try{
    const response=await fetch('./inputs/cardmarket-links.json',{cache:'no-store'});if(!response.ok)return;
    const data=await response.json();if(data?.format!=='pokevault-cardmarket-links-v1'||!data.links||typeof data.links!=='object')return;
    for(const [id,url] of Object.entries(data.links)){const clean=safeCardmarketProductUrl(url);if(safeCardId(id)&&clean)state.marketLinks.set(id,clean);}
    if(state.inspected)updateDialogBuy(state.inspected,state.details.get(state.inspected));
  }catch{} // Optional mapping; a search link is always available.
}
function updateDialogBuy(id,detail=null){
  const card=state.cardIndex.get(id);if(!card)return;
  const set=state.allSets.find(s=>id.startsWith(`${s.id}-`));
  const name=detail?.set?.name||set?.name||'';
  const link=cardmarketPurchaseLink(card,detail,name,state.marketLinks.get(id));
  $('dialog-card-identity').textContent=`${card.name} · ${name||'Extension non précisée'} · n° ${card.localId}`;
  $('price-match-warning').textContent=link.direct?'Un lien produit est référencé, mais la cote statistique peut différer des annonces pour votre langue, état ou tirage.':'Correspondance produit non confirmée : TCGdex peut associer la cote à un autre tirage. Ne comparez pas directement ce montant aux annonces ouvertes par la recherche.';
  const a=$('dialog-buy');a.href=link.url;
  a.textContent=link.direct?'Voir la fiche produit référencée ↗':'Rechercher par nom sur Cardmarket ↗';
  $('dialog-buy-note').textContent=link.direct
    ?`Produit référencé pour ${card.name} · ${name} · n° ${card.localId}. Vérifiez la finition, la langue et l’état. Le prix des annonces peut différer de la cote.`
    :`Aucun produit exact confirmé pour ${card.name} · ${name} · n° ${card.localId}. Recherche large pour éviter les pages vides ; choisissez ensuite la bonne édition. La cote ci-dessus n’est PAS le prix de cette recherche.`;
  const exact=$('dialog-buy-exact');exact.href=targetedCardmarketSearch(card,name);exact.hidden=link.direct;
}
function updateDialogPrice(id){
  const p=state.prices[id];const selector=$('price-variant'),row=$('price-variant-row');
  selector.replaceChildren();row.hidden=!(p?.quotes?.length>1);
  if(p?.quotes?.length>1){
    for(const quote of p.quotes)selector.add(new Option(quote.label,quote.id));
    selector.value=p.selectedVariant||'';
  }
  const selected=p?.quotes?.find(q=>q.id===p.selectedVariant);
  $('price-variant-label').textContent=selected?`Finition : ${selected.label}`:p?.quotes?.length>1?'Plusieurs finitions : sélectionnez celle de votre carte.':'Finition non renseignée';
  const shown=displayedQuote(id);
  $('dialog-price').textContent=selected&&shown.text!=='Cote —'?shown.text:'Cote indisponible';
  $('dialog-avg').textContent=selected?formatEuro(p.avg30):'—';$('dialog-low').textContent=selected?formatEuro(p.low):'—';
  const numericDate=Number(p?.updated);const date=p?.updated?(Number.isFinite(numericDate)?new Date(numericDate<1e12?numericDate*1000:numericDate):new Date(p.updated)):null;
  const dateText=date&&!Number.isNaN(date.getTime())?`Données mises à jour le ${date.toLocaleDateString('fr-FR')}. `:'';
  $('dialog-price-date').textContent=`${dateText}${shown.average?'≈ : moyenne sur 30 jours (tendance indisponible). ':''}Source : TCGdex / statistiques Cardmarket. Prix indicatif par finition, ni offre actuelle ni prix garanti pour la langue ou l’état.`;
}
async function openDialog(id){
  const card=state.cardIndex.get(id);if(!card)return;
  state.inspected=id;$('dialog-title').textContent=card.name;
  $('dialog-subtitle').textContent=`${state.allSets.find(s=>s.id===id.split('-')[0])?.name||card.set?.name||'Carte Pokémon'} · № ${card.localId}`;
  $('dialog-rarity').textContent=card.rarity||'Carte de collection';updateDialogQuantity(id);updateDialogPrice(id);updateDialogBuy(id);updateImageSource(id);
  const img=$('dialog-image');img.__tried=new Set();img.__resolving=false;img.classList.remove('is-loaded');img.hidden=true;
  $('card-dialog').hidden=false;document.body.style.overflow='hidden';$('dialog-close').focus();
  if(!nextImage(img,id))findFallbackForElement(img,id);
  try{
    const detail=await requestDetail(id,true);if(state.inspected!==id)return;
    $('dialog-title').textContent=detail.name||card.name;
    $('dialog-subtitle').textContent=`${detail.set?.name||'Carte Pokémon'} · № ${detail.localId||card.localId}`;
    $('dialog-rarity').textContent=detail.rarity||'Carte de collection';updateDialogPrice(id);updateDialogBuy(id,detail);
  }catch{if(state.inspected===id)showToast('Fiche détaillée indisponible hors connexion.');}
}
function closeDialog(){state.inspected=null;$('card-dialog').hidden=true;document.body.style.overflow='';}
function setStatus(value){state.status=value;for(const btn of $('status-filters').querySelectorAll('button')){const active=btn.dataset.status===value;btn.classList.toggle('is-active',active);btn.setAttribute('aria-pressed',String(active));}filtersChanged();}
function setLayout(value){
  state.layout=value;$('cards-grid').dataset.layout=value;
  for(const btn of document.querySelectorAll('.layout-switch button[data-layout]')){const active=btn.dataset.layout===value;btn.classList.toggle('is-active',active);btn.setAttribute('aria-pressed',String(active));}
  state.viewport.stride=0;renderViewport(true);
}
function switchTab(tab){
  const cards=tab==='cards';$('catalog').hidden=!cards;$('guide').hidden=cards;
  for(const [id,active] of [['tab-cards',cards],['tab-guide',!cards]]){$(id).classList.toggle('is-active',active);$(id).setAttribute('aria-selected',String(active));}
  if(!cards)closeSidebar();else renderViewport(true);updateScrollTools();
}
function filtersChanged(){cancelScan();cancelImageScan();state.pendingResort=false;refreshResults();scrollCatalog();startAutomaticScan();startAutomaticImageScan();}
function applyOptions(){
  document.documentElement.classList.toggle('pv-motion-on',state.options.animateCards);
  document.documentElement.classList.toggle('pv-prices-off',!state.options.showPrices);
  $('option-animation').checked=state.options.animateCards;
  $('option-prices').checked=state.options.showPrices;
  for(const value of ['price-desc','price-asc'])$('sort-select').querySelector(`[value="${value}"]`).hidden=!state.options.showPrices;
  for(const value of ['over10','over50'])$('type-select').querySelector(`[value="${value}"]`).hidden=!state.options.showPrices;
  if(!state.options.showPrices){
    if(state.sort.startsWith('price')){state.sort='number';$('sort-select').value='number';}
    if(state.type.startsWith('over')){state.type='all';$('type-select').value='all';}
    stopScan();
  }
  updateSummary();updateCoverage();if(state.cards.length)refreshResults({keepScroll:true});
}
function setOption(name,value){
  state.options[name]=value;
  try{localStorage.setItem('pv_options_v1',JSON.stringify(state.options));}catch{}
  applyOptions();
}
function hideSuggestions(){
  state.suggestions=[];state.suggestionIndex=-1;$('search-suggestions').hidden=true;
  $('card-search').setAttribute('aria-expanded','false');$('card-search').removeAttribute('aria-activedescendant');
}
function markSuggestion(){
  const buttons=[...$('search-suggestions').querySelectorAll('[data-suggest-id]')];
  buttons.forEach((button,i)=>{button.classList.toggle('is-active',i===state.suggestionIndex);button.setAttribute('aria-selected',String(i===state.suggestionIndex));});
  if(state.suggestionIndex>=0)$('card-search').setAttribute('aria-activedescendant',buttons[state.suggestionIndex]?.id||'');
  else $('card-search').removeAttribute('aria-activedescendant');
}
function updateSuggestions(){
  const input=$('card-search'),query=input.value.trim(),list=$('search-suggestions');
  if(!query||!state.allCards.length){hideSuggestions();return;}
  state.suggestions=suggestCards(state.allCards,query,8);state.suggestionIndex=-1;
  if(!state.suggestions.length){list.hidden=false;list.innerHTML='<p class="suggestion-empty">Aucune carte correspondante.</p>';input.setAttribute('aria-expanded','true');return;}
  list.innerHTML=state.suggestions.map((c,i)=>{
    const set=state.allSets.find(s=>c.id.startsWith(`${s.id}-`));
    return `<button id="search-option-${i}" role="option" aria-selected="false" type="button" class="suggestion-item" data-suggest-id="${escapeHtml(c.id)}"><span class="suggestion-ball" aria-hidden="true">◉</span><span class="suggestion-main"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(set?.name||c.id.split('-')[0])} · № ${escapeHtml(c.localId)}</small></span><span class="suggestion-open" aria-hidden="true">↗</span></button>`;
  }).join('');
  list.hidden=false;input.setAttribute('aria-expanded','true');
}
function chooseSuggestion(id){
  if(!safeCardId(id)||!state.cardIndex.has(id))return;
  hideSuggestions();openDialog(id);
}
function bindTilt(){
  const grid=$('cards-grid');let active=null;
  grid.addEventListener('pointermove',event=>{
    if(!state.options.animateCards||event.pointerType==='touch')return;
    const tile=event.target.closest('.card-tile');if(!tile){active?.style.removeProperty('--tilt-x');active?.style.removeProperty('--tilt-y');active=null;return;}
    const button=tile.querySelector('.card-open');if(!button)return;
    if(active&&active!==button){active.style.removeProperty('--tilt-x');active.style.removeProperty('--tilt-y');}
    active=button;const rect=button.getBoundingClientRect();
    button.style.setProperty('--tilt-x',`${((event.clientY-rect.top)/rect.height-.5)*-7}deg`);
    button.style.setProperty('--tilt-y',`${((event.clientX-rect.left)/rect.width-.5)*9}deg`);
  },{passive:true});
  grid.addEventListener('pointerleave',()=>{active?.style.removeProperty('--tilt-x');active?.style.removeProperty('--tilt-y');active=null;});
}
function updateSearchClear(id){const input=$(id),button=$(`${id}-clear`);if(button)button.hidden=!input.value;}
function clearSearch(id){const input=$(id);input.value='';updateSearchClear(id);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
function resetFilters(){
  if($('clear-filters').dataset.action==='retry'){delete $('clear-filters').dataset.action;loadCatalog();return;}
  $('card-search').value='';updateSearchClear('card-search');$('sort-select').value='number';$('type-select').value='all';state.sort='number';state.type='all';setStatus('all');
}
function exportCollection(){
  const data={format:'pokevault-collection',version:1,exportedAt:new Date().toISOString(),collection:state.collection};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`pokevault-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  showToast('Sauvegarde JSON téléchargée.');
}
async function importCollection(file){
  if(!file)return;
  if(file.size>2*1024*1024){showToast('Fichier trop volumineux (2 Mo maximum).');return;}
  try{
    const data=JSON.parse(await file.text());
    if(data?.format!=='pokevault-collection'||data.version!==1||!data.collection||typeof data.collection!=='object'||Array.isArray(data.collection))throw Error('Format de sauvegarde non reconnu');
    const incoming=readCollection(data.collection);
    if(!Object.keys(incoming).length&&Object.keys(data.collection).length)throw Error('Aucune carte valide dans cette sauvegarde');
    const merged=mergeCollections(state.collection,incoming);
    if(!saveCollection(merged))return;
    state.collection=merged;updateSummary();refreshResults();
    showToast('Sauvegarde fusionnée : aucune carte existante supprimée.');
  }catch(error){showToast(error.message||'Impossible de lire cette sauvegarde.');}
  finally{$('import-file').value='';}
}
function exportImageIndex(){
  const images={};
  for(const [id,record] of state.imageRecords){
    if(record?.source&&record.source!=='missing'&&record.url&&record.source!=='bundled')images[id]={url:record.url,source:record.source,checkedAt:record.checkedAt};
  }
  const data={format:'pokevault-image-index-v1',exportedAt:new Date().toISOString(),images};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='pokevault-index-visuels.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  showToast(`${Object.keys(images).length} visuels vérifiés exportés (index, pas les images).`);
}
function installPWA(){if(state.installEvent){state.installEvent.prompt();state.installEvent.userChoice.finally(()=>{state.installEvent=null;$('install-btn').hidden=true;});}else showToast('Sur iPhone/iPad : Partager → Sur l’écran d’accueil.');}
function registerSW(){if('serviceWorker'in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))navigator.serviceWorker.register('./sw.js').catch(()=>{});}

function bindEvents(){
  $('sidebar-open').addEventListener('click',openSidebar);$('sidebar-close').addEventListener('click',closeSidebar);$('sidebar-scrim').addEventListener('click',closeSidebar);
  $('set-search').addEventListener('input',()=>{updateSearchClear('set-search');renderSets();});$('set-search-clear').addEventListener('click',()=>clearSearch('set-search'));
  $('sets-list').addEventListener('click',event=>{const btn=event.target.closest('[data-set]');if(btn)selectSet(btn.dataset.set);});
  $('all-sets').addEventListener('click',()=>selectSet('all'));
  $('card-search').addEventListener('input',()=>{updateSearchClear('card-search');updateSuggestions();refreshResults();scrollCatalog();});
  $('card-search-clear').addEventListener('click',()=>{clearSearch('card-search');hideSuggestions();});
  $('card-search').addEventListener('keydown',event=>{
    if($('search-suggestions').hidden)return;
    if(state.suggestions.length&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();state.suggestionIndex=(state.suggestionIndex+(event.key==='ArrowDown'?1:-1)+state.suggestions.length)%state.suggestions.length;markSuggestion();}
    else if(event.key==='Enter'&&state.suggestions.length){event.preventDefault();chooseSuggestion(state.suggestions[state.suggestionIndex>=0?state.suggestionIndex:0].id);}
    else if(event.key==='Escape'){event.stopPropagation();hideSuggestions();}
  });
  $('search-suggestions').addEventListener('pointerdown',event=>{const b=event.target.closest('[data-suggest-id]');if(b){event.preventDefault();chooseSuggestion(b.dataset.suggestId);}});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.search-wrap'))hideSuggestions();if(!event.target.closest('.options-wrap')){$('options-panel').hidden=true;$('options-toggle').setAttribute('aria-expanded','false');}});
  $('options-toggle').addEventListener('click',()=>{const panel=$('options-panel');panel.hidden=!panel.hidden;$('options-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
  $('option-animation').addEventListener('change',event=>setOption('animateCards',event.target.checked));
  $('option-prices').addEventListener('change',event=>setOption('showPrices',event.target.checked));
  $('price-variant').addEventListener('change',event=>{
    const id=state.inspected,p=state.prices[id];if(!id||!p)return;
    state.prices[id]=selectPriceVariant(p,event.target.value);state.dirtyPrices.add(id);flushPricesSoon();updateDialogPrice(id);updateTilePrice(id);updateSummary();
    if(state.sort.startsWith('price')||state.type.startsWith('over'))refreshResults({keepScroll:true});
  });
  bindTilt();
  $('sort-select').addEventListener('change',event=>{state.sort=event.target.value;filtersChanged();});
  $('type-select').addEventListener('change',event=>{state.type=event.target.value;filtersChanged();});
  $('status-filters').addEventListener('click',event=>{const btn=event.target.closest('[data-status]');if(btn)setStatus(btn.dataset.status);});
  document.querySelector('.layout-switch').addEventListener('click',event=>{const btn=event.target.closest('button[data-layout]');if(btn)setLayout(btn.dataset.layout);});
  $('scan-next').addEventListener('click',()=>scanPrices(150));$('scan-all').addEventListener('click',scanAll);$('scan-stop').addEventListener('click',stopScan);
  $('apply-prices').addEventListener('click',()=>{state.pendingResort=false;refreshResults({keepScroll:true});});
  $('image-next').addEventListener('click',()=>scanImages(100));$('image-all').addEventListener('click',scanAllImages);$('image-stop').addEventListener('click',stopImageScan);
  $('clear-filters').addEventListener('click',resetFilters);
  $('cards-grid').addEventListener('click',event=>{const btn=event.target.closest('[data-action]');if(!btn)return;const id=btn.dataset.id;if(btn.dataset.action==='open')openDialog(id);else changeQuantity(id,btn.dataset.action==='plus'?1:-1);});
  $('tab-cards').addEventListener('click',()=>switchTab('cards'));$('tab-guide').addEventListener('click',()=>switchTab('guide'));
  $('dialog-close').addEventListener('click',closeDialog);
  $('card-dialog').addEventListener('click',event=>{if(event.target.id==='card-dialog')closeDialog();});
  $('dialog-image').addEventListener('load',event=>onImageLoad(event.target));
  $('dialog-image').addEventListener('error',event=>onImageError(event.target));
  $('dialog-plus').addEventListener('click',()=>{if(state.inspected)changeQuantity(state.inspected,1);});
  $('dialog-minus').addEventListener('click',()=>{if(state.inspected)changeQuantity(state.inspected,-1);});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(!$('card-dialog').hidden)closeDialog();closeSidebar();$('options-panel').hidden=true;$('options-toggle').setAttribute('aria-expanded','false');hideSuggestions();}
    if(event.key==='Tab'&&!$('card-dialog').hidden){const buttons=[...$('card-dialog').querySelectorAll('button:not([disabled])')];const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  $('export-btn').addEventListener('click',exportCollection);$('export-images').addEventListener('click',exportImageIndex);$('import-btn').addEventListener('click',()=>$('import-file').click());$('import-file').addEventListener('change',event=>importCollection(event.target.files[0]));
  $('install-btn').addEventListener('click',installPWA);
  $('jump-top').addEventListener('click',jumpTop);$('jump-bottom').addEventListener('click',jumpBottom);
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',()=>{state.viewport.stride=0;requestAnimationFrame(()=>renderViewport(true));},{passive:true});
  window.addEventListener('online',()=>{networkStatus();loadImageLibrary();loadHarvestIndex();startAutomaticImageScan();});window.addEventListener('offline',()=>{networkStatus();stopScan();cancelImageScan();});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installEvent=event;$('install-btn').hidden=false;});
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!navigator.standalone)$('install-btn').hidden=false;
}
bindEvents();applyOptions();networkStatus();updateSummary();registerSW();
setInterval(()=>{if(navigator.onLine){loadImageLibrary();loadHarvestIndex();}},6*60*60*1000);
window.__pvBooted=true;
loadOfflinePack().then(()=>Promise.allSettled([hydrateCache(),loadCatalog(),loadReviewedMarketLinks(),loadHarvestIndex(),loadImageLibrary()])).then(results=>{
  if(results.some(result=>result.status==='rejected')){
    const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason?.message||'Erreur inconnue');
    console.error('PokéVault initialisation',...errors);
    $('counter').textContent='Le chargement a rencontré une erreur. Réessayez.';
    $('empty-state').hidden=false;
    $('empty-state').querySelector('h2').textContent='Chargement interrompu';
    $('empty-state').querySelector('p').textContent='Vos cartes enregistrées sont conservées. Rechargez la page ou cliquez sur Réessayer.';
    $('clear-filters').textContent='Réessayer';$('clear-filters').dataset.action='retry';
    $('cards-grid').replaceChildren();$('cards-grid').setAttribute('aria-busy','false');
  }else{
    startAutomaticScan();startAutomaticImageScan();updateImageCoverage();
  }
});

})();
