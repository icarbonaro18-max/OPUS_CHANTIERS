import {loadOrders} from './project-orders.js';
import {projectReportAlerts} from './project-report-details.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function alertVersion(row){return JSON.stringify([row.title,row.detail,row.fileId,row.modified,row.date]);}
export function unreadAlerts(rows,seen){return rows.filter(r=>seen[r.id]!==alertVersion(r));}
export function interventionAlerts(rows){
 return rows.filter(x=>x.status!=='annulee').flatMap(x=>[
 ...(x.materialOrders||[]).map(o=>({id:'material:'+x.id+':'+o.id,title:'Bon de matériel · '+(x.number||'')+' · '+(x.title||x.clientName||''),detail:[o.supplier||'Dépôt',o.pickup,o.title,o.notes].filter(Boolean).join(' · '),fileId:o.fileId,name:o.name,modified:o.updatedAt||o.createdAt||'',date:x.plannedStart||''})),
 ...((x.request||x.siteAccess)?[{id:'instructions:'+x.id,title:'Consignes · '+(x.number||'')+' · '+(x.title||''),detail:[x.request,x.siteAccess].filter(Boolean).join('\n'),modified:'',date:x.plannedStart||''}]:[])
 ]);
}
const visitNews='<section aria-labelledby="teamVisitNews"><h2 id="teamVisitNews">Du rendez-vous au devis</h2><ul>'+
 '<li><strong>Affecter l’équipe.</strong> Dans « Nouvelle visite », choisissez les personnes avec la date et l’heure. Leur rendez-vous apparaît dans le calendrier.</li>'+
 '<li><strong>Visite effectuée.</strong> Un appui depuis la liste ou le calendrier classe la visite dans « Visites terminées ». Le rapport et les photos sont facultatifs.</li>'+
 '<li><strong>Devis effectué.</strong> Dans « Visites terminées », le bureau saisit le numéro de devis. La visite rejoint « Devis effectués ».</li>'+
 '</ul></section>';
