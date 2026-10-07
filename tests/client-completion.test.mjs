import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {completionDraft,missingCoordinates,persistCoordinates,mountClientCompletion} from '../lib/client-completion.js';
const client={id:'c',name:'Mme Guego',lastName:'Guego',firstName:'Annie',phone:'0600000000',email:'a@example.fr',billingAddress:'1 rue A',sites:[{id:'s',address:'old'}],custom:'keep'};
test('required coordinates, legacy values and independent contact',()=>{
 assert.deepEqual(missingCoordinates(completionDraft(client,{})),[]);
 const d=completionDraft({...client,firstName:'',email:''},{siteContact:'Robert',sitePhone:'0700'});assert.deepEqual(missingCoordinates(d),['firstName','email','siteAddress','siteEmail']);
 assert.equal(completionDraft(null,{clientName:'Guego',sitePhone:'0600'}).phone,'0600');
 assert.equal(missingCoordinates(completionDraft({...client,category:'Société',firstName:''},{})).length,0);
 assert.ok(missingCoordinates({...completionDraft(client),email:'bad'}).includes('email'));
});
test('save preserves all report and client metadata; failed client save leaves record intact',async()=>{
 const record={clientId:'c',summary:'notes',photos:['photo'],plannedStart:'date',siteAddress:'site'};
 const ui={data:{clients:[structuredClone(client)]},clientById(){return this.data.clients[0]},save:async()=>{}};
 await persistCoordinates(ui,record,'visits',{...completionDraft(client,record),email:'new@example.fr'});
 assert.equal(record.summary,'notes');assert.deepEqual(record.photos,['photo']);assert.equal(record.plannedStart,'date');assert.equal(ui.data.clients[0].custom,'keep');assert.deepEqual(ui.data.clients[0].sites,client.sites);
 const before=structuredClone(record);ui.save=async()=>{throw Error('offline')};await assert.rejects(persistCoordinates(ui,record,'visits',completionDraft(client,record)),/offline/);assert.deepEqual(record,before);
});
test('partial failure is explicit and restores record, retry succeeds',async()=>{
 const record={clientId:'c',siteContact:'old'},before=structuredClone(record);let fail=true;
 const ui={data:{clients:[structuredClone(client)]},clientById(){return this.data.clients[0]},save:async k=>{if(k==='visits'&&fail)throw Error('network')}};
 const d={...completionDraft(client,record),differentContact:true,siteContact:'Robert',sitePhone:'0700',siteEmail:'r@example.fr',siteAddress:'2 rue B'};
 await assert.rejects(persistCoordinates(ui,record,'visits',d),/coordonnées client sont enregistrées/);assert.deepEqual(record,before);fail=false;await persistCoordinates(ui,record,'visits',d);assert.equal(record.siteContact,'Robert');assert.equal(record.email,'r@example.fr');
});
test('technician can complete inline without destroying report input; red alert disappears only after save',async()=>{
 const dom=new JSDOM('<dialog><form id="finishVisit"><textarea>Unsaved report</textarea></form></dialog>');global.document=dom.window.document;
 const record={clientId:'c'},ui={data:{clients:[{...client,email:''}]},clientById(){return this.data.clients[0]},save:async()=>{},renderVisits:async()=>{}};
 mountClientCompletion(ui,record,'visits');const box=document.querySelector('.clientCompletion');assert.match(box.querySelector('summary').textContent,/Compléter fiche/);
 const input=box.querySelector('[name=email]');input.value='new@example.fr';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await box.querySelector('form').onsubmit({preventDefault(){}});
 assert.match(box.querySelector('summary').textContent,/Coordonnées complètes/);assert.equal(document.querySelector('#finishVisit textarea').value,'Unsaved report');assert.equal(ui.data.clients[0].email,'new@example.fr');dom.window.close();delete global.document;
});
