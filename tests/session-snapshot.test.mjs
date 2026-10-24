import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsRepository} from '../lib/ops.js';
import {OpsUI} from '../lib/ops-ui.js';

const names=['clients','people','interventions','visits','events','closures','projectTracking'];
function harness(t,{cached=false}={}){
 const dom=new JSDOM('<dialog id="modal"></dialog>');globalThis.document=dom.window.document;
 t.after(()=>{dom.window.close();delete globalThis.document;});
 const remote=Object.fromEntries(names.map(name=>[name,{tag:'v1',rows:[{id:name+'-1',summary:'Original'}]}]));
 const state={failListing:false,failDownload:'',writes:[]};
 const graph={
  folder:async()=>({id:'root'}),
  children:async()=>{if(state.failListing)throw Error('Temporary network failure');return names.map(name=>({id:name,name:name+'.json',eTag:remote[name].tag}));},
  json:async id=>{if(state.failDownload===id)throw Error('Download interrupted');return structuredClone(remote[id].rows);},
  writeJson:async(_root,file,value,headers)=>{
   const name=file.replace(/\.json$/,'');state.writes.push({name,value:structuredClone(value),headers:{...headers}});
   if(headers['If-Match']!==remote[name].tag)throw Object.assign(Error('Changed by another tablet'),{status:412});
   remote[name].rows=structuredClone(value);remote[name].tag+='-saved';return {eTag:remote[name].tag};
  }
 };
 const ui=Object.assign(Object.create(OpsUI.prototype),{
  repo:new OpsRepository(graph),data:Object.fromEntries(names.map(name=>[name,[]])),cacheMode:cached,
  c:{cacheSavedKind:async()=>{},toast:()=>{}}
 });
 return {ui,remote,state};
}

test('temporary background failure keeps loaded data writable under its original ETag',async t=>{
 const {ui,state}=harness(t);await ui.reload();
 const record=ui.data.visits[0],data=ui.data;state.failListing=true;
 await assert.rejects(ui.reload({background:true}),/Temporary network failure/);
 assert.equal(ui.data,data);assert.equal(ui.data.visits[0],record);assert.equal(ui.cacheMode,false);
 assert.equal(ui.dataLoadError,null);assert.equal(ui.repo.readFailures.size,0);assert.equal(ui.repo.versions.get('visits'),'v1');
 record.summary='Report typed while a refresh failed';await ui.save('visits');
 assert.equal(state.writes.length,1);assert.equal(state.writes[0].headers['If-Match'],'v1');
 assert.equal(state.writes[0].value[0].summary,'Report typed while a refresh failed');
});

test('failed partial reload never upgrades ETags; concurrent tablet update is still rejected',async t=>{
 const {ui,remote,state}=harness(t);await ui.reload();const data=ui.data;
 for(const name of names){remote[name].tag='v2';remote[name].rows[0].summary='Other tablet';}
 state.failDownload='people';await assert.rejects(ui.reload({background:true}),/Download interrupted/);
 assert.equal(ui.data,data);for(const name of names)assert.equal(ui.repo.versions.get(name),'v1');
 ui.data.visits[0].summary='My unsent report';
 await assert.rejects(ui.save('visits'),error=>error.status===412);
 assert.equal(state.writes[0].headers['If-Match'],'v1');assert.equal(remote.visits.rows[0].summary,'Other tablet');
 assert.equal(ui.needsRefresh,true);assert.equal(ui.repo.readFailures.has('visits'),true);
 // Another failed refresh must not erase the conflict barrier.
 state.failListing=true;await assert.rejects(ui.reload({background:true}));
 await assert.rejects(ui.save('visits'),/actualiser/);assert.equal(state.writes.length,1);
 assert.equal(ui.data.visits[0].summary,'My unsent report');
});

test('initial failed load stays blocked, including a lightweight warm snapshot',async t=>{
 for(const cached of [false,true]){
  const {ui,state}=harness(t,{cached});state.failListing=true;
  await assert.rejects(ui.reload(),/Temporary network failure/);
  assert.notEqual(ui.hasLoadedRemote,true);assert.notEqual(ui.repo.hasLoadedAll,true);
  for(const name of names)assert.equal(ui.repo.readFailures.has(name),true);
  await assert.rejects(ui.save('visits'),/bloqué|consultation/);assert.equal(state.writes.length,0);
  // A later successful read is the only way to restore the safe baseline.
  state.failListing=false;await ui.reload();assert.equal(ui.cacheMode,false);assert.equal(ui.hasLoadedRemote,true);
  await ui.save('visits');assert.equal(state.writes[0].headers['If-Match'],'v1');
 }
});
