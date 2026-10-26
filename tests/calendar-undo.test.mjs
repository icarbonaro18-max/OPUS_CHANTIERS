import test from 'node:test';
import assert from 'node:assert/strict';
import {OpsRepository} from '../lib/ops.js';
import {reassignPlanning} from '../lib/planning-reassign.js';
import {withCalendarHistory,calendarSaved,rememberPrivateChange,undoCalendarChange,calendarUndoState} from '../lib/calendar-undo.js';

const copy=value=>structuredClone(value),at=hour=>'2026-10-26T'+hour+':00';
const person={id:'r',name:'Robert',active:true,weeklyTarget:39};
const booking=(id='e',from='09:00',to='10:00')=>({id,kind:'free',title:id,start:at(from),end:at(to),teamIds:['r'],status:'planifie',exactHours:true});
const clean=rows=>rows.map(({updatedAt,...row})=>row);
async function fixture(seed={}){
 const data={people:[person],closures:[],events:[],visits:[],interventions:[],...copy(seed)},server=copy(data),etags=new Map(Object.keys(data).map(kind=>[kind,1])),calls=[],cache=[];
 let failKind=null,failCount=0,beforeLoad=null,beforeWrite=null;
 const g={folder:async()=>({id:'root'}),named:async(root,file)=>{const kind=file.slice(0,-5);await beforeLoad?.(kind);return {id:kind,eTag:'v'+etags.get(kind)};},json:async id=>copy(server[id]),writeJson:async(root,file,rows,headers)=>{
  const kind=file.slice(0,-5);calls.push({kind,rows:copy(rows),headers:copy(headers)});await beforeWrite?.(kind);
  if(kind===failKind&&failCount-->0)throw Error('Réseau momentanément coupé');
  if(headers['If-Match']!=='v'+etags.get(kind))throw Object.assign(Error('Concurrent write'),{status:412});
  server[kind]=copy(rows);etags.set(kind,etags.get(kind)+1);return {id:kind,eTag:'v'+etags.get(kind)};
 }};
 const repo=new OpsRepository(g);for(const kind of Object.keys(data))await repo.load(kind);
 const ui={data,repo,user:{id:'owner'},canPlan:()=>true,c:{isAdmin:()=>true,cacheSavedKind:async(kind,rows)=>cache.push([kind,copy(rows)]),syncProjectStages:async()=>{}},onCalendarHistoryChanged(){},async save(kind){await repo.save(kind,this.data[kind]);calendarSaved(this,kind);await this.c.cacheSavedKind?.(kind,this.data[kind]);}};
 return {ui,server,calls,cache,remote(kind,rows){server[kind]=copy(rows);etags.set(kind,etags.get(kind)+1);},fail(kind,count=1){failKind=kind;failCount=count;},onLoad(fn){beforeLoad=fn;},onWrite(fn){beforeWrite=fn;}};
}
async function changeEvent(ui,next,label='Modifier un rendez-vous'){
 await withCalendarHistory(ui,label,async()=>{ui.data.events=copy(next);await ui.save('events');});
}

test('create, edit, delete undo in reverse order while preserving unrelated remote rows',async()=>{
 const {ui,server,remote,calls}=await fixture();
 await changeEvent(ui,[booking()],'Ajouter');
 await changeEvent(ui,[{...booking(),title:'Nouveau titre'}],'Modifier');
 await changeEvent(ui,[],'Supprimer');
 remote('events',[{...booking('other','14:00','15:00'),teamIds:[]}]);
 assert.equal(calendarUndoState(ui).count,3);
 await undoCalendarChange(ui);assert.equal(server.events.find(e=>e.id==='e').title,'Nouveau titre');
 await undoCalendarChange(ui);assert.equal(server.events.find(e=>e.id==='e').title,'e');
 await undoCalendarChange(ui);assert.deepEqual(server.events.map(e=>e.id),['other']);
 assert.equal(calendarUndoState(ui).available,false);assert.ok(calls.every(c=>c.headers['If-Match']));
});

