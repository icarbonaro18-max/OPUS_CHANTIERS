import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {applyCalendarRecordPlan} from '../lib/calendar-record-plan.js';
import {undoCalendarChange} from '../lib/calendar-undo.js';
const at=hour=>'2026-10-29T'+hour+':00Z';
const booking=(extra={})=>({id:'e',kind:'intervention',linkId:'i',start:at('09:00'),end:at('10:00'),teamIds:['r'],teamSize:1,vehicle:true,status:'planifie',...extra});
function fixture(t){
 const dom=new JSDOM('<dialog id="modal"></dialog><main id="calendarPage"></main>',{url:'https://opus.example'});for(const key of ['document','window','localStorage'])globalThis[key]=dom.window[key];globalThis.confirm=()=>true;
 document.getElementById('modal').close=function(){this.open=false;};
 const server={events:[],interventions:[{id:'i',number:'INT-1',clientName:'Client',status:'a_planifier',photos:['data:image/jpeg;base64,'+'A'.repeat(44000000)]}],visits:[],people:[{id:'r',name:'Roberto',active:true,weeklyTarget:39}],closures:[],projectTracking:[],clients:[]},writes=[];
 const ui=new OpsUI({graph:{},getUser:()=>({id:'owner'}),getConfig:()=>({}),isAdmin:()=>true,getCatalog:()=>({projects:[]}),toast(){},modal(_,html){const d=document.getElementById('modal');d.innerHTML=html;d.open=true;}});ui.data=structuredClone(server);ui.renderCalendar=async()=>{};
 ui.repo={save:async(kind,rows)=>{assert.equal(kind,'events','A calendar change must never rewrite the 44 MB report list');writes.push(new Blob([JSON.stringify(rows)]).size);server[kind]=structuredClone(rows);},load:async kind=>structuredClone(server[kind]),loadAll:async()=>structuredClone(server)};
 t.after(()=>{dom.window.close();delete globalThis.confirm;});return {ui,server,writes};
}
test('planning an intervention writes only the small calendar and keeps the report untouched',async t=>{
 const {ui,server,writes}=fixture(t);await ui.planEvent(null,{date:'2026-10-29',start:'09:00'});document.getElementById('eventLink').value='intervention|i';document.getElementById('eventLink').dispatchEvent(new window.Event('change'));document.getElementById('eventDate').value='2026-10-29';document.getElementById('eventStart').value='09:00';document.getElementById('eventEnd').value='10:00';
 // Team selection is optional; the save uses the picker state.
 await document.getElementById('eventForm').onsubmit({preventDefault(){}});
 assert.equal(writes.length,1);assert.ok(writes[0]<10000);assert.equal(server.interventions[0].photos[0].length,44000023);assert.equal(server.interventions[0].status,'a_planifier');assert.equal(ui.data.interventions[0].status,'planifiee');assert.equal(ui.data.interventions[0].plannedStart,server.events[0].start);
 // Another device sees the confirmed calendar even though the heavy source
 // record still has its original scheduling fields.
 await ui.reload();assert.equal(ui.data.interventions[0].plannedStart,server.events[0].start);
 await undoCalendarChange(ui);assert.equal(server.events.length,0);assert.equal(ui.data.interventions[0].status,'a_planifier');assert.equal(ui.data.interventions[0].plannedStart,undefined);assert.equal(writes.length,2);
});
test('planning fields survive reload, aggregate multiple days, and preserve actual work and completed archives',()=>{
 const data={events:[booking(),booking({id:'e2',start:'2026-10-30T10:00:00Z',end:'2026-10-30T12:00:00Z',teamIds:['a']})],interventions:[{id:'i',status:'en_cours',actualStart:at('08:00'),teamIds:['actual'],notes:'Rapport réel'}],visits:[]};applyCalendarRecordPlan(data);assert.deepEqual(data.interventions[0].teamIds,['actual']);assert.equal(data.interventions[0].plannedEnd,'2026-10-30T12:00:00Z');assert.equal(data.interventions[0].notes,'Rapport réel');
 for(const state of [{status:'terminee'},{status:'facturee'},{status:'annulee'},{status:'planifiee',appArchivedAt:'archive'},{status:'a_planifier',appointmentReplanPending:true}]){const row={id:'i',teamIds:['keep'],...state},before=structuredClone(row);applyCalendarRecordPlan({events:[booking()],interventions:[row]});assert.deepEqual(row,before);}
});
test('visits derive their appointment without another report write and cancelled bookings do not replan them',()=>{
 const visit={id:'v',status:'a_planifier',summary:'Notes',photos:['original']},data={events:[booking({kind:'visit',linkId:'v'})],visits:[visit]};applyCalendarRecordPlan(data);assert.equal(visit.plannedStart,at('09:00'));assert.equal(visit.status,'planifiee');assert.deepEqual(visit.photos,['original']);
 const untouched={id:'v',status:'a_planifier'};applyCalendarRecordPlan({events:[booking({kind:'visit',linkId:'v',status:'cancelled'})],visits:[untouched]});assert.equal(untouched.plannedStart,undefined);
});
test('failed calendar transmission does not change the displayed intervention plan',async t=>{
 const {ui,server,writes}=fixture(t);ui.repo.save=async()=>{throw Error('Connexion interrompue');};const before=structuredClone(ui.data.interventions[0]);ui.data.events=[booking()];await assert.rejects(ui.save('events'),/interrompue/);assert.deepEqual(ui.data.interventions[0],before);assert.equal(writes.length,0);assert.equal(server.events.length,0);
});
