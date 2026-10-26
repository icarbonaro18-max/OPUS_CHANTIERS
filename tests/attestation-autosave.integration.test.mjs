import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';

const PERIOD=15*60*1000;
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await turn();}assert.fail('The expected asynchronous operation did not complete');}
const hash=async value=>createHash('sha256').update(value).digest('hex');

async function harness(t,{online=true,sha=hash}={}){
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://opus.example/'});
 let now=Date.parse('2026-10-26T09:00:00Z'),nextTimer=0,nextId=0;
 const timers=new Map(),records=new Map(),messages=[],writes=[],trace=[];
 const controls={failSet:null,beforeGet:null,beforeSet:null,save:null};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const store={
  async get(key){const value=structuredClone(records.get(key));if(controls.beforeGet)await controls.beforeGet(key,value);return value;},
  async set(key,value){if(controls.beforeSet)await controls.beforeSet(key,value);if(controls.failSet&&key.startsWith('draft:'))throw controls.failSet;records.set(key,structuredClone(value));trace.push(['stored',key]);},
  async remove(key){records.delete(key);trace.push(['removed',key]);},
  async all(prefix=''){return [...records].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({key,value:structuredClone(value)}));}
 };
 const journal={async save(draft){writes.push(structuredClone(draft));if(controls.save)await controls.save(draft);return {heads:[{revision:draft.revision}]};}};
 class UI{
  constructor(c){this.c=c;this.data={};this.section='projects';this.personnelSyncComplete=true;this.restoreCalls=0;}
  async init({cached}){this.cacheMode=!!cached;}
  async reload(){this.cacheMode=false;this.hasLoadedRemote=true;return true;}
  async restoreSection(){this.restoreCalls++;this.c.showDashboard();}
  sortProjects(rows){return rows;}projectIsToday(){return false;}projectEventChip(){return '';}
 }
 const navigator={onLine:online},frame=dom.window.document.getElementById('moduleFrame').contentWindow;
 frame.postMessage=(message)=>{messages.push(structuredClone(message));trace.push(['message',message.type,message.captureId,message.ok]);};
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','').replace("const {OpsUI}=await import('./lib/ops-ui.js?v=3.4.2');",'').replace('init().catch(err);','');
 source+='\nstore=TEST_STORE;journal=TEST_JOURNAL;g={readOnlyCache:false};user={id:"tech",displayName:"Technicien"};globalThis.hooks={queueSave,flush,draftKey,requestFrame,pendingReplies,activate,resumeCloud,setRoute,routeState,getUI:()=>opsUI,getLive:()=>live,setLive:value=>live=value,queued:()=>queueChain,configureProject:(project,metadata)=>{selected=project;meta=metadata;config={adminUsers:[]};modules={baes:{title:"Attestation BAES",prefix:"BAES"}};catalog={projects:[project],categories:[],loose:[]};},setGraph:value=>g=value};';
 const context=vm.createContext({TEST_STORE:store,TEST_JOURNAL:journal,OpsUI:UI,CATEGORIES:[],progress:()=>({urgent:false}),targetStage:p=>p.category,progressPanel(){},showProjectScreen(){},mountCompleteProject(){},queuePickupRead:async()=>{},loadOrders:async()=>({supplier:[],depot:[]}),loadPickupStates:async()=>[],pickupCount:()=>0,pickupBadge:()=>'',requiresInteractiveAuth:()=>false,installResumeSync:()=>()=>{},Date:Clock,sha,uid:()=>String(++nextId).padStart(32,'0'),norm:s=>s,
  structuredClone,URL,URLSearchParams,Blob,location:dom.window.location,history:dom.window.history,localStorage:dom.window.localStorage,document:dom.window.document,window:dom.window,navigator,
  console:{log(){},warn(){},error(){}},setInterval:()=>0,clearInterval(){},setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source,context);
 const session={projectId:'project-a',recordId:'baes-a',moduleKey:'baes',payload:{moduleKey:'baes',ref:'BAES-A',context:{name:'Site A'},state:null},parents:[],nonce:'session-a',lastHash:'',lastCaptureId:0,stateChain:Promise.resolve(),ready:true,closing:false};
 context.hooks.setLive(session);
 t.after(()=>{timers.clear();dom.window.close();});
 const post=(state,captureId,extra={})=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{origin:dom.window.location.origin,source:frame,data:{type:'opus-state',nonce:session.nonce,moduleKey:'baes',state:structuredClone(state),captureId,...extra}}));
 return {dom,records,store,journal,controls,navigator,messages,writes,trace,session,post,hooks:context.hooks,
  ack:id=>messages.find(message=>message.type==='opus-state-ack'&&message.captureId===id),
  advance:ms=>{now+=ms;},now:()=>now,key:context.hooks.draftKey('project-a','attestations','baes-a'),
  runNextTimer:async()=>{const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(next,'A retry must be scheduled');timers.delete(next[0]);now=Math.max(now,next[1].at);await next[1].fn();},
  save:(payload,options={deferRemote:true})=>context.hooks.queueSave('project-a','attestations','baes-a',payload,session.parents,options)};
}

