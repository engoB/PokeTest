import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {cardmarketPurchaseLink,safeCardmarketProductUrl,imageResearchLinks,safeCardId} from '../core.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const run=(name,args)=>execFileSync(process.execPath,[join(root,'scripts',name),...args],{cwd:root,timeout:20000});
test('Cardmarket purchase link uses exact supplied product URL or clearly labelled search',()=>{
  const card={id:'base1-4',name:'Dracaufeu',localId:'004'};
  const exact='https://www.cardmarket.com/fr/Pokemon/Products/Singles/Base-Set/Charizard-V1';
  assert.deepEqual(cardmarketPurchaseLink(card,{pricing:{cardmarket:{url:exact}}}),{url:exact,direct:true});
  assert.equal(cardmarketPurchaseLink(card,null,'',exact).direct,true);
  const fallback=cardmarketPurchaseLink(card,{set:{name:'Set de Base'}});
  assert.equal(fallback.direct,false);assert.match(decodeURIComponent(fallback.url),/Dracaufeu Set de Base 004/);
  for(const bad of ['javascript:alert(1)','https://evil.com/fr/Pokemon/Products/Singles/x','https://www.cardmarket.com.evil.test/fr/Pokemon/Products/Singles/x','https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=anything'])assert.equal(safeCardmarketProductUrl(bad),null);
});
test('six free research links are site-specific, and exact special IDs are supported',()=>{
  const links=imageResearchLinks({id:'exu-%3F',name:'Zarbi ?',localId:'%3F'},'Unseen Forces','Unown ?');
  assert.equal(links.length,6);for(const link of links){assert.equal(new URL(link.url).hostname,'www.google.com');assert.ok(decodeURIComponent(link.url).includes('site:'+link.domain));}
  assert.equal(safeCardId('exu-!'),true);assert.equal(safeCardId('exu-%3F'),true);assert.equal(safeCardId('exu-%2F'),false);
  const app=readFileSync(join(root,'app.js'),'utf8'),html=readFileSync(join(root,'index.html'),'utf8');
  for(const id of ['card-search-clear','set-search-clear','dialog-buy','research-toggle'])assert.ok(html.includes(`id="${id}"`));
  assert.match(app,/function clearSearch\(id\)/);assert.match(app,/updateDialogBuy\(id,detail\)/);
  assert.match(app,/encodeURIComponent\(id\)/);
});
test('research audit includes every unresolved FR ID, no EN-only cards, and six links',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'pv-research-'));
  try{
    const fr=join(tmp,'fr.json'),en=join(tmp,'en.json'),index=join(tmp,'index.json'),state=join(tmp,'state.json'),out=join(tmp,'out');
    writeFileSync(fr,JSON.stringify([{id:'base1-1',name:'Alakazam',localId:'001'},{id:'base1-2',name:'Blastoise',localId:'002'},{id:'exu-%3F',name:'Zarbi ?',localId:'%3F'}]));
    writeFileSync(en,JSON.stringify([{id:'base1-1',name:'Alakazam'},{id:'base1-2',name:'Blastoise'},{id:'en-only-1',name:'Only EN'}]));
    writeFileSync(index,JSON.stringify({images:{'base1-1':{url:'https://assets.tcgdex.net/en/base/base1/001/low.webp'}}}));
    writeFileSync(state,JSON.stringify({cards:{'base1-2':{status:'retry',reason:'legacy-quota-exhausted'}}}));
    run('image-research.mjs',['--fr-cards',fr,'--en-cards',en,'--index',index,'--state',state,'--output',out]);
    const report=JSON.parse(readFileSync(join(out,'report.json')));
    assert.equal(report.catalogueTotal,3);assert.equal(report.covered,1);assert.equal(report.unresolved,2);assert.equal(report.statusCounts.retry,1);
    assert.equal(report.entries.find(c=>c.id==='exu-%3F').sourceLinks.length,6);
    assert.ok(!report.entries.some(c=>c.id==='en-only-1'));
    const html=readFileSync(join(out,'recherche.html'),'utf8');assert.match(html,/Pokécardex/);assert.match(html,/id="manual-form"/);assert.match(html,/id="import-manual"/);
    const browserScript=html.match(/<script>([\s\S]*?)<\/script>/)[1];writeFileSync(join(tmp,'browser-script.js'),browserScript);execFileSync(process.execPath,['--check',join(tmp,'browser-script.js')]);
    assert.equal(JSON.parse(readFileSync(join(out,'manual-images.template.json'))).images['base1-2'].reviewedExactCard,false);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('local personal importer rejects unreviewed, wrong-host and invalid scans; preserves partial mode',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'pv-personal-'));
  try{
    const fr=join(tmp,'fr.json'),images=join(tmp,'images'),manifest=join(tmp,'manual.json'),dist=join(tmp,'dist');mkdirSync(images);mkdirSync(join(dist,'assets/offline'),{recursive:true});writeFileSync(join(dist,'assets/offline/images.json'),JSON.stringify({version:1,mode:'sealed',images:{'base1-2':{file:'./assets/offline/cards/base1-2.png',source:'stale'}}}));
    writeFileSync(fr,JSON.stringify([{id:'base1-1'},{id:'base1-2'},{id:'exu-%3F'}]));
    copyFileSync(join(root,'assets/icon-192.png'),join(images,'base1-1.png'));
    copyFileSync(join(root,'assets/icon-192.png'),join(images,'exu-%3F.png'));
    writeFileSync(join(images,'base1-2.png'),'not a real image');
    writeFileSync(manifest,JSON.stringify({format:'pokevault-manual-images-v1',images:{
      'base1-1':{file:'base1-1.png',source:'pkmncards',referenceUrl:'https://pkmncards.com/card/x',reviewedExactCard:true},
      'base1-2':{file:'base1-2.png',source:'pokellector',referenceUrl:'https://pokellector.com/x',reviewedExactCard:true},
      'exu-%3F':{file:'exu-%3F.png',source:'personal',reviewedExactCard:true},
      'fake-1':{file:'fake-1.png',source:'personal',reviewedExactCard:true}
    }}));
    const result=spawnSync(process.execPath,[join(root,'scripts/import-personal-images.mjs'),'--catalog',fr,'--manifest',manifest,'--images-dir',images,'--dist',dist],{encoding:'utf8',timeout:20000});
    assert.equal(result.status,2,result.stderr); // two valid imports, two explicit rejects
    const report=JSON.parse(readFileSync(join(dist,'assets/offline/personal-import-report.json')));
    assert.equal(report.imported,2);assert.equal(report.rejected.length,2);assert.equal(report.staleExisting.length,1);assert.equal(report.stillMissing,1);
    const pack=JSON.parse(readFileSync(join(dist,'assets/offline/images.json')));
    assert.equal(pack.mode,'partial');assert.equal(pack.images['exu-%3F'].file,'./assets/offline/cards/exu-%253F.png');
    assert.ok(existsSync(join(dist,'assets/offline/cards/exu-%3F.png')));
    // An unreviewed record never becomes a local image.
    writeFileSync(manifest,JSON.stringify({format:'pokevault-manual-images-v1',images:{'base1-2':{file:'base1-2.png',source:'personal',reviewedExactCard:false}}}));
    run('import-personal-images.mjs',['--catalog',fr,'--manifest',manifest,'--images-dir',images,'--dist',dist]);
    assert.equal(JSON.parse(readFileSync(join(dist,'assets/offline/personal-import-report.json'))).imported,0);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});
