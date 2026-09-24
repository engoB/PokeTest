#!/usr/bin/env node
// Run this from Work or a networked computer. Never commit dist/ or API credentials.
import {readFile,writeFile,mkdir,copyFile,cp,readdir,stat} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {candidateBases,safeId,sniffImage,normalizeExport} from './offline-core.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const has=name=>args.includes(name);
if(has('--help')){console.log(`Usage: node scripts/build-offline.mjs [--catalog-json fr-cards.json --sets-json fr-sets.json] [--english-json en-cards.json] [--resolutions-json exported.json] [--languages de,it,es,pt] [--overrides-json reviewed.json] [--source-dir local-images] [--allow-host cdn.example.org] [--only-owned collection.json] [--limit N] [--request-gap-ms 200] [--output dist] [--precache-limit N]\nRequires Node >=20. Source images from TCGdex FR/EN, already verified URLs or manually reviewed overrides. Does not crawl arbitrary sites. Never publish downloaded artwork without checking redistribution rights.`);process.exit(0);}
const output=resolve(opt('--output')||join(root,'dist'));
if(output===root||!output.startsWith(resolve(root,'..')+'/'))throw new Error('Unsafe output directory');
const limit=opt('--limit')===null?Infinity:Number(opt('--limit'));
if(!Number.isInteger(limit)&&limit!==Infinity||limit<1)throw new Error('Invalid --limit');
const requestGap=opt('--request-gap-ms')===null?200:Number(opt('--request-gap-ms'));
if(!Number.isInteger(requestGap)||requestGap<100||requestGap>10000)throw new Error('Invalid --request-gap-ms (100..10000)');
const precacheLimit=opt('--precache-limit')===null?0:Number(opt('--precache-limit'));
if(!Number.isInteger(precacheLimit)||precacheLimit<0||precacheLimit>2000)throw new Error('Invalid --precache-limit (0..2000)');
const load=async path=>JSON.parse(await readFile(resolve(path),'utf8'));
const getJSON=async(url)=>{
  for(let attempt=0;attempt<3;attempt++){
    try{const c=new AbortController(),timer=setTimeout(()=>c.abort(),30000);let r;try{r=await fetch(url,{signal:c.signal});}finally{clearTimeout(timer);}if(r.status===429||r.status>=500)throw new Error(`HTTP ${r.status}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}
    catch(error){if(attempt===2)throw error;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
  }
};
const catalog=opt('--catalog-json')?await load(opt('--catalog-json')):await getJSON('https://api.tcgdex.net/v2/fr/cards');
const sets=opt('--sets-json')?await load(opt('--sets-json')):await getJSON('https://api.tcgdex.net/v2/fr/sets');
if(!Array.isArray(catalog)||!Array.isArray(sets))throw new Error('Catalog/sets must be arrays');
const english=opt('--english-json')?await load(opt('--english-json')):await getJSON('https://api.tcgdex.net/v2/en/cards').catch(error=>{console.warn('EN unavailable:',error.message);return [];});
const enById=new Map(english.map(card=>[card.id,card]));
const languages=(opt('--languages')||'').split(',').map(x=>x.trim()).filter(Boolean);
if(languages.some(x=>!['de','es','it','pt'].includes(x)))throw new Error('Supported extra languages: de,es,it,pt');
const extraCatalogs=await Promise.all(languages.map(async lang=>{
  try{const cards=await getJSON(`https://api.tcgdex.net/v2/${lang}/cards`);return [lang,new Map(cards.map(card=>[card.id,card]))];}
  catch(error){console.warn(`${lang} unavailable:`,error.message);return [lang,new Map()];}
}));
const exported=opt('--resolutions-json')?normalizeExport(await load(opt('--resolutions-json'))):{};
const overrides=opt('--overrides-json')?await load(opt('--overrides-json')):{};
const allowedHosts=['assets.tcgdex.net','images.pokemontcg.io',...(opt('--allow-host')||'').split(',').filter(Boolean)];
if(allowedHosts.some(h=>!/^[a-z0-9.-]+$/.test(h)||['localhost','127.0.0.1','0.0.0.0'].includes(h)||/^\d+(?:\.\d+){3}$/.test(h)))throw new Error('Invalid --allow-host');
const owned=opt('--only-owned')?await load(opt('--only-owned')):null;
const ownedIds=owned?new Set(Object.keys(owned.collection||owned).filter(id=>Number((owned.collection||owned)[id])>0)):null;
const chosen=catalog.filter(c=>safeId(c.id)&&(!ownedIds||ownedIds.has(c.id))).slice(0,limit);
const localDir=opt('--source-dir')?resolve(opt('--source-dir')):null;
const imageDir=join(output,'assets','offline','cards');
await mkdir(imageDir,{recursive:true});
for(const file of ['index.html','app.bundle.js','app.js','core.mjs','db.mjs','virtual-grid.mjs','image-state.mjs','style.css','manifest.webmanifest','sw.js'])await copyFile(join(root,file),join(output,file));
await cp(join(root,'assets'),join(output,'assets'),{recursive:true,filter:src=>!src.includes('/offline/')});
const results=Object.create(null),misses=[],errors=[];
let next=0,done=0;
let downloadTail=Promise.resolve(),lastDownload=0;
async function throttle(){
  const task=downloadTail.catch(()=>{}).then(async()=>{
    const wait=Math.max(0,requestGap-(Date.now()-lastDownload));
    if(wait)await new Promise(r=>setTimeout(r,wait));
    lastDownload=Date.now();
  });
  downloadTail=task;
  await task;
}
async function download(url){
  for(let attempt=0;attempt<3;attempt++){
    await throttle();
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
    try{
      const r=await fetch(url,{signal:c.signal});
      if(r.status===429||r.status>=500){
        if(attempt===2)throw new Error(`Image HTTP ${r.status}`);
        await new Promise(done=>setTimeout(done,(attempt+1)*2500));continue;
      }
      if(!r.ok)return null;
      const length=Number(r.headers.get('content-length')||0);if(length>4000000)return null;
      const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>4000000)return null;
      const ext=sniffImage(bytes);return ext?{bytes,ext}:null;
    }catch(error){
      if(attempt===2)throw error;
      await new Promise(done=>setTimeout(done,(attempt+1)*1000));
    }finally{clearTimeout(timer);}
  }
  return null;
}
async function worker(){
  while(next<chosen.length){
    const card=chosen[next++],id=card.id;
    try{
      let asset=null,source=null;
      if(localDir){
        for(const ext of ['webp','png','jpg']){
          try{const bytes=await readFile(join(localDir,`${id}.${ext}`)),actual=sniffImage(bytes);if(actual){asset={bytes,ext:actual};source='local-reviewed';break;}}catch(error){if(error.code!=='ENOENT')throw error;}
        }
      }
      if(!asset){
        // Resumable build: keep previously validated downloads on repeated runs.
        for(const ext of ['webp','png','jpg']){
          try{const bytes=await readFile(join(imageDir,`${id}.${ext}`)),actual=sniffImage(bytes);if(actual){asset={bytes,ext:actual};source='previous-build';break;}}catch(error){if(error.code!=='ENOENT')throw error;}
        }
      }
      if(!asset){
        const extra=extraCatalogs.map(([lang,cards])=>[cards.get(id),`tcgdex-${lang}`]);
        const candidates=candidateBases(card,enById.get(id),exported[id],overrides[id],extra,allowedHosts);
        for(const candidate of candidates){
          try{asset=await download(candidate.url);if(asset){source=candidate.source;break;}}
          catch(error){errors.push({id,url:candidate.url,error:String(error.message||error)});}
        }
      }
      if(asset){const filename=`${id}.${asset.ext}`;await writeFile(join(imageDir,filename),asset.bytes);results[id]={file:`./assets/offline/cards/${filename}`,source,bytes:asset.bytes.length};}
      else misses.push(id);
    }catch(error){errors.push({id,error:String(error.message||error)});misses.push(id);}
    done++;if(done%100===0||done===chosen.length)console.log(`${done}/${chosen.length} · ${Object.keys(results).length} local images · ${misses.length} missing`);
  }
}
await Promise.all(Array.from({length:5},()=>worker()));
await writeFile(join(output,'assets/offline/catalog-fr.json'),JSON.stringify(catalog));
await writeFile(join(output,'assets/offline/sets-fr.json'),JSON.stringify(sets));
await writeFile(join(output,'assets/offline/images.json'),JSON.stringify({version:1,mode:'sealed',generatedAt:new Date().toISOString(),total:chosen.length,images:results}));
await writeFile(join(output,'assets/offline/precache.json'),JSON.stringify(Object.values(results).slice(0,precacheLimit).map(x=>x.file)));
const report={total:chosen.length,packed:Object.keys(results).length,missing:misses.length,missingIds:misses,errors,scope:ownedIds?'owned':'catalog',generatedAt:new Date().toISOString()};
await writeFile(join(output,'assets/offline/report.json'),JSON.stringify(report,null,2));
console.log(`Ready: ${output} · ${report.packed}/${report.total} images. Report: assets/offline/report.json`);
if(report.missing)console.log('Missing images keep the local card back. No invented matches.');
