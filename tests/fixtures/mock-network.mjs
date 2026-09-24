// Deterministic network simulation. No external calls or API credentials.
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const image=readFileSync(join(root,'assets/icon-192.png'));
globalThis.fetch=async function mockFetch(input){
  const url=new URL(String(input));
  if(url.hostname==='api.tcgdex.net'&&url.pathname==='/v2/en/sets/base1')return new Response(JSON.stringify({id:'base1',name:'Base',serie:{id:'base'}}),{status:200,headers:{'content-type':'application/json'}});
  if(url.hostname==='api.tcgdex.net'&&url.pathname.startsWith('/v2/'))return new Response('Not found',{status:404});
  if(url.hostname==='api.pokemontcg.io')return new Response(JSON.stringify({data:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(url.hostname==='images.pokemontcg.io')return new Response('Quota',{status:429,headers:{'retry-after':'3600'}});
  if(url.hostname==='assets.tcgdex.net'){
    if(url.pathname==='/en/base/base1/001/low.webp')return new Response(image,{status:200,headers:{'content-type':'image/png'}});
    if(url.pathname==='/fr/base/base1/003/low.webp')return new Response(image,{status:200,headers:{'content-type':'image/png'}});
    return new Response('Missing',{status:404});
  }
  throw Error('Unexpected external request: '+url);
};
