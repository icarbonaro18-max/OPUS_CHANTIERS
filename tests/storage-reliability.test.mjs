import test from 'node:test';
import assert from 'node:assert/strict';
import {Journal,revisionName} from '../lib/cloud.js';
import {OpsRepository} from '../lib/ops.js';
import {hasInlineImages,hasMediaReferences} from '../lib/media-store.js';

class Drive{
 constructor(){this.items=new Map();this.serial=0;this.writes=0;this.downloads=0;this.active=0;this.maxActive=0;this.failBackup=false;this.beforeWrite=null;this.system=this.put('root','_OPUS_SYSTEM',null,true);}
 meta(row){const {blob,...metadata}=row;return structuredClone(metadata);}
 put(parent,name,blob,folder=false){const row={id:'item-'+(++this.serial),parent,name,eTag:'tag-'+this.serial,size:blob?.size||0,...(folder?{folder:{}}:{file:{}}),blob};this.items.set(row.id,row);return this.meta(row);}
 find(parent,name){return [...this.items.values()].find(x=>x.parent===parent&&x.name===name);}
 async named(parent,name){const row=this.find(parent,name);return row?this.meta(row):null;}
 async folder(parent,name){return await this.named(parent,name)||this.put(parent,name,null,true);}
 async children(parent){return [...this.items.values()].filter(x=>x.parent===parent).map(x=>this.meta(x));}
 async json(id){return JSON.parse(await this.items.get(id).blob.text());}
 async bytes(id){this.downloads++;this.active++;this.maxActive=Math.max(this.maxActive,this.active);await new Promise(r=>setImmediate(r));this.active--;return new Blob([this.items.get(id).blob],{type:'application/octet-stream'});}
 async upload(parent,name,blob){const item=this.put(parent,name,blob);if(this.failBackup&&this.items.get(parent)?.name==='SAUVEGARDES_AVANT_OPTIMISATION')return {...item,size:blob.size-1};return item;}
 async writeJson(parent,name,value,headers={}){if(this.beforeWrite)await this.beforeWrite(parent,name);const old=this.find(parent,name);if(headers['If-Match']&&headers['If-Match']!==old?.eTag)throw Object.assign(Error('Concurrent write'),{status:412});this.writes++;if(old){old.blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});old.size=old.blob.size;old.eTag='tag-'+(++this.serial);return this.meta(old);}return this.put(parent,name,new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));}
}
const localStore=()=>{const records=new Map();return {records,async get(key){return records.get(key);},async set(key,value){records.set(key,value);}};};
const photo=(byte,bytes=64)=>'data:image/jpeg;base64,'+Buffer.alloc(bytes,byte).toString('base64');
const record=(id,bytes=64)=>({id:'record-'+id,clientName:'Client '+id,workDone:'Texte conservé '+id,teamIds:['person'],photos:[{name:'Photo '+id,dataUrl:photo(id,bytes)}],notes:'Note et coordonnées conservées'});
async function fixture(rows,store=localStore()){
 const g=new Drive(),file=g.put(g.system.id,'interventions.json',new Blob([JSON.stringify(rows)],{type:'application/json'}));const repo=new OpsRepository(g,{assetStore:store});await repo.init();return {g,file,repo,store};
}

test('a measured-size 43 MB collection becomes a small index, retaining every record and a full confirmed backup',async()=>{
 const rows=Array.from({length:250},(_,i)=>record(i,130000)),{g,file,repo}=await fixture(rows);assert.ok(file.size>43000000);
 const stages=[];const result=await repo.optimizeMedia('interventions',{onProgress:p=>stages.push(p)});const after=await g.named(g.system.id,'interventions.json');
 assert.equal(result.changed,true);assert.ok(after.size<file.size/100);assert.ok(stages.some(p=>p.total===250&&p.done===250));
 const backups=await g.named(g.system.id,'SAUVEGARDES_AVANT_OPTIMISATION'),backup=await g.named(backups.id,result.backup);assert.deepEqual(await g.json(backup.id),rows);
 const index=await repo.load('interventions');assert.equal(index.length,250);assert.equal(hasInlineImages(index),false);assert.equal(hasMediaReferences(index),true);assert.equal(g.downloads,0);
 const opened=await repo.hydrateRecord(index[42]);assert.deepEqual(opened,rows[42]);assert.equal(g.downloads,0,'Migration cached original media on this device');
 index[42]=opened;index[42].workDone='Correction du seul rapport 42';await repo.save('interventions',index);const saved=await g.json(file.id);assert.equal(saved[42].workDone,'Correction du seul rapport 42');assert.equal(saved[43].workDone,rows[43].workDone);assert.equal(hasInlineImages(saved),false);
});

test('an unconfirmed backup prevents any replacement of the original collection',async()=>{
 const rows=[record(1)],{g,file,repo}=await fixture(rows);g.failBackup=true;await assert.rejects(repo.optimizeMedia('interventions'),/copie de sécurité/);assert.deepEqual(await g.json(file.id),rows);assert.equal(g.writes,0);
});

