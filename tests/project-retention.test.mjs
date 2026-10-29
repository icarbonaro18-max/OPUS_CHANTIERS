import test from 'node:test';
import assert from 'node:assert/strict';
import {deletionDate,compactReport,cleanPurgedLocal} from '../lib/project-retention.js';
import {payrollRows} from '../lib/workforce.js';
import {OpsRepository} from '../lib/ops.js';
import {runRetention,scheduledRetention} from '../server/project-retention.js';
import {createHandler} from '../api/retention-cron.js';

const now=new Date('2026-09-15T10:00:00Z'),old='2026-08-01T10:00:00Z',archive='2026-08-16T10:00:00Z';
function fixture(){
 const records={clients:[],people:[],events:[],closures:[],projectTracking:[{id:'p',completedAt:old,archivedAt:archive}],interventions:[{id:'r',projectId:'p',number:'INT-2026-0001',status:'terminee',actualStart:old,actualEnd:'2026-08-01T12:00:00Z',teamIds:['worker'],photos:['data:image/jpeg;base64,'+'a'.repeat(100000)],summary:'Rapport lourd',extra:{$opusAsset:{id:'asset'}}},{id:'other',projectId:'active',photos:['keep']}],visits:[]};
 const categories=[{id:'c04',name:'04 - TERMINES'},{id:'c99',name:'99 - ARCHIVES'}];
 const project={id:'p',name:'Chantier',category:'99',categoryFolder:categories[1],eTag:'p-tag',lastModifiedDateTime:archive,parentReference:{id:'c99'},folder:{}};
 const photo={id:'photo',name:'photo.jpg',eTag:'photo-tag',lastModifiedDateTime:archive,file:{}};
 let exists=true,lock=null;const deleted=[],saved=[];const archiveRecord=async()=>({manifestId:'manifest',snapshotId:'snapshot',pdfId:'pdf',sourceHash:'hash'}),verifyArchive=async()=>true;
 const graph={drive:{id:'drive'},base:id=>'/drives/drive/items/'+id,
  named:async(parent,name)=>name==='_RETENTION_RUNNING'?lock:null,
  request:async(path,opts)=>{assert.equal(opts.method,'POST');if(lock)throw Object.assign(Error('busy'),{status:409});return lock={id:'lock',eTag:'lock-tag',createdDateTime:now.toISOString()};},
  item:async id=>{if(id==='p'&&exists)return structuredClone(project);if(id==='photo'&&exists)return structuredClone(photo);throw Object.assign(Error('missing'),{status:404});},
  children:async id=>id==='p'?[structuredClone(photo)]:[],
  projects:async()=>({categories,projects:exists?[structuredClone(project)]:[],loose:[]}),
  moveProject:async(item,category)=>{project.category='99';project.categoryFolder=category;project.parentReference={id:category.id};project.lastModifiedDateTime=now.toISOString();},
  deleteItem:async(id,conditions)=>{assert.ok(conditions['If-Match']);if(id==='lock'){lock=null;return;}assert.equal(id,'p');assert.equal(conditions['If-Match'],project.eTag);deleted.push(id);exists=false;}
 };
 const repo={root:{id:'system'},init:async()=>{},loadAll:async()=>structuredClone(records),load:async kind=>structuredClone(records[kind]),save:async(kind,rows)=>{saved.push(kind);records[kind]=structuredClone(rows);}};
 return {graph,repo,records,project,photo,deleted,saved,archiveRecord,verifyArchive,setLock:value=>lock=value,setExists:value=>exists=value};
}

