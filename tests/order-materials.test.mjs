import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
import {saveOrderMaterials,readOrderMaterials,materialCandidates} from '../lib/order-materials.js';import {applyMaterialUsage,mountUsedOrderMaterials} from '../lib/report-materials-used.js';import {parseOpusOrder} from '../lib/order-pdf-items.js';import {makePDF} from '../commandes/pdf.js';
const line={reference:'REF-1',description:'Prise étanche',quantity:'5',unit:'U'};
test('price-free metadata for both kinds and only the attached affair is read',async()=>{
 let stored;const g={folder:async(_p,name)=>({id:name}),writeJson:async(_p,name,row)=>stored={name,row},named:async(_p,name)=>({id:name}),children:async()=>[{id:'meta',name:stored.name}],json:async()=>stored.row};
 await saveOrderMaterials(g,{kind:'intervention',linkId:'int-1'},{id:'file',name:'BC.pdf'},{title:'BC1',source:'depot',items:[{...line,price:100}]});assert.equal(stored.row.items[0].price,undefined);
 assert.equal((await readOrderMaterials(g,[{id:'file'}],{id:'int-1',kind:'intervention'})).orders.length,1);
 const wrong=await readOrderMaterials(g,[{id:'file'}],{id:'other',kind:'intervention'});assert.equal(wrong.orders.length,0);assert.equal(wrong.unread.length,1);
});
test('remaining quantities, repeated imports, revision duplicates and free text preservation',()=>{
 const order={fileId:'file',supplier:'Rexel',number:'123',source:'fournisseur',items:[line]},record={id:'r',projectId:'p'};
 const first=materialCandidates([order],[record],record)[0];const prev={id:'previous',projectId:'p',materialUsage:[{key:first.key,usedQuantity:2}]};const other={id:'other',projectId:'other-project',materialUsage:[{key:first.key,usedQuantity:100}]};
 const candidate=materialCandidates([order,{...order,fileId:'new',updatedAt:'2026-10-09'}],[prev,other],record)[0];assert.equal(candidate.remainingQuantity,3);
 const applied=applyMaterialUsage(record,'Matériel déjà saisi',[{...candidate,usedQuantity:'1,5'}]);assert.match(applied.text,/Matériel déjà saisi/);assert.match(applied.text,/1.5 U/);assert.equal(applied.usage.length,1);
 assert.equal(applyMaterialUsage({...record,materialUsage:applied.usage},applied.text,[{...candidate,usedQuantity:'1'}]).added,0);assert.throws(()=>applyMaterialUsage(record,'',[{...candidate,usedQuantity:4}]),/quantité/);
});
test('unsupported old PDFs remain explicitly unresolved',()=>{assert.throws(()=>parseOpusOrder([{height:842,items:[{text:'Facture fournisseur',x:20,y:800}]}]),/PDF/);});
test('actual OPUS PDF roundtrip preserves supplier, multiline references, decimal quantities and pages',async()=>{
 const savedFetch=global.fetch;global.fetch=async url=>new Response(await readFile(url));
 try{const items=Array.from({length:40},(_,i)=>({reference:'REF-'+i,description:'Gaine électrique préfilée destinée au raccordement des équipements et appareils de la zone '+i,quantity:i===0?'2,5':'3',unit:'m'}));const blob=await makePDF({supplier:'Rexel',number:'BC-TEST',date:'2026-10-09',deliveryMode:'retrait',destination:'Buc',items},{project:'Affaire test'});
 const pdfjs=await import('../vendor/pdf.mjs');const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true});const pdf=await task.promise,pages=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent(),v=page.getViewport({scale:1});pages.push({height:v.height,items:content.items.map(i=>({text:i.str||'',x:i.transform?.[4]||0,y:i.transform?.[5]||0}))});}const parsed=parseOpusOrder(pages);assert.equal(parsed.items.length,40);assert.equal(parsed.items[0].quantity,'2.5');assert.equal(parsed.supplier,'Rexel');assert.equal(parsed.number,'BC-TEST');assert.equal(parsed.items[39].description,items[39].description);await task.destroy();}finally{global.fetch=savedFetch;}
});
test('report loads lines automatically, confirms them once and keeps manual materials',async()=>{
 const dom=new JSDOM('<form id="finishInt"><details><summary>Matériel</summary><textarea id="aMaterial">Vis déjà utilisées</textarea></details></form>');for(const k of ['document','window','Event'])global[k]=dom.window[k];
 const record={id:'int',materialOrders:[{id:'o',fileId:'pdf',name:'BC.pdf',source:'depot',title:'DEP1',items:[line]}]},ui={c:{graph:{named:async()=>null}},data:{interventions:[record]}};
 await mountUsedOrderMaterials(ui,record);assert.equal(document.querySelectorAll('[data-use]').length,1);document.querySelector('[data-used-qty]').value='2';document.querySelector('[data-apply-used]').click();assert.match(document.getElementById('aMaterial').value,/Vis déjà utilisées/);assert.match(document.getElementById('aMaterial').value,/Prise étanche · 2 U/);assert.equal(record.materialUsage.length,1);document.querySelector('[data-apply-used]').click();assert.equal(record.materialUsage.length,1);dom.window.close();
});
