// Fully deterministic free-API batch fixture; no external requests.
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const image=readFileSync(join(root,'assets/icon-192.png'));
globalThis.fetch=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='api.tcgdex.net')return new Response('Not found',{status:404});
  if(url.hostname==='api.pokemontcg.io'){
    const q=url.searchParams.get('q')||'';
    if(q==='set.name:"Base"'&&url.searchParams.get('pageSize')==='250'){
      return Response.json({data:[
        {id:'base1-1',name:'Alakazam',number:'1',set:{name:'Base',printedTotal:102},images:{small:'https://images.pokemontcg.io/base1/1.png',large:'https://images.pokemontcg.io/base1/1.png'}},
        {id:'base1-2',name:'Venusaur',number:'2',set:{name:'Base',printedTotal:102},images:{small:'https://images.pokemontcg.io/base1/2.png',large:'https://images.pokemontcg.io/base1/2.png'}}
      ],totalCount:2});
    }
    throw Error('Unexpected per-card legacy API query: '+url);
  }
  if(url.hostname==='images.pokemontcg.io')return new Response(image,{status:200,headers:{'content-type':'image/png'}});
  if(url.hostname==='assets.tcgdex.net')return new Response('Not found',{status:404});
  throw Error('Unexpected external request: '+url);
};
