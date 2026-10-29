
export {interventionArchiveDue,reportArchiveDue} from './intervention-archive.js';
export const archiveModeKey=(store,graph)=>'opus-auto-interventions:'+store.namespace+':'+graph.drive.id;
export function archiveModeEnabled(store,graph,storage){try{return !!store&&!!graph?.drive?.id&&storage?.getItem(archiveModeKey(store,graph))==='1';}catch{return false;}}
export async function runDeviceArchive(graph,{now=new Date(),check=()=>{},onProgress=()=>{},budgetMs=90000,limit=100}={}){
 const {runRetention}=await import('./project-archive-maintenance.js');
 const result=await runRetention(graph,{now,check,onProgress,budgetMs,limit});
 return {...result,archived:(result.interventionsArchived||0)+(result.visitsArchived||0),projectsArchived:result.purged||0};
}
