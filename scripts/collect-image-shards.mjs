#!/usr/bin/env node
// Merge archives downloaded by `gh run download RUN_ID --pattern 'pokevault-image-shard-*' --dir artifacts`.
// Requires no npm dependencies. Never publish images to a public repo automatically.
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cardShard} from './harvest-core.mjs';
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null;};
const source=resolve(opt('--artifacts')||'artifacts'),destination=resolve(opt('--dist')||'dist');
const shards=Number(opt('--shards')||16);
if(!Number.isInteger(shards)||shards<1||shards>64)throw Error('Invalid shard count');
const targetCards=join(destination,'assets/offline/cards'),targetParts=join(destination,'parts');
await mkdir(targetCards,{recursive:true});await mkdir(targetParts,{recursive:true});
for(let n=0;n<shards;n++){
  const from=join(source,`pokevault-image-shard-${n}`);
  const name=`images-part-${n}-of-${shards}.json`;
  const part=JSON.parse(await readFile(join(from,'parts',name),'utf8'));
  if(part.format!=='pokevault-image-part-v1'||part.shard!==n||part.shards!==shards)throw Error('Wrong shard '+n);
  await copyFile(join(from,'parts',name),join(targetParts,name));
  for(const [id,entry] of Object.entries(part.images)){
    const name=entry.file.split('/').at(-1);
    if(cardShard(id,shards)!==n)throw Error('Wrong shard for '+id);
    if(name!==`${id}.${entry.file.split('.').at(-1)}`||!/^[-A-Za-z0-9_.]+\.(webp|png|jpg)$/.test(name))throw Error('Unsafe asset name');
    await copyFile(join(from,'assets/offline/cards',name),join(targetCards,name));
  }
  console.log(`Part ${n+1}/${shards}: ${Object.keys(part.images).length} images copied`);
}
console.log(`All shards copied. Run: node scripts/assemble-image-pack.mjs --dir ${destination} --shards ${shards}`);
