import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {bindSetupRecovery,mountSetupRecoveries} from '../lib/setup-recovery.js';
import {restoreServiceFiles,pendingServiceFiles} from '../lib/service-requests.js';

function setup(t){
 const dom=new JSDOM('<main id="interventionsPage"><div class="pageHeading"></div></main><main id="visitsPage"></main><dialog id="modal"></dialog>',{url:'https://opus.test'}),previous=new Map(['window','document','localStorage','Event'].map(key=>[key,globalThis[key]]));
 for(const key of previous.keys())globalThis[key]=dom.window[key];t.after(()=>{dom.window.close();for(const [key,value]of previous){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 const records=new Map(),writes=[],messages=[];const store={namespace:'owner',get:async key=>structuredClone(records.get(key)),set:async(key,value)=>records.set(key,structuredClone(value)),remove:async key=>records.delete(key),keys:async prefix=>[...records.keys()].filter(key=>key.startsWith(prefix))};
 const dialog=document.getElementById('modal');dialog.close=()=>dialog.removeAttribute('open');
 const ui=new OpsUI({graph:{},localStore:store,getUser:()=>({id:'owner',displayName:'Bureau'}),getConfig:()=>({}),isAdmin:()=>true,getCatalog:()=>({projects:[]}),toast:message=>messages.push(message),modal:(_,html)=>{dialog.innerHTML=html;dialog.setAttribute('open','');}});
 ui.data={clients:[{id:'c',name:'Client',billingAddress:'Agence',sites:[]}],people:[],interventions:[],visits:[],events:[],closures:[],projectTracking:[]};ui.assistant={languageSelectHtml:()=>'',toolsHtml:()=>'',bind(){}};
 ui.repo={save:async kind=>writes.push(kind)};return {ui,store,records,writes,messages,dialog};
}
const fast=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Save still waiting for unrelated work')),200))]);}finally{clearTimeout(timer);}};
test('a confirmed remote write does not wait for a blocked local cache or global project scan',async t=>{
 const {ui,writes}=setup(t);ui.c.cacheSavedKind=()=>new Promise(()=>{});ui.c.syncProjectStages=()=>new Promise(()=>{});await fast(ui.save('interventions'));assert.deepEqual(writes,['interventions']);
});
test('a Microsoft write failure remains a failure even though other save work is asynchronous',async t=>{
 const {ui}=setup(t);let cache=0,stages=0;ui.repo.save=async()=>{throw Object.assign(Error('conflict'),{status:412});};ui.c.cacheSavedKind=async()=>cache++;ui.c.syncProjectStages=async()=>stages++;
 await assert.rejects(ui.save('interventions'),/conflict/);assert.equal(ui.needsRefresh,true);assert.equal(cache,0);assert.equal(stages,0);
});
test('a new intervention is checkpointed before transmission and retains its fields after failure',async t=>{
 const {ui,records,dialog}=setup(t);await ui.editIntervention();document.getElementById('iClient').value='c';document.getElementById('iTitle').value='Dépannage';document.getElementById('iSiteAddress').value='Adresse précise';
 ui.repo.save=async()=>{assert.ok([...records.keys()].some(key=>key.startsWith('setup-draft:interventions:')));throw Error('Envoi interrompu');};
 await assert.rejects(document.getElementById('intForm').onsubmit({preventDefault(){}}),/Envoi interrompu/);
 assert.equal(dialog.open,true);assert.equal(document.querySelector('button[type=submit]').disabled,false);assert.match(document.querySelector('[data-save-status]').textContent,/interrompu/);assert.equal(ui.data.interventions.length,0);
 const draft=[...records.values()][0];assert.equal(draft.fields.find(row=>row.id==='iTitle').value,'Dépannage');assert.equal(draft.fields.find(row=>row.id==='iSiteAddress').value,'Adresse précise');assert.ok(draft.record.id);assert.equal(draft.record.photos,undefined);
});
test('a checkpoint storage failure stops transmission and retains the displayed form',async t=>{
 const {ui,store,writes}=setup(t);store.set=async()=>{throw Error('Stockage local plein');};await ui.editIntervention();document.getElementById('iClient').value='c';document.getElementById('iTitle').value='Test';document.getElementById('iSiteAddress').value='Paris';
 await assert.rejects(document.getElementById('intForm').onsubmit({preventDefault(){}}),/Stockage local plein/);assert.equal(writes.length,0);assert.equal(document.getElementById('iTitle').value,'Test');
});
test('after a partial failure, retrying the same new client does not create a second client',async t=>{
 const {ui}=setup(t);await ui.editIntervention();document.getElementById('iMode').value='new';document.getElementById('iMode').onchange();document.getElementById('iName').value='Syndic';document.getElementById('iAddress').value='Adresse agence';document.getElementById('iSiteAddress').value='Adresse intervention';
 const first=await ui.resolveClientChoice('i');const second=await ui.resolveClientChoice('i');assert.equal(first.client.id,second.client.id);assert.equal(ui.data.clients.length,2);assert.equal(document.getElementById('iMode').value,'existing');
});
test('a setup recovery restores stable identity and contact fields without copying the existing report photos',async t=>{
 const {ui,store}=setup(t);await ui.editIntervention();const form=document.getElementById('intForm'),record={id:'stable',number:'INT-2026-9000',photos:['large'],clientId:'c'};document.getElementById('iClient').value='c';document.getElementById('iSitePhone').value='0612345678';
 const controller=bindSetupRecovery(ui,'interventions',record,form);await controller.checkpoint();const draft=await store.get('setup-draft:interventions:stable');assert.equal(draft.record.photos,undefined);
 await ui.editIntervention(null,null,draft);assert.equal(document.getElementById('iSitePhone').value,'0612345678');assert.equal(document.getElementById('intForm').querySelector('input[readonly]').value,'INT-2026-9000');
});
test('recovering a partially confirmed creation refreshes the server and reopens the existing record',async t=>{
 const {ui,store}=setup(t),draft={kind:'interventions',record:{id:'same',number:'INT-1'},fields:[]};await store.set('setup-draft:interventions:same',draft);let refreshes=0,opened;
 ui.reload=async()=>{refreshes++;ui.data.interventions=[{id:'same',number:'INT-1',summary:'Report added elsewhere'}];};ui.editIntervention=async(existing,seed,recovered)=>opened={existing,recovered};
 await mountSetupRecoveries(ui,document.getElementById('interventionsPage'),'interventions');await document.querySelector('#interventionsPage button').onclick();assert.equal(refreshes,1);assert.equal(opened.existing.summary,'Report added elsewhere');assert.equal(opened.recovered.record.id,'same');
});
test('a fully confirmed intervention and calendar remove the local checkpoint',async t=>{
 const {ui,records,writes}=setup(t);ui.renderInterventions=async()=>{};ui.openIntervention=async()=>{};await ui.editIntervention();document.getElementById('iClient').value='c';document.getElementById('iTitle').value='Test';document.getElementById('iSiteAddress').value='Paris';
 await document.getElementById('intForm').onsubmit({preventDefault(){}});assert.ok(writes.includes('interventions'));assert.ok(writes.includes('events'));assert.equal(records.size,0);assert.equal(ui.data.interventions.length,1);
});

test('a visit creation is checkpointed too and retains the entered contact after a failed write',async t=>{
 const {ui,records}=setup(t);await ui.editVisit();document.getElementById('vClient').value='c';document.getElementById('vMeetingAddress').value='Adresse de visite';document.getElementById('vContactPhone').value='0612345678';ui.repo.save=async()=>{throw Error('Envoi interrompu');};
 await assert.rejects(document.getElementById('visitForm').onsubmit({preventDefault(){}}),/Envoi interrompu/);const draft=[...records.values()][0];assert.equal(draft.kind,'visits');assert.equal(draft.fields.find(row=>row.id==='vContactPhone').value,'0612345678');assert.equal(ui.data.visits.length,0);
});
test('checkpointed attachments keep their names and bytes through reload and another checkpoint',async t=>{
 const {ui,store}=setup(t);await ui.editIntervention();const form=document.getElementById('intForm');form.insertAdjacentHTML('beforeend','<input type="file" id="testFiles">');const file=Object.assign(new Blob(['PDF bytes'],{type:'application/pdf'}),{name:'ordre.pdf'}),record={id:'with-files',number:'INT-1'};restoreServiceFiles(record,[file]);Object.defineProperty(document.getElementById('testFiles'),'files',{value:[file],configurable:true});
 await bindSetupRecovery(ui,'interventions',record,form).checkpoint();const first=await store.get('setup-draft:interventions:with-files');assert.equal(first.serviceFiles[0].name,'ordre.pdf');assert.equal(await first.serviceFiles[0].blob.text(),'PDF bytes');
 Object.defineProperty(document.getElementById('testFiles'),'files',{value:[],configurable:true});const target={id:'with-files',number:'INT-1'},recovery=bindSetupRecovery(ui,'interventions',target,form,first);assert.equal(pendingServiceFiles(target)[0].name,'ordre.pdf');assert.equal(await recovery.files('testFiles')[0].text(),'PDF bytes');await recovery.checkpoint();const second=await store.get('setup-draft:interventions:with-files');assert.equal(second.formFiles[0].files[0].name,'ordre.pdf');assert.equal(await second.formFiles[0].files[0].blob.text(),'PDF bytes');
});
