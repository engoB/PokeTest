import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,escapeHtml,parsePrice,restorePrice,selectPriceVariant,readCollection,imageUrls,cardMatchesType,sortCards,formatEuro} from '../core.mjs';
test('accent-insensitive and common phonetic search',()=>{assert.equal(normalize(' Électôr '),'electhor');assert.equal(normalize('ELECTOR'),'electhor');});
test('remote names and attributes are escaped',()=>assert.equal(escapeHtml(`<img src=x onerror='boom'>&`),'&lt;img src=x onerror=&#39;boom&#39;&gt;&amp;'));
test('reads current TCGdex Cardmarket schema and handles a free card',()=>{const price=parsePrice({pricing:{cardmarket:{unit:'EUR',trend:0,avg30:.55,low:.1,updated:'2026-09-22'}}});assert.equal(price.trend,0);assert.equal(price.avg30,.55);assert.equal(parsePrice({pricing:{cardmarket:{unit:'USD',trend:12}}}),null);});
test('keeps legacy trendPrice compatibility',()=>assert.equal(parsePrice({cardmarket:{prices:{trendPrice:3.5,lowPrice:2}}}).trend,3.5));
test('validates import and removes invalid quantities / IDs',()=>{assert.deepEqual(readCollection({'sv01-001':2,'<script>':1,'fake':-5,'other':'3','huge':10001}),{'sv01-001':2});});
test('images only use explicit TCGdex asset URLs',()=>{assert.deepEqual(imageUrls('https://assets.tcgdex.net/fr/swsh/swsh3/136'),['https://assets.tcgdex.net/fr/swsh/swsh3/136/low.webp','https://assets.tcgdex.net/fr/swsh/swsh3/136/low.png']);assert.deepEqual(imageUrls('https://unknown.example/card'),[]);});
test('price filtering does not turn missing prices into zeros',()=>{assert.equal(cardMatchesType({name:'Pikachu'},'over10',null),false);assert.equal(cardMatchesType({name:'Pikachu'},'over10',12),true);});
test('stable numeric sorting with unknown prices at the end',()=>{const cards=[{id:'x-10',name:'A',localId:'010'},{id:'x-2',name:'B',localId:'002'},{id:'x-3',name:'C',localId:'003'}];assert.deepEqual(sortCards(cards,'price-desc',{'x-2':{trend:4},'x-3':{trend:0}}).map(c=>c.id),['x-2','x-3','x-10']);assert.deepEqual(sortCards(cards,'number',{}).map(c=>c.id),['x-2','x-3','x-10']);});
test('EUR formatting is French',()=>assert.match(formatEuro(10.5),/10,50/));
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
test('manifest declares present 192px and 512px PNG icons',()=>{const manifest=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',root),'utf8'));assert.equal(manifest.display,'standalone');for(const size of [192,512]){const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}`);assert.ok(icon);const bytes=fs.readFileSync(new URL(icon.src,root));assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}});
test('app shell assets listed by service worker exist',()=>{const shell=fs.readFileSync(new URL('sw.js',root),'utf8');const match=shell.match(/const APP_FILES=\[([^\]]+)\]/);assert.ok(match);for(const source of match[1].matchAll(/'([^']+)'/g)){assert.ok(fs.existsSync(new URL(source[1],root)),`${source[1]} missing`);}});

test('standard quote is the default even when holo and reverse are available',()=>{
 const p=parsePrice({pricing:{cardmarket:{unit:'EUR',trend:3.5,'trend-holo':9,'trend-reverse-holo':5,avg30:3.2}}});
 assert.equal(p.selectedVariant,'normal');assert.equal(p.trend,3.5);assert.equal(p.avg30,3.2);
 assert.deepEqual(p.quotes.map(q=>q.id),['normal','holo','reverse']);
});
test('explicit holo selection survives cache restoration and updated quotes',()=>{
 const p=parsePrice({pricing:{cardmarket:{trend:3,'trend-holo':8}}});
 const holo=selectPriceVariant(p,'holo');
 assert.equal(holo.trend,8);
 const restored=restorePrice(JSON.parse(JSON.stringify(holo)));
 assert.equal(restored.selectedVariant,'holo');assert.equal(restored.trend,8);
});
test('legacy unselected and stale cached variants restore the standard quote',()=>{
 const p=parsePrice({pricing:{cardmarket:{trend:2,'trend-holo':7}}});
 assert.equal(restorePrice({...p,selectedVariant:null,trend:null}).selectedVariant,'normal');
 assert.equal(restorePrice({...p,selectedVariant:'retired',trend:null}).trend,2);
});
test('if standard is absent, show the actual available finish; never invent a price',()=>{
 const holo=parsePrice({pricing:{cardmarket:{'trend-holo':6,'trend-reverse-holo':4}}});
 assert.equal(holo.selectedVariant,'holo');assert.equal(holo.trend,6);
 const reverse=parsePrice({pricing:{cardmarket:{'trend-reverse-holo':0}}});
 assert.equal(reverse.selectedVariant,'reverse');assert.equal(reverse.trend,0);
 assert.equal(parsePrice({pricing:{cardmarket:{unit:'EUR'}}}),null);
});
test('standard with 30-day average only remains selected without inventing a trend',()=>{
 const p=parsePrice({pricing:{cardmarket:{avg30:4,'trend-holo':8}}});
 assert.equal(p.selectedVariant,'normal');assert.equal(p.trend,null);assert.equal(p.avg30,4);
});
