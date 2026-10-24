import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {calendarEvents,movableProject,reassignPlanning} from '../lib/planning-reassign.js';
import {readerPlanning} from '../lib/planning-reader.js';
import {personOccurrences,reminderJobs,assignmentBlocks,smsText} from '../lib/notification-plan.js';
import {eventKindLabel} from '../lib/ops.js';
import {previewEvent} from '../lib/calendar-preview.js';

const people=[{id:'r',name:'Roberto',active:true},{id:'c',name:'Christian',active:true},{id:'a',name:'Ignazio',email:'owner@example.test',active:true}];
const free={id:'free-1',kind:'free',linkId:'',title:'Rangement du dépôt',address:'12 rue du Dépôt, Buc',instructions:'Ranger les bobines et contrôler les stocks.',start:'2026-10-26T09:00:00Z',end:'2026-10-26T11:00:00Z',teamIds:['r','c'],pauseHours:0,status:'planifie',exactHours:true};
const personal={id:'private-1',kind:'private',ownerId:'owner',title:'Rendez-vous personnel',start:free.start,end:free.end,teamIds:[]};

test('shared free appointment appears on general and each assigned planning, while private events stay private',()=>{
 const ui={data:{events:[free],people},calendarPersonId:'',user:{id:'owner',mail:'owner@example.test'},c:{isAdmin:()=>false},privateCalendar:{ready:true,ownerId:'owner',rows:[personal]}};
 assert.deepEqual(calendarEvents(ui).map(e=>e.id),['free-1']);
 ui.calendarPersonId='r';assert.deepEqual(calendarEvents(ui).map(e=>[e.id,e.teamIds]),[['free-1',['r']]]);
 ui.calendarPersonId='c';assert.deepEqual(calendarEvents(ui).map(e=>e.id),['free-1']);
 ui.calendarPersonId='a';assert.deepEqual(calendarEvents(ui),[]);
 ui.calendarPersonId='__private__';assert.deepEqual(calendarEvents(ui),[]);
 ui.c.isAdmin=()=>true;assert.deepEqual(calendarEvents(ui).map(e=>e.id),['private-1']);
 ui.calendarPersonId='';assert.deepEqual(calendarEvents(ui).map(e=>e.id),['free-1','private-1']);
 assert.equal(eventKindLabel('free'),'Rendez-vous libre');
});

test('planning reader includes free appointments without exposing private events or extra source data',()=>{
 const rows=readerPlanning([free,personal,{...free,id:'cancelled',status:'cancelled'}],people,'2026-10-26','2026-10-26');
 assert.equal(rows.length,1);assert.equal(rows[0].title,free.title);
 assert.deepEqual(rows[0].team,[{name:'Roberto',start:'10:00',end:'12:00'},{name:'Christian',start:'10:00',end:'12:00'}]);
 assert.doesNotMatch(JSON.stringify(rows),/Rendez-vous personnel|free-1|12 rue|bobines|owner@example/);
 assert.equal(readerPlanning([{...free,title:''}],people,'2026-10-26','2026-10-26')[0].title,'Rendez-vous libre');
});

test('free appointments generate reminders and SMS projections only for assigned active staff',()=>{
 const rows=personOccurrences([free,personal,{...free,id:'cancelled',status:'annulee'}],people);
 assert.deepEqual(rows.map(r=>r.personId),['c','r']);assert.equal(rows.length,2);
 assert.ok(rows.every(r=>r.title===free.title&&r.address===free.address&&r.private===false));
 const jobs=reminderJobs(rows,new Date('2026-10-26T08:00:00Z'));
 assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.minutes===60&&j.route.includes(encodeURIComponent(free.address))));
 assert.match(smsText(assignmentBlocks(rows)[0]),/Rangement du dépôt/);
 assert.equal(personOccurrences([free],people.map(p=>p.id==='c'?{...p,active:false}:p)).length,1);
});

test('free appointment assignment adjusts and restores other slots without losing source appointments',()=>{
 const project={id:'project-1',kind:'project',linkId:'p',title:'Chantier',start:'2026-10-26T07:00:00Z',end:'2026-10-26T16:00:00Z',teamIds:['r','c'],pauseHours:1,exactHours:true};
 assert.equal(movableProject(free),true);assert.equal(movableProject({...free,actualStart:free.start}),false);
 const assigned=reassignPlanning([project],[free],[],people);
 assert.equal(assigned.filter(e=>e.kind==='free').length,1);
 assert.ok(assigned.some(e=>e.allocationSourceId==='project-1'));
 assert.deepEqual(reassignPlanning(assigned,[],['free-1'],people),[project]);
 const later={...free,id:'later',kind:'intervention',linkId:'i',start:'2026-10-26T09:30:00Z',end:'2026-10-26T10:00:00Z',teamIds:['r']};
 const split=reassignPlanning([free],[later],[],people);
 assert.ok(split.some(e=>e.allocationSourceId==='free-1'));
 assert.deepEqual(reassignPlanning(split,[],['later'],people),[free]);
});

test('free preview shows address and instructions, no nonexistent dossier, and only planners get edit',async t=>{
 const dom=new JSDOM('<dialog id="modal"></dialog>',{url:'https://opus.test'});globalThis.document=dom.window.document;
 t.after(()=>{dom.window.close();delete globalThis.document;});
 let mayPlan=true,edited=null,title='';
 const ui={data:{events:[free],people,clients:[],interventions:[],visits:[]},linkLabel:e=>e.title,teamNames:ids=>ids.map(id=>people.find(p=>p.id===id).name).join(', '),canPlan:()=>mayPlan,planEvent:e=>{edited=e;},c:{modal:(heading,html)=>{title=heading;document.getElementById('modal').innerHTML=html;},projectMeta:()=>assert.fail('Free appointment has no project to fetch'),getCatalog:()=>({projects:[]})}};
 await previewEvent(ui,free.id);assert.equal(title,'Rendez-vous libre');
 assert.equal(document.getElementById('eventFile'),null);assert.match(document.getElementById('eventAddress').textContent,/12 rue du Dépôt/);
 assert.ok(document.querySelector('#eventAddress a').href.includes(encodeURIComponent(free.address)));
 assert.match(document.querySelector('.eventMission').textContent,/Ranger les bobines/);
 document.getElementById('eventEdit').click();assert.equal(edited,free);
 mayPlan=false;await previewEvent(ui,free.id);assert.equal(document.getElementById('eventEdit'),null);assert.equal(document.getElementById('eventFile'),null);
});
