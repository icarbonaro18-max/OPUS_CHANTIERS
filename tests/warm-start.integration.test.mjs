import {acquireSessionToken,requiresInteractiveAuth} from '../lib/auth-session.js';
import {CloudError} from '../lib/cloud.js';
import {ReportRecovery} from '../lib/report-recovery.js';
import {installResumeSync} from '../lib/resume-sync.js';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
import {WarmCache,OPS_KEYS} from '../lib/warm-cache.js';import {OpsUI} from '../lib/ops-ui.js';
const data=()=>Object.fromEntries(OPS_KEYS.map(k=>[k,[]]));
test('Cached planning opens before Microsoft responds and updates after connection',async t=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://opus.example'});for(const k of ['window','document','localStorage'])globalThis[k]=dom.window[k];localStorage.setItem('opus-main-section','calendar');t.after(()=>{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();});
 const records=new Map();class Store{constructor(namespace){this.namespace=namespace;}async get(k){return structuredClone(records.get(this.namespace+'|'+k));}async set(k,v){records.set(this.namespace+'|'+k,structuredClone(v));}async all(){return [];}}
 const config={clientId:'app',tenant:'tenant',siteHost:'host',sitePath:'/opus'};const cache=new WarmCache(new Store('app:account-a'),'account-a',config);
 await cache.write({user:{id:'worker',displayName:'Worker',mail:'worker'},drive:{id:'drive'},site:{id:'site'},catalog:{projects:[],categories:[],loose:[]},operations:data()});
 let connectRelease,loads=0,failCatalogue=false,failOperations=false;const connected=new Promise(r=>connectRelease=r);class Graph{async connect(){await connected;this.site={id:'site'};this.drive={id:'drive'};}async request(){return {id:'worker',displayName:'Worker',mail:'worker'};}async projects(){if(failCatalogue)throw Error('Catalogue indisponible');return {projects:[],categories:[],loose:[]};}}
 class UI extends OpsUI{constructor(ctx){super(ctx);this.repo={init:async()=>{},loadAll:async()=>{loads++;if(failOperations)throw Error('Network down');return data();}};}}
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','').replace("const {OpsUI}=await import('./lib/ops-ui.js?v=3.4.2');",'').replace('init().catch(err);','');source+='\nconfig=TEST_CONFIG;globalThis.hooks={connectCloud,resumeCloud,reconnectReport,prepareAppointmentWrite,ensureReportReady,setAuth:value=>msal=value,getUI:()=>opsUI};';
 const context=vm.createContext({TEST_CONFIG:config,acquireSessionToken,requiresInteractiveAuth,CloudError,ReportRecovery,installResumeSync,localStorage:dom.window.localStorage,WarmCache,OpsUI:UI,Graph,Journal:class{},LocalStore:Store,CATEGORIES:[],norm:s=>s,structuredClone,URL,URLSearchParams,location:dom.window.location,history:dom.window.history,document:dom.window.document,window:dom.window,navigator:{onLine:true},console,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout});vm.runInContext(source,context);
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
