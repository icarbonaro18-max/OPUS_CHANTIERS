import {OpsRepository} from './ops.js';
import {archiveCompletedInterventions} from './intervention-retention.js';
import {stamp} from './project-retention.js';

export {interventionArchiveDue} from './intervention-archive.js';
export const archiveModeKey=(store,graph)=>'opus-auto-interventions:'+store.namespace+':'+graph.drive.id;
export function archiveModeEnabled(store,graph,storage){try{return !!store&&!!graph?.drive?.id&&storage?.getItem(archiveModeKey(store,graph))==='1';}catch{return false;}}
export async function runDeviceArchive(graph,{now=new Date(),check=()=>{},onProgress=()=>{},budgetMs=90000,limit=100}={}){
 const repo=new OpsRepository(graph);await repo.init();const name='_RETENTION_RUNNING',old=await graph.named(repo.root.id,name),started=Date.now();
 if(old){if(!old.eTag||!stamp(old.createdDateTime)||+now-stamp(old.createdDateTime)<600000)return {busy:true};try{await graph.deleteItem(old.id,{'If-Match':old.eTag});}catch(error){if([404,412].includes(error.status))return {busy:true};throw error;}}
 let lease;try{lease=await graph.request(graph.base(repo.root.id)+'/children',{method:'POST',body:{name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}});}catch(error){if(error.status===409)return {busy:true};throw error;}
 try{return await archiveCompletedInterventions(graph,repo,{now,limit,onProgress,check:()=>{check();if(Date.now()-started>budgetMs)throw Object.assign(Error('Le traitement reprendra au prochain passage.'),{code:'retention_budget'});}});}
 finally{if(lease?.eTag)try{await graph.deleteItem(lease.id,{'If-Match':lease.eTag});}catch{console.warn('Verrou de maintenance conservé jusqu’à expiration.');}}
}
