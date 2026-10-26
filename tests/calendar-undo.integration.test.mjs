import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {saveFreeAppointment,deleteFreeAppointment} from '../lib/free-appointments.js';
import {saveAppointment} from '../lib/service-requests.js';
import {planningOriginals,reassignPlanning} from '../lib/planning-reassign.js';
import {undoCalendarChange,calendarUndoState} from '../lib/calendar-undo.js';

const day='2026-10-26',at=(time,date=day)=>new Date(date+'T'+time).toISOString();
const business=row=>{const value=structuredClone(row);delete value.updatedAt;return value;};
const order=rows=>rows.map(business).sort((a,b)=>a.id.localeCompare(b.id));
const freeValues=(patch={})=>({title:'Nettoyage du dépôt',address:'Dépôt de Buc',instructions:'Ranger les outils',date:day,start:'10:00',end:'11:00',teamIds:['roberto'],pauseHours:0,exactHours:true,...patch});
const people=()=>['roberto','christian'].map(id=>({id,name:id,active:true,type:'internal',role:'technicien',weeklyTarget:39,absences:[],schoolPeriods:[],schoolDates:[]}));
const projectSlot=()=>({id:'project-slot',kind:'project',linkId:'project-a',title:'Chantier A',start:at('08:00'),end:at('17:00'),teamIds:['roberto','christian'],teamSize:2,pauseHours:1,exactHours:true,status:'planifie'});

