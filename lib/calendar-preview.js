import {planningSummary} from './person-planning.js';
import {eventProjectIds} from './planning-affairs.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function calendarLabel(ui,e){if(e.kind==='project'&&e.groupTitle)return e.groupTitle+(eventProjectIds(e).length>1?' · '+eventProjectIds(e).length+' affaires':'');const x=e.kind==='intervention'?ui.data.interventions.find(x=>x.id===e.linkId):e.kind==='visit'?ui.data.visits.find(x=>x.id===e.linkId):null;return x?[x.title||x.clientName,x.number].filter(Boolean).join(' · '):ui.linkLabel(e)||e.title;}
export async function previewEvent(ui,id){
 const e=ui.data.events.find(x=>x.id===id);if(!e)return;
 const x=e.kind==='intervention'?ui.data.interventions.find(x=>x.id===e.linkId):e.kind==='visit'?ui.data.visits.find(x=>x.id===e.linkId):null;
 ui.c.modal('Rendez-vous',`<section class="calendarPreview"><h2>${esc(calendarLabel(ui,e))}</h2><p>${esc(new Date(e.start).toLocaleString('fr-FR'))} → ${esc(new Date(e.end).toLocaleString('fr-FR'))}</p><h3>Adresse</h3><p id="eventAddress">${esc(x?.siteAddress||e.address||e.siteAddress||'Adresse en cours de vérification…')}</p><h3>Équipe</h3><p>${esc(ui.teamNames(e.teamIds)||'Équipe à préciser')}</p><p>${esc(planningSummary(e,ui.data.people))}</p><div class="actionRow"><button id="eventBack" type="button">Retour au planning</button><button id="eventFile" type="button" class="secondary">Ouvrir le dossier</button>${ui.canPlan()?'<button id="eventEdit" type="button" class="secondary">Modifier le rendez-vous</button>':''}</div></section>`);
 document.getElementById('eventBack').onclick=()=>document.getElementById('modal').close();
 document.getElementById('eventFile').onclick=()=>{document.getElementById('modal').close();if(e.kind==='project')return ui.c.openProject(e.linkId);if(e.kind==='intervention')return ui.openIntervention(e.linkId);return ui.openVisit(e.linkId);};
 if(ui.canPlan())document.getElementById('eventEdit').onclick=()=>ui.planEvent(e);
 const address=document.getElementById('eventAddress');
 const ids=eventProjectIds(e);
 if(ids.length>1)address.previousElementSibling.hidden=true;
 if(e.instructions){const p=document.createElement('p');p.className='eventInstructions';p.style.whiteSpace='pre-wrap';p.textContent=e.instructions;address.before(p);}
 if(ids.length>1){
  const section=document.createElement('section');section.innerHTML='<h3>Affaires de la journée</h3>'+ids.map((id,i)=>'<p><button class="secondary" data-open-affair="'+esc(id)+'">'+esc(ui.c.getCatalog().projects.find(p=>p.id===id)?.name||id)+'</button><span data-affair-address="'+i+'"></span></p>').join('');
  address.before(section);document.getElementById('eventFile').hidden=true;
  section.querySelectorAll('[data-open-affair]').forEach(b=>b.onclick=()=>{document.getElementById('modal').close();return ui.c.openProject(b.dataset.openAffair);});
  if(ui.c.projectMeta)await Promise.all(ids.map(async(id,i)=>{const span=section.querySelector('[data-affair-address="'+i+'"]');try{const m=await ui.c.projectMeta(id);if(span.isConnected)span.textContent=' — '+(m.adresse||'Adresse non renseignée');}catch{if(span.isConnected)span.textContent=' — Adresse indisponible';}}));
  address.hidden=true;return;
 }
 if(e.kind==='project'&&ui.c.projectMeta){try{const m=await ui.c.projectMeta(e.linkId);if(address.isConnected)address.textContent=m.adresse||'Adresse non renseignée dans la fiche chantier.';}catch{if(address.isConnected)address.textContent='Adresse indisponible : vérifiez la connexion.';}}
 else if(!x?.siteAddress&&!e.address&&!e.siteAddress)address.textContent='Adresse non renseignée.';
}