test('offline capture acknowledges only durable local text, photos and signature',async t=>{
 const h=await harness(t,{online:false}),persist=deferred(),entered=deferred();
 const state={observationsGenerales:'Contrôle effectué',baes:[{repere:'A1',photo:'data:image/jpeg;base64,cGhvdG8='}],signature:'data:image/png;base64,c2lnbmF0dXJl'};
 h.controls.beforeSet=async key=>{if(key===h.key){entered.resolve();await persist.promise;}};
 h.post(state,1);await entered.promise;
 assert.equal(h.ack(1),undefined);assert.equal(h.records.has(h.key),false);
 persist.resolve();await until(()=>h.ack(1));
 assert.equal(h.ack(1).ok,true);assert.deepEqual(h.records.get(h.key).payload.state,state);
 assert.equal(h.writes.length,0);assert.match(h.dom.window.document.getElementById('saveStatus').textContent,/tablette|appareil|local/i);
});

test('remote autosave is due fifteen minutes after first draft and typing does not postpone it',async t=>{
 const h=await harness(t);await h.save({moduleKey:'baes',state:{note:'Premier texte'}});
 const due=h.records.get(h.key).nextRemoteAt;assert.equal(due,h.now()+PERIOD);assert.equal(h.writes.length,0);
 h.advance(9*60*1000);await h.save({moduleKey:'baes',state:{note:'Dernier texte'}});
 assert.equal(h.records.get(h.key).nextRemoteAt,due);await h.hooks.flush();assert.equal(h.writes.length,0);
 h.advance(6*60*1000);await h.hooks.flush();
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].payload.state.note,'Dernier texte');assert.equal(h.records.has(h.key),false);
});

test('manual force sends a deferred draft immediately and keeps other documents immediate by default',async t=>{
 const h=await harness(t);await h.save({moduleKey:'baes',state:{note:'À envoyer maintenant'}});
 assert.equal(h.writes.length,0);await h.hooks.flush({force:true});assert.equal(h.writes.length,1);assert.equal(h.records.has(h.key),false);
 h.navigator.onLine=false;
 const key=h.hooks.draftKey('project-b','fiche',null);
 await h.hooks.queueSave('project-b','fiche',null,{name:'Fiche chantier'},[]);
 assert.equal(h.records.get(key).nextRemoteAt,0);
 h.navigator.onLine=true;await h.hooks.flush();assert.equal(h.writes.length,2);assert.equal(h.writes[1].kind,'fiche');assert.equal(h.records.has(key),false);
});

test('a failed manual save retries after thirty seconds instead of waiting for the fifteen-minute due time',async t=>{
 const h=await harness(t),startedAt=h.now();
 await h.save({moduleKey:'baes',state:{note:'Sauvegarde manuelle à réessayer'}});await h.hooks.flush();
 const revision=h.records.get(h.key).revision;
 h.controls.save=async()=>{if(h.writes.length===1)throw Error('Réseau temporairement indisponible');};
 await h.hooks.flush({force:true});assert.equal(h.writes.length,1);assert.equal(h.records.get(h.key).revision,revision);
 await h.runNextTimer();
 assert.equal(h.now(),startedAt+30000);assert.equal(h.writes.length,2);assert.equal(h.writes[1].revision,revision);
 assert.equal(h.records.has(h.key),false);
});

