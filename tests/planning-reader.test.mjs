import test from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';import {readFile} from 'node:fs/promises';
import {readerPlanning} from '../lib/planning-reader.js';import {createHandler} from '../api/planning-reader.js';import {OpsUI} from '../lib/ops-ui.js';
const events=[{id:'private-id',kind:'project',title:'2026-01186 · Paris 15',start:'2026-09-25T06:00:00Z',end:'2026-09-25T15:00:00Z',teamIds:['a','b'],notes:'secret'}];
const people=[{id:'a',name:'Apprenti',role:'apprenti',weeklyTarget:35,email:'private',absences:[{type:'maladie'}]},{id:'b',name:'Technicien',weeklyTarget:39}];
test('reader returns only calendar fields, Paris Friday 11h/16h, without HR or identifiers',()=>{
 const rows=readerPlanning(events,people,'2026-09-21','2026-09-27');assert.equal(rows.length,1);assert.deepEqual(rows[0].team,[{name:'Apprenti',start:'08:00',end:'11:00'},{name:'Technicien',start:'08:00',end:'16:00'}]);
 assert.doesNotMatch(JSON.stringify(rows),/private|maladie|secret|weeklyTarget/);
 assert.deepEqual(readerPlanning([...events,{...events[0],status:'annulee'}],people,'2026-09-28','2026-10-04'),[]);
});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}const env={PLANNING_ACCESS_CODE:'a'.repeat(48),PLANNING_TENANT_ID:'tenant',PLANNING_CLIENT_ID:'client',PLANNING_CLIENT_SECRET:'server-secret',PLANNING_DRIVE_ID:'drive'};
test('reader denies missing settings, wrong codes and writes before contacting Graph',async()=>{
 const fetcher=()=>{throw Error('must not fetch');};let r=res();await createHandler({env:{},fetcher})({method:'POST',body:{}},r);assert.equal(r.code,503);
 for(const req of [{method:'DELETE'},{method:'GET'},{method:'POST',body:{code:'wrong'}}]){r=res();await createHandler({env,fetcher})(req,r);assert.ok([401,405].includes(r.code));assert.match(r.headers['Cache-Control'],/no-store/);}
});
test('valid reader fetches fixed files only, no bearer on download and no arbitrary path',async()=>{
 const calls=[];const fetcher=async(url,options={})=>{calls.push([String(url),options]);if(String(url).includes('/token'))return {ok:true,json:async()=>({access_token:'graph-secret'})};if(String(url).includes('graph.microsoft'))return {ok:true,json:async()=>({size:100,'@microsoft.graph.downloadUrl':'https://opuselec.sharepoint.com/'+(String(url).includes('events.json')?'events':'people')})};assert.equal(options.headers,undefined);return {ok:true,text:async()=>JSON.stringify(String(url).endsWith('events')?events:people)};};
 const r=res();await createHandler({env,fetcher,now:()=>new Date('2026-09-14T10:00:00Z')})({method:'POST',body:{code:env.PLANNING_ACCESS_CODE,from:'2026-09-21',path:'payroll.json'}},r);
 assert.equal(r.code,200);assert.equal(r.body.events.length,1);assert.ok(calls.every(([u])=>!u.includes('payroll')));assert.doesNotMatch(JSON.stringify(r.body),/graph-secret|server-secret|maladie/);
});
test('Ruben and Christian cannot enter team editors while Roberto and administrator can plan',async()=>{
 for(const email of ['ruben@opuselec.fr','christian@opuselec.fr']){const ui=Object.create(OpsUI.prototype);ui.c={isAdmin:()=>false,getUser:()=>({mail:email}),getConfig:()=>({managerUsers:['roberto@opuselec.fr']}),modal:()=>assert.fail('No team editor')};assert.equal(ui.canPlan(),false);await ui.planEvent();await ui.editIntervention();await ui.editVisit();ui.peopleManager();}
 const ui=Object.create(OpsUI.prototype);ui.c={isAdmin:()=>false,getUser:()=>({mail:'roberto@opuselec.fr'}),getConfig:()=>({managerUsers:['roberto@opuselec.fr']})};assert.equal(ui.canPlan(),true);ui.c.isAdmin=()=>true;assert.equal(ui.role(),'admin');
});
test('phone reader renders text safely and closing during a refresh does not reopen private data',async()=>{
 const dom=new JSDOM(await readFile(new URL('../planning/index.html',import.meta.url),'utf8'),{url:'https://opus.test/planning/',runScripts:'outside-only'}),w=dom.window;
 let resolve;w.AbortSignal={timeout:()=>undefined};w.fetch=()=>new Promise(r=>{resolve=r;});w.eval(await readFile(new URL('../planning/app.js',import.meta.url),'utf8'));
 const $=id=>w.document.getElementById(id);$('code').value='a'.repeat(48);$('login').dispatchEvent(new w.Event('submit',{cancelable:true}));
 const answer=()=>resolve({ok:true,json:async()=>({checkedAt:'2026-09-14T10:00:00Z',events:[{date:$('from').value,endDate:$('from').value,start:'08:00',end:'17:00',title:'<img src=x onerror=alert(1)>',team:[{name:'Ruben',start:'08:00',end:'17:00'}]}]})});
 answer();await new Promise(r=>setTimeout(r,0));assert.equal($('calendar').hidden,false);assert.match($('days').textContent,/Ruben/);assert.equal($('days').querySelector('img'),null);
 $('refresh').click();$('logout').click();answer();await new Promise(r=>setTimeout(r,0));assert.equal($('calendar').hidden,true);assert.equal($('days').textContent,'');dom.window.close();
});
