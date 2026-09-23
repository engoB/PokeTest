/* Versioned PWA shell; API and visited images remain available offline after first load. */
const VERSION='pv-v3';
const SHELL=`${VERSION}-shell`,DATA=`${VERSION}-data`,IMAGES=`${VERSION}-images`;
const APP_FILES=['./','./index.html','./app.js','./core.mjs','./db.mjs','./virtual-grid.mjs','./image-state.mjs','./style.css','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/card-back.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('pv-')&&!key.startsWith(VERSION))await caches.delete(key);
  await self.clients.claim();
})()));
async function limitCache(name,max){
  const cache=await caches.open(name),keys=await cache.keys();
  if(keys.length<=max)return;
  // Never evict the first-visit catalogs while background price scans fill the cache.
  const removable=keys.filter(req=>!(name===DATA&&/^\/v2\/fr\/(?:cards|sets)\/?$/.test(new URL(req.url).pathname)));
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
    if(req.mode==='navigate'){event.respondWith(fetch(req).catch(async()=>(await caches.match('./index.html'))||Response.error()));return;}
    event.respondWith(cacheFirst(req,SHELL,30).catch(()=>Response.error()));
  }
});