test('the full split/displacement ledger is restored without recomputing priorities',async()=>{
 const project={...booking('project','08:00','17:00'),kind:'project',linkId:'chantier',teamIds:['r','a'],allocationPriority:7,pauseHours:1};
 const {ui,server}=await fixture({people:[person,{id:'a',name:'Alban'}],events:[project]});
 const split=reassignPlanning(ui.data.events,[booking('urgent','10:00','12:00')],[],ui.data.people);
 await changeEvent(ui,split);assert.ok(server.events.some(row=>row.displacedProjects?.length));
 await undoCalendarChange(ui);assert.deepEqual(clean(server.events),[project]);
});

test('only confirmed writes enter history, even when a post-commit cache step fails',async()=>{
 const {ui,server,fail}=await fixture();fail('events');
 await assert.rejects(changeEvent(ui,[booking()]),/Réseau/);assert.equal(calendarUndoState(ui).count,0);assert.deepEqual(server.events,[]);
 ui.data.events=[];ui.c.cacheSavedKind=async()=>{throw Error('Cache indisponible');};
 await assert.rejects(changeEvent(ui,[booking()]),/Cache/);assert.equal(calendarUndoState(ui).count,1);
 const result=await undoCalendarChange(ui);assert.equal(result.committed,true);assert.match(result.notificationError,/Cache/);assert.deepEqual(server.events,[]);assert.equal(calendarUndoState(ui).count,0);
});

test('nested calendar work is one action and failed second collection records only the first commit',async()=>{
 const visit={id:'v',status:'a_planifier',clientName:'Client',notes:'Rapport initial',photos:[{dataUrl:'untouched'}]};
 const {ui,server,fail}=await fixture({visits:[visit]});fail('events');
 await assert.rejects(withCalendarHistory(ui,'Fixer la visite',async()=>{
  Object.assign(ui.data.visits[0],{plannedStart:at('09:00'),plannedEnd:at('10:00'),teamIds:['r'],status:'planifiee'});await ui.save('visits');
  await withCalendarHistory(ui,'Créneau lié',async()=>{ui.data.events=[{...booking(),kind:'visit',linkId:'v'}];await ui.save('events');});
 }),/Réseau/);
 assert.equal(calendarUndoState(ui).count,1);assert.equal(calendarUndoState(ui).label,'Fixer la visite');
 await undoCalendarChange(ui);assert.deepEqual(clean(server.visits),[visit]);assert.deepEqual(server.events,[]);
});

test('remote case contact, report text and untouched planning fields survive a date/team undo',async()=>{
 const visit={id:'v',status:'a_planifier',clientName:'Client',sitePhone:'01',notes:'Rapport initial',photos:[{dataUrl:'initial'}],vehicle:false};
 const {ui,server,remote}=await fixture({visits:[visit]});
 await withCalendarHistory(ui,'Fixer la visite',async()=>{Object.assign(ui.data.visits[0],{plannedStart:at('09:00'),plannedEnd:at('10:00'),teamIds:['r'],status:'planifiee'});await ui.save('visits');});
 remote('visits',[{...server.visits[0],sitePhone:'02',notes:'Rapport plus récent',photos:[{dataUrl:'new'}],vehicle:true}]);
 await undoCalendarChange(ui);
 assert.equal(server.visits[0].status,'a_planifier');assert.equal(server.visits[0].plannedStart,undefined);assert.equal(server.visits[0].sitePhone,'02');assert.equal(server.visits[0].notes,'Rapport plus récent');assert.equal(server.visits[0].vehicle,true);assert.deepEqual(server.visits[0].photos,[{dataUrl:'new'}]);
});

