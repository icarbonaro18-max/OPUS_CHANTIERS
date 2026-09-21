import {isFinalProjectReport} from './report-review.js';
import {updateTracking} from './project-progress.js';
import {validateMaterials} from './material-request.js';
const restore=(target,source)=>{for(const key of Object.keys(target))if(!Object.hasOwn(source,key))delete target[key];Object.assign(target,source);};
export function confirmDeparture(ui,record){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='departureDialog';
  const suggested=document.getElementById('aEnd')?.value||ui.localDT(record.actualEnd||new Date().toISOString());
  dialog.innerHTML='<form><h2>Confirmer le départ</h2><p>Vérifiez l’heure réelle de départ avant l’enregistrement.</p><label>Heure de départ</label><input id="departureTime" type="datetime-local" required><p id="departureError" role="alert"></p><div class="actionRow"><button type="submit">Enregistrer dans OPUS et terminer</button><button type="button" id="cancelDeparture" class="secondary">Annuler</button></div></form>';
  document.body.append(dialog);dialog.querySelector('input').value=suggested;
  const finish=value=>{dialog.remove();resolve(value);};
  dialog.querySelector('#cancelDeparture').onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();finish(null);};
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const value=dialog.querySelector('input').value,start=document.getElementById('aStart')?.value||ui.localDT(record.actualStart);
   if(!start||!value||new Date(value)<=new Date(start)||value.slice(0,10)!==start.slice(0,10)){dialog.querySelector('#departureError').textContent='Renseignez l’arrivée réelle, puis un départ après l’arrivée, sur la même journée.';return;}
   finish(value);
  };dialog.showModal();
 });
}
export async function recordArrival(ui,x){
 const field=document.getElementById('aStart');if(!field)return;
 if(x.actualStart&&!confirm('Remplacer l’heure d’arrivée déjà enregistrée par l’heure actuelle ?'))return;
 const arrivalButton=document.getElementById('recordArrival');if(arrivalButton?.disabled)return;if(arrivalButton)arrivalButton.disabled=true;const previous=structuredClone(x),old=field.value;field.value=ui.localDT(new Date().toISOString());
 try{ui.captureReportDraft(x,false);if(!['terminee','facturee'].includes(x.status))x.status='en_cours';x.updatedAt=new Date().toISOString();await ui.save('interventions');ui.c.toast('Arrivée réelle enregistrée dans OPUS.');}
 catch(e){restore(x,previous);field.value=old;ui.c.toast('Arrivée non enregistrée : '+e.message);}
 finally{if(arrivalButton)arrivalButton.disabled=false;}
}
export function feedback(ui,message,{reveal=true}={}){
 let box=document.getElementById('reportSaveStatus');if(!box){box=document.createElement('p');box.id='reportSaveStatus';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.className='hint';box.style.flexBasis='100%';const button=document.getElementById('finishInterventionButton');if(button)button.before(box);else document.getElementById('finishInt')?.append(box);}box.textContent=message;if(reveal)box.scrollIntoView?.({block:'nearest'});ui.c.toast(message);
}
function revealField(id){const field=document.getElementById(id);if(!field)return;let parent=field.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}field.scrollIntoView?.({block:'center'});field.focus({preventScroll:true});}
export async function finishAndExport(ui,x,{download=false,ask=confirmDeparture}={}){
 if(ui.finishingIntervention)return;ui.finishingIntervention=true;
 const buttons=['downloadIntPdf','saveIntPdf','finishInterventionButton'].map(id=>document.getElementById(id)).filter(Boolean);buttons.forEach(b=>b.disabled=true);
 try{
  await ui.pendingPhotos;
  if(ui.c.saveReportDraft){const draft=structuredClone(x);ui.captureReportDraft(draft,false);await ui.c.saveReportDraft(draft);}
  feedback(ui,'Enregistrement en cours… Gardez cette fenêtre ouverte.');
  // Never substitute the appointment time for an actual arrival.
  if(!document.getElementById('aStart')?.value){feedback(ui,'Renseignez l’arrivée réelle ou utilisez « Je commence maintenant » avant de terminer.');document.getElementById('aStart')?.focus();return;}
  const end=await ask(ui,x);if(!end){feedback(ui,'Envoi annulé. Le rapport reste ouvert pour être complété.');return;}
  await ui.pendingPhotos;
  document.getElementById('aEnd').value=end;ui.validateActualHours('aStart','aEnd','aPause');
  const snapshot=structuredClone(x);ui.captureReportDraft(snapshot,false);validateMaterials(snapshot.requestMaterials||[]);
  if(snapshot.clientReport&&!snapshot.clientReportApproved){feedback(ui,'Envoi bloqué : ouvrez « Relire et valider le résumé », puis cochez « J’ai relu et validé ».');revealField('approveClientReport');return;}
  if(!snapshot.workDone&&!snapshot.notes&&!snapshot.clientReport&&!snapshot.photos?.length&&!(snapshot.reportItems||[]).length&&!(snapshot.projectId&&(snapshot.progressNotes||snapshot.materialNeeded||snapshot.requestMaterials?.length))){feedback(ui,'Ajoutez le compte rendu ou les photos de l’intervention avant de terminer.');return;}
  snapshot.updatedAt=new Date().toISOString();
  if(snapshot.projectId){snapshot.reportSubmittedAt=snapshot.updatedAt;snapshot.reportSubmittedBy=ui.user?.displayName||snapshot.createdBy||'';}
  const previous=structuredClone(x);Object.assign(x,snapshot);
  try{await ui.save('interventions');}catch(e){restore(x,previous);throw e;}
  if(snapshot.projectId)void ui.teamAlerts?.refresh();

  // Do not advertise a completed intervention until the PDF is stored and the
  // final record has been saved. A failed attempt keeps the report recoverable.
  let archived=false;
  try{
   await ui.saveInterventionPackage(x,{download,complete:true});archived=true;
   const priorStatus=x.status,priorCompleted=x.completedAt;
   if(x.status!=='facturee')x.status='terminee';x.completedAt=x.actualEnd;
   try{await ui.save('interventions');}catch(e){x.status=priorStatus;x.completedAt=priorCompleted;throw e;}
   const project=ui.c.getCatalog?.().projects?.find(p=>p.id===x.projectId),closed=['04','99'].includes(project?.category);
   if(isFinalProjectReport(x)&&!closed){
    try{await updateTracking(ui,x.projectId,{}, {finish:true});if(ui.c.ensureProjectReview)await ui.c.ensureProjectReview(x.projectId);else throw Error('Classement à vérifier après actualisation du chantier');}
    catch(e){feedback(ui,'Rapport et PDF enregistrés, mais passage à contrôler non confirmé : '+e.message+'. Réessayez l’enregistrement.');return;}
   }
   await ui.c.clearReportDraft?.(x.id);
   const message=x.projectId?(closed?'Rapport mis à jour dans OPUS. Le chantier reste clôturé.':isFinalProjectReport(x)?'Rapport enregistré dans OPUS. Chantier à contrôler.':'Suivi enregistré dans OPUS. Chantier laissé en cours.'):'Fin d’intervention validée. Rapport enregistré dans OPUS · Intervention achevée.';
   feedback(ui,message);const status=document.getElementById('clientReportStatus');if(status)status.textContent=message;
   if(!x.projectId){
    ui.interventionView='completed';
    let link=document.getElementById('seeCompletedInterventions');
    if(!link){link=document.createElement('button');link.type='button';link.id='seeCompletedInterventions';link.className='secondary reportCompletionLink';link.textContent='Voir les interventions achevées';document.getElementById('finishInterventionButton')?.after(link);}
    link.onclick=async()=>{document.getElementById('modal')?.close?.();ui.interventionView='completed';await ui.show('interventions');};
   }
  }catch(e){const message=(archived?'PDF enregistré, mais fin d’intervention non confirmée : ':'Horaires et rapport enregistrés, mais PDF non archivé dans OPUS : ')+e.message+'. Réessayez « Enregistrer dans OPUS et terminer ».';feedback(ui,message);const status=document.getElementById('clientReportStatus');if(status)status.textContent=message;}
 }catch(e){feedback(ui,'Enregistrement non terminé : '+e.message+'. Ne fermez pas le rapport ; corrigez ou réessayez.');}
 finally{ui.finishingIntervention=false;buttons.forEach(b=>b.disabled=false);if(document.getElementById('interventionsPage'))try{await ui.renderInterventions();}catch(e){console.warn('Affichage à actualiser',e);}if(ui.section==='office'&&document.getElementById('officePage'))try{await ui.renderOffice();}catch(e){console.warn('Bureau à actualiser',e);}}
}
export function suggestPlannedEnd(ui){const start=document.getElementById('iStart'),end=document.getElementById('iEnd');if(start?.value&&end&&!end.value){end.value=ui.localDT(new Date(new Date(start.value).getTime()+60*60000).toISOString());}}
