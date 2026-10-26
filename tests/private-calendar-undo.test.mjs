import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {PrivateCalendar,expandPrivateEvents,editPrivateEvent} from '../lib/private-calendar.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(status,message='Graph conflict')=>Object.assign(Error(message),{status});
const input={title:'Rendez-vous exemple',start:'2026-10-26T09:00:00Z',end:'2026-10-26T10:00:00Z',address:'1 rue Exemple',notes:'Notes à conserver'};

async function fixture(){
 const files=new Map(),sessions=new Map(),calls=[],history=[];let sequence=0,notifications=0;
 const controls={failWrite:false,failRead:false,beforeWrite:null,beforeUpload:null,afterRead:null,afterSession:null};
 const metadata=file=>({id:file.fileId,eTag:file.etag,name:'opus-private-appointment-'+file.payload.id+'.json','@microsoft.graph.downloadUrl':'https://download.example/'+file.fileId});
 const store=(payload,fileId=null)=>{const file={payload:copy(payload),fileId:fileId||'file-'+(++sequence),etag:'tag-'+(++sequence)};files.set(payload.id,file);return file;};
 const byFile=id=>[...files.values()].find(file=>file.fileId===id);
 const beginWrite=async()=>{if(controls.failWrite)throw Error('Network unavailable');const hook=controls.beforeWrite;controls.beforeWrite=null;await hook?.();};
 const graph={
  async request(path,options={}){
   const method=options.method||'GET';calls.push({path,method,options});
   if(method==='GET'&&controls.failRead)throw Error('Read unavailable');
   if(path.endsWith('/approot'))return {id:'private-root'};
   const named=/^\/me\/drive\/items\/private-root:\/opus-private-appointment-(.+)\.json(?::\/(content|createUploadSession))?$/.exec(decodeURIComponent(path));
   const physical=/^\/me\/drive\/items\/([^/]+)(?:\/content)?$/.exec(path);
   if(method==='POST'&&named?.[2]==='createUploadSession'){
    assert.equal(options.body.item['@microsoft.graph.conflictBehavior'],'fail');
    assert.equal(options.body.item.name,'opus-private-appointment-'+named[1]+'.json');
    if(files.has(named[1]))throw fail(409);
    const uploadUrl='https://upload.example/session-'+(++sequence);sessions.set(uploadUrl,named[1]);await controls.afterSession?.();return {uploadUrl};
   }
   if(method==='GET'){
    const file=named?files.get(named[1]):byFile(physical?.[1]);
    if(!file)throw fail(404,'Missing');return metadata(file);
   }
   await beginWrite();
   if(method==='PUT'){
    const payload=JSON.parse(await options.body.text());
    const file=named?files.get(named[1]):byFile(physical?.[1]);
    if(!named&&!file)throw fail(404);
    if(file&&options.headers?.['If-Match']!==file.etag)throw fail(412);
    return metadata(store(payload,file?.fileId));
   }
   if(method==='DELETE'){
    const file=byFile(physical?.[1]);if(!file)throw fail(404);
    if(options.headers?.['If-Match']!==file.etag)throw fail(412);
    files.delete(file.payload.id);return null;
   }
   throw Error('Unexpected request '+method+' '+path);
  },
  async all(){return [...files.values()].map(metadata);},
  async fetcher(url,options={}){
   calls.push({path:url,method:options.method||'GET',options});
   if(url.startsWith('https://download.example/')){
    if(controls.failRead)throw Error('Read unavailable');
    const file=byFile(url.split('/').at(-1));if(!file)return {ok:false,status:404};
    return {ok:true,status:200,json:async()=>{const payload=copy(file.payload);await controls.afterRead?.();return payload;}};
   }
   assert.ok(sessions.has(url));assert.equal(options.method,'PUT');
   assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);
   const hook=controls.beforeUpload;controls.beforeUpload=null;await hook?.();
   if(controls.failWrite)throw Error('Network unavailable');
   const id=sessions.get(url);if(files.has(id))return {ok:false,status:409};
   const payload=JSON.parse(await options.body.text());assert.equal(payload.id,id);
   assert.equal(options.headers['Content-Range'],`bytes 0-${options.body.size-1}/${options.body.size}`);
   return {ok:true,status:201,json:async()=>metadata(store(payload))};
  }
 };
 const repo=new PrivateCalendar(graph,'owner-example');await repo.load();
 repo.onMutation=change=>history.push(change);repo.onChange=async()=>{notifications++;};
 return {repo,files,calls,history,controls,store,notifications:()=>notifications};
}

