import test from 'node:test';
import assert from 'node:assert/strict';
import {OpsRepository} from '../lib/ops.js';
import {interventionArchiveDue} from '../lib/intervention-archive.js';
import {preservePermanentRecord,verifyPermanentArchive} from '../server/permanent-archive.js';
import {runDeviceArchive,archiveModeEnabled,archiveModeKey} from '../lib/archive-maintenance.js';
import {archiveCompletedInterventions} from '../server/intervention-retention.js';
import {isIndependentIntervention,officeReports} from '../lib/work-records.js';
import {payrollRows} from '../lib/workforce.js';
import {cleanPurgedLocal} from '../lib/project-retention.js';

const now=new Date('2026-10-29T10:00:00Z'),completed='2026-10-14T10:00:00Z';
class Drive{
 async projects(){return {projects:[],categories:[]};}
 constructor(){this.rows=new Map();this.serial=0;this.writes=0;this.beforeWrite=null;this.drive={id:'drive'};}
 meta(row){const {blob,...rest}=row;return structuredClone(rest);}
 put(parent,name,blob=null){const id='file-'+(++this.serial),row={id,name,parentReference:{id:parent},eTag:'tag-'+this.serial,size:blob?.size||0,webUrl:'https://opuselec.sharepoint.com/archive/'+id,blob,...(blob?{file:{}}:{folder:{}})};this.rows.set(id,row);return this.meta(row);}
 async named(parent,name){const row=[...this.rows.values()].find(row=>row.parentReference.id===parent&&row.name===name);return row?this.meta(row):null;}
 async folder(parent,name){return await this.named(parent,name)||this.put(parent,name);}
 async item(id){if(!this.rows.has(id))throw Object.assign(Error('missing'),{status:404});return this.meta(this.rows.get(id));}
 async children(parent){return [...this.rows.values()].filter(row=>row.parentReference.id===parent).map(row=>this.meta(row));}
 async bytes(id){return this.rows.get(id).blob;}
 async json(id){return JSON.parse(await this.rows.get(id).blob.text());}
 async upload(parent,name,blob){assert.equal(await this.named(parent,name),null);return this.put(parent,name,blob);}
 async writeJson(parent,name,value,conditions={}){if(this.beforeWrite)await this.beforeWrite(parent,name);const file=await this.named(parent,name);if(file&&conditions['If-Match']&&conditions['If-Match']!==file.eTag)throw Object.assign(Error('conflict'),{status:412});this.writes++;const blob=new Blob([JSON.stringify(value)]);if(!file)return this.put(parent,name,blob);const row=this.rows.get(file.id);row.blob=blob;row.size=blob.size;row.eTag='tag-'+(++this.serial);return this.meta(row);}
 base(id){return '/items/'+id;}
 async request(path,options){assert.equal(options.method,'POST');const parent=path.split('/')[2];if(await this.named(parent,options.body.name))throw Object.assign(Error('busy'),{status:409});const item=this.put(parent,options.body.name);this.rows.get(item.id).createdDateTime=new Date().toISOString();return this.item(item.id);}
 async deleteItem(id,conditions){assert.equal(this.rows.get(id)?.name,'_RETENTION_RUNNING','Permanent archive must never delete a source file');assert.equal(conditions['If-Match'],this.rows.get(id).eTag);this.rows.delete(id);}
}
async function fixture(){
 const graph=new Drive(),pdf=graph.put('originals','original.pdf',new Blob(['%PDF-1.4 rapport complet'],{type:'application/pdf'})),image=graph.put('originals','photo.jpg',new Blob(['photo bytes'],{type:'image/jpeg'})),order=graph.put('orders','ordre.pdf',new Blob(['%PDF-1.4 ordre service'],{type:'application/pdf'}));
 const row={id:'int-one',number:'INT-2026-0080',clientName:'Client',status:'terminee',completedAt:completed,completionRecordedAt:completed,updatedAt:completed,pdfSavedAt:completed,pdfFileId:pdf.id,pdfName:pdf.name,photos:[{dataUrl:{$opusAsset:{id:image.id,mime:'image/jpeg'}}}],reportItems:[{title:'Essai',observation:'Réalisé'}],sourceDocuments:[{id:order.id,name:order.name}],actualStart:'2026-10-28T08:00:00Z',actualEnd:completed,teamIds:['worker'],pauseHours:0,billingAgreement:'Accord client',invoiceNumber:'FACT-80',invoicedAt:completed};
 const system=await graph.folder('root','_OPUS_SYSTEM'),file=graph.put(system.id,'interventions.json',new Blob([JSON.stringify([row,{id:'active',status:'planifiee',photos:['keep']}])])),repo=new OpsRepository(graph);await repo.init();
 return {graph,repo,row,file,pdf,image,order};
}
test('the intervention clock is exactly 15 days after confirmed completion and recent edits defer it',()=>{
 const row={id:'one',status:'terminee',completionRecordedAt:completed};assert.equal(interventionArchiveDue(row,new Date(+now-1)),false);assert.equal(interventionArchiveDue(row,now),true);
 assert.equal(interventionArchiveDue({...row,updatedAt:new Date(+now-1000).toISOString()},now),false);assert.equal(interventionArchiveDue({...row,projectId:'project'},now),false);assert.equal(interventionArchiveDue({...row,status:'en_cours'},now),false);assert.equal(interventionArchiveDue({id:'old',status:'terminee'},now),false);
 assert.equal(interventionArchiveDue(row,now,[{kind:'intervention',linkId:'one',end:new Date(+now+1000).toISOString()}]),false);
});
test('a permanent archive contains a checked PDF, standalone photos, source attachments and a self-contained full snapshot',async()=>{
 const f=await fixture(),archive=await preservePermanentRecord(f.graph,f.repo,f.row,{requirePdf:true,now}),manifest=await verifyPermanentArchive(f.graph,archive);
 const snapshot=await f.graph.json(archive.snapshotId);assert.equal(snapshot.record.reportItems[0].observation,'Réalisé');assert.match(snapshot.record.photos[0].dataUrl,/^data:image\/jpeg;base64,/);assert.ok(manifest.files.some(file=>file.name.startsWith('PHOTO_')));assert.equal(await (await f.graph.bytes(archive.pdfId)).text(),'%PDF-1.4 rapport complet');assert.ok(await f.graph.item(f.pdf.id));assert.ok(await f.graph.item(f.image.id));assert.ok(await f.graph.item(f.order.id));assert.equal(f.graph.writes,0);
});
test('an already confirmed permanent archive is reused after a lost final response without another copy',async()=>{
 const f=await fixture(),first=await preservePermanentRecord(f.graph,f.repo,f.row,{requirePdf:true,now}),count=f.graph.rows.size,second=await preservePermanentRecord(f.graph,f.repo,f.row,{requirePdf:true,now:new Date(+now+1000)});assert.equal(first.manifestId,second.manifestId);assert.equal(f.graph.rows.size,count);
});
test('after 15 days the app record becomes light only after permanent verification, preserving payroll and invoice fields',async()=>{
 const f=await fixture(),before={people:[{id:'worker',name:'Worker',active:true,weeklyTarget:39}],events:[],visits:[],closures:[],interventions:[f.row]},payroll=payrollRows(before,'2026-10');
 const result=await archiveCompletedInterventions(f.graph,f.repo,{now});assert.equal(result.archived,1);const rows=await f.graph.json(f.file.id),row=rows[0];assert.ok(row.appArchivedAt);assert.equal(row.photos,undefined);assert.equal(row.reportItems,undefined);assert.equal(row.invoiceNumber,'FACT-80');assert.equal(row.billingAgreement,'Accord client');assert.equal(rows[1].photos[0],'keep');assert.equal(isIndependentIntervention(row),false);assert.deepEqual(officeReports({interventions:[row],visits:[]}),[]);assert.deepEqual(payrollRows({...before,interventions:[row]},'2026-10'),payroll);assert.ok(await f.graph.item(f.pdf.id));
 const again=await archiveCompletedInterventions(f.graph,f.repo,{now});assert.equal(again.archived,0);
});
test('a missing PDF, unreadable photo or corrupted archive keeps the complete intervention in the app',async()=>{
 for(const failure of ['pdf','photo','archive']){const f=await fixture();if(failure==='pdf')f.graph.rows.delete(f.pdf.id);if(failure==='photo')f.graph.rows.delete(f.image.id);if(failure==='archive'){const bytes=f.graph.bytes.bind(f.graph);f.graph.bytes=async id=>f.graph.rows.get(id)?.name.includes('_manifest')?new Blob(['corrupt']):bytes(id);}
  const result=await archiveCompletedInterventions(f.graph,f.repo,{now});assert.equal(result.archived,0);const row=(await f.graph.json(f.file.id))[0];assert.ok(row.photos);assert.equal(row.appArchivedAt,undefined);assert.equal(f.graph.writes,0);
 }
});
test('a report changed during copying is kept active, with the already copied archive left intact',async()=>{
 const f=await fixture(),verify=async(graph,archive)=>{await verifyPermanentArchive(graph,archive);const row=f.graph.rows.get(f.file.id),rows=JSON.parse(await row.blob.text());rows[0].reportItems[0].observation='Nouvelle saisie';row.blob=new Blob([JSON.stringify(rows)]);row.eTag='newer';};
 const result=await archiveCompletedInterventions(f.graph,f.repo,{now,verifyArchive:verify});assert.equal(result.archived,0);const row=(await f.graph.json(f.file.id))[0];assert.equal(row.reportItems[0].observation,'Nouvelle saisie');assert.equal(row.appArchivedAt,undefined);
});
test('a conditional index conflict never discards the intervention or its originals',async()=>{
 const f=await fixture();f.graph.beforeWrite=async()=>{f.graph.beforeWrite=null;f.graph.rows.get(f.file.id).eTag='changed';};const result=await archiveCompletedInterventions(f.graph,f.repo,{now});assert.equal(result.archived,0);assert.ok((await f.graph.json(f.file.id))[0].photos);assert.ok(await f.graph.item(f.pdf.id));
});
test('a PDF imported as the current report is still recognized as the required PDF',async()=>{
 const f=await fixture();f.row.reportImports=[{fileId:f.pdf.id,name:'rapport-importe.pdf'}];const archive=await preservePermanentRecord(f.graph,f.repo,f.row,{requirePdf:true,now});assert.ok(archive.pdfId);
});
test('an independently saved local report prevents cache removal after its app record is archived',async()=>{
 const records=new Map([['report-recovery:int-one',{id:'int-one',notes:'Not sent'}],['asset:photo',new Blob(['keep'])]]),store={get:async key=>records.get(key),set:async(key,value)=>records.set(key,value),remove:async key=>records.delete(key),keys:async prefix=>[...records.keys()].filter(key=>key.startsWith(prefix))};
 const result=await cleanPurgedLocal(store,[{id:'int-one',retentionPurgedAt:now.toISOString(),retentionCacheIds:['photo']}]);assert.deepEqual(result.deferred,['int-one']);assert.ok(records.has('asset:photo'));assert.ok(records.has('report-recovery:int-one'));
});