test('a changed event or missing linked case blocks every collection before any undo write',async()=>{
 for(const type of ['changed','missing']){
  const visit={id:'v',status:'a_planifier'},f=await fixture({visits:[visit]});
  await withCalendarHistory(f.ui,'Visite',async()=>{Object.assign(f.ui.data.visits[0],{plannedStart:at('09:00'),plannedEnd:at('10:00'),status:'planifiee'});await f.ui.save('visits');f.ui.data.events=[{...booking(),kind:'visit',linkId:'v'}];await f.ui.save('events');});
  if(type==='changed')f.remote('events',[{...f.server.events[0],title:'Changement Robert'}]);else f.remote('visits',[]);
  const count=f.calls.length;await assert.rejects(undoCalendarChange(f.ui),/changé|disponible/);assert.equal(f.calls.length,count);assert.equal(calendarUndoState(f.ui).count,1);
 }
});

test('linked report status or actual progress prevents removing its calendar appointment',async()=>{
 for(const patch of [{status:'terminee'},{actualStart:at('09:05')},{reportItems:[{id:'panel',startedAt:at('09:05')}]}]){
  const f=await fixture({interventions:[{id:'i',status:'planifiee'}]});
  await changeEvent(f.ui,[{...booking(),kind:'intervention',linkId:'i'}]);f.remote('interventions',[{...f.server.interventions[0],...patch}]);
  const writes=f.calls.length;await assert.rejects(undoCalendarChange(f.ui),/rapport, horaires réalisés ou statut/);assert.equal(f.calls.length,writes);
 }
});

test('a new remote appointment occupying the old slot is not displaced by undo',async()=>{
 const f=await fixture({events:[booking()]});await changeEvent(f.ui,[booking('e','11:00','12:00')]);
 f.remote('events',[...f.server.events,booking('new','09:30','10:30')]);
 const writes=f.calls.length;await assert.rejects(undoCalendarChange(f.ui),/autre rendez-vous/);assert.equal(f.calls.length,writes);assert.equal(f.server.events.find(e=>e.id==='new').start,at('09:30'));
});

test('fresh school, absence, inactive staff and closure data block restoration',async()=>{
 for(const scenario of ['school','absence','inactive','closure']){
  const f=await fixture({events:[booking()]});await changeEvent(f.ui,[]);
  if(scenario==='closure')f.remote('closures',[{start:'2026-10-26',end:'2026-10-26',label:'Fermeture'}]);
  else f.remote('people',[{...person,...(scenario==='school'?{schoolDates:['2026-10-26']}:scenario==='absence'?{absences:[{start:'2026-10-26',end:'2026-10-26',type:'maladie'}]}:{active:false})}]);
  const writes=f.calls.length;await assert.rejects(undoCalendarChange(f.ui),/Impossible de restaurer/);assert.equal(f.calls.length,writes);
 }
});

test('partial multi-collection undo resumes without replaying the first confirmed write',async()=>{
 const f=await fixture({visits:[{id:'v',status:'a_planifier',clientName:'Client'}]});
 await withCalendarHistory(f.ui,'Visite',async()=>{f.ui.data.events=[{...booking(),kind:'visit',linkId:'v'}];await f.ui.save('events');Object.assign(f.ui.data.visits[0],{plannedStart:at('09:00'),plannedEnd:at('10:00'),status:'planifiee'});await f.ui.save('visits');});
 f.fail('visits');await assert.rejects(undoCalendarChange(f.ui),error=>error.partial&&/Annulation partielle/.test(error.message));
 assert.deepEqual(f.server.events,[]);assert.equal(f.server.visits[0].status,'planifiee');assert.deepEqual(f.ui.data.events,[]);assert.equal(calendarUndoState(f.ui).partial,true);
 const eventWrites=f.calls.filter(c=>c.kind==='events').length;
 await undoCalendarChange(f.ui);assert.equal(f.calls.filter(c=>c.kind==='events').length,eventWrites);assert.equal(f.server.visits[0].status,'a_planifier');assert.equal(calendarUndoState(f.ui).count,0);
});

