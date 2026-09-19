import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {setReportDeleted,bindReportSwipe} from '../lib/report-trash.js';
import {projectReports} from '../lib/project-field.js';
test('deletion is admin-only, reversible, preserves hours/PDF, rolls back failed save',async()=>{
 const x={id:'r',status:'terminee',actualStart:'2026-09-19T08:00',pdfFileId:'pdf'};
 const ui={c:{isAdmin:()=>false},user:{displayName:'Ignazio'},save:async()=>{}};
 await assert.rejects(setReportDeleted(ui,x,true),/administrateur/);assert.equal(x.reportDeletedAt,undefined);
 ui.c.isAdmin=()=>true;await setReportDeleted(ui,x,true);assert.ok(x.reportDeletedAt);assert.equal(x.status,'terminee');assert.equal(x.pdfFileId,'pdf');
 await setReportDeleted(ui,x,false);assert.equal(x.reportDeletedAt,null);
 ui.save=async()=>{throw Error('hors ligne');};await assert.rejects(setReportDeleted(ui,x,true),/hors ligne/);assert.equal(x.reportDeletedAt,null);
});
test('vertical scrolling and cancelled gestures do not delete; left swipe suppresses opening',()=>{
 const dom=new JSDOM('<div><button>Rapport</button></div>');const row=dom.window.document.querySelector('div');let removed=0,opened=0;
 bindReportSwipe(row,()=>removed++);row.querySelector('button').onclick=()=>opened++;
 const send=(type,x,y)=>{const ev=new dom.window.Event(type,{bubbles:true});Object.assign(ev,{clientX:x,clientY:y,pointerId:1,button:0});row.dispatchEvent(ev);};
 send('pointerdown',200,0);send('pointermove',50,70);send('pointerup',50,70);assert.equal(removed,0);
 send('pointerdown',200,0);send('pointercancel',50,0);send('pointerup',50,0);assert.equal(removed,0);
 send('pointerdown',200,0);send('pointerup',50,0);assert.equal(removed,1);row.querySelector('button').click();assert.equal(opened,0);
});
test('admin can remove a report from list then restore it from persistent trash',async()=>{
 const dom=new JSDOM('<div id="modal"></div>');globalThis.document=dom.window.document;
 const report={id:'r',number:'R1',projectId:'p',status:'en_cours',createdAt:'2026-09-19'};
 const ui={c:{isAdmin:()=>true,modal:(_,html)=>document.getElementById('modal').innerHTML=html,toast:()=>{}},user:{},data:{interventions:[report]},save:async()=>{}};
 await projectReports(ui,{id:'p',name:'Chantier'},{});
 await document.querySelector('[data-report-remove]').onclick();assert.equal(document.querySelector('[data-project-report]'),null);
 await document.getElementById('toggleReportTrash').onclick();assert.ok(document.querySelector('[data-project-report]'));
 await document.querySelector('[data-report-remove]').onclick();assert.equal(report.reportDeletedAt,null);
 await document.getElementById('toggleReportTrash').onclick();assert.ok(document.querySelector('[data-project-report]'));
});