test('only confirmed private writes enter history; snapshots do not share mutable objects',async()=>{
 const f=await fixture();f.controls.failWrite=true;
 await assert.rejects(f.repo.save(input),/Network/);assert.equal(f.history.length,0);assert.equal(f.repo.rows.length,0);
 f.controls.failWrite=false;
 await f.repo.save({...input,recurrence:{days:[1],until:'2026-11-16'}});
 const change=f.history[0],row=f.repo.rows[0];
 assert.equal(change.type,'private');assert.equal(change.ownerId,'owner-example');assert.equal(change.rootId,'private-root');assert.equal(change.id,row.id);
 assert.equal(change.before,null);assert.equal(change.after.fileId,row.fileId);assert.equal(change.after.etag,row.etag);
 assert.equal(change.after.payload.fileId,undefined);assert.equal(change.after.payload.etag,undefined);
 row.recurrence.days.push(2);row.notes='Local edit';
 assert.deepEqual(change.after.payload.recurrence.days,[1]);assert.equal(change.after.payload.notes,input.notes);
 f.controls.failWrite=true;
 await assert.rejects(f.repo.remove(row.id),/Network/);assert.equal(f.history.length,1);assert.equal(f.repo.rows.length,1);
});

test('creation undo deletes the original private document and notifies without adding history',async()=>{
 const f=await fixture();await f.repo.save(input);const change=f.history[0];
 const result=await f.repo.undo(change);
 assert.equal(result.committed,true);assert.equal(result.row,null);assert.equal(f.files.size,0);assert.equal(f.repo.rows.length,0);
 assert.equal(f.history.length,1);assert.equal(f.notifications(),2);
 const deletion=f.calls.findLast(call=>call.method==='DELETE');assert.equal(deletion.options.headers['If-Match'],change.after.etag);
 await assert.rejects(f.repo.undo(change),{status:412});assert.equal(f.notifications(),2);
});

test('successive undos restore edits and deleted recurring series with the same logical ID and fresh ETags',async()=>{
 const f=await fixture();await f.repo.save({...input,category:'Rendez-vous de chantier',projectId:'project-example',projectName:'Site exemple',recurrence:{days:[1,3],until:'2026-11-18'}});
 const original=copy(f.history[0].after.payload),id=original.id,originalFileId=f.repo.rows[0].fileId;
 const occurrences=expandPrivateEvents([original]).map(row=>row.id);
 await f.repo.save({...original,title:'Objet modifié',notes:'Notes modifiées',start:'2026-10-27T12:00:00Z',end:'2026-10-27T13:00:00Z',recurrence:{days:[2],until:'2026-12-01'}});
 const edited=copy(f.history[1].after.payload);
 await f.repo.remove(id);const changes=copy(f.history);assert.equal(f.files.size,0);
 const restored=await f.repo.undo(changes[2]);assert.equal(restored.committed,true);
 assert.deepEqual(f.files.get(id).payload,edited);assert.equal(f.files.size,1);assert.equal(f.repo.rows.length,1);
 assert.notEqual(f.repo.rows[0].fileId,originalFileId);
 const restoredTag=f.repo.rows[0].etag;
 await f.repo.undo(changes[1]);
 assert.deepEqual(f.files.get(id).payload,original);
 assert.deepEqual(expandPrivateEvents(f.repo.rows).map(row=>row.id),occurrences);
 const lastPut=f.calls.findLast(call=>call.method==='PUT'&&call.path.startsWith('/me/drive/'));
 assert.equal(lastPut.options.headers['If-Match'],restoredTag);assert.notEqual(restoredTag,changes[1].after.etag);
 await f.repo.undo(changes[0]);assert.equal(f.files.size,0);assert.equal(f.repo.rows.length,0);
 assert.equal(f.history.length,3);assert.equal(f.notifications(),6);
});

