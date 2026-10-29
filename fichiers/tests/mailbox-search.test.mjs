import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {buildMessageQuery,supplierOf} from '../commandes/outlook.js';
const params=options=>new URL(buildMessageQuery(options),'https://graph.microsoft.com/v1.0/').searchParams;
test('supplier search is sent to Outlook, includes Difam and CDO, and is not limited to loaded mail',()=>{
 for(const supplier of ['Rexel','YESSS','Difam','CDO']){const p=params({supplier});assert.equal(p.get('$search'),JSON.stringify('from:'+supplier));assert.equal(p.has('$orderby'),false);assert.equal(p.has('$filter'),false);}
 assert.equal(supplierOf({from:{emailAddress:{address:'commandes@difam.fr'}}}),'Difam');assert.equal(supplierOf({from:{emailAddress:{address:'contact@cdo.fr'}}}),'CDO');
 const p=params({query:'Nouveau fournisseur'});assert.equal(p.get('$search'),JSON.stringify('Nouveau fournisseur'));assert.equal(p.get('$top'),'50');
});
test('date restrictions are optional and both ends are validated before querying',()=>{
 const all=params({});assert.equal(all.has('$filter'),false);assert.equal(all.has('$search'),false);assert.equal(all.get('$orderby'),'receivedDateTime desc');
 assert.match(params({query:'Difam',since:'2026-01-01',until:'2026-10-29'}).get('$search'),/received>=01\/01\/2026 AND received<=10\/29\/2026/);
 assert.match(params({until:'2026-10-29'}).get('$filter'),/receivedDateTime lt 2026-10-30T00:00:00.000Z/);
 assert.throws(()=>buildMessageQuery({since:'2026-10-30',until:'2026-10-29'}),/date de fin/);assert.throws(()=>buildMessageQuery({since:'2026-02-30'}),/date valide/);
});
test('query text cannot inject URL parameters or disclose a token to a foreign endpoint',()=>{
 const url=new URL(buildMessageQuery({query:'Difam &$top=999 # "test"'}),'https://graph.microsoft.com/v1.0/');assert.equal(url.hostname,'graph.microsoft.com');assert.equal(url.searchParams.get('$top'),'50');assert.equal(url.hash,'');assert.match(url.searchParams.get('$search'),/Difam/);
});
async function fixture(t){
 const dom=new JSDOM('<section id="host"></section>',{url:'https://opus.test/commandes/'}),document=dom.window.document;
 const calls=[],state={messages:[{id:'m1',subject:'Commande de fournisseur inconnu',bodyPreview:'Voir document',receivedDateTime:'2020-01-01',from:{emailAddress:{address:'achat@nouveau.example'}}}],next:'',imports:0};
 class Client{async initialize(){}async loginPopup(){return {account:{username:'opuselec@hotmail.com'}};}async acquireTokenSilent(){return {accessToken:'test-token'};}async clearCache(){}}
 const fakeFetch=async(url,options)=>{calls.push({url,options});const u=new URL(url);let body;
 if(u.pathname.endsWith('/me'))body={mail:'opuselec@hotmail.com'};
 else if(u.pathname.endsWith('/messages/m1'))body={...state.messages[0],body:{contentType:'text',content:'Articles de la commande'},hasAttachments:false};
 else body={value:state.messages,...(state.next?{'@odata.nextLink':state.next}:{})};
 return {ok:true,json:async()=>body};};
 let source=await readFile(new URL('../commandes/outlook.js',import.meta.url),'utf8');source=source.replace(/^export /gm,'').replace("await import('../vendor/msal.js')","await Promise.resolve(TEST_MSAL)").replaceAll('import.meta.url',JSON.stringify('https://opus.test/commandes/outlook.js'));source+='\nglobalThis.mount=mountOutlook;';
 const context=vm.createContext({TEST_MSAL:{PublicClientApplication:Client},document,localStorage:dom.window.localStorage,URL,URLSearchParams,AbortSignal,fetch:fakeFetch,Date,console,Blob,Uint8Array,atob,confirm:()=>true});vm.runInContext(source,context);
 const host=document.getElementById('host');const instance=context.mount({host,authorize:async()=>{},download(){},onImport:()=>{state.imports++;}});instance.show(true);
 host.querySelector('#mailClient').value='11111111-1111-1111-1111-111111111111';await host.querySelector('#mailConnect').onclick();calls.length=0;t.after(()=>dom.window.close());
 return {dom,document,host,instance,calls,state,search:()=>host.querySelector('#mailRefresh').onclick()};
}
test('unknown suppliers and old messages are shown and each new search reaches the mailbox',async t=>{
 const h=await fixture(t);assert.equal(h.host.querySelector('#mailSince').value,'');h.host.querySelector('#mailSearch').value='Difam';await h.search();
 assert.match(new URL(h.calls[0].url).searchParams.get('$search'),/Difam/);assert.match(h.host.querySelector('#mailList').textContent,/nouveau.example/);assert.match(h.host.querySelector('#mailList').textContent,/2020/);assert.equal(h.state.imports,0);
 h.host.querySelector('#mailSearch').value='CDO';await h.search();assert.equal(h.calls.length,2);assert.match(new URL(h.calls[1].url).searchParams.get('$search'),/CDO/);
});
test('server search results matching the full body are not filtered out by the preview or sender',async t=>{
 const h=await fixture(t);h.host.querySelector('#mailSupplier').value='Difam';await h.host.querySelector('#mailSupplier').onchange();assert.equal(h.host.querySelectorAll('#mailList button').length,1);
 await h.host.querySelector('#mailList button').onclick();assert.match(h.host.querySelector('#mailBody').textContent,/Articles de la commande/);assert.equal(h.state.imports,0);
 await h.host.querySelector('#mailUse').onclick();assert.equal(h.state.imports,1);assert.equal(h.host.hidden,true);
});
test('pagination follows the server link and an invalid date retains the previous result without a request',async t=>{
 const h=await fixture(t);h.state.next='https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next';await h.search();assert.equal(h.host.querySelector('#mailMore').hidden,false);h.state.next='';h.state.messages=[{...h.state.messages[0],id:'m2'}];await h.host.querySelector('#mailMore').onclick();assert.match(h.calls[1].url,/skiptoken=next/);assert.equal(h.host.querySelectorAll('#mailList button').length,2);
 h.host.querySelector('#mailSince').value='2026-10-30';h.host.querySelector('#mailUntil').value='2026-10-29';await h.search();assert.equal(h.calls.length,2);assert.match(h.host.querySelector('#mailStatus').textContent,/date de fin/);assert.equal(h.host.querySelectorAll('#mailList button').length,2);
});

