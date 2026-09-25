import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GitHub Pages v5.1 hosts only rights-cleared images, on demand',()=>{
 const app=read('app.js'),sw=read('sw.js'),config=JSON.parse(read('image-library-config.json'));
 const manifest=JSON.parse(read('assets/library/manifest.json'));
 assert.equal(config.baseUrl,'./assets/library/');
 assert.equal(manifest.totalImages,0);
 assert.match(app,/new URL\(config.baseUrl,document.baseURI\)/);
 assert.match(app,/const owned=imageLibrary.images.get\(id\)/);
 assert.match(app,/if\(owned\)candidates.push\(owned\)/);
 assert.match(app,/imageLibrary.images.has\(card.id\)\|\|state.harvestIndex.has\(card.id\)/);
 assert.match(app,/new URL\('manifest.json',base\)/);
 assert.match(sw,/pv-v5\.1/);
 assert.match(sw,/networkFirst\(req,SHELL\)/);
 assert.match(sw,/assets\/library\/cards\//);
 assert.match(read('index.html'),/app\.bundle\.js\?v=5\.1\.0/);
});
test('GitHub publisher requires rights and commits files before requesting Pages rebuild',()=>{
 const script=read('scripts/publish-image-library.mjs'),workflow=read('.github/workflows/publish-image-library.yml');
 assert.match(script,/--rights-confirmed/);
 assert.match(script,/createHash\('sha256'\)/);
 assert.match(script,/maxTotalBytes>650\*1024\*1024/);
 assert.doesNotMatch(workflow,/AWS_ACCESS_KEY_ID|S3_BUCKET/);
 assert.ok(workflow.indexOf('git push origin HEAD:main')<workflow.indexOf('pages/builds'));
 assert.match(workflow,/rights_confirmed == true/);
});
test('finish selection appears only inside the opened card',()=>{
 const app=read('app.js'),html=read('index.html');
 const catalog=html.split('<section id="catalog"')[1].split('<section id="guide"')[0];
 assert.doesNotMatch(catalog,/finition/i);
 const grid=app.slice(app.indexOf('function cardMarkup'),app.indexOf('function updateTileQuantity'));
 assert.doesNotMatch(grid,/Choisir finition/);
 assert.match(html,/id="price-variant-row"/);
 assert.match(app,/function updateDialogPrice\(id\)/);
 assert.match(app,/new Option\('Choisir la finition…',''\)/);
});
