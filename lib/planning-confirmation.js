import {eventProjectIds} from './planning-affairs.js';
import {progress,targetStage} from './project-progress.js';
const stages={'01':'À préparer','02':'En cours','03':'À contrôler','04':'Terminé','99':'Archivé'};

// Read the actual Microsoft parent before and after a move. A stale catalogue
// must never reopen a project that the office has already reviewed or closed.
export async function verifyPlannedProject(ui,id){
 const catalog=ui.c.getCatalog(),p=catalog.projects.find(p=>p.id===id),g=ui.c.graph;
 if(!p)throw Error('Chantier introuvable');
 const before=await g.item(id),folder=catalog.categories.find(c=>c.id===before.parentReference?.id);
 const current=folder?.name?.trim().slice(0,2);
 if(!stages[current])throw Error('Classement actuel du chantier inconnu');
 const info=progress(ui.data,id);
 if(!info.scheduled)throw Error('Aucun rendez-vous enregistré pour ce chantier');
 // Planning alone only advances prepared projects; later workflow takes priority.
 const next=['01','02'].includes(current)?targetStage({...p,category:current},info):current;
 const destination=catalog.categories.find(c=>c.name.trim().startsWith(next));
 if(!destination)throw Error('Rubrique '+(stages[next]||next)+' introuvable');
 if(before.parentReference?.id!==destination.id)await g.moveProject(before,destination);
 const verified=await g.item(id);
 if(verified.parentReference?.id!==destination.id)throw Error('Microsoft n’a pas confirmé le classement');
 p.category=next;p.categoryFolder=destination;
 return {id,name:p.name,category:next};
}

export async function confirmPlanning(ui,saved){
 const projectIds=[...new Set(saved.flatMap(e=>e.kind==='intervention'?[ui.data.interventions.find(r=>r.id===e.linkId)?.projectId].filter(Boolean):eventProjectIds(e)))];
 const results=[],errors=[];
 for(const id of projectIds){
  try{if(!ui.c.ensurePlannedProject)throw Error('Rechargez l’application pour vérifier le classement');results.push(await ui.c.ensurePlannedProject(id));}
  catch(e){errors.push({id,name:ui.c.getCatalog().projects.find(p=>p.id===id)?.name||id,error:e.message});}
 }
 const diverted=saved.some(e=>ui.data.events.find(row=>row.id===e.id)?.displacedProjects?.length);
 const details=results.map(p=>p.name+' : '+(stages[p.category]||p.category)+'.').join(' ');
 const warning=errors.length?' Classement non confirmé : '+errors.map(p=>p.name+' ('+p.error+')').join(' ; ')+'. Utilisez « Vérifier le classement » sans recréer le rendez-vous.':'';
 ui.planningNotice={eventIds:saved.map(e=>e.id),warning:!!errors.length,message:'Planning enregistré.'+(diverted?' Créneaux de chantier ajustés pour les techniciens sélectionnés.':'')+(details?' '+details:'')+warning};
 return ui.planningNotice;
}

export function mountPlanningNotice(ui,root){
 root.querySelector('#planningConfirmation')?.remove();const notice=ui.planningNotice;if(!notice)return;
 const box=document.createElement('section');box.id='planningConfirmation';box.className='planningConfirmation'+(notice.warning?' warning':'');box.setAttribute('role','status');box.setAttribute('aria-live','polite');
 const text=document.createElement('p');text.textContent=notice.message;box.append(text);
 if(notice.warning&&ui.canPlan()){
  const retry=document.createElement('button');retry.type='button';retry.textContent='Vérifier le classement';retry.onclick=async()=>{retry.disabled=true;const saved=ui.data.events.filter(e=>notice.eventIds.includes(e.id));if(saved.length){await confirmPlanning(ui,saved);}else{ui.planningNotice={message:'Ces rendez-vous ne sont plus présents dans le planning. Actualisez le calendrier.',warning:false};}mountPlanningNotice(ui,root);};box.append(retry);
 }
 const close=document.createElement('button');close.type='button';close.className='quiet';close.textContent='Fermer';close.onclick=()=>{ui.planningNotice=null;box.remove();window.dispatchEvent(new Event('resize'));};box.append(close);
 root.querySelector('.pageHeading')?.after(box);window.dispatchEvent(new window.Event('resize'));
}
