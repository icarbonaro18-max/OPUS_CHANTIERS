import {canCancelIntervention,cancelIntervention} from './intervention-cancellation.js';
import {updateTracking} from './project-progress.js';
import {setInterventionArchived} from './import-intervention-reports.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const restore=(row,before)=>{for(const key of Object.keys(row))delete row[key];Object.assign(row,before);};
export const pendingReview=x=>!x.projectId&&!x.appArchivedAt&&!x.archivedAt&&x.status==='terminee';
export const reviewedCase=x=>!x.projectId&&!x.appArchivedAt&&(!!x.archivedAt&&x.status==='terminee'||x.status==='facturee');
export function reviewCases(ui,category){return (ui?.data?.interventions||[]).filter(x=>category==='03'?pendingReview(x):category==='04'?reviewedCase(x):category==='all'&&(pendingReview(x)||reviewedCase(x)));}
export async function finishProjectWithoutReport(ui,id){
 const p=ui.c.getCatalog().projects.find(p=>p.id===id);
 if(!p||!['01','02','03'].includes(p.category))throw Error('Ce chantier ne peut plus être envoyé à contrôler.');
 if(ui.cacheMode||ui.dataLoadError||ui.needsRefresh)throw Error('Actualisez les données Microsoft avant de terminer.');
 await updateTracking(ui,id,{}, {finish:true});
 // The explicit verification also covers an earlier background classification already in flight.
 await ui.c.ensureProjectReview(id);
}
export async function finishInterventionWithoutReport(ui,id){
 if(!ui.user)throw Error('Connectez-vous avant de terminer.');
 const x=ui.data.interventions.find(row=>row.id===id);
 if(!x||x.projectId||x.appArchivedAt||x.archivedAt||['annulee','facturee'].includes(x.status))throw Error('Cette intervention ne peut plus être terminée ici.');
 if(x.status==='terminee')return x;
 const before=structuredClone(x),now=new Date().toISOString();
 Object.assign(x,{status:'terminee',completedAt:now,completionRecordedAt:now,updatedAt:now,completionMode:'withoutReport',completionWithoutReport:true});
 // No scheduled time is substituted for an actual time; existing drafts and photos remain intact.
 try{await ui.save('interventions');}catch(e){restore(x,before);throw e;}
 return x;
}
export function mountProjectCompletion(ui,p,actions){
 if(!ui||!['01','02','03'].includes(p.category))return;
 const b=actions.ownerDocument.createElement('button');b.type='button';b.className='secondary';b.textContent='Terminer sans rapport → À contrôler';actions.append(b);
 b.onclick=()=>confirmCompletion(ui,'Terminer le chantier sans rapport',()=>finishProjectWithoutReport(ui,p.id));
}
function confirmCompletion(ui,title,save,done){
 ui.c.modal(title,'<form id="withoutReportForm"><p>Les travaux sont terminés. Le dossier sera envoyé à contrôler par le bureau. Les saisies et documents existants sont conservés.</p><p>Cette action ne crée pas de rapport et ne renseigne pas les heures réalisées.</p><button type="submit" class="completeOneDrive">Terminer sans rapport → À contrôler</button><p role="status"></p></form>');
 const form=document.getElementById('withoutReportForm');form.onsubmit=async e=>{e.preventDefault();if(form.dataset.saving)return;form.dataset.saving='1';const b=form.querySelector('button'),status=form.querySelector('[role=status]');b.disabled=true;status.textContent='Enregistrement…';try{await save();document.getElementById('modal').close();ui.c.toast('Travaux terminés · dossier à contrôler.');await done?.();}catch(error){status.textContent='Enregistrement non confirmé : '+error.message;}finally{delete form.dataset.saving;b.disabled=false;}};
}
export function mountInterventionCompletion(ui,root){
 for(const card of root.querySelectorAll('.projectCard')){
  const id=card.querySelector('[data-int]')?.dataset.int,x=ui.data.interventions.find(row=>row.id===id);
  if(!x||x.projectId)continue;
  const actions=card.querySelector('.actionRow');if(!actions)continue;
  const report=document.createElement('button');report.type='button';report.className='secondary';report.textContent='Faire un rapport';report.onclick=()=>ui.openIntervention(id);actions.prepend(report);
  if(['a_planifier','planifiee','en_cours'].includes(x.status)){
   const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Terminer sans rapport';actions.append(b);
   b.onclick=()=>confirmCompletion(ui,'Terminer l’intervention sans rapport',()=>finishInterventionWithoutReport(ui,id),async()=>{ui.interventionView='completed';await ui.renderInterventions();});
  }
  if(canCancelIntervention(ui,x)){const b=document.createElement('button');b.type='button';b.className='danger';b.textContent='Annuler / supprimer';actions.append(b);b.onclick=()=>showCancellation(ui,id);}
  if(x.completionWithoutReport){const label=document.createElement('p');label.textContent='Terminée sans rapport · horaires réels à vérifier si nécessaire';card.querySelector('h3').after(label);}
 }
}
export function mountReviewInterventions(ui,root,category,query=''){
 if(!ui||!['all','03','04'].includes(category))return;
 const rows=reviewCases(ui,category).filter(x=>[x.number,x.clientName,x.title].join(' ').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query));
 if(!rows.length)return;
 const box=root.ownerDocument.createElement('section');box.className='panel';box.innerHTML='<h2>'+({all:'Interventions', '03':'Interventions à contrôler', '04':'Interventions terminées'}[category])+'</h2><p>Vérifiez la facture dans Mediabat et le rapport éventuel, puis classez l’intervention dans Terminées.</p>'+rows.map(x=>`<article class="row"><div><h3>${esc(x.number)} · ${esc(x.clientName)} · ${esc(x.title)}</h3><p>${reviewedCase(x)?'Contrôlée · Terminée':'À contrôler'} · ${x.completionWithoutReport?'Sans rapport':'Rapport disponible'}</p></div><div class="actionRow"><button type="button" data-review-open="${esc(x.id)}">Ouvrir</button>${ui.c.isAdmin()&&pendingReview(x)?`<button type="button" data-review-finish="${esc(x.id)}">Contrôlée → Terminé</button>`:''}</div></article>`).join('');root.append(box);
 box.querySelectorAll('[data-review-open]').forEach(b=>b.onclick=()=>ui.openIntervention(b.dataset.reviewOpen));
 box.querySelectorAll('[data-review-finish]').forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await setInterventionArchived(ui,b.dataset.reviewFinish);ui.c.showDashboard();ui.c.toast('Intervention contrôlée · terminée.');}catch(e){ui.c.toast(e.message);b.disabled=false;}});
}

