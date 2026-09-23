import {
  normalize, escapeHtml, numeric, parsePrice, formatEuro, readCollection, mergeCollections,
  imageUrls, trustedImageUrl, matchAlternativeCard, cardMatchesType, sortCards, priceCoverage, PRICE_TTL
} from './core.mjs';
import {openCache,loadCache,putCache,deleteCache} from './db.mjs';
import {windowRows} from './virtual-grid.mjs';
import {imageState,imageCoverage} from './image-state.mjs';

const API='https://api.tcgdex.net/v2';
// Transitional, unauthenticated fallback only. The legacy provider retires March 2027.
const ALTERNATE_API='https://api.pokemontcg.io/v2/cards';
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state={
  allSets:[],allCards:[],cards:[],cardIndex:new Map(),selectedSet:'all',status:'all',type:'all',sort:'number',
  layout:'comfortable',collection:{},prices:{},db:null,dirtyPrices:new Set(),details:new Map(),pendingDetails:new Map(),
  imageRecords:new Map(),imageExtras:new Map(),imageFailures:new Map(),pendingFallback:new Map(),english:new Map(),
  tileCache:new Map(),imageProviderErrors:new Set(),imageTransient:new Map(),imageScanToken:0,imageScanning:false,imagePaused:false,imageScanScope:[],imageScanLimit:0,
  pendingEnglish:new Map(),imageCoverageTimer:0,imageAutoTimer:0,
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
for(const [id,p] of Object.entries(storage('pv_prices',{}))){
  const trend=numeric(p?.trend);
  if(trend!==null)state.prices[id]={trend,avg30:numeric(p.avg30),low:numeric(p.low),fetchedAt:0,updated:null};
}
for(const [id,p] of Object.entries(storage('pv_prices_v2',{}))){
  if(p&&typeof p==='object')state.prices[id]={trend:numeric(p.trend),avg30:numeric(p.avg30),low:numeric(p.low),fetchedAt:Number(p.fetchedAt)||0,updated:p.updated||null};
}

function showToast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.hidden=true,3600);}
function enqueue(task,priority=false){return new Promise((resolve,reject)=>{const job={task,resolve,reject};if(priority)state.queue.unshift(job);else state.queue.push(job);pumpQueue();});}
function pumpQueue(){while(state.running<3&&state.queue.length){const job=state.queue.shift();state.running++;Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{state.running--;pumpQueue();});}}
async function getJSON(path){const response=await fetch(`${API}/${path}`);if(!response.ok)throw new Error(`TCGdex ${response.status}`);return response.json();}
function isFresh(id){const time=state.prices[id]?.fetchedAt;return Boolean(time&&Date.now()-time<PRICE_TTL);}
function trend(id){const value=state.prices[id]?.trend;return Number.isFinite(value)?value:null;}
function networkStatus(){const offline=!navigator.onLine;$('network-indicator').hidden=!offline;if(offline)$('network-indicator').textContent='Hors connexion · cache local';}

