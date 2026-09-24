import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateBases,safeId,sniffImage,normalizeExport} from '../scripts/offline-core.mjs';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
test('only safe card IDs can become local filenames',()=>{
  assert.equal(safeId('swsh3-136'),true);
  assert.equal(safeId('exu-!'),true);assert.equal(safeId('exu-%3F'),true);
  for(const bad of ['../x','a/b','', 'x'.repeat(111),'..','exu-%2F','exu-%','exu-?'])assert.equal(safeId(bad),false);
});
test('FR and exact EN image bases and reviewed overrides are prioritized, not guessed',()=>{
  const list=candidateBases({image:'https://assets.tcgdex.net/fr/swsh/swsh3/136'},
    {image:'https://assets.tcgdex.net/en/swsh/swsh3/136'},
    {url:'https://images.pokemontcg.io/swsh3/136.png'},
    {url:'https://images.pokemontcg.io/other/999.png',reviewed:false});
  assert.equal(list.length,5);
  assert.equal(list[0].source,'previously-verified');
  assert.ok(list.some(x=>x.source==='tcgdex-en'));
  assert.ok(!list.some(x=>x.url.includes('/other/')));
});
test('only real image signatures count in a native pack',()=>{
  assert.equal(sniffImage(Buffer.from('<html>not a card</html>'.repeat(30))),null);
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF0000WEBP'),Buffer.alloc(350)])),'webp');
  assert.equal(sniffImage(Buffer.concat([Buffer.from([137,80,78,71]),Buffer.alloc(350)])),'png');
});
test('exported image index preserves exact IDs without exposing collection',()=>{
  const result=normalizeExport({images:{'sv01-1':{url:'https://assets.tcgdex.net/fr/x/1/low.webp'},'../bad':{url:'x'}}});
  assert.deepEqual(Object.keys(result),['sv01-1']);
  assert.ok(!read('app.js').includes("localStorage.removeItem('pv_collection')"));
});
test('bundled app prefers local image pack and local FR catalog',()=>{
  const source=read('app.js');
  assert.match(source,/loadOfflinePack\(\)\.then/);
  assert.match(source,/source:'bundled'/);
  assert.match(source,/if\(path==='fr\/cards'&&offlinePack.catalog\)/);
  assert.match(read('sw.js'),/offline-pack/);
});

test('offline builder emits a portable catalog and verified local image without internet',async()=>{
  const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync}=await import('node:fs');
  const {execFileSync}=await import('node:child_process');
  const {join}=await import('node:path');
  const root=new URL('..',import.meta.url).pathname;
  const tmp=mkdtempSync(join(root,'dist-fixture-'));
  try{
    const images=join(tmp,'input');mkdirSync(images);
    const catalog=join(tmp,'cards.json'),sets=join(tmp,'sets.json'),english=join(tmp,'english.json');
    writeFileSync(catalog,JSON.stringify([{id:'base1-4',name:'Charizard'},{id:'base1-5',name:'Rattata'}]));
    writeFileSync(sets,JSON.stringify([{id:'base1',name:'Base'}]));
    writeFileSync(english,'[]');
    writeFileSync(join(images,'base1-4.webp'),Buffer.concat([Buffer.from('RIFF0000WEBP'),Buffer.alloc(350)]));
    const output=join(tmp,'output');
    execFileSync(process.execPath,[join(root,'scripts/build-offline.mjs'),'--catalog-json',catalog,'--sets-json',sets,'--english-json',english,'--source-dir',images,'--output',output,'--precache-limit','1'],{timeout:15000});
    const report=JSON.parse(readFileSync(join(output,'assets/offline/report.json'),'utf8'));
    assert.equal(report.packed,1);assert.deepEqual(report.missingIds,['base1-5']);
    assert.ok(existsSync(join(output,'assets/offline/cards/base1-4.webp')));
    assert.ok(existsSync(join(output,'app.bundle.js')));
    assert.equal(JSON.parse(readFileSync(join(output,'assets/offline/precache.json'),'utf8')).length,1);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});
