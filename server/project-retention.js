import {archiveCompletedInterventions} from './intervention-retention.js';
import {preservePermanentRecord,verifyPermanentArchive} from './permanent-archive.js';
import {createHash} from 'node:crypto';
import {Graph} from '../lib/cloud.js';
import {OpsRepository} from '../lib/ops.js';
import {canAutoArchive} from '../lib/project-lifecycle.js';
import {RETENTION,stamp,deletionDate,inspectQuietProject,compactReport,assetIds} from '../lib/project-retention.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

export async function runRetention(graph,{now=new Date(),repo=new OpsRepository(graph),budgetMs=150000,limit=100,archiveRecord=preservePermanentRecord,verifyArchive=verifyPermanentArchive}={}){
 const started=Date.now(),check=()=>{if(Date.now()-started>budgetMs)throw Object.assign(Error('Traitement reporté à la prochaine exécution.'),{code:'retention_budget'});};
 await repo.init();const lock=await acquireLock(graph,repo.root.id,now);if(!lock)return {busy:true};
 let data;const summary={archived:0,purged:0,initialized:0,deferred:0,conflicts:0};
 const saveRow=async row=>{const next=[...data.projectTracking.filter(x=>x.id!==row.id),row];await repo.save('projectTracking',next);data.projectTracking=next;return row;};
 const ui=()=>({data,c:{isAdmin:()=>true,graph}});
 const finish=async row=>{
  const plan=row.retentionPlan;if(!plan?.archives)throw Error('Plan de conservation permanente absent.');
  const source=await graph.item(row.id);if(source.parentReference?.id!==plan.sourceParent||source.eTag!==plan.sourceTag)throw Object.assign(Error('Le dossier OneDrive a changé ; conservation dans l’application maintenue.'),{code:'retention_conflict'});
  for(const archive of plan.archives)await verifyArchive(graph,archive,{check});
  // Re-read after a restart or lost response. Conditional writes preserve any
  // newer work and permit resuming after one collection has already succeeded.
  for(const kind of ['interventions','visits']){
   check();const rows=await repo.load(kind,[]);let changed=false;
   const next=rows.map(record=>{
    if(!linked(record,row.id))return record;
    if(record.retentionPurgedAt===plan.at)return record;
    if(plan.signatures[kind][record.id]!==hash(record))throw Object.assign(Error('Une fiche a changé pendant le nettoyage ; contrôle au bureau requis.'),{code:'retention_conflict'});
    const archive=plan.reportArchives?.[kind+':'+record.id];changed=true;return compactReport({...record,...(archive?{appArchivedAt:plan.at,permanentArchive:archive}:{})},plan.at);
   });
   if(changed)await repo.save(kind,next);data[kind]=next;
  }
  const done={...row,projectName:row.projectName||source.name||row.id,retentionPurgedAt:plan.at,retentionCacheIds:plan.cacheIds,permanentArchive:{folderId:row.id,webUrl:source.webUrl||'',reports:plan.archives}};delete done.retentionPlan;delete done.retentionError;await saveRow(done);summary.purged++;
 };
 try{
  check();data=await repo.loadAll();const interventionResult=await archiveCompletedInterventions(graph,repo,{now,limit,check,archiveRecord,verifyArchive});summary.interventionsArchived=interventionResult.archived;summary.deferred+=interventionResult.deferred;check();data=await repo.loadAll();const catalog=await graph.projects();
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
    if(project.category==='04'){
     if(row.retentionPlan)throw Object.assign(Error('Le chantier a été rouvert pendant le nettoyage.'),{code:'retention_conflict'});
     if(!stamp(row.completedAt)){await saveRow({...row,completedAt:now.toISOString()});summary.initialized++;continue;}
     if(await canAutoArchive(ui(),project,now,{check})){
      check();const category=catalog.categories.find(c=>c.name.trim().startsWith('99'));if(!category)throw Error('Rubrique Archives absente.');
      const item=await graph.item(project.id);if(!item.eTag||item.parentReference?.id!==project.categoryFolder.id)throw Error('Classement du chantier non confirmé.');
      await graph.moveProject(item,category);await saveRow({...row,archivedAt:now.toISOString()});summary.archived++;
     }continue;
    }
    if(project.category!=='99')throw Object.assign(Error('Le chantier a été rouvert pendant le nettoyage.'),{code:'retention_conflict'});
    if(row.retentionPlan?.phase==='folder-removed')throw Object.assign(Error('Ancien plan de suppression suspendu : vérifier la présence des originaux dans OneDrive.'),{code:'retention_conflict'});
    if(row.retentionPlan?.phase==='source-preserved'){await finish(row);continue;}
    if(!stamp(row.archivedAt)){await saveRow({...row,archivedAt:now.toISOString()});summary.initialized++;continue;}
    if(+now<Date.parse(deletionDate(row))){summary.deferred++;continue;}
    const inspect=()=>inspectQuietProject(ui(),project,now,{days:RETENTION.archiveRetentionDays,anchor:row.archivedAt,check});
    const quiet=await inspect();if(!quiet.eligible){summary.deferred++;continue;}
    const sharedAssets=new Set();for(const kind of ['interventions','visits'])for(const record of data[kind])if(!linked(record,row.id)&&!record.retentionPurgedAt)assetIds(record,sharedAssets);
    if(quiet.cacheIds.some(id=>sharedAssets.has(id))){summary.deferred++;continue;}
    const archive=catalog.categories.find(c=>c.name.trim().startsWith('99'));
    if(!quiet.root?.eTag||quiet.root.parentReference?.id!==archive?.id)throw Error('Classement Archives non confirmé.');
    {
     const signatures={interventions:{},visits:{}},cacheIds=new Set(quiet.cacheIds),archives=[],reportArchives={};
     for(const kind of Object.keys(signatures))for(const record of data[kind].filter(r=>linked(r,row.id))){signatures[kind][record.id]=hash(record);assetIds(record,cacheIds);const saved=await archiveRecord(graph,repo,record,{kind,now,check});archives.push(saved);reportArchives[kind+':'+record.id]=saved;}
     row=await saveRow({...row,retentionPlan:{at:now.toISOString(),phase:'prepared',signatures,cacheIds:[...cacheIds],archives,reportArchives,sourceParent:quiet.root.parentReference.id,sourceTag:quiet.root.eTag}});
    }
    // Writing the journal must not hide a change made to a nested document.
    const verify=await inspect();if(!verify.eligible||verify.fingerprint!==quiet.fingerprint){summary.deferred++;continue;}
    check();row=await saveRow({...row,retentionPlan:{...row.retentionPlan,phase:'source-preserved'}});await finish(row);
   }catch(error){
    if(error.code==='retention_budget')throw error;
    if(error.code==='retention_conflict'){
     // Reload tracking so this diagnostic cannot overwrite a concurrent office edit.
     data.projectTracking=await repo.load('projectTracking',[]);const fresh=data.projectTracking.find(x=>x.id===row.id)||row;
     await saveRow({...fresh,retentionError:{at:now.toISOString(),message:error.message}});summary.conflicts++;
    }else{summary.deferred++;console.warn('Nettoyage différé',project.id,error.status||error.code||'non confirmé');}
   }
  }
  return summary;
 }catch(error){if(error.code==='retention_budget')return {...summary,deferred:summary.deferred+1};throw error;}
 finally{try{if(lock.eTag)await graph.deleteItem(lock.id,{'If-Match':lock.eTag});}catch{console.warn('Verrou de nettoyage conservé jusqu’à expiration.');}}
}

