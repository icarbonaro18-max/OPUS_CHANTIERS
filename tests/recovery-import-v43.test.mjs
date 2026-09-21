import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {OpsRepository} from '../lib/ops.js';
import {officeReports} from '../lib/work-records.js';
import {setReportDeleted} from '../lib/report-trash.js';
import {inspectReport,importAndArchive,reportTarget} from '../lib/import-intervention-reports.js';

function setup(admin=true){
 const dom=new JSDOM('<nav id="mainNav" hidden><button data-main="interventions"></button><button data-main="visits"></button><button id="officeNav" data-main="office"></button></nav><main id="interventionsPage"></main><main id="visitsPage"></main><main id="calendarPage"></main><main id="officePage"></main><dialog id="modal"><div id="modalBody"></div></dialog>',{url:'https://opus.example'});
 for(const k of ['window','document','localStorage'])globalThis[k]=dom.window[k];globalThis.confirm=()=>true;
 const messages=[],ui=new OpsUI({graph:{},isAdmin:()=>admin,getUser:()=>({}),getConfig:()=>({}),getCatalog:()=>({projects:[]}),toast:x=>messages.push(x),modal:(_,html)=>document.getElementById('modalBody').innerHTML=html});
 ui.data={clients:[],people:[],interventions:[],visits:[],events:[],closures:[],projectTracking:[]};ui.repo.save=async()=>{};
 return {ui,messages};
}

test('V42 regression: report trash never removes planned visits/interventions or calendar events',async()=>{
 const {ui}=setup();
 const i={id:'i',number:'INT-2026-0006',clientName:'Client',status:'planifiee',plannedStart:'2026-09-22T08:00',teamIds:['p']};
 const v={id:'v',number:'VIS-2026-0001',status:'planifiee',title:'Diagnostic',request:'Préparer un devis'};
 ui.data.interventions=[i];ui.data.visits=[v];ui.data.events=[{id:'ei',kind:'intervention',linkId:'i'},{id:'ev',kind:'visit',linkId:'v'}];const events=JSON.stringify(ui.data.events);
 assert.equal(officeReports(ui.data).length,0);
 // Simulate flags created by V42: the correction must recover visibility on read.
 await setReportDeleted(ui,i,true);await setReportDeleted(ui,v,true,'visits');
 await ui.renderInterventions();await ui.renderVisits();
 assert.ok(document.querySelector('[data-int="i"]'));assert.ok(document.querySelector('[data-visit="v"]'));assert.equal(JSON.stringify(ui.data.events),events);
 assert.equal(officeReports(ui.data,{trash:true}).length,2);assert.equal(ui.data.interventions.length,1);assert.equal(ui.data.visits.length,1);
 i.reportDeletedAt=null;i.workDone='Travaux effectués';assert.equal(officeReports(ui.data).length,1);
});

test('Microsoft read errors never become empty arrays and block writes until a successful reload',async()=>{
 let fail=true,stored=0,missing=false;
 const repo=new OpsRepository({folder:async()=>({id:'root'}),named:async()=>missing?null:{id:'data'},json:async()=>{if(fail)throw Error('403 Accès refusé');return [{id:'existing'}];},writeJson:async()=>{stored++;}});
 await assert.rejects(repo.load('visits'),/visites avant devis.*403/);await assert.rejects(repo.save('visits',[]),/bloqué/);assert.equal(stored,0);
 fail=false;assert.equal((await repo.load('visits'))[0].id,'existing');await repo.save('visits',[{id:'existing'}]);assert.equal(stored,1);
 missing=true;await assert.rejects(repo.load('visits'),/introuvable/);await assert.rejects(repo.save('visits',[]),/bloqué/);
 missing=false;repo.g.json=async()=>({broken:true});await assert.rejects(repo.load('visits'),/liste valide/);
});