test('light billing changes on an archived intervention remain saveable regardless of object key order',async()=>{
 const f=await fixture();await archiveCompletedInterventions(f.graph,f.repo,{now});const rows=await f.repo.load('interventions',[]),r=rows[0];delete r.invoiceNumber;delete r.invoicedAt;r.status='facturee';r.invoiceNumber='FACT-NEW';r.invoicedAt=now.toISOString();r.history=[{at:now.toISOString(),action:'Facturation'}];await f.repo.save('interventions',rows);const saved=(await f.graph.json(f.file.id))[0];assert.equal(saved.invoiceNumber,'FACT-NEW');assert.ok(saved.permanentArchive.manifestId);
});

test('several completed interventions are permanently archived with one conditional index write',async()=>{
 const f=await fixture();await f.graph.writeJson(f.repo.root.id,'interventions.json',[f.row,{...f.row,id:'int-two',number:'INT-2026-0081'}]);f.graph.writes=0;const result=await archiveCompletedInterventions(f.graph,f.repo,{now});assert.equal(result.archived,2);assert.equal(f.graph.writes,1);assert.ok((await f.graph.json(f.file.id)).every(row=>row.appArchivedAt));
});
test('email deduplication keeps its identifier while the archived mail body leaves the active list',async()=>{
 for(const mail of [{id:'mail-one',text:'Long original email body'},{text:'Text without a mailbox identity'}]){const f=await fixture();const rows=await f.repo.load('interventions',[]);rows[0].sourceEmail=mail;await f.repo.save('interventions',rows);await archiveCompletedInterventions(f.graph,f.repo,{now});const row=(await f.graph.json(f.file.id))[0];assert.deepEqual(row.sourceEmail,mail.id?{id:'mail-one'}:undefined);await f.repo.save('interventions',await f.repo.load('interventions',[]));}
});

