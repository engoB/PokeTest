/* App shell + visited catalog/images: offline after the first successful online visit. */
const VERSION='pv-v1';
const SHELL=`${VERSION}-shell`,DATA=`${VERSION}-data`,IMAGES=`${VERSION}-images`;
const APP_FILES=['./','./index.html','./app.js','./core.mjs','./style.css','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pv-')&&!key.startsWith(VERSION))await caches.delete(key);await self.clients.claim();})());});
async function limitCache(cacheName,limit){const cache=await caches.open(cacheName);const keys=await cache.keys();if(keys.length>limit)await Promise.all(keys.slice(0,keys.length-limit).map(k=>cache.delete(k)));}
async function cacheFirst(request,name,max){const cache=await caches.open(name);const hit=await cache.match(request);if(hit)return hit;const response=await fetch(request);if(response.ok||response.type==='opaque'){await cache.put(request,response.clone());limitCache(name,max).catch(()=>{});}return response;}
async function networkFirst(request,name){const cache=await caches.open(name);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),4500);try{const response=await fetch(request,{signal:controller.signal});if(response.ok){await cache.put(request,response.clone());limitCache(name,85).catch(()=>{});}return response;}catch(err){const fallback=await cache.match(request);if(fallback)return fallback;throw err;}finally{clearTimeout(timeout);}}
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin==='https://api.tcgdex.net'&&url.pathname.startsWith('/v2/')){event.respondWith(networkFirst(req,DATA));return;}
  if(url.origin==='https://assets.tcgdex.net'){event.respondWith(cacheFirst(req,IMAGES,170).catch(()=>Response.error()));return;}
  if(url.origin===self.location.origin){if(req.mode==='navigate'){event.respondWith(fetch(req).catch(async()=>(await caches.match('./index.html'))||Response.error()));return;}event.respondWith(cacheFirst(req,SHELL,25).catch(()=>Response.error()));}
});
