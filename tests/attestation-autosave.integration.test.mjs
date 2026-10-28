import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {parseRevision} from '../lib/cloud.js';

const PERIOD=15*60*1000;
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await turn();}assert.fail('The expected asynchronous operation did not complete');}
const hash=async value=>createHash('sha256').update(value).digest('hex');

async function harness(t,{online=true,sha=hash}={}){
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://opus.example/'});
 let now=Date.parse('2026-10-26T09:00:00Z'),nextTimer=0,nextId=0;
 const timers=new Map(),records=new Map(),messages=[],writes=[],trace=[];
 const controls={failSet:null,failPdfSet:null,beforeGet:null,beforeSet:null,save:null};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const store={
  async get(key){const value=structuredClone(records.get(key));if(controls.beforeGet)await controls.beforeGet(key,value);return value;},
  async set(key,value){if(controls.beforeSet)await controls.beforeSet(key,value);if(controls.failSet&&key.startsWith('draft:'))throw controls.failSet;if(controls.failPdfSet&&key.startsWith('pdfoutbox:'))throw controls.failPdfSet;records.set(key,structuredClone(value));trace.push(['stored',key]);},
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
 source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','').replace(/const \{OpsUI\}=await import\('\.\/lib\/ops-ui\.js\?v=[^']+'\);/,'').replace('init().catch(err);','');
 source+='\nstore=TEST_STORE;journal=TEST_JOURNAL;g={readOnlyCache:false};user={id:"tech",displayName:"Technicien"};globalThis.hooks={loadWithLocalFallback,queueSave,flush,flushPdfOutbox,draftKey,requestFrame,pendingReplies,activate,resumeCloud,setRoute,routeState,chooseRevision,reconnectReport,getUI:()=>opsUI,getLive:()=>live,setLive:value=>live=value,queued:()=>queueChain,configureProject:(project,metadata)=>{selected=project;meta=metadata;config={adminUsers:[]};modules={baes:{title:"Attestation BAES",prefix:"BAES"}};catalog={projects:[project],categories:[],loose:[]};},setGraph:value=>g=value};';
 const context=vm.createContext({TEST_STORE:store,TEST_JOURNAL:journal,OpsUI:UI,CATEGORIES:[],progress:()=>({urgent:false}),targetStage:p=>p.category,progressPanel(){},showProjectScreen(){},mountCompleteProject(){},queuePickupRead:async()=>{},loadOrders:async()=>({supplier:[],depot:[]}),loadPickupStates:async()=>[],pickupCount:()=>0,pickupBadge:()=>'',requiresInteractiveAuth:()=>false,installResumeSync:()=>()=>{},Date:Clock,sha,uid:()=>String(++nextId).padStart(32,'0'),norm:s=>s,
  structuredClone,URL,URLSearchParams,Blob,parseRevision,safeName:s=>String(s).replace(/["*:<>?/\\|]/g,'-'),location:dom.window.location,history:dom.window.history,localStorage:dom.window.localStorage,document:dom.window.document,window:dom.window,navigator,
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

test('returning online sends the locally saved attestation without closing the open form',async t=>{
 const h=await harness(t,{online:false});
 h.hooks.configureProject({id:'project-a',name:'Site A',category:'02'},{name:'Site A',client:'Client',adresse:'Rue'});
 await h.hooks.activate({cached:{operations:{}}});
 h.hooks.setGraph({readOnlyCache:true,async connect(){},async request(){return {id:'tech',displayName:'Technicien'};}});
 const state={baes:[{repere:'1',photo:'data:image/jpeg;base64,photo'}],signature:'data:image/png;base64,sig'};
 h.post(state,1);await until(()=>h.ack(1));assert.equal(h.writes.length,0);
 h.navigator.onLine=true;await h.hooks.resumeCloud({forceUploads:true});await until(()=>!h.records.has(h.key));await h.hooks.flush();
 assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0].payload.state,state);
 assert.equal(h.records.has(h.key),false);assert.equal(h.hooks.getLive().recordId,'baes-a');
});

test('background reconnection respects the fifteen-minute due time and does not wait for a slow photo upload',async t=>{
 const h=await harness(t),started=deferred(),release=deferred();let connections=0;
 h.hooks.configureProject({id:'project-a',name:'Site A',category:'02'},{name:'Site A',client:'Client',adresse:'Rue'});
 await h.hooks.activate({cached:{operations:{}}});
 h.hooks.setGraph({readOnlyCache:true,async connect(){connections++;},async accessToken(){return 'token';},async request(){return {id:'tech',displayName:'Technicien'};}});
 await h.save({moduleKey:'baes',state:{note:'En cours de saisie'}});
 await h.hooks.resumeCloud();await h.hooks.flush();assert.equal(h.writes.length,0,'A focus or periodic refresh must not force an early remote save');
 h.advance(PERIOD);h.controls.save=async()=>{started.resolve();await release.promise;};
 const resume=h.hooks.resumeCloud();await started.promise;await resume;
 assert.equal(h.records.has(h.key),true,'The slow send is still outstanding');assert.equal(h.hooks.getLive(),h.session);
 await h.hooks.resumeCloud();assert.equal(connections,1,'An open form only checks its token after the initial connection');
 release.resolve();await h.hooks.flush();assert.equal(h.records.has(h.key),false);
});

test('reconnecting from the history dialog verifies Microsoft without reloading every operational record',async t=>{
 const h=await harness(t);h.hooks.configureProject({id:'project-a',name:'Site A',category:'02'},{name:'Site A',client:'Client',adresse:'Rue'});
 await h.hooks.activate({cached:{operations:{}}});h.hooks.setLive(null);
 const dialog=h.dom.window.document.getElementById('modal');dialog.open=true;h.dom.window.document.getElementById('modalBody').innerHTML='<p>Historique des enregistrements</p>';
 let connections=0;const graph={readOnlyCache:true,async connect(){connections++;},async accessToken(){return 'token';},async request(){return {id:'tech',displayName:'Technicien'};}};h.hooks.setGraph(graph);
 h.hooks.getUI().reload=async()=>assert.fail('Reading history must not depend on reloading the 43 MB intervention file');
 await h.hooks.reconnectReport();assert.equal(connections,1);assert.equal(graph.readOnlyCache,false);assert.equal(dialog.open,true);assert.equal(h.hooks.getUI().cacheMode,true,'The operational snapshot is still protected until its own refresh');
 assert.match(h.dom.window.document.getElementById('syncNotice').textContent,/Connexion vérifiée/);
});

test('Examiner shows the chosen version beside its row without loading photos; reopening waits for photos and honours cancellation',async t=>{
 for(const cancel of [false,true]){
  const h=await harness(t),document=h.dom.window.document,dialog=document.getElementById('modal'),photos=deferred(),entered=deferred();
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  const revision='a'.repeat(32),file={id:'revision-a',name:`r_${revision}__p_root.json`,createdDateTime:'2026-10-28T11:13:20Z'},loaded={dir:{id:'revisions'},files:[file],heads:[{revision}]},payload={moduleKey:'baes',state:{note:'Notes de Ruben',photo:{$opusAsset:{id:'asset',mime:'image/jpeg'}}}};
  let reads=0,hydrations=0,chosen=null;
  h.journal.load=async(p,kind,id,rev,options)=>{reads++;assert.equal(rev,revision);assert.equal(options.hydrate,false);assert.equal(options.known,loaded);return {data:payload,doc:{createdAt:file.createdDateTime,author:{name:'Ruben'}}};};
  h.journal.hydrate=async()=>{hydrations++;entered.resolve();await photos.promise;return {...payload,state:{note:'Notes de Ruben',photo:'data:image/jpeg;base64,cGhvdG8='}};};
  await h.hooks.chooseRevision('project-a','attestations','baes-a',loaded,async(data,parents)=>{chosen={data,parents};},true);
  const examine=document.querySelector('[data-revision]');await examine.onclick();assert.equal(reads,1);assert.equal(hydrations,0);assert.equal(examine.disabled,false);
  const detail=document.getElementById('revisionDetail');assert.equal(examine.closest('.row').nextElementSibling,detail);assert.match(detail.textContent,/Notes de Ruben/);assert.match(detail.textContent,/photo\/signature conservée/);
  const use=document.getElementById('useRevision'),opening=use.onclick();await entered.promise;assert.equal(dialog.open,true);assert.equal(use.disabled,true);assert.equal(chosen,null);
  if(cancel)dialog.close();photos.resolve();await opening;
  if(cancel)assert.equal(chosen,null,'Closing history while photos load must not reopen a report later');
  else{assert.equal(dialog.open,false);assert.equal(chosen.data.state.photo,'data:image/jpeg;base64,cGhvdG8=');assert.deepEqual(Array.from(chosen.parents),[revision]);}
 }
});


test('slow network returns the existing local copy without replacing it with a late remote response',async t=>{
 const h=await harness(t),delayed=deferred();const cached={data:{client:'Local'}};
 const read=h.hooks.loadWithLocalFallback(()=>delayed.promise,cached);await h.runNextTimer();
 const value=await read;assert.equal(value.remote,false);assert.equal(value.value,cached);
 delayed.resolve({data:{client:'Remote'}});await turn();assert.equal(value.value.data.client,'Local');
});

async function preparePdf(h,{bytes=2000}={}){
 const button=h.dom.window.document.getElementById('saveModulePdf');
 const saving=button.onclick();
 await until(()=>h.messages.some(m=>m.type==='opus-capture'));
 const capture=h.messages.find(m=>m.type==='opus-capture');
 h.post({baes:Array.from({length:108},(_,i)=>({repere:String(i+1),photo:'data:image/jpeg;base64,cGhvdG8='})),signature:'data:image/png;base64,c2ln'},1,{requestId:capture.requestId});
 await until(()=>h.messages.some(m=>m.type==='opus-pdf'));
 const request=h.messages.find(m=>m.type==='opus-pdf');
 const frame=h.dom.window.document.getElementById('moduleFrame').contentWindow;
 h.dom.window.dispatchEvent(new h.dom.window.MessageEvent('message',{origin:h.dom.window.location.origin,source:frame,data:{type:'opus-pdf',nonce:h.session.nonce,requestId:request.requestId,blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'})}}));
 await saving;
}
function queuedPdfs(h){return [...h.records].filter(([key])=>key.startsWith('pdfoutbox:')).map(([,value])=>value);}

test('a 108 BAES report prepares a durable large PDF offline without claiming a cloud save',async t=>{
 const h=await harness(t,{online:false});await preparePdf(h,{bytes:7*1024*1024});
 const [pdf]=queuedPdfs(h);assert.ok(pdf);assert.equal(pdf.blob.size,7*1024*1024);
 assert.equal(h.records.get(h.key).payload.state.baes.length,108);
 assert.equal(h.dom.window.document.getElementById('downloadModulePdf').hidden,false);
 assert.match(h.dom.window.document.getElementById('pdfSaveStatus').textContent,/appareil.*attente/i);
 assert.equal(h.dom.window.document.getElementById('pendingCount').textContent,'2');
 assert.equal(h.writes.length,0);
});

test('a PDF can reach the chantier while the report-photo upload is still blocked',async t=>{
 const h=await harness(t),started=deferred(),release=deferred();
 h.controls.save=async()=>{started.resolve();await release.promise;};
 await h.save({moduleKey:'baes',state:{note:'Première saisie'}});
 const slow=h.hooks.flush({force:true});await started.promise;
 let uploaded=0;h.hooks.setGraph({readOnlyCache:false,folder:async()=>({id:'pdf-folder'}),named:async()=>null,upload:async(parent,name,blob)=>{uploaded++;return {id:'pdf-1',name,size:blob.size,file:{}};}});
 await preparePdf(h);await until(()=>uploaded===1);await h.hooks.flushPdfOutbox();
 assert.equal(queuedPdfs(h).length,0);assert.equal(h.records.get(h.key).payload.state.baes.length,108);
 assert.match(h.dom.window.document.getElementById('pdfSaveStatus').textContent,/enregistré au chantier/i);
 release.resolve();await slow;
});

test('a Microsoft 400 retains the PDF and identifies the failed step',async t=>{
 const h=await harness(t,{online:false});await preparePdf(h);h.navigator.onLine=true;
 let uploads=0;h.hooks.setGraph({readOnlyCache:false,folder:async()=>{throw Object.assign(Error('The request is malformed or incorrect.'),{status:400,code:'invalidRequest'});},upload:async()=>{uploads++;}});
 await h.hooks.flushPdfOutbox({notify:true});
 assert.equal(queuedPdfs(h).length,1);assert.equal(uploads,0);
 assert.match(h.dom.window.document.getElementById('pdfSaveStatus').textContent,/accès au dossier PDF.*Microsoft 400/i);
 assert.match(h.dom.window.document.getElementById('toast').textContent,/non envoyé au chantier/i);
});

test('a lost upload response is confirmed by its unique name and size instead of uploading again',async t=>{
 const h=await harness(t,{online:false});await preparePdf(h);h.navigator.onLine=true;
 let stored=null,uploads=0;
 h.hooks.setGraph({readOnlyCache:false,folder:async()=>({id:'pdf-folder'}),named:async()=>stored,upload:async(parent,name,blob)=>{uploads++;stored={id:'pdf-1',name,size:blob.size,file:{}};throw Error('Réponse perdue');}});
 await h.hooks.flushPdfOutbox();assert.equal(queuedPdfs(h).length,1);
 await h.hooks.flushPdfOutbox();assert.equal(queuedPdfs(h).length,0);assert.equal(uploads,1);
});

test('a same-name file with the wrong size does not clear the locally saved PDF',async t=>{
 const h=await harness(t,{online:false});await preparePdf(h);h.navigator.onLine=true;
 let uploads=0;h.hooks.setGraph({readOnlyCache:false,folder:async()=>({id:'pdf-folder'}),named:async(parent,name)=>({id:'other',name,size:1,file:{}}),upload:async()=>{uploads++;}});
 await h.hooks.flushPdfOutbox();assert.equal(queuedPdfs(h).length,1);assert.equal(uploads,0);
 assert.match(h.dom.window.document.getElementById('pdfSaveStatus').textContent,/confirmation du PDF/i);
});

test('if the device cannot store the PDF, its download remains available and no send is claimed',async t=>{
 const h=await harness(t,{online:false});h.controls.failPdfSet=Error('QuotaExceededError');await preparePdf(h);
 assert.equal(queuedPdfs(h).length,0);assert.equal(h.dom.window.document.getElementById('downloadModulePdf').hidden,false);
 assert.match(h.dom.window.document.getElementById('pdfSaveStatus').textContent,/téléchargez-le.*stockage local indisponible/i);
 assert.match(h.dom.window.document.getElementById('toast').textContent,/Télécharger le PDF préparé/i);
 assert.equal(h.records.get(h.key).payload.state.baes.length,108);
});
