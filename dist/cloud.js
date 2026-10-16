import {validateState} from './core.js';

// Only fields changed by this action are rebased, so another editor's changes survive.
export function collectionDelta(before,after) {
  before=validateState(before);after=validateState(after);
  const entries={},removedEntries=[];
  for(const [id,value] of Object.entries(after.entries)) {
    const old=before.entries[id] || {owned:false,wishlist:false,status:'Unbuilt'},patch={};
    for(const key of ['owned','wishlist','status'])if(value[key]!==old[key])patch[key]=value[key];
    if(Object.keys(patch).length)entries[id]=patch;
  }
  for(const id of Object.keys(before.entries))if(!Object.hasOwn(after.entries,id))removedEntries.push(id);
  const oldKits=new Map(before.customKits.map(k=>[k.id,k]));
  return {entries,removedEntries,upserts:after.customKits.filter(k=>JSON.stringify(oldKits.get(k.id))!==JSON.stringify(k)),removedKits:before.customKits.filter(k=>!after.customKits.some(n=>n.id===k.id)).map(k=>k.id)};
}

export function applyCollectionDelta(latest,delta) {
  const next=validateState(latest),custom=new Map(next.customKits.map(k=>[k.id,k]));
  for(const id of delta.removedEntries)delete next.entries[id];
  for(const id of delta.removedKits){custom.delete(id);delete next.entries[id];}
  for(const kit of delta.upserts)custom.set(kit.id,kit);
  for(const [id,patch] of Object.entries(delta.entries)) {
    if(id.startsWith('c-')&&!custom.has(id))throw new Error('This personal kit was removed by another editor. Refresh before editing it.');
    next.entries[id]={owned:false,wishlist:false,status:'Unbuilt',...next.entries[id],...patch};
  }
  next.customKits=[...custom.values()];
  return validateState(next);
}

export function createCloudStore(client) {
  async function snapshot() {
    const {data,error}=await client.from('gunpla_library').select('state,revision').eq('id','shared').single();
    if(error)throw new Error('The shared collection could not be loaded. Check the database setup or try again.');
    if(!data || !Number.isSafeInteger(data.revision) || data.revision<0)throw new Error('The shared collection has an invalid revision.');
    return {state:validateState(data.state),revision:data.revision};
  }
  async function canEdit() {
    const {data:{session},error}=await client.auth.getSession();
    if(error)throw error;
    if(!session)return {allowed:false,email:''};
    const result=await client.rpc('can_edit_gunpla');
    if(result.error)throw new Error('Editing access could not be verified.');
    return {allowed:result.data===true,email:session.user.email || ''};
  }
  async function save(before,after) {
    if(!(await canEdit()).allowed)throw new Error('Sign in with an approved editor email to change this collection.');
    const delta=collectionDelta(before,after);
    for(let attempt=0;attempt<4;attempt++) {
      const latest=await snapshot(),merged=applyCollectionDelta(latest.state,delta);
      const {data,error}=await client.from('gunpla_library').update({state:merged,revision:latest.revision+1}).eq('id','shared').eq('revision',latest.revision).select('state,revision');
      if(error)throw new Error('The change could not be saved to the shared collection. Try again.');
      if(data?.length===1)return validateState(data[0].state);
    }
    throw new Error('The collection changed while saving. Refresh and try the action again.');
  }
  return {load:async()=>(await snapshot()).state,canEdit,save,client};
}

export async function connectCloud() {
  let response;
  try{response=await fetch('/api/config',{cache:'no-store'});}catch{throw new Error('The connection settings could not be loaded. Reload to try again.');}
  if(response.status===404){
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname))return null;
    throw new Error('The shared storage endpoint is unavailable. Check the Vercel deployment.');
  }
  if(!response.ok)throw new Error('Shared collection settings need attention. Editing is unavailable.');
  const config=await response.json();
  if(!config.enabled)return null;
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
  return createCloudStore(createClient(config.url,config.publishableKey,{
    auth:{storageKey:'gunpla-library.auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  }));
}
