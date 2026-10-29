import {eventProjectIds} from './planning-affairs.js';

export const RETENTION={archiveDays:15,archiveRetentionDays:30};
export const DAY=86400000;
export const stamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
export function deletionDate(row){
 const archived=stamp(row?.archivedAt);if(!archived)return null;
 return new Date(Math.max(archived+RETENTION.archiveRetentionDays*DAY,stamp(row.completedAt)+45*DAY)).toISOString();
}
export function assetIds(value,result=new Set()){
 if(value?.$opusAsset?.id)result.add(value.$opusAsset.id);
 else if(value&&typeof value==='object')for(const item of Object.values(value))assetIds(item,result);
 return result;
}

// A folder move does not establish the age of every nested report or photo.
export async function inspectQuietProject(ui,project,now,{days=15,anchor,check=()=>{}}={}){
 let latest=stamp(anchor);const row=(ui.data.projectTracking||[]).find(x=>x.id===project.id);
 latest=Math.max(latest,...(row?.history||[]).map(h=>stamp(h.at)));
 const reports=(ui.data.interventions||[]).filter(x=>x.projectId===project.id);
 const visits=(ui.data.visits||[]).filter(x=>x.projectId===project.id||x.convertedProjectId===project.id);
 const events=(ui.data.events||[]).filter(e=>eventProjectIds(e).includes(project.id)||e.kind==='intervention'&&reports.some(r=>r.id===e.linkId)||e.kind==='visit'&&visits.some(r=>r.id===e.linkId));
 if(events.some(e=>!['annulee','cancelled'].includes(e.status)&&stamp(e.end)>+now))return {eligible:false};
 for(const x of [...reports,...visits,...events])for(const key of ['updatedAt','createdAt','reportSubmittedAt','actualEnd'])latest=Math.max(latest,stamp(x[key]));
 if(!latest||+now-latest<days*DAY)return {eligible:false};
 const queue=[project.id],seen=new Set(),nodes=new Map();
 while(queue.length){
  check();const id=queue.shift();if(seen.has(id)||seen.size>=10000)throw Error('Structure du chantier à vérifier.');seen.add(id);
  const item=await ui.c.graph.item(id);if(!stamp(item.lastModifiedDateTime))return {eligible:false};
  nodes.set(item.id,item);latest=Math.max(latest,stamp(item.lastModifiedDateTime));if(+now-latest<days*DAY)return {eligible:false};
  for(const child of await ui.c.graph.children(id)){
   check();if(!child.id||!stamp(child.lastModifiedDateTime))return {eligible:false};nodes.set(child.id,child);
   latest=Math.max(latest,stamp(child.lastModifiedDateTime));if(+now-latest<days*DAY)return {eligible:false};
   if(child.folder)queue.push(child.id);if(nodes.size>10000)throw Error('Structure du chantier à vérifier.');
  }
 }
 return {eligible:true,latest,root:nodes.get(project.id),cacheIds:[...nodes.keys()],fingerprint:JSON.stringify([...nodes.values()].map(n=>[n.id,n.eTag||'',n.lastModifiedDateTime]).sort((a,b)=>a[0].localeCompare(b[0])))};
}

// Keep the exact fields used for numbering, scheduling and payroll. Report
// bodies, signatures, photos and attachments are intentionally absent.
const FACT_FIELDS=['id','number','projectId','projectName','convertedProjectId','clientId','clientName','status','title','createdAt','createdBy','updatedAt','completedAt','reportSubmittedAt','reportKind','actualStart','actualEnd','pauseHours','teamIds','teamSize','teamActuals','plannedStart','plannedEnd','plannedWeekends','fridayExtendedIds','vehicle','completionRecordedAt','billingAgreement','sourceEmail','history','invoiceNumber','invoicedAt','appArchivedAt','permanentArchive','retentionCacheIds'];
export function compactReport(row,at){
 const result={};for(const key of FACT_FIELDS)if(Object.hasOwn(row,key))result[key]=structuredClone(row[key]);
 // teamActuals is retained for time accounting; strip any unexpectedly nested media.
 const strip=value=>typeof value==='string'?(/^data:/i.test(value)?undefined:value):Array.isArray(value)?value.map(strip).filter(x=>x!==undefined):value&&typeof value==='object'?value.$opusAsset?undefined:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,strip(v)]).filter(([,v])=>v!==undefined)):value;
 if(result.sourceEmail?.id)result.sourceEmail={id:result.sourceEmail.id};else delete result.sourceEmail;
 if(result.teamActuals)result.teamActuals=strip(result.teamActuals);if(result.history)result.history=strip(result.history);
 return {...result,retentionPurgedAt:at,reportDeletedAt:at};
}

const keys=async(store,prefix)=>typeof store.keys==='function'?store.keys(prefix):(await store.all(prefix)).map(x=>x.key);
export async function cleanPurgedLocal(store,tracking,{activeRecords=[]}={}){
 const rows=tracking.filter(row=>row.retentionPurgedAt),cleaned=[],deferred=[],protectedAssets=new Set(),pendingProjects=new Set(),pendingRecords=new Set();
 if(!rows.length)return {cleaned,deferred};
 for(const record of activeRecords)assetIds(record,protectedAssets);
 // Never remove an unsent report, its recovery draft or a prepared PDF.
 for(const prefix of ['draft:','pdfoutbox:','report-recovery:','setup-draft:'])for(const key of await keys(store,prefix)){
  const value=await store.get(key);if(!value)continue;if(value.projectId||value.record?.projectId)pendingProjects.add(value.projectId||value.record.projectId);if(value.id||value.record?.id)pendingRecords.add(String(value.id||value.record.id).split(':')[0]);assetIds(value,protectedAssets);
 }
 for(const row of rows){
  if(await store.get('retention-applied:'+row.id)===row.retentionPurgedAt)continue;
  if(pendingProjects.has(row.id)||pendingRecords.has(row.id)){deferred.push(row.id);continue;}
  const cacheIds=new Set(row.retentionCacheIds||[]);
  for(const prefix of ['meta:','attdirs:','att:','attmeta:','revision-meta:','asset:','file:'])for(const key of await keys(store,prefix)){
   const scoped=key==='meta:'+row.id||key==='attdirs:'+row.id||key.startsWith('att:'+row.id+':')||key.startsWith('attmeta:'+row.id+':');
   const id=prefix==='file:'?key.slice(5).split(':')[0]:key.slice(prefix.length);
   if(scoped||cacheIds.has(id)&&!(prefix==='asset:'&&protectedAssets.has(id)))await store.remove(key);
  }
  await store.set('retention-applied:'+row.id,row.retentionPurgedAt);cleaned.push(row.id);
 }
 return {cleaned,deferred};
}
