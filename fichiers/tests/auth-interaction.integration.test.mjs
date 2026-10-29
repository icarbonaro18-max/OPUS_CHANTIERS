import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {CloudError} from '../lib/cloud.js';
import {acquireSessionToken,requiresInteractiveAuth,runAuthInteraction,selectSessionAccount} from '../lib/auth-session.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const turn=()=>new Promise(r=>setImmediate(r));
async function fixture(t){
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://opus.example/'}),document=dom.window.document;
 document.getElementById('modal').showModal=function(){this.open=true;};document.getElementById('modal').close=function(){this.open=false;};
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'').replace('installAddressSuggestions();','').replace('init().catch(err);','').replace("await import('./vendor/msal.js')","await Promise.resolve(TEST_MODULE)");
 source+='\nconfig={clientId:"client",tenant:"tenant",scopes:["User.Read"],adminUsers:[]};globalThis.hooks={authInit,login,reconnectReport,recoverAuth,logoutCurrent,getMsal:()=>msal,setClient:value=>msal=value,setModule:value=>TEST_MODULE=value,configure:({client,graph,ui,owner="owner"})=>{msal=client;g=graph;opsUI=ui;appAccount=owner;user={id:"tech",mail:"tech@example.test"};cloudReady=true;},setLive:value=>live=value,setCapture:fn=>requestFrame=fn,setConnect:fn=>connectCloud=fn};';
 const context=vm.createContext({TEST_MODULE:{},runAuthInteraction,selectSessionAccount,acquireSessionToken,requiresInteractiveAuth,CloudError,installResumeSync:()=>{},
 document,window:dom.window,navigator:{onLine:true},localStorage:dom.window.localStorage,location:dom.window.location,history:dom.window.history,URL,URLSearchParams,structuredClone,
 console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){}});vm.runInContext(source,context);
 t.after(()=>{clearTimeout(dom.window.toastTimer);dom.window.close();});
 return {dom,document,hooks:context.hooks,context};
}
const currentSession=(h,client,graph={readOnlyCache:false,accessToken:async()=>'token'})=>{
 h.document.getElementById('modal').open=true;
 const ui={hasLoadedRemote:true,cacheMode:false,needsRefresh:false,dataLoadError:null};h.hooks.configure({client,graph,ui});return ui;
};

test('login awaits the singleton initialization and redirect callback before starting Microsoft',async t=>{
 const h=await fixture(t),ready=deferred(),trace=[];let instances=0;
 class Client{constructor(){instances++;}async initialize(){trace.push('init');await ready.promise;}async handleRedirectPromise(){trace.push('callback');return null;}getAllAccounts(){return [];}getActiveAccount(){return null;}async loginRedirect(){trace.push('login');}}
 h.hooks.setModule({PublicClientApplication:Client});const initializing=h.hooks.authInit();await turn();const login=h.hooks.login();await turn();assert.deepEqual(trace,['init']);assert.equal(instances,1);
 ready.resolve();await Promise.all([initializing,login]);assert.deepEqual(trace,['init','callback','login']);assert.equal(instances,1);
});

test('double reconnect and sign-out cannot start another interaction while a popup is open',async t=>{
 const h=await fixture(t),popup=deferred();let popups=0,logouts=0;const account={homeAccountId:'owner'};
 const client={getActiveAccount:()=>account,setActiveAccount(){},acquireTokenPopup:async()=>{popups++;return popup.promise;},logoutRedirect:async()=>logouts++};
 currentSession(h,client,{readOnlyCache:false,accessToken:async()=>{throw new CloudError('renew',401,'auth_required');}});
 const first=h.hooks.reconnectReport();await turn();assert.equal(popups,1);
 await assert.rejects(h.hooks.reconnectReport(),e=>e.code==='auth_busy');await assert.rejects(h.hooks.logoutCurrent(),e=>e.code==='auth_busy');assert.equal(logouts,0);
 popup.resolve({account});await first;assert.equal(popups,1);
});

test('explicit repair persists an open attestation before using the supported MSAL override',async t=>{
 const h=await fixture(t),trace=[],account={homeAccountId:'owner'};let request;
 const client={getActiveAccount:()=>account,setActiveAccount(){},acquireTokenPopup:async value=>{trace.push('popup');request=value;return {account};}};
 currentSession(h,client);h.hooks.setLive({recordId:'attestation'});
 h.hooks.setCapture(async()=>{trace.push('capture');});await h.hooks.recoverAuth();
 assert.equal(request.overrideInteractionInProgress,true);assert.equal(request.account,account);assert.deepEqual(trace,['capture','popup']);
});

test('repair cannot sign a report into a different account',async t=>{
 const h=await fixture(t),owner={homeAccountId:'owner'},other={homeAccountId:'other'};let selected=null,graphCalls=0;
 const client={getActiveAccount:()=>owner,getAllAccounts:()=>[owner,other],setActiveAccount:a=>selected=a,acquireTokenPopup:async()=>({account:other})};
 currentSession(h,client,{readOnlyCache:false,accessToken:async()=>{graphCalls++;return 'token';}});
 await assert.rejects(h.hooks.recoverAuth(),/même compte Microsoft/);assert.equal(selected,owner);assert.equal(graphCalls,0);
});

test('repair and sign-out stop when the local draft cannot be persisted',async t=>{
 const h=await fixture(t);let calls=0;const account={homeAccountId:'owner'},client={getActiveAccount:()=>account,acquireTokenPopup:async()=>calls++,logoutRedirect:async()=>calls++};
 const ui=currentSession(h,client);ui.activeReportRecovery={flush:async()=>{throw Error('Stockage local plein');}};
 await assert.rejects(h.hooks.recoverAuth(),/Stockage local plein/);await assert.rejects(h.hooks.logoutCurrent(),/Stockage local plein/);assert.equal(calls,0);
});