test('new edits during the cloud acknowledgement survive and inherit the acknowledged revision',async t=>{
 const h=await harness(t),ackRead=deferred(),releaseAck=deferred();
 await h.save({moduleKey:'baes',state:{note:'Version A'}});
 const revisionA=h.records.get(h.key).revision;
 let paused=false;
 h.controls.beforeGet=async key=>{if(key===h.key&&h.writes.length===1&&!paused){paused=true;ackRead.resolve();await releaseAck.promise;}};
 const sending=h.hooks.flush({force:true});await ackRead.promise;
 const editing=h.save({moduleKey:'baes',state:{note:'Version B — ne pas perdre'}});
 await turn();releaseAck.resolve();await Promise.all([sending,editing]);
 const pending=h.records.get(h.key),uploadedB=h.writes.find(d=>d.payload.state.note==='Version B — ne pas perdre');
 assert.ok(pending||uploadedB,'The later edit must exist locally or have reached the cloud');
 const latest=pending||uploadedB;assert.equal(latest.payload.state.note,'Version B — ne pas perdre');assert.deepEqual(latest.parents,[revisionA]);
 await h.hooks.flush({force:true});assert.equal(h.writes.at(-1).payload.state.note,'Version B — ne pas perdre');
 assert.equal(h.records.has(h.key),false);
});

test('force requested during an in-flight upload waits and also sends the newer capture',async t=>{
 const h=await harness(t),started=deferred(),release=deferred();
 h.controls.save=async()=>{if(h.writes.length===1){started.resolve();await release.promise;}};
 await h.save({moduleKey:'baes',state:{note:'Version A'}});
 const first=h.hooks.flush({force:true});await started.promise;
 await h.save({moduleKey:'baes',state:{note:'Version B'}});
 let secondDone=false;const second=h.hooks.flush({force:true}).then(()=>{secondDone=true;});
 await turn();assert.equal(secondDone,false,'Manual save must await an existing upload');
 release.resolve();await Promise.all([first,second]);
 assert.equal(h.writes.at(-1).payload.state.note,'Version B');assert.equal(h.records.has(h.key),false);
 assert.deepEqual(h.writes[1].parents,[h.writes[0].revision]);
});

test('a failed local write returns a negative acknowledgement and the identical capture can be retried',async t=>{
 const h=await harness(t,{online:false}),state={observationsGenerales:'Saisie encore dans le formulaire'};
 h.controls.failSet=Error('Stockage temporairement indisponible');h.post(state,1);await until(()=>h.ack(1));
 assert.equal(h.ack(1).ok,false);assert.equal(h.records.has(h.key),false);assert.equal(h.writes.length,0);
 assert.match(h.dom.window.document.getElementById('saveStatus').textContent,/sauvegarde|enregistr/i);
 assert.equal(h.dom.window.document.getElementById('toast').hidden,true,'Automatic failures must not raise repeated toast errors');
 h.controls.failSet=null;h.post(state,2);await until(()=>h.ack(2));
 assert.equal(h.ack(2).ok,true);assert.deepEqual(h.records.get(h.key).payload.state,state);
});

test('capture processing remains in receive order even if the first hash is slow',async t=>{
 const hold=deferred(),started=deferred();let hashCalls=0;
 const h=await harness(t,{online:false,sha:async text=>{hashCalls++;if(hashCalls===1){started.resolve();await hold.promise;}return hash(text);}});
 h.post({note:'Premier état'},1);await started.promise;
 h.post({note:'Second état'},2);await turn();assert.equal(hashCalls,1);
 hold.resolve();await until(()=>h.ack(2));
 assert.deepEqual(h.messages.filter(m=>m.type==='opus-state-ack').map(m=>m.captureId),[1,2]);
 assert.equal(h.records.get(h.key).payload.state.note,'Second état');assert.equal(h.ack(1).ok,true);assert.equal(h.ack(2).ok,true);
});

test('manual capture rejects a local storage failure instead of allowing close to succeed',async t=>{
 const h=await harness(t,{online:false});h.controls.failSet=Error('Stockage plein');
 const capture=h.hooks.requestFrame('opus-capture');const rejection=assert.rejects(capture,/Stockage plein/);
 const request=h.messages.find(m=>m.type==='opus-capture');assert.ok(request);
 h.post({note:'Non enregistré'},1,{requestId:request.requestId});await rejection;
 await until(()=>h.ack(1));assert.equal(h.ack(1).ok,false);assert.equal(h.records.has(h.key),false);
});