export function mountTeamAlerts(ui){
 const host=document.querySelector('body > header .brand')||document.getElementById('mainNav');if(!host||document.getElementById('teamAlerts'))return;
 const user=ui.user?.id||ui.user?.userPrincipalName||ui.user?.mail;if(!user)return;
 const key='opus-read-alerts:'+user;let seen={};try{seen=JSON.parse(localStorage.getItem(key)||'{}');if(!seen||Array.isArray(seen)||typeof seen!=='object')seen={};}catch{}
 const caseAlerts=data=>ui.c.isAdmin()?[...interventionAlerts(data),...projectReportAlerts(data)]:interventionAlerts(data);
 const activeProjects=()=>ui.c.getCatalog().projects.filter(p=>!['04','99'].includes(p.category));
 const projectListKey=projects=>JSON.stringify(projects.map(p=>[p.id,p.name]));
 let rows=caseAlerts(ui.data?.interventions||[]),busy=false,checkedAt=0,error='',lastCaseAlerts=null;
 let initialCheck,checkedProjects='';
 const button=document.createElement('button');button.id='teamAlerts';button.type='button';host.append(button);
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(seen));}catch{ui.c.toast('Lecture conservée pour cette session seulement : stockage local indisponible.');}};
 const badge=()=>{const n=unreadAlerts(rows,seen).length;button.innerHTML='Nouveautés '+(n?'<span class="unreadBadge">'+n+'</span>':'');button.classList.toggle('hasUnread',n>0);button.setAttribute('aria-label',n+' nouveautés non lues'+(error?' · Vérification incomplète':''));button.title=error||'Consulter les nouveautés';if(error)button.append(' !');};
 const mark=r=>{seen[r.id]=alertVersion(r);persist();badge();};
 async function refresh(){
 window.clearTimeout(initialCheck);
 if(busy||document.hidden||ui.cacheMode||navigator.onLine===false)return;busy=true;let errors=[];
 try{
 const next=[];const g=ui.c.graph;
 // Strict read: never replace the form data while a technician is entering a report.
 try{
  const root=ui.repo?.root||await g.named('root','_OPUS_SYSTEM');
  const file=root&&await g.named(root.id,'interventions.json');
  if(file){
   const admin=ui.c.isAdmin();
   if(!lastCaseAlerts||!file.eTag||lastCaseAlerts.tag!==file.eTag||lastCaseAlerts.id!==file.id||lastCaseAlerts.admin!==admin){
    const cached=ui.repo?.readCache?.get('interventions');
    const reuse=file.eTag&&cached?.tag===file.eTag&&cached.id===file.id;
    const data=reuse?cached.value:await g.json(file.id,file);
    if(!Array.isArray(data))throw Error('Données illisibles');
    lastCaseAlerts={id:file.id,tag:file.eTag,admin,rows:caseAlerts(data)};
   }
   next.push(...lastCaseAlerts.rows);
  }else lastCaseAlerts=null;
 }catch{errors.push('interventions');next.push(...rows.filter(r=>!r.id.startsWith('project:')&&(!r.reportId||ui.c.isAdmin())));}
 const projects=activeProjects();
 for(const p of projects){
 try{const orders=await loadOrders(g,p.id);for(const f of [...orders.supplier,...orders.depot])next.push({id:'project:'+p.id+':'+f.id,title:'Bon de commande · '+p.name,detail:f.orderPath||f.name,fileId:f.id,name:f.name,modified:f.lastModifiedDateTime||f.eTag||'',date:''});}
 catch{errors.push(p.name);next.push(...rows.filter(r=>r.id.startsWith('project:'+p.id+':')));}
 }
 rows=next;checkedAt=Date.now();checkedProjects=projectListKey(projects);error=errors.length?'Vérification incomplète : '+errors.join(', ')+'. Réessayez avec une connexion.':'';
 badge();if(document.getElementById('teamAlertsPanel'))draw();
 }catch{error='Impossible de vérifier les nouveautés. Vérifiez votre connexion.';badge();if(document.getElementById('teamAlertsPanel'))draw();}
 finally{busy=false;}
 }
 function draw(){
 const panel=document.getElementById('teamAlertsPanel');if(!panel)return;
 const pending=unreadAlerts(rows,seen);
 const status=ui.cacheMode||navigator.onLine===false?'Consultation hors ligne.':checkedAt?'Dernière vérification à '+new Date(checkedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'Vérification en cours…';
 panel.innerHTML=visitNews+'<h2>Alertes de l’équipe</h2><p role="status">'+esc(error||status)+'</p><button type="button" id="refreshTeamAlerts" class="secondary">Vérifier maintenant</button>'+pending.map((r,i)=>'<article class="row"><div><h3>'+esc(r.title)+'</h3>'+(r.date?'<p>'+esc(r.dateLabel||'Intervention prévue le')+' '+esc(new Date(r.date).toLocaleDateString('fr-FR'))+'</p>':'')+'<p style="white-space:pre-wrap">'+esc(r.detail)+'</p></div><button type="button" data-read-alert="'+i+'">'+(r.reportId?'Consulter le compte rendu':r.fileId?'Consulter le bon':'J’ai lu la consigne')+'</button></article>').join('')+(pending.length||!checkedAt||error?'':'<p>Aucune alerte d’équipe non lue.</p>');
 panel.querySelector('#refreshTeamAlerts').onclick=refresh;
 panel.querySelectorAll('[data-read-alert]').forEach(b=>b.onclick=async()=>{b.disabled=true;const r=pending[+b.dataset.readAlert];try{if(r.reportId){const root=await ui.c.graph.named('root','_OPUS_SYSTEM'),file=await ui.c.graph.named(root.id,'interventions.json'),data=await ui.c.graph.json(file.id);if(!Array.isArray(data))throw Error('Données illisibles');const report=data.find(x=>x.id===r.reportId&&x.status!=='annulee');if(!report)throw Error('Compte rendu indisponible');ui.data.interventions=data;await ui.openIntervention(report.id);}else if(r.fileId){if(ui.c.openAlertDocument)await ui.c.openAlertDocument({id:r.fileId,name:r.name});else ui.c.download(await ui.c.graph.bytes(r.fileId),r.name);}mark(r);draw();}catch(e){ui.c.toast('Document non ouvert : '+e.message);b.disabled=false;}});
 }
 const interval=300000;
 button.onclick=()=>{ui.c.modal('Nouveautés pour l’équipe','<section id="teamAlertsPanel"></section>');draw();if(error||Date.now()-checkedAt>=interval||checkedProjects!==projectListKey(activeProjects()))void refresh();};
 badge();
 initialCheck=window.setTimeout(()=>void refresh(),1000);
 const timer=window.setInterval(()=>void refresh(),interval);
 const resume=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
 window.addEventListener('pagehide',()=>{window.clearTimeout(initialCheck);window.clearInterval(timer);},{once:true});
 return {refresh,markFile:fileId=>{rows.filter(r=>r.fileId===fileId).forEach(mark);}};
}
