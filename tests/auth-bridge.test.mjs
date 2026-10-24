import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../auth.html',import.meta.url),'utf8');
const bridge=await readFile(new URL('../node_modules/@azure/msal-browser/lib/redirect-bridge/msal-redirect-bridge.js',import.meta.url),'utf8');
const entry=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import \{broadcastResponseToMainFrame\} from '.\/vendor\/msal-bridge.js';/,'');
function fixture(interactionType,path='/'){
 const state=Buffer.from(JSON.stringify({id:'request-channel',meta:{interactionType}})).toString('base64url');
 const payload=`code=example-code&state=${state}`;
 const dom=new JSDOM(html,{url:`https://opus.example/auth.html#${payload}`});
 const messages=[],navigations=[],errors=[];let closed=false;
 dom.window.close=()=>{closed=true;};
 dom.window.sessionStorage.setItem('msal.interaction.status',JSON.stringify({clientId:'opus-client',type:'signin'}));
 dom.window.sessionStorage.setItem('msal.opus-client.request.origin',`https://opus.example${path}`);
 const context=vm.createContext({window:dom.window,document:dom.window.document,URLSearchParams,TextDecoder,Uint8Array,atob,setTimeout,clearTimeout,console:{error:(...args)=>errors.push(args)},BroadcastChannel:class{
  constructor(name){this.name=name;}
  postMessage(data){messages.push({channel:this.name,...data});}
  close(){}
 }});
 vm.runInContext(bridge,context);
 context.broadcastResponseToMainFrame=()=>context.msalRedirectBridge.broadcastResponseToMainFrame({navigateInternal:async(url,options)=>{navigations.push({url,options});return true;}});
 return {context,dom,payload,messages,navigations,errors,isClosed:()=>closed};
}
test('auth callback uses only the MSAL 5 bridge, without a competing MSAL client',async()=>{
 assert.match(html,/import \{broadcastResponseToMainFrame\} from '.\/vendor\/msal-bridge.js'/);
 assert.doesNotMatch(entry,/PublicClientApplication|handleRedirectPromise|location\.replace|fetch\(/);
});
for(const flow of ['silent','popup'])test(`real MSAL bridge broadcasts ${flow} response without booting or navigating app`,async()=>{
 const f=fixture(flow);await vm.runInContext(entry,f.context);
 assert.equal(f.errors.length,0,String(f.errors[0]?.[1]?.stack));assert.equal(f.navigations.length,0);assert.equal(f.messages.length,1);
 assert.equal(f.messages[0].channel,'request-channel');assert.equal(f.messages[0].payload,f.payload);assert.equal(f.messages[0].v,1);
 assert.equal(f.dom.window.location.hash,'');assert.equal(f.isClosed(),true);
});
for(const path of ['/#chantier=test&tab=overview','/commandes/'])test(`real MSAL bridge returns interactive login to ${path}`,async()=>{
 const f=fixture('redirect',path);await vm.runInContext(entry,f.context);
 assert.equal(f.errors.length,0,String(f.errors[0]?.[1]?.stack));assert.equal(f.messages.length,0);assert.equal(f.navigations.length,1);
 assert.equal(f.navigations[0].url,`https://opus.example${path}`);
 assert.equal(f.dom.window.sessionStorage.getItem('msal.opus-client.urlHash'),f.payload);
 assert.equal(f.isClosed(),false);
});
