import test from 'node:test';import assert from 'node:assert/strict';
import {clientContactHtml,saveClientDraft} from '../lib/client-contacts.js';
test('saved client coordinates displayed independently from site contact',()=>{
 const html=clientContactHtml({phone:'01 23 45 67 89',email:'test@example.org',sites:[{phone:'other'}]});
 assert.match(html,/01 23 45 67 89/);assert.match(html,/test@example.org/);assert.doesNotMatch(html,/other/);
 assert.match(clientContactHtml({email:'<img src=x>'}),/&lt;img/);
});
test('editing keeps site and other client properties intact',async()=>{
 const original={id:'c',phone:'old',email:'old@example.org',sites:[{phone:'site'}],category:'Madame'};
 const ui={data:{clients:[original]},save:async()=>{}};const draft=structuredClone(original);draft.phone='new';
 await saveClientDraft(ui,draft);assert.equal(original.phone,'old');assert.equal(ui.data.clients[0].phone,'new');assert.equal(ui.data.clients[0].sites[0].phone,'site');assert.equal(ui.data.clients[0].category,'Madame');
});
test('failed save restores previous list and retry does not duplicate client',async()=>{
 const previous=[{id:'c',phone:'old'}],ui={data:{clients:previous},save:async()=>{throw Error('offline');}};
 await assert.rejects(saveClientDraft(ui,{id:'c',phone:'new'}),/offline/);assert.equal(ui.data.clients,previous);
 ui.save=async()=>{};await saveClientDraft(ui,{id:'new',phone:'new'});await saveClientDraft(ui,{id:'new',phone:'new'});assert.equal(ui.data.clients.length,2);
});
