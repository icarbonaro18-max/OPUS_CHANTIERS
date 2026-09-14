const restore=(target,source)=>{for(const key of Object.keys(target))if(!Object.hasOwn(source,key))delete target[key];Object.assign(target,source);};
export function confirmDeparture(ui,record){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='departureDialog';
  const suggested=document.getElementById('aEnd')?.value||ui.localDT(record.actualEnd||new Date().toISOString());
  dialog.innerHTML='<form><h2>Valider la fin d’intervention</h2><p>Confirmez l’heure réelle de départ. Vous pouvez la corriger avant validation.</p><label>Heure de départ</label><input id="departureTime" type="datetime-local" required><p id="departureError" role="alert"></p><div class="actionRow"><button type="submit">Valider et enregistrer dans OPUS</button><button type="button" id="cancelDeparture" class="secondary">Annuler</button></div></form>';
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
export async function finishAndExport(ui,x,{download=false,ask=confirmDeparture}={}){
 if(ui.finishingIntervention)return;ui.finishingIntervention=true;
 const buttons=['downloadIntPdf','saveIntPdf','finishInterventionButton'].map(id=>document.getElementById(id)).filter(Boolean);buttons.forEach(b=>b.disabled=true);
 try{
  // Never substitute the appointment time for an actual arrival.
  if(!document.getElementById('aStart')?.value){ui.c.toast('Renseignez l’arrivée réelle ou utilisez « Je commence maintenant » avant de terminer.');document.getElementById('aStart')?.focus();return;}
  const end=await ask(ui,x);if(!end)return;
  document.getElementById('aEnd').value=end;ui.validateActualHours('aStart','aEnd','aPause');
  const snapshot=structuredClone(x);ui.captureReportDraft(snapshot,false);
  if(snapshot.clientReport&&!snapshot.clientReportApproved){ui.c.toast('Relisez et validez le compte rendu français avant de l’exporter.');return;}
  if(!snapshot.workDone&&!snapshot.notes&&!snapshot.clientReport&&!(snapshot.reportItems||[]).length){ui.c.toast('Ajoutez le compte rendu ou les points de l’intervention avant de terminer.');return;}
  if(snapshot.status!=='facturee')snapshot.status='terminee';snapshot.completedAt=snapshot.actualEnd;snapshot.updatedAt=new Date().toISOString();
  const previous=structuredClone(x);Object.assign(x,snapshot);
  try{await ui.save('interventions');}catch(e){restore(x,previous);throw e;}
  if(document.getElementById('interventionsPage'))await ui.renderInterventions();
  // Archiving is part of completion, including when the user asked for a download.
  try{const result=await ui.saveInterventionPackage(x,{download});ui.c.toast('Fin d’intervention validée. PDF enregistré dans '+result.folder);const status=document.getElementById('clientReportStatus');if(status)status.textContent='Fin d’intervention validée. PDF enregistré dans OPUS.';}
  catch(e){const message='Horaires et rapport enregistrés, mais PDF non archivé dans OPUS : '+e.message+'. Réessayez « Enregistrer PDF dans OPUS ».';ui.c.toast(message);const status=document.getElementById('clientReportStatus');if(status)status.textContent=message;}
 }catch(e){ui.c.toast('Enregistrement non terminé : '+e.message);}
 finally{ui.finishingIntervention=false;buttons.forEach(b=>b.disabled=false);}
}
export function suggestPlannedEnd(ui){const start=document.getElementById('iStart'),end=document.getElementById('iEnd');if(start?.value&&end&&!end.value){end.value=ui.localDT(new Date(new Date(start.value).getTime()+60*60000).toISOString());}}
