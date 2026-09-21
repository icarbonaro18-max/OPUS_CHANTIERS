import test from 'node:test';
import assert from 'node:assert/strict';
import {setInterventionArchived} from '../lib/import-intervention-reports.js';
import {OpsUI} from '../lib/ops-ui.js';
import {JSDOM} from 'jsdom';
function setup(){
 let rows=[{id:'i',number:'INT-2026-0006',status:'terminee',pdfFileId:'pdf',photos:[{id:'photo'}],plannedStart:'2026-09-21',workDone:'Fait'},{id:'other',status:'planifiee'}];
 const ui={c:{isAdmin:()=>true,graph:{named:async(_,name)=>({id:name}),item:async()=>({id:'file',eTag:'v1'}),json:async()=>structuredClone(rows),base:id=>id,request:async(_,o)=>{assert.equal(o.headers['If-Match'],'v1');rows=JSON.parse(await o.body.text());}}},data:{interventions:[]},user:{displayName:'Admin'}};
 return {ui,getRows:()=>rows};
}
test('archive and restore preserve reports, planning, invoice status and other interventions',async()=>{
 const {ui,getRows}=setup(),before=structuredClone(getRows());
 const archived=await setInterventionArchived(ui,'i');assert.ok(archived.archivedAt);assert.equal(archived.status,'terminee');assert.equal(archived.pdfFileId,'pdf');assert.deepEqual(archived.photos,before[0].photos);assert.equal(archived.plannedStart,before[0].plannedStart);assert.deepEqual(getRows()[1],before[1]);
 await setInterventionArchived(ui,'i',false);assert.equal(getRows()[0].archivedAt,null);
 getRows()[0].status='facturee';await setInterventionArchived(ui,'i');assert.equal(getRows()[0].status,'facturee');
});
test('unauthorized, ongoing and concurrent edits cannot be archived',async()=>{
 const {ui}=setup();ui.c.isAdmin=()=>false;await assert.rejects(setInterventionArchived(ui,'i'),/administrateur/);ui.c.isAdmin=()=>true;
 await assert.rejects(setInterventionArchived(ui,'other'),/achevée/);
 ui.c.graph.request=async()=>{throw Error('412 concurrent update');};await assert.rejects(setInterventionArchived(ui,'i'),/412/);assert.deepEqual(ui.data.interventions,[]);
});
test('completed intervention card has admin archive action and archived card has restore action',()=>{
 const dom=new JSDOM('<body/>');globalThis.document=dom.window.document;
 const x={id:'i',number:'INT-1',status:'terminee',teamIds:[]};
 const context={c:{isAdmin:()=>true},teamNames:()=>''};
 document.body.innerHTML=OpsUI.prototype.interventionCard.call(context,x);assert.equal(document.querySelector('[data-archive-int]').textContent,'Valider et achever');
 x.archivedAt='date';document.body.innerHTML=OpsUI.prototype.interventionCard.call(context,x);assert.equal(document.querySelector('[data-archive-int]').dataset.restore,'true');
 context.c.isAdmin=()=>false;document.body.innerHTML=OpsUI.prototype.interventionCard.call(context,x);assert.equal(document.querySelector('[data-archive-int]'),null);dom.window.close();
});
