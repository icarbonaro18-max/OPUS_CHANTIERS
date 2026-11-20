import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';import {setVisitQuote,visitStage} from '../lib/visit-followup.js';
import {finishInterventionWithoutReport,finishProjectWithoutReport,mountReviewInterventions,pendingReview} from '../lib/completion-workflow.js';
import {reportArchiveDue} from '../lib/intervention-archive.js';import {officeReports} from '../lib/work-records.js';
function setup(t,admin=true){
 const dom=new JSDOM('<main id="calendarPage"></main><main id="officePage"></main><div id="review"></div><dialog id="modal"></dialog>',{url:'https://opus.test'}),keys=['window','document','localStorage','confirm'],old=keys.map(k=>globalThis[k]);
 for(const k of keys)globalThis[k]=k==='confirm'?()=>true:dom.window[k];t.after(()=>{dom.window.close();keys.forEach((k,i)=>old[i]===undefined?delete globalThis[k]:globalThis[k]=old[i]);});
 const ui=new OpsUI({graph:{},getUser:()=>({id:'u',mail:'u@opus.test',displayName:'Technicien'}),getConfig:()=>({}),isAdmin:()=>admin,getCatalog:()=>({projects:[]}),toast(){}});
 ui.data={visits:[],interventions:[],people:[],events:[],closures:[],clients:[],projectTracking:[]};ui.repo.save=async()=>({id:'f'});return ui;
}
test('refresh started before quote save cannot restore old data or repository versions',async t=>{
 const ui=setup(t);ui.data.visits=[{id:'v',status:'terminee'}];let resolve,mayApply;ui.repo.loadAll=({shouldApply})=>{mayApply=shouldApply;return new Promise(r=>resolve=r);};
 const refresh=ui.reload({background:true});await setVisitQuote(ui,ui.data.visits[0],' D123 ');assert.equal(mayApply(),false);resolve({...ui.data,visits:[{id:'v',status:'planifiee'}]});assert.equal(await refresh,false);assert.equal(ui.data.visits[0].quoteNumber,'D123');assert.equal(visitStage(ui.data.visits[0]),'quoted');
});
test('quote from old card writes live visit on first attempt and preserves newer fields',async t=>{
 const ui=setup(t),stale={id:'v',status:'planifiee'},live={id:'v',status:'terminee',notes:'récent'};ui.data.visits=[live];let saved;ui.repo.save=async(_,rows)=>saved=structuredClone(rows);await setVisitQuote(ui,stale,'D42');assert.equal(saved[0].quoteNumber,'D42');assert.equal(saved[0].status,'terminee');assert.equal(saved[0].notes,'récent');assert.equal(visitStage(live),'quoted');assert.equal(stale.quoteNumber,undefined);
});
test('failed quote save restores stage and a single retry succeeds',async t=>{
 const ui=setup(t),v={id:'v',status:'terminee'};ui.data.visits=[v];ui.repo.save=async()=>{throw Error('offline');};await assert.rejects(setVisitQuote(ui,v,'D1'),/offline/);assert.equal(visitStage(v),'finished');assert.equal(ui.pendingWrites,0);ui.repo.save=async()=>{};await setVisitQuote(ui,v,'D1');assert.equal(visitStage(v),'quoted');
});
test('technician completes without report, preserves drafts and never invents payroll time',async t=>{
 const ui=setup(t,false),x={id:'i',status:'planifiee',notes:'brouillon',photos:['p'],plannedStart:'2026-11-21T08:00:00Z'};ui.data.interventions=[x];let count=0;ui.repo.save=async()=>count++;await finishInterventionWithoutReport(ui,'i');assert.equal(pendingReview(x),true);assert.equal(x.notes,'brouillon');assert.deepEqual(x.photos,['p']);assert.equal(x.actualStart,undefined);assert.equal(x.actualEnd,undefined);assert.equal(x.invoiceNumber,undefined);await finishInterventionWithoutReport(ui,'i');assert.equal(count,1);
});
test('failed no-report completion retains inputs and original status',async t=>{
 const ui=setup(t),x={id:'i',status:'en_cours',actualStart:'2026-11-20T08:00:00Z',workDone:'Notes'};ui.data.interventions=[x];const before=structuredClone(x);ui.repo.save=async()=>{throw Error('échec');};await assert.rejects(finishInterventionWithoutReport(ui,'i'),/échec/);assert.deepEqual(x,before);assert.equal(ui.pendingWrites,0);
});
test('project finish persists request but only succeeds after verified classification',async t=>{
 const ui=setup(t,false),p={id:'p',category:'02'};ui.c.getCatalog=()=>({projects:[p]});ui.c.ensureProjectReview=async()=>{assert.equal(ui.data.projectTracking[0].finishedRequested,true);throw Error('déplacement');};await assert.rejects(finishProjectWithoutReport(ui,'p'),/déplacement/);ui.c.ensureProjectReview=async()=>p.category='03';await finishProjectWithoutReport(ui,'p');assert.equal(p.category,'03');assert.equal(ui.data.interventions.length,0);
});
test('Saturday appointment displays for technicians and admin without granting planning permission',t=>{
 const ui=setup(t,false);ui.week=new Date(2026,10,16);ui.data.events=[{id:'sat',kind:'free',title:'RDV samedi',start:new Date(2026,10,21,9).toISOString(),end:new Date(2026,10,21,10).toISOString(),teamIds:[]}];ui.renderCalendar();assert.equal(document.querySelectorAll('.hourDay').length,6);assert.match(document.querySelector('.hourGrid').textContent,/sam\./);assert.match(document.querySelector('.hourGrid').textContent,/RDV samedi/);assert.equal(document.querySelectorAll('.hourSlot').length,0);ui.c.isAdmin=()=>true;ui.renderCalendar();assert.equal(document.querySelectorAll('.hourDay').length,6);assert.ok(document.querySelector('[data-slot-date="2026-11-21"]'));
});
test('office contains payroll staff and clients without invoice controls',async t=>{
 const ui=setup(t);await ui.renderOffice();const html=document.getElementById('officePage').innerHTML;assert.match(html,/Paie \/ heures/);assert.match(html,/Clients &amp; sites/);assert.match(html,/Personnel/);assert.doesNotMatch(html,/Marquer facturé|À facturer|data-project-invoice|invoiceNumber|Facturés/);
});
test('project control list includes independent no-report cases and excludes already controlled cases',t=>{
 const ui=setup(t);ui.data.interventions=[{id:'i',number:'INT1',status:'terminee',completionWithoutReport:true},{id:'done',status:'terminee',archivedAt:'2026-11-20'},{id:'project',projectId:'p',status:'terminee'}];mountReviewInterventions(ui,document.getElementById('review'),'03');assert.equal(document.querySelectorAll('[data-review-finish]').length,1);assert.match(document.getElementById('review').textContent,/sans rapport/i);
});
test('retention cannot hide a case still waiting for control; no-report completion does not fabricate report',()=>{
 const x={id:'i',status:'terminee',completedAt:'2026-09-01'};assert.equal(reportArchiveDue(x,new Date('2026-11-20')),false);assert.equal(reportArchiveDue({...x,archivedAt:'2026-09-02'},new Date('2026-11-20')),true);assert.equal(officeReports({interventions:[{...x,completionWithoutReport:true}]}).length,0);
});

