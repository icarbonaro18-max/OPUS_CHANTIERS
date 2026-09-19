import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {reportTeam,mountReportTeam,captureReportTeam} from '../lib/report-team.js';
const event={kind:'project',linkId:'p',start:'2026-09-16T10:30',end:'2026-09-16T16:00',teamIds:['r','a']};
test('existing empty report gets calendar team for actual day; actual hours remain unchanged',()=>{
 const x={projectId:'p',actualStart:'2026-09-16T14:00',actualEnd:'2026-09-16T18:30',teamIds:[]};
 assert.deepEqual(reportTeam(x,[event]).ids,['a','r']);assert.equal(x.actualEnd,'2026-09-16T18:30');assert.deepEqual(x.teamIds,[]);
 assert.deepEqual(reportTeam({...x,teamIds:['manual']},[event]).ids,['manual']);
 assert.deepEqual(reportTeam({...x,actualStart:'2026-09-17T14:00'},[event]).ids,[]);
});
test('grouped affairs supported; cancelled and other projects excluded; ambiguous teams not guessed',()=>{
 const x={projectId:'other',actualStart:'2026-09-16T14:00'};
 assert.deepEqual(reportTeam(x,[event]).ids,[]);
 assert.deepEqual(reportTeam(x,[{...event,additionalProjectIds:['other']}]).ids,['a','r']);
 assert.deepEqual(reportTeam({projectId:'p',actualStart:x.actualStart},[{...event,status:'annulee'}]).ids,[]);
 assert.equal(reportTeam({projectId:'p',actualStart:x.actualStart},[event,{...event,teamIds:['c']}]).source,'ambiguous');
});
test('form prefill and manual verification are captured for saving/PDF; date changes resolve again',()=>{
 const dom=new JSDOM('<form id="finishInt"><input id="aStart" value="2026-09-16T14:00"></form>');globalThis.document=dom.window.document;
 const x={projectId:'p',teamIds:[]},ui={data:{events:[event],people:[{id:'r',name:'Roberto'},{id:'a',name:'Alban'}]},teamNames:ids=>ids.join(',')};mountReportTeam(ui,x);
 assert.equal(document.querySelectorAll('#reportTeam input:checked').length,2);
 const start=document.getElementById('aStart');start.value='2026-09-17T08:00';start.dispatchEvent(new dom.window.Event('input'));assert.equal(document.querySelectorAll('#reportTeam input:checked').length,0);
 const r=document.querySelector('#reportTeam input');r.checked=true;r.onchange();captureReportTeam(x);assert.deepEqual(x.teamIds,['r']);assert.equal(x.reportTeamVerified,true);
});
