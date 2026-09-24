#!/usr/bin/env node
// Import files the user has obtained and manually matched to exact FR IDs.
// NEVER scrapes sites, downloads third-party artwork, or commits scans to Git.
import {readFile,writeFile,rename,mkdir,copyFile,realpath,stat} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {safeId} from './offline-core.mjs';
import {verifiedImage} from './harvest-core.mjs';
import {IMAGE_RESEARCH_SOURCES} from '../core.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];},flag=k=>args.includes(k);
if(flag('--help')){console.log('node scripts/import-personal-images.mjs --catalog harvest-cache/catalog-fr.json --manifest manual-images.json --images-dir personal-images --dist dist [--replace]');process.exit(0);}
const catalogPath=resolve(opt('--catalog')||join(root,'harvest-cache/catalog-fr.json'));
const manifestPath=resolve(opt('--manifest')||join(root,'manual-images.json'));
const imagesDir=resolve(opt('--images-dir')||join(root,'personal-images'));
const dist=resolve(opt('--dist')||join(root,'dist'));
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const catalog=await read(catalogPath),known=new Set(catalog.filter(c=>safeId(c?.id)).map(c=>c.id));
if(!known.size)throw Error('French catalogue required; cannot match personal images to exact IDs');
const manual=await read(manifestPath);if(manual.format!=='pokevault-manual-images-v1'||!manual.images||typeof manual.images!=='object'||Array.isArray(manual.images))throw Error('Invalid personal image manifest');
const manifestFile=join(dist,'assets/offline/images.json'),cardsDir=join(dist,'assets/offline/cards');
const existing=await read(manifestFile).catch(()=>({version:1,mode:'partial',images:{}}));
if(existing.version!==1||!existing.images||typeof existing.images!=='object')throw Error('Existing pack has invalid manifest');
// Verify every pre-existing physical file before counting it toward completeness.
// A stale manifest alone is never proof that a scan is actually present.
const entries=Object.create(null),staleExisting=[],rejected=[];let imported=0,skipped=0;
for(const [id,row] of Object.entries(existing.images)){
  if(!known.has(id)||!safeId(id))continue;
  const ext=/\.(png|jpg|webp)$/.exec(row?.file||'');
  if(!ext||row.file!==`./assets/offline/cards/${encodeURIComponent(id)}.${ext[1]}`){staleExisting.push({id,reason:'unsafe-existing-mapping'});continue;}
  try{const path=join(cardsDir,`${id}.${ext[1]}`),info=await stat(path);if(info.size>8_000_000)throw Error('too-large');
    const bytes=await readFile(path);if(verifiedImage(bytes)!==ext[1])throw Error('invalid-image');
    entries[id]={...row,bytes:bytes.length,sha256:row.sha256||createHash('sha256').update(bytes).digest('hex')};
  }catch(error){staleExisting.push({id,reason:String(error.message||error)});}
}

const allowed=new Map(IMAGE_RESEARCH_SOURCES.map(s=>[s.key,s.domain]));allowed.set('personal',null);
await mkdir(cardsDir,{recursive:true});const base=await realpath(imagesDir);
for(const [id,row] of Object.entries(manual.images)){
  if(!row?.reviewedExactCard)continue;
  if(!known.has(id)||!safeId(id)){rejected.push({id,reason:'unknown-or-unsafe-FR-ID'});continue;}
  if(entries[id]&&!flag('--replace')){skipped++;continue;}
  const ext=/\.(png|jpg|webp)$/.exec(row.file||'');
  if(!ext||row.file!==`${id}.${ext[1]}`||!allowed.has(row.source)){rejected.push({id,reason:'file-name-or-source-invalid'});continue;}
  if(row.source!=='personal'){
    try{const u=new URL(row.referenceUrl);const host=allowed.get(row.source);if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname===host||u.hostname.endsWith('.'+host)))throw Error('invalid-source');}
    catch{rejected.push({id,reason:'reference-url-not-from-selected-source'});continue;}
  }
  try{
    const file=await realpath(join(base,row.file));if(!file.startsWith(base+sep))throw Error('path-outside-private-directory');
    const info=await stat(file);if(info.size>8_000_000)throw Error('image-too-large');
    const bytes=await readFile(file),type=verifiedImage(bytes);if(!type||type!==ext[1])throw Error('invalid-or-truncated-image');
    await copyFile(file,join(cardsDir,row.file));
    entries[id]={file:`./assets/offline/cards/${encodeURIComponent(id)}.${type}`,source:`personal-${row.source}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};imported++;
  }catch(error){rejected.push({id,reason:String(error.message||error)});}
}
const total=Object.keys(entries).filter(id=>known.has(id)).length;
const report={format:'pokevault-personal-import-report-v1',generatedAt:new Date().toISOString(),catalogueTotal:known.size,localManifestCount:total,stillMissing:known.size-total,imported,skipped,rejected,staleExisting,complete:total===known.size&&rejected.length===0};
// An incomplete pack MUST leave online image fallbacks enabled in the PWA.
const next={version:1,mode:report.complete?'sealed':'partial',generatedAt:report.generatedAt,total:known.size,images:entries};
await mkdir(dirname(manifestFile),{recursive:true});await writeFile(manifestFile+'.tmp',JSON.stringify(next));await rename(manifestFile+'.tmp',manifestFile);
await writeFile(join(dist,'assets/offline/personal-import-report.json'),JSON.stringify(report,null,2));
console.log(`Imported ${imported}; existing skipped ${skipped}; rejected ${rejected.length}; stale existing ${staleExisting.length}; verified local ${total}/${known.size}; remaining ${report.stillMissing}`);
if(rejected.length)process.exitCode=2;
