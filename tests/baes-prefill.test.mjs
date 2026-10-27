import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const html = await readFile(new URL('../modules/baes/index.html', import.meta.url), 'utf8');

function moduleFixture() {
  const dom = new JSDOM(html, {url:'https://opus.example/modules/baes/?embed=1', runScripts:'outside-only'});
  const w = dom.window;
  // DOM/PDF-content test only: canvas metrics and image decoding are simulated.
  w.HTMLCanvasElement.prototype.getContext = () => ({clearRect(){}, measureText:text=>({width:String(text).length*5})});
  w.TextEncoder = TextEncoder;
  w.Blob = Blob;
  w.CSS = {escape:value=>String(value)};
  w.Image = class {set src(value) {queueMicrotask(()=>this.onerror?.());}};
  w.setTimeout = () => 0; // Avoid local autosave/signature resize timers.
  for (const script of w.document.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  return {dom, w};
}

function prefilledState(site, address) {
  return {
    dateControle:'', reference:'BAES-EXEMPLE-01', technicien:'Technicien Exemple',
    client:'Client Exemple', adresse:address, operation:`Vérification BAES — ${site}`,
    intervention:'Maintenance / vérification', interventionAutre:'', tests:[],
    dureeEssai:'', telecommandes:[], observationsGenerales:'', conclusionGenerale:'',
    signature:'', baes:[{}]
  };
}

test('a prefilled BAES form retains site and technician without inventing date, tests or signature', () => {
  const {dom,w} = moduleFixture();
  try {
    for (const [site,address] of [
      ['Site A – Bâtiment Exemple','1 rue Exemple, 00001 Ville A'],
      ['Site B – Établissement Exemple','2 allée Exemple, 00002 Ville B'],
      ['Site C','3 avenue Exemple, 00003 Ville C']
    ]) {
      const state = prefilledState(site,address);
      w.applyState(state);
      const captured = JSON.parse(JSON.stringify(w.collectState()));
      for (const key of ['dateControle','reference','technicien','client','adresse','operation','intervention']) {
        assert.equal(captured[key],state[key],key);
      }
      assert.deepEqual(captured.tests,[]);
      assert.deepEqual(captured.telecommandes,[]);
      assert.equal(captured.conclusionGenerale,'');
      assert.equal(captured.signature,'');
      assert.equal(captured.dureeEssai,'');
      assert.equal(w.document.querySelectorAll('.global-test:checked, .baes-card input[type="radio"]:checked').length,0);
      assert.equal(captured.baes.length,1); // Blank inventory slot, not a verified device.
      for (const value of Object.values(captured.baes[0].tests)) assert.equal(value,'');
      for (const key of ['repere','emplacement','reference','type','statut','duree','observation','resultat','photo']) {
        assert.equal(captured.baes[0][key],'',key);
      }
      w.applyState(captured);
      assert.deepEqual(JSON.parse(JSON.stringify(w.collectState())),captured);
    }
  } finally {dom.window.close();}
});

test('a blank BAES PDF is headed Vérification BAES and does not certify successful testing', async () => {
  const {dom,w} = moduleFixture();
  try {
    w.applyState(prefilledState('Site C','3 avenue Exemple, 00003 Ville C'));
    const blob = await w.buildAutonomousPdf(w.collectState());
    const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-1.4'));
    const text = [...pdf.matchAll(/<([0-9A-F]+)> Tj/g)]
      .map(match=>Buffer.from(match[1],'hex').toString('latin1')).join('\n');
    assert.match(text,/VÉRIFICATION BAES/);
    assert.doesNotMatch(text,/ATTESTATION DE BON FONCTIONNEMENT/);
    assert.match(text,/Technicien Exemple/);
    assert.match(text,/Non signée/);
    assert.match(text,/Non renseignée/);
    assert.equal(text.split('\n').filter(value=>value==='N.R.').length,6);
    assert.equal(text.split('\n').filter(value=>value==='OUI').length,0);
  } finally {dom.window.close();}
});

test('the bottom add button appends a new BAES after a 120-unit inventory',()=>{
 const {dom,w}=moduleFixture();
 try{
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const s=prefilledState('Site A','Rue');s.baes=Array.from({length:120},(_,i)=>({repere:String(i+1)}));
  w.applyState(s);w.document.getElementById('addBaesBottomBtn').click();
  const data=w.collectState();assert.equal(data.baes.length,121);assert.equal(data.baes[119].repere,'120');assert.equal(data.baes[120].repere,'');
 }finally{dom.window.close();}
});
