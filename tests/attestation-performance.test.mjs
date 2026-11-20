import test from 'node:test';
import assert from 'node:assert/strict';
import {Journal,revisionName,revisionHeads,CloudError} from '../lib/cloud.js';
const id=n=>n.toString(16).padStart(32,'0');
const file=(n,parents=[])=>({id:id(n),name:revisionName(id(n),parents.map(id)),createdDateTime:new Date(n*1000).toISOString()});
class MemoryGraph{
 constructor(){this.items=new Map();this.next=1000;this.reads=[];this.deletes=[];}
 async named(parent,name){return [...this.items.values()].find(i=>i.parent===parent&&i.name===name)||null;}
 async folder(parent,name){const found=await this.named(parent,name);if(found)return found;const row={id:String(++this.next),parent,name,folder:{}};this.items.set(row.id,row);return row;}
 async children(parent){return [...this.items.values()].filter(i=>i.parent===parent);}
 async upload(parent,name,blob){assert.equal(await this.named(parent,name),null);const row={id:String(++this.next),name,parent,blob,file:{},createdDateTime:new Date(this.next*1000).toISOString()};this.items.set(row.id,row);return row;}
 async json(id,known){this.reads.push([id,known]);return JSON.parse(await this.items.get(id).blob.text());}
 async deleteItem(id){this.deletes.push(id);this.items.delete(id);}
}
const draft=(n,parents=[],note='test')=>({projectId:'project',kind:'attestations',recordId:'form',revision:id(n),parents:parents.map(id),createdAt:new Date(n*1000).toISOString(),payload:{moduleKey:'baes',state:{note}}});
const user={id:'tech',displayName:'Technicien'};

test('revision listing retains historical branches and ignores unrelated files',()=>{
 const files=[file(1),file(2,[1]),file(3,[2]),file(4,[1]),{id:'pdf',name:'autre.json'}];assert.deepEqual(revisionHeads(files).map(f=>f.revision),[id(4),id(3)]);assert.equal(files.length,5);
});

test('100 consecutive saves preserve all original OneDrive snapshots, latest text and idempotent retries',async()=>{
 const g=new MemoryGraph(),j=new Journal(g);for(let n=1;n<=100;n++)await j.save(draft(n,n>1?[n-1]:[],`Texte ${n}`),user);
 const loaded=await j.load('project','attestations','form');assert.equal(loaded.files.length,100);assert.equal(loaded.data.state.note,'Texte 100');assert.equal(loaded.heads.length,1);
 const count=g.items.size;await j.save(draft(100,[99],'Texte 100'),user);assert.equal(g.items.size,count);
});

test('a tablet returning from an older base keeps its work as a separate branch',async()=>{
 const g=new MemoryGraph(),j=new Journal(g);for(let n=1;n<=6;n++)await j.save(draft(n,n>1?[n-1]:[],`Texte ${n}`),user);
 await j.save(draft(7,[1],'Retour tablette hors ligne'),user);let r=await j.load('project','attestations','form');assert.equal(r.heads.length,2);assert.equal(r.data.state.note,'Retour tablette hors ligne');
 await j.save(draft(8,[6,7],'Choix explicite'),user);r=await j.load('project','attestations','form');assert.equal(r.heads.length,1);assert.equal(r.files.length,8);assert.equal(r.data.state.note,'Choix explicite');
});

test('a cleanup failure never fails an already confirmed save or deletes a current branch',async()=>{
 const g=new MemoryGraph(),j=new Journal(g);await j.save(draft(1),user);await j.save(draft(2,[1]),user);g.deleteItem=async()=>{throw new CloudError('Forbidden',403);};
 const saved=await j.save(draft(3,[2]),user);assert.equal(saved.heads[0].revision,id(3));assert.equal((await j.load('project','attestations','form')).data.state.note,'test');
});

test('a list/history containing 108 photo references downloads zero images and reuses listed file metadata',async()=>{
 const g=new MemoryGraph(),j=new Journal(g),d=draft(1);d.payload.state.baes=Array.from({length:108},(_,i)=>({photo:{$opusAsset:{id:'photo-'+i}}}));
 await j.save(d,user);let hydrations=0;j.hydrate=async()=>{hydrations++;throw Error('Images must not load');};
 const loaded=await j.load('project','attestations','form',null,{hydrate:false});assert.equal(loaded.data.state.baes.length,108);assert.equal(hydrations,0);assert.ok(g.reads[0][1].file);
 g.reads=[];const history=await j.load('project','attestations','form',null,{hydrate:false});assert.equal(history.files.length,1);assert.equal(g.reads.length,0);
});

test('hydration fetches four distinct photos at a time and reuses duplicate images and signatures',async t=>{
 const previous=globalThis.FileReader;globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:image/png;base64,'+Buffer.from(b).toString('base64');this.onload();});}};t.after(()=>globalThis.FileReader=previous);
 let active=0,max=0,reads=0;const j=new Journal({async bytes(id){reads++;active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return new Blob([id]);}});
 const ref=id=>({$opusAsset:{id}}),state={photos:Array.from({length:12},(_,i)=>ref('p'+i)),signature:ref('p0')};
 const result=await j.hydrate(state);assert.equal(max,4);assert.equal(reads,12);assert.equal(result.photos[0],result.signature);await j.hydrate(state);assert.equal(reads,12);
});

test('a missing snapshot read fails visibly and a later retry recovers without returning an empty report',async()=>{
 const g=new MemoryGraph(),j=new Journal(g);await j.save(draft(1),user);const original=g.json.bind(g);let once=true;
 g.json=async(...args)=>{if(once){once=false;throw new CloudError('Deleted between list and read',404);}return original(...args);};
 j.docCache.clear();await assert.rejects(j.load('project','attestations','form'),e=>e.status===404);assert.equal((await j.load('project','attestations','form')).data.moduleKey,'baes');
});

test('a create arriving behind a missing directory lookup still creates the directory',async()=>{
 const g=new MemoryGraph(),j=new Journal(g);const lookup=j.directory('project','attestations','form',false),create=j.directory('project','attestations','form',true);
 assert.equal(await lookup,null);assert.ok((await create).folder);
});
