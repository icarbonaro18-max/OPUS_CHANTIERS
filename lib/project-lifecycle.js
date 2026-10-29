import {inspectQuietProject} from './project-retention.js';
const stamp=v=>Number.isFinite(Date.parse(v))?Date.parse(v):0;
async function saveRow(ui,row){const before=ui.data.projectTracking||[];ui.data.projectTracking=[...before.filter(x=>x.id!==row.id),row];try{await ui.repo.save('projectTracking',ui.data.projectTracking);}catch(e){ui.data.projectTracking=before;throw e;}}
export async function completeProject(ui,p){
 if(!ui.c.isAdmin())throw Error('Clôture réservée à l’administrateur.');
 if(p.category!=='03')throw Error('Le chantier doit être à contrôler.');
 const old=(ui.data.projectTracking||[]).find(x=>x.id===p.id)||{id:p.id};const now=new Date().toISOString();
 await saveRow(ui,{...old,controlApproved:true,attestationsChecked:true,completedAt:now,history:[...(old.history||[]),{at:now,by:ui.user?.displayName||'',action:'Chantier contrôlé — terminé'}]});
 await ui.c.syncProjectStages();
 if(p.category!=='04')throw Error('Contrôle enregistré, déplacement non confirmé. Réessayez Actualiser.');
}
export function mountCompleteProject(ui,p,actions){
 if(!ui.c.isAdmin()||p.category!=='03')return;
 const b=document.createElement('button');b.textContent='Chantier contrôlé → Terminé';actions.append(b);
 b.onclick=()=>{ui.c.modal('Terminer le chantier',`<p>Confirmez le contrôle avant de classer ce chantier dans Terminés.</p><form id="completeProjectForm"><label class="inline"><input type="checkbox" required> Contrôle du chantier effectué</label><label class="inline"><input type="checkbox" required> Attestations requises vérifiées dans le dossier</label><p>Après 15 jours sans modification, le dossier sera archivé lors d’une actualisation par le bureau.</p><button type="submit">Chantier contrôlé → Terminé</button><p id="completeProjectStatus" role="status"></p></form>`);const form=document.getElementById('completeProjectForm');form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;const submit=form.querySelector('button');submit.disabled=true;try{await completeProject(ui,p);document.getElementById('modal').close();ui.c.toast('Chantier classé dans Terminés.');}catch(err){document.getElementById('completeProjectStatus').textContent=err.message;submit.disabled=false;}};};
}
export async function ensureCompletionClock(ui,p,now=new Date()){
 const old=(ui.data.projectTracking||[]).find(x=>x.id===p.id)||{id:p.id};if(stamp(old.completedAt))return old;
 const row={...old,completedAt:now.toISOString()};await saveRow(ui,row);return row;
}
export async function canAutoArchive(ui,p,now=new Date(),{check=()=>{}}={}){
 if(!ui.c.isAdmin()||p.category!=='04')return false;
 const row=(ui.data.projectTracking||[]).find(x=>x.id===p.id);if(!stamp(row?.completedAt))return false;
 return (await inspectQuietProject(ui,p,now,{anchor:row.completedAt,check})).eligible;
}
