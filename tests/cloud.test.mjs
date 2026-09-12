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
 const calls=[];const size=10*327680+23;
 const g=new Graph(async()=>'test-token',async(u,o)=>{calls.push([u,o]);if(u.startsWith('https://graph.microsoft.com/'))return new Response(JSON.stringify({uploadUrl:'https://upload.example/session'}));if(calls.length===2)return new Response(JSON.stringify({nextExpectedRanges:['3276800-']}),{status:202});return new Response(JSON.stringify({id:'confirmed',name:'source.json'}),{status:201});});g.drive={id:'test'};
 const r=await g.upload('folder','source.json',new Blob([new Uint8Array(size)]));
 assert.equal(r.id,'confirmed');assert.equal(calls[1][1].headers['Content-Range'],`bytes 0-3276799/${size}`);
 assert.equal(calls[2][1].headers['Content-Range'],`bytes 3276800-${size-1}/${size}`);
 assert.equal(calls[1][1].headers.Authorization,undefined);
 assert.equal(JSON.parse(calls[0][1].body).item['@microsoft.graph.conflictBehavior'],'rename');
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
