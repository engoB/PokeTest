import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const publisher=fileURLToPath(new URL('../scripts/publish-image-library.mjs',import.meta.url));
function fakeWebp(last){
 const bytes=Buffer.alloc(320,0);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WEBP',8);
 bytes[bytes.length-1]=last;return bytes;
}
test('GitHub publisher refuses unconfirmed rights, publishes incrementally and preserves prior files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pokevault-git-library-'));
 const dist=join(dir,'dist'),out=join(dir,'assets/library');
 try{
  await mkdir(join(dist,'assets/offline/cards'),{recursive:true});
  const images={};
  for(const [id,last] of [['base1-1',1],['base1-2',2]]){
   await writeFile(join(dist,'assets/offline/cards',id+'.webp'),fakeWebp(last));
   images[id]={file:'./assets/offline/cards/'+id+'.webp'};
  }
  await writeFile(join(dist,'assets/offline/images.json'),JSON.stringify({version:1,images}));
  const common=['--dir',dist,'--out',out,'--report',join(dist,'report.json'),
   '--max-new-files','1','--max-new-bytes','500','--max-file-bytes','500','--max-total-bytes','1000'];
  const run=extra=>spawnSync(process.execPath,[publisher,...common,...extra],{encoding:'utf8'});
  assert.notEqual(run([]).status,0,'unconfirmed redistribution must be refused');
  const first=run(['--rights-confirmed']);
  assert.equal(first.status,0,first.stderr);
  let manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.totalImages,1);
  assert.equal(manifest.totalBytes,320);
  assert.ok((await stat(join(out,'cards','base1-1',manifest.images['base1-1'].sha256.slice(0,16)+'.webp'))).isFile());
  const second=run(['--rights-confirmed']);
  assert.equal(second.status,0,second.stderr);
  manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.totalImages,2);
  assert.equal(manifest.totalBytes,640);
  const version=manifest.version;
  const third=run(['--rights-confirmed']);
  assert.equal(third.status,0,third.stderr);
  assert.equal(JSON.parse(await readFile(join(dist,'report.json'),'utf8')).added,0);
  assert.equal(JSON.parse(await readFile(join(out,'manifest.json'),'utf8')).version,version);
 }finally{await rm(dir,{recursive:true,force:true});}
});
