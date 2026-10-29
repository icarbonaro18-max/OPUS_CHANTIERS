import {interventionArchiveDue,compactArchivedIntervention} from './intervention-archive.js';
import {assetIds} from './project-retention.js';
import {recordHash,preservePermanentRecord,verifyPermanentArchive} from './permanent-archive.js';

// Called while the existing global maintenance lock is held. Files are never
// removed here: only confirmed, self-contained archives permit index reduction.
export async function archiveCompletedInterventions(graph,repo,{now=new Date(),limit=100,check=()=>{},onProgress=()=>{},archiveRecord=preservePermanentRecord,verifyArchive=verifyPermanentArchive}={}){
 const result={archived:0,deferred:0},prepared=new Map();const candidates=await repo.load('interventions',[]),events=await repo.load('events',[]),version=repo.versions?.get('interventions');
 for(const original of candidates){
  if(prepared.size>=limit)break;if(!interventionArchiveDue(original,now,events))continue;
  try{
   check();onProgress({stage:'Copie permanente dans OneDrive',number:original.number||original.id,done:prepared.size});const expected=await recordHash(original),archive=await archiveRecord(graph,repo,original,{requirePdf:true,now,check});
   await verifyArchive(graph,archive,{check});
   if(await recordHash(original)!==expected)throw Error('La fiche a changé pendant son archivage.');
   const light=compactArchivedIntervention(original,{...archive,cacheIds:[...new Set([...(archive.cacheIds||[]),...assetIds(original)])]},now.toISOString());
   prepared.set(original.id,light);
  }catch(error){if(error.code==='archive_pause'){result.deferred++;return result;}if(error.code==='retention_budget'){result.deferred++;break;}result.deferred++;console.warn('Archivage d’intervention différé',original.id,error.status||'non confirmé',String(error.message||'').slice(0,200));}
 }
 if(!prepared.size)return result;
 // One conditional index write for the whole batch. Do not rewrite a large
 // collection for every individual archive; a newer list rejects the batch.
 try{
  if(!version||repo.versions?.get('interventions')!==version)throw Error('La version de la liste ne peut pas être confirmée.');
  const canCommit=()=>{try{check();return true;}catch(error){if(error.code==='retention_budget')return true;if(error.code==='archive_pause')return false;throw error;}};
  if(!canCommit()){result.deferred+=prepared.size;return result;}const freshEvents=await repo.load('events',[]);
  for(const original of candidates)if(prepared.has(original.id)&&!interventionArchiveDue(original,now,freshEvents)){prepared.delete(original.id);result.deferred++;}
  if(!prepared.size)return result;
  if(!canCommit()){result.deferred+=prepared.size;return result;}onProgress({stage:'Archives vérifiées · allègement de la liste',done:prepared.size});await repo.save('interventions',candidates.map(record=>prepared.get(record.id)||record));result.archived=prepared.size;
 }catch(error){result.deferred+=prepared.size;console.warn('Retrait des interventions différé',error.status||'non confirmé');}
 return result;
}
