import test from 'node:test';
import assert from 'node:assert/strict';
import {Graph,Journal,revisionName,parseRevision,revisionHeads,CloudError} from '../lib/cloud.js';
const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),D='d'.repeat(32);
const rev=(id,parents=[])=>({id,name:revisionName(id,parents),createdDateTime:'2026-01-01T00:00:00Z'});
test('immutable revision: ancestry, concurrent heads and explicit resolution',()=>{
 assert.deepEqual(parseRevision(rev(B,[A])).parents,[A]);
 assert.equal(parseRevision({name:'chantier.json'}),null);
 assert.equal(revisionHeads([rev(A),rev(B,[A])])[0].revision,B);
 assert.deepEqual(new Set(revisionHeads([rev(A),rev(B,[A]),rev(C,[A])]).map(x=>x.revision)),new Set([B,C]));
 assert.equal(revisionHeads([rev(A),rev(B,[A]),rev(C,[A]),rev(D,[B,C])])[0].revision,D);
});
test('pagination follows Microsoft nextLink, no arbitrary outbound token',async()=>{
 const calls=[];const g=new Graph(async()=>'test-token',async(u,o)=>{calls.push([u,o]);return new Response(JSON.stringify(calls.length===1?{value:[{id:1}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/test?next=2'}:{value:[{id:2}]}));});
 assert.equal((await g.all('/test')).length,2);assert.equal(calls.length,2);
 assert.equal(calls[0][1].headers.Authorization,'Bearer test-token');
 await assert.rejects(()=>g.request('https://evil.example/take-token'),/non autorisée/);
});
test('upload ranges are multiples of 320 KiB, URL is preauthorized without bearer',async()=>{
 const calls=[];const size=13*327680+23;
 const g=new Graph(async()=>'test-token',async(u,o)=>{calls.push([u,o]);
  if(u.includes(':/source.json')&&(!o.method||o.method==='GET'))return new Response(JSON.stringify({error:{message:'not found'}}),{status:404});
  if(u.includes('/createUploadSession'))return new Response(JSON.stringify({uploadUrl:'https://upload.example/session'}));
  const putCalls=calls.filter(([url,opts])=>url==='https://upload.example/session'&&opts.method==='PUT');
  if(putCalls.length===1)return new Response(JSON.stringify({nextExpectedRanges:['3276800-']}),{status:202});
  return new Response(JSON.stringify({id:'confirmed',name:'source.json'}),{status:201});
 });g.drive={id:'test'};
 const r=await g.upload('folder','source.json',new Blob([new Uint8Array(size)]));
 assert.equal(r.id,'confirmed');
 const sessionCall=calls.find(([u])=>u.includes('/createUploadSession'));assert.equal(JSON.parse(sessionCall[1].body).item['@microsoft.graph.conflictBehavior'],'rename');
 const puts=calls.filter(([u,o])=>u==='https://upload.example/session'&&o.method==='PUT');
 assert.equal(puts[0][1].headers['Content-Range'],`bytes 0-3276799/${size}`);
 assert.equal(puts[1][1].headers['Content-Range'],`bytes 3276800-${size-1}/${size}`);
 assert.equal(puts[0][1].headers.Authorization,undefined);
});
test('small JSON/PDF uses direct Graph content upload',async()=>{
 const calls=[];const g=new Graph(async()=>'t',async(u,o)=>{calls.push([u,o]);if((!o.method||o.method==='GET')&&u.includes(':/record.json'))return new Response(JSON.stringify({error:{message:'missing'}}),{status:404});return new Response(JSON.stringify({id:'ok',name:'record.json'}),{status:201,headers:{'Content-Type':'application/json'}});});g.drive={id:'d'};
 const r=await g.upload('folder','record.json',new Blob(['{}'],{type:'application/json'}),()=>{},true);assert.equal(r.id,'ok');
 const put=calls.find(([,o])=>o.method==='PUT');assert.ok(put[0].endsWith(':/record.json:/content'));assert.equal(put[1].headers['Content-Type'],'application/json');
});

test('deleting an item uses Microsoft Graph DELETE',async()=>{
 let seen;const g=new Graph(async()=>'t',async(u,o)=>{seen=[u,o];return new Response(null,{status:204});});g.drive={id:'d'};await g.deleteItem('item42');assert.equal(seen[1].method,'DELETE');assert.ok(seen[0].includes('/items/item42'));
});
test('moving a project uses the current ETag',async()=>{
 let opts;const g=new Graph(async()=>'t',async(u,o)=>{opts=o;return new Response('{}');});g.drive={id:'d'};
 await g.moveProject({id:'p',eTag:'etag'}, {id:'new'});assert.equal(opts.headers['If-Match'],'etag');assert.equal(opts.method,'PATCH');
});
class MemoryGraph{
 constructor(){this.items=new Map();this.n=0;this.drive={id:'demo'};}
 async named(parent,name){return [...this.items.values()].find(i=>i.parent===parent&&i.name===name)||null;}
 async folder(parent,name){const old=await this.named(parent,name);if(old)return old;const f={id:String(++this.n),parent,name,folder:{}};this.items.set(f.id,f);return f;}
 async children(parent){return [...this.items.values()].filter(i=>i.parent===parent);}
 async upload(parent,name,blob){assert.equal(await this.named(parent,name),null,'No overwriting any file');const f={id:String(++this.n),parent,name,blob,file:{},createdDateTime:new Date().toISOString()};this.items.set(f.id,f);return f;}
 async bytes(id){return this.items.get(id).blob;}async json(id){return JSON.parse(await(await this.bytes(id)).text());}
}
test('two technicans retain both branches, repeat-save is idempotent',async()=>{
 const g=new MemoryGraph(),j=new Journal(g),user={id:'tech',displayName:'Technicien'};
 const make=(revision,parents,note)=>({projectId:'job',kind:'attestations',recordId:'form',revision,parents,createdAt:'2026-01-01',payload:{moduleKey:'baes',state:{note}}});
 await j.save(make(A,[],'initial'),user);await j.save(make(B,[A],'tech B'),user);await j.save(make(C,[A],'tech C'),user);
 let r=await j.load('job','attestations','form');assert.equal(r.heads.length,2);
 const before=g.items.size;await j.save(make(C,[A],'tech C'),user);assert.equal(before,g.items.size);
 await j.save(make(D,[B,C],'reviewed by bureau'),user);r=await j.load('job','attestations','form');assert.equal(r.heads.length,1);assert.equal(r.data.state.note,'reviewed by bureau');assert.equal(r.files.length,4);
});
test('image assets stored separately, once, and referenced by item ID',async()=>{
 const g=new MemoryGraph(),j=new Journal(g);const data='data:image/png;base64,iVBORw0KGgo=';
 const a=await j.pack({photos:[data,data],signature:data},'job');
 assert.ok(a.photos[0].$opusAsset.id);assert.equal(a.photos[0].$opusAsset.id,a.photos[1].$opusAsset.id);assert.equal(a.signature.$opusAsset.id,a.photos[0].$opusAsset.id);
 assert.equal([...g.items.values()].filter(i=>i.file).length,1);
});
test('parallel Graph reads share one pending token acquisition',async()=>{
 let calls=0,release;const ready=new Promise(r=>release=r);
 const graph=new Graph(async()=>{calls++;await ready;return 'test-token';},async()=>new Response(JSON.stringify({id:'ok'})));
 const requests=[graph.request('/me'),graph.request('/me'),graph.request('/me')];
 await Promise.resolve();await Promise.resolve();assert.equal(calls,1);release();await Promise.all(requests);
});
test('a timed out Graph request does not start two more long retries',async()=>{
 let calls=0;const graph=new Graph(async()=>'test-token',async()=>{calls++;throw Object.assign(Error('timeout'),{name:'TimeoutError'});});
 await assert.rejects(graph.request('/me'),e=>e.code==='network_timeout');assert.equal(calls,1);
});

test('a hung token acquisition times out and a later request can renew',async()=>{
 let calls=0;const graph=new Graph(async()=>{calls++;return calls===1?new Promise(()=>{}):'new-token';},async()=>new Response('{}'));
 graph.tokenTimeoutMs=10;
 await assert.rejects(graph.request('/me'),e=>e.code==='token_timeout');
 await graph.request('/me');assert.equal(calls,2);
});
test('a late timed-out token cannot clear a newer pending acquisition',async()=>{
 let calls=0,finishOld,finishNew;
 const graph=new Graph(()=>{calls++;return new Promise(resolve=>{if(calls===1)finishOld=resolve;else finishNew=resolve;});});graph.tokenTimeoutMs=10;
 await assert.rejects(graph.accessToken(),e=>e.code==='token_timeout');graph.tokenTimeoutMs=1000;
 const newer=graph.accessToken();await Promise.resolve();finishOld('old');await Promise.resolve();await Promise.resolve();
 const shared=graph.accessToken();finishNew('new');assert.equal(await newer,'new');assert.equal(await shared,'new');assert.equal(calls,2);
});
test('an explicit Graph 401 silently renews once and replays rejected write with same ETag',async()=>{
 const tokens=[],sent=[];const graph=new Graph(async options=>{tokens.push(options);return options.forceRefresh?'fresh':'expired';},async(url,options)=>{
  sent.push(options);return options.headers.Authorization==='Bearer expired'?new Response('{"error":{"code":"InvalidAuthenticationToken"}}',{status:401}):new Response('{"id":"saved"}');
 });
 const r=await graph.request('/record',{method:'PUT',headers:{'If-Match':'v1'},body:{note:'keep'}});
 assert.equal(r.id,'saved');assert.deepEqual(tokens,[{forceRefresh:false},{forceRefresh:true}]);assert.equal(sent.length,2);assert.equal(sent[1].headers['If-Match'],'v1');assert.equal(sent[1].body,sent[0].body);
});
test('repeated 401 stops after one renewal; a forbidden operation does not renew',async()=>{
 let requests=0,tokens=0;const graph=new Graph(async()=>{tokens++;return 't';},async()=>{requests++;return new Response('{}',{status:401});});
 await assert.rejects(graph.request('/me'),e=>e.code==='auth_required');assert.equal(requests,2);assert.equal(tokens,2);
 requests=0;tokens=0;graph.fetcher=async()=>{requests++;return new Response('{}',{status:403});};
 await assert.rejects(graph.request('/me'),e=>e.status===403&&e.code!=='auth_required');assert.equal(requests,1);assert.equal(tokens,1);
});
test('uncertain write failure is not replayed after network drop or server error',async()=>{
 for(const failure of [()=>{throw new TypeError('lost response');},()=>new Response('{}',{status:503})]){
  let calls=0;const graph=new Graph(async()=>'t',async()=>{calls++;return failure();});
  await assert.rejects(graph.request('/children',{method:'POST',body:{name:'one folder'}}));assert.equal(calls,1);
 }
});
test('token failures are not treated as retryable HTTP transport failures',async()=>{
 let calls=0,fetches=0;const graph=new Graph(async()=>{calls++;throw Object.assign(Error('temporarily unavailable'),{code:'token_unavailable',status:0});},async()=>{fetches++;return new Response('{}');});
 await assert.rejects(graph.request('/me'),e=>e.code==='token_unavailable');assert.equal(calls,1);assert.equal(fetches,0);
});
