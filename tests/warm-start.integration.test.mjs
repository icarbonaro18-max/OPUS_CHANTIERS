import {acquireSessionToken,requiresInteractiveAuth,runAuthInteraction,selectSessionAccount} from '../lib/auth-session.js';
import {loadAppConfig} from '../lib/app-config.js';
import {CloudError} from '../lib/cloud.js';
import {ReportRecovery} from '../lib/report-recovery.js';
import {installResumeSync} from '../lib/resume-sync.js';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
import {WarmCache,OPS_KEYS} from '../lib/warm-cache.js';import {OpsUI} from '../lib/ops-ui.js';
const data=()=>Object.fromEntries(OPS_KEYS.map(k=>[k,[]]));
test('Cached planning opens before Microsoft responds and updates after connection',async t=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://opus.example'});for(const k of ['window','document','localStorage'])globalThis[k]=dom.window[k];localStorage.setItem('opus-main-section','calendar');t.after(()=>{dom.window.dispatchEvent(new dom.window.Event('pagehide'));clearTimeout(dom.window.toastTimer);dom.window.close();});
 const records=new Map();class Store{constructor(namespace){this.namespace=namespace;}async get(k){return structuredClone(records.get(this.namespace+'|'+k));}async set(k,v){records.set(this.namespace+'|'+k,structuredClone(v));}async all(){return [];}}
 const config={clientId:'app',tenant:'tenant',siteHost:'host',sitePath:'/opus'};const cache=new WarmCache(new Store('app:account-a'),'account-a',config);
 await cache.write({user:{id:'worker',displayName:'Worker',mail:'worker'},drive:{id:'drive'},site:{id:'site'},catalog:{projects:[],categories:[],loose:[]},operations:data()});
 let connectRelease,loads=0,failCatalogue=false,failOperations=false;const connected=new Promise(r=>connectRelease=r);class Graph{async connect(){await connected;this.site={id:'site'};this.drive={id:'drive'};}async request(){return {id:'worker',displayName:'Worker',mail:'worker'};}async projects(){if(failCatalogue)throw Error('Catalogue indisponible');return {projects:[],categories:[],loose:[]};}}
 class UI extends OpsUI{constructor(ctx){super(ctx);this.repo={init:async()=>{},loadAll:async()=>{loads++;if(failOperations)throw Error('Network down');return data();}};}}
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','').replace(/const \{OpsUI\}=await import\('\.\/lib\/ops-ui\.js\?v=[^']+'\);/,'').replace('init().catch(err);','');source+='\nconfig=TEST_CONFIG;globalThis.hooks={connectCloud,resumeCloud,reconnectReport,prepareAppointmentWrite,ensureReportReady,setAuth:value=>msal=value,getUI:()=>opsUI};';
 const context=vm.createContext({TEST_CONFIG:config,acquireSessionToken,requiresInteractiveAuth,runAuthInteraction,selectSessionAccount,CloudError,ReportRecovery,installResumeSync,localStorage:dom.window.localStorage,WarmCache,OpsUI:UI,Graph,Journal:class{},LocalStore:Store,CATEGORIES:[],norm:s=>s,structuredClone,URL,URLSearchParams,location:dom.window.location,history:dom.window.history,document:dom.window.document,window:dom.window,navigator:{onLine:true},console,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout});vm.runInContext(source,context);
 await context.hooks.connectCloud({homeAccountId:'account-a'});assert.ok(document.querySelector('.hourGrid'));assert.equal(context.hooks.getUI().cacheMode,true);assert.equal(loads,0);assert.match(document.getElementById('syncNotice').textContent,/mémorisées/);
 connectRelease();await context.hooks.resumeCloud();assert.equal(loads,1);assert.equal(context.hooks.getUI().cacheMode,false);assert.equal(document.getElementById('syncNotice').hidden,true);
 failCatalogue=true;await context.hooks.resumeCloud();assert.equal(context.hooks.getUI().cacheMode,false);assert.equal(context.hooks.getUI().needsRefresh,false);assert.match(document.getElementById('syncNotice').textContent,/Planning actualisé/);failCatalogue=false;

 // A temporary background failure must not revoke a verified working snapshot.
 failOperations=true;await context.hooks.resumeCloud();assert.equal(context.hooks.getUI().cacheMode,false);assert.equal(context.hooks.getUI().dataLoadError,null);assert.equal(context.hooks.getUI().needsRefresh,false);failOperations=false;
 // A transient token failure must not send the user away from their open form.
 let accidentalRedirects=0;context.hooks.setAuth({getActiveAccount:()=>({homeAccountId:'account-a'}),acquireTokenSilent:async()=>{throw Object.assign(Error('Network error'),{errorCode:'network_error'});},loginRedirect:async()=>{accidentalRedirects++;}});
 await assert.rejects(context.hooks.reconnectReport(),e=>e.code==='token_unavailable');assert.equal(accidentalRedirects,0);assert.equal(context.hooks.getUI().needsRefresh,false);
 // Root submit guard cannot mistake a detached report for an appointment draft.
 const ui=context.hooks.getUI();ui.cacheMode=true;let staleFlushes=0,submits=0;
 ui.activeReportRecovery={form:document.createElement('form'),flush:async()=>{staleFlushes++;}};
 document.getElementById('modalBody').innerHTML='<form id="appointmentOnly"><input value="13:00"></form>';
 const dialog=document.getElementById('modal');dialog.open=true;const appointment=document.getElementById('appointmentOnly');
 appointment.onsubmit=e=>{e.preventDefault();submits++;};appointment.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(submits,1);assert.equal(staleFlushes,0);
 await context.hooks.prepareAppointmentWrite();assert.equal(ui.cacheMode,false);assert.equal(document.getElementById('appointmentOnly'),appointment);assert.equal(appointment.querySelector('input').value,'13:00');
 // Simple freshness checks are not authentication failures or write conflicts.
 ui.refreshPending=true;const callsBefore=loads;assert.equal(await context.hooks.ensureReportReady(),true);assert.equal(loads,callsBefore);assert.equal(ui.needsRefresh,false);
 dialog.open=false;ui.activeReportRecovery=null;
 // The real reconnect path must finish local persistence before a Microsoft redirect.
 let persisted=false,redirects=0;context.hooks.getUI().activeReportRecovery={flush:async()=>{persisted=true;}};
 context.hooks.setAuth({getActiveAccount:()=>({homeAccountId:'account-a'}),acquireTokenSilent:async()=>{throw Object.assign(Error('expired'),{errorCode:'interaction_required'});},setActiveAccount(){},acquireTokenPopup:async()=>{assert.equal(persisted,true);redirects++;return {account:{homeAccountId:'account-a'}};}});
 await context.hooks.reconnectReport();assert.equal(redirects,1);
 context.hooks.getUI().activeReportRecovery={flush:async()=>{throw Error('Local storage full');}};
 await assert.rejects(context.hooks.reconnectReport(),/Local storage full/);assert.equal(redirects,1);
 context.hooks.getUI().activeReportRecovery=null;

 dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();
});
test('Installed shell returns cache immediately and does not intercept Graph',async()=>{
 const handlers={},cached=new Response('installed-app');let calls=0;const context=vm.createContext({URL,Response,Request,console,self:{registration:{scope:'https://opus.example/'},addEventListener:(n,f)=>handlers[n]=f},caches:{open:async()=>({match:async()=>cached})},fetch:()=>{calls++;return new Promise(()=>{});}});
 vm.runInContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),context);let result;handlers.fetch({request:new Request('https://opus.example/app.js?v=3.4.73'),respondWith:p=>result=p});assert.equal(await (await result).text(),'installed-app');assert.equal(calls,0);handlers.fetch({request:new Request('https://graph.microsoft.com/v1.0/me'),respondWith:()=>assert.fail('Graph must never be intercepted')});
});

