// No npm dependencies. Ship the generated bundle with the static site.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const helpers=['core.mjs','db.mjs','virtual-grid.mjs','image-state.mjs'];
const parts=helpers.map(name=>readFileSync(join(root,name),'utf8').replace(/^export\s+/gm,''));
const app=readFileSync(join(root,'app.js'),'utf8').replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm,'');
if(/^import\s/m.test(app)||/^export\s/m.test(app))throw new Error('Unsupported import/export in app.js');
const bundle=`/* PokéVault 5.1 self-contained browser bundle. Generated with node scripts/build.mjs. */\n(()=>{\n'use strict';\n${[...parts,app].join('\n\n')}\n})();\n`;
const dest=join(root,'app.bundle.js');
if(process.argv.includes('--check')){
  if(readFileSync(dest,'utf8')!==bundle){console.error('app.bundle.js is outdated; run node scripts/build.mjs');process.exitCode=1;}
  else console.log('app.bundle.js is up to date');
}else{writeFileSync(dest,bundle);console.log('Built app.bundle.js');}