test('closing a report waits for its local capture but returns to the project while cloud upload is slow',async t=>{
 const h=await harness(t),localStarted=deferred(),releaseLocal=deferred(),uploadStarted=deferred(),releaseUpload=deferred();
 h.hooks.configureProject({id:'project-a',name:'Site A',category:'02'},{name:'Site A',client:'Client A',adresse:'1 rue du Site'});
 h.journal.directory=async()=>null;
 h.controls.beforeSet=async key=>{if(key===h.key){localStarted.resolve();await releaseLocal.promise;}};
 h.controls.save=async()=>{uploadStarted.resolve();await releaseUpload.promise;};
 const panel=h.dom.window.document.getElementById('modulePanel');panel.hidden=false;
 let closed=false;const closing=h.dom.window.document.getElementById('closeModule').onclick().then(()=>{closed=true;});
 await until(()=>h.messages.some(m=>m.type==='opus-capture'));
 const request=h.messages.find(m=>m.type==='opus-capture'),state={observationsGenerales:'Dernière saisie avant fermeture',signature:'data:image/png;base64,c2ln'};
 h.post(state,1,{requestId:request.requestId});await localStarted.promise;
 assert.equal(panel.hidden,false);assert.equal(closed,false);assert.equal(h.writes.length,0);
 releaseLocal.resolve();await uploadStarted.promise;await closing;
 assert.equal(panel.hidden,true);assert.equal(h.hooks.getLive(),null);assert.equal(closed,true);
 assert.deepEqual(h.records.get(h.key).payload.state,state);assert.equal(h.ack(1).ok,true);
 assert.ok(h.dom.window.document.querySelector('[data-att="baes-a"]'),'The locally saved report remains available from the project');
 releaseUpload.resolve();await h.hooks.flush();assert.equal(h.records.has(h.key),false);assert.deepEqual(h.writes[0].payload.state,state);
});

test('a warm-start attestation link opens after fresh data arrives and yields to deliberate user navigation',async t=>{
 for(const navigateAway of [false,true]){
  const h=await harness(t),connected=deferred(),releaseConnection=deferred();
  const project={id:'project-a',name:'Site A',category:'02'},metadata={name:'Site A',client:'Client A',adresse:'1 rue du Site'};
  const payload={moduleKey:'baes',ref:'BAES-A',context:{siteName:'Site A',client:'Client A',adresse:'1 rue du Site'},state:{reference:'BAES-A',observationsGenerales:'État enregistré au bureau'}};
  const catalog={projects:[project],categories:[],loose:[]},reads=[];
  h.hooks.configureProject(project,metadata);h.hooks.setLive(null);h.hooks.setRoute(project.id,'attestations','baes-a');
  h.hooks.setGraph({readOnlyCache:true,async connect(){connected.resolve();await releaseConnection.promise;},async request(){return {id:'tech',displayName:'Technicien'};},async projects(){return structuredClone(catalog);},async children(){return [{name:'baes-a',folder:{}}];}});
  h.journal.directory=async()=>({id:'attestations-root'});
  h.journal.load=async(projectId,kind,id)=>{reads.push([projectId,kind,id]);return {data:structuredClone(kind==='fiche'?metadata:payload),heads:[{revision:'a'.repeat(32)}],files:[]};};
  await h.hooks.activate({cached:{operations:{}}});
  assert.equal(h.hooks.getUI().cacheMode,true);assert.equal(h.hooks.getUI().restoreCalls,0);
  assert.equal(h.hooks.routeState().attestationId,'baes-a');assert.equal(reads.length,0);assert.equal(h.hooks.getLive(),null);
  const resume=h.hooks.resumeCloud();await connected.promise;
  if(navigateAway)h.hooks.setRoute(project.id,'overview');
  releaseConnection.resolve();await resume;
  assert.equal(h.hooks.getUI().cacheMode,false);
  if(navigateAway){assert.equal(h.hooks.getLive(),null);assert.equal(h.hooks.routeState().tab,'overview');assert.equal(reads.length,0);}
  else{
   assert.equal(h.hooks.getLive()?.recordId,'baes-a');assert.equal(h.dom.window.document.getElementById('modulePanel').hidden,false);
   assert.equal(h.hooks.getLive().payload.state.observationsGenerales,'État enregistré au bureau');
   assert.equal(h.hooks.routeState().attestationId,'baes-a');assert.match(h.dom.window.document.getElementById('moduleFrame').src,/modules\/baes\/index\.html\?embed=1/);
   assert.ok(reads.some(([,kind,id])=>kind==='attestations'&&id==='baes-a'));
  }
 }
});
