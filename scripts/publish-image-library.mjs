#!/usr/bin/env node
// Incremental GitHub Pages library. No external storage, Git LFS or third-party CDN.
// The caller must confirm PUBLIC REDISTRIBUTION rights for every included image.
import {readFile,writeFile,mkdir,copyFile,stat,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {verifiedImage} from './harvest-core.mjs';
import {safeId} from './offline-core.mjs';

const args=process.argv.slice(2);
const arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const positive=(key,fallback)=>{const n=Number(arg(key,fallback));if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid '+key);return n;};
if(!args.includes('--rights-confirmed'))throw Error('Confirm public redistribution rights before publishing any scans');
const root=resolve(arg('--dir','dist'));
const out=resolve(arg('--out','assets/library'));
const reportPath=resolve(arg('--report','dist/library-publish-report.json'));
const maxNewFiles=positive('--max-new-files',300);
const maxNewBytes=positive('--max-new-bytes',24*1024*1024);
const maxFileBytes=positive('--max-file-bytes',120*1024);
const maxTotalBytes=positive('--max-total-bytes',650*1024*1024);
if(maxTotalBytes>650*1024*1024)throw Error('GitHub Pages safety cap: 650 MiB of images per repository');
if(maxNewBytes>32*1024*1024)throw Error('Git commit safety cap: 32 MiB per batch');
const pack=JSON.parse(await readFile(join(root,'assets/offline/images.json'),'utf8'));
if(pack?.version!==1||!pack.images||typeof pack.images!=='object'||Array.isArray(pack.images))throw Error('Invalid assembled image pack');
const manifestPath=join(out,'manifest.json');
let previous;
try{previous=JSON.parse(await readFile(manifestPath,'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;previous={format:'pokevault-owned-library-v1',images:{}};}
if(previous?.format!=='pokevault-owned-library-v1'||!previous.images||typeof previous.images!=='object'||Array.isArray(previous.images))throw Error('Invalid existing GitHub library');
const images=Object.create(null);
let totalBytes=0;
for(const [id,row] of Object.entries(previous.images)){
 if(!safeId(id)||typeof row?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<300)throw Error('Invalid existing library entry '+id);
 const ext=row.file?.split('.').pop();
 const filename=row.sha256.slice(0,16)+'.'+ext;
 if(!['webp','png','jpg'].includes(ext)||row.file!=='cards/'+encodeURIComponent(id)+'/'+filename)throw Error('Unsafe existing path '+id);
 const disk=join(out,'cards',id,filename);
 const info=await stat(disk);
 if(!info.isFile()||info.size!==row.bytes)throw Error('Missing or mismatched existing image '+id);
 images[id]=row;totalBytes+=row.bytes;
}
if(totalBytes>maxTotalBytes)throw Error('Existing GitHub library already exceeds size cap');
const report={format:'pokevault-github-library-report-v1',generatedAt:new Date().toISOString(),existing:Object.keys(images).length,added:0,addedBytes:0,skippedExisting:0,skippedOversized:0,skippedBatchBudget:0,skippedTotalBudget:0,sourceImages:Object.keys(pack.images).length};
for(const id of Object.keys(pack.images).sort()){
 if(!safeId(id))throw Error('Unsafe card ID '+id);
 if(images[id]){report.skippedExisting++;continue;}
 const row=pack.images[id],ext=row?.file?.split('.').pop();
 if(!['webp','png','jpg'].includes(ext)||row.file!=='./assets/offline/cards/'+encodeURIComponent(id)+'.'+ext)throw Error('Unsafe source file '+id);
 const source=join(root,'assets/offline/cards',id+'.'+ext);
 const info=await stat(source);
 if(!info.isFile()||info.size<300)throw Error('Invalid source file '+id);
 if(info.size>maxFileBytes){report.skippedOversized++;continue;}
 if(totalBytes+info.size>maxTotalBytes){report.skippedTotalBudget++;continue;}
 if(report.added>=maxNewFiles||report.addedBytes+info.size>maxNewBytes){report.skippedBatchBudget++;continue;}
 const bytes=await readFile(source);
 if(verifiedImage(bytes)!==ext)throw Error('Corrupt or mislabeled image '+id);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const filename=sha256.slice(0,16)+'.'+ext;
 const file='cards/'+encodeURIComponent(id)+'/'+filename;
 const destination=join(out,'cards',id,filename);
 await mkdir(dirname(destination),{recursive:true});
 await copyFile(source,destination);
 images[id]={file,sha256,bytes:bytes.length,checkedAt:Date.now()};
 totalBytes+=bytes.length;report.added++;report.addedBytes+=bytes.length;
}
const stable=Object.entries(images).sort(([a],[b])=>a.localeCompare(b)).map(([id,row])=>id+':'+row.sha256).join('\n');
const version=images&&Object.keys(images).length?createHash('sha256').update(stable).digest('hex').slice(0,16):'initial-empty';
const manifest={format:'pokevault-owned-library-v1',version,generatedAt:new Date().toISOString(),totalImages:Object.keys(images).length,totalBytes,images};
report.totalImages=manifest.totalImages;report.totalBytes=totalBytes;report.version=version;
await mkdir(out,{recursive:true});
if(report.added){
 const temp=manifestPath+'.tmp';
 await writeFile(temp,JSON.stringify(manifest));
 await rename(temp,manifestPath); // Publish the manifest after every new image exists.
}
await mkdir(dirname(reportPath),{recursive:true});
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
