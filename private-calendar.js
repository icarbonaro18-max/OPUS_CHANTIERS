const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fileName=id=>'opus-private-appointment-'+id+'.json';
export class PrivateCalendar {
 constructor(graph,ownerId){this.g=graph;this.ownerId=ownerId;this.rows=[];this.ready=false;}
 async load(){
  this.ready=false;
  const root=await this.g.request('/me/drive/special/approot');this.rootId=root.id;
  const items=await this.g.all('/me/drive/items/'+encodeURIComponent(root.id)+'/children');
  const rows=[];
  for(const item of items.filter(x=>/^opus-private-appointment-.*\.json$/.test(x.name))){
   const current=await this.g.request('/me/drive/items/'+encodeURIComponent(item.id));
   const url=current['@microsoft.graph.downloadUrl'];if(!url?.startsWith('https://'))throw Error('Lecture du calendrier privé impossible.');
   const response=await this.g.fetcher(url,{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('Lecture du rendez-vous impossible.');
   const row=await response.json();if(row.ownerId!==this.ownerId||row.kind!=='private'||!row.id)throw Error('Calendrier privé invalide : aucun enregistrement autorisé.');
   rows.push({...row,fileId:item.id,etag:current.eTag});
  }
  this.rows=rows;this.ready=true;return rows;
 }
 async save(input){
  if(!this.ready)throw Error('Activez et rechargez votre calendrier privé.');
  const old=this.rows.find(r=>r.id===input.id);
  if(old&&!old.etag)throw Error('Rechargez le calendrier avant de modifier ce rendez-vous.');
  const start=new Date(input.start),end=new Date(input.end);
  if(!String(input.title||'').trim()||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('Indiquez un objet et une fin postérieure au début.');
  const row={id:old?.id||crypto.randomUUID(),kind:'private',ownerId:this.ownerId,title:input.title.trim(),start:start.toISOString(),end:end.toISOString(),allDay:!!input.allDay,address:String(input.address||''),notes:String(input.notes||''),category:input.category||'Autre',teamIds:[],exactHours:true,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  const path=old?'/me/drive/items/'+encodeURIComponent(old.fileId)+'/content':'/me/drive/items/'+encodeURIComponent(this.rootId)+':/'+fileName(row.id)+':/content';
  const item=await this.g.request(path,{method:'PUT',headers:{'Content-Type':'application/json',...(old?{'If-Match':old.etag}:{})},body:new Blob([JSON.stringify(row)],{type:'application/json'})});
  this.rows=[...this.rows.filter(r=>r.id!==row.id),{...row,fileId:item.id,etag:item.eTag}];return row;
 }
 async remove(id){const row=this.rows.find(r=>r.id===id);if(!this.ready||!row)throw Error('Rechargez le calendrier privé.');await this.g.request('/me/drive/items/'+encodeURIComponent(row.fileId),{method:'DELETE',headers:{'If-Match':row.etag}});this.rows=this.rows.filter(r=>r.id!==id);}
}
// Resolve the connected administrator's personnel row for display only.
// Private records remain owned by the Microsoft account, never by a team ID.
export function privateCalendarPersonId(ui){
 if(!ui.c?.isAdmin?.())return null;
 const people=ui.data?.people||[],user=ui.user||{};
 const emails=[user.mail,user.userPrincipalName].filter(Boolean).map(v=>v.trim().toLowerCase());
 const exact=people.filter(p=>p.email&&emails.includes(p.email.trim().toLowerCase()));
 if(exact.length===1)return exact[0].id;
 if(exact.length>1)return null;
 const name=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)?.sort().join(' ')||'';
 const ownName=name(user.displayName);if(!ownName)return null;
 const matches=people.filter(p=>name(p.name)===ownName);
 return matches.length===1?matches[0].id:null;
}
export function privateEvents(ui){return ui.c?.isAdmin?.()&&ui.privateCalendar?.ready?ui.privateCalendar.rows.filter(r=>r.ownerId===ui.user.id):[];}
export function mountPrivateCalendar(ui,root){
 if(!ui.c.isAdmin())return;
 const bar=document.createElement('div');bar.className='panel';bar.innerHTML='<strong>Mes rendez-vous privés</strong><p>Commercial, administratif, personnel ou journée entière. Visibles uniquement avec votre compte administrateur dans OPUS.</p><button id="connectPrivateCalendar" type="button" class="secondary">'+(ui.privateCalendar?.ready?'Actualiser mes rendez-vous':'Activer mes rendez-vous privés')+'</button> <button type="button" id="newPrivateEvent" '+(ui.privateCalendar?.ready?'':'disabled')+'>+ Rendez-vous libre privé</button><p id="privateCalendarStatus" role="status"></p>';
 root.querySelector('.calendarViewSwitch').before(bar);
 document.getElementById('connectPrivateCalendar').onclick=async()=>{const b=document.getElementById('connectPrivateCalendar'),status=document.getElementById('privateCalendarStatus');b.disabled=true;status.textContent='Connexion au calendrier privé…';try{if(!ui.c.connectPrivateCalendar)throw Error('Mettez à jour tous les fichiers de l’application.');ui.privateCalendar=await ui.c.connectPrivateCalendar(true);await ui.renderCalendar();}catch(e){status.textContent='Calendrier privé non chargé : '+e.message;b.disabled=false;}};
 document.getElementById('newPrivateEvent').onclick=()=>editPrivateEvent(ui);
}
export function editPrivateEvent(ui,id){
 if(!ui.c.isAdmin()||!ui.privateCalendar?.ready)return;
 const x=id?privateEvents(ui).find(r=>r.id===id):null;if(id&&!x)return;
 const local=d=>ui.localDT(d),today=new Date();today.setMinutes(0,0,0);
 ui.c.modal(x?'Modifier mon rendez-vous privé':'Mon rendez-vous privé',`<form id="privateEventForm"><p>Ce rendez-vous ne sera pas partagé avec l’équipe.</p><label>Objet<input id="peTitle" required value="${esc(x?.title)}"></label><label>Catégorie<select id="peCategory">${['Commercial','Administratif','Personnel','Journée libre','Autre'].map(v=>`<option ${x?.category===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="inline"><input type="checkbox" id="peAllDay" ${x?.allDay?'checked':''}> Journée entière</label><label>Début<input id="peStart" type="datetime-local" required value="${esc(local(x?.start||today.toISOString()))}"></label><label>Fin<input id="peEnd" type="datetime-local" required value="${esc(local(x?.end||new Date(+today+3600000).toISOString()))}"></label><label>Lieu<input id="peAddress" value="${esc(x?.address)}"></label><label>Notes<textarea id="peNotes">${esc(x?.notes)}</textarea></label><p id="peStatus" role="status"></p><div class="actionRow"><button type="submit">Enregistrer</button>${x?'<button type="button" class="danger" id="peDelete">Supprimer ce rendez-vous</button>':''}</div></form>`);
 const toggle=()=>{const all=document.getElementById('peAllDay').checked;for(const id of ['peStart','peEnd']){const f=document.getElementById(id),v=f.value;f.type=all?'date':'datetime-local';f.value=all?v.slice(0,10):v.length===10?v+'T09:00':v;}if(all&&x?.allDay){const d=new Date(x.end);d.setDate(d.getDate()-1);document.getElementById('peEnd').value=local(d.toISOString()).slice(0,10);}};
 document.getElementById('peAllDay').onchange=toggle;if(x?.allDay)toggle();
 const form=document.getElementById('privateEventForm');
 const act=async fn=>{const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn();document.getElementById('modal').close();await ui.renderCalendar();}catch(e){document.getElementById('peStatus').textContent=e.status===412?'Ce rendez-vous a changé sur un autre appareil. Fermez puis actualisez le calendrier avant de recommencer.':e.message;buttons.forEach(b=>b.disabled=false);}};
 form.onsubmit=async e=>{e.preventDefault();await act(async()=>{const allDay=document.getElementById('peAllDay').checked,a=document.getElementById('peStart').value,b=document.getElementById('peEnd').value;const start=new Date(a+(allDay?'T00:00:00':'')),end=new Date(b+(allDay?'T00:00:00':''));if(allDay)end.setDate(end.getDate()+1);await ui.privateCalendar.save({id:x?.id,title:document.getElementById('peTitle').value,category:document.getElementById('peCategory').value,start,end,allDay,address:document.getElementById('peAddress').value,notes:document.getElementById('peNotes').value});});};
 if(x)document.getElementById('peDelete').onclick=()=>{if(confirm('Supprimer ce rendez-vous privé ?'))return act(()=>ui.privateCalendar.remove(x.id));};
}
