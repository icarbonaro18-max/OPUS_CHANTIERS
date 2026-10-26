import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {schoolCalendarBadges} from '../lib/school-calendar.js';
import {hourWeek} from '../lib/hour-calendar.js';
import {OpsUI} from '../lib/ops-ui.js';
const brahim={id:'brahim',name:'CHATTI Brahim',active:true,schoolPeriods:[
 {start:'2026-10-26',end:'2026-10-27',label:'École · BUT GEII'},
 {start:'2026-10-28',end:'2026-10-28',label:'Mobilité · BUT GEII'}
],schoolDates:[],schoolCalendar:{id:'but-2026',label:'BUT GEII',from:'2026-10-26',through:'2026-11-06',note:'Calendrier transmis',companyPeriods:[{start:'2026-10-29',end:'2026-10-30'}]}};
const alban={id:'alban',name:'PICARD Alban',active:true,schoolDates:['2026-10-26']};
function ui(role='admin',selected=''){
 return {role:()=>role,canPlan:OpsUI.prototype.canPlan,calendarPersonId:selected,data:{people:structuredClone([brahim,alban]),events:[]}};
}
const dom=html=>JSDOM.fragment(html);
const statuses=(u,date)=>[...dom(schoolCalendarBadges(u,date)).querySelectorAll('[data-school-status]')].map(el=>[el.dataset.schoolPerson,el.dataset.schoolStatus,el.textContent]);
test('company days remain unlabelled for all apprentices, including leave and closures',()=>{
 const u=ui('admin','brahim'),p=u.data.people[0];
 for(const selected of ['', 'brahim', 'alban']){u.calendarPersonId=selected;assert.equal(schoolCalendarBadges(u,'2026-10-29'),'');}
 u.calendarPersonId='brahim';
 p.absences=[{start:'2026-10-29',end:'2026-10-30'}];assert.equal(schoolCalendarBadges(u,'2026-10-29'),'');
 p.absences=[];u.data.closures=[{start:'2026-10-29',end:'2026-10-30'}];assert.equal(schoolCalendarBadges(u,'2026-10-29'),'');
 u.data.closures=[];p.active=false;assert.equal(schoolCalendarBadges(u,'2026-10-29'),'');
});
test('admin and manager see school badges; technicians and private agenda never do',()=>{
 for(const role of ['admin','manager'])assert.equal(statuses(ui(role),'2026-10-26').length,2);
 for(const selected of ['', 'brahim','__private__'])assert.equal(schoolCalendarBadges(ui('technician',selected),'2026-10-26'),'');
 assert.equal(schoolCalendarBadges(ui('admin','__private__'),'2026-10-26'),'');
 assert.equal(schoolCalendarBadges({data:{people:[brahim]}},'2026-10-26'),'');
});
test('general planning uses the same school label and status for every apprentice',()=>{
 assert.deepEqual(statuses(ui(),'2026-10-26'),[['brahim','school','CHATTI Brahim · École'],['alban','school','PICARD Alban · École']]);
 assert.deepEqual(statuses(ui(),'2026-10-28'),[['brahim','school','CHATTI Brahim · École']]);
 assert.equal(schoolCalendarBadges(ui(),'2026-10-29'),'');
 assert.equal(schoolCalendarBadges(ui(),'2026-11-09'),'');
 const u=ui();u.data.people[0].active=false;assert.deepEqual(statuses(u,'2026-10-26'),[['alban','school','PICARD Alban · École']]);
});
test('individual planning shows only school days with the same label, never company days',()=>{
 const u=ui('manager','brahim');
 for(const date of ['2026-10-26','2026-10-27','2026-10-28'])assert.deepEqual(statuses(u,date),[['brahim','school','École']]);
 for(const date of ['2026-10-29','2026-10-30'])assert.equal(schoolCalendarBadges(u,date),'');
 for(const date of ['2026-10-23','2026-10-31','2026-11-02','2026-11-06'])assert.equal(schoolCalendarBadges(u,date),'');
 u.calendarPersonId='alban';assert.deepEqual(statuses(u,'2026-10-26'),[['alban','school','École']]);
 u.calendarPersonId='unknown';assert.equal(schoolCalendarBadges(u,'2026-10-26'),'');
});
test('after coverage ends, the selected apprentice gets a weekday notice, not an invented school block',()=>{
 const u=ui('admin','brahim');
 for(const date of ['2026-11-07','2026-11-08'])assert.equal(schoolCalendarBadges(u,date),'');
 assert.deepEqual(statuses(u,'2026-11-09'),[['brahim','incomplete','Calendrier école à compléter']]);
 u.data.people[0].schoolDates.push('2026-11-09');assert.deepEqual(statuses(u,'2026-11-09'),[['brahim','school','École']]);
});
test('day and week views place school notes under day buttons, never in timed slots or stored events',()=>{
 const u=ui('admin','brahim'),before=structuredClone(u.data);
 for(const days of [[new Date('2026-10-26T12:00:00')],Array.from({length:5},(_,i)=>new Date(2026,9,26+i,12))]){
  const html=dom(hourWeek(u,days)),heads=[...html.querySelectorAll('.hourHead')].slice(1);
  assert.equal(heads.length,days.length);assert.ok(heads[0].querySelector('.hourDayDetails + .schoolCalendarBadges [data-school-status="school"]'));
  assert.equal(html.querySelectorAll('.hourDay .schoolCalendarBadge').length,0);assert.equal(html.querySelectorAll('.hourEvent').length,0);
  assert.equal(html.querySelectorAll('.hourSlot').length,22*days.length);
  assert.match(html.querySelector('.hourAxis').textContent,/07:00.*18:00/);
 }
 assert.deepEqual(u.data,before);
});
test('school badge content and attributes are escaped',()=>{
 const u=ui();u.data.people=[{...brahim,id:'a" onclick="bad',name:'<img src=x>',schoolPeriods:[{start:'2026-10-26',end:'2026-10-26',label:'École <script>bad</script>'}]}];
 const fragment=dom(schoolCalendarBadges(u,'2026-10-26'));
 assert.equal(fragment.querySelectorAll('img,script,[onclick]').length,0);
 assert.equal(fragment.textContent,'<img src=x> · École');
 assert.equal(fragment.querySelector('[data-school-person]').dataset.schoolPerson,'a" onclick="bad');
});
test('month grid and selected-day details share the same school status and access rules',()=>{
 for(const role of ['admin','manager','technician']){
  const u=ui(role,'brahim');u.monthCursor=new Date('2026-10-01T12:00:00');u.data.closures=[];
  const month=dom(OpsUI.prototype.monthGrid.call(u)),details=dom(OpsUI.prototype.hourNotice.call(u,'2026-10-28'));
  if(role==='technician'){assert.equal(month.querySelectorAll('.schoolCalendarBadge').length,0);assert.equal(details.querySelectorAll('.schoolCalendarBadge').length,0);}
  else{assert.equal(month.querySelectorAll('[data-school-status="school"]').length,3);assert.equal(month.querySelectorAll('[data-school-status="company"], [data-school-status="mobility"]').length,0);assert.equal(details.querySelector('[data-school-status="school"]').textContent,'École');}
  u.calendarPersonId='__private__';assert.equal(dom(OpsUI.prototype.monthGrid.call(u)).querySelectorAll('.schoolCalendarBadge').length,0);
 }
});
