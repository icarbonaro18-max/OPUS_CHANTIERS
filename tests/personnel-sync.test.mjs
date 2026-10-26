import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
 const state={writes:[],error:null,messages:[]};
 const ui=Object.assign(Object.create(OpsUI.prototype),{
  data:{people,events:[{id:'appointment',teamIds:['existing']}],interventions:[{id:'intervention',teamIds:['existing']}]},
  c:{getConfig:()=>({defaultPeople:structuredClone(defaults)}),toast:text=>state.messages.push(text)},
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

test('ambiguous Brahim aliases stay untouched while independent defaults before and after them are imported',async()=>{
 const before=[{id:'a',name:'Brahim Chatti'},{id:'b',name:'CHATTI Ibrahim'}];
 const {ui,state}=setup(before,[{name:'Nouveau collègue',role:'technicien'},definition(),{name:'Autre collègue',role:'technicien'}]);
 const warnings=await ui.syncDefaultPeople();assert.deepEqual(warnings,['CHATTI Brahim']);
 assert.deepEqual(ui.data.people.slice(0,2),before);assert.equal(ui.data.people.length,4);assert.equal(ui.data.people.some(p=>p.name==='CHATTI Brahim'),false);
 assert.equal(state.writes.length,1);assert.deepEqual(await ui.syncDefaultPeople(),warnings);assert.equal(state.writes.length,1);
 ui.role=()=> 'admin';assert.equal(await ui.syncPersonnel(),true);assert.equal(ui.personnelSyncComplete,true);
 assert.deepEqual(ui.personnelSyncWarnings,['CHATTI Brahim']);assert.match(state.messages[0],/^Personnel actualisé\. Fiches homonymes laissées inchangées : CHATTI Brahim\./);
});

test('matching never merges on first name alone and detects conflicting exact identifiers',async()=>{
 const {ui,state}=setup([{id:'other',name:'Ibrahim',employeeCode:'REAL-1',email:'other@example.test',officeManaged:true}]);
 await ui.syncDefaultPeople();assert.equal(ui.data.people.length,2);assert.equal(ui.data.people[0].schoolCalendar,undefined);assert.equal(state.writes.length,1);
 const d={...definition(),email:'one@example.test'},records=[{id:'one',name:'Autre personne',email:'one@example.test'},{id:'two',name:'CHATTI Brahim'}];
 const collision=setup(records,[d]);assert.deepEqual(await collision.ui.syncDefaultPeople(),['CHATTI Brahim']);assert.equal(collision.ui.data.people,records);assert.equal(collision.state.writes.length,0);
});

test('two Roberto records cannot block last-default Brahim, change linked IDs or repeat writes',async()=>{
 const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
 assert.equal(config.defaultPeople.length,8);assert.equal(config.defaultPeople.at(-1).name,'CHATTI Brahim');
 const robertoDefault=config.defaultPeople.find(p=>p.name==='CARBONARO Roberto');
 for(const collisionBy of ['name','email']){
  const people=config.defaultPeople.filter(p=>p.name!=='CHATTI Brahim').map((p,index)=>({...structuredClone(p),id:'existing-'+index,officeManaged:true,absences:[{start:'2026-12-24',end:'2026-12-31',type:'conge'}]}));
  const roberto=people.find(p=>p.name===robertoDefault.name);
  const duplicate={...structuredClone(roberto),id:'roberto-duplicate',employeeCode:'KEEP-DUPLICATE',name:collisionBy==='name'?robertoDefault.name:'Roberto Carbonaro',email:collisionBy==='email'?robertoDefault.email:'',active:false,customNote:'Ne pas fusionner'};
  people.push(duplicate,{id:'owner',name:'CARBONARO Ignazio',email:'ignazio@opuselec.fr',active:true,officeManaged:true},{id:'another-worker',name:'Autre intervenant',active:true,officeManaged:true});
  // Two Roberto identities, Ignazio and seven other colleagues already exist.
  assert.equal(people.length,10);const before=structuredClone(people),{ui,state}=setup(people,config.defaultPeople);ui.role=()=> 'admin';
  ui.data.events=[{id:'rob-planning',teamIds:[roberto.id]},{id:'duplicate-planning',teamIds:[duplicate.id]}];ui.data.interventions=[{id:'rob-report',teamIds:[roberto.id]}];
  const events=structuredClone(ui.data.events),interventions=structuredClone(ui.data.interventions);
  assert.equal(await ui.syncPersonnel(),true);assert.equal(ui.personnelSyncComplete,true);assert.equal(state.writes.length,1);
  assert.deepEqual(ui.data.people.slice(0,before.length),before);assert.equal(ui.data.people.length,11);
  const brahim=ui.data.people.find(p=>p.name==='CHATTI Brahim');assert.ok(brahim);assert.equal(brahim.active,true);assert.equal(brahim.role,'apprenti');assert.equal(brahim.weeklyTarget,35);
  assert.deepEqual(brahim.schoolCalendar,config.defaultPeople.at(-1).schoolCalendar);assert.deepEqual(ui.data.events,events);assert.deepEqual(ui.data.interventions,interventions);
  assert.deepEqual(ui.personnelSyncWarnings,['CARBONARO Roberto']);assert.equal(state.messages.length,1);assert.match(state.messages[0],/^Personnel actualisé\. Fiches homonymes laissées inchangées : CARBONARO Roberto\./);
  await ui.syncPersonnel();await ui.syncPersonnel();assert.equal(state.writes.length,1);assert.equal(state.messages.length,1);assert.equal(ui.data.people.filter(p=>p.name==='CHATTI Brahim').length,1);
 }
});

test('manager self-registration cannot create a third Roberto after ambiguous defaults were skipped',async()=>{
 const roberto={name:'CARBONARO Roberto',email:'roberto@opuselec.fr',employeeCode:'000001',role:'technicien',weeklyTarget:39};
 const people=[{id:'rob1',name:roberto.name,email:'',employeeCode:'000001',officeManaged:true},{id:'rob2',name:roberto.name,email:'',employeeCode:'KEEP',officeManaged:true}];
 const snapshot=structuredClone(people),{ui,state}=setup(people,[roberto,definition()]);ui.role=()=> 'manager';ui.c.getUser=()=>({displayName:'Roberto Carbonaro',mail:'roberto@opuselec.fr'});
 assert.equal(await ui.syncPersonnel(),true);assert.deepEqual(ui.data.people.slice(0,2),snapshot);assert.equal(ui.data.people.length,3);assert.equal(ui.data.people[2].name,'CHATTI Brahim');
 assert.equal(state.writes.length,1);assert.deepEqual(ui.personnelSyncWarnings,[roberto.name]);assert.equal(state.messages.length,1);
 await ui.syncPersonnel();assert.equal(state.writes.length,1);assert.equal(ui.data.people.length,3);assert.equal(state.messages.length,1);
});

test('an ambiguity does not hide a real save conflict or claim success before Brahim is persisted',async()=>{
 const roberto={name:'CARBONARO Roberto'},before=[{id:'r1',name:roberto.name},{id:'r2',name:roberto.name}];
 const {ui,state}=setup(before,[roberto,definition()]);ui.role=()=> 'admin';state.error=Object.assign(Error('La liste a changé'),{status:412});
 assert.equal(await ui.syncPersonnel(),false);assert.equal(ui.personnelSyncComplete,false);assert.equal(ui.needsRefresh,true);assert.equal(ui.data.people,before);
 assert.equal(state.messages.some(message=>message.startsWith('Personnel actualisé.')),false);assert.equal(ui.data.people.some(p=>p.name==='CHATTI Brahim'),false);
 state.error=null;ui.needsRefresh=false;assert.equal(await ui.syncPersonnel(),true);assert.equal(ui.data.people.filter(p=>p.name==='CHATTI Brahim').length,1);assert.equal(ui.personnelSyncComplete,true);
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
