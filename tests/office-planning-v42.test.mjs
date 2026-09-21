import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {verifyPlannedProject,confirmPlanning,mountPlanningNotice} from '../lib/planning-confirmation.js';
import {openOfficeReports} from '../lib/office-reports.js';
import {finishAndExport} from '../lib/intervention-flow.js';
import {setReportDeleted} from '../lib/report-trash.js';
import {progress,targetStage} from '../lib/project-progress.js';

function setup(admin=true){
 const dom=new JSDOM('<main id="officePage"></main><main id="interventionsPage"></main><main id="calendarPage"></main><dialog id="modal"><div id="modalBody"></div></dialog>',{url:'https://opus.example'});
 for(const key of ['window','document','Event','localStorage'])globalThis[key]=dom.window[key];
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};globalThis.confirm=()=>true;
 const projects=[{id:'p',name:'001191 SJE',category:'01'},{id:'q',name:'001194 UCPA',category:'01'}],categories=['01','02','03','04','99'].map(code=>({id:'folder'+code,name:code+' dossiers'}));
 const parents={p:'folder01',q:'folder01'},moves=[],saves=[],messages=[];
 const graph={item:async id=>({id,parentReference:{id:parents[id]}}),moveProject:async(item,folder)=>{moves.push([item.id,folder.id]);parents[item.id]=folder.id;}};
 const ui=new OpsUI({graph,isAdmin:()=>admin,getUser:()=>({mail:'roberto@opuselec.fr',displayName:'Roberto'}),getConfig:()=>({managerUsers:['roberto@opuselec.fr']}),getCatalog:()=>({projects,categories}),modal:(_,html)=>{document.getElementById('modalBody').innerHTML=html;document.getElementById('modal').open=true;},toast:m=>messages.push(m)});
 ui.data={clients:[],people:[],interventions:[],visits:[],events:[],projectTracking:[],closures:[]};ui.repo.save=async(kind,rows)=>saves.push({kind,rows:structuredClone(rows)});
 ui.c.ensurePlannedProject=id=>verifyPlannedProject(ui,id);return {ui,parents,moves,saves,messages,projects};
}
const event=(extra={})=>({id:'e',kind:'project',linkId:'p',start:'2026-09-22T08:00:00Z',end:'2026-09-22T11:00:00Z',status:'planifie',teamIds:[],...extra});

