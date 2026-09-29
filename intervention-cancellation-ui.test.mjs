import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {OpsUI} from '../lib/ops-ui.js';
test('manager cancels from detail without report; cancelled tab retains read-only record',async()=>{
 const dom=new JSDOM('<div id="modal"></div><div id="interventionsPage"></div>',{url:'https://opus.test'});
 for(const k of ['document','window','localStorage','Event'])globalThis[k]=dom.window[k];globalThis.confirm=()=>true;
 document.getElementById('modal').close=()=>{};
 const ui=new OpsUI({graph:{},isAdmin:()=>false,getUser:()=>({mail:'roberto@opus.test',displayName:'Roberto'}),getConfig:()=>({managerUsers:['roberto@opus.test']}),getCatalog:()=>({projects:[]}),toast(){},modal:(_,h)=>document.getElementById('modal').innerHTML=h});
 const x={id:'i',number:'INT-1',status:'planifiee',title:'Accès',clientName:'Client',photos:[],reportItems:[]};
 ui.data={people:[],clients:[],events:[],interventions:[x],visits:[],closures:[],projectTracking:[]};ui.save=async()=>{};ui.show=async()=>ui.renderInterventions();
 await ui.openIntervention('i');assert.ok(document.getElementById('cancelIntervention'));document.getElementById('cancelIntervention').click();document.getElementById('cancelIntReason').value='Client : contrôle fonctionnel';const f=document.getElementById('cancelIntForm');await f.onsubmit({preventDefault(){},target:f});assert.equal(x.status,'annulee');assert.equal(document.querySelectorAll('[data-int]').length,1);assert.match(document.getElementById('intList').textContent,/Annulée/);
 document.getElementById('intCurrent').click();assert.equal(document.querySelectorAll('[data-int]').length,0);
 await ui.openIntervention('i');assert.equal(document.getElementById('finishInt'),null);assert.match(document.getElementById('modal').textContent,/Client : contrôle fonctionnel/);dom.window.close();
});
