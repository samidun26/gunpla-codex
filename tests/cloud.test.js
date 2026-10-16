import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validateState} from '../dist/core.js';
import {collectionDelta,applyCollectionDelta,createCloudStore} from '../dist/cloud.js';
import {publicConfiguration} from '../api/config.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const owned={owned:true,wishlist:false,status:'Unbuilt'};
const kit={id:'c-example',name:'My Gundam',grade:'HG',scale:'1/144',series:'Gundam',manualUrl:''};

function fakeDatabase() {
  const db={state:emptyState(),revision:0,writes:0,conflict:null,unavailable:false,forceConflict:false};
  db.client=(allowed=false,signedIn=false)=>({
    auth:{getSession:async()=>({data:{session:signedIn?{user:{email:'editor@example.com'}}:null},error:null})},
    rpc:async()=>({data:allowed,error:null}),
    from(table){
      assert.equal(table,'gunpla_library');
      return {
        select(){return {eq(){return {single:async()=>db.unavailable?{error:{message:'offline'}}:{data:{state:clone(db.state),revision:db.revision},error:null}};}};},
        update(value){
          const filters={};
          const query={eq(key,val){filters[key]=val;return query;},async select(){
            if(db.conflict){const action=db.conflict;db.conflict=null;action();}
            if(db.unavailable)return {error:{message:'offline'}};
            if(!allowed||db.forceConflict||filters.revision!==db.revision)return {data:[],error:null};
            assert.equal(filters.id,'shared');db.state=clone(value.state);db.revision=value.revision;db.writes++;
            return {data:[{state:clone(db.state),revision:db.revision}],error:null};
          }};return query;
        }
      };
    }
  });
  return db;
}

test('an independent wishlist change preserves ownership and build changes from the other editor',()=>{
  const before=emptyState();before.entries['b-1']=clone(owned);
  const next=clone(before);next.entries['b-1'].wishlist=true;
  const latest=clone(before);latest.entries['b-1'].status='Building';latest.entries['b-2']=clone(owned);
  const merged=applyCollectionDelta(latest,collectionDelta(before,next));
  assert.deepEqual(merged.entries['b-1'],{owned:true,wishlist:true,status:'Building'});
  assert.deepEqual(merged.entries['b-2'],owned);
});

test('custom kits migrate with their entries and do not resurrect after another editor deletes them',()=>{
  const before=emptyState(),next=validateState({version:1,entries:{'c-example':owned},customKits:[kit]});
  const merged=applyCollectionDelta(before,collectionDelta(before,next));
  assert.equal(merged.customKits[0].name,'My Gundam');assert.equal(merged.entries['c-example'].owned,true);
  const removed=applyCollectionDelta(merged,collectionDelta(merged,emptyState()));
  assert.deepEqual(removed,emptyState());
  const staleEdit=clone(merged);staleEdit.entries['c-example'].wishlist=true;
  assert.throws(()=>applyCollectionDelta(emptyState(),collectionDelta(merged,staleEdit)),/removed by another editor/);
});

test('visitors can read but cannot save; an unapproved signed-in account also cannot save',async()=>{
  const db=fakeDatabase(),next=emptyState();next.entries['b-1']=owned;
  for(const signedIn of [false,true]){
    const store=createCloudStore(db.client(false,signedIn));
    assert.deepEqual(await store.load(),emptyState());
    await assert.rejects(()=>store.save(emptyState(),next),/approved editor/);
  }
  assert.equal(db.writes,0);
});

test('a save retries a conflicting database revision and keeps the other editor’s new kit',async()=>{
  const db=fakeDatabase(),next=emptyState();next.entries['b-1']=owned;
  db.conflict=()=>{db.state.entries['b-2']={...owned,status:'Completed'};db.revision++;};
  const result=await createCloudStore(db.client(true,true)).save(emptyState(),next);
  assert.equal(result.entries['b-1'].owned,true);assert.equal(result.entries['b-2'].status,'Completed');
  assert.equal(db.revision,2);assert.equal(db.writes,1);
});

test('network failures and repeated conflicts never report a saved change',async()=>{
  const db=fakeDatabase(),store=createCloudStore(db.client(true,true)),next=emptyState();next.entries['b-1']=owned;
  db.unavailable=true;await assert.rejects(()=>store.save(emptyState(),next),/could not be loaded/);
  db.unavailable=false;db.forceConflict=true;await assert.rejects(()=>store.save(emptyState(),next),/changed while saving/);
  assert.equal(db.writes,0);assert.deepEqual(db.state,emptyState());
});

test('Vercel config exposes only a public Supabase key and fails closed on private keys or partial setup',()=>{
  assert.deepEqual(publicConfiguration({}),{enabled:false});
  assert.deepEqual(publicConfiguration({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example'}),{enabled:true,url:'https://example.supabase.co',publishableKey:'sb_publishable_example'});
  const jwt=role=>'eyJheader.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
  assert.equal(publicConfiguration({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:jwt('anon')}).enabled,true);
  for(const key of ['sb_secret_private',jwt('service_role'),'invalid'])assert.throws(()=>publicConfiguration({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:key}));
  assert.throws(()=>publicConfiguration({SUPABASE_URL:'https://example.supabase.co'}));
  assert.throws(()=>publicConfiguration({SUPABASE_URL:'http://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example'}));
});
