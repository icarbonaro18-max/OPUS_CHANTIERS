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
 let connectRelease,loads=0;const connected=new Promise(r=>connectRelease=r);class Graph{async connect(){await connected;this.site={id:'site'};this.drive={id:'drive'};}async request(){return {id:'worker',displayName:'Worker',mail:'worker'};}async projects(){return {projects:[],categories:[],loose:[]};}}
 class UI extends OpsUI{constructor(ctx){super(ctx);this.repo={init:async()=>{},loadAll:async()=>{loads++;return data();}};}}
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','').replace("const {OpsUI}=await import('./lib/ops-ui.js?v=3.4.2');",'').replace('init().catch(err);','');source+='\nconfig=TEST_CONFIG;globalThis.hooks={connectCloud,resumeCloud,reconnectReport,setAuth:value=>msal=value,getUI:()=>opsUI};';
 const context=vm.createContext({TEST_CONFIG:config,CloudError,ReportRecovery,installResumeSync,localStorage:dom.window.localStorage,WarmCache,OpsUI:UI,Graph,Journal:class{},LocalStore:Store,CATEGORIES:[],norm:s=>s,structuredClone,URL,URLSearchParams,location:dom.window.location,history:dom.window.history,document:dom.window.document,window:dom.window,navigator:{onLine:true},console,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout});vm.runInContext(source,context);
 await context.hooks.connectCloud({homeAccountId:'account-a'});assert.ok(document.querySelector('.hourGrid'));assert.equal(context.hooks.getUI().cacheMode,true);assert.equal(loads,0);assert.match(document.getElementById('syncNotice').textContent,/mémorisées/);
 connectRelease();await context.hooks.resumeCloud();assert.equal(loads,1);assert.equal(context.hooks.getUI().cacheMode,false);assert.equal(document.getElementById('syncNotice').hidden,true);
 // The real reconnect path must finish local persistence before a Microsoft redirect.
 let persisted=false,redirects=0;context.hooks.getUI().activeReportRecovery={flush:async()=>{persisted=true;}};
 context.hooks.setAuth({getActiveAccount:()=>({homeAccountId:'account-a'}),acquireTokenSilent:async()=>{throw Error('expired');},loginRedirect:async()=>{assert.equal(persisted,true);redirects++;}});
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