async function hydrateCache(){
  state.db=await openCache();
  const [prices,images]=await Promise.all([loadCache(state.db,'prices'),loadCache(state.db,'images')]);
  for(const {id,...entry} of prices){if((entry.fetchedAt||0)>(state.prices[id]?.fetchedAt||0))state.prices[id]=entry;}
  for(const {id,...entry} of images)if((entry.checkedAt||0)>(state.imageRecords.get(id)?.checkedAt||0))state.imageRecords.set(id,entry);
  // Browsers in private mode can deny IndexedDB. Preserve a small localStorage fallback.
  if(!state.db)for(const [id,entry] of Object.entries(storage('pv_image_resolutions_v1',{})))state.imageRecords.set(id,entry);
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
  state.prices[id]=parsed||{trend:null,avg30:null,low:null,updated:null,fetchedAt:Date.now()};
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
  $('portfolio-value').title=`${valued} référence(s) cotée(s) sur ${unique}. Estimation indicative.`;
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
function indexCards(cards){for(const card of cards)state.cardIndex.set(card.id,card);}
function cancelScan(){state.scanToken++;state.scanning=false;state.scanAll=false;}
async function loadCatalog(){
  const seq=++state.requestId;
  cancelScan();cancelImageScan();$('counter').textContent='Chargement du catalogue…';$('cards-grid').setAttribute('aria-busy','true');
  const [sets,cards]=await Promise.allSettled([getJSON('fr/sets'),getJSON('fr/cards')]);
  if(seq!==state.requestId)return;
  if(sets.status==='fulfilled'){
    state.allSets=sets.value.sort((a,b)=>String(b.releaseDate||'').localeCompare(String(a.releaseDate||'')));
    renderSets();
  }else $('sets-list').innerHTML='<p class="hint">Extensions indisponibles. Réessayez en ligne.</p>';
  if(cards.status==='fulfilled'){
    state.allCards=cards.value;state.cards=cards.value;indexCards(cards.value);
    $('all-sets-count').textContent=cards.value.length.toLocaleString('fr-FR');
    $('empty-state').querySelector('h2').textContent='Aucune carte trouvée';
    $('empty-state').querySelector('p').textContent='Modifiez votre recherche ou vos filtres.';
    $('clear-filters').textContent='Réinitialiser les filtres';delete $('clear-filters').dataset.action;
    refreshResults();startAutomaticImageScan();
    // Owned cards get priority for portfolio accuracy without touching the collection itself.
    for(const id of Object.keys(state.collection).slice(0,60))if(!isFresh(id))requestDetail(id).catch(()=>{});
  }else{
    state.cards=[];refreshResults();$('counter').textContent='Catalogue indisponible hors connexion.';
    $('empty-state').querySelector('h2').textContent='Catalogue indisponible';
    $('empty-state').querySelector('p').textContent='Ouvrez le catalogue une première fois en ligne.';
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
    if(query&&!normalize(`${c.name} ${c.localId} ${c.id}`).includes(query))return false;
    const quantity=state.collection[c.id]||0;
    if(state.status==='owned'&&!quantity)return false;
    if(state.status==='missing'&&quantity)return false;
    if(state.type==='over10'||state.type==='over50')return true;
    return cardMatchesType(c,state.type,trend(c.id));
  });
}
function needsScan(){return state.sort.startsWith('price')||['over10','over50','illustration','secret'].includes(state.type);}
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
  const active=needsScan();$('price-coverage').hidden=!active;
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
function currentImageScope(){return state.scope;}
function scheduleImageCoverage(){
  if(state.imageCoverageTimer)return;
  state.imageCoverageTimer=setTimeout(()=>{state.imageCoverageTimer=0;updateImageCoverage();},350);
}
function updateImageCoverage(){
  const stats=imageCoverage(currentImageScope(),state.imageRecords,state.imageTransient);
  $('image-progress').textContent=`${stats.checked.toLocaleString('fr-FR')} / ${stats.total.toLocaleString('fr-FR')} vérifiés · ${stats.found.toLocaleString('fr-FR')} trouvés · ${stats.missing.toLocaleString('fr-FR')} introuvables`;
  $('image-progress-bar').max=Math.max(1,stats.total);
  $('image-progress-bar').value=stats.checked;
  const remaining=stats.pending+stats.error+stats.checking;
  const suffix=stats.error?` · ${stats.error.toLocaleString('fr-FR')} à réessayer`:'';
  const quota=state.altCalls>=60?' · Limite de la source secondaire atteinte pour cette session.':'';
  $('image-warning').textContent=state.imageScanning
    ?`Recherche en arrière-plan · ${stats.checking} en cours · ${stats.pending} en attente${suffix}${quota}. Vous pouvez continuer à défiler.`
    :state.imagePaused?`Recherche en pause · ${remaining} à vérifier${suffix}${quota}. Les images déjà trouvées restent en cache.`
    :remaining?`${stats.pending} non encore recherchés${suffix}${quota}. « Introuvable » signifie que les sources ont été vérifiées.`
    :'Périmètre vérifié. Les échecs confirmés seront retentés après 24 h.';
  $('image-next').hidden=remaining===0;
  $('image-next').disabled=state.imageScanning||!navigator.onLine;
  $('image-next').textContent=`Vérifier ${Math.min(100,remaining)} visuels`;
  $('image-all').hidden=remaining<=100;
  $('image-all').disabled=state.imageScanning||!navigator.onLine;
  $('image-stop').hidden=!state.imageScanning;
  $('image-status').textContent=state.imageScanning?'Analyse active':state.imagePaused?'En pause':remaining?'Prête à analyser':'À jour';
}
function markImageStatus(id,status){
  if(status==='found'||status==='missing')state.imageTransient.delete(id);
  else state.imageTransient.set(id,status);
  for(const tile of $('cards-grid').querySelectorAll('.card-tile'))if(tile.dataset.id===id){
    const label=tile.querySelector('.ghost-label');if(label)label.textContent=imageLabel(id);
  }
  if(state.inspected===id){$('dialog-image-holder').querySelector('.ghost-label').textContent=imageLabel(id);updateImageSource(id);}
  scheduleImageCoverage();
}
function imageLabel(id){
  const status=imageState(id,state.imageRecords,state.imageTransient);
  return status==='checking'?'Recherche en cours…':status==='missing'?'Aucun visuel trouvé':status==='error'?'Recherche à reprendre':status==='found'?'':'Recherche non commencée';
}
function cancelImageScan(){state.imageScanToken++;state.imageScanning=false;clearTimeout(state.imageAutoTimer);scheduleImageCoverage();}
function stopImageScan(){state.imagePaused=true;cancelImageScan();}
function imageCandidates(){
  const cards=currentImageScope();
  const owned=[],visible=[],rest=[];
  const displayed=new Set([...$('cards-grid').querySelectorAll('.card-tile')].map(tile=>tile.dataset.id));
  for(const card of cards){
    const status=imageState(card.id,state.imageRecords,state.imageTransient);
    if(status==='found'||status==='missing'||status==='checking')continue;
    if(state.collection[card.id])owned.push(card);
    else if(displayed.has(card.id))visible.push(card);
    else rest.push(card);
  }
  return [...owned,...visible,...rest];
}
function startAutomaticImageScan(){
  if(state.imagePaused||state.imageScanning||!state.cards.length||!navigator.onLine)return;
  clearTimeout(state.imageAutoTimer);
  state.imageAutoTimer=setTimeout(()=>{
    if(state.imagePaused||state.imageScanning)return;
    const remaining=imageCandidates().length;
    if(remaining)scanImages(Math.min(remaining,state.selectedSet==='all'?100:300));
  },650);
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
  if(imageState(id,state.imageRecords,state.imageTransient)==='found'||imageState(id,state.imageRecords,state.imageTransient)==='missing')return;
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
  state.imagePaused=false;const token=++state.imageScanToken;
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
  }finally{if(token===state.imageScanToken){state.imageScanning=false;updateImageCoverage();}}
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
    const price=tile.querySelector('[data-role=price]');if(price)price.textContent=trend(card.id)===null?'Cote —':formatEuro(trend(card.id));
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
  const p=trend(c.id);
  return `<article class="card-tile" aria-posinset="${index+1}" aria-setsize="${state.display.length}" data-id="${escapeHtml(c.id)}" data-owned="${quantity>0}"><button type="button" class="card-open" data-action="open" data-id="${escapeHtml(c.id)}" aria-label="Voir ${escapeHtml(c.name)}, carte ${escapeHtml(c.localId)}">${ghostMarkup(c.id)}<img class="card-art" alt="Illustration de ${escapeHtml(c.name)}" loading="lazy" decoding="async" hidden><span class="price-pill" data-role="price">${p!==null?formatEuro(p):'Cote —'}</span>${quantity?`<span class="owned-pill" data-role="owned">×${quantity}</span>`:''}</button><div class="card-footer"><div class="card-ident"><strong title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</strong><small>№ ${escapeHtml(c.localId)}</small></div><div class="card-quantity"><button type="button" class="qty-btn minus" data-action="minus" data-id="${escapeHtml(c.id)}" aria-label="Retirer ${escapeHtml(c.name)}" ${quantity?'':'hidden'}>−</button><button type="button" class="qty-btn add" data-action="plus" data-id="${escapeHtml(c.id)}" aria-label="Ajouter ${escapeHtml(c.name)}">+</button></div></div></article>`;
}
function updateTilePrice(id){for(const tile of $('cards-grid').querySelectorAll('.card-tile'))if(tile.dataset.id===id){const el=tile.querySelector('[data-role=price]');if(el)el.textContent=trend(id)===null?'Cote —':formatEuro(trend(id));}}
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
  const card=state.cardIndex.get(id);
  const record=state.imageRecords.get(id);
  if(record?.verificationVersion===3&&record?.missingUntil>Date.now())return [];
  const candidates=[];
  if(record?.source&&record.source!=='missing')candidates.push(record);
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
  if(state.altChecked.has(id)||state.altAttempted.has(id)||state.altCalls>=60||!navigator.onLine)return false;
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
    if(state.altCalls>=60)return false;
    const wait=Math.max(0,420-(Date.now()-state.altLastCall));
    if(wait)await sleep(wait);
    state.altLastCall=Date.now();state.altCalls++;
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
  if(!isFresh(id))requestDetail(id,true).catch(()=>{});
}
async function retryImage(){
  const id=state.inspected;if(!id)return;
  state.imageFailures.delete(id);state.imageProviderErrors.delete(id);state.altChecked.delete(id);state.altAttempted.delete(id);state.english.delete(id);state.imageExtras.delete(id);
  forgetImage(id);state.imageTransient.delete(id);scheduleImageCoverage();$('dialog-image').__tried=new Set();$('dialog-image').classList.remove('is-loaded');
  $('dialog-image').hidden=true;showToast('Nouvelle recherche de l’illustration…');
  if(!nextImage($('dialog-image'),id))await ensureFallback(id,{force:true});
  applyImageToVisible(id);
}
function updateImageSource(id){
  const source=state.imageRecords.get(id)?.source;
  const status=imageState(id,state.imageRecords,state.imageTransient);
  $('dialog-image-source').textContent=status==='checking'?'Illustration : recherche en cours…'
    :status==='error'?'Illustration : recherche incomplète, réessayer'
    :status==='pending'?'Illustration : pas encore vérifiée'
    :source==='pokemon-tcg-api'?'Illustration : Pokémon TCG API (source secondaire)'
    :source==='tcgdex-en'?'Illustration : TCGdex EN':source==='missing'?'Illustration introuvable · verso provisoire':'Illustration : TCGdex';
}

