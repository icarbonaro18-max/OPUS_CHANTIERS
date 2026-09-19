// Reports retain their historical IDs and storage. Their project link determines
// where they belong in the UI, never the INT prefix or the text of their title.
export const activeRecord=x=>!x.reportDeletedAt&&!['annulee','cancelled'].includes(x.status);
export const isProjectReport=x=>!!x.projectId;
export const isIndependentIntervention=x=>!isProjectReport(x)&&activeRecord(x);
export const completedRecord=x=>['terminee','facturee','convertie'].includes(x.status);
export function projectsToInvoice(projects,tracking=[]){
 return projects.filter(p=>['04','99'].includes(p.category)&&!tracking.find(t=>t.id===p.id)?.invoicedAt);
}
export function officeReports(data){
 return [
  ...(data.interventions||[]).filter(activeRecord).map(record=>({kind:isProjectReport(record)?'project':'intervention',record})),
  ...(data.visits||[]).filter(activeRecord).map(record=>({kind:'visit',record}))
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
