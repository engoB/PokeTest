#!/usr/bin/env node
// Build an immutable owner-controlled image library from a rights-cleared pack.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {verifiedImage} from './harvest-core.mjs';
import {safeId} from './offline-core.mjs';
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
if(!args.includes('--rights-confirmed'))throw Error('Explicit redistribution rights confirmation required');
const root=resolve(arg('--dir')||'dist'),out=resolve(arg('--out')||'image-library-public');
const pack=JSON.parse(await readFile(join(root,'assets/offline/images.json'),'utf8'));
if(pack?.version!==1||!pack.images||typeof pack.images!=='object')throw Error('Invalid assembled pack');
const manifest={format:'pokevault-owned-library-v1',version:'',generatedAt:new Date().toISOString(),images:Object.create(null)};
let totalBytes=0;
for(const [id,entry] of Object.entries(pack.images)){
 if(!safeId(id)||typeof entry?.file!=='string')throw Error('Invalid card '+id);
 const ext=entry.file.split('.').pop();
 if(!['webp','png','jpg'].includes(ext)||entry.file!==`./assets/offline/cards/${encodeURIComponent(id)}.${ext}`)throw Error('Unsafe file '+id);
 const bytes=await readFile(join(root,'assets/offline/cards',`${id}.${ext}`));
 if(verifiedImage(bytes)!==ext)throw Error('Invalid image bytes '+id);
 const hash=createHash('sha256').update(bytes).digest('hex');
 const file=`cards/${encodeURIComponent(id)}/${hash.slice(0,16)}.${ext}`;
 await mkdir(dirname(join(out,file)),{recursive:true});await copyFile(join(root,'assets/offline/cards',`${id}.${ext}`),join(out,file));
 manifest.images[id]={file,sha256:hash,bytes:bytes.length,checkedAt:Date.now()};totalBytes+=bytes.length;
}
if(!Object.keys(manifest.images).length)throw Error('Empty library');
const stable=Object.entries(manifest.images).sort(([a],[b])=>a.localeCompare(b)).map(([id,row])=>id+':'+row.sha256).join('\n');
manifest.version=createHash('sha256').update(stable).digest('hex').slice(0,16);
manifest.totalImages=Object.keys(manifest.images).length;manifest.totalBytes=totalBytes;
await mkdir(out,{recursive:true});await writeFile(join(out,'manifest.json'),JSON.stringify(manifest));
console.log(`Library ${manifest.version}: ${manifest.totalImages} images, ${totalBytes} bytes. Upload cards first, manifest last.`);