export function retentionConfigured(env){return ['RETENTION_TENANT_ID','RETENTION_CLIENT_ID','RETENTION_CLIENT_SECRET','RETENTION_DRIVE_ID','RETENTION_SITE_HOST','RETENTION_SITE_PATH'].every(key=>typeof env[key]==='string'&&env[key].trim());}
export async function scheduledRetention(env,{fetcher=fetch,runner=runRetention}={}){
 if(env.OPUS_RETENTION_ENABLED!=='true')return {disabled:true};
 if(env.OPUS_RETENTION_POLICY!=='permanent-onedrive-v1')return {disabled:true,reason:'permanent_archive_policy_not_activated'};
 if(!retentionConfigured(env))throw Error('Service de conservation non configuré.');
 if(!/^[a-z0-9.-]+\.sharepoint\.com$/i.test(env.RETENTION_SITE_HOST)||!env.RETENTION_SITE_PATH.startsWith('/sites/'))throw Error('Site de conservation invalide.');
 let cachedToken=null,expiresAt=0;
 const token=async({forceRefresh=false}={})=>{
  if(!forceRefresh&&cachedToken&&Date.now()<expiresAt)return cachedToken;
  const response=await fetcher('https://login.microsoftonline.com/'+encodeURIComponent(env.RETENTION_TENANT_ID)+'/oauth2/v2.0/token',{method:'POST',body:new URLSearchParams({client_id:env.RETENTION_CLIENT_ID,client_secret:env.RETENTION_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Connexion du service de conservation refusée.');const data=await response.json(),value=data.access_token;if(!value)throw Error('Jeton du service absent.');cachedToken=value;expiresAt=Date.now()+Math.max(0,Number(data.expires_in||300)-60)*1000;return value;
 };
 const graph=new Graph(token,fetcher);await graph.connect({siteHost:env.RETENTION_SITE_HOST,sitePath:env.RETENTION_SITE_PATH,driveId:env.RETENTION_DRIVE_ID});return runner(graph);
}
