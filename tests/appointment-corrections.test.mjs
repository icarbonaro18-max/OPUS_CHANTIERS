import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {unplanAppointment,finishAppointmentReplan,saveAppointment,needsAppointment} from '../lib/service-requests.js';
import {planningOriginals,reassignPlanning} from '../lib/planning-reassign.js';
import {calendarSaved,calendarUndoState,undoCalendarChange} from '../lib/calendar-undo.js';

const at=time=>new Date('2026-10-28T'+time).toISOString();
function setup(t,kind='visits'){
 const dom=new JSDOM('<main id="visitsPage"></main><main id="interventionsPage"></main><dialog id="modal"></dialog>',{url:'https://opus.test'});
 const previous=new Map(['window','document','localStorage','Event','confirm'].map(k=>[k,globalThis[k]]));
 for(const key of ['window','document','localStorage','Event'])globalThis[key]=dom.window[key];globalThis.confirm=()=>true;
 t.after(()=>{dom.window.close();for(const [key,value]of previous){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 const state={writes:[],remote:{},fail:null,admin:true,manager:false};
 const dialog=document.getElementById('modal');dialog.close=()=>dialog.removeAttribute('open');
 const ui=new OpsUI({graph:{},getUser:()=>({id:'owner',mail:'roberto@opuselec.fr',displayName:'Roberto'}),getConfig:()=>({managerUsers:state.manager?['roberto@opuselec.fr']:[]}),isAdmin:()=>state.admin,getCatalog:()=>({projects:[]}),toast(){},modal:(_,html)=>{dialog.innerHTML=html;dialog.setAttribute('open','');},prepareAppointmentWrite:async()=>{}});
 ui.data={clients:Array.from({length:350},(_,i)=>({id:'c'+i,name:'Client '+i,billingAddress:'Adresse agence '+i,sites:[{id:'s'+i,name:'Site '+i,address:'Adresse site '+i,phone:'0100000000'}]})),people:[{id:'p',name:'Roberto',active:true,weeklyTarget:39,type:'internal'}],events:[],visits:[],interventions:[],closures:[],projectTracking:[]};
 const record={id:'case',number:kind==='visits'?'VIS-1':'INT-1',type:'Visite avant devis',clientId:'c349',siteId:'s349',clientName:'Nom conservé sur la fiche',billingAddress:'Adresse agence conservée',siteName:'Résidence',siteAddress:'Adresse réelle',siteContact:'Gardien',sitePhone:'0612345670',siteEmail:'gardien@example.test',phone:'0612345670',email:'gardien@example.test',title:'Éclairage',request:'  Demande originale\n',status:'planifiee',plannedStart:at('09:00'),plannedEnd:at('10:00'),teamIds:['p'],teamSize:1,notes:'Ne pas effacer',summary:'Notes existantes',photos:[{dataUrl:'data:image/jpeg;base64,cGhvdG8='}],visitTasks:[],materialOrders:[{id:'order'}],sourceEmail:{id:'mail',text:'Demande d’origine'}};
 ui.data[kind]=[record];ui.data.events=[{id:'appointment',kind:kind==='visits'?'visit':'intervention',linkId:record.id,start:record.plannedStart,end:record.plannedEnd,teamIds:['p'],pauseHours:0,status:'planifie'}];
 const baseSave=async key=>{if(state.fail)await state.fail(key);state.writes.push(key);state.remote[key]=structuredClone(ui.data[key]);calendarSaved(ui,key);};ui.save=baseSave;
 ui.repo={load:async key=>structuredClone(state.remote[key]||ui.data[key]),save:async(key,rows)=>{state.remote[key]=structuredClone(rows);state.writes.push(key);}};
 ui.saveWithFeedback=async(_,__,work)=>work();ui.renderVisits=async()=>{};ui.renderInterventions=async()=>{};ui.openIntervention=async()=>{};
 return {ui,record,state,dialog,dom};
}
const business=r=>{const copy=structuredClone(r);delete copy.updatedAt;return copy;};

for(const kind of ['visits','interventions'])test('one-digit phone correction preserves all case fields and calendar for '+kind+' beyond client 250',async t=>{
 const {ui,record,state}=setup(t,kind),before=business(record),events=structuredClone(ui.data.events),clients=structuredClone(ui.data.clients);
 if(kind==='visits')await ui.editVisit(record);else await ui.editIntervention(record);
 const prefix=kind==='visits'?'v':'i';assert.equal(document.getElementById(prefix+'Client').value,'c349');assert.equal(document.getElementById(prefix+'Site').value,'s349');
 const search=document.getElementById(prefix+'ClientSearch');search.value='Client 0';search.oninput();assert.equal(document.getElementById(prefix+'Client').value,'c349');assert.equal(document.getElementById(prefix+'Site').value,'s349');
 // Even a new conflict/absence must not block a contact-only correction.
 ui.validateFormScheduling=()=>assert.fail('Contact correction must not revalidate its old appointment');
 document.getElementById(kind==='visits'?'vContactPhone':'iSitePhone').value='0612345678';
 await document.getElementById(kind==='visits'?'visitForm':'intForm').onsubmit({preventDefault(){}});
 const expected={...before,sitePhone:'0612345678',...(kind==='visits'?{phone:'0612345678'}:{})};
 assert.deepEqual(business(record),expected);assert.deepEqual(ui.data.events,events);assert.deepEqual(ui.data.clients,clients);assert.deepEqual(state.writes,[kind]);
});

for(const legacyId of ['deleted-client',''])test('a legacy visit keeps its saved client and site without recreating the base client: '+legacyId,async t=>{
 const {ui,record,state}=setup(t);record.clientId=legacyId;record.siteId='old-site';record.siteAddress='';const before=business(record),count=ui.data.clients.length;
 await ui.editVisit(record);assert.equal(document.getElementById('vClient').value,legacyId);assert.equal(document.getElementById('vSite').value,'old-site');assert.equal(document.getElementById('vMeetingAddress').required,false);
 document.getElementById('vContactPhone').value='0699999999';await document.getElementById('visitForm').onsubmit({preventDefault(){}});
 assert.deepEqual(business(record),{...before,sitePhone:'0699999999',phone:'0699999999'});assert.equal(ui.data.clients.length,count);assert.deepEqual(state.writes,['visits']);
});

test('failed contact save restores the backing record and retains the entered correction for retry',async t=>{
 const {ui,record,state}=setup(t),before=structuredClone(record);await ui.editVisit(record);document.getElementById('vContactPhone').value='0612345678';state.fail=async()=>{throw Error('Connexion interrompue');};
 await assert.rejects(document.getElementById('visitForm').onsubmit({preventDefault(){}}),/Connexion interrompue/);assert.deepEqual(record,before);assert.equal(document.getElementById('vContactPhone').value,'0612345678');
 state.fail=null;await document.getElementById('visitForm').onsubmit({preventDefault(){}});assert.equal(record.sitePhone,'0612345678');assert.equal(ui.data.events.length,1);
});

for(const kind of ['visits','interventions'])test('return '+kind+' to appointment-needed, restore displaced work, then assign a new slot',async t=>{
 const {ui,record,state}=setup(t,kind),before=structuredClone(record);
 state.admin=false;state.manager=true;
 const project={id:'project',kind:'project',linkId:'project-a',start:at('08:00'),end:at('17:00'),teamIds:['p'],pauseHours:1,status:'planifie'};
 ui.data.events=reassignPlanning([project],ui.data.events,[],ui.data.people);
 await unplanAppointment(ui,record,kind);assert.equal(needsAppointment(record),true);assert.equal(record.status,'a_planifier');assert.equal(record.plannedStart,'');assert.equal(record.plannedEnd,'');assert.equal(record.appointmentReplanPending,false);
 for(const key of ['clientId','clientName','siteAddress','sitePhone','notes','summary','photos','materialOrders','sourceEmail','teamIds'])assert.deepEqual(record[key],before[key]);
 assert.deepEqual(planningOriginals(ui.data.events).map(e=>e.id),['project']);assert.equal(ui.data.events[0].start,project.start);assert.equal(ui.data.events[0].end,project.end);assert.equal(record.actualStart,undefined);
 await saveAppointment(ui,record,kind,{date:'2026-10-29',start:'09:30',end:'10:30',teamIds:['p']});assert.equal(record.status,'planifiee');assert.equal(needsAppointment(record),false);assert.equal(ui.localDT(record.plannedStart),'2026-10-29T09:30');assert.equal(ui.data.events.filter(e=>e.linkId===record.id).length,1);
 assert.ok(state.writes.includes('events'));
});

test('new permissions and actual work are checked on the fresh row before removing any appointment',async t=>{
 const {ui,record,state}=setup(t);for(const change of [()=>{state.admin=false;state.manager=false;},()=>{state.admin=true;record.status='terminee';},()=>{record.status='planifiee';record.actualStart=at('09:00');}]){change();await assert.rejects(unplanAppointment(ui,record,'visits'));assert.equal(state.writes.length,0);assert.equal(ui.data.events.length,1);}
 delete record.actualStart;ui.c.prepareAppointmentWrite=async()=>{ui.data.visits=[{...record,actualEnd:at('10:00')}];};await assert.rejects(unplanAppointment(ui,record,'visits'),/horaires réalisés/);assert.equal(state.writes.length,0);
});

test('failed planning removal remains retryable and does not recreate the client or duplicate the appointment',async t=>{
 const {ui,record,state}=setup(t);let fail=true;state.fail=async key=>{if(key==='events'&&fail)throw Error('Réseau coupé');};
 await assert.rejects(unplanAppointment(ui,record,'visits'),/ancien créneau reste à retirer/);assert.equal(record.status,'a_planifier');assert.equal(record.appointmentReplanPending,true);assert.equal(ui.data.events.length,1);
 fail=false;await unplanAppointment(ui,record,'visits');assert.equal(record.appointmentReplanPending,false);assert.equal(ui.data.events.length,0);assert.equal(ui.data.visits.length,1);
});

test('a rejected case save does not remove the original calendar appointment',async t=>{
 const {ui,record,state}=setup(t),before=structuredClone(record);state.fail=async key=>{if(key==='visits')throw Error('Version différente');};await assert.rejects(unplanAppointment(ui,record,'visits'),/Version différente/);assert.deepEqual(record,before);assert.equal(ui.data.events.length,1);assert.equal(state.writes.length,0);
});

test('calendar undo restores a deplanned appointment without changing its corrected phone',async t=>{
 const {ui,record,state}=setup(t),oldStart=record.plannedStart;state.remote.visits=structuredClone(ui.data.visits);state.remote.events=structuredClone(ui.data.events);
 await unplanAppointment(ui,record,'visits');record.sitePhone='0699999999';await ui.save('visits');assert.equal(calendarUndoState(ui).available,true);
 await undoCalendarChange(ui);const current=ui.data.visits[0];assert.equal(current.plannedStart,oldStart);assert.equal(current.sitePhone,'0699999999');assert.equal(current.appointmentReplanPending,undefined);assert.equal(ui.data.events[0].id,'appointment');
});

test('visit buttons open only date/team and confirm replan before showing Fixer un rendez-vous',async t=>{
 const {ui,record,dom}=setup(t);await ui.openVisit(record.id);const edit=document.querySelector('[data-edit-appointment]');assert.ok(edit);await edit.onclick();assert.ok(document.getElementById('appointmentOnly'));assert.equal(document.getElementById('vClient'),null);
 await ui.openVisit(record.id);await document.querySelector('[data-unplan-appointment]').onclick();const form=document.getElementById('appointmentReplan');assert.ok(form);await form.onsubmit({preventDefault(){}});
 await OpsUI.prototype.renderVisits.call(ui);const button=document.querySelector('[data-fix-appointment]');assert.ok(button);assert.equal(button.textContent,'Fixer un rendez-vous');assert.equal(ui.visitView,'active');assert.equal(record.status,'a_planifier');
});

test('correcting the phone does not require repairing an unrelated legacy email, but a new invalid email is rejected',async t=>{
 const {ui,record,state}=setup(t);record.siteEmail='Ancienne adresse invalide';record.email=record.siteEmail;await ui.editVisit(record);const form=document.getElementById('visitForm');assert.equal(form.noValidate,true);
 document.getElementById('vContactPhone').value='0612345678';await form.onsubmit({preventDefault(){}});assert.equal(record.sitePhone,'0612345678');assert.equal(record.siteEmail,'Ancienne adresse invalide');
 document.getElementById('vContactEmail').value='Nouvelle adresse invalide';const writes=state.writes.length;await assert.rejects(form.onsubmit({preventDefault(){}}),/Vérifiez le champ/);assert.equal(state.writes.length,writes);assert.equal(record.siteEmail,'Ancienne adresse invalide');
});

test('changing only the date from the full visit editor preserves its existing client snapshot and report',async t=>{
 const {ui,record}=setup(t),before=business(record);await ui.editVisit(record);document.getElementById('vStart').value='2026-10-29T09:00';document.getElementById('vEnd').value='2026-10-29T10:00';await document.getElementById('visitForm').onsubmit({preventDefault(){}});
 assert.deepEqual(business(record),{...before,plannedStart:new Date('2026-10-29T09:00').toISOString(),plannedEnd:new Date('2026-10-29T10:00').toISOString()});assert.equal(ui.data.events.length,1);assert.equal(ui.data.events[0].start,record.plannedStart);
});

test('a lost final replan confirmation can finish before assigning a new date without recreating the old slot',async t=>{
 const {ui,record,state}=setup(t);let saves=0;state.fail=async key=>{if(key==='visits'&&++saves===2)throw Error('Confirmation perdue');};
 await assert.rejects(unplanAppointment(ui,record,'visits'),/Réessayez pour confirmer/);assert.equal(ui.data.events.length,0);assert.equal(record.appointmentReplanPending,true);
 state.fail=null;await saveAppointment(ui,record,'visits',{date:'2026-10-29',start:'11:00',end:'12:00',teamIds:['p']});assert.equal(record.appointmentReplanPending,false);assert.equal(ui.data.events.length,1);assert.equal(ui.localDT(record.plannedStart),'2026-10-29T11:00');assert.equal(ui.data.events[0].start,record.plannedStart);
});

test('a stale replan confirmation cannot remove a newer date assigned on another device',async t=>{
 const {ui,record,state}=setup(t);const fresh={...record,plannedStart:new Date('2026-10-29T14:00').toISOString(),plannedEnd:new Date('2026-10-29T15:00').toISOString()};
 ui.c.prepareAppointmentWrite=async()=>{ui.data.visits=[fresh];ui.data.events=[{...ui.data.events[0],start:fresh.plannedStart,end:fresh.plannedEnd}];};
 await assert.rejects(unplanAppointment(ui,record,'visits'),/autre appareil/);assert.equal(state.writes.length,0);assert.equal(fresh.status,'planifiee');assert.equal(ui.data.events[0].start,fresh.plannedStart);
});

test('the Fixer un rendez-vous contact for a legacy visit retains its own phone and email',async t=>{
 const {ui,record}=setup(t);record.status='a_planifier';record.plannedStart='';record.plannedEnd='';delete record.sitePhone;delete record.siteEmail;ui.clientById(record.clientId).phone='0100000000';
 await OpsUI.prototype.renderVisits.call(ui);document.querySelector('[data-fix-appointment]').click();assert.equal(document.querySelector('a[href^="tel:"]').getAttribute('href'),'tel:0612345670');assert.equal(document.querySelector('a[href^="mailto:"]').textContent,'gardien@example.test');
});

test('a phone correction after reconnect patches the refreshed case without restoring stale client or report data',async t=>{
 const {ui,record,state}=setup(t);await ui.editVisit(record);const form=document.getElementById('visitForm');assert.equal(form.dataset.recordEdit,'1');document.getElementById('vContactPhone').value='0612345678';
 const fresh={...record,clientId:'c10',clientName:'Client corrigé au bureau',siteId:'s10',siteAddress:'Nouvelle adresse vérifiée',summary:'Nouveau rapport du terrain',photos:[{id:'new-photo'}],notes:'Consigne ajoutée entre-temps'};
 ui.c.prepareAppointmentWrite=async()=>{ui.data.visits=[fresh];};await form.onsubmit({preventDefault(){}});
 assert.equal(fresh.sitePhone,'0612345678');assert.equal(fresh.phone,'0612345678');for(const key of ['clientId','clientName','siteId','siteAddress','summary','photos','notes'])assert.deepEqual(state.remote.visits[0][key],fresh[key]);assert.equal(fresh.clientId,'c10');assert.equal(fresh.summary,'Nouveau rapport du terrain');assert.equal(record.sitePhone,'0612345670');assert.deepEqual(state.writes,['visits']);
});

for(const kind of ['visits','interventions'])test('correcting a stale '+kind+' form cannot recreate a case removed during refresh',async t=>{
 const {ui,record,state}=setup(t,kind);if(kind==='visits')await ui.editVisit(record);else await ui.editIntervention(record);const form=document.getElementById(kind==='visits'?'visitForm':'intForm');document.getElementById(kind==='visits'?'vContactPhone':'iSitePhone').value='0612345678';
 ui.c.prepareAppointmentWrite=async()=>{ui.data[kind]=[];};await assert.rejects(form.onsubmit({preventDefault(){}}),/plus disponible/);assert.deepEqual(state.writes,[]);assert.equal(ui.data[kind].length,0);assert.equal(record.sitePhone,'0612345670');
});
