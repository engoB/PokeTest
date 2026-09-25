import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePrice,selectPriceVariant,restorePrice,suggestCards,cardmarketPurchaseLink,targetedCardmarketSearch} from '../core.mjs';
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
test('separates normal, holo and reverse prices without silently mixing finishes',()=>{
  const quote=parsePrice({pricing:{cardmarket:{unit:'EUR',trend:1.5,avg30:2.3,'trend-holo':15,'avg30-holo':16,'trend-reverse-holo':4,updated:1780000000000}}});
  assert.equal(quote.trend,null);assert.equal(quote.selectedVariant,null);assert.equal(quote.quotes.length,3);
  assert.equal(selectPriceVariant(quote,'holo').trend,15);
  assert.equal(selectPriceVariant(quote,'reverse').trend,4);
  assert.equal(selectPriceVariant(quote,'normal').trend,1.5);
  assert.equal(selectPriceVariant(quote,'unknown').trend,null);
});
test('migrates unverified old cached prices to unknown instead of displaying a misleading quote',()=>{
  const old=restorePrice({trend:999,avg30:500,fetchedAt:Date.now()});
  assert.equal(old.trend,null);assert.equal(old.fetchedAt,0);
  const valid=restorePrice(selectPriceVariant(parsePrice({pricing:{cardmarket:{trend:2,'trend-holo':12}}}),'holo'));
  assert.equal(valid.trend,12);assert.equal(valid.selectedVariant,'holo');
});
test('search suggestions are instantaneous, accent-insensitive, bounded and prioritize starts-with',()=>{
  const cards=[{id:'base1-4',name:'Dracaufeu',localId:'004'},{id:'neo-1',name:'Électhor',localId:'001'},{id:'neo-2',name:'Méga Dracaufeu',localId:'002'}];
  assert.deepEqual(suggestCards(cards,'drac',2).map(x=>x.id),['base1-4','neo-2']);
  assert.deepEqual(suggestCards(cards,'elector').map(x=>x.id),['neo-1']);
  assert.deepEqual(suggestCards(cards,'').map(x=>x.id),[]);
});
test('no unverified Cardmarket direct URL; broad search avoids overconstraining to zero results',()=>{
  const card={id:'base1-4',name:'Dracaufeu',localId:'004'};
  const link=cardmarketPurchaseLink(card,null,'Set de Base');
  assert.equal(link.direct,false);assert.equal(decodeURIComponent(link.url.split('=')[1]),'Dracaufeu');
  assert.match(decodeURIComponent(targetedCardmarketSearch(card,'Set de Base')),/Set de Base 004/);
});
test('interface exposes preferences, live list, distinct buy section and no individual image-search UI',()=>{
  const html=read('index.html'),app=read('app.js'),css=read('style.css');
  for(const id of ['options-toggle','option-animation','option-prices','search-suggestions','dialog-buy','dialog-buy-exact','price-variant'])assert.ok(html.includes(`id="${id}"`),id);
  assert.doesNotMatch(html,/id="retry-image"|id="research-toggle"/);
  assert.match(app,/updateSuggestions\(\);refreshResults\(\)/);
  assert.match(app,/localStorage\.setItem\('pv_options_v1'/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.pv-prices-off \.price-panel/);
});
