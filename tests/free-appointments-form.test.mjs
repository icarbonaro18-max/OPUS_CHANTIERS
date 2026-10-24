import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {editFreeAppointment,saveFreeAppointment} from '../lib/free-appointments.js';
import {planningOriginals} from '../lib/planning-reassign.js';

const date='2026-10-26';
const people=()=>[
 {id:'r',name:'Roberto',active:true,type:'internal',weeklyTarget:39},
 {id:'c',name:'Christian',active:true,type:'internal',weeklyTarget:39},
 {id:'away',name:'Absent',active:true,type:'internal',weeklyTarget:39,absences:[{start:date,end:date,type:'conge'}]},
 {id:'school',name:'Apprenti',active:true,type:'internal',role:'apprenti',weeklyTarget:35,schoolDates:[date]},
 {id:'inactive',name:'Ancien salarié',active:false,type:'internal',weeklyTarget:39}
];
function setup(t){
 const dom=new JSDOM('<main id="calendarPage"></main><dialog id="modal"></dialog>',{url:'https://opus.example'});
 const previous={};for(const key of ['document','window','localStorage','Event','confirm'])previous[key]=globalThis[key];
 for(const key of ['document','window','localStorage','Event'])globalThis[key]=dom.window[key];globalThis.confirm=()=>true;
 const state={admin:true,writes:[],toasts:[],closes:0,rendered:0,failure:null,prepared:0};
 const dialog=document.getElementById('modal');dialog.close=()=>{dialog.removeAttribute('open');state.closes++;};
 const graph={writeJson:async(_root,file,value,headers)=>{
  state.writes.push({file,value:structuredClone(value),headers:{...headers}});
  if(state.failure)throw state.failure;
  return {eTag:'v'+(state.writes.length+1)};
 }};
 const ui=new OpsUI({graph,getUser:()=>({id:'admin',mail:'owner@example.test'}),getConfig:()=>({managerUsers:state.manager?['owner@example.test']:[]}),isAdmin:()=>state.admin,
  getCatalog:()=>({projects:[],categories:[]}),toast:text=>state.toasts.push(text),
  prepareAppointmentWrite:async()=>{state.prepared++;},
  modal:(_title,html)=>{dialog.innerHTML=html;dialog.setAttribute('open','');}
 });
 ui.data={clients:[],people:people(),events:[],interventions:[],visits:[],closures:[],projectTracking:[]};
 ui.repo.root={id:'ops'};ui.repo.versions.set('events','v1');ui.repo.hasLoadedAll=true;ui.hasLoadedRemote=true;ui.cacheMode=false;
 ui.week=new Date(date+'T12:00:00');ui.dayCursor=new Date(date+'T12:00:00');ui.monthCursor=new Date(date+'T12:00:00');
 const render=ui.renderCalendar.bind(ui);ui.renderCalendar=async()=>{state.rendered++;};
 t.after(()=>{ui.calendarFitCleanup?.();dom.window.close();for(const key of Object.keys(previous)){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}});
 const el=id=>document.getElementById(id),select=id=>{const cb=document.querySelector('[name=teamPerson][value="'+id+'"]');cb.checked=true;cb.dispatchEvent(new window.Event('change',{bubbles:true}));};
 const fill=()=>{el('freeTitle').value='Nettoyage du dépôt';el('freeAddress').value='Dépôt OPUS ELEC, Buc';el('freeInstructions').value='Ranger les bobines et les outils.';};
 const submit=()=>el('freeEventForm').onsubmit({preventDefault(){}});
 return {ui,state,dialog,el,select,fill,submit,render};
}

test('calendar opens shared free appointment and saves two people without any client or project',async t=>{
 const {ui,state,el,select,fill,submit,render}=setup(t);
 await render();assert.ok(el('planFreeEvent').closest('#calendarSettingsDrawer'));el('planFreeEvent').click();assert.ok(el('freeEventForm'));assert.equal(el('eventLink'),null);assert.equal(el('freeEventForm').querySelector('select'),null);
 el('freeDate').value=date;el('freeDate').onchange();fill();select('r');select('c');await submit();
 assert.equal(state.writes.length,1);assert.equal(state.writes[0].file,'events.json');assert.equal(state.writes[0].headers['If-Match'],'v1');
 const saved=ui.data.events[0];assert.equal(saved.kind,'free');assert.equal(saved.linkId,'');assert.deepEqual(saved.teamIds,['r','c']);
 assert.equal(saved.title,'Nettoyage du dépôt');assert.equal(saved.address,'Dépôt OPUS ELEC, Buc');assert.match(saved.instructions,/bobines/);
 assert.equal(ui.data.clients.length,0);assert.equal(ui.data.interventions.length,0);assert.equal(ui.data.visits.length,0);
 assert.equal(state.closes,1);assert.equal(state.toasts.length,1);assert.match(state.toasts[0],/enregistré/);
});

test('manager drawer opens the free editor; technician calendar has no create action',async t=>{
 const {ui,state,el,render}=setup(t);state.admin=false;state.manager=true;await render();
 assert.equal(ui.role(),'manager');assert.ok(el('planFreeEvent').closest('#calendarSettingsDrawer'));el('planFreeEvent').click();assert.ok(el('freeEventForm'));
 el('modal').innerHTML='';state.manager=false;await render();assert.equal(ui.role(),'technician');assert.equal(el('planFreeEvent'),null);
 editFreeAppointment(ui,null,{date,start:'09:00'});assert.equal(el('freeEventForm'),null);
});

