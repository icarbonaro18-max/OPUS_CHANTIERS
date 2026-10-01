import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {collectOrder,loadPickupStates,pickupCount} from '../lib/order-pickups.js';
import {renderOrders} from '../lib/project-orders.js';
import {mountMaterialOrders} from '../lib/intervention-material.js';
function graph(){const folders=new Map(),docs=new Map();return {docs,
 named:async(p,n)=>folders.get(p+'/'+n)||docs.get(p+'/'+n)||null,
 folder:async(p,n)=>{const key=p+'/'+n;const f=folders.get(key)||{id:key,name:n,folder:{}};folders.set(key,f);return f;},
 children:async p=>[...docs.values()].filter(d=>d.parent===p),json:async id=>structuredClone([...docs.values()].find(d=>d.id===id).value),
 writeJson:async(p,n,value)=>{const id=p+'/'+n;docs.set(id,{id,parent:p,name:n,value:structuredClone(value)});return {id};}
 };}
test('intervention collection preserves unsaved report and archives the selected order only',async()=>{
 const dom=new JSDOM('<form id="finishInt"><textarea id="draft">Texte non enregistré</textarea></form>');globalThis.document=dom.window.document;
 const g=graph(),ui={user:{displayName:'Roberto'},c:{graph:g,isAdmin:()=>false}},x={id:'i',materialOrders:[{id:'m1',fileId:'one',name:'Bon.pdf'},{id:'m2',fileId:'two',name:'Autre.pdf'}]};
 mountMaterialOrders(ui,x);await new Promise(r=>setTimeout(r,20));
 assert.match(document.getElementById('intMaterialTab').textContent,/2/);document.getElementById('intMaterialTab').click();await document.querySelector('[data-collect-material=one]').onclick();
 assert.match(document.getElementById('intMaterialTab').textContent,/1/);assert.equal(document.querySelector('[data-material="0"]').closest('article').hidden,true);
 document.querySelector('[data-pickup-mode=archive]').click();assert.equal(document.querySelector('[data-material="0"]').closest('article').hidden,false);assert.equal(document.querySelector('[data-material="1"]').closest('article').hidden,true);
 document.getElementById('intReportTab').click();assert.equal(document.getElementById('draft').value,'Texte non enregistré');assert.equal(x.materialOrders.length,2);dom.window.close();
});
test('pickup shared across users, idempotent, independent files and retained source documents',async()=>{
 const g=graph(),files=[{id:'one',name:'Bon.pdf'},{id:'two',name:'Deux.pdf'}];assert.equal(pickupCount(files,await loadPickupStates(g,files)),2);
 const first=await collectOrder(g,files[0],{id:'u',displayName:'Roberto'},{id:'p',kind:'project'});
 const second=await collectOrder(g,files[0],{id:'v',displayName:'Yaya'},{id:'p',kind:'project'});assert.deepEqual(second,first);
 const states=await loadPickupStates(g,files);assert.equal(pickupCount(files,states),1);assert.equal(states.get('one').collectedBy,'Roberto');assert.equal(g.docs.size,1);assert.equal(files.length,2);
});
test('failed receipt save never archives and invalid status read fails visibly',async()=>{
 const g=graph();g.writeJson=async()=>{throw Error('offline');};await assert.rejects(collectOrder(g,{fileId:'one'},{displayName:'Roberto'},{id:'i',kind:'intervention'}),/offline/);assert.equal((await loadPickupStates(g,[{fileId:'one'}])).size,0);
 await assert.rejects(collectOrder(g,{id:'one'},{},{id:'i',kind:'intervention'}),/Reconnectez/);
});
test('technician collects a project order then opens its retained archive; badge decreases',async()=>{
 const dom=new JSDOM('<div id="root"></div>');globalThis.document=dom.window.document;const g=graph();let pending,opened;
 const data={supplier:[{id:'one',name:'Bon.pdf',file:{}}],depot:[]};
 const ctx={g,user:{displayName:'Roberto'},project:{id:'p'},root:document.getElementById('root'),isAdmin:()=>false,toast(){},openDocument:async f=>opened=f.id,onCounts:d=>pending=d.pending};
 await renderOrders(ctx,{data});assert.equal(pending,1);await document.querySelector('[data-collect-order]').onclick();assert.equal(pending,0);assert.equal(document.querySelector('[data-order-file]'),null);
 await document.querySelector('[data-pickup-view=archive]').onclick();assert.match(ctx.root.textContent,/Roberto/);await document.querySelector('[data-order-file]').onclick();assert.equal(opened,'one');assert.equal(document.querySelector('[data-collect-order]'),null);dom.window.close();
});
