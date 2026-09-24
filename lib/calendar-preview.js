import {planningSummary} from './person-planning.js';
import {eventProjectIds} from './planning-affairs.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function calendarLabel(ui,e){if(e.purpose)return e.purpose;if(e.kind==='project'&&e.groupTitle)return e.groupTitle+(eventProjectIds(e).length>1?' · '+eventProjectIds(e).length+' affaires':'');const x=e.kind==='intervention'?ui.data.interventions.find(x=>x.id===e.linkId):e.kind==='visit'?ui.data.visits.find(x=>x.id===e.linkId):null;return x?[x.title||x.clientName,x.number].filter(Boolean).join(' · '):ui.linkLabel(e)||e.title;}
export async function previewEvent(ui,id){
 const e=ui.data.events.find(x=>x.id===id);if(!e)return;
 const x=e.kind==='intervention'?ui.data.interventions.find(x=>x.id===e.linkId):e.kind==='visit'?ui.data.visits.find(x=>x.id===e.linkId):null;
 ui.c.modal('Rendez-vous',`<section class="calendarPreview"><h2>${esc(calendarLabel(ui,e))}</h2><p>${esc(new Date(e.start).toLocaleString('fr-FR'))} → ${esc(new Date(e.end).toLocaleString('fr-FR'))}</p>${missionHtml(e,x)}<h3>Adresse</h3><p id="eventAddress">${esc(x?.siteAddress||e.address||e.siteAddress||'Adresse en cours de vérification…')}</p><section id="eventAccess">${accessHtml(x||{})}</section><h3>Équipe</h3><p>${esc(ui.teamNames(e.teamIds)||'Équipe à préciser')}</p><p>${esc(planningSummary(e,ui.data.people))}</p><div class="actionRow"><button id="eventBack" type="button">Retour au planning</button><button id="eventFile" type="button" class="secondary">Ouvrir le dossier</button>${ui.canPlan()?'<button id="eventEdit" type="button" class="secondary">Modifier le rendez-vous</button>':''}</div></section>`);
 document.getElementById('eventBack').onclick=()=>document.getElementById('modal').close();
 const openFile=async(kind,id)=>{try{if(kind==='project')await ui.c.openProject(id);else if(kind==='intervention')await ui.openIntervention(id);else await ui.openVisit(id);if(kind==='project')document.getElementById('modal').close();}catch(error){ui.c.toast('Impossible d’ouvrir le dossier : '+error.message);}};
 document.getElementById('eventFile').onclick=()=>openFile(e.kind,e.linkId);
 if(ui.canPlan())document.getElementById('eventEdit').onclick=()=>ui.planEvent(e);
 const address=document.getElementById('eventAddress'),access=document.getElementById('eventAccess');
 const ids=eventProjectIds(e);
 if(ids.length>1)address.previousElementSibling.hidden=true;
 if(ids.length>1){
  const section=document.createElement('section');section.innerHTML='<h3>Affaires de la journée</h3>'+ids.map((id,i)=>'<p><button class="secondary" data-open-affair="'+esc(id)+'">'+esc(ui.c.getCatalog().projects.find(p=>p.id===id)?.name||id)+'</button><span data-affair-address="'+i+'"></span></p><section data-affair-access="'+i+'"></section>').join('');
  address.before(section);document.getElementById('eventFile').hidden=true;
  section.querySelectorAll('[data-open-affair]').forEach(b=>b.onclick=()=>openFile('project',b.dataset.openAffair));
  if(ui.c.projectMeta)await Promise.all(ids.map(async(id,i)=>{const span=section.querySelector('[data-affair-address="'+i+'"]');try{const m=await ui.c.projectMeta(id);if(span.isConnected){span.textContent=' — '+(m.adresse||'Adresse non renseignée');section.querySelector('[data-affair-access="'+i+'"]').innerHTML=accessHtml(m);}}catch{if(span.isConnected)span.textContent=' — Adresse indisponible';}}));
  address.hidden=true;return;
 }
 if(e.kind==='project'&&ui.c.projectMeta){try{const m=await ui.c.projectMeta(e.linkId);if(address.isConnected){address.textContent=m.adresse||'Adresse non renseignée dans la fiche chantier.';access.innerHTML=accessHtml(m);}}catch{if(address.isConnected){address.textContent='Adresse indisponible : vérifiez la connexion.';access.textContent='Consignes indisponibles : vérifiez la connexion avant le déplacement.';}}}
 else if(!x?.siteAddress&&!e.address&&!e.siteAddress)address.textContent='Adresse non renseignée.';
}

export function missionHtml(e,x){
 const rows=[['Dossier',x?[x.number,x.clientName].filter(Boolean).join(' · '):e.title],['Participants invités',x?.receptionGuests],['Objet',x?.title||e.purpose],['Objet de ce passage',x?.title?e.purpose:''],['Demande / travaux prévus',x?.request],['À faire pour ce rendez-vous',e.instructions]].filter(([,v])=>String(v||'').trim());
 return '<section class="eventMission" style="background:#edf4fa;padding:12px;border-radius:8px;overflow-wrap:anywhere">'+(rows.length?rows.map(([label,v])=>'<div style="margin-bottom:8px"><strong>'+esc(label)+'</strong><p style="white-space:pre-wrap;margin:4px 0">'+esc(v)+'</p></div>').join(''):'<p>Aucune consigne renseignée pour ce passage.</p>')+'</section>';
}

export function accessHtml(m){
 const rows=[['Accès / consignes générales',m.notes||m.siteAccess],['Contact sur place',m.contact||m.siteContact],['Téléphone',m.telephone||m.sitePhone],['E-mail',m.email||m.siteEmail],['Nature des travaux',m.chantier]];
 if(Array.isArray(m.observations))for(const o of m.observations){if(o.text)rows.push([['Observation',o.title,o.location].filter(Boolean).join(' · '),o.text]);}
 return rows.filter(([,v])=>String(v||'').trim()).map(([label,value])=>'<div class="eventAccessItem"><strong>'+esc(label)+'</strong><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(value)+'</p></div>').join('');
}
