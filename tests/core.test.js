import test from 'node:test';
import assert from 'node:assert/strict';
import {validateState,emptyState,safeUrl,filterKits,releaseNumber,normalize} from '../dist/core.js';
import {readFileSync} from 'node:fs';

test('backup validation preserves independent ownership and wishlist, rejects malformed states',()=>{
  const s=emptyState();s.entries['b-123']={owned:true,wishlist:true,status:'Building'};
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
  assert.throws(()=>validateState({...s,entries:{'b-123':{owned:true,wishlist:false,status:'unknown'}}}));
  assert.throws(()=>validateState({...s,entries:JSON.parse('{"__proto__":{"owned":true,"wishlist":false,"status":"Unbuilt"}}')}));
  assert.throws(()=>validateState({...s,customKits:[{id:'c-123',name:'Kit',grade:'HG',scale:'1/144',series:'Gundam',manualUrl:'javascript:alert(1)'}]}));
  assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('https://user:pass@example.com'),'');
});
test('filters combine exact version, ownership, manual availability, grade and status',()=>{
  const kits=[{id:'b-1',name:'RX-78-2 Gundam',nameJa:'ガンダム',grade:'RG',series:'Gundam',scale:'1/144',kind:'Kit',manualUrl:'https://example.com'}, {id:'b-2',name:'RX-78-2 Gundam',nameJa:'ガンダム',grade:'MG',series:'Gundam',scale:'1/100',kind:'Kit'}, {id:'b-3',name:'Action base',nameJa:'',grade:'Other',series:'Other',scale:'',kind:'Accessory'}];
  const entries={'b-1':{owned:true,wishlist:false,status:'Building'},'b-2':{owned:false,wishlist:true,status:'Unbuilt'}};
  const f={view:'catalog',query:'RX 78',grade:'All kits',series:'',status:'',accessories:false};
  assert.equal(filterKits(kits,entries,f).length,2);
  assert.deepEqual(filterKits(kits,entries,{...f,view:'collection',status:'Building'}).map(k=>k.id),['b-1']);
  assert.deepEqual(filterKits(kits,entries,{...f,view:'wishlist'}).map(k=>k.id),['b-2']);
  assert.deepEqual(filterKits(kits,entries,{...f,manualOnly:true}).map(k=>k.id),['b-1']);
  assert.equal(filterKits(kits,entries,{...f,grade:'MG',manualOnly:true}).length,0);
  assert.equal(releaseNumber({release:'2024年8月10日発売'}),202408);
  assert.equal(normalize('Hi-ν Gundam'),normalize('Hi Nu Gundam'));
});

test('catalog has unique stable IDs, safe links and accurate coverage totals',()=>{
 const {kits,meta}=JSON.parse(readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8'));
 assert.equal(new Set(kits.map(k=>k.id)).size,kits.length);
 for(const k of kits){
  assert.match(k.id,/^[bmd]-[a-zA-Z0-9_-]+$/);assert.ok(k.name);
  for(const key of ['manualUrl','communityUrl','productUrl','image'])if(k[key])assert.ok(safeUrl(k[key]),`${k.id}: ${key}`);
 }
 assert.equal(meta.totalRecords,kits.length);
 assert.equal(meta.linkedInstructions,kits.filter(k=>k.manualUrl||k.communityUrl).length);
 const allOwned=emptyState();for(const k of kits)allOwned.entries[k.id]={owned:true,wishlist:false,status:'Unbuilt'};
 assert.equal(Object.keys(validateState(allOwned).entries).length,kits.length);
});
