import test from 'node:test';
import assert from 'node:assert/strict';
import {imageState,imageCoverage,reconcileIds} from '../image-state.mjs';
import {mergeCollections} from '../core.mjs';

test('candidate image URL is not counted as verified before a real load',()=>{
 const records=new Map(),transient=new Map();
 assert.equal(imageState('card',records,transient),'pending');
 transient.set('card','checking');
 assert.equal(imageState('card',records,transient),'checking');
 records.set('card',{source:'tcgdex-fr',url:'https://assets.tcgdex.net/a/low.webp',checkedAt:Date.now()});
 assert.equal(imageState('card',records,transient),'found');
});
test('a negative result expires and temporary errors do not count as verified',()=>{
 const now=Date.now();
 const records=new Map([['a',{source:'missing',verificationVersion:3,missingUntil:now+1000}],['b',{source:'missing',verificationVersion:3,missingUntil:now-1}]]);
 const transient=new Map([['c','error'],['d','checking']]);
 assert.deepEqual(imageCoverage(['a','b','c','d','e'].map(id=>({id})),records,transient,now),
   {total:5,found:0,missing:1,checking:1,error:1,pending:2,checked:1});
 assert.equal(imageState('a',records,transient,now+1001),'pending');
});
test('background progress distinguishes verified, active and unstarted cards',()=>{
 const now=Date.now();
 const records=new Map([['a',{source:'tcgdex-en',checkedAt:now}],['b',{source:'missing',verificationVersion:3,missingUntil:now+86400000}]]);
 const transient=new Map([['c','checking'],['d','error']]);
 assert.deepEqual(imageCoverage(['a','b','c','d','e'].map(id=>({id})),records,transient,now),
   {total:5,found:1,missing:1,checking:1,error:1,pending:1,checked:2});
});
test('virtual reconciliation retains the same tiles instead of replacing images',()=>{
 assert.deepEqual(reconcileIds(['a','b','c','d'],['c','d','e','f']),{retained:['c','d'],added:['e','f'],removed:['a','b']});
});
test('image cache updates cannot affect the existing collection',()=>{
 const existing={'sv01-001':3,'swsh3-136':1};
 const merged=mergeCollections(existing,{'sv01-001':2});
 assert.deepEqual(merged,existing);
});

test('old v2 negative cache entries are rechecked instead of being treated as confirmed misses',()=>{
 const now=Date.now();const records=new Map([['old',{source:'missing',missingUntil:now+86400000}]]);
 assert.equal(imageState('old',records,new Map(),now),'pending');
});
