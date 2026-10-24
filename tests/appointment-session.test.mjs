import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {saveAppointment,openAppointmentEditor} from '../lib/service-requests.js';

const fields={date:'2026-10-23',start:'13:00',end:'16:00',teamIds:['worker']};
const record=()=>({id:'int-1',clientName:'Client',status:'a_planifier',siteAddress:'Adresse',teamIds:[],plannedStart:'',plannedEnd:''});
function fixture(old=record()){
 const written=[],linked=[];
 const ui={
  c:{},data:{interventions:[old],visits:[],events:[],people:[{id:'worker',name:'Intervenant',active:true}]},
  canPlan:()=>true,toISO:s=>s,localDT:s=>s||'',validateScheduling(){},
  async save(kind){written.push(structuredClone(this.data[kind]));},
  async upsertLinkedEvent(kind,row){linked.push(structuredClone(row));}
 };
 return {ui,old,written,linked};
}

test('appointment submission applies only date and team to the fresh record after warm-start verification',async()=>{
 const {ui,old,written,linked}=fixture();
 const fresh={...record(),clientName:'Client corrigé au bureau',sitePhone:'0123456789',photos:[{id:'photo-1'}],notes:'Ne pas écraser'};
 ui.c.prepareAppointmentWrite=async()=>{ui.data={...ui.data,interventions:[fresh],events:[{id:'current-event',kind:'intervention',linkId:fresh.id}]};};
 ui.validateScheduling=(date,start,end,team,exclude)=>{assert.equal(exclude,'current-event');assert.deepEqual(team,['worker']);};
 await saveAppointment(ui,old,'interventions',fields);
 assert.equal(written.length,1);assert.equal(linked.length,1);
 assert.equal(fresh.plannedStart,'2026-10-23T13:00');assert.deepEqual(fresh.teamIds,['worker']);
 assert.equal(fresh.clientName,'Client corrigé au bureau');assert.equal(fresh.sitePhone,'0123456789');assert.equal(fresh.notes,'Ne pas écraser');assert.deepEqual(fresh.photos,[{id:'photo-1'}]);
 assert.equal(written[0][0].clientName,fresh.clientName);assert.deepEqual(linked[0],fresh);
 assert.equal(old.plannedStart,'');assert.deepEqual(old.teamIds,[]);
});

test('appointment checks fresh personnel and conflicts before either write',async()=>{
 const {ui,old,written,linked}=fixture();
 ui.c.prepareAppointmentWrite=async()=>{ui.data.people[0].active=false;};
 await assert.rejects(saveAppointment(ui,old,'interventions',fields),/équipe a changé/);
 ui.c.prepareAppointmentWrite=async()=>{ui.data.people[0].active=true;ui.data.events=[{id:'conflicting'}];};
 ui.validateScheduling=()=>{assert.equal(ui.data.events[0].id,'conflicting');throw Error('Intervenant déjà affecté');};
 await assert.rejects(saveAppointment(ui,old,'interventions',fields),/déjà affecté/);
 assert.equal(written.length,0);assert.equal(linked.length,0);assert.equal(old.plannedStart,'');
});

test('removed appointment record is not recreated from its old form',async()=>{
 const {ui,old,written}=fixture();
 ui.c.prepareAppointmentWrite=async()=>{ui.data.interventions=[];};
 await assert.rejects(saveAppointment(ui,old,'interventions',fields),/plus disponible/);
 assert.equal(written.length,0);
});

test('concurrent write rejection rolls back scheduling fields on the fresh row and keeps client changes',async()=>{
 const {ui,old,linked}=fixture();
 const fresh={...record(),clientName:'Client actuel'};
 ui.c.prepareAppointmentWrite=async()=>{ui.data.interventions=[fresh];};
 ui.save=async()=>{throw Object.assign(Error('Cette liste a changé'),{status:412});};
 await assert.rejects(saveAppointment(ui,old,'interventions',fields),{status:412});
 assert.equal(fresh.plannedStart,'');assert.equal(fresh.clientName,'Client actuel');assert.deepEqual(fresh.teamIds,[]);assert.equal(linked.length,0);
});

test('failed verification leaves the appointment form, entered fields and retry button intact',async t=>{
 const dom=new JSDOM('<dialog id="modal" open></dialog>',{url:'https://opus.test'});
 globalThis.document=dom.window.document;
 t.after(()=>{dom.window.close();delete globalThis.document;});
 const {ui,old,written}=fixture();let closes=0;const notices=[];
 document.getElementById('modal').close=()=>{closes++;};
 ui.c.modal=(_,html)=>{document.getElementById('modal').innerHTML=html;};
 ui.c.toast=message=>notices.push(message);
 ui.c.prepareAppointmentWrite=async()=>{throw Error('Réseau indisponible. Réessayez.');};
 openAppointmentEditor(ui,old,'interventions');
 const form=document.getElementById('appointmentOnly');
 document.getElementById('appointmentDate').value=fields.date;
 document.getElementById('appointmentStart').value=fields.start;
 document.getElementById('appointmentEnd').value=fields.end;
 form.querySelector('[name=appointmentPerson]').checked=true;
 await form.onsubmit({preventDefault(){}});
 assert.equal(form.isConnected,true);assert.equal(closes,0);assert.equal(written.length,0);assert.deepEqual(notices,[]);
 assert.equal(document.getElementById('appointmentDate').value,fields.date);
 assert.equal(document.getElementById('appointmentStart').value,fields.start);
 assert.equal(form.querySelector('[name=appointmentPerson]').checked,true);
 assert.equal(form.querySelector('[type=submit]').disabled,false);
 assert.match(document.getElementById('appointmentStatus').textContent,/Réseau indisponible/);
});
