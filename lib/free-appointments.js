import {isoDate,makeId,durationHours} from './ops.js';
import {originalAppointment,planningOriginals,reassignPlanning} from './planning-reassign.js';
import {plannedTotal} from './person-planning.js';
import {confirmPlanning} from './planning-confirmation.js';
import {withCalendarHistory} from './calendar-undo.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['title','address','instructions','start','end','teamIds','pauseHours','exactHours','status','actualStart','actualEnd'];
const fingerprint=e=>JSON.stringify(fields.map(k=>e?.[k]??null));
async function prepare(ui,base){
 if(!ui.canPlan())throw Error('Planification réservée au bureau.');
 await ui.c.prepareAppointmentWrite?.();
 if(!ui.canPlan())throw Error('Planification réservée au bureau.');
 if(!base)return null;
 const current=planningOriginals(ui.data.events).find(e=>e.id===base.id);
 if(!current||current.kind!=='free')throw Error('Ce rendez-vous n’est plus disponible. Fermez cette fenêtre et actualisez le planning.');
 if(fingerprint(current)!==fingerprint(base))throw Error('Ce rendez-vous a changé sur un autre appareil. Votre saisie reste affichée ; fermez puis rouvrez le rendez-vous pour consulter sa nouvelle version.');
 return current;
}

export async function saveFreeAppointment(ui,base,values,id=makeId('evt')){
 const current=await prepare(ui,base);
 return withCalendarHistory(ui,current?'Modifier le rendez-vous libre':'Créer le rendez-vous libre',async()=>{
 const title=String(values.title||'').trim(),date=values.date,start=values.start,end=values.end;
 if(!title)throw Error('Indiquez l’objet du rendez-vous, par exemple « Nettoyage du dépôt ».');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}$/.test(start||'')||!/^\d{2}:\d{2}$/.test(end||''))throw Error('Renseignez la date et les horaires.');
 const teamIds=[...new Set(values.teamIds||[])];
 if(!teamIds.length)throw Error('Choisissez au moins une personne dans l’équipe.');
 if(teamIds.some(id=>!ui.data.people.some(p=>p.id===id&&p.active!==false)))throw Error('L’équipe a changé. Vérifiez les personnes sélectionnées.');
 const pause=Number(values.pauseHours),a=new Date(date+'T'+start),b=new Date(date+'T'+end);
 if(!Number.isFinite(+a)||!Number.isFinite(+b)||isoDate(a)!==date||b<=a||!Number.isFinite(pause)||pause<0||pause>=durationHours(a,b))throw Error('Vérifiez les horaires et la pause : la fin doit être après le début.');
 const before=ui.data.events,eventId=current?.id||id;
 if(!current&&planningOriginals(before).some(e=>e.id===eventId))throw Error('Ce rendez-vous existe déjà. Actualisez le planning pour le consulter.');
 ui.validateScheduling(date,start,end,teamIds,eventId,!!values.exactHours,true,current?.fridayExtendedIds||[]);
 const event={...current,id:eventId,kind:'free',linkId:'',title,address:String(values.address||'').trim(),instructions:String(values.instructions||'').trim(),start:a.toISOString(),end:b.toISOString(),teamIds,teamSize:teamIds.length,pauseHours:pause,exactHours:!!values.exactHours,status:current?.status||'planifie',updatedAt:new Date().toISOString()};
 event.laborHours=plannedTotal(event,ui.data.people);
 ui.data.events=reassignPlanning(before,[event],[],ui.data.people);
 try{await ui.save('events');}catch(error){ui.data.events=before;throw error;}
 await confirmPlanning(ui,[event]);
 return event;
 });
}

export async function deleteFreeAppointment(ui,base){
 const current=await prepare(ui,base),before=ui.data.events;
 if(!current)throw Error('Rendez-vous introuvable.');
 return withCalendarHistory(ui,'Supprimer le rendez-vous libre',async()=>{
 ui.data.events=reassignPlanning(before,[],[current.id],ui.data.people);
 try{await ui.save('events');}catch(error){ui.data.events=before;throw error;}
 });
}

