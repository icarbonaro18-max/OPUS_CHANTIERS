import test from 'node:test';import assert from 'node:assert/strict';
import {lightSnapshot,WarmCache,OPS_KEYS} from '../lib/warm-cache.js';import {LocalStore} from '../lib/cloud.js';
test('Warm snapshot omits inline media without modifying originals or losing report text',()=>{
 const original={visits:[{id:'v',notes:'Réserve',photos:['data:image/jpeg;base64,'+'A'.repeat(1000000)],signature:'data:image/png;base64,x',attachments:[{fileId:'f',name:'PDF'}]}]};
 const copy=lightSnapshot(original);assert.equal(copy.visits[0].notes,'Réserve');assert.deepEqual(copy.visits[0].photos,[]);assert.equal(copy.visits[0].signature,undefined);assert.equal(copy.visits[0].attachments[0].fileId,'f');assert.equal(original.visits[0].photos.length,1);assert.ok(JSON.stringify(copy).length<1000);
});
test('New cache never reads the old potentially oversized snapshot',async()=>{
 const keys=[];const store={get:async key=>{keys.push(key);return undefined;},set:async()=>{}};
 const cache=new WarmCache(store,'a',{});assert.equal(await cache.read(),null);assert.deepEqual(keys,['warm-start-v2']);
 keys.length=0;await cache.write({user:{id:'u'},drive:{id:'d'},catalog:{projects:[],categories:[],loose:[]},operations:Object.fromEntries(OPS_KEYS.map(k=>[k,[]]))});assert.deepEqual(keys,[]);
});
test('Draft enumeration requests only matching keys, never the whole local database',async()=>{
 const old=globalThis.IDBKeyRange;globalThis.IDBKeyRange={bound:(lower,upper)=>({lower,upper})};
 try{const store=new LocalStore('account-a');store.action=async(mode,fn)=>fn({getAll:range=>{assert.equal(range.lower,'account-a|draft:');assert.equal(range.upper,'account-a|draft:\uffff');return [{key:'account-a|draft:one',value:{text:'Brouillon'}}];}});
 assert.deepEqual(await store.all('draft:'),[{key:'draft:one',value:{text:'Brouillon'}}]);}finally{globalThis.IDBKeyRange=old;}
});
test('Recovery removes only this app shell, preserves other caches and never touches user stores',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const html=await readFile(new URL('../reparer.html',import.meta.url),'utf8');const button={},status={},deleted=[],unregistered=[];let destination='';
 const root='https://opus.example/';const registrations=[{scope:root,active:{scriptURL:root+'sw.js'},unregister:async()=>unregistered.push('main')},{scope:root+'commandes/',active:{scriptURL:root+'commandes/sw.js'},unregister:async()=>unregistered.push('orders')}];
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document:{getElementById:id=>id==='restart'?button:status},URL,Date,location:{href:root+'reparer.html',replace:url=>destination=url},navigator:{serviceWorker:{getRegistrations:async()=>registrations}},window:{caches:{}},caches:{keys:async()=>['opus-chantiers-shell:'+root+':old','other-app','opus-commandes-cache'],delete:async name=>deleted.push(name)}});
 await button.onclick();assert.deepEqual(unregistered,['main']);assert.deepEqual(deleted,['opus-chantiers-shell:'+root+':old']);assert.match(destination,/https:\/\/opus.example\/\?relance=/);
});