export function showCancellation(ui,id){
 const x=ui.data.interventions.find(row=>row.id===id);if(!x||!canCancelIntervention(ui,x))return;
 ui.c.modal('Retirer l’intervention non réalisée',`<form id="cancelUnperformedForm"><p>Cette demande quittera les interventions en cours et sera conservée dans « Annulées ». Son rendez-vous éventuel sera retiré du planning. Elle ne sera pas envoyée à contrôler.</p><label>Motif<textarea id="unperformedReason" required>Client sans retour — intervention non réalisée</textarea></label><button type="submit" class="danger">Confirmer l’annulation / suppression</button><p role="status"></p></form>`);
 const form=document.getElementById('cancelUnperformedForm');form.onsubmit=async e=>{e.preventDefault();if(form.dataset.saving)return;form.dataset.saving='1';const b=form.querySelector('button'),status=form.querySelector('[role=status]');b.disabled=true;try{
  const current=ui.data.interventions.find(row=>row.id===id);if(!current)throw Error('Cette intervention n’est plus disponible.');
  await cancelIntervention(ui,current,document.getElementById('unperformedReason').value);
  document.getElementById('modal').close();ui.interventionView='current';await ui.renderInterventions();ui.c.toast('Intervention retirée des dossiers en cours · conservée dans Annulées.');
 }catch(error){status.textContent='Annulation non confirmée : '+error.message;}finally{delete form.dataset.saving;b.disabled=false;}};
}
