import {activeProject,suggestedRows} from './active-suggestions.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fileName=id=>'opus-private-appointment-'+id+'.json';
export function expandPrivateEvents(rows){
 return rows.flatMap(row=>{
  if(!row.recurrence)return [row];
  const first=new Date(row.start),last=new Date(row.recurrence.until+'T23:59:59'),finish=new Date(row.end),out=[];
  if(!Number.isFinite(+last))return [row];
  const cursor=new Date(first);cursor.setHours(0,0,0,0);
  const daySpan=Math.round((Date.UTC(finish.getFullYear(),finish.getMonth(),finish.getDate())-Date.UTC(first.getFullYear(),first.getMonth(),first.getDate()))/86400000);
  for(let n=0;cursor<=last&&n<1830;n++,cursor.setDate(cursor.getDate()+1)){
   if(!(row.recurrence.days||[]).includes(cursor.getDay()))continue;
   const start=new Date(cursor);start.setHours(first.getHours(),first.getMinutes(),first.getSeconds(),0);if(start<first)continue;
   const end=new Date(cursor);end.setDate(end.getDate()+daySpan);end.setHours(finish.getHours(),finish.getMinutes(),finish.getSeconds(),0);
   out.push({...row,id:row.id+'::'+start.toISOString(),seriesId:row.id,start:start.toISOString(),end:end.toISOString()});
  }
  return out;
 });
}
export class PrivateCalendar {
 constructor(graph,ownerId){this.g=graph;this.ownerId=ownerId;this.rows=[];this.ready=false;}
 async load(){
  this.ready=false;
  const root=await this.g.request('/me/drive/special/approot');this.rootId=root.id;
  const items=await this.g.all('/me/drive/items/'+encodeURIComponent(root.id)+'/children');
  const rows=[];let personId=null;
  for(const item of items.filter(x=>x.name==='opus-private-calendar-settings.json'||/^opus-private-appointment-.*\.json$/.test(x.name))){
   const current=await this.g.request('/me/drive/items/'+encodeURIComponent(item.id));
   const url=current['@microsoft.graph.downloadUrl'];if(!url?.startsWith('https://'))throw Error('Lecture du calendrier privé impossible.');
   const response=await this.g.fetcher(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Lecture du rendez-vous impossible.');
   const row=await response.json();if(item.name==='opus-private-calendar-settings.json'){if(row.ownerId!==this.ownerId)throw Error('Association de calendrier invalide.');personId=row.personId||null;continue;}if(row.ownerId!==this.ownerId||row.kind!=='private'||!row.id)throw Error('Calendrier privé invalide : aucun enregistrement autorisé.');
   rows.push({...row,fileId:item.id,etag:current.eTag});
  }
  this.rows=rows;this.personId=personId;this.ready=true;return rows;
 }
 assertWritable(){if(this.cacheMode||globalThis.navigator?.onLine===false)throw Error('Agenda privé mémorisé : reconnectez-vous et actualisez avant de modifier.');}
 async associatePerson(personId){
  this.assertWritable();
  if(!this.ready||!personId)throw Error('Activez le calendrier et choisissez votre fiche.');
  await this.g.request('/me/drive/items/'+encodeURIComponent(this.rootId)+':/opus-private-calendar-settings.json:/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:new Blob([JSON.stringify({ownerId:this.ownerId,personId:String(personId)})],{type:'application/json'})});
  this.personId=String(personId);await this.onChange?.();
 }
 async save(input){
  this.assertWritable();
  if(!this.ready)throw Error('Activez et rechargez votre calendrier privé.');
  const old=this.rows.find(r=>r.id===input.id);
  if(old&&!old.etag)throw Error('Rechargez le calendrier avant de modifier ce rendez-vous.');
  const start=new Date(input.start),end=new Date(input.end);
  if(!String(input.title||'').trim()||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('Indiquez un objet et une fin postérieure au début.');
  let recurrence=null;
  if(input.recurrence){
   const days=[...new Set(input.recurrence.days||[])].filter(d=>Number.isInteger(d)&&d>=0&&d<=6),until=input.recurrence.until;
   const limit=new Date(start);limit.setFullYear(limit.getFullYear()+5);
   const last=new Date(until+'T23:59:59');
   if(!days.length||!/^\d{4}-\d{2}-\d{2}$/.test(until||'')||!Number.isFinite(+last)||last<start||last>limit)throw Error('Choisissez les jours et une fin de répétition valide (5 ans maximum).');
   recurrence={frequency:'weekly',days,until};
  }
  const row={id:old?.id||crypto.randomUUID(),kind:'private',ownerId:this.ownerId,recurrence,title:input.title.trim(),start:start.toISOString(),end:end.toISOString(),allDay:!!input.allDay,address:String(input.address||''),notes:String(input.notes||''),category:input.category||'Autre',projectId:input.category==='Rendez-vous de chantier'?String(input.projectId||''):'',projectName:input.category==='Rendez-vous de chantier'?String(input.projectName||''):'',teamIds:[],exactHours:true,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(recurrence&&!expandPrivateEvents([row]).length)throw Error('Aucun rendez-vous sur les jours choisis avant la date de fin.');
  const path=old?'/me/drive/items/'+encodeURIComponent(old.fileId)+'/content':'/me/drive/items/'+encodeURIComponent(this.rootId)+':/'+fileName(row.id)+':/content';
  const item=await this.g.request(path,{method:'PUT',headers:{'Content-Type':'application/json',...(old?{'If-Match':old.etag}:{})},body:new Blob([JSON.stringify(row)],{type:'application/json'})});
  this.rows=[...this.rows.filter(r=>r.id!==row.id),{...row,fileId:item.id,etag:item.eTag}];await this.onChange?.();return row;
 }
 async remove(id){this.assertWritable();const row=this.rows.find(r=>r.id===id);if(!this.ready||!row)throw Error('Rechargez le calendrier privé.');await this.g.request('/me/drive/items/'+encodeURIComponent(row.fileId),{method:'DELETE',headers:{'If-Match':row.etag}});this.rows=this.rows.filter(r=>r.id!==id);await this.onChange?.();}
}
// Resolve the connected administrator's personnel row for display only.
// Private records remain owned by the Microsoft account, never by a team ID.
export function privateCalendarPersonId(ui){
 if(!ui.c?.isAdmin?.())return null;
 const people=ui.data?.people||[],user=ui.user||{};
 const selected=ui.privateCalendar?.personId;
 if(ui.privateCalendar?.ownerId===user.id&&selected&&people.some(p=>String(p.id)===String(selected)))return String(selected);
 const emails=[user.mail,user.userPrincipalName].filter(Boolean).map(v=>v.trim().toLowerCase());
 const exact=people.filter(p=>p.email&&emails.includes(p.email.trim().toLowerCase()));
 if(exact.length===1)return exact[0].id;
 if(exact.length>1)return null;
 const name=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)?.sort().join(' ')||'';
 const ownName=name(user.displayName);if(!ownName)return null;
 const matches=people.filter(p=>name(p.name)===ownName);
 return matches.length===1?matches[0].id:null;
}
export function privateEvents(ui){return ui.c?.isAdmin?.()&&ui.privateCalendar?.ready?expandPrivateEvents(ui.privateCalendar.rows.filter(r=>r.ownerId===ui.user.id)):[];}
export function mountPrivateCalendar(ui,root){
 if(!ui.c.isAdmin())return;
 const bar=document.createElement('div');bar.className='panel privateCalendarPanel';bar.innerHTML='<strong>Mes rendez-vous privés · v3.4.83</strong><p>Commercial, administratif, personnel ou journée entière. Visibles uniquement avec votre compte administrateur dans OPUS.</p><button id="connectPrivateCalendar" type="button" class="secondary">'+(ui.privateCalendar?.ready?'Actualiser mes rendez-vous':'Activer mes rendez-vous privés')+'</button> <button type="button" id="newPrivateEvent" '+(ui.privateCalendar?.ready?'':'disabled')+'>+ Rendez-vous libre privé</button><p id="privateCalendarStatus" role="status"></p>';
 root.querySelector('.calendarViewSwitch').before(bar);
 if(ui.privateCalendar?.cacheMode)bar.querySelector('#privateCalendarStatus').textContent='Copie mémorisée de vos rendez-vous privés · consultation uniquement, actualisation nécessaire.';
 if(ui.privateCalendar?.ready){
  const mapping=document.createElement('div');mapping.innerHTML=`<label>Ma fiche dans le planning<select id="privatePersonLink"><option value="">— Choisir ma fiche —</option>${(ui.data.people||[]).map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(privateCalendarPersonId(ui))?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><button type="button" class="secondary" id="savePrivatePersonLink">Associer à mon agenda privé</button><p>Cette association affiche vos rendez-vous dans votre filtre personnel, sans les partager.</p>`;bar.append(mapping);
  document.getElementById('savePrivatePersonLink').onclick=async()=>{const b=document.getElementById('savePrivatePersonLink'),id=document.getElementById('privatePersonLink').value,status=document.getElementById('privateCalendarStatus');b.disabled=true;try{await ui.privateCalendar.associatePerson(id);ui.calendarPersonId=id;await ui.renderCalendar();ui.c.toast('Agenda privé associé à votre fiche planning.');}catch(e){status.textContent=e.message;b.disabled=false;}};
 }

 document.getElementById('connectPrivateCalendar').onclick=async()=>{const b=document.getElementById('connectPrivateCalendar'),status=document.getElementById('privateCalendarStatus');b.disabled=true;status.textContent='Connexion au calendrier privé…';try{if(!ui.c.connectPrivateCalendar)throw Error('Mettez à jour tous les fichiers de l’application.');ui.privateCalendar=await ui.c.connectPrivateCalendar(true);await ui.renderCalendar();}catch(e){status.textContent='Calendrier privé non chargé : '+e.message;b.disabled=false;}};
 document.getElementById('newPrivateEvent').onclick=()=>editPrivateEvent(ui);
 const siteButton=document.createElement('button');siteButton.id='newPrivateSiteEvent';siteButton.type='button';siteButton.textContent='+ Rendez-vous de chantier';siteButton.disabled=!ui.privateCalendar?.ready;siteButton.onclick=()=>editPrivateEvent(ui,null,{category:'Rendez-vous de chantier'});bar.querySelector('#newPrivateEvent').after(siteButton);
}
export function editPrivateEvent(ui,id,options={}){
 if(!ui.c.isAdmin()||!ui.privateCalendar?.ready)return;
 const occurrence=id?privateEvents(ui).find(r=>r.id===id):null;const x=id?ui.privateCalendar.rows.find(r=>r.id===(occurrence?.seriesId||id)&&r.ownerId===ui.user.id):null;if(id&&!x)return;
 const category=x?.category||options.category||'Commercial';
 const projects=suggestedRows(ui.c.getCatalog?.()?.projects||[],activeProject,x?.projectId?[x.projectId]:[]);if(x?.projectId&&!projects.some(p=>p.id===x.projectId))projects.push({id:x.projectId,name:x.projectName||'Chantier enregistré'});
 const local=d=>ui.localDT(d),today=new Date();today.setMinutes(0,0,0);const defaultUntil=new Date(x?.start||today);defaultUntil.setFullYear(defaultUntil.getFullYear()+1);
 ui.c.modal(x?'Modifier mon rendez-vous privé':'Mon rendez-vous privé',`<form id="privateEventForm"><p>Ce rendez-vous ne sera pas partagé avec l’équipe.</p><label>Objet<input id="peTitle" required value="${esc(x?.title)}"></label><label>Catégorie<select id="peCategory">${['Commercial','Administratif','Personnel','Rendez-vous de chantier','Journée libre','Autre'].map(v=>`<option ${category===v?'selected':''}>${v}</option>`).join('')}</select></label><label id="peProjectField">Chantier<select id="peProject"><option value="">— Choisir un chantier —</option>${projects.map(p=>`<option value="${esc(p.id)}" ${x?.projectId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label class="inline"><input type="checkbox" id="peAllDay" ${x?.allDay?'checked':''}> Journée entière</label><label>Début<input id="peStart" type="datetime-local" required value="${esc(local(x?.start||today.toISOString()))}"></label><label>Fin<input id="peEnd" type="datetime-local" required value="${esc(local(x?.end||new Date(+today+3600000).toISOString()))}"></label><fieldset><legend>Répétition</legend><label class="inline"><input type="checkbox" id="peWeekly" ${x?.recurrence?'checked':''}> Toutes les semaines</label><div id="peRepeatFields" ${x?.recurrence?'':'hidden'}><p>Jours de la semaine</p>${[[1,'Lun.'],[2,'Mar.'],[3,'Mer.'],[4,'Jeu.'],[5,'Ven.'],[6,'Sam.'],[0,'Dim.']].map(([d,label])=>`<label class="inline"><input type="checkbox" name="peDay" value="${d}" ${(x?.recurrence?.days||[new Date(x?.start||today).getDay()]).includes(d)?'checked':''}> ${label}</label>`).join('')}<label>Répéter jusqu’au (inclus)<input type="date" id="peUntil" value="${esc(x?.recurrence?.until||local(defaultUntil.toISOString()).slice(0,10))}"></label></div></fieldset>${x?.recurrence?'<p><strong>Vous modifiez toute la série de rendez-vous.</strong></p>':''}<label>Lieu<input id="peAddress" value="${esc(x?.address)}"></label><label>Notes<textarea id="peNotes">${esc(x?.notes)}</textarea></label><p id="peStatus" role="status"></p><div class="actionRow"><button type="submit">Enregistrer</button>${x?`<button type="button" class="danger" id="peDelete">${x.recurrence?'Supprimer toute la série':'Supprimer ce rendez-vous'}</button>`:''}</div></form>`);
 const projectSelect=document.getElementById('peProject'),categorySelect=document.getElementById('peCategory');
 const updateCategory=()=>{const site=categorySelect.value==='Rendez-vous de chantier';document.getElementById('peProjectField').hidden=!site;projectSelect.required=site;};categorySelect.onchange=updateCategory;updateCategory();
 projectSelect.onchange=()=>{const p=projects.find(p=>p.id===projectSelect.value);if(p){document.getElementById('peTitle').value='Rendez-vous de chantier — '+p.name;}};
 document.getElementById('peWeekly').onchange=()=>{document.getElementById('peRepeatFields').hidden=!document.getElementById('peWeekly').checked;};
 const toggle=()=>{const all=document.getElementById('peAllDay').checked;for(const id of ['peStart','peEnd']){const f=document.getElementById(id),v=f.value;f.type=all?'date':'datetime-local';f.value=all?v.slice(0,10):v.length===10?v+'T09:00':v;}if(all&&x?.allDay){const d=new Date(x.end);d.setDate(d.getDate()-1);document.getElementById('peEnd').value=local(d.toISOString()).slice(0,10);}};
 document.getElementById('peAllDay').onchange=toggle;if(x?.allDay)toggle();
 const form=document.getElementById('privateEventForm');
 const act=async fn=>{const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn();document.getElementById('modal').close();await ui.renderCalendar();}catch(e){document.getElementById('peStatus').textContent=e.status===412?'Ce rendez-vous a changé sur un autre appareil. Fermez puis actualisez le calendrier avant de recommencer.':e.message;buttons.forEach(b=>b.disabled=false);}};
 form.onsubmit=async e=>{e.preventDefault();await act(async()=>{const allDay=document.getElementById('peAllDay').checked,a=document.getElementById('peStart').value,b=document.getElementById('peEnd').value;const start=new Date(a+(allDay?'T00:00:00':'')),end=new Date(b+(allDay?'T00:00:00':''));if(allDay)end.setDate(end.getDate()+1);if(categorySelect.value==='Rendez-vous de chantier'&&!projectSelect.value)throw Error('Choisissez le chantier du rendez-vous.');await ui.privateCalendar.save({id:x?.id,title:document.getElementById('peTitle').value,category:document.getElementById('peCategory').value,projectId:projectSelect.value,projectName:projects.find(p=>p.id===projectSelect.value)?.name||'',start,end,allDay,recurrence:document.getElementById('peWeekly').checked?{days:[...document.querySelectorAll('[name=peDay]:checked')].map(e=>Number(e.value)),until:document.getElementById('peUntil').value}:null,address:document.getElementById('peAddress').value,notes:document.getElementById('peNotes').value});});};
 if(x)document.getElementById('peDelete').onclick=()=>{if(confirm(x.recurrence?'Supprimer toute cette série de rendez-vous privés ?':'Supprimer ce rendez-vous privé ?'))return act(()=>ui.privateCalendar.remove(x.id));};
}
