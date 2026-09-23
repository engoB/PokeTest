import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';
import {mergeCatalogue, mergeSets, setForCard, detailShard, DETAIL_SHARDS, trustedIndex} from '../scripts/catalog-core.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
test('complete inventory keeps unique FR entries and EN-only printings, including compound set IDs',()=>{
  const cards=mergeCatalogue(
    [{id:'2019sm-fr-2',name:'Nom FR',image:null}],
    [{id:'2019sm-fr-2',name:'English',image:'https://assets.tcgdex.net/en/x/2'}, {id:'future1-1',name:'English only'}]
  );
  assert.equal(cards.length,2);
  assert.equal(cards.find(c=>c.id==='2019sm-fr-2').name,'Nom FR');
  assert.equal(cards.find(c=>c.id==='2019sm-fr-2').image,'https://assets.tcgdex.net/en/x/2');
  assert.equal(cards.find(c=>c.id==='future1-1').language,'en');
  const sets=mergeSets([{id:'2019sm-fr',name:'Set FR'}],[{id:'2019sm-fr',name:'Set EN'},{id:'future1',name:'Set EN only'}]);
  assert.equal(setForCard('2019sm-fr-2',sets),'2019sm-fr');
  assert.equal(setForCard('future1-1',sets),'future1');
  assert.ok(detailShard('future1-1')>=0&&detailShard('future1-1')<DETAIL_SHARDS);
});

test('index contains only trusted known HTTPS hosts and exact card IDs',()=>{
  const ix=trustedIndex({images:{'future1-1':{url:'https://assets.tcgdex.net/en/x/1/low.webp',checkedAt:1790000000000},'../oops':{url:'https://assets.tcgdex.net/a.png',checkedAt:1790000000000},'base1-1':{url:'http://example.com/not-safe.png',checkedAt:1790000000000}}});
  assert.deepEqual(Object.keys(ix),['future1-1']);
});

test('offline full catalogue has ALL ids and details, reports missing image URLs separately',()=>{
  const temp=mkdtempSync(join(root,'dist-catalog-fixture-'));
  try {
    const input=join(temp,'input'),cardsDir=join(input,'cards'),setsDir=join(input,'sets');
    mkdirSync(cardsDir,{recursive:true});mkdirSync(setsDir,{recursive:true});
    const write=(name,value)=>writeFileSync(join(input,name),JSON.stringify(value));
    write('fr-cards.json',[{id:'base1-1',name:'French card'},{id:'base1-2',name:'Deuxième carte'}]);
    write('en-cards.json',[{id:'base1-1',name:'English card'},{id:'future1-1',name:'English only'}]);
    write('fr-sets.json',[{id:'base1',name:'Base Set'}]);
    write('en-sets.json',[{id:'base1',name:'Base Set'},{id:'future1',name:'Future'}]);
    write('index.json',{format:'pokevault-image-index-v1',images:{'base1-1':{url:'https://assets.tcgdex.net/en/x/base1/1/low.webp',source:'tcgdex-en',checkedAt:1790000000000}}});
    for(const id of ['base1-1','base1-2','future1-1'])writeFileSync(join(cardsDir,`${id}.json`),JSON.stringify({id,name:id,pricing:{cardmarket:{trend:3.50}}}));
    for(const [id,cards] of [['base1',[{id:'base1-1'},{id:'base1-2'}]],['future1',[{id:'future1-1'}]]])writeFileSync(join(setsDir,`${id}.json`),JSON.stringify({id,cards}));
    const output=join(temp,'dist');
    const args=['scripts/build-full-catalog.mjs','--fr-cards',join(input,'fr-cards.json'),'--en-cards',join(input,'en-cards.json'),'--fr-sets',join(input,'fr-sets.json'),'--en-sets',join(input,'en-sets.json'),'--fixture-details-dir',cardsDir,'--fixture-set-details-dir',setsDir,'--index',join(input,'index.json'),'--output',output,'--strict'];
    execFileSync(process.execPath,args,{cwd:root,timeout:20000});
    const offline=join(output,'assets/offline'),report=JSON.parse(readFileSync(join(offline,'catalogue-report.json'),'utf8'));
    assert.equal(report.uniqueCardIds,3);assert.equal(report.uniqueSets,2);assert.equal(report.cardDetailsAvailable,3);
    assert.equal(report.detailsComplete,true);assert.equal(report.verifiedImageUrlsInIndex,1);assert.equal(report.notInIndex,2);
    const sets=JSON.parse(readFileSync(join(offline,'sets-detailed.json'),'utf8'));
    assert.deepEqual(sets.base1.cards.map(c=>c.id),['base1-1','base1-2']);
    assert.deepEqual(sets.future1.cards.map(c=>c.id),['future1-1']);
    assert.ok(existsSync(join(output,'index.html')));assert.ok(existsSync(join(output,'assets/card-back.svg')));
    const manifest=JSON.parse(readFileSync(join(offline,'details-manifest.json'),'utf8'));
    assert.equal(manifest.detailsComplete,true);
    assert.equal(manifest.files.length,DETAIL_SHARDS);
    assert.equal(manifest.files.reduce((n,file)=>n+Object.keys(JSON.parse(readFileSync(join(output,file.replace(/^\.\//,'')),'utf8'))).length,0),3);
    // An incomplete build must not be mistakenly declared a fully available offline catalogue.
    rmSync(join(cardsDir,'future1-1.json'));
    const incomplete=spawnSync(process.execPath,[...args.slice(0,-3),'--output',join(temp,'dist-incomplete'),'--strict'],{cwd:root,encoding:'utf8',timeout:20000});
    assert.equal(incomplete.status,2);
  } finally {rmSync(temp,{recursive:true,force:true});}
});
