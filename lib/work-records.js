// Reports retain their historical IDs and storage. Their project link determines
// where they belong in the UI, never the INT prefix or the text of their title.
export const activeRecord=x=>!x.reportDeletedAt&&!['annulee','cancelled'].includes(x.status);
export const isProjectReport=x=>!!x.projectId;
// Deleting an attached report must never hide its intervention or appointment.
// V42's reportDeletedAt flag remains valid for the report corbeille only.
export const isIndependentIntervention=x=>!isProjectReport(x)&&!['annulee','cancelled'].includes(x.status);
export const completedRecord=x=>['terminee','facturee','convertie'].includes(x.status);
export function hasReportContent(record){
 if(isProjectReport(record)||completedRecord(record))return true;
 if(['pdfFileId','pdfSavedAt','reportSubmittedAt','reportDraftSavedAt','clientReport','workDone','summary','progressNotes','materialNeeded'].some(key=>String(record[key]||'').trim()))return true;
 if((record.actualStart||record.actualEnd)&&['notes','materials'].some(key=>String(record[key]||'').trim()))return true;
 return ['photos','reportItems','visitTasks','requestMaterials'].some(key=>Array.isArray(record[key])&&record[key].length>0);
}
export function projectsToInvoice(projects,tracking=[]){
 return projects.filter(p=>['04','99'].includes(p.category)&&!tracking.find(t=>t.id===p.id)?.invoicedAt);
}
export function officeReports(data,{trash=false}={}){
 // Old empty entries deleted in V42 stay recoverable in the corbeille, but an
 // appointment with no report must not be offered as a report to delete.
 const visible=r=>!!r.reportDeletedAt===trash&&!['annulee','cancelled'].includes(r.status)&&(trash||hasReportContent(r));
 return [
  ...(data.interventions||[]).filter(visible).map(record=>({kind:isProjectReport(record)?'project':'intervention',record})),
  ...(data.visits||[]).filter(visible).map(record=>({kind:'visit',record}))
 ].sort((a,b)=>String(b.record.reportSubmittedAt||b.record.updatedAt||b.record.createdAt||'').localeCompare(String(a.record.reportSubmittedAt||a.record.updatedAt||a.record.createdAt||'')));
}
export async function invoiceProject(ui,project,number=''){
 if(!ui.c.isAdmin())throw Error('Facturation réservée à l’administrateur.');
 if(!projectsToInvoice([project],ui.data.projectTracking).length)throw Error('Ce chantier n’est plus en attente de facturation.');
 const before=ui.data.projectTracking||[],old=before.find(x=>x.id===project.id)||{id:project.id},now=new Date().toISOString();
 const row={...old,invoiceNumber:number.trim(),invoicedAt:now,history:[...(old.history||[]),{at:now,by:ui.user?.displayName||'',action:'Chantier marqué facturé',invoiceNumber:number.trim()}]};
 ui.data.projectTracking=[...before.filter(x=>x.id!==project.id),row];
 try{await ui.repo.save('projectTracking',ui.data.projectTracking);}catch(error){ui.data.projectTracking=before;throw error;}
}