test('a remote change to an already restored collection blocks a partial retry',async()=>{
 const f=await fixture({visits:[{id:'v',status:'a_planifier'}],events:[booking()]});
 await withCalendarHistory(f.ui,'Visite',async()=>{f.ui.data.events=[booking('e','11:00','12:00')];await f.ui.save('events');f.ui.data.visits[0].status='planifiee';await f.ui.save('visits');});
 f.fail('visits');await assert.rejects(undoCalendarChange(f.ui),/partielle/);f.remote('events',[{...f.server.events[0],title:'Après annulation partielle'}]);
 const writes=f.calls.length;await assert.rejects(undoCalendarChange(f.ui),/partielle/);assert.equal(f.calls.length,writes);
});

test('ETag race rejects without overwriting another device and preserves history',async()=>{
 const f=await fixture();await changeEvent(f.ui,[booking()]);f.onWrite(kind=>{if(kind==='events'){f.onWrite(null);f.remote('events',[{...f.server.events[0],title:'Concurrent'}]);}});
 await assert.rejects(undoCalendarChange(f.ui),error=>error.status===412);assert.equal(f.server.events[0].title,'Concurrent');assert.equal(f.ui.needsRefresh,true);f.ui.needsRefresh=false;assert.equal(calendarUndoState(f.ui).count,1);
});

test('permissions, offline and cached state stop undo; switching accounts erases history',async()=>{
 const f=await fixture();await changeEvent(f.ui,[booking()]);const writes=f.calls.length;
 for(const flag of ['cacheMode','needsRefresh','dataLoadError']){f.ui[flag]=true;await assert.rejects(undoCalendarChange(f.ui));assert.equal(calendarUndoState(f.ui).available,false);f.ui[flag]=false;}
 f.ui.canPlan=()=>false;await assert.rejects(undoCalendarChange(f.ui),/réservée/);f.ui.canPlan=()=>true;
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
 try{await assert.rejects(undoCalendarChange(f.ui),/hors ligne/);}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
 assert.equal(f.calls.length,writes);f.ui.user={id:'other'};assert.equal(calendarUndoState(f.ui).count,0);f.ui.user={id:'owner'};assert.equal(calendarUndoState(f.ui).count,0);
});

test('account changes during fresh reads stop the write and double clicks do not repeat undo',async()=>{
 const f=await fixture();await changeEvent(f.ui,[booking()]);const writes=f.calls.length;
 f.onLoad(kind=>{if(kind==='events')f.ui.user={id:'other'};});await assert.rejects(undoCalendarChange(f.ui),/compte connecté/);assert.equal(f.calls.length,writes);
 const g=await fixture();await changeEvent(g.ui,[booking()]);let resume,entered;
 const gate=new Promise(resolve=>resume=resolve),started=new Promise(resolve=>entered=resolve);g.onLoad(async kind=>{if(kind==='events'){entered();await gate;}});
 const pending=undoCalendarChange(g.ui);await started;await assert.rejects(undoCalendarChange(g.ui),/déjà en cours/);resume();await pending;assert.equal(g.calls.length,2);
});

test('history is bounded to ten confirmed actions and a UI callback failure cannot lose commits',async()=>{
 const f=await fixture();f.ui.onCalendarHistoryChanged=()=>{throw Error('UI detached');};
 for(let i=0;i<12;i++)await changeEvent(f.ui,[{...booking(),title:String(i)}]);
 assert.equal(calendarUndoState(f.ui).count,10);for(let i=0;i<10;i++)await undoCalendarChange(f.ui);assert.equal(f.server.events[0].title,'1');
});