test('opening a work form while archiving pauses before the active index is changed',async()=>{
 const f=await fixture();let pause=false;const verify=async(g,a)=>{await verifyPermanentArchive(g,a);pause=true;};const result=await archiveCompletedInterventions(f.graph,f.repo,{now,verifyArchive:verify,check:()=>{if(pause)throw Object.assign(Error('Work form open'),{code:'archive_pause'});}});assert.equal(result.archived,0);assert.equal(f.graph.writes,0);assert.ok((await f.graph.json(f.file.id))[0].photos);
});
test('the signed-in browser can archive through Graph without a server secret and releases only its maintenance lock',async()=>{
 const f=await fixture(),result=await runDeviceArchive(f.graph,{now});assert.equal(result.archived,1);assert.ok((await f.graph.json(f.file.id))[0].appArchivedAt);assert.equal(await f.graph.named(f.repo.root.id,'_RETENTION_RUNNING'),null);assert.ok(await f.graph.item(f.pdf.id));
});
test('automatic archive activation is isolated by both account and document library',()=>{
 const a={namespace:'account-a'},b={namespace:'account-b'},graph={drive:{id:'drive-one'}},values=new Map(),storage={getItem:key=>values.get(key)};assert.equal(archiveModeEnabled(a,graph,storage),false);values.set(archiveModeKey(a,graph),'1');assert.equal(archiveModeEnabled(a,graph,storage),true);assert.equal(archiveModeEnabled(b,graph,storage),false);assert.equal(archiveModeEnabled(a,{drive:{id:'other'}},storage),false);
});

