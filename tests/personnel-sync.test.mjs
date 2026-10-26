import test from 'node:test';
import assert from 'node:assert/strict';
import {OpsUI} from '../lib/ops-ui.js';

const calendar=()=>({id:'cfa-eve-geii-but2-2026-2028-v1',label:'BUT GEII · CFA EVE / IUT Évry',from:'2026-09-01',through:'2027-09-30',note:'Calendrier prévisionnel. Calendrier 2027–2028 à compléter.',companyPeriods:[{start:'2026-10-12',end:'2026-10-16'}]});
const definition=()=>({name:'CHATTI Brahim',nameAliases:['Brahim Chatti','Ibrahim Chatti','CHATTI Ibrahim'],type:'internal',role:'apprenti',weeklyTarget:35,schoolPeriods:[{start:'2026-09-07',end:'2026-09-11',label:'École · BUT GEII'},{start:'2026-09-21',end:'2026-09-25',label:'École · BUT GEII'}],schoolCalendar:calendar()});
test('a failed personnel import stays pending and the next refresh can finish it once',async()=>{
 const {ui,state}=setup(),messages=[];ui.role=()=> 'admin';ui.c.toast=text=>messages.push(text);
 state.error=Object.assign(Error('Connexion interrompue'),{status:503});
 assert.equal(await ui.syncPersonnel(),false);assert.equal(ui.personnelSyncComplete,false);assert.equal(ui.data.people.length,0);
 assert.match(messages[0],/Connexion interrompue/);state.error=null;
 assert.equal(await ui.syncPersonnel(),true);assert.equal(ui.personnelSyncComplete,true);assert.equal(ui.data.people.length,1);
 await ui.syncPersonnel();assert.equal(state.writes.length,2);
});
function setup(people=[],defaults=[definition()]){
 const state={writes:[],error:null};
 const ui=Object.assign(Object.create(OpsUI.prototype),{
  data:{people,events:[{id:'appointment',teamIds:['existing']}],interventions:[{id:'intervention',teamIds:['existing']}]},
  c:{getConfig:()=>({defaultPeople:structuredClone(defaults)})},
  repo:{save:async(kind,rows)=>{state.writes.push({kind,rows:structuredClone(rows)});if(state.error)throw state.error;}}
 });
 return {ui,state,defaults};
}

test('new Brahim gets school calendar and 35h once without invented contact identifiers',async()=>{
 const {ui,state}=setup();await ui.syncDefaultPeople();assert.equal(ui.data.people.length,1);
 const p=ui.data.people[0];assert.ok(p.id);assert.equal(p.name,'CHATTI Brahim');assert.equal(p.role,'apprenti');assert.equal(p.weeklyTarget,35);
 assert.equal(p.type,'internal');assert.equal(p.employeeCode,'');assert.equal(p.email,'');assert.deepEqual(p.schoolPeriods,definition().schoolPeriods);
 assert.deepEqual(p.schoolCalendar,calendar());assert.deepEqual(p.absences,[]);assert.deepEqual(p.schoolDates,[]);
 await ui.syncDefaultPeople();assert.equal(state.writes.length,1);assert.equal(state.writes[0].kind,'people');
});

test('exact full-name aliases migrate office-managed record without changing identity, availability or assignments',async()=>{
 for(const name of ['Brahim Chatti','  IBRÁHIM   CHÂTTI  ','CHATTI Ibrahim']){
  const manual={start:'2026-09-07',end:'2026-09-11',label:'Période déjà saisie au bureau',manual:true};
  const p={id:'existing',name,email:'brahim@company.example',employeeCode:'REAL-42',officeManaged:true,active:false,type:'internal',role:'technicien',weeklyTarget:39,vehicle:true,availableFrom:'2026-01-01',availableTo:'2028-12-31',reservedProjectId:'chantier',schoolPeriods:[manual,{start:'2026-10-05',end:'2026-10-06',label:'Autre formation'}],schoolDates:['2026-10-01'],absences:[{start:'2026-12-21',end:'2026-12-25',type:'conge'}]};
  const {ui,state}=setup([structuredClone(p)]),events=ui.data.events,interventions=ui.data.interventions;
  await ui.syncDefaultPeople();assert.equal(ui.data.people.length,1);const result=ui.data.people[0];
  for(const key of ['id','name','email','employeeCode','officeManaged','active','type','vehicle','availableFrom','availableTo','reservedProjectId','absences'])assert.deepEqual(result[key],p[key],key);
  assert.equal(result.role,'apprenti');assert.equal(result.weeklyTarget,35);assert.equal(result.schoolPeriods.length,3);assert.deepEqual(result.schoolPeriods[0],manual);
  assert.deepEqual(result.schoolDates,['2026-10-01']);assert.deepEqual(result.schoolCalendar,calendar());assert.equal(ui.data.events,events);assert.equal(ui.data.interventions,interventions);
  await ui.syncDefaultPeople();assert.equal(state.writes.length,1);
 }
});