test('legacy config and duplicate Roberto records do not block Brahim on the first warm refresh',async t=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://opus.example'});
 for(const key of ['window','document','localStorage','Event'])globalThis[key]=dom.window[key];
 localStorage.setItem('opus-main-section','calendar');
 t.after(()=>{dom.window.dispatchEvent(new dom.window.Event('pagehide'));clearTimeout(dom.window.toastTimer);dom.window.close();});
 const published={...JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8')),clientId:'app',tenant:'tenant',siteHost:'host',sitePath:'/opus'};
 // Historical settings saved the entire config and consequently masked newly
 // published personnel, even when the installed application itself was current.
 localStorage.setItem('opus-cloud-config-v3',JSON.stringify({...published,defaultPeople:[]}));
 const records=new Map();
 class Store{constructor(namespace){this.namespace=namespace;}async get(k){return structuredClone(records.get(this.namespace+'|'+k));}async set(k,v){records.set(this.namespace+'|'+k,structuredClone(v));}async all(){return [];}}
 const roberto=published.defaultPeople.find(p=>p.name==='CARBONARO Roberto');
 const robertoRecords=[{...structuredClone(roberto),id:'rob-active',officeManaged:true},{...structuredClone(roberto),id:'rob-old',active:false,officeManaged:true}];
 const remote=data();remote.people=[{id:'existing',name:'Existing colleague',type:'internal',role:'technicien',weeklyTarget:39,active:true,officeManaged:true,absences:[]},...structuredClone(robertoRecords)];
 remote.events=[{id:'old-appointment',kind:'free',title:'Ancien rendez-vous',teamIds:['rob-old'],start:'2026-10-01T08:00:00Z',end:'2026-10-01T09:00:00Z'}];const oldEvents=structuredClone(remote.events);
 const expectedPeople=remote.people.length+published.defaultPeople.length-1;
 const profile={id:'worker',displayName:'Worker',mail:'worker'},catalog={projects:[],categories:[],loose:[]};
 const cache=new WarmCache(new Store('app:account-a'),'account-a',published);
 await cache.write({user:profile,drive:{id:'drive'},site:{id:'site'},catalog,operations:remote});
 let release,loads=0,writes=0;const connected=new Promise(resolve=>release=resolve);
 class Graph{async connect(){await connected;this.site={id:'site'};this.drive={id:'drive'};}async request(){return profile;}async projects(){return catalog;}async accessToken(){return 'test-token';}}
 class UI extends OpsUI{constructor(ctx){super(ctx);this.repo={init:async()=>{},loadAll:async({shouldApply=()=>true}={})=>{loads++;return shouldApply()?structuredClone(remote):null;},save:async(kind,rows)=>{assert.equal(kind,'people');writes++;remote[kind]=structuredClone(rows);}};}}
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','').replace(/const \{OpsUI\}=await import\('\.\/lib\/ops-ui\.js\?v=[^']+'\);/,'').replace('init().catch(err);','');
 // Exercise the real bootstrap/config merge, stubbing only interactive identity
 // setup; authentication is covered independently by the session/bridge tests.
 source+='\nauthInit=async()=>{};globalThis.hooks={init,connectCloud,resumeCloud,getUI:()=>opsUI,getConfig:()=>config};';
 const context=vm.createContext({loadAppConfig,acquireSessionToken,requiresInteractiveAuth,runAuthInteraction,selectSessionAccount,CloudError,ReportRecovery,installResumeSync,localStorage:dom.window.localStorage,WarmCache,OpsUI:UI,Graph,Journal:class{},LocalStore:Store,CATEGORIES:[],norm:s=>s,structuredClone,URL,URLSearchParams,location:dom.window.location,history:dom.window.history,document:dom.window.document,window:dom.window,navigator:{onLine:true},console,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,
  fetch:async url=>({json:async()=>url==='./config.json'?structuredClone(published):{}})});
 vm.runInContext(source,context);await context.hooks.init();
 assert.ok(context.hooks.getConfig().defaultPeople.some(p=>p.name==='CHATTI Brahim'));
 assert.equal(JSON.parse(localStorage.getItem('opus-cloud-config-v3')).defaultPeople,undefined);
 await context.hooks.connectCloud({homeAccountId:'account-a'});const ui=context.hooks.getUI();
 ui.calendarPersonId='existing';await ui.renderCalendar();
 const dropdownNames=()=>[...document.querySelectorAll('#calendarPerson option')].map(option=>option.textContent);
 assert.equal(ui.cacheMode,true);assert.equal(dropdownNames().includes('CHATTI Brahim'),false);assert.equal(writes,0);
 release();await context.hooks.resumeCloud();
 assert.equal(writes,1);assert.equal(ui.cacheMode,false);assert.equal(ui.personnelSyncComplete,true);
 assert.equal(remote.people.length,expectedPeople);assert.equal(dropdownNames().includes('CHATTI Brahim'),true);
 assert.equal(document.getElementById('calendarPerson').value,'existing');
 assert.deepEqual(remote.people.filter(p=>p.id.startsWith('rob-')),robertoRecords);assert.deepEqual(remote.events,oldEvents);
 assert.equal(remote.people.filter(p=>p.name==='CHATTI Brahim').length,1);assert.ok(ui.personnelSyncWarnings.includes('CARBONARO Roberto'));
 assert.equal((await cache.read()).operations.people.some(p=>p.name==='CHATTI Brahim'),true);
 await context.hooks.resumeCloud();assert.equal(writes,1);assert.equal(remote.people.length,expectedPeople);assert.equal(document.getElementById('calendarPerson').value,'existing');
 const dialog=document.getElementById('modal');dialog.open=true;document.getElementById('modalBody').innerHTML='<form><input id="unsentAppointment" value="Saisie non envoyée"></form>';
 const input=document.getElementById('unsentAppointment'),previousLoads=loads;await context.hooks.resumeCloud();
 assert.equal(document.getElementById('unsentAppointment'),input);assert.equal(input.value,'Saisie non envoyée');assert.equal(loads,previousLoads);assert.equal(writes,1);assert.equal(dialog.open,true);
 ui.calendarFitCleanup?.();
});
