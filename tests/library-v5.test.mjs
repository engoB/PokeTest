import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('v5 uses owner-hosted image URLs before external sources',()=>{
 const app=read('app.js');
 assert.match(app,/const owned=imageLibrary.images.get\(id\)/);
 assert.match(app,/if\(owned\)candidates.push\(owned\)/);
 assert.match(app,/imageLibrary.images.has\(card.id\)\|\|state.harvestIndex.has\(card.id\)/);
 assert.match(app,/new URL\('manifest.json',base\)/);
 assert.match(read('index.html'),/app.bundle.js\?v=5.0.0/);
 assert.match(read('sw.js'),/pv-v5.0/);
 assert.equal(JSON.parse(read('image-library-config.json')).baseUrl,'');
});
test('publisher is rights-gated and uploads images before manifest',()=>{
 const script=read('scripts/publish-image-library.mjs'),workflow=read('.github/workflows/publish-image-library.yml');
 assert.match(script,/--rights-confirmed/);
 assert.match(script,/createHash\('sha256'\)/);
 assert.ok(workflow.indexOf('aws s3 sync image-library-public/cards')<workflow.indexOf('aws s3 cp image-library-public/manifest.json'));
});
