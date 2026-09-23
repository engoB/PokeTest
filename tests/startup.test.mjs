import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

test('static index loads the versioned standalone bundle instead of fragile imports',()=>{
  const index=read('index.html');
  assert.match(index,/src="\.\/app\.bundle\.js\?v=3\.1\.0"/);
  assert.doesNotMatch(index,/type="module"/);
  assert.match(index,/window\.__pvBooted/);
});

test('bundled runtime includes image status, collection compatibility and catalog timeout',()=>{
  const bundle=read('app.bundle.js');
  assert.match(bundle,/function imageCoverage\(/);
  assert.match(bundle,/function windowRows\(/);
  assert.match(bundle,/pv_collection/);
  assert.match(bundle,/window\.__pvBooted=true/);
  assert.match(bundle,/controller\.abort\(\)/);
  assert.doesNotMatch(bundle,/^import\s/m);
});

test('PWA caches the versioned bundle and uses network-first for updated code',()=>{
  const sw=read('sw.js');
  assert.match(sw,/pv-v3\.1/);
  assert.match(sw,/app\.bundle\.js\?v=3\.1\.0/);
  assert.match(sw,/networkFirst\(req,SHELL\)/);
});
