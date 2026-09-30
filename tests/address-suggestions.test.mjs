import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {installAddressSuggestions} from '../lib/address-suggestions.js';
const tick=()=>new Promise(r=>setTimeout(r,15));
test('address selection fills only address, propagates change and ignores stale responses',async()=>{
 const dom=new JSDOM('<input id="peAddress"><input id="email">'),doc=dom.window.document;let resolveFirst,calls=0;
 const stop=installAddressSuggestions(doc,async()=>{calls++;if(calls===1)return new Promise(r=>resolveFirst=r);return {ok:true,json:async()=>({features:[{properties:{label:'100 Rue des Artisans 78530 Buc'}}]})};},0);
 const input=doc.getElementById('peAddress');input.focus();input.value='ancienne';input.dispatchEvent(new dom.window.Event('input'));await tick();
 input.value='100 rue des artisans';input.dispatchEvent(new dom.window.Event('input'));await tick();
 resolveFirst({ok:true,json:async()=>({features:[{properties:{label:'Stale'}}]})});await tick();
 assert(!doc.querySelector('.addressSuggestions').textContent.includes('Stale'));
 input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',cancelable:true}));input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',cancelable:true}));assert.equal(input.value,'100 Rue des Artisans 78530 Buc');
 doc.getElementById('email').focus();assert.equal(doc.querySelector('.addressSuggestions'),null);assert.equal(calls,2);stop();dom.window.close();
});
test('offline suggestions retain freely typed address',async()=>{
 const dom=new JSDOM('<input id="peAddress">'),doc=dom.window.document;
 const stop=installAddressSuggestions(doc,async()=>{throw Error('offline');},0);const input=doc.getElementById('peAddress');input.focus();input.value='Adresse libre';input.dispatchEvent(new dom.window.Event('input'));await tick();
 assert.equal(input.value,'Adresse libre');assert.match(doc.querySelector('[role=status]').textContent,/indisponibles/);stop();dom.window.close();
});
