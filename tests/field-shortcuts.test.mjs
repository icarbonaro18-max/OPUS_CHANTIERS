import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {previewEvent} from '../lib/calendar-preview.js';
import {validateMaterials,readMaterials,mountMaterials} from '../lib/material-request.js';
import {affairIdentity,matchAffair} from '../commandes/affair.js';
import {orderGroups} from '../lib/project-orders.js';
import {OpsUI} from '../lib/ops-ui.js';
import {finishAndExport} from '../lib/intervention-flow.js';
test('appointment opens an address and team preview, never navigates implicitly',async()=>{
 const dom=new JSDOM('<dialog id="modal"></dialog>');globalThis.document=dom.window.document;dom.window.HTMLDialogElement.prototype.close=function(){};let opened=0;
 const ui={data:{events:[{id:'e',kind:'project',linkId:'p',start:'2026-09-15T08:00',end:'2026-09-15T11:00',teamIds:['a']}],people:[]},canPlan:()=>false,linkLabel:()=> 'SJE PARIS 7',teamNames:()=> 'Alban, Roberto',c:{modal:(t,html)=>document.getElementById('modal').innerHTML=html,projectMeta:async()=>({adresse:'12 rue Exemple, Paris'}),openProject:()=>opened++}};
 await previewEvent(ui,'e');assert.equal(opened,0);assert.match(document.getElementById('modal').textContent,/Alban, Roberto/);assert.match(document.getElementById('eventAddress').textContent,/12 rue/);assert.equal(document.getElementById('eventEdit'),null);document.getElementById('eventFile').onclick();assert.equal(opened,1);
});
test('affair name and number come from selected project and ambiguous matches stay unselected',()=>{
 assert.deepEqual(affairIdentity('2026-001201_SJE_PARIS_07','001172'),{number:'2026-001201',name:'SJE PARIS 07',label:'2026-001201 SJE PARIS 07'});
 const p={id:'p',name:'2026-001201_SJE_PARIS_07'};assert.equal(matchAffair([p],'001201'),p);assert.equal(matchAffair([p,{id:'q',name:'2025-001201_AUTRE'}],'001201'),null);assert.equal(matchAffair([p],'999999'),null);
});
test('free material table preserves reference, quantity and metres; incomplete rows block submission',()=>{
 const dom=new JSDOM('<section class="projectReportSummary"><textarea id="prProgress"></textarea><textarea id="prMaterial"></textarea></section>');globalThis.document=dom.window.document;
 const x={projectId:'p',requestMaterials:[{reference:'REF',description:'Câble 3G2,5',quantity:'20,5',unit:'m'}]};mountMaterials({assistant:{toolsHtml:()=>''}},x);assert.deepEqual(readMaterials(),x.requestMaterials);validateMaterials(readMaterials());assert.throws(()=>validateMaterials([{description:'Prise',reference:'',quantity:'0',unit:'U'}]));document.getElementById('addRequestMaterial').onclick();assert.equal(readMaterials().length,1);
});
test('supplier grouping preserves file indexes and separates supplier folders',()=>{const groups=orderGroups([{name:'a.pdf',orderPath:'FOURNISSEURS / Rexel / a.pdf'},{name:'b.pdf',orderPath:'FOURNISSEURS / YESSS / b.pdf'}]);assert.deepEqual(groups.map(g=>g.name),['Rexel','YESSS']);assert.equal(groups[1].files[0].i,1);});
test('follow-up stays in progress; failed final PDF never requests control',async()=>{
 for(const kind of ['journee','chantier']){const dom=new JSDOM('<div id="modal"></div>',{url:'https://opus.test'});for(const k of ['document','window','localStorage'])globalThis[k]=dom.window[k];
 const ui=new OpsUI({graph:{},getConfig:()=>({}),getUser:()=>({displayName:'Roberto'}),isAdmin:()=>false,toast:()=>{},modal:(t,h)=>document.getElementById('modal').innerHTML=h});const x={id:'x',projectId:'p',status:'en_cours',reportKind:kind,photos:[],reportItems:[]};ui.data.interventions=[x];ui.data.projectTracking=[];ui.save=async()=>{};ui.saveInterventionPackage=async()=>{if(kind==='chantier')throw Error('offline');return {folder:'test'};};await ui.openIntervention('x');document.getElementById('aStart').value='2026-09-15T08:00';document.getElementById('aWork').value='Pose';await finishAndExport(ui,x,{ask:async()=> '2026-09-15T17:00'});assert.deepEqual(ui.data.projectTracking,[]);}
});
