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