function externalFolder({fail=false,truncate=false}={}){
 const files=new Map();return {name:'Sauvegardes externes',files,async getFileHandle(name){let pending;return {createWritable:async()=>({write:async blob=>{if(fail)throw Error('Support externe indisponible');pending=blob;},close:async()=>files.set(name,truncate?pending.slice(0,1):pending),abort:async()=>{pending=null;}}),getFile:async()=>files.get(name)};}};
}
test('optimization confirms a full external backup before changing the collection without duplicating it in SharePoint',async()=>{
 const rows=[record(1)],{g,file,repo}=await fixture(rows),directory=externalFolder();
 const result=await repo.optimizeMedia('interventions',{backupDirectory:directory});assert.equal(result.backupLocation,'external');assert.deepEqual(JSON.parse(await directory.files.get(result.backup).text()),rows);assert.equal(await g.named(g.system.id,'SAUVEGARDES_AVANT_OPTIMISATION'),null);assert.equal(hasInlineImages(await g.json(file.id)),false);
});
test('a full, disconnected or incomplete external destination prevents changing the source',async()=>{
 for(const options of [{fail:true},{truncate:true}]){const rows=[record(1)],{g,file,repo}=await fixture(rows);await assert.rejects(repo.optimizeMedia('interventions',{backupDirectory:externalFolder(options)}));assert.deepEqual(await g.json(file.id),rows);assert.equal(g.writes,0);}
});

test('a concurrent technician save blocks optimization from replacing that save',async()=>{
 const rows=[record(1)],{g,file,repo}=await fixture(rows);g.beforeWrite=async()=>{g.beforeWrite=null;const current=g.items.get(file.id);current.blob=new Blob([JSON.stringify([{...rows[0],notes:'Nouvelle saisie du technicien'}])]);current.eTag='newer-version';};
 await assert.rejects(repo.optimizeMedia('interventions'),/autre tablette/);assert.equal((await g.json(file.id))[0].notes,'Nouvelle saisie du technicien');assert.equal(hasInlineImages(await g.json(file.id)),true);assert.equal(g.writes,0);
});

test('cancelling between backup and media conversion preserves the original file',async()=>{
 const rows=[record(1)],{g,file,repo}=await fixture(rows),controller=new AbortController();await assert.rejects(repo.optimizeMedia('interventions',{signal:controller.signal,onProgress:p=>{if(p.stage==='Séparation des photos')controller.abort();}}),/arrêtée/);assert.deepEqual(await g.json(file.id),rows);assert.equal(g.writes,0);
});

test('history and revision inspection read metadata without fetching a single photograph',async()=>{
 const g=new Drive(),version='a'.repeat(32),payload={moduleKey:'baes',state:{baes:[{repere:'1',photo:{$opusAsset:{id:'photo',mime:'image/jpeg'}}}]}};
 const file=g.put('revisions',revisionName(version),new Blob([JSON.stringify({payload,createdAt:'2026-10-28',author:{name:'Ruben'}})]));let reads=0;const json=g.json.bind(g);g.json=async id=>{reads++;return json(id);};g.bytes=()=>assert.fail('History must not download photos');
 const j=new Journal(g,{assetStore:localStore()}),known={dir:{id:'revisions'},files:[file]};const latest=await j.load('project','attestations','report',null,{hydrate:false,known});assert.equal(latest.data.state.baes.length,1);assert.equal(reads,1);
 const inspected=await j.load('project','attestations','report',version,{hydrate:false,known});assert.deepEqual(inspected.data,payload);assert.equal(reads,1,'Immutable revision metadata is reused');
});

test('photos are deduplicated, downloaded with bounded concurrency and reused offline across sessions',async()=>{
 const g=new Drive(),store=localStore(),refs=Array.from({length:12},(_,i)=>{const file=g.put('photos','photo-'+i,new Blob([Uint8Array.of(i)],{type:'image/jpeg'}));return {$opusAsset:{id:file.id,mime:'image/jpeg'}};});const value={photos:[...refs,...refs],notes:'Notes intactes'};
 const j=new Journal(g,{assetStore:store}),loaded=await j.hydrate(value);assert.equal(g.downloads,12);assert.equal(g.maxActive,4);assert.equal(loaded.notes,'Notes intactes');assert.deepEqual(loaded.photos.slice(0,12),loaded.photos.slice(12));assert.ok(loaded.photos.every(p=>p.startsWith('data:image/jpeg;base64,')));
 g.bytes=()=>assert.fail('Already cached photos must open offline');const second=await new Journal(g,{assetStore:store}).hydrate(value);assert.deepEqual(second,loaded);assert.equal(hasMediaReferences(value),true,'Hydration does not alter the original references');
});

test('a failed photo read does not poison retries or erase its original reference',async()=>{
 const g=new Drive(),file=g.put('photos','photo',new Blob(['image'],{type:'image/jpeg'})),j=new Journal(g,{assetStore:localStore()}),value={photo:{$opusAsset:{id:file.id,mime:'image/jpeg'}}};let fail=true;const read=g.bytes.bind(g);g.bytes=async id=>{if(fail)throw Error('Réseau interrompu');return read(id);};
 await assert.rejects(j.hydrate(value),/Réseau/);assert.equal(hasMediaReferences(value),true);fail=false;assert.match((await j.hydrate(value)).photo,/^data:image\/jpeg/);
});
