import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {finishAndExport} from '../lib/intervention-flow.js';
import {projectReports} from '../lib/project-field.js';
import {projectReportAlerts} from '../lib/project-report-details.js';
import {alertVersion,unreadAlerts} from '../lib/team-alerts.js';
function setup(){
 const dom=new JSDOM('<div id="modal"></div>',{url:'https://opus.example'});for(const k of ['document','window','localStorage'])globalThis[k]=dom.window[k];
 const saved=[],messages=[],archives=[];const ui=new OpsUI({graph:{},getConfig:()=>({}),getUser:()=>({displayName:'Roberto',mail:'roberto@example.test'}),isAdmin:()=>false,toast:m=>messages.push(m),modal:(title,html)=>document.getElementById('modal').innerHTML=html});
 ui.data.people=[{id:'r',email:'roberto@example.test',name:'Roberto'}];ui.save=async()=>saved.push(structuredClone(ui.data.interventions));ui.saveInterventionPackage=async x=>{archives.push(structuredClone(x));return {folder:'CHANTIER/COMPTES_RENDUS'};};return {ui,saved,messages,archives};
}
test('technician creates daily report inside the selected project and can choose final report',async()=>{
 const {ui,saved}=setup();await projectReports(ui,{id:'p',name:'2026-001172 ANTIN'},{adresse:'Paris'});
 document.getElementById('newReportKind').value='chantier';await document.getElementById('newProjectReport').onclick({currentTarget:document.getElementById('newProjectReport')});
 const x=ui.data.interventions[0];assert.equal(x.projectId,'p');assert.equal(x.reportKind,'chantier');assert.deepEqual(x.teamIds,[]);assert.equal(saved.length,1);assert.equal(document.getElementById('prKind').value,'chantier');assert.match(document.getElementById('finishInterventionButton').textContent,/Envoyer/);assert.equal(projectReportAlerts([x]).length,0);
});
test('final report preserves material needs and requests control without approving closure',async()=>{
 const {ui,archives}=setup();const x={id:'x',number:'TEST',projectId:'p',projectName:'ANTIN',status:'en_cours',photos:[],reportItems:[]};ui.data.interventions=[x];ui.data.projectTracking=[{id:'p',finishedRequested:false}];await ui.openIntervention('x');
 document.getElementById('aStart').value='2026-09-15T08:00';document.getElementById('prKind').value='chantier';document.getElementById('prMaterial').value='4 prises';document.getElementById('prNeededOn').value='2026-09-16';document.getElementById('prProgress').value='Éclairage testé';
 ui.pendingPhotos=Promise.resolve().then(()=>x.photos.push({dataUrl:'photo'}));
 await finishAndExport(ui,x,{ask:async()=> '2026-09-15T17:00'});
 assert.equal(x.materialNeeded,'4 prises');assert.equal(x.materialNeededOn,'2026-09-16');assert.equal(x.progressNotes,'Éclairage testé');assert.equal(x.reportSubmittedBy,'Roberto');assert.ok(x.reportSubmittedAt);assert.equal(x.photos.length,1);assert.equal(archives.length,1);assert.equal(ui.data.projectTracking[0].finishedRequested,true);assert.equal(ui.data.projectTracking[0].controlApproved,false);
 const alerts=projectReportAlerts([x]);assert.equal(alerts.length,1);assert.match(alerts[0].detail,/4 prises/);assert.match(alerts[0].title,/à contrôler/);assert.equal(unreadAlerts(alerts,{[alerts[0].id]:alertVersion(alerts[0])}).length,0);
 assert.equal(projectReportAlerts([{...x,status:'annulee'}]).length,0);
});
test('failed submission does not create a report notification',async()=>{
 const {ui}=setup();const x={id:'x',projectId:'p',status:'en_cours',photos:[],reportItems:[]};ui.data.interventions=[x];await ui.openIntervention('x');document.getElementById('aStart').value='2026-09-15T08:00';document.getElementById('prProgress').value='En cours';ui.save=async()=>{throw Error('offline');};
 await finishAndExport(ui,x,{ask:async()=> '2026-09-15T17:00'});assert.equal(x.status,'en_cours');assert.equal(x.reportSubmittedAt,undefined);assert.equal(projectReportAlerts([x]).length,0);
});
test('project photo gallery accepts more than six photos',async()=>{
 const {ui}=setup();const x={id:'x',projectId:'p',status:'en_cours',photos:[],reportItems:[]};ui.data.interventions=[x];await ui.openIntervention('x');ui.compressPhoto=async f=>({name:f.name,dataUrl:'data:image/jpeg;base64,AA=='});const input=document.getElementById('photoGallery');Object.defineProperty(input,'files',{value:Array.from({length:9},(_,i)=>({name:String(i)}))});await input.onchange();assert.equal(x.photos.length,9);
});
test('quick report entry lists existing reports without creating duplicates; creation stays explicit',async()=>{const {ui,saved}=setup();ui.data.interventions=[{id:'existing',projectId:'p',number:'R1',reportKind:'chantier',status:'en_cours',createdAt:'2026-09-19',photos:[]}];await projectReports(ui,{id:'p',name:'Chantier'},{},{kind:'chantier',create:true});assert.equal(ui.data.interventions.length,1);assert.equal(saved.length,0);assert.ok(document.querySelector('[data-project-report="existing"]'));assert.equal(document.getElementById('newReportKind').value,'chantier');assert.match(document.getElementById('modal').textContent,/Brouillon à reprendre/);await document.getElementById('newProjectReport').onclick({currentTarget:document.getElementById('newProjectReport')});assert.equal(ui.data.interventions.length,2);assert.equal(saved.length,1);});
