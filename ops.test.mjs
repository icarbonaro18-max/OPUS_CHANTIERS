import test from 'node:test';
import assert from 'node:assert/strict';
import {nextInterventionNumber,standardDayHours,personUnavailable,durationHours} from '../lib/ops.js';

test('intervention numbers stay chronological by year',()=>{
  const rows=[{number:'INT-2026-0001'},{number:'INT-2026-0012'},{number:'INT-2025-0099'}];
  assert.equal(nextInterventionNumber(rows,new Date('2026-09-12')),'INT-2026-0013');
});

test('OPUS 39h and apprentice 35h schedules match requested bases',()=>{
  const tech={weeklyTarget:39,role:'technicien'},app={weeklyTarget:35,role:'apprenti'};
  const mon='2026-09-14',fri='2026-09-18';
  assert.equal(standardDayHours(tech,mon),8);assert.equal(standardDayHours(tech,fri),7);
  assert.equal(standardDayHours(app,mon),8);assert.equal(standardDayHours(app,fri),3);
});

test('school periods make an apprentice unavailable',()=>{
  const p={active:true,type:'internal',schoolPeriods:[{start:'2026-09-14',end:'2026-09-18',label:'École'}],absences:[]};
  assert.equal(personUnavailable(p,'2026-09-16').school,true);
  assert.equal(personUnavailable(p,'2026-09-21').unavailable,false);
});

test('duration subtracts pause',()=>{
  assert.equal(durationHours('2026-09-15T08:00:00','2026-09-15T17:00:00',1),8);
});
