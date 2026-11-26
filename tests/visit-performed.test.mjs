import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {previewEvent} from '../lib/calendar-preview.js';
import {markVisitPerformed} from '../lib/visit-followup.js';

function setup(t,{admin=false}={}){
 const dom=new JSDOM('<main id="visitsPage"></main><dialog id="modal"></dialog>',{url:'https://opus.test'});
 for(const key of ['window','document','localStorage','prompt']){
  const old=globalThis[key];
  globalThis[key]=key==='prompt'?()=>'D-42':dom.window[key];
  t.after(()=>{if(old===undefined)delete globalThis[key];else globalThis[key]=old;});
 }
 t.after(()=>dom.window.close());
 const messages=[],writes=[];
 const modal=document.getElementById('modal');
 modal.close=()=>modal.removeAttribute('open');
 const ui=new OpsUI({
  graph:{},getUser:()=>({id:'user'}),isAdmin:()=>admin,getConfig:()=>({}),
  getCatalog:()=>({projects:[]}),toast:message=>messages.push(message),
  modal:(_,html)=>{modal.innerHTML=html;modal.setAttribute('open','');}
 });
 ui.data.visits=[{id:'v',number:'VIS-1',clientName:'Client',status:'planifiee',plannedStart:'2026-11-24T08:00:00Z',teamIds:['p']}];
 ui.data.people=[{id:'p',name:'Camille'}];
 ui.data.events=[{id:'e',kind:'visit',linkId:'v',start:'2026-11-24T08:00:00Z',end:'2026-11-24T09:00:00Z',teamIds:['p']}];
 ui.repo.save=async(kind,rows)=>writes.push([kind,structuredClone(rows)]);
 return {ui,messages,writes,modal};
}

test('one tap on the technician visit card files the visit and leaves actual hours and calendar alone',async t=>{
 const {ui,writes}=setup(t),calendar=structuredClone(ui.data.events);
 let openCount=0;
 ui.openVisit=()=>{openCount++;};
 await ui.renderVisits();
 const button=document.querySelector('[data-visit-performed="v"]');
 assert.equal(button.textContent,'Visite effectuée');
 assert.equal(document.querySelector('[aria-label="Équipe affectée"]').textContent,'Camille');
 assert.equal(button.closest('.projectCard').hidden,false);
 await button.onclick();
 assert.equal(openCount,0);
 assert.equal(writes.length,1);
 const [kind,[saved]]=writes[0];
 assert.equal(kind,'visits');
 assert.equal(saved.status,'terminee');
 assert.ok(saved.completionRecordedAt);
 assert.equal(saved.completionWithoutReport,true);
 assert.equal(saved.needsQuote,true);
 for(const key of ['actualStart','actualEnd','pdfFileId','quoteNumber'])assert.equal(saved[key],undefined);
 assert.deepEqual(ui.data.events,calendar);
 assert.equal(document.querySelector('[data-stage=finished]').getAttribute('aria-pressed'),'true');
 assert.match(document.querySelector('[data-stage=finished]').textContent,/\(1\)/);
 assert.equal(document.querySelector('[data-visit-performed]'),null);
 document.querySelector('[data-visit="v"]').click();
 assert.equal(openCount,1);
 await markVisitPerformed(ui,'v');
 assert.equal(writes.length,1);
});

test('completion uses the current record, rolls back a failed write, and retries without losing draft content',async t=>{
 const {ui,messages}=setup(t);
 await ui.renderVisits();
 const original=ui.data.visits[0];
 const current={...original,notes:'Relevés conservés',photos:['image'],attachments:[{fileId:'f'}],actualStart:'2026-11-24T08:15:00Z'};
 ui.c.prepareAppointmentWrite=async()=>{ui.data.visits=[current];};
 ui.repo.save=async()=>{throw Error('Enregistrement indisponible');};
 const button=document.querySelector('[data-visit-performed]');
 await button.onclick();
 assert.equal(button.disabled,false);
 assert.match(messages.at(-1),/indisponible/);
 assert.deepEqual(current,{...original,notes:'Relevés conservés',photos:['image'],attachments:[{fileId:'f'}],actualStart:'2026-11-24T08:15:00Z'});
 let acknowledge;
 ui.repo.save=()=>new Promise(resolve=>{acknowledge=resolve;});
 const write=button.onclick();
 await button.onclick(); // A second tap while the first write is pending.
 await new Promise(resolve=>setImmediate(resolve));
 assert.notEqual(ui.visitView,'finished');
 acknowledge();
 await write;
 assert.equal(ui.visitView,'finished');
 assert.equal(original.status,'planifiee');
 assert.equal(current.actualStart,'2026-11-24T08:15:00Z');
 assert.deepEqual(current.photos,['image']);
 assert.deepEqual(current.attachments,[{fileId:'f'}]);
});

test('a quote is entered once from the finished tab and retains the visit completion timestamp',async t=>{
 const {ui,writes}=setup(t,{admin:true});
 await ui.renderVisits();
 await document.querySelector('[data-visit-performed]').onclick();
 const recorded=ui.data.visits[0].completionRecordedAt;
 const quote=[...document.querySelectorAll('.projectCard button')].find(b=>b.textContent==='Devis effectué');
 await quote.onclick();
 assert.equal(writes.length,2);
 assert.equal(ui.data.visits[0].quoteNumber,'D-42');
 assert.equal(ui.data.visits[0].completionRecordedAt,recorded);
 assert.equal(document.querySelector('[data-stage=quoted]').getAttribute('aria-pressed'),'true');
 assert.equal(document.querySelector('[data-visit-performed]'),null);
});

test('the calendar appointment uses the same direct completion and opens the finished tab',async t=>{
 const {ui,modal,writes}=setup(t);
 await previewEvent(ui,'e');
 assert.ok(modal.hasAttribute('open'));
 await modal.querySelector('[data-visit-performed]').onclick();
 assert.equal(ui.section,'visits');
 assert.equal(ui.visitView,'finished');
 assert.equal(document.querySelector('.projectCard').hidden,false);
 assert.equal(writes.length,1);
 assert.equal(modal.hasAttribute('open'),false);
});

test('reception, cancelled, converted and archived visits are protected and an anonymous session cannot mark a visit',async t=>{
 const {ui,writes}=setup(t);
 for(const flags of [{type:'Réception de chantier / intervention'},{status:'convertie'},{status:'annulee'},{appArchivedAt:'2026-11-24'}]){
  ui.data.visits=[{id:'v',status:'planifiee',...flags}];
  await ui.renderVisits();
  assert.equal(document.querySelector('[data-visit-performed]'),null);
  await assert.rejects(markVisitPerformed(ui,'v'),/ne peut plus/);
 }
 ui.data.visits=[{id:'v',status:'planifiee'}];
 ui.c.getUser=()=>null;
 await ui.renderVisits();
 assert.equal(document.querySelector('[data-visit-performed]'),null);
 await assert.rejects(markVisitPerformed(ui,'v'),/Connectez/);
 assert.equal(writes.length,0);
});
