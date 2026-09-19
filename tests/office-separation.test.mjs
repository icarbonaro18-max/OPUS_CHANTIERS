import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {finishAndExport} from '../lib/intervention-flow.js';
import {projectsToInvoice,invoiceProject,officeReports} from '../lib/work-records.js';
import {interventionTargets} from '../commandes/targets.js';
function setup(admin=true){
 const dom=new JSDOM('<main id="officePage"></main><main id="interventionsPage"></main><div id="modal"></div>',{url:'https://opus.example'});
 for(const k of ['window','document','localStorage'])globalThis[k]=dom.window[k];
 const projects=[{id:'p',name:'001191 SJE PARIS 07',category:'04'},{id:'review',name:'À contrôler',category:'03'},{id:'arch',name:'Ancien chantier',category:'99'},{id:'paid',name:'Déjà facturé',category:'04'}],opened=[],messages=[];
 const ui=new OpsUI({graph:{},isAdmin:()=>admin,getConfig:()=>({}),getUser:()=>({displayName:'Ignazio'}),getCatalog:()=>({projects}),toast:m=>messages.push(m),modal:(_,h)=>document.getElementById('modal').innerHTML=h,openAlertDocument:async x=>opened.push(x),projectMeta:async()=>({})});
 ui.data.interventions=[{id:'i',number:'INT-0002',title:'Dépannage',status:'en_cours',clientName:'TRIBECA',teamIds:[],photos:[],reportItems:[]},{id:'done',number:'INT-0003',clientName:'Client',status:'terminee'},{id:'draft',number:'INT-0029',projectId:'p',projectName:projects[0].name,status:'en_cours'},{id:'report',number:'INT-0011',projectId:'p',projectName:projects[0].name,status:'terminee',pdfSavedAt:'2026-09-19',pdfFileId:'pdf'},{id:'trash',projectId:'p',status:'terminee',reportDeletedAt:'2026-09-19'}];
 ui.data.visits=[{id:'v',number:'VIS-1',clientName:'Visite cliente',status:'terminee'}];ui.data.projectTracking=[{id:'paid',invoicedAt:'2026-09-19'}];
 ui.save=async()=>{};ui.repo.save=async()=>{};return {ui,projects,opened,messages};
}
test('project reports stay out of independent tabs, counts and material targets without removing stored records',async()=>{
 const {ui}=setup();const before=JSON.stringify(ui.data.interventions);await ui.renderInterventions();
 assert.match(document.getElementById('intCurrent').textContent,/\(1\)/);assert.match(document.getElementById('intCompleted').textContent,/\(1\)/);
 assert.equal(document.querySelector('#intList [data-int]').dataset.int,'i');document.getElementById('intCompleted').click();assert.equal(document.querySelector('#intList [data-int]').dataset.int,'done');
 assert.deepEqual(interventionTargets(ui.data.interventions).map(t=>t.linkId),['i','done']);assert.equal(JSON.stringify(ui.data.interventions),before);
});
test('office includes finished projects once per affair, independent invoices and all three report kinds',async()=>{
 const {ui,opened}=setup();await ui.renderOffice();
 assert.deepEqual([...document.querySelectorAll('[data-project-invoice]')].map(b=>b.dataset.projectInvoice),['p','arch']);
 assert.deepEqual([...document.querySelectorAll('[data-intervention-invoice]')].map(b=>b.dataset.interventionInvoice),['done']);
 assert.equal(document.querySelectorAll('#officeReportList [data-open-report]').length,5);
 const type=document.getElementById('officeReportType');type.value='project';type.onchange();assert.equal(document.querySelectorAll('#officeReportList [data-open-report]').length,2);
 const search=document.getElementById('officeReportSearch');search.value='0011';search.oninput();assert.equal(document.querySelectorAll('#officeReportList [data-open-report-pdf]').length,1);
 await document.querySelector('[data-open-report-pdf]').onclick();assert.equal(opened[0].id,'pdf');
 let id;ui.openIntervention=async v=>{id=v;};search.value='0029';search.oninput();await document.querySelector('[data-open-report]').onclick();assert.equal(id,'draft');
 search.value='';type.value='visit';type.onchange();ui.openVisit=async v=>{id=v;};await document.querySelector('[data-open-report]').onclick();assert.equal(id,'v');
});
test('project invoice persisted without losing tracking or changing reports; failure rolls back; admin-only',async()=>{
 const {ui,projects}=setup();ui.data.projectTracking.push({id:'p',budget:72,controlApproved:true,history:[]});const reports=JSON.stringify(ui.data.interventions);let stored;
 ui.repo.save=async(_kind,rows)=>{stored=structuredClone(rows);};await invoiceProject(ui,projects[0],' F-42 ');
 const p=stored.find(t=>t.id==='p');assert.equal(p.invoiceNumber,'F-42');assert.equal(p.budget,72);assert.ok(p.invoicedAt);assert.equal(projects[0].category,'04');assert.equal(JSON.stringify(ui.data.interventions),reports);
 assert.deepEqual(projectsToInvoice(projects,stored).map(p=>p.id),['arch']);
 const before=JSON.stringify(ui.data.projectTracking);ui.repo.save=async()=>{throw Error('hors ligne');};await assert.rejects(invoiceProject(ui,projects[2]),/hors ligne/);assert.equal(JSON.stringify(ui.data.projectTracking),before);
 ui.c.isAdmin=()=>false;await assert.rejects(invoiceProject(ui,projects[2]),/administrateur/);await ui.renderOffice();assert.equal(document.getElementById('officePage').children.length,0);
});
test('independent final report completes intervention, switches tab and appears in office without moving a project',async()=>{
 const {ui}=setup();const x=ui.data.interventions[0];let archives=0,moves=0;ui.c.ensureProjectReview=async()=>moves++;ui.saveInterventionPackage=async()=>{archives++;return {folder:'INTERVENTIONS'};};
 await ui.openIntervention(x.id);document.getElementById('aStart').value='2026-09-19T08:00';document.getElementById('aWork').value='Dépannage terminé';await finishAndExport(ui,x,{ask:async()=> '2026-09-19T10:00'});
 assert.equal(x.status,'terminee');assert.equal(ui.interventionView,'completed');assert.equal(archives,1);assert.equal(moves,0);assert.equal(ui.data.interventions.length,5);
 await ui.renderOffice();assert.ok(document.querySelector('[data-intervention-invoice="i"]'));assert.equal(officeReports(ui.data).filter(r=>r.kind==='project').length,2);
});
test('office project link changes section; new calendar targets exclude reports while legacy appointment remains editable',async()=>{
 const {ui}=setup();const actions=[];ui.show=async section=>actions.push(section);ui.c.openProject=async id=>actions.push(id);await ui.renderOffice();
 await document.querySelector('[data-office-project="p"]').onclick();assert.deepEqual(actions,['projects','p']);
 await ui.planEvent();assert.equal(document.querySelector('#eventLink option[value="intervention|report"]'),null);assert.ok(document.querySelector('#eventLink option[value="intervention|i"]'));
 const e={id:'e',kind:'intervention',linkId:'report',start:'2026-09-19T08:00',end:'2026-09-19T10:00',teamIds:[]};const before=JSON.stringify(e);await ui.planEvent(e);assert.equal(document.getElementById('eventLink').value,'intervention|report');assert.equal(JSON.stringify(e),before);
});