test('switching order tabs and searching mail preserve the current bon and its approval',async t=>{
 const dom=new JSDOM(await readFile(new URL('../commandes/index.html',import.meta.url),'utf8'),{url:'https://opus.test/commandes/'}),document=dom.window.document;t.after(()=>dom.window.close());
 let source=await readFile(new URL('../commandes/app.js',import.meta.url),'utf8');source=source.replace(/^import .*;\n/gm,'').replace('connectionReady=init().catch','connectionReady=Promise.resolve().catch').replaceAll('import.meta.url',JSON.stringify('https://opus.test/commandes/app.js'));source+='\noutlook={show:force=>document.getElementById("outlookPage").hidden=!force};globalThis.selectTab=selectOrderTab;';
 const context=vm.createContext({document,window:dom.window,navigator:{},location:dom.window.location,sessionStorage:dom.window.sessionStorage,URL,setTimeout,clearTimeout,console});vm.runInContext(source,context);
 document.getElementById('number').value='Commande existante';document.getElementById('approved').checked=true;
 for(const name of ['mail','depot','supplier']){context.selectTab(name);assert.equal(document.getElementById('outlookPage').hidden,name!=='mail');assert.equal(document.getElementById('depotPage').hidden,name!=='depot');assert.equal(document.getElementById('supplierPage').hidden,name!=='supplier');}
 const search=document.createElement('input');document.getElementById('outlookPage').append(search);search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(document.getElementById('approved').checked,true);assert.equal(document.getElementById('number').value,'Commande existante');
 document.getElementById('number').dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(document.getElementById('approved').checked,false);
});