test('deletion is 30 full days after archive and never before 45 days after completion',()=>{
 assert.equal(deletionDate({completedAt:old,archivedAt:archive}),'2026-09-15T10:00:00.000Z');
 assert.equal(deletionDate({completedAt:archive,archivedAt:archive}),'2026-09-30T10:00:00.000Z');assert.equal(deletionDate({completedAt:old}),null);
});
test('the exact deadline preserves project files and withdraws heavy content while keeping other projects and time facts',async()=>{
 const f=fixture(),result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(result.purged,1);assert.deepEqual(f.deleted,[]);assert.equal((await f.graph.item('p')).id,'p');
 const report=f.records.interventions[0];assert.equal(report.actualStart,old);assert.equal(report.number,'INT-2026-0001');assert.equal(report.photos,undefined);assert.equal(report.summary,undefined);assert.equal(f.records.interventions[1].photos[0],'keep');
 const row=f.records.projectTracking[0];assert.ok(row.retentionPurgedAt);assert.equal(row.retentionPlan,undefined);assert.ok(row.retentionCacheIds.includes('photo'));assert.ok(row.retentionCacheIds.includes('asset'));
});
test('one second before the deadline does not delete anything',async()=>{
 const f=fixture(),result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now:new Date(+now-1000)});assert.equal(result.purged,0);assert.equal(f.deleted.length,0);
});
test('an archive without a known date gets a fresh 30-day clock instead of immediate deletion',async()=>{
 const f=fixture();delete f.records.projectTracking[0].archivedAt;const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(result.initialized,1);assert.equal(f.records.projectTracking[0].archivedAt,now.toISOString());assert.equal(f.deleted.length,0);
});
test('a project moves from completed to archive after fifteen days and receives the actual move date',async()=>{
 const f=fixture();f.project.category='04';f.project.categoryFolder={id:'c04',name:'04 - TERMINES'};f.project.parentReference.id='c04';delete f.records.projectTracking[0].archivedAt;f.project.lastModifiedDateTime=old;f.photo.lastModifiedDateTime=old;
 const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now:new Date('2026-08-16T12:00:00Z')});assert.equal(result.archived,1);assert.equal(f.records.projectTracking[0].archivedAt,'2026-08-16T12:00:00.000Z');assert.equal(f.deleted.length,0);
});
test('a recently modified nested file and a future appointment each defer deletion',async()=>{
 const f=fixture();f.photo.lastModifiedDateTime='2026-09-01T10:00:00Z';await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(f.deleted.length,0);
 f.photo.lastModifiedDateTime=archive;f.records.events=[{id:'e',kind:'project',linkId:'p',end:'2026-09-16T10:00:00Z'}];await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(f.deleted.length,0);
});
test('a change to a nested file between checks prevents folder deletion',async()=>{
 const f=fixture(),read=f.graph.children;let calls=0;f.graph.children=async id=>{const list=await read(id);if(++calls===2)list[0].eTag='changed';return list;};
 const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(f.deleted.length,0);assert.equal(result.deferred,1);
});
test('an unverified permanent archive preserves the original reports',async()=>{
 const f=fixture();f.verifyArchive=async()=>{throw Error('Archive verification failed');};
 const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(result.purged,0);assert.ok(f.records.interventions[0].photos);assert.equal(f.records.projectTracking[0].retentionPurgedAt,undefined);
});
test('a lost index write resumes while the permanent source folder remains intact',async()=>{
 const f=fixture(),save=f.repo.save;let failed=false;f.repo.save=async(kind,rows)=>{if(kind==='interventions'&&!failed){failed=true;throw Error('write interrupted');}return save(kind,rows);};
 await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(f.deleted.length,0);assert.ok(f.records.interventions[0].photos);assert.ok(f.records.projectTracking[0].retentionPlan);
 const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now:new Date(+now+86400000)});assert.equal(result.purged,1);assert.equal(f.deleted.length,0);assert.equal(f.records.interventions[0].photos,undefined);
});
test('a report changed during permanent archiving is retained and flagged for office review',async()=>{
 const f=fixture();f.verifyArchive=async()=>{f.records.interventions[0].summary='New work';};
 const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(result.conflicts,1);assert.equal(f.records.interventions[0].summary,'New work');assert.ok(f.records.interventions[0].photos);assert.ok(f.records.projectTracking[0].retentionError);assert.equal(f.records.projectTracking[0].retentionPurgedAt,undefined);
});
test('an unrelated missing project is never treated as a previously authorized deletion',async()=>{
 const f=fixture();f.setExists(false);const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(result.purged,0);assert.ok(f.records.interventions[0].photos);
});
test('an active maintenance lock and a restored purged folder prevent another deletion',async()=>{
 const f=fixture();f.setLock({id:'other-lock',eTag:'tag',createdDateTime:now.toISOString()});assert.deepEqual(await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now}),{busy:true});assert.equal(f.saved.length,0);
 f.setLock(null);f.records.projectTracking[0].retentionPurgedAt=now.toISOString();await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(f.deleted.length,0);
});
test('compacting reports preserves payroll results, numbering, and removes embedded media',()=>{
 const report={id:'r',projectId:'p',number:'INT-2026-0001',clientName:'Client',status:'terminee',teamIds:['worker'],actualStart:'2026-08-03T08:00:00Z',actualEnd:'2026-08-03T17:00:00Z',pauseHours:1,photos:['data:image/jpeg;base64,AAA'],reportItems:[{photo:'large'}],teamActuals:[{id:'worker',hours:8,photo:'data:image/jpeg;base64,BBB'}]};
 const data={people:[{id:'worker',name:'Worker',active:true,weeklyTarget:39}],events:[],closures:[],visits:[],interventions:[report]};const before=payrollRows(data,'2026-08'),compact=compactReport(report,now.toISOString());
 assert.deepEqual(payrollRows({...data,interventions:[compact]},'2026-08'),before);assert.equal(compact.photos,undefined);assert.equal(compact.reportItems,undefined);assert.equal(compact.teamActuals[0].hours,8);assert.equal(compact.teamActuals[0].photo,undefined);
});
function local(initial){const records=new Map(initial);return {records,get:async key=>records.get(key),set:async(key,value)=>records.set(key,value),remove:async key=>records.delete(key),keys:async prefix=>[...records.keys()].filter(key=>key.startsWith(prefix))};}
test('local cleanup removes only acknowledged project caches and retains unrelated or pending assets',async()=>{
 const s=local([['meta:p',{data:'old'}],['att:p:form',{}],['attdirs:p',[]],['revision-meta:rev',{}],['asset:asset',new Blob(['old'])],['asset:shared',new Blob(['keep'])],['file:photo:etag',new Blob(['pdf'])],['asset:other',new Blob(['keep'])],['draft:active:form:r',{projectId:'active',payload:{$opusAsset:{id:'shared'}}}],['meta:active',{}]]);
 const row={id:'p',retentionPurgedAt:now.toISOString(),retentionCacheIds:['rev','asset','shared','photo']};const result=await cleanPurgedLocal(s,[row]);assert.deepEqual(result.cleaned,['p']);assert.equal(s.records.has('meta:p'),false);assert.equal(s.records.has('file:photo:etag'),false);assert.equal(s.records.has('revision-meta:rev'),false);assert.equal(s.records.has('asset:asset'),false);assert.ok(s.records.has('asset:shared'));assert.ok(s.records.has('asset:other'));assert.ok(s.records.has('draft:active:form:r'));assert.ok(s.records.has('meta:active'));
 assert.deepEqual((await cleanPurgedLocal(s,[row])).cleaned,[]);
});
test('a project with an unsent draft, recovery or PDF keeps its local copies',async()=>{
 for(const prefix of ['draft:','pdfoutbox:','report-recovery:']){const s=local([['meta:p',{keep:true}],[prefix+'one',{projectId:'p'}]]);const result=await cleanPurgedLocal(s,[{id:'p',retentionPurgedAt:now.toISOString(),retentionCacheIds:[]}]);assert.deepEqual(result.deferred,['p']);assert.ok(s.records.has('meta:p'));assert.ok(s.records.has(prefix+'one'));assert.equal(s.records.has('retention-applied:p'),false);}
});
test('disabled or incomplete server configuration never contacts Microsoft',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('Must not fetch');};assert.deepEqual(await scheduledRetention({},{fetcher}),{disabled:true});assert.deepEqual(await scheduledRetention({OPUS_RETENTION_ENABLED:'true'},{fetcher}),{disabled:true,reason:'permanent_archive_policy_not_activated'});await assert.rejects(scheduledRetention({OPUS_RETENTION_ENABLED:'true',OPUS_RETENTION_POLICY:'permanent-onedrive-v1'},{fetcher}),/non configuré/);assert.equal(calls,0);
});
test('the daily endpoint rejects missing or wrong credentials and non-GET requests',async()=>{
 let calls=0;const handler=createHandler({env:{CRON_SECRET:'secret'},runner:async()=>{calls++;return {purged:1};}}),response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
 for(const authorization of [undefined,'Bearer wrong']){const res=response();await handler({method:'GET',headers:{authorization}},res);assert.equal(res.code,401);}const post=response();await handler({method:'POST',headers:{authorization:'Bearer secret'}},post);assert.equal(post.code,405);assert.equal(calls,0);
 const res=response();await handler({method:'GET',headers:{authorization:'Bearer secret'}},res);assert.equal(res.code,200);assert.equal(res.body.purged,1);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(calls,1);
});

