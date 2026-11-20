import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {installAppUpdates} from '../lib/app-update.js';

test('an update is explicit, blocked by an open form, and only reloads after activation was requested',async t=>{
 const dom=new JSDOM('<body></body>');t.after(()=>dom.window.close());let ready=false,reloads=0,sends=0,updates=0;
 const previous=globalThis.MessageChannel;globalThis.MessageChannel=class{constructor(){this.port1={close(){}};this.port2={reply:data=>queueMicrotask(()=>this.port1.onmessage({data}))};}};t.after(()=>globalThis.MessageChannel=previous);
 const listeners={},registration={waiting:{postMessage:(message,ports)=>{sends++;assert.equal(message.type,'OPUS_ACTIVATE');ports[0].reply({ok:true});}},addEventListener(){},update:async()=>updates++};
 const navigator={serviceWorker:{controller:{},addEventListener:(name,fn)=>listeners[name]=fn,register:async()=>registration}};
 await installAppUpdates({navigator,document:dom.window.document,location:{reload:()=>reloads++},beforeUpdate:async()=>{if(!ready)throw Error('Fermez le formulaire');}});
 assert.equal(updates,1);listeners.controllerchange();assert.equal(reloads,0);
 const button=dom.window.document.querySelector('button');await button.onclick();assert.equal(sends,0);assert.match(dom.window.document.body.textContent,/Fermez le formulaire/);
 ready=true;await button.onclick();assert.equal(sends,1);listeners.controllerchange();assert.equal(reloads,1);
});

test('the waiting worker refuses to switch while another OPUS window is open',async()=>{
 const handlers={},messages=[];let activations=0,clients=[{id:'a',url:'https://opus.example/OPUS/'},{id:'b',url:'https://opus.example/OPUS/modules/baes/'}];
 vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{URL,self:{registration:{scope:'https://opus.example/OPUS/'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{matchAll:async()=>clients},skipWaiting:async()=>activations++}});
 let pending;const event={data:{type:'OPUS_ACTIVATE'},source:{id:'a',url:'https://opus.example/OPUS/'},ports:[{postMessage:value=>messages.push(value)}],waitUntil:p=>pending=p};
 handlers.message(event);await pending;assert.equal(activations,0);assert.equal(messages.at(-1).ok,false);
 clients=[clients[0],{id:'unrelated',url:'https://other.example/'}];handlers.message(event);await pending;assert.equal(activations,1);assert.equal(messages.at(-1).ok,true);
 handlers.message({...event,source:{id:'attacker',url:'https://other.example/'},waitUntil:()=>assert.fail('Foreign origin cannot activate')});
});

test('persistent header button checks for updates without closing or reloading an up-to-date app',async t=>{
 const dom=new JSDOM('<body><header><div class="topright"></div></header></body>');t.after(()=>dom.window.close());let updates=0,reloads=0;
 const registration={waiting:null,addEventListener(){},update:async()=>updates++},nav={serviceWorker:{controller:{},addEventListener(){},register:async()=>registration}};
 await installAppUpdates({navigator:nav,document:dom.window.document,location:{reload:()=>reloads++}});
 const b=dom.window.document.getElementById('appUpdateButton');assert.equal(b.parentElement.className,'topright');assert.equal(b.hidden,false);await b.onclick();assert.equal(updates,2);assert.equal(reloads,0);assert.match(dom.window.document.getElementById('appUpdate').textContent,/à jour/);assert.equal(b.disabled,false);
});

test('checking discovers a waiting update and activates it on the same explicit click without clearing draft storage',async t=>{
 const dom=new JSDOM('<body></body>',{url:'https://opus.test'});t.after(()=>dom.window.close());dom.window.localStorage.setItem('saved-draft','rapport');
 const previous=globalThis.MessageChannel;globalThis.MessageChannel=class{constructor(){this.port1={close(){}};this.port2={reply:data=>queueMicrotask(()=>this.port1.onmessage({data}))};}};t.after(()=>globalThis.MessageChannel=previous);
 let updates=0,sends=0,checks=0,reloads=0;const listeners={};const registration={waiting:null,addEventListener(){},update:async()=>{if(++updates===2)registration.waiting={postMessage:(_,ports)=>{sends++;ports[0].reply({ok:true});}};}};
 await installAppUpdates({navigator:{serviceWorker:{controller:{},addEventListener:(k,v)=>listeners[k]=v,register:async()=>registration}},document:dom.window.document,location:{reload:()=>reloads++},beforeUpdate:async()=>checks++});
 await dom.window.document.getElementById('appUpdateButton').onclick();assert.equal(checks,1);assert.equal(sends,1);assert.equal(reloads,0);listeners.controllerchange();assert.equal(reloads,1);listeners.controllerchange();assert.equal(reloads,1);assert.equal(dom.window.localStorage.getItem('saved-draft'),'rapport');
});

test('a failed network check leaves a visible retry button and does not reload or delete local work',async t=>{
 const dom=new JSDOM('<body></body>');t.after(()=>dom.window.close());let fail=false,reloads=0;const registration={waiting:null,addEventListener(){},update:async()=>{if(fail)throw Error('Réseau indisponible');}};
 await installAppUpdates({navigator:{serviceWorker:{controller:{},addEventListener(){},register:async()=>registration}},document:dom.window.document,location:{reload:()=>reloads++}});fail=true;const b=dom.window.document.getElementById('appUpdateButton');await b.onclick();assert.match(dom.window.document.getElementById('appUpdate').textContent,/Réseau/);assert.equal(b.disabled,false);assert.equal(reloads,0);fail=false;await b.onclick();assert.match(dom.window.document.getElementById('appUpdate').textContent,/à jour/);
});

test('a newly downloaded build makes the header action available while the app stays open',async t=>{
 const dom=new JSDOM('<body><header><div class="topright"></div></header></body>');t.after(()=>dom.window.close());const listeners={},state={};let reloads=0;
 const worker={state:'installing',addEventListener:(k,v)=>state[k]=v};const registration={waiting:null,installing:null,addEventListener:(k,v)=>listeners[k]=v,update:async()=>{}};
 await installAppUpdates({navigator:{serviceWorker:{controller:{},addEventListener(){},register:async()=>registration}},document:dom.window.document,location:{reload:()=>reloads++}});
 registration.installing=worker;listeners.updatefound();const b=dom.window.document.getElementById('appUpdateButton');assert.equal(b.disabled,true);registration.waiting=worker;worker.state='installed';state.statechange();assert.equal(b.textContent,'Appliquer la mise à jour');assert.equal(b.disabled,false);assert.equal(reloads,0);
});