test('new grouped calendar appointment is saved once, both projects become in progress without budget/orders, confirmation remains visible',async()=>{
 const {ui,parents,saves}=setup(false);await ui.planEvent();document.getElementById('eventLink').value='project|p';document.getElementById('eventDate').value='2026-09-22';document.querySelector('[data-linked-affair][value="q"]').checked=true;
 await document.getElementById('eventForm').onsubmit({preventDefault(){}});
 assert.equal(ui.data.events.length,1);assert.equal(saves.filter(s=>s.kind==='events').length,1);assert.equal(parents.p,'folder02');assert.equal(parents.q,'folder02');assert.equal(ui.data.projectTracking.length,0);
 assert.match(document.getElementById('planningConfirmation').textContent,/001191 SJE : En cours/);assert.match(document.getElementById('planningConfirmation').textContent,/001194 UCPA : En cours/);
 assert.equal(document.getElementById('modal').open,false);await ui.renderCalendar();assert.ok(document.getElementById('planningConfirmation'));
});
test('failed project move yields warning after calendar save; retry only moves the project, never adds an appointment',async()=>{
 const {ui,saves}=setup();const move=ui.c.graph.moveProject;ui.c.graph.moveProject=async()=>{throw Error('Accès refusé');};await ui.planEvent();document.getElementById('eventLink').value='project|p';document.getElementById('eventDate').value='2026-09-22';await document.getElementById('eventForm').onsubmit({preventDefault(){}});
 assert.equal(ui.data.events.length,1);assert.equal(ui.planningNotice.warning,true);assert.match(ui.planningNotice.message,/Planning enregistré.*Classement non confirmé/);assert.doesNotMatch(ui.planningNotice.message,/SJE : En cours/);
 ui.c.graph.moveProject=move;await document.querySelector('#planningConfirmation button').onclick();assert.equal(ui.planningNotice.warning,false);assert.equal(ui.data.events.length,1);assert.equal(saves.filter(s=>s.kind==='events').length,1);assert.match(document.getElementById('planningConfirmation').textContent,/En cours/);
});
test('failed calendar storage shows no success, restores events and never moves a project',async()=>{
 const {ui,moves}=setup();ui.repo.save=async()=>{throw Error('Hors ligne');};await ui.planEvent();document.getElementById('eventLink').value='project|p';document.getElementById('eventDate').value='2026-09-22';
 await assert.rejects(document.getElementById('eventForm').onsubmit({preventDefault(){}}),/Hors ligne/);assert.equal(ui.data.events.length,0);assert.equal(moves.length,0);assert.equal(ui.planningNotice,undefined);
});
test('classification checks Microsoft response and does not reopen reviewed or closed projects even with stale local category',async()=>{
 const {ui,parents,moves,projects}=setup();ui.data.events=[event()];
 for(const stage of ['03','04','99']){parents.p='folder'+stage;projects[0].category='01';const result=await verifyPlannedProject(ui,'p');assert.equal(result.category,stage);assert.equal(moves.length,0);}
 parents.p='folder01';projects[0].category='01';ui.c.graph.moveProject=async()=>{};await assert.rejects(verifyPlannedProject(ui,'p'),/pas confirmé/);assert.equal(projects[0].category,'01');
 ui.data.events=[event({status:'cancelled'})];assert.equal(targetStage(projects[0],progress(ui.data,'p')),'01');await assert.rejects(verifyPlannedProject(ui,'p'),/Aucun rendez-vous/);
});
test('office tile opens paginated reports; modify and reversible delete/restore work for visits and project reports',async()=>{
 const {ui,saves}=setup();ui.section='office';ui.data.interventions=Array.from({length:12},(_,i)=>({id:'r'+i,number:'R'+i,projectId:'p',projectName:'Affaire SJE',status:'en_cours',createdAt:'2026-09-21'}));
 ui.data.visits=[{id:'v',number:'VIS-1',clientName:'Visite client',status:'terminee',photos:['photo'],actualStart:'2026-09-20T08:00',actualEnd:'2026-09-20T10:00',pdfFileId:'original'}];
 await ui.renderOffice();assert.equal(document.getElementById('officeReportList'),null);assert.equal(document.querySelector('.officeClientDetails').open,false);document.getElementById('openOfficeReports').click();assert.equal(document.querySelectorAll('[data-open-report]').length,10);document.getElementById('officeReportsNext').click();assert.equal(document.querySelectorAll('[data-open-report]').length,3);
 const type=document.getElementById('officeReportType');type.value='visit';type.onchange();assert.equal(document.querySelectorAll('[data-open-report]').length,1);let edited;ui.openVisit=async id=>{edited=id;};await document.querySelector('[data-edit-report]').onclick();assert.equal(edited,'v');
 await document.querySelector('[data-delete-report]').onclick();assert.ok(ui.data.visits[0].reportDeletedAt);assert.equal(saves.at(-1).kind,'visits');assert.equal(ui.data.visits[0].status,'terminee');assert.equal(ui.data.visits[0].pdfFileId,'original');assert.deepEqual(ui.data.visits[0].photos,['photo']);assert.equal(ui.data.events.length,0);
 document.getElementById('officeReportTrash').click();assert.equal(document.querySelectorAll('[data-delete-report]').length,1);await document.querySelector('[data-delete-report]').onclick();assert.equal(ui.data.visits[0].reportDeletedAt,null);
 document.getElementById('officeReportTrash').click();type.value='project';type.onchange();ui.repo.save=async()=>{throw Error('Échec réseau');};await document.querySelector('[data-delete-report]').onclick();assert.equal(ui.data.interventions[0].reportDeletedAt,undefined);assert.match(document.getElementById('officeReportNotice').textContent,/Échec réseau/);
});
test('office actions remain administrator-only',async()=>{
 const {ui}=setup(false);openOfficeReports(ui);assert.equal(document.getElementById('officeReportList'),null);await assert.rejects(setReportDeleted(ui,{id:'r'},true),/administrateur/);
});
test('Roberto can complete an independent report with photos, see confirmation and open completed interventions; failure does not complete',async()=>{
 const {ui}=setup(false);const x={id:'i',number:'INT-1',status:'planifiee',photos:['data:image/png;base64,eA=='],reportItems:[]};ui.data.interventions=[x];let fail=true,archives=0;ui.saveInterventionPackage=async()=>{if(fail)throw Error('Réseau');archives++;return {folder:'INTERVENTIONS'};};
 await ui.openIntervention(x.id);assert.equal(document.getElementById('finishInterventionButton').textContent,'Enregistrer dans OPUS et terminer');assert.equal(document.getElementById('deleteIntReport'),null);
 document.getElementById('aStart').value='2026-09-21T08:00';await finishAndExport(ui,x,{ask:async()=> '2026-09-21T10:00'});assert.equal(x.status,'planifiee');assert.equal(document.getElementById('seeCompletedInterventions'),null);assert.match(document.getElementById('reportSaveStatus').textContent,/PDF non archivé/);
 fail=false;await finishAndExport(ui,x,{ask:async()=> '2026-09-21T10:00'});assert.equal(archives,1);assert.equal(x.status,'terminee');assert.match(document.getElementById('reportSaveStatus').textContent,/Intervention achevée/);await document.getElementById('seeCompletedInterventions').onclick();assert.equal(ui.section,'interventions');assert.equal(ui.interventionView,'completed');assert.ok(document.querySelector('[data-int="i"]'));
});
test('failed final status save keeps intervention in its previous state despite successful PDF, and reports the partial success',async()=>{
 const {ui}=setup(false);const x={id:'i',number:'INT-1',status:'en_cours',photos:[],reportItems:[]};ui.data.interventions=[x];ui.saveInterventionPackage=async()=>({folder:'INTERVENTIONS'});let saves=0;ui.save=async()=>{if(++saves===2)throw Error('Connexion perdue');};await ui.openIntervention(x.id);document.getElementById('aStart').value='2026-09-21T08:00';document.getElementById('aWork').value='Travaux terminés';
 await finishAndExport(ui,x,{ask:async()=> '2026-09-21T10:00'});assert.equal(x.status,'en_cours');assert.match(document.getElementById('reportSaveStatus').textContent,/PDF enregistré, mais fin d’intervention non confirmée/);assert.equal(document.getElementById('seeCompletedInterventions'),null);
});