test('all-team button excludes absent, school and inactive staff and individual filter supplies default',async t=>{
 const {ui,el}=setup(t);ui.calendarPersonId='c';editFreeAppointment(ui,null,{date,start:'09:00'});
 const checked=()=>[...document.querySelectorAll('[name=teamPerson]:checked')].map(cb=>cb.value);
 assert.deepEqual(checked(),['c']);el('freeAll').click();assert.deepEqual(checked(),['r','c']);
 assert.equal(document.querySelector('[name=teamPerson][value=inactive]'),null);
 assert.equal(document.querySelector('[name=teamPerson][value=away]').disabled,true);assert.equal(document.querySelector('[name=teamPerson][value=school]').disabled,true);
 el('freeNone').click();assert.deepEqual(checked(),[]);
});

test('editing and deleting a free appointment restores the project slots it displaced',async t=>{
 const {ui,state,el,select,fill,submit}=setup(t);
 const project={id:'project-slot',kind:'project',linkId:'project',title:'Chantier',start:new Date(date+'T08:00').toISOString(),end:new Date(date+'T17:00').toISOString(),teamIds:['r','c'],teamSize:2,pauseHours:1,exactHours:true,status:'planifie'};
 ui.data.events=[structuredClone(project)];editFreeAppointment(ui,null,{date,start:'10:00'});fill();select('r');await submit();
 const free=planningOriginals(ui.data.events).find(e=>e.kind==='free');assert.ok(free);assert.ok(ui.data.events.some(e=>e.allocationSourceId===project.id));
 editFreeAppointment(ui,free);el('freeTitle').value='Inventaire du dépôt';el('freeStart').value='14:00';el('freeEnd').value='15:00';await submit();
 const updated=planningOriginals(ui.data.events).find(e=>e.id===free.id);assert.equal(updated.title,'Inventaire du dépôt');assert.equal(new Date(updated.start).getHours(),14);
 assert.equal(planningOriginals(ui.data.events).filter(e=>e.kind==='free').length,1);
 editFreeAppointment(ui,updated);await el('freeDelete').onclick();assert.deepEqual(ui.data.events,[project]);assert.equal(state.writes.length,3);assert.match(state.toasts.at(-1),/supprimé/);
});

test('temporary network failure leaves the form and choices intact and retry creates only one event',async t=>{
 const {ui,state,el,select,fill,submit,dialog}=setup(t);editFreeAppointment(ui,null,{date,start:'09:00'});fill();select('r');select('c');
 const before=ui.data.events;state.failure=new TypeError('Réseau indisponible');await submit();
 assert.equal(ui.data.events,before);assert.equal(state.closes,0);assert.equal(state.toasts.length,0);assert.equal(dialog.open,true);assert.match(el('freeStatus').textContent,/Réseau/);
 assert.equal(el('freeTitle').value,'Nettoyage du dépôt');assert.equal(el('freeInstructions').value,'Ranger les bobines et les outils.');assert.equal(el('freeEventForm').dataset.busy,undefined);
 assert.deepEqual([...document.querySelectorAll('[name=teamPerson]:checked')].map(cb=>cb.value),['r','c']);assert.equal(el('freeTitle').disabled,false);
 const id=state.writes[0].value[0].id;state.failure=null;await submit();assert.equal(ui.data.events.length,1);assert.equal(ui.data.events[0].id,id);assert.equal(state.closes,1);assert.equal(state.toasts.length,1);
});

test('permission loss before submission rejects changes without a success message',async t=>{
 const {ui,state,el,select,fill,submit}=setup(t);editFreeAppointment(ui,null,{date,start:'09:00'});fill();select('r');state.admin=false;await submit();
 assert.equal(state.writes.length,0);assert.equal(state.closes,0);assert.equal(ui.data.events.length,0);assert.equal(state.toasts.length,0);assert.match(el('freeStatus').textContent,/réservée au bureau/);
 // Also guard the exported operation, not merely the hidden editor button.
 await assert.rejects(saveFreeAppointment(ui,null,{title:'Forbidden',date,start:'09:00',end:'10:00',pauseHours:0,teamIds:['r']}),/réservée au bureau/);
});

test('412 conflict rolls back slot displacement and preserves the unsent form',async t=>{
 const {ui,state,el,select,fill,submit}=setup(t);
 const project={id:'p',kind:'project',linkId:'p',title:'Chantier',start:new Date(date+'T08:00').toISOString(),end:new Date(date+'T17:00').toISOString(),teamIds:['r'],pauseHours:1,exactHours:true};
 ui.data.events=[project];const before=ui.data.events;editFreeAppointment(ui,null,{date,start:'09:00'});fill();select('r');state.failure=Object.assign(Error('Conflict'),{status:412});await submit();
 assert.equal(ui.data.events,before);assert.deepEqual(ui.data.events,[project]);assert.equal(ui.needsRefresh,true);assert.equal(state.writes[0].headers['If-Match'],'v1');assert.equal(state.toasts.length,0);assert.equal(state.closes,0);
 assert.equal(el('freeTitle').value,'Nettoyage du dépôt');assert.match(el('freeStatus').textContent,/autre appareil/);assert.equal(el('freeTitle').disabled,false);
});
