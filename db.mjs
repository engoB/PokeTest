// IndexedDB is a replaceable performance cache. The user's collection remains in pv_collection.
const NAME='pokevault-cache-v2';
export function openCache() {
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
export function loadCache(db,store) {
  if (!db) return Promise.resolve([]);
  return new Promise(resolve=>{
    try {const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>resolve([]);} catch {resolve([]);}
  });
}
export function putCache(db,store,items) {
  if (!db || !items.length) return Promise.resolve(false);
  return new Promise(resolve=>{
    try {const tx=db.transaction(store,'readwrite');const bucket=tx.objectStore(store);for(const item of items)bucket.put(item);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);} catch {resolve(false);}
  });
}
export function deleteCache(db,store,id){
  if(!db)return Promise.resolve(false);
  return new Promise(resolve=>{
    try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}
    catch{resolve(false);}
  });
}
