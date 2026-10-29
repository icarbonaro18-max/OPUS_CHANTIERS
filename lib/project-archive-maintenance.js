import {archiveCompletedInterventions} from './intervention-retention.js';
import {recordHash,preservePermanentRecord,verifyPermanentArchive} from './permanent-archive.js';
import {OpsRepository} from './ops.js';
import {RETENTION,stamp,deletionDate,inspectQuietProject,compactReport,assetIds} from './project-retention.js';

const hash=recordHash;
const linked=(row,id)=>row.projectId===id||row.convertedProjectId===id;
const LOCK='_RETENTION_RUNNING';

async function acquireLock(graph,root,now){
 const existing=await graph.named(root,LOCK);
 if(existing){
  if(!stamp(existing.createdDateTime)||+now-stamp(existing.createdDateTime)<10*60*1000)return null;
  if(!existing.eTag)return null;
  try{await graph.deleteItem(existing.id,{'If-Match':existing.eTag});}catch(error){if([404,412].includes(error.status))return null;throw error;}
 }
 try{return await graph.request(graph.base(root)+'/children',{method:'POST',body:{name:LOCK,folder:{},'@microsoft.graph.conflictBehavior':'fail'}});}
 catch(error){if(error.status===409)return null;throw error;}
}

export async function runRetention(graph,{now=new Date(),repo=new OpsRepository(graph),budgetMs=150000,limit=100,check:externalCheck=()=>{},onProgress=()=>{},archiveRecord=preservePermanentRecord,verifyArchive=verifyPermanentArchive}={}){
 const started=Date.now(),check=()=>{externalCheck();if(Date.now()-started>budgetMs)throw Object.assign(Error('Traitement reporté à la prochaine exécution.'),{code:'retention_budget'});};
 await repo.init();const lock=await acquireLock(graph,repo.root.id,now);if(!lock)return {busy:true};
 let data;const summary={archived:0,purged:0,initialized:0,deferred:0,conflicts:0};
 const saveRow=async row=>{const next=[...data.projectTracking.filter(x=>x.id!==row.id),row];await repo.save('projectTracking',next);data.projectTracking=next;return row;};
 const ui=()=>({data,c:{isAdmin:()=>true,graph}});
 const finish=async row=>{
  const plan=row.retentionPlan;if(!plan?.archives)throw Error('Plan de conservation permanente absent.');
  check();const source=await graph.item(row.id);if(source.parentReference?.id!==plan.sourceParent||source.eTag!==plan.sourceTag)throw Object.assign(Error('Le dossier OneDrive a changé ; conservation dans l’application maintenue.'),{code:'retention_conflict'});
  for(const archive of plan.archives)await verifyArchive(graph,archive,{check});
  // Re-read after a restart or lost response. Conditional writes preserve any
  // newer work and permit resuming after one collection has already succeeded.
  for(const kind of ['interventions','visits']){
   check();const rows=await repo.load(kind,[]);let changed=false;
   const next=[];for(const record of rows){
    if(!linked(record,row.id)||record.retentionPurgedAt===plan.at){next.push(record);continue;}
    if(plan.signatures[kind][record.id]!==await hash(record))throw Object.assign(Error('Une fiche a changé pendant le nettoyage ; contrôle au bureau requis.'),{code:'retention_conflict'});
    const archive=plan.reportArchives?.[kind+':'+record.id];changed=true;next.push(compactReport({...record,...(archive?{appArchivedAt:plan.at,permanentArchive:archive}:{})},plan.at));
   }
   check();if(changed)await repo.save(kind,next);data[kind]=next;
  }
  check();const done={...row,projectName:row.projectName||source.name||row.id,retentionPurgedAt:plan.at,retentionCacheIds:plan.cacheIds,permanentArchive:{folderId:row.id,webUrl:source.webUrl||'',reports:plan.archives}};delete done.retentionPlan;delete done.retentionError;await saveRow(done);summary.purged++;
 };
 try{
  check();data=await repo.loadAll();const interventionResult=await archiveCompletedInterventions(graph,repo,{now,limit,check,onProgress,archiveRecord,verifyArchive});summary.interventionsArchived=interventionResult.archived;summary.deferred+=interventionResult.deferred;check();const visitResult=await archiveCompletedInterventions(graph,repo,{kind:'visits',now,limit,check,onProgress,archiveRecord,verifyArchive});summary.visitsArchived=visitResult.archived;summary.deferred+=visitResult.deferred;check();data=await repo.loadAll();const catalog=await graph.projects();
  // Pending index reductions take priority. Permanent source folders are never deleted.
  const pending=data.projectTracking.filter(row=>row.retentionPlan&&!row.retentionPurgedAt);
  const ids=new Set(pending.map(row=>row.id));
  const projects=[...pending.map(row=>catalog.projects.find(p=>p.id===row.id)||{id:row.id,category:'missing'}),...catalog.projects.filter(p=>!ids.has(p.id)&&['04','99'].includes(p.category)).sort((a,b)=>stamp(data.projectTracking.find(r=>r.id===a.id)?.archivedAt)-stamp(data.projectTracking.find(r=>r.id===b.id)?.archivedAt))];
  for(const project of projects){
   check();if(summary.purged>=limit){summary.deferred++;break;}
   let row=data.projectTracking.find(x=>x.id===project.id)||{id:project.id};
   if(row.retentionPurgedAt)continue; // A restored folder requires a deliberate office decision.
   if(row.retentionError){summary.conflicts++;continue;}
   try{
    if(project.category==='missing'){if(row.retentionPlan)throw Object.assign(Error('Le dossier OneDrive est introuvable. Aucune donnée supplémentaire n’est retirée de l’application.'),{code:'retention_conflict'});continue;}
    if(!['04','99'].includes(project.category))throw Object.assign(Error('Le chantier a été rouvert pendant le nettoyage.'),{code:'retention_conflict'});
    if(row.retentionPlan?.phase==='folder-removed')throw Object.assign(Error('Ancien plan de suppression suspendu : vérifier la présence des originaux dans OneDrive.'),{code:'retention_conflict'});
    if(row.retentionPlan?.phase==='source-preserved'){await finish(row);continue;}
    if(!deletionDate(row)){await saveRow({...row,completedAt:now.toISOString()});summary.initialized++;continue;}
    if(+now<Date.parse(deletionDate(row))){summary.deferred++;continue;}
    onProgress({stage:'Vérification du chantier dans OneDrive',number:project.name||project.id});
    const inspect=()=>inspectQuietProject(ui(),project,now,{days:RETENTION.archiveRetentionDays,anchor:row.completedAt||row.archivedAt,check});
    const quiet=await inspect();if(!quiet.eligible){summary.deferred++;continue;}
    const sharedAssets=new Set();for(const kind of ['interventions','visits'])for(const record of data[kind])if(!linked(record,row.id)&&!record.retentionPurgedAt)assetIds(record,sharedAssets);
    if(quiet.cacheIds.some(id=>sharedAssets.has(id))){summary.deferred++;continue;}
    const archive=project.categoryFolder;
    if(!quiet.root?.eTag||quiet.root.parentReference?.id!==archive?.id)throw Error('Classement Archives non confirmé.');
    {
     const signatures={interventions:{},visits:{}},cacheIds=new Set(quiet.cacheIds),archives=[],reportArchives={};
     for(const kind of Object.keys(signatures))for(const record of data[kind].filter(r=>linked(r,row.id))){signatures[kind][record.id]=await hash(record);assetIds(record,cacheIds);const saved=await archiveRecord(graph,repo,record,{kind,now,check});archives.push(saved);reportArchives[kind+':'+record.id]=saved;}
     row=await saveRow({...row,retentionPlan:{at:now.toISOString(),phase:'prepared',signatures,cacheIds:[...cacheIds],archives,reportArchives,sourceParent:quiet.root.parentReference.id,sourceTag:quiet.root.eTag}});
    }
    // Writing the journal must not hide a change made to a nested document.
    const verify=await inspect();if(!verify.eligible||verify.fingerprint!==quiet.fingerprint){summary.deferred++;continue;}
    check();row=await saveRow({...row,retentionPlan:{...row.retentionPlan,phase:'source-preserved'}});await finish(row);
   }catch(error){
    if(error.code==='retention_budget'||error.code==='archive_pause')throw error;
    if(error.code==='retention_conflict'){
     // Reload tracking so this diagnostic cannot overwrite a concurrent office edit.
     data.projectTracking=await repo.load('projectTracking',[]);const fresh=data.projectTracking.find(x=>x.id===row.id)||row;
     await saveRow({...fresh,retentionError:{at:now.toISOString(),message:error.message}});summary.conflicts++;
    }else{summary.deferred++;console.warn('Nettoyage différé',project.id,error.status||error.code||'non confirmé');}
   }
  }
  return summary;
 }catch(error){if(error.code==='retention_budget'||error.code==='archive_pause')return {...summary,deferred:summary.deferred+1};throw error;}
 finally{try{if(lock.eTag)await graph.deleteItem(lock.id,{'If-Match':lock.eTag});}catch{console.warn('Verrou de nettoyage conservé jusqu’à expiration.');}}
}

