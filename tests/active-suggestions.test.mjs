import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {activeProject,suggestedRows} from '../lib/active-suggestions.js';
import {interventionTargets,mountTargetPicker} from '../commandes/targets.js';
test('new choices hide closed records and sort creation dates newest first without changing source',()=>{
 const rows=[{id:'old',createdAt:'2026-09-01',status:'planifiee'},{id:'done',status:'terminee'},{id:'new',createdAt:'2026-09-30',status:'a_planifier'},{id:'archive',archivedAt:'2026-09-30'},{id:'converted',status:'convertie'}];
 assert.deepEqual(suggestedRows(rows).map(x=>x.id),['new','old']);assert.equal(rows.length,5);
 assert(suggestedRows(rows,undefined,['done']).some(x=>x.id==='done'));
 assert.deepEqual(suggestedRows([{id:'open',category:'02'},{id:'finished',category:'04'},{id:'archive',category:'99'}],activeProject).map(x=>x.id),['open']);
 assert.deepEqual(interventionTargets(rows).map(x=>x.linkId),['new','old']);
});
test('order destination hides closed affairs but retains destination of a reopened historical order',()=>{
 const dom=new JSDOM('<select id="s"><option value="closed" selected>Old destination</option></select>');globalThis.document=dom.window.document;
 const targets=[{id:'open',name:'Open',category:'02'},{id:'closed',name:'Closed',category:'04'}];
 const select=document.getElementById('s');mountTargetPicker(select,targets);assert.equal(select.value,'closed');
 select.innerHTML='<option value="">Choose</option>';mountTargetPicker(select,targets);assert(![...select.options].some(o=>o.value==='closed'));dom.window.close();
});
