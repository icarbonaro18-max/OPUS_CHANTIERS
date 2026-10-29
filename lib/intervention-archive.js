import {compactReport,stamp,DAY} from './project-retention.js';

export function interventionArchiveDue(record,now=new Date(),events=[]){
 if(record.projectId||record.appArchivedAt||!['terminee','facturee'].includes(record.status))return false;
 const completed=Math.max(...['completionRecordedAt','completedAt','pdfSavedAt','reportSubmittedAt','actualEnd'].map(key=>stamp(record[key])));
 if(!completed)return false;
 const latest=Math.max(completed,stamp(record.updatedAt),stamp(record.archivedAt));
 return +now-latest>=DAY&&!events.some(event=>event.kind==='intervention'&&event.linkId===record.id&&!['annulee','cancelled'].includes(event.status)&&stamp(event.end)>+now);
}
export function compactArchivedIntervention(record,archive,at){
 if(!archive?.manifestId||!archive?.snapshotId||!archive?.pdfId)throw Error('Archive OneDrive incomplète : la fiche reste dans l’application.');
 return compactReport({...record,appArchivedAt:at,permanentArchive:archive,retentionCacheIds:[...(archive.cacheIds||[])]},at);
}
export function showInterventionArchive(ui,record){
 ui.c.modal('Rapport conservé dans OneDrive','<p>Ce dossier a été retiré des listes après son délai de conservation. Son rapport, ses photos et ses pièces sont conservés dans l’archive permanente Microsoft 365.</p><div id="permanentArchiveDetails"></div>');
 const root=document.getElementById('permanentArchiveDetails'),label=document.createElement('p');label.textContent=[record.number,record.clientName,record.title].filter(Boolean).join(' · ');root.append(label);
 const archive=record.permanentArchive;
 if(archive?.pdfId){const button=document.createElement('button');button.type='button';button.textContent='Consulter le PDF conservé';button.onclick=async()=>{button.disabled=true;try{await ui.c.openAlertDocument({id:archive.pdfId,name:(record.number||'Intervention')+'.pdf'});}catch(error){ui.c.toast(error.message);}finally{button.disabled=false;}};root.append(button);}
 try{const url=new URL(archive?.webUrl),host=ui.config.siteHost;if(url.protocol==='https:'&&url.hostname===host&&!url.username&&!url.password&&!url.port){const link=document.createElement('a');link.className='button secondary';link.textContent='Ouvrir le dossier dans OneDrive';link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';root.append(link);}}catch{}
}