test('editing an existing appointment rolls back on storage error and leaves no success banner',async()=>{
 const {ui,moves}=setup();const e=event();ui.data.events=[e];const before=JSON.stringify(e);ui.repo.save=async()=>{throw Error('Hors ligne');};await ui.planEvent(e);document.getElementById('eventEnd').value='15:00';
 await assert.rejects(document.getElementById('eventForm').onsubmit({preventDefault(){}}),/Hors ligne/);assert.equal(JSON.stringify(ui.data.events[0]),before);assert.equal(ui.data.events.length,1);assert.equal(moves.length,0);assert.equal(ui.planningNotice,undefined);
});
test('updating a report from a closed project keeps office classification unchanged',async()=>{
 const {ui,projects}=setup();ui.section='office';projects[0].category='04';const x={id:'r',number:'R1',projectId:'p',reportKind:'chantier',status:'terminee',photos:[],reportItems:[],actualStart:'2026-09-21T08:00',actualEnd:'2026-09-21T10:00',workDone:'Terminé'};ui.data.interventions=[x];ui.saveInterventionPackage=async()=>({folder:'COMPTES_RENDUS'});ui.c.ensureProjectReview=async()=>{throw Error('Must not reopen');};await ui.openIntervention(x.id);assert.ok(document.getElementById('backOfficeReports'));
 await finishAndExport(ui,x,{ask:async()=> '2026-09-21T10:00'});assert.equal(projects[0].category,'04');assert.equal(ui.data.projectTracking.length,0);assert.match(document.getElementById('reportSaveStatus').textContent,/reste clôturé/);
});
test('putting an independent report in the trash does not remove its pending billing',async()=>{
 const {ui}=setup();const x={id:'i',number:'INT-1',status:'terminee',workDone:'Travaux'};ui.data.interventions=[x];await setReportDeleted(ui,x,true);await ui.renderOffice();assert.ok(document.querySelector('[data-intervention-invoice="i"]'));globalThis.prompt=()=> 'F-100';await ui.markBilled(x.id);assert.equal(x.status,'facturee');assert.equal(x.invoiceNumber,'F-100');assert.ok(x.reportDeletedAt);
});
