// DOM simulation of the tablet flows; this is not a physical-device or layout test.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import {OpsUI} from '../lib/ops-ui.js';import {ReportRecovery} from '../lib/report-recovery.js';
async function setup(t){
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://opus.example',pretendToBeVisual:true});for(const k of ['document','window','localStorage'])globalThis[k]=dom.window[k];globalThis.confirm=()=>true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const entries=new Map(),recovery=new ReportRecovery({set:async(k,v)=>entries.set(k,structuredClone(v)),get:async k=>structuredClone(entries.get(k)),remove:async k=>entries.delete(k)},localStorage,'tablet-worker');let writes=0,offline=false;
 const ui=new OpsUI({graph:{},getUser:()=>({id:'worker',mail:'worker@opus.test'}),getConfig:()=>({}),isAdmin:()=>false,getCatalog:()=>({projects:[]}),toast(){},modal(title,html){document.getElementById('modalBody').innerHTML=html;document.getElementById('modal').showModal();},reportRecovery:recovery,loadReportDraft:id=>recovery.load(id),clearReportDraft:async()=>ui.activeReportRecovery?.saved()});
 ui.data={clients:[{id:'c',name:'Client Test',firstName:'Jean',lastName:'Test',email:'j@example.fr',phone:'0600000000',billingAddress:'1 rue A'}],people:[],interventions:[],events:[],closures:[],projectTracking:[],visits:[{id:'v',number:'VIS-TEST',clientId:'c',clientName:'Client Test',type:'Visite avant devis',status:'planifiee',siteAddress:'12 rue du Rendez-vous',photos:[],visitTasks:[]}]};ui.repo.save=async()=>{if(offline)throw Error('Connexion expirée');writes++;};
 t.after(()=>{ui.activeReportRecovery?.stop();dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();delete globalThis.confirm;});return {ui,recovery,writes:()=>writes,setOffline:v=>offline=v};
}
function fill(id,value){const field=document.getElementById(id);field.value=value;field.dispatchEvent(new window.Event('input',{bubbles:true}));}
test('visit text and photos survive failed save, modal replacement and reopening',async t=>{
 const {ui,recovery,setOffline,writes}=await setup(t);await ui.openVisit('v');fill('vSummary','Relevé effectué avec le client');fill('vActualStart','2026-10-09T09:00');fill('vActualEnd','2026-10-09T10:00');ui.data.visits[0].photos=[{dataUrl:'data:image/jpeg;base64,abc'}];await ui.activeReportRecovery.flush();
 setOffline(true);await assert.rejects(document.getElementById('finishVisit').onsubmit({preventDefault(){}}),/expirée/);assert.equal(ui.data.visits[0].status,'planifiee');assert.equal(writes(),0);assert.equal((await recovery.load('v')).summary,'Relevé effectué avec le client');
 ui.c.modal('Connexion','<p>Reconnexion</p>');setOffline(false);await ui.openVisit('v');assert.equal(document.getElementById('vSummary').value,'Relevé effectué avec le client');assert.equal(ui.data.visits[0].photos.length,1);assert.equal(document.getElementById('vActualEnd').value,'2026-10-09T10:00');
});
test('detail text and photos recover without discarding the parent report',async t=>{
 const {ui,recovery}=await setup(t);await ui.openVisit('v');fill('vSummary','Résumé parent');await ui.editVisitTask('v');fill('vtRoom','Cuisine');fill('vtNeed','Trois prises');await ui.activeReportRecovery.flush();
 const pointer=recovery.last();assert.equal(pointer.detail,true);assert.equal(pointer.id,'v');assert.equal((await recovery.load('v')).summary,'Résumé parent');
 ui.c.modal('Reconnexion','<p>Session</p>');await ui.openVisit('v');await ui.editVisitTask('v',pointer.index);assert.equal(document.getElementById('vtRoom').value,'Cuisine');assert.equal(document.getElementById('vtNeed').value,'Trois prises');
 await document.getElementById('visitTaskForm').onsubmit({preventDefault(){}});assert.equal(ui.data.visits[0].visitTasks[0].need,'Trois prises');assert.equal(document.getElementById('vSummary').value,'Résumé parent');assert.equal(ui.data.visits[0].visitTasks.length,1);
});
