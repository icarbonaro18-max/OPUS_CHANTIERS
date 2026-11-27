import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const digest=body=>createHash('sha256').update(body).digest('base64');
const scope='https://opus.example/OPUS/';
const prefix='opus-chantiers-shell:'+scope+':';
const source=await readFile(new URL('../sw.js',import.meta.url),'utf8');

test('the published worker pins every asset from the complete legacy precache list',async()=>{
 const site=new URL('../_site/',import.meta.url);
 const manifest=await readFile(new URL('precache-integrity.json',site),'utf8');
 const worker=await readFile(new URL('sw.js',site),'utf8');
 const paths=JSON.parse(await readFile(new URL('precache.json',site),'utf8'));
 const hashes=JSON.parse(manifest);
 assert.ok(worker.includes('const BUILD='+JSON.stringify({hash:digest(manifest),assets:hashes})+';'));
 assert.deepEqual(Object.keys(hashes).sort(),paths.sort());
 for(const path of paths)assert.equal(hashes[path],digest(await readFile(new URL(path,site))),path);
 assert.ok(paths.includes('./vendor/pdf.worker.mjs'));
 assert.ok(paths.includes('./index.html'));
 assert.ok(!paths.includes('./auth.html'));
});

function harness(){
 const bodies=new Map([['./index.html','release'],['./lib/shared.js','unchanged'],['./vendor/pdf.mjs','pdf']]);
 const manifest=JSON.stringify(Object.fromEntries([...bodies].map(([path,body])=>[path,digest(body)])));
 const names=new Map(),handlers={},requests=[];
 const caches={
  keys:async()=>[...names.keys()],
  delete:async name=>names.delete(name),
  async open(name){
   if(!names.has(name))names.set(name,new Map());
   const values=names.get(name);
   return {
    match:async url=>{const body=values.get(String(url));if(body instanceof Error)throw body;return body===undefined?undefined:new Response(body);},
    put:async(url,response)=>values.set(String(url),await response.text())
   };
  }
 };
 const files=new Map(bodies);
 const worker=source.replace('const BUILD=null;','const BUILD='+JSON.stringify({hash:digest(manifest),assets:JSON.parse(manifest)})+';');
 vm.runInNewContext(worker,{URL,crypto:webcrypto,btoa,caches,self:{registration:{scope},addEventListener:(key,f)=>{handlers[key]=f;},clients:{claim:async()=>{}}},fetch:async url=>{
  const key='./'+String(url).slice(scope.length);
  requests.push(key);
  return files.has(key)?new Response(files.get(key)):new Response('',{status:404});
 }});
 const trigger=type=>{let result;handlers[type]({waitUntil:promise=>{result=promise;}});return result;};
 return {files,names,requests,trigger};
}

test('an update verifies a legacy shell, fetches just the changed body, and leaves other apps alone',async()=>{
 const f=harness(),absolute=path=>new URL(path,scope).href;
 const old=new Map([[absolute('index.html'),'old home'],[absolute('lib/shared.js'),'unchanged'],[absolute('vendor/pdf.mjs'),'pdf']]);
 f.names.set(prefix+'legacy',old);
 f.names.set('another-app',new Map([[absolute('index.html'),'release']]));
 await f.trigger('install');
 assert.deepEqual(f.requests,['./index.html']);
 assert.equal(old.get(absolute('index.html')),'old home');
 const name=[...f.names.keys()].find(n=>n.startsWith(prefix)&&n!==prefix+'legacy');
 assert.deepEqual(Object.fromEntries(f.names.get(name)),{
  [absolute('index.html')]:'release',[absolute('lib/shared.js')]:'unchanged',[absolute('vendor/pdf.mjs')]:'pdf'
 });
 await f.trigger('activate');
 assert.ok(f.names.has(name));assert.ok(f.names.has('another-app'));assert.ok(!f.names.has(prefix+'legacy'));
});

test('a stale deployment or interrupted download leaves the installed version usable and retries only missing bytes',async()=>{
 const f=harness(),absolute=path=>new URL(path,scope).href;
 const legacy=new Map([[absolute('index.html'),'old home'],[absolute('vendor/pdf.mjs'),new Error('Unreadable local entry')]]);
 f.names.set(prefix+'legacy',legacy);
 f.files.set('./vendor/pdf.mjs','unexpected bytes');
 await assert.rejects(f.trigger('install'),/vendor\/pdf/);
 assert.equal(legacy.get(absolute('index.html')),'old home');
 f.files.set('./vendor/pdf.mjs','pdf');
 f.requests.length=0;
 await f.trigger('install');
 assert.deepEqual(f.requests,['./vendor/pdf.mjs']);
});

test('the installed shell serves nested public entry points and transitive imports while offline',async()=>{
 const worker=await readFile(new URL('../_site/sw.js',import.meta.url),'utf8');
 const handlers={},matched=[];
 const cache={async match(url){matched.push(url.href);return new Response('cached');}};
 vm.runInNewContext(worker,{URL,Response,caches:{open:async()=>cache},fetch:()=>assert.fail('offline'),self:{
  registration:{scope},addEventListener:(name,handler)=>{handlers[name]=handler;}
 }});
 function route(path){
  let result;
  handlers.fetch({request:new Request(new URL(path,scope)),respondWith:value=>{result=value;}});
  return result;
 }
 for(const [requested,expected] of [
  ['./','index.html'],['commandes/outlook.js?v=1','commandes/outlook.js'],
  ['commandes/','commandes/index.html'],['planning/','planning/index.html'],['modules/baes/','modules/baes/index.html']
 ]){
  assert.equal(await (await route(requested)).text(),'cached');
  assert.equal(matched.at(-1),new URL(expected,scope).href);
 }
 for(const path of ['auth.html?code=123','commandes/outlook-auth.html','api/planning-reader','lib/private.json',
  'commandes/customer.pdf','planning/private.json','_OPUS_SYSTEM/people.json','https://graph.microsoft.com/v1.0/me']){
  assert.equal(route(path),undefined,path);
 }
});