test('private undo rejects a changed payload and a concurrent writer after the fresh read',async()=>{
 const f=await fixture();await f.repo.save(input);const created=f.history[0],id=created.id;
 await f.repo.save({...created.after.payload,title:'Latest local title'});const edited=f.history[1];
 const remote={...edited.after.payload,notes:'Changed on another device'};
 f.store(remote,f.repo.rows[0].fileId);
 let writes=f.calls.filter(call=>call.method==='PUT'||call.method==='DELETE').length;
 await assert.rejects(f.repo.undo(edited),{status:412});
 assert.equal(f.calls.filter(call=>call.method==='PUT'||call.method==='DELETE').length,writes);
 assert.deepEqual(f.files.get(id).payload,remote);
 // The content matches again, but a writer races between the read and PUT.
 f.store(edited.after.payload,f.repo.rows[0].fileId);
 f.controls.beforeWrite=()=>f.store(remote,f.repo.rows[0].fileId);
 await assert.rejects(f.repo.undo(edited),{status:412});
 assert.deepEqual(f.files.get(id).payload,remote);assert.equal(f.repo.rows[0].title,'Latest local title');
 assert.equal(f.history.length,2);assert.equal(f.notifications(),2);
});

test('restoring a deleted series refuses a same-name file created during the upload session',async()=>{
 const f=await fixture();await f.repo.save({...input,recurrence:{days:[1],until:'2026-11-30'}});const original=copy(f.history[0].after.payload);
 await f.repo.remove(original.id);const removal=f.history[1];
 const remote={...original,title:'Other device restored this series'};
 f.controls.beforeUpload=()=>f.store(remote);
 await assert.rejects(f.repo.undo(removal),{status:412});
 assert.equal(f.files.size,1);assert.deepEqual(f.files.get(original.id).payload,remote);
 assert.equal(f.repo.rows.length,0);assert.equal(f.history.length,2);assert.equal(f.notifications(),2);
 // Subsequent attempts also refuse the existing record without creating a session.
 const sessions=f.calls.filter(call=>call.method==='POST').length;
 await assert.rejects(f.repo.undo(removal),{status:412});assert.equal(f.calls.filter(call=>call.method==='POST').length,sessions);
});

test('undo stays in its owner and root and requires live data',async()=>{
 const f=await fixture();await f.repo.save(input);const change=f.history[0],count=f.calls.length;
 for(const invalid of [{...change,ownerId:'another-owner'},{...change,rootId:'another-root'},{...change,after:{...change.after,payload:{...change.after.payload,id:'another-id'}}}]){
  await assert.rejects(f.repo.undo(invalid));assert.equal(f.calls.length,count);
 }
 f.repo.cacheMode=true;await assert.rejects(f.repo.undo(change),/mémorisé/);assert.equal(f.calls.length,count);
 f.repo.cacheMode=false;f.repo.ready=false;await assert.rejects(f.repo.undo(change),/rechargez/);assert.equal(f.calls.length,count);
 assert.equal(f.files.size,1);assert.equal(f.notifications(),1);
});

test('failed undo reads or writes retain the event and history; post-commit notification failure does not replay undo',async()=>{
 const f=await fixture();await f.repo.save(input);const change=f.history[0],local=copy(f.repo.rows);
 f.controls.failRead=true;await assert.rejects(f.repo.undo(change),/Read/);
 f.controls.failRead=false;f.controls.failWrite=true;await assert.rejects(f.repo.undo(change),/Network/);
 assert.deepEqual(f.repo.rows,local);assert.equal(f.files.size,1);assert.equal(f.history.length,1);assert.equal(f.notifications(),1);
 f.controls.failWrite=false;f.repo.onChange=async()=>{throw Error('Reminders unavailable');};
 const result=await f.repo.undo(change);
 assert.equal(result.committed,true);assert.equal(result.notificationError,'Reminders unavailable');assert.equal(f.files.size,0);assert.equal(f.repo.rows.length,0);assert.equal(f.history.length,1);
});

test('a stale private ID cannot silently create a duplicate and deletion without an ETag is blocked',async()=>{
 const f=await fixture();await f.repo.save(input);const id=f.repo.rows[0].id,count=f.calls.length;
 await assert.rejects(f.repo.save({...input,id:'missing-id'}),/plus disponible/);
 f.repo.rows[0].etag='';await assert.rejects(f.repo.remove(id),/Rechargez/);
 assert.equal(f.calls.length,count);assert.equal(f.files.size,1);assert.equal(f.history.length,1);
});