test('same calendar marker preserves later office corrections even on non-office-managed record',async()=>{
 const {ui,state}=setup();await ui.syncDefaultPeople();const p=ui.data.people[0];
 p.schoolPeriods=[{start:'2026-10-09',end:'2026-10-09',label:'Correction bureau'}];p.schoolDates=['2026-11-05'];p.weeklyTarget=34;p.role='apprenti personnalisé';
 p.schoolCalendar.companyPeriods=[];p.schoolCalendar.note='Calendrier corrigé au bureau';
 const before=structuredClone(p);await ui.syncDefaultPeople();assert.deepEqual(ui.data.people[0],before);assert.equal(state.writes.length,1);
});

test('ordinary default schoolDates compare by contents and do not write on every refresh',async()=>{
 const defaults=[{name:'AUTRE Apprenti',type:'internal',role:'apprenti',weeklyTarget:35,schoolDates:['2026-10-05'],schoolPeriods:[]}];
 const {ui,state}=setup([],defaults);await ui.syncDefaultPeople();await ui.syncDefaultPeople();await ui.syncDefaultPeople();
 assert.equal(state.writes.length,1);assert.deepEqual(ui.data.people[0].schoolDates,['2026-10-05']);
 const office={...ui.data.people[0],officeManaged:true,weeklyTarget:39};ui.data.people=[office];await ui.syncDefaultPeople();assert.equal(ui.data.people[0],office);assert.equal(office.weeklyTarget,39);
});

test('ambiguous aliases reject the whole staged batch without merging, duplicating or writing personnel',async()=>{
 const before=[{id:'a',name:'Brahim Chatti'},{id:'b',name:'CHATTI Ibrahim'}];
 const {ui,state}=setup(before,[{name:'Nouveau collègue',role:'technicien'},definition()]);
 await assert.rejects(ui.syncDefaultPeople(),/plusieurs fiches.*aucune fiche n’a été fusionnée/);
 assert.equal(ui.data.people,before);assert.deepEqual(ui.data.people,[{id:'a',name:'Brahim Chatti'},{id:'b',name:'CHATTI Ibrahim'}]);assert.equal(state.writes.length,0);
});

test('matching never merges on first name alone and detects conflicting exact identifiers',async()=>{
 const {ui,state}=setup([{id:'other',name:'Ibrahim',employeeCode:'REAL-1',email:'other@example.test',officeManaged:true}]);
 await ui.syncDefaultPeople();assert.equal(ui.data.people.length,2);assert.equal(ui.data.people[0].schoolCalendar,undefined);assert.equal(state.writes.length,1);
 const d={...definition(),email:'one@example.test'},records=[{id:'one',name:'Autre personne',email:'one@example.test'},{id:'two',name:'CHATTI Brahim'}];
 const collision=setup(records,[d]);await assert.rejects(collision.ui.syncDefaultPeople(),/plusieurs fiches/);assert.equal(collision.ui.data.people,records);assert.equal(collision.state.writes.length,0);
});

test('network or 412 failure rolls back imported periods, marker and additions while retaining conflict guard',async()=>{
 for(const status of [503,412]){
  const original={id:'existing',name:'Brahim Chatti',officeManaged:true,role:'technicien',weeklyTarget:39,email:'real@example.test',schoolPeriods:[],absences:[{type:'conge',start:'2026-12-01',end:'2026-12-02'}]};
  const before=[original],snapshot=structuredClone(before);const {ui,state}=setup(before,[definition(),{name:'Nouveau collègue'}]);state.error=Object.assign(Error('Microsoft unavailable'),{status});
  await assert.rejects(ui.syncDefaultPeople(),error=>error===state.error);assert.equal(ui.data.people,before);assert.equal(ui.data.people[0],original);assert.deepEqual(ui.data.people,snapshot);
  assert.equal(ui.data.people[0].schoolCalendar,undefined);assert.equal(ui.data.people.length,1);assert.equal(state.writes.length,1);
  assert.equal(!!ui.needsRefresh,status===412);
 }
});