test('failed reload preserves all previous data; failed startup leaves navigation and explicit retry accessible',async()=>{
 const {ui}=setup(false);ui.data.visits=[{id:'existing'}];const original=ui.data;
 ui.repo.init=async()=>{};ui.repo.loadAll=async()=>{throw Error('Connexion Microsoft expirée');};
 await assert.rejects(ui.init(),/expirée/);assert.equal(ui.data,original);assert.equal(document.getElementById('mainNav').hidden,false);
 await document.querySelector('[data-main="visits"]').onclick();assert.match(document.getElementById('visitsPage').textContent,/Données non chargées/);assert.doesNotMatch(document.getElementById('visitsPage').textContent,/Aucune visite enregistrée/);
 await assert.rejects(ui.save('visits'),/bloqué/);
 ui.repo.loadAll=async()=>({...original,visits:[{id:'existing',number:'VIS-1',clientName:'Retrouvée',status:'planifiee'}]});
 await document.querySelector('#visitsPage button').onclick();assert.equal(ui.dataLoadError,null);assert.ok(document.querySelector('[data-visit="existing"]'));
});

const fakePdf=number=>({name:number+'_RAPPORT_INTERVENTION.pdf',arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7 original bytes with photos '+number).buffer});
async function entry(number){return inspectReport(fakePdf(number),async()=>number+' RAPPORT D’INTERVENTION');}
function cloud(ui){
 let rows=[6,7,10].map(n=>({id:'id'+n,number:'INT-2026-'+String(n).padStart(4,'0'),status:n===7?'facturee':'planifiee',clientName:'Client '+n,photos:['original-photo'],teamIds:['p'],plannedStart:'2026-09-22T08:00',actualStart:n===7?'2026-09-21T09:00':'',invoiceNumber:n===7?'F-7':undefined,pdfFileId:'older'+n,custom:{preserve:true}}));
 rows.push({id:'another',number:'INT-2026-0050',status:'planifiee',notes:'Ajouté depuis une autre tablette'});
 const uploaded=new Map(),writes=[];let etag='v1',failUpload=false,conflict=false,unconfirmed=false,readbackBad=false;
 ui.c.graph={named:async(_parent,name)=>({id:name}),item:async id=>({id,eTag:etag}),json:async()=>readbackBad?[]:structuredClone(rows),folder:async(parent,name)=>({id:parent+'/'+name,name}),base:id=>'/items/'+id,
  request:async(path,opts)=>{
   if(opts.headers['Content-Type']==='application/pdf'){
    if(failUpload)throw Error('Transfert interrompu');const id='file:'+path;uploaded.set(path,{id,bytes:await opts.body.text()});return unconfirmed?{}:{id};
   }
   writes.push(opts);
   if(conflict||opts.headers['If-Match']!==etag)throw Error('412 Modification simultanée');
   rows=JSON.parse(await opts.body.text());etag='v'+(Number(etag.slice(1))+1);return {id:'interventions.json'};
  }};
 return {get rows(){return rows;},set rows(x){rows=x;},uploaded,writes,set failUpload(x){failUpload=x;},set conflict(x){conflict=x;},set unconfirmed(x){unconfirmed=x;},set readbackBad(x){readbackBad=x;}};
}

test('three PDFs attach to existing IDs, preserve original bytes, photos, team, old PDFs and other records; archive is not billing',async()=>{
 const {ui}=setup(),c=cloud(ui);const other=structuredClone(c.rows[3]);ui.data.interventions=[];ui.data.visits=[{id:'visit'}];ui.data.events=[{id:'event'}];
 const entries=await Promise.all([6,7,10].map(n=>entry('INT-2026-'+String(n).padStart(4,'0'))));
 const saved=await importAndArchive(ui,entries);assert.equal(saved.length,3);assert.equal(c.rows.length,4);assert.deepEqual(c.rows[3],other);assert.equal(c.uploaded.size,3);
 for(const r of c.rows.slice(0,3)){assert.ok(r.archivedAt);assert.deepEqual(r.photos,['original-photo']);assert.deepEqual(r.teamIds,['p']);assert.deepEqual(r.custom,{preserve:true});assert.equal(r.reportImports[0].previousPdf.id,'older'+r.id.slice(2));assert.equal(r.reportImports.length,1);}
 assert.equal(c.rows[0].status,'terminee');assert.equal(c.rows[1].status,'facturee');assert.equal(c.rows[1].invoiceNumber,'F-7');assert.equal(c.rows[0].actualStart,'');
 for(const e of entries)assert.ok([...c.uploaded.values()].some(p=>p.bytes===('%PDF-1.7 original bytes with photos '+e.number)));
 assert.deepEqual(ui.data.visits,[{id:'visit'}]);assert.deepEqual(ui.data.events,[{id:'event'}]);
 await ui.renderInterventions();assert.equal(document.querySelectorAll('[data-int]').length,1);document.getElementById('intArchived').click();assert.equal(document.querySelectorAll('[data-int]').length,3);
 await ui.renderOffice();assert.ok(document.querySelector('[data-intervention-invoice="id6"]'));assert.ok(document.querySelector('[data-intervention-invoice="id10"]'));assert.equal(document.querySelector('[data-intervention-invoice="id7"]'),null);
 assert.equal(officeReports(ui.data).length,3);
 await importAndArchive(ui,entries);assert.equal(c.uploaded.size,3);assert.equal(c.rows[0].reportImports.length,1);assert.equal(c.rows.length,4);
});

test('missing, ambiguous, cancelled or project-linked intervention blocks the whole import before any upload',async()=>{
 const {ui}=setup(),c=cloud(ui),e6=await entry('INT-2026-0006'),missing=await entry('INT-2026-9999');
 await assert.rejects(importAndArchive(ui,[e6,missing]),/introuvable/);assert.equal(c.uploaded.size,0);
 const r=c.rows[0];assert.throws(()=>reportTarget([r,r],r.number),/plusieurs/);assert.throws(()=>reportTarget([{...r,projectId:'chantier'}],r.number),/chantier/);assert.throws(()=>reportTarget([{...r,status:'annulee'}],r.number),/annulée/);
 await assert.rejects(importAndArchive(ui,[e6,e6]),/un seul/);assert.equal(c.writes.length,0);
});

test('upload failure or missing upload confirmation never archives; concurrent edits are not overwritten and retry is idempotent',async()=>{
 const {ui}=setup(),c=cloud(ui),e=await entry('INT-2026-0006'),before=structuredClone(c.rows);const local=ui.data.interventions;
 c.failUpload=true;await assert.rejects(importAndArchive(ui,[e]),/interrompu/);assert.deepEqual(c.rows,before);assert.equal(c.writes.length,0);
 c.failUpload=false;c.unconfirmed=true;await assert.rejects(importAndArchive(ui,[e]),/non confirmé/);assert.deepEqual(c.rows,before);
 c.unconfirmed=false;c.conflict=true;await assert.rejects(importAndArchive(ui,[e]),/412/);assert.deepEqual(c.rows,before);assert.equal(ui.data.interventions,local);
 c.conflict=false;c.rows[3].notes='Modification récente conservée';await importAndArchive(ui,[e]);assert.equal(c.rows[3].notes,'Modification récente conservée');assert.ok(c.rows[0].archivedAt);assert.equal(c.uploaded.size,1);
});

test('PDF content number must agree with filename; invalid PDFs and non-admin imports are rejected',async()=>{
 await assert.rejects(inspectReport(fakePdf('INT-2026-0006'),async()=> 'INT-2026-0007'),/correspond pas/);
 await assert.rejects(inspectReport(fakePdf('INT-2026-0006'),async()=> 'INT-2026-0006 INT-2026-0007'),/ambigu/);
 await assert.rejects(inspectReport({name:'wrong.pdf',arrayBuffer:async()=>new TextEncoder().encode('not pdf').buffer}),/non valide/);
 const {ui}=setup(false),c=cloud(ui);await assert.rejects(importAndArchive(ui,[await entry('INT-2026-0006')]),/administrateur/);assert.equal(c.uploaded.size,0);
 ui.c.isAdmin=()=>true;ui.dataLoadError=Error('unloaded');await assert.rejects(importAndArchive(ui,[await entry('INT-2026-0006')]),/Rechargez/);assert.equal(c.uploaded.size,0);
});
