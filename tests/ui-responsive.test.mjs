import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('navigation métier présente dans index',async()=>{const s=await readFile(new URL('index.html',root),'utf8');for(const label of ['Chantiers','Interventions','Visites / Devis','Calendrier','Bureau'])assert.ok(s.includes(label));assert.ok(s.includes('mobileProjectFilters'));});
test('tablette masque le panneau bleu latéral',async()=>{const s=await readFile(new URL('style.css',root),'utf8');assert.match(s,/@media\(max-width:980px\)[\s\S]*#projectAside\{display:none!important\}/);assert.match(s,/\.mobileProjectFilters\{display:flex/);});
test('navigation affichée avant synchronisation du personnel',async()=>{const s=await readFile(new URL('lib/ops-ui.js',root),'utf8');const nav=s.indexOf("document.getElementById('mainNav').hidden=false");const sync=s.indexOf('await this.syncDefaultPeople()');assert.ok(nav>-1&&sync>-1&&nav<sync);});
