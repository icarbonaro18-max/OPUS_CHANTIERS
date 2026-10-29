import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
import {canViewStorage,renderStorageGauge} from '../lib/storage-overview.js';
import {trustedOneDriveUrl,openReportOneDrive} from '../lib/onedrive-reports.js';
import {reportArchiveDue} from '../lib/intervention-archive.js';

function setup(t){
 const dom=new JSDOM('<dialog id="modal"></dialog><main id="visitsPage"></main>',{url:'https://opus.example'});
 for(const key of ['document','window','localStorage'])globalThis[key]=dom.window[key];globalThis.confirm=()=>true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const messages=[],writes=[],copies=[];let fail='';
 const graph={folder:async(parent,name)=>({id:'dir',webUrl:'https://opuselec.sharepoint.com/reports'}),base:id=>'/items/'+id,request:async()=>{if(fail==='pdf')throw Error('PDF interrompu');copies.push('pdf');return {id:'pdf',webUrl:'https://opuselec.sharepoint.com/report.pdf'};},writeJson:async(parent,name,value)=>{if(fail==='snapshot')throw Error('Fiche interrompue');copies.push(structuredClone(value));return {id:'snapshot'};}};
 const ui=new OpsUI({graph,getConfig:()=>({siteHost:'opuselec.sharepoint.com'}),getUser:()=>({}),isAdmin:()=>true,getCatalog:()=>({projects:[]}),toast:m=>messages.push(m),modal(title,html){document.getElementById('modal').innerHTML=html;document.getElementById('modal').showModal();}});
 const record={id:'v',number:'VIS-1',clientName:'Client',status:'planifiee',photos:[],visitTasks:[]};ui.data.visits=[record];ui.visitPdf=async()=>new Blob(['%PDF-1.4 test']);ui.save=async kind=>{if(fail==='index')throw Error('Liste interrompue');writes.push({kind,record:structuredClone(record),copied:copies.length});};
 t.after(()=>{ui.activeReportRecovery?.stop();dom.window.close();delete globalThis.confirm;});
 return {ui,record,writes,copies,messages,failAt:value=>fail=value};
}
test('only Ignazio sees the storage gauge, even if another account is an administrator',()=>{
 const config={adminUsers:['manager@example.fr']};assert.equal(canViewStorage({mail:'ignazio@opuselec.fr'},config),true);assert.equal(canViewStorage({userPrincipalName:'IgnazioCARBONARO@OPUSELEC.onmicrosoft.com'},config),true);assert.equal(canViewStorage({mail:'manager@example.fr'},config),false);assert.equal(canViewStorage({},config),false);
});
test('gauge displays a browser estimate with used/free space and does not invent a quota',t=>{
 setup(t);const root=document.createElement('section');renderStorageGauge(root,{usage:1048576,quota:10485760});assert.equal(root.querySelector('meter').value,1048576);assert.match(root.textContent,/Utilisé : 1.0 Mo · Disponible estimé : 9.0 Mo/);assert.match(root.textContent,/ne mesure pas la mémoire vive/);renderStorageGauge(root,{usage:null,quota:null});assert.equal(root.querySelector('meter'),null);assert.match(root.textContent,/Non communiqué/);
});
test('completion writes the PDF and full OneDrive fiche before confirming the visit in OPUS',async t=>{
 const {ui,record,writes,copies}=setup(t);let cleared=false;ui.c.clearReportDraft=async()=>{cleared=true;};await ui.openVisit(record.id);document.getElementById('vSummary').value='Installation vérifiée';const button=document.querySelector('#finishVisit .completeOneDrive');assert.match(button.textContent,/OneDrive/);await document.getElementById('finishVisit').onsubmit({preventDefault(){}});
 assert.equal(writes.length,1);assert.equal(writes[0].copied,2);assert.equal(copies[1].summary,'Installation vérifiée');assert.equal(record.status,'terminee');assert.equal(record.pdfFileId,'pdf');assert.equal(record.oneDriveFolderId,'dir');assert.ok(record.completionRecordedAt);assert.equal(cleared,true);assert.equal(document.querySelector('[data-onedrive-record]').textContent,'Aller sur OneDrive ↗');
});
test('a failed PDF, fiche or final index never completes a visit or clears its recovery',async t=>{
 const {ui,record,writes,failAt}=setup(t);let cleared=false;ui.c.clearReportDraft=async()=>{cleared=true;};
 for(const stage of ['pdf','snapshot','index']){await ui.openVisit(record.id);document.getElementById('vSummary').value='Notes à préserver';failAt(stage);await assert.rejects(document.getElementById('finishVisit').onsubmit({preventDefault(){}}),/interromp/);assert.equal(record.status,'planifiee');assert.equal(writes.length,0);assert.equal(cleared,false);assert.equal(document.getElementById('vSummary').value,'Notes à préserver');assert.equal(document.querySelector('#finishVisit .completeOneDrive').disabled,false);}
});
test('the explicit draft button saves incomplete input without completing the intervention',async t=>{
 const {ui,record,writes,messages}=setup(t);await ui.openVisit(record.id);document.getElementById('vSummary').value='À compléter';let local;ui.c.saveReportDraft=async snapshot=>{local=snapshot;};const button=[...document.querySelectorAll('#finishVisit button')].find(b=>b.textContent==='Enregistrer le brouillon');await button.onclick();assert.equal(local.summary,'À compléter');assert.equal(record.status,'planifiee');assert.equal(writes.length,1);assert.match(messages.at(-1),/reste à compléter/);
});
test('OneDrive viewing opens the external document without downloading photos or showing the report editor',async t=>{
 const {ui}=setup(t);let target={location:{},close(){}};window.open=()=>target;await openReportOneDrive(ui,{pdfWebUrl:'https://opuselec.sharepoint.com/report.pdf'});assert.equal(target.location.href,'https://opuselec.sharepoint.com/report.pdf');assert.equal(target.opener,null);assert.equal(document.getElementById('finishVisit'),null);
 for(const url of ['javascript:alert(1)','https://opuselec.sharepoint.com.evil.org/a','https://user@opuselec.sharepoint.com/a','https://opuselec.sharepoint.com:444/a'])assert.equal(trustedOneDriveUrl(url,'opuselec.sharepoint.com'),null);
});
test('visit retirement uses fifteen days and preserves active or linked project work',()=>{
 const now=new Date('2026-10-29T10:00:00Z'),record={id:'v',status:'terminee',completedAt:'2026-10-14T10:00:00Z'};assert.equal(reportArchiveDue(record,new Date(+now-1),[],'visits'),false);assert.equal(reportArchiveDue(record,now,[],'visits'),true);assert.equal(reportArchiveDue({...record,convertedProjectId:'active-project'},now,[],'visits'),false);assert.equal(reportArchiveDue({...record,status:'planifiee'},now,[],'visits'),false);assert.equal(reportArchiveDue(record,now,[{kind:'visit',linkId:'v',end:'2026-11-01'}],'visits'),false);
});
