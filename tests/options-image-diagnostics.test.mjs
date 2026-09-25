import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('image sync diagnostics are only inside the Options panel, not the catalog',()=>{
 const html=read('index.html');
 const options=html.slice(html.indexOf('id="options-panel"'),html.indexOf('id="install-btn"'));
 const catalog=html.slice(html.indexOf('id="catalog"'),html.indexOf('id="grid-origin"'));
 for(const id of ['image-coverage','image-harvest-progress','image-harvest-bar','image-harvest-source','image-progress','image-next','image-all','image-stop']){
   assert.ok(options.includes('id="'+id+'"'),id+' must remain accessible from Options');
   assert.ok(!catalog.includes('id="'+id+'"'),id+' must not appear in the catalog');
 }
 assert.match(options,/<details id="image-diagnostics"/);
 assert.match(options,/Synchronisation automatique/);
 assert.match(read('style.css'),/\.options-panel\{width:min\(470px/);
 assert.match(read('sw.js'),/pv-v5\.1/);
 assert.doesNotMatch(read('style.css'),/\.pv-prices-off \.price-coverage,/);
});
