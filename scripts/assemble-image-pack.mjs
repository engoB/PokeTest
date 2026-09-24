#!/usr/bin/env node
// Combine the 16 GitHub Actions part artifacts AFTER manually obtaining permission
// for any redistributed scans. Does not trust part files without checking bytes.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {safeId} from './offline-core.mjs';
import {verifiedImage,cardShard} from './harvest-core.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
if(args.includes('--help')){console.log('node scripts/assemble-image-pack.mjs --dir dist --shards 16 [--catalog dist/assets/offline/catalog-fr.json]');process.exit(0);}
const dir=resolve(opt('--dir')||join(root,'dist')),shards=Number(opt('--shards')||16);
if(!Number.isInteger(shards)||shards<1||shards>64)throw Error('Invalid shard count');
const cardsDir=join(dir,'assets/offline/cards');
const parts=join(dir,'parts'),entries=Object.create(null),errors=[];
for(let n=0;n<shards;n++){
  const file=join(parts,`images-part-${n}-of-${shards}.json`);
  let part;try{part=JSON.parse(await readFile(file,'utf8'));}catch{throw Error(`Missing ${file}: download/extract ALL part artifacts before assembly`);}
  if(part.format!=='pokevault-image-part-v1'||part.shard!==n||part.shards!==shards)throw Error(`Invalid part ${n}`);
  for(const [id,row] of Object.entries(part.images||{})){
    if(!safeId(id)||!/^\.\/assets\/offline\/cards\/[A-Za-z0-9_.-]+\.(webp|png|jpg)$/.test(row?.file)||!row.file.startsWith(`./assets/offline/cards/${id}.`))throw Error(`Unsafe mapping ${id}`);
    if(cardShard(id,shards)!==n)throw Error(`Card ${id} belongs to a different shard`);
    if(entries[id])throw Error(`Duplicate card mapping: ${id}`);
    const path=join(cardsDir,row.file.split('/').at(-1));
    try{const bytes=await readFile(path);const ext=verifiedImage(bytes);if(!ext||!row.file.endsWith(`.${ext}`))throw Error('Image header / suffix mismatch');entries[id]={file:row.file,source:row.source,bytes:bytes.length};}
    catch(error){errors.push({id,file:row.file,error:error.message});}
  }
}
let catalog=[];const catalogFile=opt('--catalog')||join(dir,'assets/offline/catalog-fr.json');
try{catalog=JSON.parse(await readFile(catalogFile,'utf8'));}catch{}
const knownIds=new Set(catalog.map(c=>c.id));const unresolved=catalog.filter(c=>!entries[c.id]).map(c=>c.id);
const orphanImageIds=Object.keys(entries).filter(id=>!knownIds.has(id));
const report={generatedAt:new Date().toISOString(),shards,totalImages:Object.keys(entries).length,catalogueCount:catalog.length,unresolvedIds:unresolved,orphanImageIds,damagedFiles:errors,verifiedFiles:Object.keys(entries).length,complete:catalog.length>0&&!unresolved.length&&!errors.length};
await mkdir(join(dir,'assets/offline'),{recursive:true});
await writeFile(join(dir,'assets/offline/images.json'),JSON.stringify({version:1,mode:catalog.length?'sealed':'unverified',generatedAt:report.generatedAt,total:catalog.length||Object.keys(entries).length,images:entries}));
await writeFile(join(dir,'assets/offline/precache.json'),'[]');
await writeFile(join(dir,'assets/offline/images-assembly-report.json'),JSON.stringify(report,null,2));
console.log(`Images physically verified: ${report.verifiedFiles}, unknown/missing in catalog: ${report.unresolvedIds.length}, damaged: ${errors.length}. Complete: ${report.complete}.`);
if(errors.length)process.exitCode=2;
