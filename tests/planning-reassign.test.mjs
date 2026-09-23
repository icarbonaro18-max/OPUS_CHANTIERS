import test from 'node:test';
import assert from 'node:assert/strict';
import {reassignPlanning,calendarEvents} from '../lib/planning-reassign.js';
import {plannedTotal,personPlan} from '../lib/person-planning.js';
import {saveInterventionDays} from '../lib/intervention-days.js';
import {OpsUI} from '../lib/ops-ui.js';
import {JSDOM} from 'jsdom';
const people=[{id:'r',name:'Roberto'},{id:'a',name:'Alban'}];
const at=h=>'2026-09-23T'+h+':00';
const project={id:'p',kind:'project',linkId:'chantier',title:'Chantier',teamIds:['r','a'],start:at('08:00'),end:at('17:00'),pauseHours:1};
const intervention={id:'i',kind:'intervention',linkId:'int',teamIds:['r'],start:at('10:00'),end:at('12:00'),pauseHours:0};
const slots=(rows,id)=>rows.filter(e=>(e.teamIds||[]).includes(id)).map(e=>[e.kind,new Date(e.start).getHours(),new Date(e.end).getHours()]).sort((a,b)=>a[1]-b[1]);
test('two-hour diversion: Roberto returns, Alban stays, project loses two hours, inputs untouched',()=>{
 const before=JSON.stringify(project),rows=reassignPlanning([project],[intervention],[],people);
 assert.deepEqual(slots(rows,'r'),[['project',8,10],['intervention',10,12],['project',12,17]]);
 assert.deepEqual(slots(rows,'a'),[['project',8,17]]);
 assert.equal(rows.filter(e=>e.kind==='project').reduce((n,e)=>n+plannedTotal(e,people),0),14);
 assert.equal(rows.reduce((n,e)=>n+plannedTotal(e,people),0),16);
 assert.equal(JSON.stringify(project),before);
});
test('moving, removing staff, deleting and cancelling interventions restore original slots without duplicates',()=>{
 const rows=reassignPlanning([project],[intervention],[],people);
 const moved=reassignPlanning(rows,[{...intervention,start:at('13:00'),end:at('15:00')}],[],people);
 assert.deepEqual(slots(moved,'r'),[['project',8,13],['intervention',13,15],['project',15,17]]);
 assert.deepEqual(reassignPlanning(moved,[],['i'],people),[project]);
 const unassigned=reassignPlanning(rows,[{...intervention,teamIds:[]}],[],people);
 assert.deepEqual(slots(unassigned,'r'),[['project',8,17]]);
 const cancelled=reassignPlanning(rows,[{...intervention,status:'annulee'}],[],people);
 assert.deepEqual(cancelled.find(e=>e.id==='p'),project);
 assert.deepEqual(cancelled.find(e=>e.id==='i').displacedProjects||[],[]);
});
test('full-day diversion still restores the original, including after serialization/reload',()=>{
 const full={...intervention,start:at('08:00'),end:at('17:00'),teamIds:['r','a'],pauseHours:1};
 const rows=JSON.parse(JSON.stringify(reassignPlanning([project],[full],[],people)));
 assert.equal(rows.length,1);assert.deepEqual(reassignPlanning(rows,[],['i'],people),[project]);
});
test('successive interventions, dates and break totals stay independent',()=>{
 const tomorrow={...project,id:'tomorrow',start:'2026-09-24T08:00',end:'2026-09-24T17:00'};
 let rows=reassignPlanning([project,tomorrow],[intervention],[],people);
 rows=reassignPlanning(rows,[{...intervention,id:'j',start:at('14:00'),end:at('15:00')}],[],people);
 assert.deepEqual(rows.find(e=>e.id==='tomorrow'),tomorrow);
 assert.equal(rows.filter(e=>e.id!=='tomorrow').reduce((n,e)=>n+plannedTotal(e,people),0),16);
 rows=reassignPlanning(rows,[],['i'],people);
 assert.deepEqual(slots(rows.filter(e=>e.id!=='tomorrow'),'r'),[['project',8,14],['intervention',14,15],['project',15,17]]);
});
test('actual hours are never rewritten',()=>{
 const actual={...project,actualStart:at('08:00'),actualEnd:at('17:00')};
 assert.throws(()=>reassignPlanning([actual],[intervention],[],people),/réalisés/);
 const rows=reassignPlanning([project],[intervention],[],people);rows.find(e=>e.allocationSourceId).actualStart=at('08:00');
 assert.throws(()=>reassignPlanning(rows,[{...intervention,start:at('11:00')}],[],people),/réalisés/);
});
test('Friday contracts respected and targeted calendar does not mutate teams',()=>{
 const apprentice={id:'r',role:'apprenti',weeklyTarget:35};
 const friday={...project,start:'2026-09-25T08:00',end:'2026-09-25T17:00'};
 const booking={...intervention,start:'2026-09-25T10:00',end:'2026-09-25T12:00'};
 const rows=reassignPlanning([friday],[booking],[],[apprentice,people[1]]);
 assert.equal(rows.filter(e=>e.teamIds.includes('r')).reduce((n,e)=>n+personPlan(e,apprentice).hours,0),3);
 const ui={data:{events:rows},calendarPersonId:'r'},filtered=calendarEvents(ui);
 assert.ok(filtered.every(e=>e.teamIds.length===1&&e.teamIds[0]==='r'));assert.ok(rows.some(e=>e.teamIds.includes('a')));
});
test('intervention form persistence saves split and intervention together; failure rolls calendar back',async()=>{
 const ui={data:{events:[project],people},localDT:v=>v||'',toISO:v=>v,save:async()=>{}};
 const x={id:'int',plannedStart:at('10:00'),plannedEnd:at('12:00'),teamIds:['r'],pauseHours:0};
 await saveInterventionDays(ui,x);assert.deepEqual(slots(ui.data.events,'r'),[['project',8,10],['intervention',10,12],['project',12,17]]);
 const before=ui.data.events;ui.save=async()=>{throw Error('offline');};x.plannedStart=at('13:00');x.plannedEnd=at('15:00');
 await assert.rejects(saveInterventionDays(ui,x),/offline/);assert.equal(ui.data.events,before);
});
test('busy project selectable in red; school/absence remain blocked, planned interventions can move',()=>{
 const dom=new JSDOM('<div></div>',{url:'https://opus.test'});globalThis.document=dom.window.document;
 const ui={data:{events:[project],people,closures:[]},personById:id=>people.find(p=>p.id===id),role:()=> 'admin'};
 const html=OpsUI.prototype.teamPickerHtml.call(ui,[],'2026-09-23','10:00','12:00');
 document.body.innerHTML=html;assert.equal(document.querySelector('[value=r]').disabled,false);assert.match(html,/#a52d38/);
 OpsUI.prototype.validateScheduling.call(ui,'2026-09-23','10:00','12:00',['r'],'',false,true);
 assert.throws(()=>OpsUI.prototype.validateScheduling.call(ui,'2026-09-23','10:00','12:00',['r']),/déjà affecté/);
 ui.data.events.push(intervention);OpsUI.prototype.validateScheduling.call(ui,'2026-09-23','10:00','12:00',['r'],'',false,true);
 ui.data.events=[project];people[0].absences=[{start:'2026-09-23',end:'2026-09-23',type:'maladie'}];
 assert.throws(()=>OpsUI.prototype.validateScheduling.call(ui,'2026-09-23','10:00','12:00',['r'],'',false,true),/Maladie/);delete people[0].absences;
});
test('calendar form performs reassignment and day/week/month expose the same personal filter',async()=>{
 const dom=new JSDOM('<div id="modal"></div><section id="calendarPage"></section>',{url:'https://opus.test'});
 globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.localStorage=dom.window.localStorage;
 const ui=new OpsUI({graph:{},getConfig:()=>({}),getUser:()=>({}),isAdmin:()=>true,toast(){},getCatalog:()=>({projects:[{id:'chantier',name:'Chantier'}]}),modal:(t,h)=>document.getElementById('modal').innerHTML=h});
 ui.data={people,events:[structuredClone(project)],interventions:[{id:'int',number:'INT-1',clientName:'Client'}],visits:[],closures:[]};ui.save=async()=>{};ui.saveWithFeedback=async(f,m,work)=>work();
 await ui.planEvent();document.getElementById('eventLink').value='intervention|int';document.getElementById('eventDate').value='2026-09-23';document.getElementById('eventStart').value='10:00';document.getElementById('eventEnd').value='12:00';document.getElementById('eventPause').value='0';document.getElementById('toggleTeam').click();
 const cb=document.querySelector('[name=teamPerson][value=r]');assert.equal(cb.disabled,false);cb.checked=true;cb.dispatchEvent(new dom.window.Event('change'));
 await document.getElementById('eventForm').onsubmit({preventDefault(){}});
 assert.deepEqual(slots(ui.data.events,'r'),[['project',8,10],['intervention',10,12],['project',12,17]]);assert.match(ui.planningNotice.message,/ajustés/);
 ui.calendarPersonId='r';ui.dayCursor=new Date('2026-09-23T12:00');ui.week=new Date('2026-09-21T12:00');ui.monthCursor=ui.dayCursor;
 const albanOnly=ui.data.events.find(e=>e.teamIds.includes('a')).id;
 for(const view of ['day','week','month']){ui.calendarView=view;await ui.renderCalendar();assert.equal(document.getElementById('calendarPerson').value,'r');assert.equal(document.querySelector('[data-event="'+albanOnly+'"]'),null);assert.ok(document.querySelector('[data-event]'));}
 ui.calendarFitCleanup?.();
});

test('project-to-project, then urgent intervention, then restoration in reverse order',()=>{
 const b={...intervention,kind:'project',id:'b',linkId:'other',end:at('14:00')};
 let rows=reassignPlanning([project],[b],[],people);
 assert.deepEqual(slots(rows,'r'),[['project',8,10],['project',10,14],['project',14,17]]);
 const urgent={...intervention,id:'urgent',start:at('11:00'),end:at('12:00')};
 rows=reassignPlanning(rows,[urgent],[],people);
 assert.deepEqual(slots(rows,'r'),[['project',8,10],['project',10,11],['intervention',11,12],['project',12,14],['project',14,17]]);
 assert.equal(rows.reduce((n,e)=>n+plannedTotal(e,people),0),16);
 rows=reassignPlanning(JSON.parse(JSON.stringify(rows)),[],['urgent'],people);
 assert.deepEqual(slots(rows,'r'),[['project',8,10],['project',10,14],['project',14,17]]);
 rows=reassignPlanning(rows,[],['b'],people);assert.deepEqual(rows,[project]);
});
test('intervention and visit donors are split, not deleted; moving the booking restores them',()=>{
 for(const kind of ['intervention','visit']){
 const donor={...project,kind},booking={...intervention,kind:'project',id:'new'};
 const rows=reassignPlanning([donor],[booking],[],people);
 assert.deepEqual(slots(rows,'r'),[[kind,8,10],['project',10,12],[kind,12,17]]);
 const changed=reassignPlanning(rows,[{...booking,start:at('13:00'),end:at('15:00')}],[],people);
 assert.deepEqual(slots(changed,'r'),[[kind,8,13],['project',13,15],[kind,15,17]]);
 assert.deepEqual(reassignPlanning(changed,[],['new'],people),[donor]);
 }
});
test('V50 saved displacement migrates without moving an existing appointment',()=>{
 const legacy=reassignPlanning([project],[intervention],[],people).map(e=>{const c={...e};delete c.allocationPriority;return c;});
 const unrelated={...project,id:'other-day',start:'2026-09-24T08:00',end:'2026-09-24T17:00'};
 const rows=reassignPlanning(legacy,[unrelated],[],people);
 assert.deepEqual(slots(rows.filter(e=>e.id!=='other-day'),'r'),[['project',8,10],['intervention',10,12],['project',12,17]]);
});
