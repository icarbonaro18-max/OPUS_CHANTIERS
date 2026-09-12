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
