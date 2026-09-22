import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {OpsUI} from '../lib/ops-ui.js';
test('visit address is independently editable and survives reopening without changing syndic',async()=>{
 const dom=new JSDOM('<dialog id="modal"></dialog>',{url:'https://opus.example'});globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
 const ui=new OpsUI({graph:{},isAdmin:()=>true,getConfig:()=>({}),getUser:()=>({}),getCatalog:()=>({projects:[]}),modal:(_,html)=>document.getElementById('modal').innerHTML=html});
 const client={id:'c',name:'Syndic',billingAddress:'1 rue du Syndic',sites:[{id:'s',address:'1 rue du Syndic'}]};ui.data.clients=[client];ui.data.visits=[];
 ui.assistant={languageSelectHtml:()=>'',toolsHtml:()=>'',bind:()=>{}};ui.bindClientChoice=()=>{};ui.validateFormScheduling=()=>{};ui.resolveClientChoice=async()=>({client,site:client.sites[0]});ui.saveWithFeedback=async(_,__,work)=>work();ui.save=async()=>{};ui.upsertLinkedEvent=async()=>{};
 const v={id:'v',number:'VIS-1',clientId:'c',siteId:'s',type:'Visite avant devis',status:'planifiee',siteAddress:'Ancienne adresse',request:'Devis'};
 await ui.editVisit(v);assert.equal(document.getElementById('vMeetingAddress').value,'Ancienne adresse');document.getElementById('vMeetingAddress').value='25 rue de la Copropriété';document.getElementById('vContact').value='Gardien';document.getElementById('vContactPhone').value='06 12 34 56 78';document.getElementById('vAccess').value='Bâtiment B';await document.getElementById('visitForm').onsubmit({preventDefault(){}});
 assert.equal(v.siteAddress,'25 rue de la Copropriété');assert.equal(v.clientName,'Syndic');assert.equal(v.siteContact,'Gardien');assert.equal(v.phone,'06 12 34 56 78');assert.equal(v.siteAccess,'Bâtiment B');assert.equal(client.sites[0].address,'1 rue du Syndic');assert.equal(client.billingAddress,'1 rue du Syndic');
 await ui.editVisit(v);assert.equal(document.getElementById('vMeetingAddress').value,'25 rue de la Copropriété');dom.window.close();
});

import {visitContactHtml} from '../lib/visit-location.js';
test('visit contact actions use the on-site phone and escape contact text',()=>{const html=visitContactHtml({siteContact:'<Gardien>',sitePhone:'06 12 34 56 78',phone:'0100000000'});assert.match(html,/tel:0612345678/);assert.match(html,/sms:0612345678/);assert.match(html,/&lt;Gardien&gt;/);assert.doesNotMatch(html,/0100000000/);});