test('private undo is restricted to the owner/admin and a notification error does not repeat it',async()=>{
 const f=await fixture();let commits=0;
 f.ui.privateCalendar={ownerId:'owner',undo:async()=>{commits++;return {committed:true,notificationError:'Cache privé indisponible'};}};
 rememberPrivateChange(f.ui,{type:'private',ownerId:'someone-else',rootId:'root',id:'p',before:null,after:{payload:{id:'p'}}});assert.equal(calendarUndoState(f.ui).count,0);
 rememberPrivateChange(f.ui,{type:'private',ownerId:'owner',rootId:'root',id:'p',before:null,after:{payload:{id:'p',ownerId:'owner',kind:'private'}}});
 f.ui.c.isAdmin=()=>false;await assert.rejects(undoCalendarChange(f.ui),/autre calendrier privé/);assert.equal(commits,0);f.ui.c.isAdmin=()=>true;
 const result=await undoCalendarChange(f.ui);assert.equal(result.committed,true);assert.match(result.notificationError,/Cache privé/);assert.equal(calendarUndoState(f.ui).count,0);await assert.rejects(undoCalendarChange(f.ui),/Aucune/);assert.equal(commits,1);
});

test('preflight-only fresh ETags cannot authorize an ordinary save of stale UI rows',async()=>{
 const f=await fixture({visits:[{id:'v',status:'planifiee',sitePhone:'old'}]});
 await changeEvent(f.ui,[{...booking(),kind:'visit',linkId:'v'}]);
 f.remote('visits',[{...f.server.visits[0],sitePhone:'new on another device'}]);
 await undoCalendarChange(f.ui);assert.equal(f.ui.data.visits[0].sitePhone,'old');
 f.ui.data.visits[0].title='Later local edit';
 await assert.rejects(f.ui.save('visits'),error=>error.status===412);
 assert.equal(f.server.visits[0].sitePhone,'new on another device');
});

test('failed preflight restores old collection tags without clearing the history',async()=>{
 const f=await fixture();await changeEvent(f.ui,[booking()]);f.remote('events',[{...f.server.events[0],title:'new on another device'}]);
 await assert.rejects(undoCalendarChange(f.ui),/changé/);
 f.ui.data.events[0].title='Stale local edit';
 await assert.rejects(f.ui.save('events'),error=>error.status===412);assert.equal(f.server.events[0].title,'new on another device');
 assert.equal(calendarUndoState(f.ui).count,1);
});

test('private undo receives a guard that rejects account/role changes during its remote read',async()=>{
 for(const mode of ['account','role']){
  const f=await fixture();let writes=0;
  f.ui.privateCalendar={ownerId:'owner',undo:async(change,{assertCurrent})=>{if(mode==='account')f.ui.user={id:'other'};else f.ui.c.isAdmin=()=>false;assertCurrent();writes++;return {committed:true};}};
  rememberPrivateChange(f.ui,{type:'private',ownerId:'owner',rootId:'root',id:'p',before:null,after:{payload:{id:'p'}}});
  await assert.rejects(undoCalendarChange(f.ui),/compte connecté|autre calendrier/);assert.equal(writes,0);
 }
});

test('saving a non-calendar collection never reads an account or starts history',()=>{
 const ui={get user(){throw Error('No account context');}};assert.doesNotThrow(()=>calendarSaved(ui,'people'));assert.doesNotThrow(()=>calendarSaved(ui,'events'));
});

test('rejected duplicate IDs restore the previous ETag before any later ordinary save',async()=>{
 const f=await fixture();await changeEvent(f.ui,[booking()]);const oldTag=f.ui.repo.versions.get('events');
 const duplicate=[{...booking(),title:'Remote first'},{...booking(),title:'Remote duplicate'}];f.remote('events',duplicate);
 await assert.rejects(undoCalendarChange(f.ui),/identifiant absent ou en double/);
 assert.equal(f.ui.repo.versions.get('events'),oldTag);assert.equal(calendarUndoState(f.ui).count,1);
 await assert.rejects(f.ui.save('events'),error=>error.status===412);assert.deepEqual(f.server.events,duplicate);
});