function setup(t){
 const dom=new JSDOM('<main id="calendarPage"></main><main id="visitsPage"></main><main id="interventionsPage"></main><dialog id="modal"></dialog>',{url:'https://opus.example/'});
 const keys=['window','document','localStorage','Event','confirm'],previous=new Map(keys.map(key=>[key,globalThis[key]]));
 for(const key of keys.slice(0,-1))globalThis[key]=dom.window[key];globalThis.confirm=()=>true;
 const state={role:'admin',writes:[],toasts:[],stageChecks:0},remote={},tags=new Map();
 const config=()=>({managerUsers:state.role==='manager'?['planner@example.test']:[]});
 const dialog=document.getElementById('modal');dialog.close=()=>dialog.removeAttribute('open');
 const catalog={projects:[{id:'project-a',name:'Chantier A',category:'02'}],categories:[]};
 const ui=new OpsUI({graph:{},getUser:()=>({id:'planner',mail:'planner@example.test',displayName:'Planificateur'}),getConfig:config,isAdmin:()=>state.role==='admin',getCatalog:()=>catalog,
  toast:message=>state.toasts.push(message),modal:(_title,html)=>{dialog.innerHTML=html;dialog.setAttribute('open','');},
  prepareAppointmentWrite:async()=>{},cacheSavedKind:async()=>{},syncProjectStages:async()=>{state.stageChecks++;},ensurePlannedProject:async id=>({id,name:'Chantier A',category:'02'})});
 const repo={versions:new Map(),readFailures:new Set(),knownFiles:new Set(),hasLoadedAll:true,
  async load(kind,fallback=[]){this.versions.set(kind,tags.get(kind));this.readFailures.delete(kind);return structuredClone(remote[kind]??fallback);},
  async loadAll({shouldApply=()=>true}={}){if(!shouldApply())return null;for(const kind of Object.keys(remote))this.versions.set(kind,tags.get(kind));return structuredClone(remote);},
  async save(kind,rows){const beforeTag=this.versions.get(kind);assert.equal(beforeTag,tags.get(kind),'Writes must use the version of the last remote read');const tag='v'+(Number(String(tags.get(kind)).slice(1))+1);remote[kind]=structuredClone(rows);tags.set(kind,tag);this.versions.set(kind,tag);state.writes.push({kind,rows:structuredClone(rows),beforeTag,tag});return {eTag:tag};}
 };
 ui.repo=repo;ui.cacheMode=false;ui.hasLoadedRemote=true;
 const initial={clients:[],people:people(),events:[],visits:[],interventions:[],closures:[],projectTracking:[]};
 const seed=(patch={})=>{const data={...structuredClone(initial),...structuredClone(patch)};ui.data=data;for(const[kind,rows]of Object.entries(data)){remote[kind]=structuredClone(rows);tags.set(kind,'v1');repo.versions.set(kind,'v1');}};
 seed();ui.week=new Date(day+'T12:00:00');ui.dayCursor=new Date(day+'T12:00:00');ui.monthCursor=new Date(day+'T12:00:00');
 t.after(()=>{ui.calendarFitCleanup?.();dom.window.close();for(const[key,value]of previous){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 return {ui,repo,remote,state,seed,dialog,el:id=>document.getElementById(id)};
}

function seedDisplacedProjects(ui,seed){
 ui.c.getCatalog().projects.push({id:'project-b',name:'Chantier B',category:'02'});
 const source={...projectSlot(),teamIds:['roberto'],teamSize:1};
 const winner={...source,id:'winning-project',linkId:'project-b',title:'Chantier B',start:at('10:00'),end:at('11:00'),pauseHours:0};
 const events=reassignPlanning([source],[winner],[],ui.data.people);seed({events});
 assert.ok(ui.data.events.find(e=>e.id===winner.id).displacedProjects?.length);
 return {winnerId:winner.id,before:structuredClone(events)};
}

test('undoing a shared free booking restores the project slots it displaced through real OpsUI.save',async t=>{
 const {ui,seed,remote,state}=setup(t),project=projectSlot();seed({events:[project]});
 await saveFreeAppointment(ui,null,freeValues(),'free-a');
 assert.equal(calendarUndoState(ui).count,1);assert.equal(calendarUndoState(ui).available,true);
 assert.ok(ui.data.events.some(e=>e.allocationSourceId===project.id));assert.ok(ui.data.events.find(e=>e.id==='free-a')?.displacedProjects?.length);
 assert.ok(state.writes.some(write=>write.kind==='events'));
 await undoCalendarChange(ui);
 assert.deepEqual(order(ui.data.events),[project]);assert.deepEqual(order(remote.events),[project]);assert.equal(calendarUndoState(ui).count,0);
 assert.ok(Number.isFinite(Date.parse(remote.events[0].updatedAt)));
 assert.equal(ui.data.events.some(e=>e.allocationSourceId||e.displacedProjects),false);
});

test('free appointment modification and deletion undo in reverse order without losing unrelated rows',async t=>{
 const {ui,seed,remote}=setup(t);
 const original={id:'free-original',kind:'free',linkId:'',title:'Rangement',address:'Buc',instructions:'Conserver cette consigne',start:at('10:00'),end:at('11:00'),teamIds:['roberto'],teamSize:1,pauseHours:0,exactHours:true,status:'planifie'};
 const other={...original,id:'unrelated',title:'Autre équipe',teamIds:['christian'],start:at('15:00'),end:at('16:00')};seed({events:[original,other]});
 await saveFreeAppointment(ui,structuredClone(original),freeValues({title:'Inventaire',start:'13:00',end:'14:00'}));
 const edited=structuredClone(planningOriginals(ui.data.events).find(e=>e.id===original.id));
 assert.equal(edited.title,'Inventaire');await deleteFreeAppointment(ui,edited);
 assert.equal(calendarUndoState(ui).count,2);assert.equal(ui.data.events.some(e=>e.id===original.id),false);
 await undoCalendarChange(ui);assert.equal(calendarUndoState(ui).count,1);
 assert.deepEqual(business(ui.data.events.find(e=>e.id===original.id)),business(edited));assert.deepEqual(ui.data.events.find(e=>e.id===other.id),other);
 await undoCalendarChange(ui);assert.equal(calendarUndoState(ui).count,0);assert.deepEqual(order(remote.events),order([original,other]));
});

test('the actual planning form records several days and teams as one undo action',async t=>{
 const {ui,el,remote}=setup(t);await ui.planEvent();
 el('eventLink').value='project|project-a';el('eventLink').dispatchEvent(new window.Event('change'));
 el('eventDate').value=day;el('eventUntil').value='2026-10-28';el('eventStart').value='08:00';el('eventEnd').value='17:00';
 el('toggleTeam').click();const first=document.querySelector('#eventTeam [name=teamPerson][value=roberto]');first.checked=true;first.dispatchEvent(new window.Event('change'));
 el('addPeriod').click();const extra=document.querySelector('.extraPeriod');
 extra.querySelector('[data-p=from]').value='2026-10-29';extra.querySelector('[data-p=to]').value='2026-10-29';extra.querySelector('[data-extra-person][value=christian]').checked=true;
 await el('eventForm').onsubmit({preventDefault(){}});
 assert.equal(remote.events.length,4);assert.equal(new Set(remote.events.map(e=>e.seriesId)).size,1);
 assert.equal(calendarUndoState(ui).count,1,'Nested savePeriods must not create a second history action');
 await undoCalendarChange(ui);assert.equal(remote.events.length,0);assert.equal(ui.data.events.length,0);assert.equal(calendarUndoState(ui).count,0);
});

test('editing an existing winning project accepts its displacement ledger and undo restores both projects',async t=>{
 const {ui,seed,remote,state,el}=setup(t),{winnerId,before}=seedDisplacedProjects(ui,seed);
 await ui.planEvent(ui.data.events.find(e=>e.id===winnerId));
 el('eventStart').value='13:00';el('eventEnd').value='14:00';
 await el('eventForm').onsubmit({preventDefault(){}});
 assert.equal(planningOriginals(remote.events).find(e=>e.id===winnerId).start,at('13:00'));
 assert.equal(calendarUndoState(ui).count,1);assert.equal(state.writes.filter(w=>w.kind==='events').length,1);
 assert.ok(remote.events.some(e=>e.allocationSourceId==='project-slot'));
 await undoCalendarChange(ui);
 assert.deepEqual(order(remote.events),order(before));assert.deepEqual(order(ui.data.events),order(before));
 assert.equal(calendarUndoState(ui).count,0);
});

test('the existing-event guard still rejects a real remote change while preserving the unsent form',async t=>{
 const {ui,seed,repo,remote,state,dialog,el}=setup(t),{winnerId}=seedDisplacedProjects(ui,seed);
 await ui.planEvent(ui.data.events.find(e=>e.id===winnerId));
 el('eventStart').value='13:00';el('eventEnd').value='14:00';
 const remoteWinner={...planningOriginals(remote.events).find(e=>e.id===winnerId),start:at('15:00'),end:at('16:00'),instructions:'Consigne modifiée sur un autre appareil'};
 const changed=reassignPlanning(remote.events,[remoteWinner],[],ui.data.people);
 ui.c.prepareAppointmentWrite=async()=>{remote.events=structuredClone(changed);ui.data.events=await repo.load('events');};
 await assert.rejects(el('eventForm').onsubmit({preventDefault(){}}),/rendez-vous a changé/i);
 assert.equal(state.writes.length,0);assert.equal(calendarUndoState(ui).count,0);assert.deepEqual(remote.events,changed);
 assert.equal(dialog.open,true);assert.equal(el('eventStart').value,'13:00');assert.equal(el('eventEnd').value,'14:00');
 assert.equal(el('eventForm').querySelector('[type=submit]').disabled,false);
});

test('undoing date and team for a visit keeps client coordinates and the existing report',async t=>{
 const {ui,seed,remote}=setup(t);
 const visit={id:'visit-a',number:'VIS-001',clientId:'client-a',clientName:'Cabinet de test',siteAddress:'12 rue du Site',siteContact:'Gardien',sitePhone:'0600000000',siteEmail:'gardien@example.test',request:'Contrôle de l’éclairage',status:'a_planifier',plannedStart:'',plannedEnd:'',teamIds:[],teamSize:1,summary:'Observation à conserver',notes:'Accès par la cour',visitTasks:[{room:'Entrée',need:'Contrôle du luminaire',photos:['data:image/jpeg;base64,cGhvdG8=']}],clientReport:'Compte rendu rédigé',clientReportApproved:true};
 seed({visits:[visit]});
 await saveAppointment(ui,ui.data.visits[0],'visits',{date:day,start:'09:00',end:'10:00',teamIds:['christian']});
 assert.equal(remote.visits[0].status,'planifiee');assert.deepEqual(remote.visits[0].teamIds,['christian']);assert.equal(remote.events.length,1);
 assert.equal(calendarUndoState(ui).count,1,'The linked entity and its event are one operation');
 await undoCalendarChange(ui);
 assert.deepEqual(order(remote.visits),[visit]);assert.deepEqual(order(ui.data.visits),[visit]);assert.deepEqual(remote.events,[]);assert.deepEqual(ui.data.events,[]);
 assert.ok(Number.isFinite(Date.parse(remote.visits[0].updatedAt)));
});

test('undo remains outside the settings drawer in day/week/month views and respects planner roles',async t=>{
 const {ui,state,el,remote}=setup(t);await saveFreeAppointment(ui,null,freeValues(),'free-ui');
 for(const role of ['admin','manager']){
  state.role=role;
  for(const view of ['day','week','month']){
   ui.calendarView=view;await ui.renderCalendar();const button=el('calendarUndo');
   assert.ok(button,role+' '+view);assert.equal(button.disabled,false);assert.ok(button.closest('.calendarViewSwitch'));
   assert.equal(button.closest('#calendarSettingsDrawer'),null);assert.match(button.getAttribute('aria-label'),/Annuler/);
  }
 }
 state.role='technician';await ui.renderCalendar();assert.equal(el('calendarUndo'),null);
 await assert.rejects(undoCalendarChange(ui));assert.equal(remote.events.length,1);
 state.role='admin';await ui.renderCalendar();await el('calendarUndo').onclick();
 assert.equal(remote.events.length,0);assert.equal(el('calendarUndo').disabled,true);assert.equal(calendarUndoState(ui).count,0);
});
