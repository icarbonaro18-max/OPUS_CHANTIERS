import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('assistant module keeps secrets out of client config', async()=>{
  const js=await readFile(new URL('../lib/assistant.js',import.meta.url),'utf8');
  assert.match(js,/aiEndpoint/);
  assert.doesNotMatch(js,/api[_-]?key/i);
  assert.match(js,/webkitSpeechRecognition/);
});

test('field tools expose dictation rewrite and Italian translation', async()=>{
  const js=await readFile(new URL('../lib/assistant.js',import.meta.url),'utf8');
  assert.match(js,/🎙 Dicter/);
  assert.match(js,/Français propre/);
  assert.match(js,/🇮🇹 Italiano/);
});

test('intervention and visit forms bind assistant tools', async()=>{
  const js=await readFile(new URL('../lib/ops-ui.js',import.meta.url),'utf8');
  assert.match(js,/this\.assistant\.toolsHtml\('iiObs'/);
  assert.match(js,/this\.assistant\.toolsHtml\('vtNeed'/);
  assert.match(js,/this\.assistant\.bind/);
});

test('dictation avoids continuous duplicated segments and has local cleanup fallback', async()=>{
  const js=await readFile(new URL('../lib/assistant.js',import.meta.url),'utf8');
  assert.match(js,/rec\.continuous=false/);
  assert.match(js,/cleanTranscript/);
  assert.match(js,/localFrenchCleanup/);
});

test('intervention report can generate and archive a PDF', async()=>{
  const js=await readFile(new URL('../lib/ops-ui.js',import.meta.url),'utf8');
  assert.match(js,/interventionPdf/);
  assert.match(js,/saveInterventionPackage/);
  assert.match(js,/INTERVENTIONS/);
  assert.match(js,/Télécharger le PDF/);
});
