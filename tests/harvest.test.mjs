import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync,rmSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {validIndex,cardShard,sourceCandidates,exactScrydexCard,classifyResult,trustedHarvestURL,verifiedImage} from '../scripts/harvest-core.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
test('image URL/index validation prevents unsafe host or traversal',()=>{
  assert.equal(trustedHarvestURL('http://assets.tcgdex.net/fr/a.png'),null);
  assert.equal(trustedHarvestURL('https://example.com/card.png'),null);
  assert.equal(trustedHarvestURL('https://assets.tcgdex.net/../secret.png'),null);
  assert.match(trustedHarvestURL('https://images.scrydex.com/pokemon/base1-1/small'),/scrydex/);
  assert.deepEqual(Object.keys(validIndex({images:{'base1-1':{url:'https://assets.tcgdex.net/fr/base/base1/001/low.webp',checkedAt:42},'../oops':{url:'https://assets.tcgdex.net/abc.webp'},'x-2':{url:'https://evil.invalid/2.png'}}})),['base1-1']);
});
test('language fallback preserves exact card ID and avoids duplicate URL requests',()=>{
  const indexed={url:'https://assets.tcgdex.net/fr/base/base1/001/low.webp'};
  const bases={fr:new Map([['base1-1',{id:'base1-1',image:'https://assets.tcgdex.net/fr/base/base1/001'}]]),en:new Map([['base1-1',{id:'base1-1',image:'https://assets.tcgdex.net/en/base/base1/001'}]]),de:new Map([['base1-2',{id:'base1-2',image:'https://assets.tcgdex.net/de/base/base1/002'}]])};
  const candidates=sourceCandidates({id:'base1-1'},bases,indexed);
  assert.equal(candidates.filter(c=>c.url===indexed.url).length,1);
  assert.ok(candidates.some(c=>c.source==='tcgdex-en'));
  assert.ok(!candidates.some(c=>c.source==='tcgdex-de'));
  assert.equal(cardShard('base1-1',16),cardShard('base1-1',16));
});
test('secondary exact match never substitutes wrong card or untrusted image',()=>{
  const target={id:'base1-1',localId:'1'},english={name:'Alakazam'};
  const valid={id:'base1-1',name:'Alakazam',number:'001',images:[{type:'front',small:'https://images.scrydex.com/pokemon/base1-1/small'}]};
  assert.equal(exactScrydexCard(target,english,valid).source,'scrydex-exact-id');
  assert.equal(exactScrydexCard(target,english,{...valid,id:'base1-2'}),null);
  assert.equal(exactScrydexCard(target,english,{...valid,name:'Abra'}),null);
  assert.equal(exactScrydexCard(target,english,{...valid,images:[{type:'front',small:'https://evil.test/x.png'}]}),null);
});
test('unknown/network/quota never become certified missing; only checked sources may yield unavailable',()=>{
  assert.equal(classifyResult({attempted:1,networkError:true}),'retry');
  assert.equal(classifyResult({attempted:0,moreProviders:false}),'retry');
  assert.equal(classifyResult({attempted:12,moreProviders:true}),'retry');
  assert.equal(classifyResult({attempted:10}),'unavailable-in-checked-sources');
});
test('resumable pack uses actual verified image bytes, assembly rejects missing shard',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'pv-harvest-'));
  try{
    const fixtures=join(tmp,'fixture'),cache=join(tmp,'cache'),output=join(tmp,'dist');
    mkdirSync(fixtures,{recursive:true});mkdirSync(join(cache,'cards'),{recursive:true});
    const cards=[{id:'base1-1',name:'French',localId:'001'}],english=[{id:'base1-1',name:'Alakazam',localId:'001'}];
    for(const lang of ['fr','en','de','es','it','pt'])writeFileSync(join(fixtures,`${lang}.json`),JSON.stringify(lang==='fr'?cards:lang==='en'?english:[]));
    writeFileSync(join(fixtures,'sets.json'),JSON.stringify([{id:'base1',name:'Base'}]));
    writeFileSync(join(fixtures,'index.json'),JSON.stringify({images:{'base1-1':{url:'https://assets.tcgdex.net/fr/base/base1/001/low.webp',checkedAt:123}}}));
    const image=join(root,'assets/icon-192.png');copyFileSync(image,join(cache,'cards','base1-1.png'));
    const args=['scripts/harvest-images.mjs','--mode','pack','--index',join(fixtures,'index.json'),'--state',join(cache,'state.json'),'--cache-dir',cache,'--output',output,'--shard','0/1','--en-sets',join(fixtures,'sets.json'),'--no-network'];
    for(const lang of ['fr','en','de','es','it','pt'])args.push(`--${lang}-cards`,join(fixtures,`${lang}.json`));
    execFileSync(process.execPath,args,{cwd:root,timeout:20000});
    assert.equal(JSON.parse(readFileSync(join(output,'report.json'))).packed,1);
    assert.equal(JSON.parse(readFileSync(join(output,'images-part-0-of-1.json'))).images['base1-1'].source,'previously-verified');
    mkdirSync(join(output,'parts'),{recursive:true});renameSync(join(output,'images-part-0-of-1.json'),join(output,'parts','images-part-0-of-1.json'));
    mkdirSync(join(output,'assets/offline'),{recursive:true});writeFileSync(join(output,'assets/offline/catalog-fr.json'),JSON.stringify(cards));
    execFileSync(process.execPath,['scripts/assemble-image-pack.mjs','--dir',output,'--shards','1'],{cwd:root,timeout:20000});
    const manifest=JSON.parse(readFileSync(join(output,'assets/offline/images.json')));
    assert.equal(manifest.images['base1-1'].file,'./assets/offline/cards/base1-1.png');
    assert.equal(JSON.parse(readFileSync(join(output,'assets/offline/images-assembly-report.json'))).complete,true);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('offline missing card is retryable and run can resume without hammering providers',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'pv-no-network-'));
  try{
    const fixtures=join(tmp,'fixture'),cache=join(tmp,'cache'),output=join(tmp,'out');mkdirSync(fixtures,{recursive:true});
    for(const lang of ['fr','en','de','es','it','pt'])writeFileSync(join(fixtures,`${lang}.json`),JSON.stringify(lang==='fr'?[{id:'base1-2',name:'French',localId:'002'}]:lang==='en'?[{id:'base1-2',name:'Alakazam',localId:'002'}]:[]));
    writeFileSync(join(fixtures,'sets.json'),JSON.stringify([{id:'base1',name:'Base'}]));writeFileSync(join(fixtures,'index.json'),'{}');
    const args=['scripts/harvest-images.mjs','--mode','resolve','--index',join(fixtures,'index.json'),'--state',join(cache,'state.json'),'--cache-dir',cache,'--output',output,'--en-sets',join(fixtures,'sets.json'),'--no-network','--max-cards','1'];
    for(const lang of ['fr','en','de','es','it','pt'])args.push(`--${lang}-cards`,join(fixtures,`${lang}.json`));
    execFileSync(process.execPath,args,{cwd:root,timeout:20000});
    const state=JSON.parse(readFileSync(join(cache,'state.json')));assert.equal(state.cards['base1-2'].status,'retry');
    assert.equal(JSON.parse(readFileSync(join(output,'missing-images-report.json'))).unresolved[0].status,'retry');
    execFileSync(process.execPath,args,{cwd:root,timeout:20000});
    assert.equal(JSON.parse(readFileSync(join(output,'report.json'))).planned,0);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('exact-set fallback discovers a real image when TCGdex summary omits the image field',()=>{
  const card={id:'swsh12.5gg-GG36',localId:'GG36'};
  const set={id:'swsh12.5gg',serie:{id:'swsh'}};
  const urls=sourceCandidates(card,{},null,set);
  assert.ok(urls.some(c=>c.url==='https://assets.tcgdex.net/fr/swsh/swsh12.5gg/GG36/low.webp'));
  assert.equal(sourceCandidates(card,{},null,{id:'swsh12.5',serie:{id:'swsh'}}).length,0);
  assert.equal(sourceCandidates(card,{},null,{id:'swsh12.5gg'}).length,0);
});

test('mocked real-network flow recovers omitted subset scans, reports inaccessible providers, and bypasses a 1-hour quota',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'pv-network-'));
  try{
    const fixtures=join(tmp,'fixtures'),cache=join(tmp,'cache'),output=join(tmp,'out');mkdirSync(fixtures,{recursive:true});
    const cards=[{id:'base1-1',name:'French 1',localId:'001'},{id:'base1-2',name:'French 2',localId:'002'}];
    const en=cards.map(c=>({...c,name:'English '+c.id}));
    const languages=['fr','en','de','es','it','pt','pt-br','ja','zh-tw','id','th'];
    for(const lang of languages)writeFileSync(join(fixtures,`${lang}.json`),JSON.stringify(lang==='fr'?cards:lang==='en'?en:[]));
    writeFileSync(join(fixtures,'sets.json'),JSON.stringify([{id:'base1',name:'Base'}]));
    writeFileSync(join(fixtures,'index.json'),'{}');
    const args=['--import',join(root,'tests/fixtures/mock-network.mjs'),'scripts/harvest-images.mjs','--mode','resolve','--index',join(fixtures,'index.json'),'--state',join(cache,'state.json'),'--cache-dir',cache,'--output',output,'--en-sets',join(fixtures,'sets.json'),'--legacy-budget','0','--max-cards','2'];
    for(const lang of languages)args.push(`--${lang}-cards`,join(fixtures,`${lang}.json`));
    execFileSync(process.execPath,args,{cwd:root,timeout:20000});
    const state=JSON.parse(readFileSync(join(cache,'state.json')));
    assert.equal(state.cards['base1-1'].status,'found');
    assert.equal(state.cards['base1-1'].source,'tcgdex-en-exact-set-path');
    assert.equal(state.cards['base1-2'].status,'needs-provider-access');
    assert.ok(state.cards['base1-2'].sourcesTried.some(s=>s.includes('exact-set-path')));
    const report=JSON.parse(readFileSync(join(output,'report.json')));
    assert.equal(report.found,1);assert.equal(report.statusCounts['needs-provider-access'],1);
    assert.equal(report.stillUnindexed,1);
    // A separate pack run starts from a previously exported URL which returns 429
    // with Retry-After: 3600. It must immediately try a different provider.
    const packIndex=join(fixtures,'pack-index.json');
    writeFileSync(packIndex,JSON.stringify({images:{'base1-3':{url:'https://images.pokemontcg.io/base1/3.png',checkedAt:123}}}));
    const packCards=[{id:'base1-3',localId:'003',name:'French 3',image:'https://assets.tcgdex.net/fr/base/base1/003'}];
    writeFileSync(join(fixtures,'fr.json'),JSON.stringify(packCards));
    writeFileSync(join(fixtures,'en.json'),JSON.stringify([]));
    const packArgs=['--import',join(root,'tests/fixtures/mock-network.mjs'),'scripts/harvest-images.mjs','--mode','pack','--index',packIndex,'--state',join(tmp,'pack-state.json'),'--cache-dir',join(tmp,'pack-cache'),'--output',join(tmp,'dist'),'--en-sets',join(fixtures,'sets.json'),'--shard','0/1'];
    for(const lang of languages)packArgs.push(`--${lang}-cards`,join(fixtures,`${lang}.json`));
    execFileSync(process.execPath,packArgs,{cwd:root,timeout:20000});
    const pack=JSON.parse(readFileSync(join(tmp,'dist','report.json')));
    assert.equal(pack.packed,1);
    assert.ok(existsSync(join(tmp,'dist','assets/offline/cards/base1-3.png')));
    assert.ok(pack.errors.some(e=>e.error.includes('long Retry-After')));
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('two GitHub shard artifacts merge into a sealed pack; missing and corrupt scans stay explicit',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'pv-artifacts-'));
  try{
    const artifacts=join(tmp,'artifacts'),dist=join(tmp,'dist');
    const png=readFileSync(join(root,'assets/icon-192.png'));
    const parts=[{'base1-2':{file:'./assets/offline/cards/base1-2.png',source:'fixture',bytes:png.length}},{'base1-1':{file:'./assets/offline/cards/base1-1.png',source:'fixture',bytes:png.length}}];
    for(let n=0;n<2;n++){
      const dir=join(artifacts,`pokevault-image-shard-${n}`);mkdirSync(join(dir,'parts'),{recursive:true});mkdirSync(join(dir,'assets/offline/cards'),{recursive:true});
      writeFileSync(join(dir,'parts',`images-part-${n}-of-2.json`),JSON.stringify({format:'pokevault-image-part-v1',shard:n,shards:2,images:parts[n]}));
      for(const id of Object.keys(parts[n]))writeFileSync(join(dir,'assets/offline/cards',`${id}.png`),png);
    }
    mkdirSync(join(dist,'assets/offline'),{recursive:true});
    writeFileSync(join(dist,'assets/offline/catalog-fr.json'),JSON.stringify([{id:'base1-1'},{id:'base1-2'},{id:'base1-3'}]));
    const collect=()=>execFileSync(process.execPath,['scripts/collect-image-shards.mjs','--artifacts',artifacts,'--dist',dist,'--shards','2'],{cwd:root,timeout:20000});
    const assemble=()=>execFileSync(process.execPath,['scripts/assemble-image-pack.mjs','--dir',dist,'--shards','2'],{cwd:root,timeout:20000});
    collect();assemble();
    let report=JSON.parse(readFileSync(join(dist,'assets/offline/images-assembly-report.json')));
    assert.equal(report.complete,false);assert.deepEqual(report.unresolvedIds,['base1-3']);
    assert.equal(JSON.parse(readFileSync(join(dist,'assets/offline/images.json'))).mode,'sealed');
    parts[1]['base1-3']={file:'./assets/offline/cards/base1-3.png',source:'fixture',bytes:png.length};
    const shard1=join(artifacts,'pokevault-image-shard-1');
    writeFileSync(join(shard1,'parts','images-part-1-of-2.json'),JSON.stringify({format:'pokevault-image-part-v1',shard:1,shards:2,images:parts[1]}));
    writeFileSync(join(shard1,'assets/offline/cards/base1-3.png'),png);
    collect();assemble();report=JSON.parse(readFileSync(join(dist,'assets/offline/images-assembly-report.json')));
    assert.equal(report.complete,true);assert.equal(report.verifiedFiles,3);
    writeFileSync(join(dist,'assets/offline/cards/base1-1.png'),'not-an-image');
    assert.throws(assemble);
    report=JSON.parse(readFileSync(join(dist,'assets/offline/images-assembly-report.json')));
    assert.equal(report.complete,false);assert.equal(report.damagedFiles[0].id,'base1-1');
  }finally{rmSync(tmp,{recursive:true,force:true});}
});


test('download validation rejects truncated images with plausible headers',()=>{
  const good=readFileSync(join(root,'assets/icon-192.png'));
  assert.equal(verifiedImage(good),'png');
  assert.equal(verifiedImage(good.subarray(0,good.length-12)),null);
  const fake=Buffer.alloc(400);fake.write('RIFF',0);fake.writeUInt32LE(200,4);fake.write('WEBP',8);
  assert.equal(verifiedImage(fake),null);
});
