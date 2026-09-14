import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {OpsUI} from '../lib/ops-ui.js';
test('intervention tabs group ongoing/planned work separately and completion moves record without copying',async()=>{
 const dom=new JSDOM('<main id="interventionsPage"></main>',{url:'https://opus.example'});globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
 const ui=new OpsUI({graph:{},isAdmin:()=>false,getConfig:()=>({}),getUser:()=>({}),getCatalog:()=>({projects:[]})});
 ui.data.people=[];ui.data.interventions=['a_planifier','planifiee','en_cours','terminee','facturee','annulee'].map((status,i)=>({id:String(i),number:'INT-'+i,title:'Travail',clientName:'Client '+i,status,teamIds:[]}));
 await ui.renderInterventions();const list=()=>document.getElementById('intList');
 assert.equal(list().querySelectorAll('[data-int]').length,3);assert.match(document.getElementById('intCompleted').textContent,/\(2\)/);
 document.getElementById('intCompleted').click();assert.equal(list().querySelectorAll('[data-int]').length,2);assert.match(list().textContent,/Client 3/);assert.doesNotMatch(list().textContent,/Client 5/);
 document.getElementById('intSearch').value='Client 4';document.getElementById('intSearch').oninput();assert.equal(list().querySelectorAll('[data-int]').length,1);
 ui.data.interventions[2].status='terminee';ui.interventionView='current';await ui.renderInterventions();assert.equal(list().querySelectorAll('[data-int]').length,2);
 document.getElementById('intCompleted').click();assert.equal(list().querySelectorAll('[data-int]').length,3);assert.equal(ui.data.interventions.length,6);dom.window.close();
});
