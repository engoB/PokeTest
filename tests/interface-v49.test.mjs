import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHarvestIndex,imageCoverage} from '../image-state.mjs';
import {safeCardId,trustedImageUrl} from '../core.mjs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('GitHub URL index is validated and remains separate from browser-verified images',()=>{
  const parsed=parseHarvestIndex({format:'pokevault-image-index-v1',exportedAt:'2026-09-25T00:00:00Z',images:{
    'base1-1':{url:'https://images.pokemontcg.io/base1/1.png',checkedAt:1790294400000},
    'base1-2':{url:'https://assets.tcgdex.net/fr/base/base1/2/low.webp',checkedAt:1790294400000},
    '../bad':{url:'https://images.pokemontcg.io/base1/3.png'},
    'base1-3':{url:'https://evil.example/steal',checkedAt:1790294400000}
  }},safeCardId,trustedImageUrl);
  assert.equal(parsed.images.size,2);
  assert.ok(parsed.images.has('base1-1'));
  assert.ok(!parsed.images.has('base1-3'));
  const local=new Map([['base1-1',{source:'tcgdex-fr',url:'https://images.pokemontcg.io/base1/1.png',checkedAt:1}]]);
  const stats=imageCoverage([{id:'base1-1'},{id:'base1-2'},{id:'base1-3'}],local,new Map());
  assert.equal(stats.found,1); // A GitHub URL is not proof the browser loaded the image.
  assert.throws(()=>parseHarvestIndex({format:'wrong',images:{}},safeCardId,trustedImageUrl));
  assert.throws(()=>parseHarvestIndex({format:'pokevault-image-index-v1',images:{}},safeCardId,trustedImageUrl));
});

test('v4.9 displays both counters and uses the scheduled metadata branch with offline fallbacks',()=>{
  const html=read('index.html'),app=read('app.js'),sw=read('sw.js');
  for(const id of ['image-harvest-progress','image-harvest-bar','image-harvest-source','image-progress'])assert.ok(html.includes(`id="${id}"`),id);
  assert.match(app,/raw\.githubusercontent\.com\/engoB\/PokeTest\/pokevault-image-data\/index\.json/);
  assert.match(app,/pokevault-harvest-index-v1/);
  assert.match(app,/inputs\/pokevault-index-visuels\.json\?v=4\.9\.0/);
  assert.match(app,/if\(harvested\)candidates\.push\(harvested\)/);
  assert.match(app,/harvestIndex\.has\(card\.id\)/);
  assert.match(sw,/pv-v5\.0/);
  assert.match(html,/app\.bundle\.js\?v=5\.0\.0/);
  assert.doesNotMatch(app,/localStorage\.removeItem\('pv_collection'\)/);
});

test('new gold/red/navy icon is versioned in the browser, manifest and service worker',()=>{
  const html=read('index.html'),manifest=JSON.parse(read('manifest.webmanifest')),sw=read('sw.js'),svg=read('assets/icon.svg');
  assert.match(html,/icon\.svg\?v=5\.0\.0/);
  assert.match(html,/favicon-32\.png\?v=5\.0\.0/);
  assert.equal(manifest.theme_color,'#0b1733');
  assert.ok(manifest.icons.every(icon=>icon.src.includes('?v=4.9.0')));
  assert.match(sw,/favicon-32\.png\?v=5\.0\.0/);
  assert.match(svg,/#e7bd62/);
  assert.match(svg,/#b82f42/);
});
