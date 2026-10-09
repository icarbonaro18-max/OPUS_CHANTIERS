import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {ReportRecovery,applyRecoveredReport,bindReportRecovery} from '../lib/report-recovery.js';
import {installResumeSync} from '../lib/resume-sync.js';import {appointmentAddress,paintAddress,previewPrivateAppointment} from '../lib/calendar-preview.js';import {OpsRepository} from '../lib/ops.js';
const memory=()=>{const map=new Map();return {get:async k=>structuredClone(map.get(k)),set:async(k,v)=>map.set(k,structuredClone(v)),remove:async k=>map.delete(k)}};
test('draft recovery separates accounts and preserves latest schedule/status',async()=>{
 const dom=new JSDOM('',{url:'https://opus.example'}),store=memory(),a=new ReportRecovery(store,dom.window.localStorage,'account-a'),b=new ReportRecovery(memory(),dom.window.localStorage,'account-b');
 a.remember('r','visits',[{id:'vSummary',value:'Texte non envoyé'}]);await a.save({id:'r',summary:'local',status:'planifiee',plannedStart:'old',photos:[{dataUrl:'data:image/jpeg;base64,abc'}]});
 assert.equal(b.last(),null);assert.equal(b.text('r'),null);const latest={status:'terminee',plannedStart:'new',clientId:'latest-client'};applyRecoveredReport(latest,await a.load('r'));assert.equal(latest.status,'terminee');assert.equal(latest.plannedStart,'new');assert.equal(latest.clientId,'latest-client');assert.equal(latest.summary,'local');assert.equal(latest.photos.length,1);
 await a.clear('r');assert.equal(a.last(),null);assert.equal(a.text('r'),null);assert.equal(await a.load('r'),undefined);dom.window.close();
});
test('input persists text immediately; full draft survives failure; confirmed save clears queued copies',async()=>{
 const dom=new JSDOM('<form id="finishVisit"><textarea id="vSummary"></textarea></form>',{url:'https://opus.example'});global.document=dom.window.document;global.window=dom.window;
 const recovery=new ReportRecovery(memory(),dom.window.localStorage,'a'),record={id:'r',photos:[]};let release;const photos=new Promise(r=>release=r);const ui={c:{reportRecovery:recovery},pendingPhotos:photos,captureReportDraft(x){x.summary=document.getElementById('vSummary').value;}};
 bindReportRecovery(ui,record,true);const input=document.getElementById('vSummary');input.value='Compte rendu tablette';input.dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(recovery.text('r').values[0].value,'Compte rendu tablette');
 const saving=ui.activeReportRecovery.flush(),clearing=ui.activeReportRecovery.saved();release();await saving;await clearing;assert.equal(await recovery.load('r'),undefined);assert.equal(recovery.last(),null);
 ui.activeReportRecovery.stop();dom.window.close();delete global.document;delete global.window;
});
test('wake triggers refresh once, preserves form and marks stale even offline',async()=>{
 const dom=new JSDOM('<textarea>unsaved</textarea>');let stale=0,refresh=0,checkpoints=0,time=2000,hidden=false,release;
 Object.defineProperty(dom.window.document,'hidden',{get:()=>hidden});const done=new Promise(r=>release=r);
 const stop=installResumeSync({window:dom.window,document:dom.window.document,markStale:()=>stale++,checkpoint:()=>checkpoints++,refresh:async()=>{refresh++;await done;},now:()=>time});
 hidden=true;dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));assert.equal(checkpoints,1);hidden=false;dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));dom.window.dispatchEvent(new dom.window.Event('focus'));await Promise.resolve();assert.equal(refresh,1);assert.equal(stale,2);assert.equal(dom.window.document.querySelector('textarea').value,'unsaved');release();stop();dom.window.close();
});
test('preview addresses use actual site, never billing, and escape text in map links',async()=>{
 const ui={data:{clients:[{id:'c',billingAddress:'Billing',sites:[{id:'s',address:'12 rue du Site'}]}]}};assert.equal(appointmentAddress(ui,{}, {clientId:'c',siteId:'s'}),'12 rue du Site');assert.equal(appointmentAddress(ui,{}, {clientId:'c'}),'');
 const dom=new JSDOM('<p></p>');global.document=dom.window.document;paintAddress(document.querySelector('p'),'<b>12 rue A</b>');assert.equal(document.querySelector('b'),null);assert.match(document.querySelector('a').href,/%3Cb%3E/);dom.window.close();delete global.document;
});
test('repository initialization is single flight, conditional writes reject conflicting edits',async()=>{
 let folders=0,headers;const graph={folder:async()=>{folders++;return {id:'root'};},named:async()=>({id:'file',eTag:'v1'}),json:async()=>[{id:'r'}],writeJson:async(_p,_n,_v,h)=>{headers=h;throw Object.assign(Error('conflict'),{status:412});}};
 const repo=new OpsRepository(graph);await Promise.all([repo.load('visits'),repo.load('events')]);assert.equal(folders,1);await assert.rejects(repo.save('visits',[{id:'r'}]),/autre appareil/);assert.equal(headers['If-Match'],'v1');await assert.rejects(repo.save('visits',[]),/bloqué/);
});
test('typing while a slow send is in progress retains the newer unsent draft',async()=>{
 const dom=new JSDOM('<form id="finishVisit"><textarea id="vSummary"></textarea></form>',{url:'https://opus.example'});global.document=dom.window.document;global.window=dom.window;
 const recovery=new ReportRecovery(memory(),dom.window.localStorage,'worker'),record={id:'r',photos:[]},ui={c:{reportRecovery:recovery},captureReportDraft(x){x.summary=document.getElementById('vSummary').value;}};
 bindReportRecovery(ui,record,true);const input=document.getElementById('vSummary');input.value='Sent version';input.dispatchEvent(new window.Event('input',{bubbles:true}));ui.activeReportRecovery.beginSave();input.value='More notes while network is slow';input.dispatchEvent(new window.Event('input',{bubbles:true}));await ui.activeReportRecovery.saved();
 assert.equal((await recovery.load('r')).summary,'More notes while network is slow');assert.equal(recovery.last().id,'r');ui.activeReportRecovery.stop();dom.window.close();delete global.document;delete global.window;
});