test('cancellation button on the card removes an unperformed case and its appointment without requesting invoice or report',async t=>{
 const {mountInterventionCompletion,showCancellation}=await import('../lib/completion-workflow.js');const ui=setup(t),dialog=document.getElementById('modal');dialog.close=()=>dialog.removeAttribute('open');ui.c.modal=(_,html)=>{dialog.innerHTML=html;dialog.setAttribute('open','');};ui.renderInterventions=async()=>{};
 const x={id:'i',status:'a_planifier',notes:'client sans retour'};ui.data.interventions=[x];ui.data.events=[{id:'e',kind:'intervention',linkId:'i',start:'2026-11-21T08:00:00Z',end:'2026-11-21T09:00:00Z',teamIds:[]}];
 const root=document.getElementById('review');root.innerHTML='<article class="projectCard"><h3><button data-int="i">Client</button></h3><div class="actionRow"></div></article>';mountInterventionCompletion(ui,root);assert.match(root.textContent,/Annuler \/ supprimer/);showCancellation(ui,'i');await document.getElementById('cancelUnperformedForm').onsubmit({preventDefault(){}});assert.equal(x.status,'annulee');assert.equal(pendingReview(x),false);assert.equal(ui.data.events.filter(e=>e.linkId==='i').length,0);assert.equal(x.notes,'client sans retour');
});

test('controlled independent intervention appears under completed projects and cannot be reviewed twice',t=>{
 const ui=setup(t);ui.data.interventions=[{id:'done',status:'terminee',archivedAt:'2026-11-20'}];const root=document.getElementById('review');mountReviewInterventions(ui,root,'04');assert.match(root.textContent,/Interventions terminées/);assert.equal(root.querySelectorAll('[data-review-open]').length,1);assert.equal(root.querySelectorAll('[data-review-finish]').length,0);
});
