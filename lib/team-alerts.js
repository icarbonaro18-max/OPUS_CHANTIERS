import {loadOrders} from './project-orders.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function alertVersion(row){return JSON.stringify([row.title,row.detail,row.fileId,row.modified,row.date]);}
export function unreadAlerts(rows,seen){return rows.filter(r=>seen[r.id]!==alertVersion(r));}
export function interventionAlerts(rows){
 return rows.filter(x=>x.status!=='annulee').flatMap(x=>[
 ...(x.materialOrders||[]).map(o=>({id:'material:'+x.id+':'+o.id,title:'Bon de matériel · '+(x.number||'')+' · '+(x.title||x.clientName||''),detail:[o.supplier||'Dépôt',o.pickup,o.title,o.notes].filter(Boolean).join(' · '),fileId:o.fileId,name:o.name,modified:o.updatedAt||o.createdAt||'',date:x.plannedStart||''})),
 ...((x.request||x.siteAccess)?[{id:'instructions:'+x.id,title:'Consignes · '+(x.number||'')+' · '+(x.title||''),detail:[x.request,x.siteAccess].filter(Boolean).join('\n'),modified:'',date:x.plannedStart||''}]:[])
 ]);
}
export function mountTeamAlerts(ui){
 const host=document.querySelector('body > header .brand')||document.getElementById('mainNav');if(!host||document.getElementById('teamAlerts'))return;
 const user=ui.user?.id||ui.user?.userPrincipalName||ui.user?.mail;if(!user)return;
 const key='opus-read-alerts:'+user;let seen={};try{seen=JSON.parse(localStorage.getItem(key)||'{}');if(!seen||Array.isArray(seen)||typeof seen!=='object')seen={};}catch{}
 let rows=[],busy=false,last='',error='';const button=document.createElement('button');button.id='teamAlerts';button.type='button';host.append(button);
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(seen));}catch{ui.c.toast('Lecture conservée pour cette session seulement : stockage local indisponible.');}};
 const badge=()=>{const n=unreadAlerts(rows,seen).length;button.innerHTML='Nouveautés '+(n?'<span class="unreadBadge">'+n+'</span>':'');button.classList.toggle('hasUnread',n>0);button.setAttribute('aria-label',n+' nouveautés non lues'+(error?' · Vérification incomplète':''));button.title=error||'Consulter les nouveautés';if(error)button.append(' !');};
 const mark=r=>{seen[r.id]=alertVersion(r);persist();badge();};
 async function refresh(){
 if(busy||document.hidden)return;busy=true;let errors=[];
 try{
 const next=[];const g=ui.c.graph;
 // Strict read: never replace the form data while a technician is entering a report.
 try{const root=await g.named('root','_OPUS_SYSTEM');if(root){const f=await g.named(root.id,'interventions.json');if(f){const data=await g.json(f.id);if(!Array.isArray(data))throw Error('Données illisibles');next.push(...interventionAlerts(data));}}}catch{errors.push('interventions');next.push(...rows.filter(r=>!r.id.startsWith('project:')));}
 for(const p of ui.c.getCatalog().projects.filter(p=>!['04','99'].includes(p.category))){
 try{const orders=await loadOrders(g,p.id);for(const f of [...orders.supplier,...orders.depot])next.push({id:'project:'+p.id+':'+f.id,title:'Bon de commande · '+p.name,detail:f.orderPath||f.name,fileId:f.id,name:f.name,modified:f.lastModifiedDateTime||f.eTag||'',date:''});}
 catch{errors.push(p.name);next.push(...rows.filter(r=>r.id.startsWith('project:'+p.id+':')));}
 }
 rows=next;last=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});error=errors.length?'Vérification incomplète : '+errors.join(', ')+'. Réessayez avec une connexion.':'';
 badge();if(document.getElementById('teamAlertsPanel'))draw();
 }catch{error='Impossible de vérifier les nouveautés. Vérifiez votre connexion.';badge();if(document.getElementById('teamAlertsPanel'))draw();}
 finally{busy=false;}
 }
 function draw(){
 const panel=document.getElementById('teamAlertsPanel');if(!panel)return;
 const pending=unreadAlerts(rows,seen);
 panel.innerHTML='<p>Les bons non lus restent signalés sur cette tablette. Vérifiez la date et le lieu de retrait avant de partir.</p><p role="status">'+esc(error||('Dernière vérification : '+(last||'en cours…')))+'</p><button type="button" id="refreshTeamAlerts" class="secondary">Vérifier maintenant</button>'+pending.map((r,i)=>'<article class="row"><div><h3>'+esc(r.title)+'</h3>'+(r.date?'<p>Intervention prévue le '+esc(new Date(r.date).toLocaleDateString('fr-FR'))+'</p>':'')+'<p style="white-space:pre-wrap">'+esc(r.detail)+'</p></div><button type="button" data-read-alert="'+i+'">'+(r.fileId?'Consulter le bon':'J’ai lu la consigne')+'</button></article>').join('')+(pending.length?'':'<p>Aucune nouveauté non lue après la dernière vérification.</p>');
 panel.querySelector('#refreshTeamAlerts').onclick=refresh;
 panel.querySelectorAll('[data-read-alert]').forEach(b=>b.onclick=async()=>{b.disabled=true;const r=pending[+b.dataset.readAlert];try{if(r.fileId){if(ui.c.openAlertDocument)await ui.c.openAlertDocument({id:r.fileId,name:r.name});else ui.c.download(await ui.c.graph.bytes(r.fileId),r.name);}mark(r);draw();}catch(e){ui.c.toast('Document non ouvert : '+e.message);b.disabled=false;}});
 }
 button.onclick=()=>{ui.c.modal('Nouveautés pour l’équipe','<section id="teamAlertsPanel"></section>');draw();void refresh();};
 badge();void refresh();const timer=setInterval(()=>void refresh(),300000);
 const resume=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return {refresh,markFile:fileId=>{rows.filter(r=>r.fileId===fileId).forEach(mark);}};
}
