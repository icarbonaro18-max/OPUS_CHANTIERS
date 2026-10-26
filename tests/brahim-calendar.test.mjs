import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isSchoolDay,personUnavailable} from '../lib/ops.js';
import {blockedAssignments} from '../lib/workforce.js';
import {OpsUI} from '../lib/ops-ui.js';
import {personPlan} from '../lib/person-planning.js';

const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
const brahim=config.defaultPeople.find(p=>p.name==='CHATTI Brahim');
assert.ok(brahim,'Brahim must be present in the configured personnel');

function dates(periods){
 return periods.flatMap(period=>{
  const result=[];const d=new Date(period.start+'T12:00:00Z');
  for(;d.toISOString().slice(0,10)<=period.end;d.setUTCDate(d.getUTCDate()+1))result.push(d.toISOString().slice(0,10));
  return result;
 });
}
const formation=dates(brahim.schoolPeriods.filter(p=>!p.label.includes('Mobilité')));
const mobility=dates(brahim.schoolPeriods.filter(p=>p.label.includes('Mobilité')));
const enterprise=dates(brahim.schoolCalendar.companyPeriods);

test('Brahim calendar agrees with the monthly totals printed on brochure page 28, cohort 2026/2028',()=>{
 // Independent checkpoints transcribed from the PDF footer, not computed from
 // the import. September 2027 is the extra thirteenth column of that same page.
 const months=['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06','2027-07','2027-08','2027-09'];
 const countByMonth=list=>months.map(month=>list.filter(date=>date.startsWith(month)).length);
 assert.deepEqual(countByMonth(formation),[14,10,9,10,15,5,12,12,2,0,0,0,12]);
 assert.deepEqual(countByMonth(enterprise),[8,12,11,12,5,15,10,10,14,22,21,22,10]);
 assert.deepEqual(countByMonth(mobility),[0,0,0,0,0,0,0,0,5,0,0,0,0]);
 assert.equal(formation.filter(d=>d<'2027-09-01').length,89);
 assert.equal(enterprise.filter(d=>d<'2027-09-01').length,162);
 assert.equal(formation.length,101);assert.equal(enterprise.length,172);assert.equal(mobility.length,5);
 const all=[...formation,...mobility,...enterprise];
 assert.equal(new Set(all).size,all.length,'No date may be both school/mobility and enterprise');
});

test('source exceptions retain the holiday gap, full study trip and Pentecost enterprise day',()=>{
 assert.equal(isSchoolDay(brahim,'2026-11-10'),true);
 assert.equal(isSchoolDay(brahim,'2026-11-11'),false);
 assert.equal(enterprise.includes('2026-11-11'),false);
 assert.equal(isSchoolDay(brahim,'2026-11-12'),true);
 assert.equal(isSchoolDay(brahim,'2027-03-29'),false);
 assert.equal(isSchoolDay(brahim,'2027-03-30'),true);
 assert.deepEqual(mobility,['2027-05-03','2027-05-04','2027-05-05','2027-05-06','2027-05-07']);
 assert.equal(personUnavailable(brahim,'2027-05-06').unavailable,true);
 assert.equal(isSchoolDay(brahim,'2027-05-17'),false);
 assert.equal(enterprise.includes('2027-05-17'),true);
});

test('September 2027 follows page 28 and no calendar is invented for the rest of 2027/2028',()=>{
 assert.equal(isSchoolDay(brahim,'2027-09-01'),true); // page 29 marks this date E
 assert.equal(isSchoolDay(brahim,'2027-09-03'),true);
 assert.equal(isSchoolDay(brahim,'2027-09-06'),false);
 assert.equal(enterprise.includes('2027-09-17'),true);
 assert.equal(isSchoolDay(brahim,'2027-09-20'),true);
 assert.equal(isSchoolDay(brahim,'2027-09-30'),true);
 assert.equal(brahim.schoolCalendar.from,'2026-09-01');
 assert.equal(brahim.schoolCalendar.through,'2027-09-30');
 assert.ok([...formation,...mobility,...enterprise].every(d=>d>='2026-09-01'&&d<='2027-09-30'));
 assert.equal(brahim.schoolDates.length,0);
 assert.equal(isSchoolDay(brahim,'2028-01-10'),false);
 assert.match(brahim.schoolCalendar.note,/prévisionnel.*compléter/);
});

function schedulingUI(){
 const ui=Object.create(OpsUI.prototype);
 ui.data={people:[{...structuredClone(brahim),id:'brahim'}],events:[],closures:[],interventions:[],visits:[]};
 return ui;
}

test('actual scheduling rules block every school/mobility date, even when exceptional hours are requested',()=>{
 const ui=schedulingUI();
 for(const date of [...formation,...mobility]){
  assert.match(blockedAssignments(ui.data,date,['brahim']).join(' '),/école/,date);
  assert.throws(()=>ui.validateScheduling(date,'08:00','10:00',['brahim']),/école/,date);
  assert.throws(()=>ui.validateScheduling(date,'19:00','20:00',['brahim'],'',true),/école/,date+' exceptional hours');
 }
});

test('enterprise days remain assignable without changing other workers or overriding normal availability',()=>{
 const ui=schedulingUI();
 for(const date of ['2026-10-26','2026-11-06','2027-05-12','2027-05-17','2027-09-06']){
  assert.equal(enterprise.includes(date),true,date);
  assert.deepEqual(blockedAssignments(ui.data,date,['brahim']),[],date);
  assert.doesNotThrow(()=>ui.validateScheduling(date,'08:00','10:00',['brahim']),date);
 }
 ui.data.people.push({id:'other',name:'Autre technicien',type:'internal',weeklyTarget:39,active:true});
 assert.deepEqual(blockedAssignments(ui.data,'2026-11-09',['other']),[]);
 ui.data.closures.push({start:'2026-10-26',end:'2026-10-26',label:'Fermeture'});
 assert.throws(()=>ui.validateScheduling('2026-10-26','08:00','10:00',['brahim']),/Entreprise fermée/);
});

test('Brahim retains the existing 35-hour apprentice Friday rule: 08:00–11:00',()=>{
 assert.equal(brahim.role,'apprenti');assert.equal(brahim.weeklyTarget,35);
 const planned=personPlan({start:'2026-11-06T08:00:00',end:'2026-11-06T17:00:00',pauseHours:1},brahim);
 assert.equal(new Date(planned.start).getHours(),8);
 assert.equal(new Date(planned.end).getHours(),11);
 assert.equal(planned.pause,0);assert.equal(planned.hours,3);
 const ui=schedulingUI();
 assert.throws(()=>ui.validateScheduling('2026-11-06','13:00','16:00',['brahim']),/hors horaires contractuels/);
});
