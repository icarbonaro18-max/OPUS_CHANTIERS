import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {appointmentButton,bindAppointmentButtons,saveAppointment} from '../lib/service-requests.js';
import {privateEvents,editPrivateEvent} from '../lib/private-calendar.js';
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));

function setup(t,mail='roberto@opuselec.fr'){
 const dom=new JSDOM('<main id="cards"></main><div id="roleBadge"></div><div id="officePage"></div><dialog id="modal"></dialog>',{url:'https://opus.test'});
 const previous={};for(const key of ['document','window','localStorage','Event']){previous[key]=globalThis[key];globalThis[key]=dom.window[key];}
 t.after(()=>{dom.window.close();for(const key of Object.keys(previous)){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}});
 const dialog=document.getElementById('modal'),writes=[],notices=[];dialog.close=()=>dialog.removeAttribute('open');
 const ui=new OpsUI({graph:{},getUser:()=>({id:'account',mail,displayName:'Roberto Carbonaro'}),getConfig:()=>config,isAdmin:()=>false,getCatalog:()=>({projects:[]}),toast:s=>notices.push(s),prepareAppointmentWrite:async()=>{},modal:(_,html)=>{dialog.innerHTML=html;dialog.setAttribute('open','');}});
 ui.data={clients:[{id:'c',name:'Syndic',billingAddress:'1 rue du Cabinet',sites:[{id:'s',address:'2 rue du Site'}]}],people:[{id:'r',name:'Roberto',active:true,type:'internal',weeklyTarget:39},{id:'other',name:'Ruben',active:true,type:'internal',weeklyTarget:39}],interventions:[],visits:[],events:[],closures:[]};
 ui.save=async kind=>writes.push({kind,rows:structuredClone(ui.data[kind])});
 ui.saveWithFeedback=async(_,__,work)=>work();ui.renderInterventions=async()=>{};ui.renderVisits=async()=>{};
 const row={id:'record',number:'INT-001',clientId:'c',siteId:'s',clientName:'Syndic',siteAddress:'2 rue du Site',sitePhone:'0600000000',siteContact:'Gardien',title:'Éclairage',request:'Vérifier la panne',status:'a_planifier',teamIds:[],plannedStart:'',plannedEnd:'',photos:[],notes:'Notes conservées'};
 return {ui,row,writes,notices,dialog};
}

for(const kind of ['interventions','visits'])test('Roberto fixes '+kind+' date and all team members without changing client or report',async t=>{
 const {ui,row,writes}=setup(t);ui.data[kind]=[row];
 const original=structuredClone(row),cards=document.getElementById('cards');cards.innerHTML=appointmentButton(row,kind);bindAppointmentButtons(ui,cards);
 cards.querySelector('button').click();assert.ok(document.getElementById('correctAppointmentContact'));document.getElementById('setAppointmentDate').click();
 const form=document.getElementById('appointmentOnly');assert.ok(form);assert.equal(document.getElementById('iClient'),null);assert.equal(document.getElementById('vClient'),null);
 document.getElementById('appointmentDate').value='2026-10-28';document.getElementById('appointmentStart').value='09:00';document.getElementById('appointmentEnd').value='10:00';
 for(const cb of form.querySelectorAll('[name=appointmentPerson]'))cb.checked=true;
 await form.onsubmit({preventDefault(){}});
 assert.deepEqual(row.teamIds,['r','other']);assert.equal(ui.localDT(row.plannedStart),'2026-10-28T09:00');assert.equal(row.status,'planifiee');
 for(const key of ['clientId','siteId','clientName','siteAddress','siteContact','sitePhone','request','notes','photos'])assert.deepEqual(row[key],original[key]);
 assert.deepEqual(writes.map(w=>w.kind),[kind,'events']);assert.deepEqual(ui.data.events[0].teamIds,['r','other']);
});

test('Roberto edits existing field details while administration and private calendar stay unavailable',async t=>{
 const {ui,row}=setup(t);ui.data.interventions=[row];
 await ui.editIntervention(row);assert.ok(document.getElementById('intForm'));assert.equal(document.getElementById('deleteInt'),null);
 document.getElementById('iSiteContact').value='Nouveau gardien';await document.getElementById('intForm').onsubmit({preventDefault(){}});assert.equal(row.siteContact,'Nouveau gardien');
 const visit={...row,id:'v',type:'Visite avant devis'};ui.data.visits=[visit];await ui.editVisit(visit);assert.ok(document.getElementById('visitForm'));assert.equal(document.getElementById('deleteVisit'),null);assert.equal(document.getElementById('convertVisit'),null);
 document.getElementById('vAccess').value='Entrée cour';await document.getElementById('visitForm').onsubmit({preventDefault(){}});assert.equal(visit.siteAccess,'Entrée cour');
 const before=dialogHtml();ui.privateCalendar={ready:true,rows:[{id:'secret',ownerId:'account',title:'Privé'}]};assert.deepEqual(privateEvents(ui),[]);await editPrivateEvent(ui);assert.equal(dialogHtml(),before);
 ui.section='interventions';await ui.show('office');assert.equal(ui.section,'interventions');document.getElementById('officePage').innerHTML='<p>Ancien contenu</p>';await ui.renderOffice();assert.equal(document.getElementById('officePage').textContent,'');
 ui.updateRoleUI();assert.equal(document.getElementById('roleBadge').textContent,'Chef de chantier');
 function dialogHtml(){return document.getElementById('modal').innerHTML;}
});

test('regular technicians cannot plan through button, editor or direct submission',async t=>{
 const {ui,row,writes}=setup(t,'ruben@opuselec.fr');ui.data.interventions=[row];const root=document.getElementById('cards');root.innerHTML=appointmentButton(row,'interventions');bindAppointmentButtons(ui,root);root.querySelector('button').click();
 assert.equal(document.getElementById('setAppointmentDate'),null);assert.equal(document.getElementById('correctAppointmentContact'),null);
 await ui.editIntervention(row);await ui.editVisit({...row,id:'v'});assert.equal(document.getElementById('intForm'),null);assert.equal(document.getElementById('visitForm'),null);
 await assert.rejects(saveAppointment(ui,row,'interventions',{date:'2026-10-28',start:'09:00',end:'10:00',teamIds:['other']}),/chefs de chantier/);assert.equal(writes.length,0);
});

test('manager identity comes only from configured mail or principal name, never display name',async t=>{
 const {ui}=setup(t);ui.c.getUser=()=>({mail:' ROBERTO@OPUSELEC.FR '});assert.equal(ui.role(),'manager');
 ui.c.getUser=()=>({mail:'alias@example.test',userPrincipalName:'roberto@opuselec.fr'});assert.equal(ui.role(),'manager');
 ui.c.getUser=()=>({mail:'other@example.test',displayName:'Roberto Carbonaro'});assert.equal(ui.role(),'technician');
});
