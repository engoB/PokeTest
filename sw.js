/* Versioned PWA shell; API and visited images remain available offline after first load. */
const VERSION='pv-v4.6';
const SHELL=`${VERSION}-shell`,DATA=`${VERSION}-data`,IMAGES=`${VERSION}-images`,PACK=`${VERSION}-offline-pack`;
const APP_FILES=['./','./index.html','./app.bundle.js?v=4.6.0','./app.js','./core.mjs','./db.mjs','./virtual-grid.mjs','./image-state.mjs','./style.css','./inputs/cardmarket-links.json','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/card-back.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const shell=await caches.open(SHELL);
  await shell.addAll(APP_FILES);
  // Optional pack metadata. Only a bounded set of images can be precached in a browser;
  // native packages include every file directly, without browser storage quotas.
  try{
    const meta=['./assets/offline/images.json','./assets/offline/catalog-fr.json','./assets/offline/sets-fr.json','./assets/offline/sets-detailed.json','./assets/offline/details-manifest.json','./assets/offline/verified-index.json'];
    const responses=await Promise.all(meta.map(url=>fetch(url).then(r=>r.ok?{url,r}:null).catch(()=>null)));
    const pack=await caches.open(PACK);
    await Promise.all(responses.filter(Boolean).map(({url,r})=>pack.put(url,r)));
    const details=await fetch('./assets/offline/details-manifest.json').then(r=>r.ok?r.json():null).catch(()=>null);
    if(details?.detailsComplete&&Array.isArray(details.files)){
      // On mobile, quota restrictions may prevent a complete browser cache.
      // A native package still contains all files under dist/ itself.
      for(const file of details.files){
        if(typeof file!=='string'||!/^\.\/assets\/offline\/details\/\d{2}\.json$/.test(file))continue;
        try{await pack.add(file);}catch(error){console.warn('Full detail precache interrupted',error);break;}
      }
    }
    const precache=await fetch('./assets/offline/precache.json').then(r=>r.ok?r.json():[]).catch(()=>[]);
    if(Array.isArray(precache))for(const url of precache.slice(0,2000)){
      if(typeof url!=='string'||!/^\.\/assets\/offline\/cards\/(?:[\w.-]+|exu-!|exu-%253F)\.(webp|png|jpg)$/.test(url))continue;
      try{await pack.add(url);}catch{break;} // Stop on browser storage quota; do not block installation.
    }
  }catch{}
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Upgrade WITHOUT erasing images already downloaded by older PWA versions.
  const target=await caches.open(IMAGES);
  for(const key of await caches.keys())if(key.startsWith('pv-')&&!key.startsWith(VERSION)){
    if(/-images$/.test(key)){
      let copied=true;
      try{const source=await caches.open(key);for(const request of await source.keys()){
        if(await target.match(request))continue;const response=await source.match(request);if(response)await target.put(request,response);
      }}catch(error){copied=false;console.warn('Image cache migration postponed',error);}
      if(copied)await caches.delete(key); // Retain original if quota blocks the migration.
    }else if(/-offline-pack$/.test(key)){
      // Keep the old local pack cache until the new one is installed; older packs may
      // contain thousands of card files, and a forced deletion would lose them offline.
      continue;
    }else await caches.delete(key);
  }
  await self.clients.claim();
})()));
async function limitCache(name,max){
  const cache=await caches.open(name),keys=await cache.keys();
  if(keys.length<=max)return;
  // Never evict the first-visit catalogs while background price scans fill the cache.
  const removable=keys.filter(req=>!(name===DATA&&/^\/v2\/fr\/(?:cards|sets)\/?$/.test(new URL(req.url).pathname))&&!(name===PACK&&/\/assets\/offline\/(?:images|catalog-fr|sets-fr)\.json$/.test(new URL(req.url).pathname)));
  await Promise.all(removable.slice(0,Math.max(0,keys.length-max)).map(key=>cache.delete(key)));
}
async function cacheFirst(req,name,max){
  const cache=await caches.open(name),hit=await cache.match(req);
  if(hit)return hit;
  const response=await fetch(req);
  if(response.ok||response.type==='opaque'){await cache.put(req,response.clone());limitCache(name,max).catch(()=>{});}
  return response;
}
async function networkFirst(req,name){
  const cache=await caches.open(name),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4800);
  try{
    const response=await fetch(req,{signal:controller.signal});
    if(response.ok){await cache.put(req,response.clone());limitCache(name,120).catch(()=>{});}
    return response;
  }catch(error){const hit=await cache.match(req);if(hit)return hit;throw error;}
  finally{clearTimeout(timer);}
}
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin==='https://api.tcgdex.net'&&url.pathname.startsWith('/v2/')){event.respondWith(networkFirst(req,DATA));return;}
  if(url.origin==='https://api.pokemontcg.io'&&url.pathname.startsWith('/v2/cards')){event.respondWith(networkFirst(req,DATA));return;}
  if(['https://assets.tcgdex.net','https://images.pokemontcg.io'].includes(url.origin)){
    event.respondWith(cacheFirst(req,IMAGES,320).catch(()=>Response.error()));return;
  }
  if(url.origin===self.location.origin){
    if(url.pathname.includes('/assets/offline/')){event.respondWith(cacheFirst(req,PACK,3200).catch(()=>Response.error()));return;}
    if(req.mode==='navigate'){event.respondWith(fetch(req).catch(async()=>(await caches.match('./index.html'))||Response.error()));return;}
    // HTML, JavaScript and CSS must update on deploy, not stay stuck in an old shell cache.
    if(/\.(?:js|mjs|css|html)$/.test(url.pathname)){event.respondWith(networkFirst(req,SHELL).catch(()=>Response.error()));return;}
    event.respondWith(cacheFirst(req,SHELL,30).catch(()=>Response.error()));
  }
});
