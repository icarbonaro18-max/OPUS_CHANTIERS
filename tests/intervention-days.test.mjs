import test from 'node:test';
import assert from 'node:assert/strict';
import {interventionDays,validateInterventionDays,saveInterventionDays} from '../lib/intervention-days.js';
import {plannedTotal} from '../lib/person-planning.js';
function setup(){return {data:{events:[],people:[{id:'p',weeklyTarget:39}]},localDT:v=>v?String(v).slice(0,16):'',toISO:v=>new Date(v).toISOString(),save:async()=>{},validateScheduling(){}};}
test('16–17 September creates two eight-hour days, one intervention, stable event IDs on re-save',async()=>{
 const ui=setup(),x={id:'laurent',number:'INT-1',clientName:'Laurent',plannedStart:'2026-09-16T08:00',plannedEnd:'2026-09-17T17:00',teamIds:['p']};
 const events=await saveInterventionDays(ui,x);
 assert.equal(events.length,2);assert.equal(events.reduce((n,e)=>n+plannedTotal(e,ui.data.people),0),16);assert.ok(events.every(e=>e.linkId==='laurent'&&e.pauseHours===1));
 const ids=events.map(e=>e.id);await saveInterventionDays(ui,x);assert.deepEqual(ui.data.events.map(e=>e.id),ids);
 x.plannedEnd='2026-09-16T17:00';await saveInterventionDays(ui,x);assert.equal(ui.data.events.length,1);
});
test('all days checked for conflicts, own bookings excluded, state restored even on failure',()=>{
 const ui=setup(),before=[{kind:'intervention',linkId:'i'},{kind:'project',linkId:'other'}];ui.data.events=before;
 ui.validateScheduling=date=>{assert.equal(ui.data.events.length,1);if(date==='2026-09-17')throw Error('déjà affecté');};
 assert.throws(()=>validateInterventionDays(ui,{id:'i'},'2026-09-16T08:00','2026-09-17T17:00',['p']),/2026-09-17.*déjà affecté/);
 assert.equal(ui.data.events,before);
});
test('Friday contracts and weekends retained; failed cloud save restores events',async()=>{
 const ui=setup();ui.data.people=[{id:'p',weeklyTarget:39},{id:'a',role:'apprenti',weeklyTarget:35}];
 const x={id:'i',plannedStart:'2026-09-17T08:00',plannedEnd:'2026-09-18T17:00',teamIds:['p','a']};
 const events=await saveInterventionDays(ui,x);assert.equal(events.reduce((n,e)=>n+plannedTotal(e,ui.data.people),0),26);
 assert.equal(interventionDays('2026-09-18T08:00','2026-09-21T17:00').length,2);
 assert.equal(interventionDays('2026-09-18T08:00','2026-09-21T17:00',true).length,4);
 const before=ui.data.events;ui.save=async()=>{throw Error('offline');};await assert.rejects(saveInterventionDays(ui,x),/offline/);assert.equal(ui.data.events,before);
});
