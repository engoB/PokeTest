import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchAlternativeCard, sameNumber, trustedImageUrl, normalizeSet,
  mergeCollections, priceCoverage, PRICE_TTL, cardMatchesType, sortCards
} from '../core.mjs';
import {windowRows} from '../virtual-grid.mjs';

const target={number:'001',englishName:'Pikachu',englishSet:'Scarlet & Violet',printedTotal:198};
const candidate={id:'sv1-1',number:'1',name:'Pikachu',set:{name:'Scarlet & Violet',printedTotal:198},images:{small:'https://images.pokemontcg.io/sv1/1.png',large:'https://images.pokemontcg.io/sv1/1_hires.png'}};
test('matches a secondary image only for the same exact printing',()=>{
  assert.equal(matchAlternativeCard(target,[candidate])?.matchedId,'sv1-1');
  assert.equal(matchAlternativeCard(target,[{...candidate,set:{name:'Paldea Evolved',printedTotal:198}}]),null);
  assert.equal(matchAlternativeCard(target,[{...candidate,name:'Raichu'}]),null);
  assert.equal(matchAlternativeCard(target,[{...candidate,number:'2'}]),null);
  assert.equal(matchAlternativeCard(target,[{...candidate,set:{name:'Scarlet & Violet',printedTotal:199}}]),null);
  assert.equal(matchAlternativeCard(target,[candidate,candidate]),null);
});
test('a missing English name requires matching printed total',()=>{
  assert.equal(matchAlternativeCard({...target,englishName:null,printedTotal:0},[candidate]),null);
  assert.equal(matchAlternativeCard({...target,englishName:null},[candidate])?.matchedId,'sv1-1');
});
test('image hosts are restricted to known HTTPS CDNs',()=>{
  assert.equal(trustedImageUrl('http://images.pokemontcg.io/x.png'),null);
  assert.equal(trustedImageUrl('https://images.pokemontcg.io.evil.example/x.png'),null);
  assert.equal(trustedImageUrl('javascript:alert(1)'),null);
  assert.ok(trustedImageUrl(candidate.images.small));
  assert.ok(sameNumber('TG001','tg1'));
  assert.equal(normalizeSet('Pokémon GO!'),'pokemongo');
  assert.equal(normalizeSet('Scarlet & Violet'),normalizeSet('Scarlet and Violet'));
});
test('import merges safely without deleting existing quantities or doubling identical entries',()=>{
  const original={'sv01-001':3,'swsh3-136':1};
  const imported={'sv01-001':2,'sv01-002':4};
  assert.deepEqual(mergeCollections(original,imported),{'sv01-001':3,'swsh3-136':1,'sv01-002':4});
  assert.deepEqual(original,{'sv01-001':3,'swsh3-136':1});
});
test('price sort and thresholds agree on the same trend and never treat unknown as zero',()=>{
  const cards=[{id:'a-1',name:'A',localId:'001'},{id:'a-2',name:'B',localId:'002'},{id:'a-3',name:'C',localId:'003'},{id:'a-4',name:'D',localId:'004'}];
  const prices={'a-1':{trend:200},'a-2':{trend:60},'a-3':{trend:null},'a-4':{trend:2}};
  const sorted=sortCards(cards,'price-desc',prices);
  assert.deepEqual(sorted.map(c=>c.id),['a-1','a-2','a-4','a-3']);
  assert.deepEqual(sorted.filter(c=>cardMatchesType(c,'over50',Number.isFinite(prices[c.id]?.trend)?prices[c.id].trend:null)).map(c=>c.id),['a-1','a-2']);
});
test('price coverage counts fresh missing quotes separately from unchecked cards',()=>{
  const now=Date.now();
  const cards=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  assert.deepEqual(priceCoverage(cards,{a:{trend:200,fetchedAt:now},b:{trend:null,fetchedAt:now},c:{trend:60,fetchedAt:now-PRICE_TTL-1}},now),
    {total:4,checked:2,quoted:2,missing:1,remaining:2});
});
test('virtual window stays bounded on huge catalogs and reaches the last row',()=>{
  const config={total:100_000,columns:5,rowStride:350,viewportHeight:900,originTop:400};
  const top=windowRows({...config,scrollTop:0});
  assert.equal(top.start,0);assert.ok(top.end<100);
  const bottom=windowRows({...config,scrollTop:7_000_000});
  assert.equal(bottom.end,100_000);assert.ok(bottom.end-bottom.start<100);
  assert.equal(bottom.totalRows,20_000);
  assert.equal(bottom.bottom,0);
});