test('the private appointment form sends confirmed mutations to the central calendar history',async()=>{
 const f=await fixture(),dom=new JSDOM('<dialog id="modal"></dialog>',{url:'https://opus.example'});
 const previousDocument=globalThis.document;globalThis.document=dom.window.document;
 const recorded=[];
 try{
  const ui={user:{id:'owner-example'},c:{isAdmin:()=>true,modal:(_,html)=>document.getElementById('modal').innerHTML=html},privateCalendar:f.repo,localDT:date=>date.slice(0,16),renderCalendar:async()=>{},recordPrivateCalendarChange:change=>recorded.push(change)};
  document.getElementById('modal').close=()=>{};
  editPrivateEvent(ui);document.getElementById('peTitle').value='Rendez-vous du formulaire';
  await document.getElementById('privateEventForm').onsubmit({preventDefault(){}});
  assert.equal(recorded.length,1);assert.equal(recorded[0].before,null);assert.equal(recorded[0].after.payload.title,'Rendez-vous du formulaire');assert.equal(f.files.size,1);
 }finally{globalThis.document=previousDocument;dom.window.close();}
});

test('private creation and deletion forms cannot write while a calendar undo is running',async()=>{
 const f=await fixture();await f.repo.save(input);const id=f.repo.rows[0].id;
 const dom=new JSDOM('<dialog id="modal"></dialog>',{url:'https://opus.example'});
 const previousDocument=globalThis.document,previousConfirm=globalThis.confirm;
 globalThis.document=dom.window.document;globalThis.confirm=()=>true;
 try{
  const ui={user:{id:'owner-example'},c:{isAdmin:()=>true,modal:(_,html)=>document.getElementById('modal').innerHTML=html},privateCalendar:f.repo,localDT:date=>date.slice(0,16),renderCalendar:async()=>{},assertCalendarChangeAllowed(){throw Error('Une annulation est en cours.');}};
  document.getElementById('modal').close=()=>assert.fail('The blocked form must remain open');
  const calls=f.calls.length;
  editPrivateEvent(ui);document.getElementById('peTitle').value='Blocked creation';
  await document.getElementById('privateEventForm').onsubmit({preventDefault(){}});
  assert.match(document.getElementById('peStatus').textContent,/annulation/);assert.equal(document.getElementById('peTitle').value,'Blocked creation');
  editPrivateEvent(ui,id);await document.getElementById('peDelete').onclick();
  assert.match(document.getElementById('peStatus').textContent,/annulation/);
  assert.equal(f.calls.length,calls);assert.equal(f.files.size,1);assert.equal(f.repo.rows[0].id,id);
 }finally{globalThis.document=previousDocument;globalThis.confirm=previousConfirm;dom.window.close();}
});

test('private undo stops if the connected account changes during its remote read',async()=>{
 const f=await fixture();await f.repo.save(input);const change=f.history[0];let currentOwner='owner-example';
 f.controls.afterRead=()=>{currentOwner='another-account';};
 const assertCurrent=()=>{if(currentOwner!=='owner-example')throw Error('Connected account changed');};
 const writes=f.calls.filter(call=>call.method==='PUT'||call.method==='DELETE').length;
 await assert.rejects(f.repo.undo(change,{assertCurrent}),/account changed/);
 assert.equal(f.calls.filter(call=>call.method==='PUT'||call.method==='DELETE').length,writes);
 assert.equal(f.files.size,1);assert.equal(f.repo.rows.length,1);assert.equal(f.history.length,1);assert.equal(f.notifications(),1);
});

test('restoring a private series stops before uploading if permissions change during session creation',async()=>{
 const f=await fixture();await f.repo.save({...input,recurrence:{days:[1],until:'2026-11-30'}});await f.repo.remove(f.repo.rows[0].id);
 let admin=true;f.controls.afterSession=()=>{admin=false;};
 await assert.rejects(f.repo.undo(f.history[1],{assertCurrent:()=>{if(!admin)throw Error('Administrator access revoked');}}),/revoked/);
 assert.equal(f.calls.filter(call=>call.path.startsWith('https://upload.example/')).length,0);
 assert.equal(f.files.size,0);assert.equal(f.repo.rows.length,0);assert.equal(f.history.length,2);assert.equal(f.notifications(),2);
});
