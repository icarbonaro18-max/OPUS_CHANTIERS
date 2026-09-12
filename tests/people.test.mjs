import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const config=JSON.parse(await readFile(new URL('../config.json', import.meta.url),'utf8'));

test('OPUS team defaults match current roles and vehicles',()=>{
  const p=config.defaultPeople||[];
  assert.equal(p.length,7);
  const by=n=>p.find(x=>x.name===n);
  for(const n of ['ANZINI Ruben','CARBONARO Roberto','FARRUKU Christian']){assert.equal(by(n)?.role,'technicien');assert.equal(by(n)?.vehicle,true);assert.equal(by(n)?.weeklyTarget,39);}
  assert.equal(by('CEESAY Yaya')?.role,'technicien');assert.equal(by('CEESAY Yaya')?.vehicle,false);assert.equal(by('CEESAY Yaya')?.weeklyTarget,39);
  for(const n of ['MISAT Dam Ilan','PICARD Alban','TRAORE Bourama']){assert.equal(by(n)?.role,'apprenti');assert.equal(by(n)?.vehicle,false);assert.equal(by(n)?.weeklyTarget,35);}
});
