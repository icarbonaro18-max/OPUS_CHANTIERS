import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {openCoordinateEditor,coordinateButton,bindCoordinateButtons} from '../lib/client-coordinate-editor.js';
import {previewEvent} from '../lib/calendar-preview.js';
function setup(t,kind='visits'){
 const dom=new JSDOM('<main id="visitsPage"></main><main id="interventionsPage"></main><dialog id="modal"></dialog>',{url:'https://opus.test'}),document=dom.window.document,old=globalThis.document,oldStorage=globalThis.localStorage,oldWindow=globalThis.window;globalThis.document=document;globalThis.localStorage=dom.window.localStorage;globalThis.window=dom.window;
 t.after(()=>{globalThis.document=old;globalThis.localStorage=oldStorage;globalThis.window=oldWindow;dom.window.close();});
 const client={id:'c',name:'Client',lastName:'Nom',firstName:'Prénom',phone:'0600000000',email:'client@example.fr',billingAddress:'Agence',sites:[{id:'s',phone:'site'}],custom:'keep'};
 const record={id:'r',number:'VIS-1',type:'Visite avant devis',clientId:'c',siteId:'s',clientName:'Client',siteContact:'Client',sitePhone:client.phone,siteEmail:client.email,phone:client.phone,email:client.email,siteAddress:'Chantier',plannedStart:'2026-10-29T09:00:00Z',plannedEnd:'2026-10-29T10:00:00Z',status:'planifiee',summary:'Rapport conservé',photos:[{$opusAsset:{id:'image'}}],actualStart:'real',notes:'Notes'};
 const state={writes:[],fail:null,prepare:0,admin:true};const dialog=document.getElementById('modal');dialog.close=()=>dialog.removeAttribute('open');
 const ui=new OpsUI({graph:{},getUser:()=>({mail:'owner@test'}),getConfig:()=>({}),isAdmin:()=>state.admin,toast:()=>{},modal:(_,html)=>{dialog.innerHTML=html;dialog.setAttribute('open','');},prepareAppointmentWrite:async()=>{state.prepare++;}});
 ui.data={clients:[client],visits:kind==='visits'?[record]:[],interventions:kind==='interventions'?[record]:[],events:[],people:[]};ui.section=kind;
 ui.save=async name=>{if(state.fail)await state.fail(name);state.writes.push(name);};ui.renderVisits=async()=>{};ui.renderInterventions=async()=>{};
 ui.openVisit=ui.openIntervention=()=>assert.fail('Must not open a report');ui.loadRecordPhotos=()=>assert.fail('Must not load report photos');ui.upsertLinkedEvent=()=>assert.fail('Must not change calendar');
 const edit=(field,value)=>{const input=document.querySelector('[name="'+field+'"]');input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 const submit=()=>document.getElementById('coordinateForm').onsubmit({preventDefault(){}});
 return {ui,client,record,state,document,dialog,edit,submit};
}
for(const kind of ['visits','interventions'])test('client phone can be corrected directly and its identical contact follows without changing report or calendar: '+kind,async t=>{
 const h=setup(t,kind),before=structuredClone(h.record);openCoordinateEditor(h.ui,'r',kind);assert.ok(h.document.getElementById('coordinateForm'));assert.equal(h.document.querySelector('#finishVisit,#finishInt'),null);
 h.edit('phone','0612345678');await h.submit();assert.equal(h.ui.data.clients[0].phone,'0612345678');assert.equal(h.record.sitePhone,'0612345678');if(kind==='visits')assert.equal(h.record.phone,'0612345678');
 const expected={...before,sitePhone:'0612345678',...(kind==='visits'?{phone:'0612345678'}:{})};delete expected.updatedAt;const after={...h.record};delete after.updatedAt;assert.deepEqual(after,expected);assert.deepEqual(h.state.writes,['clients',kind]);assert.equal(h.dialog.open,false);
});
test('a different site contact remains separate when the client phone changes',async t=>{
 const h=setup(t);h.record.siteContact='Gardien';h.record.sitePhone='0799999999';h.record.phone='0799999999';const before=structuredClone(h.record);
 openCoordinateEditor(h.ui,'r','visits');h.edit('phone','0612345678');await h.submit();assert.deepEqual(h.record,before);assert.deepEqual(h.state.writes,['clients']);assert.equal(h.ui.data.clients[0].phone,'0612345678');
});
test('a contact-only correction and a new contact value preserve all client properties',async t=>{
 const h=setup(t),before=structuredClone(h.client);openCoordinateEditor(h.ui,'r','visits');h.edit('sitePhone','0788888888');h.edit('phone','0612345678');await h.submit();assert.equal(h.record.sitePhone,'0788888888');assert.equal(h.ui.data.clients[0].phone,'0612345678');assert.deepEqual(h.ui.data.clients[0].sites,before.sites);assert.equal(h.ui.data.clients[0].custom,'keep');
});
test('refresh merges only edited fields and preserves a newer report and client metadata',async t=>{
 const h=setup(t);h.ui.c.prepareAppointmentWrite=async()=>{h.ui.data.clients=[{...h.client,custom:'new metadata'}];h.ui.data.visits=[{...h.record,summary:'New report',status:'terminee'}];};openCoordinateEditor(h.ui,'r','visits');h.edit('sitePhone','0788888888');await h.submit();assert.equal(h.ui.data.visits[0].summary,'New report');assert.equal(h.ui.data.visits[0].status,'terminee');assert.equal(h.ui.data.clients[0].custom,'new metadata');assert.deepEqual(h.state.writes,['visits']);
});
test('changed owner or concurrently changed phone is rejected with the correction still displayed',async t=>{
 const h=setup(t);openCoordinateEditor(h.ui,'r','visits');h.edit('sitePhone','0788888888');h.ui.c.prepareAppointmentWrite=async()=>{h.record.sitePhone='0711111111';};await h.submit();assert.equal(h.record.sitePhone,'0711111111');assert.equal(h.document.querySelector('[name=sitePhone]').value,'0788888888');assert.match(h.document.querySelector('[role=status]').textContent,/autre appareil/);assert.equal(h.state.writes.length,0);
});
test('a partial failure retains input and rolls back the contact; retry does not duplicate the client',async t=>{
 const h=setup(t),before=structuredClone(h.record);let fail=true;h.state.fail=async kind=>{if(kind==='visits'&&fail)throw Error('Réseau');};openCoordinateEditor(h.ui,'r','visits');h.edit('phone','0612345678');await h.submit();assert.deepEqual(h.record,before);assert.equal(h.ui.data.clients[0].phone,'0612345678');assert.match(h.document.querySelector('[role=status]').textContent,/fiche client est enregistrée/);fail=false;await h.submit();assert.equal(h.ui.data.clients.length,1);assert.equal(h.record.phone,'0612345678');
});
test('blank legacy fields do not block a phone correction; cancel writes nothing',async t=>{
 const h=setup(t);h.client.email='invalid legacy email';h.client.billingAddress='';openCoordinateEditor(h.ui,'r','visits');h.edit('sitePhone','0788888888');await h.submit();assert.equal(h.record.sitePhone,'0788888888');assert.deepEqual(h.state.writes,['visits']);h.state.writes=[];openCoordinateEditor(h.ui,'r','visits');h.edit('phone','different');await h.document.getElementById('cancelCoordinates').onclick();assert.deepEqual(h.state.writes,[]);
});
test('an existing client missing from cache is not recreated and technicians do not gain edit access',t=>{
 const h=setup(t);h.ui.data.clients=[];openCoordinateEditor(h.ui,'r','visits');assert.equal(h.document.getElementById('coordinateForm'),null);h.state.admin=false;assert.equal(coordinateButton(h.ui,h.record,'visits'),'');
});
test('the list and calendar open the small coordinate form instead of a report',async t=>{
 const h=setup(t);const root=h.document.getElementById('visitsPage');root.innerHTML=coordinateButton(h.ui,h.record,'visits');bindCoordinateButtons(h.ui,root);root.querySelector('button').click();assert.ok(h.document.getElementById('coordinateForm'));
 h.ui.teamNames=()=>'';h.ui.data.events=[{id:'e',kind:'visit',linkId:'r',start:h.record.plannedStart,end:h.record.plannedEnd,teamIds:[]}];await previewEvent(h.ui,'e');const button=h.dialog.querySelector('[data-coordinate-record]');assert.ok(button);button.click();assert.ok(h.document.getElementById('coordinateForm'));assert.equal(h.state.writes.length,0);
});