export function editFreeAppointment(ui,existing=null,slot=null){
 if(!ui.canPlan())return;
 const base=existing?structuredClone(originalAppointment(ui.data.events,existing)):null;
 if(base&&base.kind!=='free')return;
 const id=base?.id||makeId('evt'),localStart=base?ui.localDT(base.start):'',localEnd=base?ui.localDT(base.end):'';
 const date=localStart.slice(0,10)||slot?.date||isoDate(new Date()),start=localStart.slice(11,16)||slot?.start||'08:00';
 const minutes=Number(start.slice(0,2))*60+Number(start.slice(3))+60,endMinutes=Math.min(1439,minutes);
 const end=localEnd.slice(11,16)||String(Math.floor(endMinutes/60)).padStart(2,'0')+':'+String(endMinutes%60).padStart(2,'0');
 let selected=[...(base?.teamIds||[])];
 if(!base&&ui.data.people.some(p=>p.id===ui.calendarPersonId&&p.active!==false))selected=[ui.calendarPersonId];
 ui.c.modal(base?'Modifier le rendez-vous libre':'Rendez-vous libre — équipe',`<form id="freeEventForm"><p>Rendez-vous partagé dans le planning des personnes sélectionnées.</p><label>Objet<input id="freeTitle" required placeholder="Ex. Nettoyage du dépôt" value="${esc(base?.title)}"></label><label>Lieu / adresse<input id="freeAddress" placeholder="Ex. Dépôt OPUS ELEC" value="${esc(base?.address)}"></label><div class="formGrid"><label>Date<input id="freeDate" type="date" required value="${esc(date)}"></label><label>Début<input id="freeStart" type="time" required value="${esc(start)}"></label><label>Fin<input id="freeEnd" type="time" required value="${esc(end)}"></label><label>Pause (heures)<input id="freePause" type="number" min="0" step="0.25" value="${base?.pauseHours||0}"></label></div><label class="inline"><input id="eventExactHours" type="checkbox" ${base?.exactHours?'checked':''}> Horaires exceptionnels : conserver les heures saisies</label><fieldset><legend>Personnes concernées</legend><div class="actionRow"><button id="freeAll" type="button" class="secondary">Toute l’équipe disponible</button><button id="freeNone" type="button" class="secondary">Tout décocher</button></div><p id="freeTeamSummary"></p><div id="freeTeam"></div></fieldset><label>Consignes<textarea id="freeInstructions" rows="3" placeholder="Ex. Ranger les outils et nettoyer le dépôt.">${esc(base?.instructions)}</textarea></label><p class="muted">Si une personne est déjà affectée sur ce créneau, son planning sera ajusté. Les absences et jours d’école restent bloquants.</p><p id="freeStatus" role="status" aria-live="polite"></p><div class="actionRow"><button type="submit">${base?'Enregistrer les modifications':'Enregistrer le rendez-vous'}</button>${base?'<button id="freeDelete" type="button" class="danger">Supprimer le rendez-vous</button>':''}</div></form>`);
 const form=document.getElementById('freeEventForm'),get=id=>form.querySelector('#'+id),status=get('freeStatus');
 const sync=()=>{selected=[...form.querySelectorAll('[name=teamPerson]:checked')].map(cb=>cb.value);get('freeTeamSummary').textContent=ui.teamNames(selected);};
 const redraw=()=>{get('freeTeam').innerHTML=ui.teamPickerHtml(selected,get('freeDate').value,get('freeStart').value,get('freeEnd').value,id);form.querySelectorAll('[name=teamPerson]').forEach(cb=>cb.onchange=sync);sync();};
 for(const name of ['freeDate','freeStart','freeEnd','eventExactHours'])get(name).onchange=redraw;
 get('freeAll').onclick=()=>{form.querySelectorAll('[name=teamPerson]').forEach(cb=>{cb.checked=!cb.disabled&&!cb.closest('.personPick')?.classList.contains('disabled');});sync();};
 get('freeNone').onclick=()=>{form.querySelectorAll('[name=teamPerson]').forEach(cb=>{cb.checked=false;});sync();};
 redraw();
 const act=async work=>{
  if(form.dataset.busy)return;
  form.dataset.busy='1';const controls=[...form.querySelectorAll('input,textarea,button')].filter(el=>!el.disabled);controls.forEach(el=>el.disabled=true);status.textContent='Enregistrement en cours…';
  try{await work();if(form.isConnected){document.getElementById('modal').close();await ui.renderCalendar();}}
  catch(error){status.textContent=error.message||'Enregistrement impossible. Votre saisie reste dans cette fenêtre.';}
  finally{delete form.dataset.busy;controls.forEach(el=>el.disabled=false);}
 };
 form.onsubmit=ev=>{ev.preventDefault();const values={title:get('freeTitle').value,address:get('freeAddress').value,date:get('freeDate').value,start:get('freeStart').value,end:get('freeEnd').value,pauseHours:get('freePause').value,exactHours:get('eventExactHours').checked,teamIds:[...selected],instructions:get('freeInstructions').value};return act(async()=>{const saved=await saveFreeAppointment(ui,base,values,id);if(ui.calendarPersonId&&!saved.teamIds.includes(ui.calendarPersonId))ui.calendarPersonId='';ui.c.toast('Rendez-vous libre enregistré dans le planning de l’équipe.');});};
 if(base)get('freeDelete').onclick=()=>{if(confirm('Supprimer ce rendez-vous libre du planning des personnes concernées ?'))return act(async()=>{await deleteFreeAppointment(ui,base);ui.c.toast('Rendez-vous libre supprimé.');});};
}
