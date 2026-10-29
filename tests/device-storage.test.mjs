import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {backupPending,restorePending,deviceStorageInfo,openDeviceStorage} from '../lib/device-storage.js';
class Folder{
 constructor(name='card',parent=null){this.name=name;this.parent=parent;this.folders=new Map();this.files=new Map();this.fail='';}
 async getDirectoryHandle(name,{create=false}={}){if(!this.folders.has(name)){if(!create)throw Error('missing folder');this.folders.set(name,new Folder(name,this));}return this.folders.get(name);}
 async getFileHandle(name,{create=false}={}){if(!create&&!this.files.has(name))throw Error('missing file');return {getFile:async()=>this.files.get(name),createWritable:async()=>({write:async blob=>{if(this.fail===name||this.parent?.fail===name)throw Error('SD pleine');this.pending={name,blob};},close:async()=>{this.files.set(name,this.pending.blob);this.pending=null;},abort:async()=>{this.pending=null;}})};}
}
function store(namespace='owner',initial=[]){const records=new Map(initial);return {namespace,records,keys:async prefix=>[...records.keys()].filter(key=>key.startsWith(prefix)),get:async key=>records.get(key),set:async(key,value)=>records.set(key,value),setIfAbsent:async(key,value)=>{if(records.has(key))return false;records.set(key,value);return true;},all:()=>assert.fail('Backup must enumerate only keys')};}
function text(initial={}){const rows=new Map(Object.entries(initial));return {get length(){return rows.size;},key:i=>[...rows.keys()][i],getItem:key=>rows.has(key)?rows.get(key):null,setItem:(key,value)=>rows.set(key,value)};}
async function fixture(){
 const rows=[['draft:p:attestations:a',{revision:'r1',payload:{state:{photo:'data:image/jpeg;base64,AAA',note:'Saisie'}}}],['pdfoutbox:pdf',{id:'pdf',name:'rapport.pdf',blob:new Blob(['PDF content'],{type:'application/pdf'})}],['report-recovery:r',{summary:'Rapport en cours'}],['asset:cache',new Blob(['cache'])]],source=store('owner',rows),card=new Folder();
 const result=await backupPending({store:source,directory:card,textStorage:text({'opus-report:owner:last':'{"id":"r"}','other-account:key':'secret'}),reportPrefix:'opus-report:owner:'});return {source,card,folder:card.folders.get(result.name),result};
}
test('SD backup includes drafts, PDF bytes and report recovery; excludes cached files and other accounts without deleting sources',async()=>{
 const f=await fixture();assert.equal(f.result.count,3);assert.equal(f.source.records.size,4);const manifest=JSON.parse(await f.folder.files.get('manifest.json').text());assert.equal(manifest.entries.length,3);assert.equal(manifest.text.length,1);assert.ok([...f.folder.files.keys()].some(name=>name.endsWith('.bin')));assert.ok(!manifest.entries.some(row=>row.key.startsWith('asset:')));
 const target=store(),texts=text();const result=await restorePending({store:target,directory:f.folder,textStorage:texts,reportPrefix:'opus-report:owner:'});assert.equal(result.restored,3);assert.equal(target.records.get('draft:p:attestations:a').payload.state.note,'Saisie');assert.equal(await target.records.get('pdfoutbox:pdf').blob.text(),'PDF content');assert.match(texts.getItem('opus-report:owner:last'),/"r"/);
});
test('an interrupted card write never produces a complete manifest or removes the local outbox',async()=>{
 const source=store('owner',[['draft:p:a:b',{text:'keep'}]]),card=new Folder();card.fail='entry-00000.json';await assert.rejects(backupPending({store:source,directory:card}),/SD pleine/);assert.equal(source.records.size,1);assert.equal([...card.folders.values()][0].files.has('manifest.json'),false);
});
test('restoring refuses another account and never replaces a newer local draft',async()=>{
 const f=await fixture(),other=store('other');await assert.rejects(restorePending({store:other,directory:f.folder}),/autre compte/);assert.equal(other.records.size,0);
 const target=store('owner',[['draft:p:attestations:a',{revision:'newer',payload:{note:'Keep newer'}}]]);const result=await restorePending({store:target,directory:f.folder});assert.equal(result.skipped,1);assert.equal(result.restored,2);assert.equal(target.records.get('draft:p:attestations:a').revision,'newer');
});
test('missing or incomplete binary data is not restored as a valid PDF, and retry keeps prior copies',async()=>{
 const f=await fixture(),binary=[...f.folder.files.keys()].find(name=>name.endsWith('.bin'));const good=f.folder.files.get(binary);f.folder.files.set(binary,new Blob(['x']));const target=store();await assert.rejects(restorePending({store:target,directory:f.folder}),/incomplète/);assert.equal(target.records.has('pdfoutbox:pdf'),false);assert.equal(target.records.has('draft:p:attestations:a'),true);
 f.folder.files.set(binary,good);const result=await restorePending({store:target,directory:f.folder});assert.equal(result.skipped,1);assert.equal(await target.records.get('pdfoutbox:pdf').blob.text(),'PDF content');
});
test('manifest validation rejects foreign prefixes before any local write',async()=>{
 const f=await fixture(),manifest=JSON.parse(await f.folder.files.get('manifest.json').text());manifest.entries[0].key='catalog';f.folder.files.set('manifest.json',new Blob([JSON.stringify(manifest)]));const target=store();await assert.rejects(restorePending({store:target,directory:f.folder}),/non autorisée/);assert.equal(target.records.size,0);
});
test('storage estimate tolerates missing APIs and does not wait indefinitely for a stalled browser',async()=>{
 assert.deepEqual(await deviceStorageInfo({}),{usage:null,quota:null,persistent:null});const info=await deviceStorageInfo({storage:{estimate:async()=>({usage:100,quota:1000}),persisted:async()=>true}});assert.deepEqual(info,{usage:100,quota:1000,persistent:true});const stalled=await deviceStorageInfo({storage:{estimate:()=>new Promise(()=>{})}},5);assert.equal(stalled.quota,null);
});
test('unsupported folder access is explicit and persistence is requested only after the operator clicks',async t=>{
 const dom=new JSDOM('<dialog id="modal"></dialog>'),old=globalThis.document;globalThis.document=dom.window.document;t.after(()=>{globalThis.document=old;dom.window.close();});let requests=0;
 const navigator={storage:{estimate:async()=>({usage:10,quota:100}),persisted:async()=>false,persist:async()=>{requests++;return true;}}};
 await openDeviceStorage({store:store(),navigator,window:{},modal:(_,html)=>document.getElementById('modal').innerHTML=html});assert.equal(document.getElementById('backupDevice').disabled,true);assert.match(document.getElementById('deviceStatus').textContent,/pas disponible/);assert.equal(requests,0);await document.getElementById('protectDevice').onclick();assert.equal(requests,1);assert.match(document.getElementById('deviceStatus').textContent,/accordée/);
});

test('a draft created while the SD file is read is never overwritten during restore',async()=>{
 const f=await fixture(),target=store(),key='draft:p:attestations:a',file=f.folder.files.get('entry-00000.json'),original=file.text.bind(file);
 file.text=async()=>{target.records.set(key,{revision:'created-during-restore'});return original();};
 const result=await restorePending({store:target,directory:f.folder});assert.equal(result.skipped,1);assert.equal(result.restored,2);assert.equal(target.records.get(key).revision,'created-during-restore');
});
