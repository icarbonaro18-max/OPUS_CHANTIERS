import test from 'node:test';
import assert from 'node:assert/strict';
import {MediaStore} from '../lib/media-store.js';
import {LocalStore,Journal} from '../lib/cloud.js';
import {OpsRepository} from '../lib/ops.js';
const turn=()=>new Promise(r=>setImmediate(r));

test('photo cache is bounded in bytes, evicts least recently used entries, and returns oversized photos without retaining them',async()=>{
 const media=new MediaStore({bytes:async id=>new Blob([id])},{memoryBudget:20,encode:async blob=>blob.text()});
 assert.equal(await media.image({id:'aaaa'}),'aaaa');assert.equal(await media.image({id:'bbbb'}),'bbbb');await media.image({id:'aaaa'});await media.image({id:'cccc'});
 assert.equal(media.memory.has('bbbb'),false);assert.equal(media.memory.has('aaaa'),true);assert.equal(media.memoryBytes,16);
 const big='x'.repeat(30);assert.equal(await media.image({id:big}),big);assert.equal(media.memory.has(big),false);assert.ok(media.memoryBytes<=20);
});
test('image hashing and uploads share a bounded work queue even for a large report',async()=>{
 let active=0,max=0;const work=async fn=>{active++;max=Math.max(max,active);await turn();try{return fn();}finally{active--;}};
 const media=new MediaStore({folder:async(p,name)=>({id:name}),named:async()=>null,upload:async(p,name)=>work(()=>({id:name}))},{concurrency:3,digest:async value=>work(()=>Buffer.from(value).toString('hex')),decode:value=>new Blob([value])});
 const values=Array.from({length:60},(_,i)=>'data:image/jpeg;base64,'+Buffer.from(String(i)).toString('base64'));const refs=await media.pack(values,'project');assert.equal(max,3);assert.equal(refs.length,60);assert.ok(refs.every(value=>value.$opusAsset));
});
test('the local database connection is reused and reopens only after version change',async t=>{
 const old=globalThis.indexedDB;let opens=0,closes=0,last;
 globalThis.indexedDB={open(){opens++;const q={};queueMicrotask(()=>{const db={close(){closes++;},transaction(){const request={},tx={objectStore:()=>({get(){queueMicrotask(()=>{request.result={value:'stored'};request.onsuccess?.();tx.oncomplete?.();});return request;}})};return tx;}};last=db;q.result=db;q.onsuccess();});return q;}};t.after(()=>globalThis.indexedDB=old);
 const store=new LocalStore('account');assert.deepEqual(await Promise.all([store.get('a'),store.get('b'),store.get('c')]),['stored','stored','stored']);assert.equal(opens,1);assert.equal(closes,0);last.onversionchange();assert.equal(await store.get('d'),'stored');assert.equal(opens,2);assert.equal(closes,1);
});
test('a failed IndexedDB open is not cached forever',async t=>{
 const old=globalThis.indexedDB;let opens=0;globalThis.indexedDB={open(){const q={};opens++;queueMicrotask(()=>{if(opens===1){q.error=Error('unavailable');q.onerror();}else{q.result={close(){}};q.onsuccess();}});return q;}};t.after(()=>globalThis.indexedDB=old);
 const store=new LocalStore('account');await assert.rejects(store.db(),/unavailable/);assert.ok(await store.db());assert.equal(opens,2);
});
test('enumerating a large outbox reads only its keys in the current account',async t=>{
 const old=globalThis.IDBKeyRange;globalThis.IDBKeyRange={bound:(lower,upper)=>({lower,upper})};t.after(()=>globalThis.IDBKeyRange=old);
 const store=new LocalStore('owner');store.action=async(mode,fn)=>fn({getAllKeys:range=>{assert.equal(range.lower,'owner|pdfoutbox:');return ['owner|pdfoutbox:one','owner|pdfoutbox:two'];},getAll:()=>assert.fail('Must not clone PDF blobs while enumerating')});assert.deepEqual(await store.keys('pdfoutbox:'),['pdfoutbox:one','pdfoutbox:two']);
});
test('initial operation loading limits concurrent JSON downloads and keeps atomic application',async()=>{
 let active=0,max=0;const names=['clients','people','interventions','visits','events','closures','projectTracking'];
 const graph={folder:async()=>({id:'system'}),children:async()=>names.map(name=>({id:name,name:name+'.json',eTag:name,size:2})),json:async id=>{active++;max=Math.max(max,active);await turn();active--;return [{id}];}};
 const repo=new OpsRepository(graph),data=await repo.loadAll();assert.equal(max,3);assert.equal(data.visits[0].id,'visits');assert.equal(data.events[0].id,'events');
});
test('known directory IDs are reused while file listings remain fresh',async()=>{
 let lookups=0;const journal=new Journal({named:async(parent,name)=>{lookups++;return {id:parent+'/'+name};}});
 const a=await journal.directory('project','attestations','form'),b=await journal.directory('project','attestations','form');assert.equal(a.id,b.id);assert.equal(lookups,3);
});

test('restoring missing records checks and writes inside one account-scoped write transaction',async()=>{
 const store=new LocalStore('owner'),records=new Map();let transactions=0;
 store.action=async(mode,fn)=>{assert.equal(mode,'readwrite');transactions++;const tasks=[];fn({get:key=>{const q={};tasks.push(()=>{q.result=records.get(key);q.onsuccess();});return q;},put:row=>records.set(row.key,row)});for(const task of tasks)task();};
 assert.equal(await store.setIfAbsent('draft:p:a:r',{revision:'backup'}),true);assert.equal(await store.setIfAbsent('draft:p:a:r',{revision:'older'}),false);assert.equal(records.get('owner|draft:p:a:r').value.revision,'backup');assert.equal(transactions,2);
});