test('overlapping archive attempts keep separate immutable copies and their receipts stay valid',async()=>{
 const f=await fixture();const root=await f.graph.folder('root','ARCHIVES_PERMANENTES_OPUS'),reports=await f.graph.folder(root.id,'RAPPORTS'),year=await f.graph.folder(reports.id,'2026');await f.graph.folder(year.id,f.row.number+'_'+f.row.id);
 const [a,b]=await Promise.all([preservePermanentRecord(f.graph,f.repo,f.row,{requirePdf:true,now}),preservePermanentRecord(f.graph,f.repo,f.row,{requirePdf:true,now})]);assert.notEqual(a.folderId,b.folderId);await verifyPermanentArchive(f.graph,a);await verifyPermanentArchive(f.graph,b);const count=f.graph.rows.size;const reused=await preservePermanentRecord(f.graph,f.repo,f.row,{requirePdf:true,now});assert.ok([a.manifestId,b.manifestId].includes(reused.manifestId));assert.equal(f.graph.rows.size,count);
});

test('completed visits are compacted in one batch only after their preparation attachment is copied',async()=>{
 const f=await fixture(),visit={...f.row,id:'visit-one',number:'VIS-2026-0080',quoteNumber:'D-80',attachments:[{fileId:f.order.id,name:'preparation.pdf'}]};delete visit.sourceDocuments;
 await f.graph.writeJson(f.repo.root.id,'visits.json',[visit]);f.graph.writes=0;
 const result=await archiveCompletedInterventions(f.graph,f.repo,{kind:'visits',now});assert.equal(result.archived,1);assert.equal(f.graph.writes,1);
 const rows=await f.repo.load('visits',[]);assert.equal(rows[0].quoteNumber,'D-80');assert.equal(rows[0].photos,undefined);const manifest=await verifyPermanentArchive(f.graph,rows[0].permanentArchive);assert.ok(manifest.files.some(file=>file.sourceId===f.order.id));assert.equal((await f.repo.load('interventions',[]))[0].appArchivedAt,undefined);
});
