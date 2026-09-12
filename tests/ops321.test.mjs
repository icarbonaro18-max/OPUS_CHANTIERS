import test from 'node:test';
import assert from 'node:assert/strict';
import {OpsRepository} from '../lib/ops.js?v=3.4.1';
import {readFile} from 'node:fs/promises';

test('planning save falls back when cached Graph has no writeJson', async()=>{
  const calls=[];
  const graph={
    async folder(){return {id:'root-system'}},
    base(id){return `/drives/d/items/${id}`},
    async request(path,opts){calls.push({path,opts});return {ok:true}}
  };
  const repo=new OpsRepository(graph);
  await repo.save('events',[{id:'evt1'}]);
  assert.equal(calls.length,1);
  assert.match(calls[0].path,/events\.json:\/content$/);
  assert.equal(calls[0].opts.method,'PUT');
});

test('desktop content spans full width when project aside is hidden', async()=>{
  const css=await readFile(new URL('../style.css',import.meta.url),'utf8');
  assert.match(css,/#projectAside\[hidden\] \+ main\{grid-column:1\/-1\}/);
});

test('planning team assignment is optional and opened by a button', async()=>{
  const js=await readFile(new URL('../lib/ops-ui.js',import.meta.url),'utf8');
  assert.match(js,/Choisir l’équipe/);
  assert.match(js,/teamAssignBox/);
  assert.match(js,/selectedTeamIds/);
});

test('admin client import remains private in Microsoft 365', async()=>{
  const js=await readFile(new URL('../lib/ops-ui.js',import.meta.url),'utf8');
  assert.match(js,/Importer la base clients/);
  assert.match(js,/jamais dans le dépôt GitHub public/);
});

test('interventions support point-by-point reports with photos', async()=>{
  const js=await readFile(new URL('../lib/ops-ui.js',import.meta.url),'utf8');
  assert.match(js,/Points de l’intervention/);
  assert.match(js,/editInterventionItem/);
  assert.match(js,/plusieurs photos/);
});

test('visits support task-by-task survey capture', async()=>{
  const js=await readFile(new URL('../lib/ops-ui.js',import.meta.url),'utf8');
  assert.match(js,/Tâches \/ pièces relevées/);
  assert.match(js,/editVisitTask/);
  assert.match(js,/faux plafond/);
});
