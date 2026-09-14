import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {interventionTargets,mountTargetPicker,orderFolder,linkOrder,readInterventions} from '../commandes/targets.js';
test('destination tabs expose scheduled interventions and preserve selection on reopen',()=>{
 const dom=new JSDOM('<select id="s"><option value="intervention:i" selected>Intervention</option></select>');globalThis.document=dom.window.document;
 const targets=[{id:'p',name:'Chantier'},...interventionTargets([{id:'i',number:'INT-1',title:'Laurent',plannedStart:'2026-09-16T08:00',status:'planifiee'},{id:'deleted',status:'annulee'}])];
 const select=document.getElementById('s');mountTargetPicker(select,targets);
 assert.equal(select.value,'intervention:i');assert.match(select.textContent,/Laurent/);assert.equal(select.options.length,2);
 document.querySelector('[data-target-kind=project]').click();assert.equal(select.value,'');assert.match(select.textContent,/Chantier/);assert.doesNotMatch(select.textContent,/Laurent/);
 document.querySelector('[data-target-kind=intervention]').click();assert.match(select.textContent,/Laurent/);dom.window.close();
});
function graph(){
 let rows=[{id:'i',number:'INT-1',title:'Laurent',status:'planifiee',actualStart:'keep',materialOrders:[]}],writes=[],paths=[];
 const g={folder:async(p,n)=>{paths.push([p,n]);return {id:n};},named:async()=>({id:'data'}),item:async()=>({id:'data',eTag:'"v1"'}),json:async()=>structuredClone(rows),base:id=>'/items/'+id,request:async(path,opts)=>{assert.equal(opts.headers['If-Match'],'"v1"');rows=JSON.parse(await opts.body.text());writes.push(rows);}};
 return {g,writes,paths,rows:()=>rows};
}
test('supplier and depot documents reach intervention folder and shared material list; depot revision replaces link',async()=>{
 const a=graph(),target={kind:'intervention',linkId:'i'};
 await orderFolder(a.g,target,'DEPOT_BUC');assert.ok(a.paths.some(([p,n])=>p==='INT-1_i'&&n==='BONS_COMMANDE'));
 await linkOrder(a.g,target,{id:'pdf1',name:'rexel.pdf'},{supplier:'Rexel',pickup:'Agence',source:'fournisseur'});
 await linkOrder(a.g,target,{id:'pdf2',name:'depot.pdf'},{recordId:'dep1',pickup:'Buc',source:'depot'});
 await linkOrder(a.g,target,{id:'pdf3',name:'depot-revision.pdf'},{recordId:'dep1',pickup:'Buc',source:'depot'});
 const x=a.rows()[0];assert.equal(x.materialOrders.length,2);assert.equal(x.actualStart,'keep');assert.equal(x.title,'Laurent');assert.equal(x.materialOrders[1].fileId,'pdf3');assert.equal(x.materialOrders[1].history[0].fileId,'pdf2');
});
test('failed or malformed reads never overwrite interventions; concurrent update surfaces failure',async()=>{
 const a=graph();a.g.json=async()=>{throw Error('offline');};await assert.rejects(readInterventions(a.g),/offline/);assert.equal(a.writes.length,0);
 const b=graph();b.g.request=async()=>{throw Error('412 concurrent update');};await assert.rejects(linkOrder(b.g,{kind:'intervention',linkId:'i'},{id:'f',name:'bon.pdf'},{}),/liaison.*412/);assert.equal(b.rows()[0].materialOrders.length,0);
});
