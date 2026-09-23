import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {mountPlanningAffairs,readPlanningAffairs} from '../lib/planning-affairs.js';
import {missionHtml,calendarLabel} from '../lib/calendar-preview.js';
import {simplifyReport} from '../lib/simple-report.js';
import {OpsUI} from '../lib/ops-ui.js';
function dom(html){globalThis.document=new JSDOM(html).window.document;}
test('each appointment kind exposes and saves purpose and instructions, including legacy project instructions',()=>{
 for(const kind of ['project','intervention','visit']){
 dom('<form id="eventForm"><select id="eventLink"><option>'+kind+'|p</option></select><div class="teamAssignBox"></div></form>');
 mountPlanningAffairs({c:{getCatalog:()=>({projects:[{id:'p',name:'Chantier'}]})}},{instructions:'Anciennes consignes'});
 assert.equal(document.getElementById('planningMission').hidden,false);assert.equal(document.getElementById('eventInstructions').value,'Anciennes consignes');
 document.getElementById('eventPurpose').value='Dépannage hall';document.getElementById('eventInstructions').value='Contrôler le circuit\nRemplacer le détecteur';
 const saved=readPlanningAffairs(kind,'p');assert.equal(saved.purpose,'Dépannage hall');assert.match(saved.instructions,/Remplacer le détecteur/);
 }
});
test('calendar preview preserves full request and per-appointment instructions, with escaped content',()=>{
 const e={kind:'intervention',purpose:'Passage du matin',instructions:'Tester <circuit>\nAppeler le gardien'},x={number:'INT-1',clientName:'Client',title:'Panne hall',request:'Le détecteur reste allumé.'};
 dom(missionHtml(e,x));assert.match(document.body.textContent,/Panne hall|Passage du matin/);assert.match(document.body.textContent,/Le détecteur reste allumé/);assert.match(document.body.textContent,/Tester <circuit>/);assert.equal(document.querySelector('circuit'),null);assert.equal(calendarLabel({},e),'Passage du matin');
});
test('simplifying a report keeps the object and instructions visible above the form',()=>{
 dom('<div id="modal"><div class="detailGrid"></div><form id="finishInt"></form></div>');
 simplifyReport({number:'INT-1',title:'Éclairage',request:'Vérifier la minuterie\nPuis les lampes'});
 assert.match(document.querySelector('.reportIdentity').textContent,/Éclairage/);assert.match(document.querySelector('.reportIdentity').textContent,/Vérifier la minuterie/);assert.equal(document.querySelector('.reportIdentity').closest('details'),null);
});
test('intervention title is directly clickable and request is visible in the list',()=>{
 dom(OpsUI.prototype.interventionCard.call({teamNames:()=>'',c:{isAdmin:()=>false}},{id:'i',title:'Panne',request:'Contrôler le détecteur',status:'planifiee'}));
 assert.equal(document.querySelector('h3 [data-int]').dataset.int,'i');assert.match(document.body.textContent,/Contrôler le détecteur/);
});
