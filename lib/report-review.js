export const isFinalProjectReport=record=>!!record.projectId&&['chantier','intervention'].includes(record.reportKind);
// Only confirmed archived reports can repair a missed classification. A later
// office decision to resume work takes precedence over earlier reports.
export function hasArchivedFinalReport(data,projectId){
 const tracking=(data.projectTracking||[]).find(r=>r.id===projectId);
 const resumed=Math.max(0,...(tracking?.history||[]).filter(h=>h.action==='Poursuite validée').map(h=>Date.parse(h.at)||0));
 return (data.interventions||[]).some(r=>r.projectId===projectId&&isFinalProjectReport(r)&&['terminee','facturee'].includes(r.status)&&Date.parse(r.pdfSavedAt)>resumed&&Date.parse(r.reportSubmittedAt||r.completedAt)>resumed);
}