function updateDialogQuantity(id){const quantity=state.collection[id]||0;$('dialog-quantity').textContent=`${quantity} exemplaire${quantity>1?'s':''}`;$('dialog-minus').disabled=quantity===0;}
function updateDialogPrice(id){
  const p=state.prices[id];$('dialog-price').textContent=Number.isFinite(p?.trend)?formatEuro(p.trend):'Non cotée';
  $('dialog-avg').textContent=formatEuro(p?.avg30);$('dialog-low').textContent=formatEuro(p?.low);
  $('dialog-price-date').textContent=p?.updated?`Source mise à jour : ${new Date(p.updated).toLocaleDateString('fr-FR')}`:'Estimation indicative, selon les données disponibles.';
}
async function openDialog(id){
  const card=state.cardIndex.get(id);if(!card)return;
  state.inspected=id;$('dialog-title').textContent=card.name;
  $('dialog-subtitle').textContent=`${state.allSets.find(s=>s.id===id.split('-')[0])?.name||card.set?.name||'Carte Pokémon'} · № ${card.localId}`;
  $('dialog-rarity').textContent=card.rarity||'Carte de collection';updateDialogQuantity(id);updateDialogPrice(id);updateImageSource(id);
  const img=$('dialog-image');img.__tried=new Set();img.__resolving=false;img.classList.remove('is-loaded');img.hidden=true;
  $('card-dialog').hidden=false;document.body.style.overflow='hidden';$('dialog-close').focus();
  if(!nextImage(img,id))findFallbackForElement(img,id);
  try{
    const detail=await requestDetail(id,true);if(state.inspected!==id)return;
    $('dialog-title').textContent=detail.name||card.name;
    $('dialog-subtitle').textContent=`${detail.set?.name||'Carte Pokémon'} · № ${detail.localId||card.localId}`;
    $('dialog-rarity').textContent=detail.rarity||'Carte de collection';updateDialogPrice(id);
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
function resetFilters(){
  if($('clear-filters').dataset.action==='retry'){delete $('clear-filters').dataset.action;loadCatalog();return;}
  $('card-search').value='';$('sort-select').value='number';$('type-select').value='all';state.sort='number';state.type='all';setStatus('all');
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
function installPWA(){if(state.installEvent){state.installEvent.prompt();state.installEvent.userChoice.finally(()=>{state.installEvent=null;$('install-btn').hidden=true;});}else showToast('Sur iPhone/iPad : Partager → Sur l’écran d’accueil.');}
function registerSW(){if('serviceWorker'in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))navigator.serviceWorker.register('./sw.js').catch(()=>{});}

function bindEvents(){
  $('sidebar-open').addEventListener('click',openSidebar);$('sidebar-close').addEventListener('click',closeSidebar);$('sidebar-scrim').addEventListener('click',closeSidebar);
  $('set-search').addEventListener('input',renderSets);
  $('sets-list').addEventListener('click',event=>{const btn=event.target.closest('[data-set]');if(btn)selectSet(btn.dataset.set);});
  $('all-sets').addEventListener('click',()=>selectSet('all'));
  let searchTimer;$('card-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(filtersChanged,150);});
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
  $('retry-image').addEventListener('click',retryImage);
  $('dialog-plus').addEventListener('click',()=>{if(state.inspected)changeQuantity(state.inspected,1);});
  $('dialog-minus').addEventListener('click',()=>{if(state.inspected)changeQuantity(state.inspected,-1);});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(!$('card-dialog').hidden)closeDialog();closeSidebar();}
    if(event.key==='Tab'&&!$('card-dialog').hidden){const buttons=[...$('card-dialog').querySelectorAll('button:not([disabled])')];const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  $('export-btn').addEventListener('click',exportCollection);$('import-btn').addEventListener('click',()=>$('import-file').click());$('import-file').addEventListener('change',event=>importCollection(event.target.files[0]));
  $('install-btn').addEventListener('click',installPWA);
  $('jump-top').addEventListener('click',jumpTop);$('jump-bottom').addEventListener('click',jumpBottom);
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',()=>{state.viewport.stride=0;requestAnimationFrame(()=>renderViewport(true));},{passive:true});
  window.addEventListener('online',()=>{networkStatus();startAutomaticImageScan();});window.addEventListener('offline',()=>{networkStatus();stopScan();cancelImageScan();});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installEvent=event;$('install-btn').hidden=false;});
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!navigator.standalone)$('install-btn').hidden=false;
}
bindEvents();networkStatus();updateSummary();registerSW();
Promise.allSettled([hydrateCache(),loadCatalog()]).then(()=>{startAutomaticScan();startAutomaticImageScan();updateImageCoverage();});