test('a resumed withdrawal recognizes a collection already compacted and keeps the source folder',async()=>{
 const f=fixture();f.records.visits=[{id:'v',projectId:'p',status:'terminee',createdAt:old,photos:['keep until saved']}];const save=f.repo.save;let failed=false;
 f.repo.save=async(kind,rows)=>{if(kind==='visits'&&!failed){failed=true;throw Error('visit write interrupted');}return save(kind,rows);};
 await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(f.records.interventions[0].photos,undefined);assert.ok(f.records.visits[0].photos);assert.ok(f.records.projectTracking[0].retentionPlan);
 const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now:new Date(+now+86400000)});assert.equal(result.purged,1);assert.equal(f.records.visits[0].photos,undefined);assert.equal(f.deleted.length,0);
});
test('the client repository rejects heavy content added back to a purged report before any remote write',async()=>{
 const repo=new OpsRepository({});const compact=compactReport({id:'r',projectId:'p',number:'INT-2026-0001'},now.toISOString());
 await assert.rejects(repo.save('interventions',[{...compact,photos:['new photo']}]),/archivé/);
});

test('photos referenced by another active report defer removal of their parent project folder',async()=>{
 const f=fixture();f.records.interventions[1].sharedPhoto={$opusAsset:{id:'photo'}};const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(result.purged,0);assert.equal(f.deleted.length,0);
});
test('local photo caches still referenced by an active report remain available offline',async()=>{
 const s=local([['asset:shared',new Blob(['keep'])]]);await cleanPurgedLocal(s,[{id:'p',retentionPurgedAt:now.toISOString(),retentionCacheIds:['shared']}],{activeRecords:[{projectId:'active',photo:{$opusAsset:{id:'shared'}}}]});assert.equal(s.records.has('asset:shared'),true);
});

test('a folder restored after the removal phase is suspended for office review',async()=>{
 const f=fixture();f.records.projectTracking[0].retentionPlan={phase:'folder-removed',at:now.toISOString(),signatures:{interventions:{},visits:{}},cacheIds:[]};
 const result=await runRetention(f.graph,{repo:f.repo,archiveRecord:f.archiveRecord,verifyArchive:f.verifyArchive,now});assert.equal(result.conflicts,1);assert.equal(f.deleted.length,0);assert.ok(f.records.interventions[0].photos);
});
