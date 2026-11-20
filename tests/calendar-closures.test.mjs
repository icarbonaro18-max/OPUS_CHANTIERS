import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {hourWeek,calendarClosure} from '../lib/hour-calendar.js';import {OpsUI} from '../lib/ops-ui.js';import {blockedAssignments} from '../lib/workforce.js';
const closures=[{id:'closed',label:'Congés de l’entreprise',start:'2026-11-25',end:'2026-11-28'}];
const ui=admin=>({data:{closures:structuredClone(closures),events:[],people:[]},canPlan:()=>admin,role:()=>admin?'admin':'technician',linkLabel:e=>e.title,teamNames:()=>''});
const day=date=>new Date(date+'T12:00:00');
test('closure uses stored inclusive range, 08–17 on Wednesday and 08–16 on Friday',()=>{
 const u=ui(false);assert.equal(calendarClosure(u,'2026-11-24'),null);assert.deepEqual(calendarClosure(u,'2026-11-25'),{label:'Congés de l’entreprise',start:480,end:1020});assert.equal(calendarClosure(u,'2026-11-27').end,960);assert.equal(calendarClosure(u,'2026-11-28').end,1020);assert.equal(calendarClosure(u,'2026-11-29'),null);
});
test('all accounts see the closure even with no appointments, without creating events or worked hours',()=>{
 for(const admin of [false,true]){const u=ui(admin),before=JSON.stringify(u.data),dom=new JSDOM(hourWeek(u,[day('2026-11-25'),day('2026-11-27')]))[ 'window' ];try{
  const bands=dom.document.querySelectorAll('.calendarClosureBand');assert.equal(bands.length,2);assert.equal(bands[0].dataset.closureStart,'08:00');assert.equal(bands[0].dataset.closureEnd,'17:00');assert.equal(bands[1].dataset.closureEnd,'16:00');assert.equal(bands[0].style.top,'calc(60 * var(--minute))');assert.equal(bands[0].style.height,'calc(540 * var(--minute))');assert.equal(bands[1].style.height,'calc(480 * var(--minute))');assert.equal(dom.document.querySelectorAll('.calendarClosureStamp').length,2);assert.equal(dom.document.querySelectorAll('.calendarClosureBadge').length,2);assert.equal(JSON.stringify(u.data),before);
 }finally{dom.close();}}
});
test('existing appointments remain visible above closure background and the early hour stays unshaded',()=>{
 const u=ui(false);u.data.events=[{id:'e',kind:'free',title:'Rendez-vous exceptionnel',start:'2026-11-25T06:00:00',end:'2026-11-25T07:00:00'}];const w=new JSDOM(hourWeek(u,[day('2026-11-25')])).window;try{assert.ok(w.document.querySelector('[data-event="e"]'));assert.equal(w.document.querySelector('.calendarClosureBand').style.top,'calc(120 * var(--minute))');assert.match(w.document.querySelector('.hourEvent').textContent,/exceptionnel/);}finally{w.close();}
});
test('closure labels are escaped, and an ordinary date has neither band nor closure badge',()=>{
 const u=ui(false);u.data.closures[0].label='<img src=x onerror=alert(1)>';const w=new JSDOM(hourWeek(u,[day('2026-11-25'),day('2026-11-24')])).window;try{assert.equal(w.document.querySelectorAll('img').length,0);assert.equal(w.document.querySelectorAll('.calendarClosureBand').length,1);assert.equal(w.document.querySelectorAll('.calendarClosureBadge').length,1);}finally{w.close();}
});
test('month view remains marked closed and company assignment blocking still applies',()=>{
 const u=ui(false);u.monthCursor=day('2026-11-01');const w=new JSDOM(OpsUI.prototype.monthGrid.call(u)).window;try{assert.equal(w.document.querySelectorAll('.monthCell.opusClosed').length,4);assert.match(w.document.querySelector('.monthCell.opusClosed').textContent,/Fermeture/);assert.deepEqual(blockedAssignments(u.data,'2026-11-25'),['Entreprise fermée : Congés de l’entreprise']);}finally{w.close();}
});
