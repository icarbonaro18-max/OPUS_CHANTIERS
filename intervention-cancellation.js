import {planningOriginals,reassignPlanning} from './planning-reassign.js';
export function canCancelIntervention(ui,x){return !!ui.canPlan()&&!x.projectId&&!x.archivedAt&&['a_planifier','planifiee','en_cours'].includes(x.status);}
export async function cancelIntervention(ui,x,reason){
 if(!canCancelIntervention(ui,x))throw Error('Cette intervention ne peut pas être annulée avec vos droits ou son statut actuel.');
 reason=String(reason||'').trim();if(!reason)throw Error('Indiquez le motif de l’annulation.');
 const before=ui.data.events,linked=planningOriginals(before).filter(e=>e.kind==='intervention'&&e.linkId===x.id);
 if(x.actualStart||x.actualEnd||(x.reportItems||[]).some(i=>i.actualStart||i.actualEnd)||linked.some(e=>e.actualStart||e.actualEnd)||before.some(e=>e.kind==='intervention'&&e.linkId===x.id&&(e.actualStart||e.actualEnd)))throw Error('Des horaires réalisés sont enregistrés. Faites vérifier cette intervention au bureau avant de l’annuler.');
 const snapshot=JSON.parse(JSON.stringify(x)),now=new Date().toISOString();
 // Keep a durable cancellation first. A failed planning cleanup is retryable.
 Object.assign(x,{status:'annulee',cancellationReason:reason,cancelledAt:now,cancelledBy:ui.user?.displayName||'',updatedAt:now,cancelledPlanning:linked,cancellationPlanningPending:true});
 try{await ui.save('interventions');}catch(e){for(const k of Object.keys(x))delete x[k];Object.assign(x,snapshot);throw e;}
 await finishCancellationPlanning(ui,x);
}
export async function finishCancellationPlanning(ui,x){
 if(!ui.canPlan()||x.status!=='annulee')throw Error('Action non autorisée.');
 const before=ui.data.events,linked=planningOriginals(before).filter(e=>e.kind==='intervention'&&e.linkId===x.id);
 ui.data.events=reassignPlanning(before,[],linked.map(e=>e.id),ui.data.people||[]);
 try{await ui.save('events');}catch(e){ui.data.events=before;throw Error('Annulation enregistrée, mais planning à libérer : '+e.message);}
 x.cancellationPlanningPending=false;
 try{await ui.save('interventions');}catch(e){x.cancellationPlanningPending=true;throw Error('Planning libéré, confirmation à réessayer : '+e.message);}
}
