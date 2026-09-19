import {setReportDeleted,bindReportSwipe} from './report-trash.js';
import {eventProjectIds} from './planning-affairs.js';
import {isoDate,makeId,nextInterventionNumber,frDateTime} from './ops.js';
import {REPORT_TYPES} from './project-report-details.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const PHASES=[['before','Avant'],['during','Pendant'],['after','Après']];
export function projectPriority(events,id,now=new Date()){
 const day=isoDate(now),future=events.filter(e=>eventProjectIds(e).includes(id)&&!['annulee','cancelled','terminee'].includes(e.status)&&e.start&&e.end&&isoDate(e.end)>=day).sort((a,b)=>a.start.localeCompare(b.start));
 const today=future.find(e=>isoDate(e.start)<=day&&isoDate(e.end)>=day);
 return {today:!!today,event:today||future[0]||null};
}
export async function projectReports(ui,p,meta,opts={}){
 const admin=!!ui.c.isAdmin?.(),trash=admin&&!!opts.trash;
 const reports=ui.data.interventions.filter(x=>x.projectId===p.id&&x.status!=='annulee'&&!!x.reportDeletedAt===trash).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 ui.c.modal('Comptes rendus du chantier',`<p><strong>${esc(p.name)}</strong></p><p>Touchez un rapport pour le consulter ou le reprendre. Créez un nouveau rapport seulement pour un nouveau passage.</p>${admin?`<p>${trash?'Corbeille des rapports':'Glissez un rapport vers la gauche pour le supprimer.'}</p><button type="button" id="toggleReportTrash">${trash?'Revenir aux rapports':'Corbeille'}</button>`:''}<label>Créer un rapport de</label><select id="newReportKind">${Object.entries(REPORT_TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button type="button" id="newProjectReport">+ Nouveau rapport</button><div>${reports.map(x=>`<div class="row" data-report-row="${esc(x.id)}"><div><h3><button type="button" class="documentLink" data-project-report="${esc(x.id)}">${esc(x.number)} · ${esc(REPORT_TYPES[x.reportKind]||'Compte rendu')}</button></h3><p>${esc(frDateTime(x.actualEnd||x.createdAt))} · ${esc(x.pdfSavedAt?'Rapport et PDF enregistrés':x.reportSubmittedAt?'Compte rendu enregistré · PDF à vérifier':'Brouillon à reprendre')} · ${esc(x.reportSubmittedBy||x.createdBy||'')} · ${(x.photos||[]).length} photo(s) générale(s)</p>${x.materialNeeded?'<p class="warning">Matériel à prévoir'+(x.materialNeededOn?' pour le '+esc(x.materialNeededOn):'')+' : '+esc(x.materialNeeded)+'</p>':''}${(x.reportItems||[]).some(i=>i.needsQuote)?'<span class="chip warn">Devis complémentaire à prévoir</span>':''}</div>${admin?`<button type="button" class="danger" data-report-remove="${esc(x.id)}">${trash?'Restaurer':'Supprimer'}</button>`:''}${x.pdfFileId?`<button type="button" data-report-pdf="${esc(x.id)}">Voir le PDF enregistré</button>`:''}</div>`).join('')||'<p>Aucun compte rendu pour ce chantier.</p>'}</div>`);
 if(admin){
  document.getElementById('toggleReportTrash').onclick=()=>projectReports(ui,p,meta,{...opts,trash:!trash});
  let busy=false;
  const remove=async id=>{if(busy)return;const report=reports.find(r=>r.id===id);if(!report)return;busy=true;
   try{await setReportDeleted(ui,report,!trash);await projectReports(ui,p,meta,opts);ui.c.toast(trash?'Rapport restauré.':'Rapport supprimé. Vous pouvez le restaurer dans la corbeille.');}
   catch(e){ui.c.toast('Modification non enregistrée : '+e.message);}finally{busy=false;}
  };
  document.querySelectorAll('[data-report-remove]').forEach(b=>b.onclick=()=>remove(b.dataset.reportRemove));
  if(!trash)document.querySelectorAll('[data-report-row]').forEach(row=>bindReportSwipe(row,()=>remove(row.dataset.reportRow)));
 }
 document.querySelectorAll('[data-project-report]').forEach(b=>b.onclick=async()=>{try{await ui.openIntervention(b.dataset.projectReport);}catch(e){ui.c.toast('Ouverture impossible : '+e.message);}});
 document.querySelectorAll('[data-report-pdf]').forEach(b=>b.onclick=async()=>{const x=reports.find(r=>r.id===b.dataset.reportPdf);try{await ui.c.openAlertDocument({id:x.pdfFileId,name:x.pdfName||x.number+'.pdf'});}catch(e){ui.c.toast('PDF non ouvert : '+e.message);}});
 document.getElementById('newProjectReport').onclick=async ev=>{
  const b=ev.currentTarget;b.disabled=true;
  const person=ui.data.people.find(x=>String(x.email||'').toLowerCase()===String(ui.user.mail||ui.user.userPrincipalName||'').toLowerCase());
  const x={id:makeId('int'),number:nextInterventionNumber(ui.data.interventions),projectId:p.id,projectName:p.name,devis:meta.devis||'',clientName:meta.client||p.name,siteAddress:meta.adresse||'',title:`Compte rendu chantier ${meta.devis||p.name}`,request:meta.notes||'',teamIds:person?[person.id]:[],status:'en_cours',reportItems:[],photos:[],createdAt:new Date().toISOString(),createdBy:ui.user.displayName||''};
  // The author is not necessarily a technician. Resolve the team from the
  // appointment date in the report form, then let the user verify it.
  x.teamIds=[];
  x.reportKind=document.getElementById('newReportKind').value;
  ui.data.interventions.push(x);try{await ui.save('interventions');}catch(e){ui.data.interventions=ui.data.interventions.filter(v=>v!==x);ui.c.toast(e.message);b.disabled=false;return;}try{await ui.openIntervention(x.id);}catch(e){ui.c.toast('Rapport enregistré, mais ouverture impossible : '+e.message);b.disabled=false;}
 };
 if(opts.kind)document.getElementById('newReportKind').value=opts.kind;
 // Listing is always the first screen, even for older callers passing create:true.
 const select=document.getElementById('newReportKind'),button=document.getElementById('newProjectReport');
 const create=document.createElement('section');create.className='quickReport';const title=document.createElement('h3');title.textContent='Créer un nouveau rapport';create.append(title,select.previousElementSibling,select,button);document.querySelector('[data-project-report]')?.closest('.row')?.parentElement?.after(create);
 if(trash)create.hidden=true;
 if(!create.isConnected){const root=document.getElementById('modalBody')||document.getElementById('modal');root.append(create);}

}
export function equipmentFields(ui,item){return `<section class="quickReport"><h3>Suivi de l’équipement</h3><div class="formGrid"><div><label>Début de prestation</label><input type="datetime-local" id="equipmentStart" value="${esc(ui.localDT(item.startedAt))}"><button type="button" class="secondary" id="equipmentStartNow">Début maintenant</button></div><div><label>Fin de prestation</label><input type="datetime-local" id="equipmentEnd" value="${esc(ui.localDT(item.endedAt))}"><button type="button" class="secondary" id="equipmentEndNow">Fin maintenant</button></div></div><p>Enregistrez le point pour conserver les horaires et les photos. Une fin non renseignée indique une prestation encore en cours.</p></section>${PHASES.map(([key,label])=>`<section class="quickReport"><h3>Photos ${label.toLowerCase()}</h3><div class="photoButtons"><label class="fileButton">📷 Prendre une photo<input id="eqCam_${key}" type="file" accept="image/*" capture="environment"></label><label class="fileButton secondaryFile">Galerie<input id="eqGallery_${key}" type="file" accept="image/*" multiple></label></div><div id="eqPreview_${key}" class="reportPhotos"></div></section>`).join('')}`;}
export function bindEquipment(ui,item){
 for(const [key]of PHASES)ui.bindPhotoInputs(item.phasePhotos[key],{captureId:`eqCam_${key}`,galleryId:`eqGallery_${key}`,previewId:`eqPreview_${key}`,maxPhotos:4});
 for(const [id]of [['equipmentStart'],['equipmentEnd']])document.getElementById(id+'Now').onclick=()=>{document.getElementById(id).value=ui.localDT(new Date().toISOString());};
}
export function readEquipment(ui,item){
 const start=document.getElementById('equipmentStart').value,end=document.getElementById('equipmentEnd').value;
 if(end&&(!start||new Date(end)<new Date(start)))throw Error('Indiquez un début antérieur à la fin de cet équipement.');
 item.startedAt=ui.toISO(start);item.endedAt=ui.toISO(end);
}
export function equipmentPhotos(item){return PHASES.flatMap(([key,label])=>(item.phasePhotos?.[key]||[]).map(p=>({...p,phase:label})));}
export function equipmentText(item){return [item.startedAt?`Début : ${frDateTime(item.startedAt)}`:'',item.endedAt?`Fin : ${frDateTime(item.endedAt)}`:''].filter(Boolean).join(' · ');}
export function addEquipmentBatch(ui,x){
 ui.captureReportDraft(x,false);
 ui.c.modal('Préparer les équipements',`<form id="equipmentBatch"><label>Nom du groupe</label><input id="equipmentPrefix" value="Armoire" required><label>Nombre d’équipements</label><input id="equipmentCount" type="number" min="1" max="50" value="14" required><p>Création de fiches vierges numérotées. Aucun travail ni horaire ne sera déclaré automatiquement.</p><button type="submit">Créer les fiches</button></form>`);
 const form=document.getElementById('equipmentBatch');form.onsubmit=async e=>{e.preventDefault();await ui.saveWithFeedback(form,'Équipements préparés',async()=>{
  const count=Number(document.getElementById('equipmentCount').value),prefix=document.getElementById('equipmentPrefix').value.trim();if(!prefix||!Number.isInteger(count)||count<1||count>50)throw Error('Indiquez un nom et un nombre entre 1 et 50.');
  const old=x.reportItems||[],added=Array.from({length:count},(_,i)=>({id:makeId('eq'),title:`${prefix} ${old.length+i+1}`,issueType:'Tableau électrique',photos:[],phasePhotos:{before:[],during:[],after:[]},observation:'',action:'',needsQuote:false}));x.reportItems=[...old,...added];x.clientReportApproved=false;
  try{await ui.save('interventions');}catch(e){x.reportItems=old;throw e;}
 },()=>ui.openIntervention(x.id));};
}
