import {progress,progressPanel,targetStage} from './lib/project-progress.js';
import {loadOrders,renderOrders} from './lib/project-orders.js';
import {Graph,Journal,LocalStore,CATEGORIES,uid,norm,safeName,sha,blobData,CloudError,revisionHeads,parseRevision} from './lib/cloud.js?v=3.4.2';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=x=>structuredClone(x),TODAY=()=>new Date().toLocaleDateString('en-CA'),DEMO=new URLSearchParams(location.search).get('demo')==='1';
let config,modules,msal,user,g,journal,store,opsUI,catalog={projects:[],categories:[],loose:[]},selected=null,meta=null,metaParents=[],tab='overview',category='all',docStack=[],attRecords=[],live=null,viewerBlob=null,pdfDoc=null,pdfPage=1,flushBusy=false,flushRetry=null,metaConflict=false,pollId,appAccount='',queueChain=Promise.resolve(),inflight=null;
const pendingReplies=new Map();let modalCleanup=null;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').hidden=true,7000);}
function err(e){console.error(e?.name,e?.status||'',e?.message||'');toast(e?.message||String(e));}
function modal(title,html){if(modalCleanup){modalCleanup();modalCleanup=null;}$('modalTitle').textContent=title;$('modalBody').innerHTML=html;if(!$('modal').open)$('modal').showModal();}
$('modalClose').onclick=()=>$('modal').close();
function status(text,good=false){$('connection').textContent=text;$('connection').style.color=good?'#137344':'';}
function bind(id,fn){const e=$(id);if(e)e.onclick=()=>Promise.resolve().then(fn).catch(err);}
const dateTime=s=>s?new Date(s).toLocaleString('fr-FR'):'—';
function isAdmin(){const ids=[user?.mail,user?.userPrincipalName].filter(Boolean).map(x=>String(x).toLowerCase());const admins=(config?.adminUsers||[]).map(x=>String(x).toLowerCase());return ids.some(x=>admins.includes(x)||x.startsWith('ignaziocarbonaro@'));}
function routeState(){const raw=location.hash.replace(/^#/,'');const q=new URLSearchParams(raw);return {projectId:q.get('chantier')||'',tab:q.get('tab')||'overview'};}
function setRoute(projectId='',tabName='overview'){const u=new URL(location.href);u.search='';u.hash=projectId?`chantier=${encodeURIComponent(projectId)}&tab=${encodeURIComponent(tabName||'overview')}`:'';history.replaceState(null,'',u.pathname+u.hash);}
async function restoreRoute(){const r=routeState();if(!r.projectId)return;const p=catalog.projects.find(x=>x.id===r.projectId);if(!p){setRoute();return;}await openProject(r.projectId);if(['overview','documents','orders','attestations','tasks'].includes(r.tab)&&r.tab!=='overview')await setTab(r.tab);}
const catLabel=c=>CATEGORIES.find(([n])=>n===c)?.[1]||'À classer';
const metaDefaults=project=>({name:project.name,client:'',adresse:'',devis:(project.name.match(/(?:^|\D)(\d{6})(?!\d)/)||[])[1]||'',chantier:'',contact:'',telephone:'',email:'',responsable:'',notes:'',tasks:[],observations:[],contactVerified:false});
const fields=[['name','Nom du chantier'],['client','Client / raison sociale'],['devis','Numéro du devis'],['adresse','Adresse du chantier'],['chantier','Nature des travaux'],['contact','Contact sur place'],['telephone','Téléphone'],['email','Adresse e-mail'],['responsable','Responsable OPUS'],['controleur','Organisme de contrôle'],['rapportRef','Référence du rapport'],['notes','Consignes générales']];
function formFields(data,list=fields){return list.map(([k,l])=>`<div class="${k==='notes'?'wide':''}"><label for="f-${k}">${esc(l)}</label>${k==='notes'?`<textarea id="f-${k}">${esc(data[k]||'')}</textarea>`:`<input id="f-${k}" value="${esc(data[k]||'')}" ${k==='email'?'type="email" inputmode="email"':''}>`}</div>`).join('');}
function readFields(data,list=fields){const result=clone(data);for(const[k]of list)result[k]=$('f-'+k).value.trim();return result;}
async function authInit(){
 if(!config.clientId)return;
 const M=await import('./vendor/msal.js').catch(()=>{throw new Error('Le module Microsoft doit être installé par le déploiement GitHub Actions. Voir le guide inclus dans le ZIP.');});
 msal=new M.PublicClientApplication({auth:{clientId:config.clientId,authority:`https://login.microsoftonline.com/${config.tenant}`,redirectUri:new URL('./auth.html',location.href).href,postLogoutRedirectUri:new URL('./',location.href).href},cache:{cacheLocation:'sessionStorage'}});
 await msal.initialize();const response=await msal.handleRedirectPromise();
 if(response?.account)msal.setActiveAccount(response.account);
 const account=msal.getActiveAccount()||msal.getAllAccounts()[0];
 if(account){msal.setActiveAccount(account);await connectCloud(account);}
}
async function token(){try{return (await msal.acquireTokenSilent({scopes:config.scopes,account:msal.getActiveAccount()})).accessToken;}
 catch(e){status('Reconnexion nécessaire');$('login').textContent='Renouveler la connexion';throw new Error('Connexion Microsoft expirée ou autorisation manquante. Utilisez votre nom en haut, puis « Reconnecter ». Les saisies locales sont conservées.');}}
async function login(){if(!config.clientId){setup();return;}if(!msal)await authInit();if(!msal)throw Error('Connexion non initialisée.');await msal.loginRedirect({scopes:config.scopes,prompt:'select_account'});}
async function connectCloud(account){
 appAccount=account.homeAccountId;store=new LocalStore(config.clientId+':'+appAccount);
 status('Connexion à la bibliothèque…');g=new Graph(token);await g.connect(config);user=await g.request('/me?$select=id,displayName,mail,userPrincipalName');journal=new Journal(g);await activate();
}
async function activate(){
 $('start').hidden=true;$('shell').hidden=false;$('userBtn').hidden=false;$('refresh').hidden=false;$('userBtn').textContent=user.displayName;$('settings').hidden=!isAdmin();$('newProject').hidden=!isAdmin();
 try{
  const {OpsUI}=await import('./lib/ops-ui.js?v=3.4.2');
  opsUI=new OpsUI({graph:g,getUser:()=>user,getConfig:()=>config,isAdmin,modal,toast,download,getCatalog:()=>catalog,showDashboard,openProject,refreshProjects:refresh,createProjectFromVisit,syncProjectStages});
  await opsUI.init();
 }catch(e){
  console.error('Module planning/interventions indisponible',e);
  opsUI=null;
  const nav=$('mainNav');if(nav)nav.hidden=true;
  toast('Connexion Microsoft active. Le module planning/interventions n’a pas pu se charger : rechargez l’application après la mise à jour.');
 }
 await updatePending();await refresh();await restoreRoute();if(opsUI)await opsUI.restoreSection();clearInterval(pollId);
 pollId=setInterval(async()=>{if(!navigator.onLine || document.hidden)return;try{await flush();if(live || $('modal').open || !$('viewer').hidden)return;if(!selected)await refresh();else if(tab==='documents')await documents(false);else if(tab==='attestations')await attestations();}catch(e){status('Hors ligne / à vérifier');}},Math.max(30,config.pollSeconds||45)*1000);
 await flush();
}
async function refresh(){status('Actualisation…');
 try{catalog=await g.projects();await store.set('catalog',catalog);status(DEMO?'Démonstration locale':'Microsoft 365 connecté',true);$('lastRefresh').textContent=`Dernière actualisation : ${new Date().toLocaleTimeString('fr-FR')} · ${user.displayName}`;}
 catch(e){const cache=await store.get('catalog');if(cache){catalog=cache;status('Hors ligne — liste mémorisée');$('lastRefresh').textContent='Dernière liste conservée sur cet appareil. Les documents non ouverts nécessitent le réseau.';}else throw e;}
 if(opsUI&&navigator.onLine){await opsUI.reload();await syncProjectStages();}renderProjects();if(selected){const p=catalog.projects.find(p=>p.id===selected.id);if(p)selected=p;}
}
function renderProjects(){
 $('metrics').innerHTML=CATEGORIES.map(([c,l])=>`<div class="metric"><strong>${catalog.projects.filter(p=>p.category===c).length}</strong><small>${l}</small></div>`).join('');
 $('sideCategories').innerHTML=CATEGORIES.map(([c,l])=>`<button class="nav ${category===c?'active':''}" data-category="${c}"><span>${l}</span><b class="countBadge">${catalog.projects.filter(p=>p.category===c).length}</b></button>`).join('');
 const mf=$('mobileProjectFilters');if(mf){mf.innerHTML=`<button class="${category==='all'?'active':''}" data-mobile-category="all">Tous <b class="countBadge">${catalog.projects.length}</b></button>`+CATEGORIES.map(([c,l])=>`<button class="${category===c?'active':''}" data-mobile-category="${c}">${l} <b class="countBadge">${catalog.projects.filter(p=>p.category===c).length}</b></button>`).join('');mf.querySelectorAll('[data-mobile-category]').forEach(b=>b.onclick=()=>{category=b.dataset.mobileCategory;selected=null;showDashboard();});}
 document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;selected=null;showDashboard();});
 const q=norm($('search').value);let ps=catalog.projects.filter(p=>(category==='all'||p.category===category)&&norm(p.name).includes(q));if(opsUI)ps=opsUI.sortProjects(ps);
 $('projectCount').textContent=ps.length+' chantier(s)';
 $('projectList').innerHTML=ps.length?ps.map(p=>`<article class="projectCard ${opsUI&&progress(opsUI.data,p.id).urgent&&!['04','99'].includes(p.category)?'projectUrgent':''} ${opsUI?.projectIsToday(p.id)&&!['04','99'].includes(p.category)?'projectToday':''}"><div><h3>${esc(p.name)}</h3><p>Dossier partagé · ${esc(catLabel(p.category))}</p><div class="chips"><span class="chip ${p.category==='02'?'good':''}">${esc(catLabel(p.category))}</span>${opsUI?opsUI.projectEventChip(p.id):''}${opsUI&&progress(opsUI.data,p.id).urgent&&!['04','99'].includes(p.category)?'<span class="chip warn">À finaliser / échéance à vérifier</span>':''}<span class="chip">Tous les formulaires disponibles</span></div></div><button data-open-project="${esc(p.id)}">Ouvrir →</button></article>`).join(''):'<div class="panel empty">Aucun chantier dans cette rubrique.<br>Créez un dossier chantier ici ou dans la rubrique correspondante sur votre ordinateur.</div>';
 document.querySelectorAll('[data-open-project]').forEach(b=>b.onclick=()=>openProject(b.dataset.openProject).catch(err));
 const loose=catalog.loose.filter(p=>category==='all'||p.category===category);
 $('looseFiles').innerHTML=loose.length?`<div class="panel" style="margin-top:24px"><h2>Documents à classer dans un chantier</h2><p class="muted">Ces fichiers ont été déposés directement dans une rubrique, sans dossier chantier.</p>${loose.map(f=>`<div class="row"><div>${esc(f.name)}<p>${esc(catLabel(f.category))}</p></div><button class="secondary" data-loose="${esc(f.id)}">Consulter</button></div>`).join('')}</div>`:'';
 document.querySelectorAll('[data-loose]').forEach(b=>b.onclick=()=>openDocument(loose.find(f=>f.id===b.dataset.loose)).catch(err));
}
function showDashboard(){if(opsUI){opsUI.section='projects';opsUI.setActiveNav();localStorage.setItem('opus-main-section','projects');}$('projectAside').hidden=false;$('dashboard').hidden=false;$('projectPage').hidden=true;for(const id of ['interventionsPage','visitsPage','calendarPage','officePage'])$(id).hidden=true;$('allProjects').classList.toggle('active',category==='all');setRoute();renderProjects();}
$('allProjects').onclick=()=>{category='all';selected=null;showDashboard();};$('backProjects').onclick=()=>{selected=null;showDashboard();};$('search').oninput=renderProjects;bind('refresh',async()=>{await flush();await refresh();if(selected)await setTab(tab);});
async function openProject(id){
 const p=catalog.projects.find(x=>x.id===id);if(!p)return;if(opsUI){opsUI.section='projects';opsUI.setActiveNav();localStorage.setItem('opus-main-section','projects');$('projectAside').hidden=false;}status('Ouverture du chantier…');
 selected=p;docStack=[{id:p.id,name:'Documents du chantier'}];
 let remoteLoaded=true,r;try{r=await journal.load(p.id,'fiche',null);await store.set('meta:'+p.id,r);}catch(e){remoteLoaded=false;r=await store.get('meta:'+p.id);if(!r)throw e;status('Fiche locale — hors ligne');}
 meta=r.data||metaDefaults(p);metaParents=r.heads.map(h=>h.revision);metaConflict=r.heads.length>1;
 const draft=await store.get(draftKey(p.id,'fiche',null));if(draft){meta=draft.payload;metaParents=draft.parents;}
 $('projectTitle').textContent=meta.name||p.name;$('projectAddress').textContent=meta.adresse||'Adresse à compléter une seule fois dans la fiche';$('projectCategory').textContent=catLabel(p.category).toUpperCase();
 $('projectChips').innerHTML=[meta.client,meta.devis?'Devis '+meta.devis:'',user.displayName].filter(Boolean).map(s=>`<span class="chip">${esc(s)}</span>`).join('');
 $('projectWarning').innerHTML=r.heads.length>1?'<div class="warning">Plusieurs versions de la fiche existent. Vérifiez-les avant de poursuivre.</div>':!r.data?'<div class="hint">Complétez client, adresse et devis une seule fois. Ces informations seront reprises dans chaque nouvelle attestation.</div>':'';
 if(r.heads.length>1)await chooseRevision(p.id,'fiche',null,r,async(data,parents)=>{meta=data;metaParents=parents;metaConflict=false;await queueSave(p.id,'fiche',null,data,parents);await openProject(p.id);});
 $('dashboard').hidden=true;$('projectPage').hidden=false;await setTab('overview');refreshOrderCounts(p.id);if(remoteLoaded)status(DEMO?'Démonstration locale':'Microsoft 365 connecté',true);
}
async function setTab(name){tab=name;if(selected)setRoute(selected.id,name);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===name));$('tabContent').innerHTML='<div class="panel muted">Chargement…</div>';if(name==='overview')overview();if(name==='documents')await documents();if(name==='orders')await orders();if(name==='attestations')await attestations();if(name==='tasks')tasks();if(opsUI){let b=$('projectFieldReport');if(!b){b=document.createElement('button');b.id='projectFieldReport';b.textContent='📋 Comptes rendus d’intervention / équipements';b.style.marginBottom='16px';$('tabContent').before(b);}b.hidden=!['overview','tasks','attestations'].includes(name);b.onclick=()=>opsUI.openProjectReports(selected,meta);}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab).catch(err));
function overview(){
 $('tabContent').innerHTML=`<div class="grid2"><section class="panel"><div class="panelHead"><h2>La fiche chantier</h2><button id="editMetaInline" class="secondary">Modifier</button></div>${fields.filter(([k])=>!['name','notes'].includes(k)).map(([k,l])=>`<div class="detailField"><strong>${l}</strong><span>${esc(meta[k]||'Non renseigné')}</span></div>`).join('')}</section><div><section class="panel"><h2>Consignes pour l’équipe</h2><p style="white-space:pre-wrap">${esc(meta.notes||'Aucune consigne particulière renseignée.')}</p><button id="overviewDocs">Documents →</button></section><section class="panel"><h2>Attestations du chantier</h2><p class="muted">Tous les contrôles sont disponibles. Le technicien choisit uniquement ceux nécessaires aux travaux réalisés.</p><button id="overviewAtt">Ouvrir les attestations →</button></section><section class="panel"><h2>Classement</h2><p>Le classement suit les commandes, le planning et la validation de fin de chantier.</p>${isAdmin()&&selected.category==='04'?'<button id="archiveProject">Archiver le dossier clôturé</button>':''}</section></div></div>`;
 bind('editMetaInline',editMeta);bind('overviewDocs',()=>setTab('documents'));bind('overviewAtt',()=>setTab('attestations'));bind('archiveProject',async()=>{if(!isAdmin()||selected.category!=='04')throw Error('Seul l’administrateur peut archiver un chantier terminé.');if(!confirm('Archiver ce dossier clôturé ?'))return;await moveProgressStage(selected,'99');await refresh();await openProject(selected.id);});
 const panel=document.createElement('section');panel.className='panel';$('tabContent').prepend(panel);if(opsUI)progressPanel(opsUI,selected,panel,async()=>{await syncProjectStages();await openProject(selected.id);});
}
bind('editProject',editMeta);
async function editMeta(){const p=selected.id;if(metaConflict){const r=await journal.load(p,'fiche',null);await chooseRevision(p,'fiche',null,r,async(data,parents)=>{meta=data;metaParents=parents;metaConflict=false;editMeta();});return;}modal('Informations communes du chantier',`<p class="muted">Elles préremplissent les nouvelles attestations. Les attestations déjà enregistrées ne sont pas modifiées silencieusement.</p><form id="metaForm"><div class="formGrid">${formFields(meta)}</div><div class="actionRow"><button type="submit">Enregistrer la fiche</button><button type="button" class="secondary" id="historyMeta">Historique</button></div></form>`);
 $('metaForm').onsubmit=async e=>{e.preventDefault();try{meta=readFields(meta);meta.contactVerified=true;await queueSave(p,'fiche',null,meta,metaParents);$('modal').close();$('projectTitle').textContent=meta.name||selected.name;$('projectAddress').textContent=meta.adresse||'Adresse à compléter';$('projectChips').innerHTML=[meta.client,meta.devis?'Devis '+meta.devis:'',user.displayName].filter(Boolean).map(x=>`<span class="chip">${esc(x)}</span>`).join('');if(tab==='overview')overview();toast('Fiche conservée. Envoi au stockage commun en cours.');}catch(e){err(e);}};
 bind('historyMeta',async()=>{const r=await journal.load(p,'fiche',null);await chooseRevision(p,'fiche',null,r,async(data,parents)=>{meta=data;metaParents=parents;editMeta();},true);});
}
bind('newProject',()=>{
 if(!catalog.categories.length){modal('Rubriques absentes','<p>Créez dans la bibliothèque les rubriques « 01 - A PREPARER », « 02 - EN COURS », « 03 - A CONTROLER », « 04 - TERMINES » et « 99 - ARCHIVES », ou utilisez le bouton ci-dessous.</p><button id="initCategories">Créer les cinq rubriques</button>');bind('initCategories',async()=>{for(const[c,l]of CATEGORIES)await g.folder('root',`${c} - ${l.toUpperCase()}`);$('modal').close();await refresh();});return;}
 modal('Créer un chantier',`<form id="newForm"><div class="formGrid">${formFields({name:'',responsable:user.displayName})}<div class="wide"><label>Rubrique</label><select id="newCat">${catalog.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div></div><div class="actionRow"><button type="submit">Créer le chantier partagé</button></div></form>`);
 $('newForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const m=readFields({tasks:[],observations:[],contactVerified:true});if(!m.name)throw Error('Saisissez le nom du chantier.');const folderName=safeName((m.devis?m.devis+' - ':'')+m.name);if(await g.named($('newCat').value,folderName))throw Error('Ce chantier existe déjà dans cette rubrique. Ouvrez son dossier, sans en créer une copie.');const folder=await g.folder($('newCat').value,folderName);await queueSave(folder.id,'fiche',null,m,[]);await flush();await refresh();$('modal').close();await openProject(folder.id);}catch(e){err(e);}finally{b.disabled=false;}};
});
async function createProjectFromVisit(v){
 if(!catalog.categories.length)throw Error('Les rubriques chantier sont absentes.');
 const devis=prompt('Numéro du devis / affaire :','');if(!devis)throw Error('Numéro de devis requis pour créer le chantier.');
 const label=prompt('Nom de l’affaire :',v.clientName||'');if(!label)throw Error('Nom de l’affaire requis.');
 const cat=catalog.categories.find(c=>c.name.trim().startsWith('01'));if(!cat)throw Error('Rubrique « 01 - A PREPARER » introuvable.');
 const folderName=safeName(`${devis} - ${label}`);if(await g.named(cat.id,folderName))throw Error('Ce chantier existe déjà.');
 const folder=await g.folder(cat.id,folderName);
 const client=opsUI?.clientById(v.clientId),site=opsUI?.siteById(client,v.siteId);
 const m={...metaDefaults({name:folderName}),name:folderName,client:v.clientName||client?.name||'',devis,adresse:v.siteAddress||site?.address||'',contact:site?.contact||'',telephone:site?.phone||'',email:site?.email||'',responsable:user.displayName,chantier:v.request||v.type||'Travaux',notes:`Créé depuis ${v.number||'une visite'} · ${v.request||''}`,tasks:[],observations:[],contactVerified:true};
 await queueSave(folder.id,'fiche',null,m,[]);await flush();await refresh();return folder;
}
// Immutable revision outbox: local acknowledgements are explicit; remote acknowledgement only after Graph success.
function draftKey(p,k,r){return `draft:${p}:${k}:${r||'fiche'}`;}
async function queueSave(projectId,kind,recordId,payload,parents){
 if(kind==='fiche'&&metaConflict&&selected?.id===projectId)throw Error('Vérifiez les versions concurrentes de la fiche avant de la modifier.');const key=draftKey(projectId,kind,recordId);const snapshot=clone(payload);
 await (queueChain=queueChain.catch(()=>{}).then(async()=>{
  const old=await store.get(key);const d={projectId,kind,recordId,payload:snapshot,parents:old?.parents||parents||[],revision:uid(),createdAt:new Date().toISOString()};
  await store.set(key,d);
 }));
 await updatePending();if(live && kind==='attestations')$('saveStatus').textContent='Sauvegardé sur la tablette · envoi en attente';flush().catch(err);
}
async function updatePending(){if(!store)return;const all=await store.all('draft:');$('pendingCount').textContent=all.length;}
async function flush(){if(flushBusy||!store||!g||(!navigator.onLine&&!DEMO))return;flushBusy=true;let failed=false;clearTimeout(flushRetry);
 try{
  for(const entry of await store.all('draft:')){
   const d=entry.value;inflight=d;
   if(live?.recordId===d.recordId)$('saveStatus').textContent='Envoi vers Microsoft 365…';
   try{
    const r=await journal.save(d,user);const fresh=await store.get(entry.key);
    if(fresh?.revision===d.revision)await store.remove(entry.key);
    else if(fresh){fresh.parents=[d.revision];await store.set(entry.key,fresh);}
    if(d.kind==='fiche'&&selected?.id===d.projectId)metaParents=[d.revision];
    if(live?.recordId===d.recordId){live.parents=[d.revision];$('saveStatus').textContent=r.heads.length>1?'Plusieurs versions — contrôle nécessaire':(fresh?.revision!==d.revision?'Nouvelle saisie en attente':`Enregistré ${DEMO?'en démo':'sur Microsoft 365'} à ${new Date().toLocaleTimeString('fr-FR')}`);}
    if(r.heads.length>1)toast('Deux personnes ont modifié le même document. Les deux versions sont conservées : utilisez « Versions » pour les comparer.');
   }catch(e){if(live?.recordId===d.recordId)$('saveStatus').textContent='Conservé sur tablette — envoi non confirmé';status('Envois en attente');console.warn('Envoi non confirmé',e.message);failed=true;break;}
  }
 }finally{inflight=null;flushBusy=false;await updatePending();if((await store.all('draft:')).length)flushRetry=setTimeout(()=>flush().catch(err),failed?30000:1200);}
}
window.addEventListener('online',()=>flush().catch(err));window.addEventListener('offline',()=>{status('Hors ligne');if(live)$('saveStatus').textContent='Hors ligne · sauvegarde sur cette tablette';});
bind('pendingBtn',async()=>{const rows=await store.all('draft:');modal('Envois en attente',`<p class="muted">Ces données sont conservées sur cet appareil mais pas encore confirmées dans Microsoft 365.</p>${rows.map(({value:d})=>`<div class="row"><div><h3>${esc(d.payload.ref||d.payload.name||d.recordId||'Fiche chantier')}</h3><p>${dateTime(d.createdAt)}</p></div><span class="chip warn">À envoyer</span></div>`).join('')||'<p>Aucun envoi en attente.</p>'}<div class="actionRow"><button id="retryPending">Réessayer les envois</button><button id="backupPending" class="secondary">Sauvegarde de secours</button></div>`);bind('retryPending',async()=>{await flush();$('modal').close();toast('Tentative terminée. Vérifiez le compteur des envois en attente.');});bind('backupPending',()=>download(new Blob([JSON.stringify({format:'OPUS-PENDING-3',account:appAccount,drafts:rows})],{type:'application/json'}),'OPUS_ENVOIS_EN_ATTENTE.json'));});
async function chooseRevision(p,kind,id,loaded,onChoose,history=false){
 const list=history?loaded.files.map(parseRevision).filter(Boolean).sort((a,b)=>(b.createdDateTime||'').localeCompare(a.createdDateTime||'')):loaded.heads;
 modal(history?'Historique des enregistrements':'Versions concurrentes à vérifier',`<p>Les anciennes versions sont conservées. Ouvrez une version pour la contrôler. ${history?'':'Aucun travail n’a été écrasé.'}</p><div id="revisionList">${list.map(r=>`<div class="row"><div><h3>${dateTime(r.createdDateTime)}</h3><p>${esc(r.createdBy?.user?.displayName||'Membre de l’équipe')} · ${r.revision.slice(0,8)}</p></div><button data-revision="${r.revision}" class="secondary">Examiner</button></div>`).join('')||'<p>Aucune version enregistrée.</p>'}</div><div id="revisionDetail"></div>`);
 document.querySelectorAll('[data-revision]').forEach(b=>b.onclick=async()=>{try{
  const r=await journal.load(p,kind,id,b.dataset.revision);$('revisionDetail').innerHTML=`<h3 style="margin-top:20px">Version du ${dateTime(r.doc.createdAt)}</h3><p>${esc(r.doc.author?.name||'')}</p><pre class="codebox" style="max-height:260px;overflow:auto">${esc(JSON.stringify(r.data,(k,v)=>typeof v==='string'&&v.startsWith('data:image/')?'[photo/signature]':v,2))}</pre><button id="useRevision">Reprendre cette version pour correction</button><p class="muted">Elle devient la base de votre prochaine saisie. Les autres versions restent dans l’historique.</p>`;
  bind('useRevision',async()=>{$('modal').close();await onChoose(r.data,loaded.heads.map(h=>h.revision));});
 }catch(e){err(e);}});
}
function showOrderCounts(projectId,data){if(selected?.id!==projectId)return;const b=document.querySelector('[data-tab="orders"]');if(b)b.innerHTML=`Bons de commande <span class="countBadge">${data.supplier.length+data.depot.length}</span><small> Fournisseurs ${data.supplier.length} · Dépôt ${data.depot.length}</small>`;}
async function refreshOrderCounts(projectId){const b=document.querySelector('[data-tab="orders"]');if(b)b.textContent='Bons de commande · chargement…';try{showOrderCounts(projectId,await loadOrders(g,projectId));}catch{if(selected?.id===projectId&&b)b.textContent='Bons de commande · à actualiser';}}
async function orders(){const p=selected;await renderOrders({g,project:p,root:$('tabContent'),openDocument,isAdmin,toast,isCurrent:()=>selected?.id===p.id&&tab==='orders',onCounts:data=>showOrderCounts(p.id,data)});}
async function documents(reset=true){
 if(reset||!docStack.length)docStack=[{id:selected.id,name:'Documents du chantier'}];const dir=docStack.at(-1);const key='docs:'+dir.id;
 let rows;try{rows=await g.children(dir.id);await store.set(key,rows);}catch(e){rows=await store.get(key);if(!rows)throw e;}
 rows=rows.filter(f=>f.name!=='_OPUS'&&!/desktop\.ini$/i.test(f.name));rows.sort((a,b)=>Number(!!b.folder)-Number(!!a.folder)||a.name.localeCompare(b.name,'fr'));
 $('tabContent').innerHTML=`<section class="panel"><div class="panelHead"><h2>Documents</h2><div class="actionRow"><button id="addFile">+ Joindre des fichiers</button><button id="newDocFolder" class="secondary">Nouveau dossier</button></div></div><p class="muted">Les fichiers déposés ici ou depuis votre ordinateur se retrouvent au même endroit. Le contenu des PDF n’est pas transformé automatiquement en contrôles.</p><div class="docBreadcrumb">${docStack.map((d,i)=>`<button data-crumb="${i}" class="textButton">${esc(d.name)}</button>`).join('<span>›</span>')}</div><div>${rows.map(f=>`<div class="row"><div><h3>${f.folder?'▣':'▤'} ${esc(f.name)}</h3><p>${f.folder?'Dossier':((f.size||0)/1024/1024).toFixed(1)+' Mo'} · ${dateTime(f.lastModifiedDateTime)}</p></div><button class="secondary" data-doc="${esc(f.id)}">${f.folder?'Ouvrir':'Consulter'}</button></div>`).join('')||'<div class="empty">Aucun document dans ce dossier.</div>'}</div></section>`;
 document.querySelectorAll('[data-doc]').forEach(b=>b.onclick=async()=>{try{const f=rows.find(f=>f.id===b.dataset.doc);if(f.folder){docStack.push({id:f.id,name:f.name});await documents(false);}else await openDocument(f);}catch(e){err(e);}});
 document.querySelectorAll('[data-crumb]').forEach(b=>b.onclick=()=>{docStack=docStack.slice(0,+b.dataset.crumb+1);documents(false).catch(err);});
 bind('newDocFolder',async()=>{const name=prompt('Nom du nouveau dossier :','');if(!name)return;await g.folder(dir.id,safeName(name));await documents(false);});
 bind('addFile',()=>uploadModal(dir));
}
function uploadModal(dir){
 modal('Ajouter des documents',`<p>Destination : <strong>${esc(dir.name)}</strong></p><label>Catégorie de destination</label><select id="uploadDest"><option value="">Ce dossier</option><option>01_FEUILLE_CHANTIER</option><option>02_RAPPORT_CONTROLE</option><option>03_COMMANDES</option><option>06_PHOTOS</option></select><label style="margin-top:12px">Choisir un ou plusieurs fichiers</label><input id="uploadFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.dwg,.zip,.opuschantier"><div id="uploadState" role="status"></div><button id="uploadGo" style="margin-top:16px">Envoyer au chantier</button><p class="muted" style="margin-top:12px">Une connexion est nécessaire pour un nouvel envoi. En cas de nom identique, l’ancien fichier est conservé et le nouveau renommé.</p>`);
 bind('uploadGo',async()=>{const files=[...$('uploadFiles').files];if(!files.length)throw Error('Sélectionnez un fichier.');$('uploadGo').disabled=true;try{const dest=$('uploadDest').value;const parent=dest?(await g.folder(selected.id,dest)).id:dir.id;for(const f of files){$('uploadState').textContent=f.name+' — envoi…';await g.upload(parent,safeName(f.name),f,p=>$('uploadState').textContent=f.name+' — '+p+' %');}$('modal').close();toast('Documents ajoutés au stockage partagé.');await documents(false);}finally{if($('uploadGo'))$('uploadGo').disabled=false;}});
}
async function openDocument(item){const cacheKey='file:'+item.id+':'+(item.eTag||'');let b;
 try{b=await g.bytes(item.id);if(b.size<25*1024*1024)await store.set(cacheKey,b);}catch(e){b=await store.get(cacheKey);if(!b)throw e;}
 await showBlob(b,item.name,item.file?.mimeType);
}
async function attestations(){
 let dirs=[];try{const d=await journal.directory(selected.id,'attestations',null);dirs=d?(await g.children(d.id)).filter(x=>x.folder):[];}catch(e){dirs=(await store.get('attdirs:'+selected.id))||[];}
 await store.set('attdirs:'+selected.id,dirs);attRecords=[];
 for(const d of dirs){try{const r=await journal.load(selected.id,'attestations',d.name);if(r.data)attRecords.push({id:d.name,...r.data,heads:r.heads,loaded:r,remote:true});await store.set('att:'+selected.id+':'+d.name,r);}catch(e){const r=await store.get('att:'+selected.id+':'+d.name);if(r?.data)attRecords.push({id:d.name,...r.data,heads:r.heads,loaded:r,remote:true});}}
 for(const{value:d}of await store.all(`draft:${selected.id}:attestations:`)){const idx=attRecords.findIndex(a=>a.id===d.recordId);const v={id:d.recordId,...d.payload,heads:d.parents.map(revision=>({revision})),pending:true,remote:idx>=0};if(idx>=0)attRecords[idx]={...attRecords[idx],...v};else attRecords.push(v);}
 $('tabContent').innerHTML=`<section class="panel"><h2>Attestations de ce chantier</h2><p class="muted">Chaque dossier conserve ses propres formulaires, photos et signatures.</p>${attRecords.map(a=>`<div class="row"><div><h3>${esc(a.ref||a.id)} · ${esc(modules[a.moduleKey]?.title||a.moduleKey)}</h3><p>${esc(a.authorName||'')} · ${dateTime(a.updatedAt)}</p><span class="chip ${a.pending||a.heads.length>1?'warn':''}">${a.heads.length>1?'Versions à vérifier':a.pending?'Envoi en attente':'Enregistrée au chantier'}</span></div><div class="actionRow"><button data-att="${esc(a.id)}">Ouvrir</button>${a.remote?`<button data-history="${esc(a.id)}" class="secondary">Versions</button>`:''}<button data-delete-att="${esc(a.id)}" class="danger">Supprimer</button></div></div>`).join('')||'<p class="muted">Aucune attestation créée pour le moment.</p>'}</section><section class="panel"><h2>Créer une attestation</h2><p class="muted">Tous les formulaires sont disponibles. Ne remplissez que ceux utiles à ce chantier.</p><div class="moduleGrid">${Object.entries(modules).map(([key,m])=>`<article class="moduleCard"><div class="moduleMark" style="background:${m.color}">${esc(m.badge)}</div><h3>${esc(m.title)}</h3><p>${esc(m.subtitle)}</p><button data-new-att="${key}" class="secondary">+ Créer</button></article>`).join('')}</div></section>`;
 document.querySelectorAll('[data-new-att]').forEach(b=>b.onclick=()=>openAttestation(null,b.dataset.newAtt).catch(err));
 document.querySelectorAll('[data-att]').forEach(b=>b.onclick=()=>openAttestation(b.dataset.att).catch(err));
 document.querySelectorAll('[data-history]').forEach(b=>b.onclick=async()=>{try{const r=await journal.load(selected.id,'attestations',b.dataset.history);await chooseRevision(selected.id,'attestations',b.dataset.history,r,async(data,parents)=>openAttestation(b.dataset.history,null,{data,parents}),true);}catch(e){err(e);}});
 document.querySelectorAll('[data-delete-att]').forEach(b=>b.onclick=()=>deleteAttestation(b.dataset.deleteAtt).catch(err));
}
async function deleteAttestation(id){const a=attRecords.find(x=>x.id===id);if(!a)return;const label=a.ref||id;if(!confirm(`Supprimer définitivement l’attestation « ${label} » ?\n\nLe brouillon local, les versions enregistrées et les PDF générés portant cette référence seront supprimés. Les photos partagées avec d’autres attestations sont conservées.`))return;
 const key=draftKey(selected.id,'attestations',id);if(a.remote){if(!navigator.onLine&&!DEMO)throw Error('Reconnectez la tablette pour supprimer une attestation déjà enregistrée au chantier.');const dir=await journal.directory(selected.id,'attestations',id);if(dir)await g.deleteItem(dir.id);const pdfDir=await g.named(selected.id,'05_PDF_GENERES');if(pdfDir){const prefix=safeName(label)+'_';for(const f of await g.children(pdfDir.id)){if(f.file&&(f.name===safeName(label)+'.pdf'||f.name.startsWith(prefix)))await g.deleteItem(f.id);}}}
 await store.remove(key);await store.remove('att:'+selected.id+':'+id);await updatePending();toast('Attestation supprimée.');await attestations();}
function blankHeader(m,ref){const p=meta;return {reference:ref,technicien:user.displayName,client:p.client||'',adresse:p.adresse||'',operation:p.chantier||p.name,site:p.name,chantier:p.name,installation:p.name,ordre:p.devis?'Devis n° '+p.devis:'',contact:p.contact,telephone:p.telephone,email:p.email,sourceAuteur:p.controleur||'',sourceRef:p.rapportRef||''};}
async function openAttestation(id,key,override=null){
 if(!meta.client||!meta.adresse){toast('Complétez client et adresse dans la fiche pour bénéficier du préremplissage.');}
 const projectId=selected.id;let data,parents=[];
 if(id){const pending=await store.get(draftKey(projectId,'attestations',id));let r;
  if(override){data=override.data;parents=override.parents;}
  else if(pending){data=pending.payload;parents=pending.parents;}
  else{try{r=await journal.load(projectId,'attestations',id);await store.set('att:'+projectId+':'+id,r);}catch(e){r=await store.get('att:'+projectId+':'+id);if(!r)throw e;}
   if(r.heads.length>1){await chooseRevision(projectId,'attestations',id,r,async(data,parents)=>openAttestation(id,null,{data,parents}));return;}
   data=r.data;parents=r.heads.map(h=>h.revision);
  }
  key=data.moduleKey;
 }else{
  id=uid();const mod=modules[key];const date=new Date().toISOString().slice(0,10).replaceAll('-','');const ref=`${mod.prefix}-${meta.devis||date}-${id.slice(0,6).toUpperCase()}`;
  data={moduleKey:key,ref,authorName:user.displayName,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:null,context:{...clone(meta),technician:user.displayName,headers:blankHeader(mod,ref)}};
 }
 if(!modules[key])throw Error('Ce formulaire n’existe pas dans cette version.');
 const nonce=uid();live={projectId,recordId:id,moduleKey:key,payload:clone(data),parents,nonce,lastHash:data.state?await sha(JSON.stringify(data.state)):'',ready:false,closing:false};
 $('moduleTitle').textContent=modules[key].title+' · '+data.ref;$('moduleSub').textContent=`${data.context?.client||meta.client||meta.name} · ${data.context?.adresse||meta.adresse||''}`;$('saveStatus').textContent='Ouverture du formulaire…';
 $('modulePanel').hidden=false;document.body.style.overflow='hidden';$('moduleFrame').src=`./modules/${key}/index.html?embed=1&session=${nonce}`;
 $('moduleFrame').onload=()=>sendFrameInit();
}
function sendFrameInit(){if(!live||live.ready)return;$('moduleFrame').contentWindow?.postMessage({type:'opus-init',nonce:live.nonce,moduleKey:live.moduleKey,payload:live.payload},location.origin);}
function requestFrame(type){if(!live?.ready)return Promise.reject(Error('Le formulaire se prépare encore.'));const req=uid();return new Promise((res,rej)=>{const t=setTimeout(()=>{pendingReplies.delete(req);rej(Error('Le formulaire n’a pas répondu. Ne fermez pas la tablette ; réessayez.'));},45000);pendingReplies.set(req,{res,rej,t});$('moduleFrame').contentWindow.postMessage({type,requestId:req,nonce:live.nonce},location.origin);});}
window.addEventListener('message',async e=>{
 if(!live||e.origin!==location.origin||e.source!==$('moduleFrame').contentWindow||e.data?.nonce!==live.nonce)return;
 const msg=e.data;
 if(msg.type==='opus-ready'){sendFrameInit();return;}
 if(msg.type==='opus-initialized'){live.ready=true;$('saveStatus').textContent=live.payload.state?'Attestation chargée':'Nouveau formulaire · à renseigner';return;}
 if(msg.type==='opus-error'){err(Error(msg.message||'Erreur du formulaire'));if(msg.requestId){const p=pendingReplies.get(msg.requestId);if(p){clearTimeout(p.t);p.rej(Error(msg.message));pendingReplies.delete(msg.requestId);}}return;}
 if(msg.type==='opus-state'){
  const current=live;
  try{const h=await sha(JSON.stringify(msg.state));if(live!==current)return;
   if(h!==current.lastHash){current.payload.state=msg.state;current.payload.updatedAt=new Date().toISOString();await queueSave(current.projectId,'attestations',current.recordId,current.payload,current.parents);current.lastHash=h;}
  }catch(e){$('saveStatus').textContent='Échec sauvegarde locale — ne fermez pas';err(e);if(msg.requestId&&pendingReplies.has(msg.requestId)){const p=pendingReplies.get(msg.requestId);clearTimeout(p.t);p.rej(e);pendingReplies.delete(msg.requestId);}return;}
 }
 if(msg.requestId&&pendingReplies.has(msg.requestId)){const p=pendingReplies.get(msg.requestId);clearTimeout(p.t);pendingReplies.delete(msg.requestId);p.res(msg);}
});
bind('closeModule',async()=>{if(!live)return;await requestFrame('opus-capture');await queueChain;await flush();const draft=await store.get(draftKey(live.projectId,'attestations',live.recordId));if(draft)toast('Travail conservé sur cette tablette. L’envoi au bureau n’est pas encore confirmé.');$('modulePanel').hidden=true;$('moduleFrame').src='about:blank';live=null;document.body.style.overflow='';await setTab('attestations');});
bind('previewModule',async()=>{await requestFrame('opus-capture');const response=await requestFrame('opus-pdf');if(!(response.blob instanceof Blob))throw Error('PDF absent.');await showBlob(response.blob,response.fileName||live.payload.ref+'.pdf','application/pdf');});
bind('saveModulePdf',async()=>{await requestFrame('opus-capture');const response=await requestFrame('opus-pdf');await queueChain;await flush();const folder=await g.folder(live.projectId,'05_PDF_GENERES');const name=safeName((live.payload.ref+'_'+new Date().toISOString().slice(0,19).replaceAll(':','-'))+'.pdf');$('saveStatus').textContent='Envoi du PDF…';try{await g.upload(folder.id,name,response.blob);$('saveStatus').textContent='PDF enregistré au chantier';toast('PDF disponible pour le bureau dans le même chantier.');}catch(e){$('saveStatus').textContent='PDF non envoyé · formulaire conservé';throw e;}});
// Project tasks / observations remain simple. No work is declared completed automatically.
function tasks(){const ts=meta.tasks||[],obs=meta.observations||[];
 $('tabContent').innerHTML=`<section class="panel"><div class="panelHead"><h2>Travaux à réaliser</h2><button id="addTask" class="secondary">+ Travail</button></div>${ts.map((t,i)=>`<details class="taskRow"><summary>${esc(t.title||'Travail')}</summary><p>${esc(t.description||t.notes||'')}</p><label>Avancement</label><select data-task-status="${i}">${['À faire','En cours','Terminé','Hors prestation'].map(v=>`<option ${t.status===v?'selected':''}>${v}</option>`).join('')}</select></details>`).join('')||'<p class="muted">La feuille de chantier reste consultable dans Documents. Ajoutez ici les points utiles à l’équipe.</p>'}</section><section class="panel"><div class="panelHead"><h2>Observations et réserves</h2><button id="addObs" class="secondary">+ Observation</button></div><p class="muted">Un ajout de rapport PDF ne crée pas automatiquement une liste d’anomalies. Les relevés validés peuvent être saisis ici, puis documentés avant / après dans le module Réserves.</p>${obs.map((o,i)=>`<details class="taskRow"><summary>N° ${esc(o.n)} · ${esc(o.title||o.location||'Observation')}</summary><p>${esc(o.text||'')}</p><p class="muted">${esc(o.scope||'Périmètre à vérifier')}</p><label>Traitement OPUS</label><select data-obs-status="${i}">${['À traiter','En cours','Traité','Partiellement traité','Hors prestation','À vérifier'].map(v=>`<option ${o.status===v?'selected':''}>${v}</option>`).join('')}</select></details>`).join('')||'<p class="muted">Aucune observation ajoutée.</p>'}<div class="actionRow"><button id="openReserves">Créer un compte rendu de réserves</button><button id="importLegacy" class="secondary">Reprendre un dossier v2</button></div></section>`;
 document.querySelectorAll('[data-task-status]').forEach(e=>e.onchange=()=>{meta.tasks[+e.dataset.taskStatus].status=e.value;queueSave(selected.id,'fiche',null,meta,metaParents).catch(err);});
 document.querySelectorAll('[data-obs-status]').forEach(e=>e.onchange=()=>{meta.observations[+e.dataset.obsStatus].status=e.value;queueSave(selected.id,'fiche',null,meta,metaParents).catch(err);});
 bind('addTask',()=>simpleRecord(false));bind('addObs',()=>simpleRecord(true));bind('openReserves',()=>openAttestation(null,'reserves'));bind('importLegacy',legacyImport);
}
function simpleRecord(observation){modal(observation?'Ajouter une observation':'Ajouter un travail',`<form id="recordForm"><div class="formGrid">${observation?'<div><label>Numéro de l’observation</label><input id="recordN"></div><div><label>Localisation</label><input id="recordLocation"></div><div class="wide"><label>Périmètre de l’observation</label><select id="recordScope"><option>Périmètre à vérifier</option><option>Dans devis</option><option>Hors prestation - à charge client</option></select></div>':''}<div class="wide"><label>Intitulé</label><input id="recordTitle" required></div><div class="wide"><label>Description / texte source</label><textarea id="recordText"></textarea></div></div><button style="margin-top:16px">Ajouter</button></form>`);$('recordForm').onsubmit=async e=>{e.preventDefault();try{if(observation)(meta.observations||=[]).push({n:$('recordN').value,location:$('recordLocation').value,title:$('recordTitle').value,text:$('recordText').value,status:'À traiter',scope:$('recordScope').value});else(meta.tasks||=[]).push({id:uid(),title:$('recordTitle').value,description:$('recordText').value,status:'À faire'});await queueSave(selected.id,'fiche',null,meta,metaParents);$('modal').close();tasks();}catch(e){err(e);}};}
function legacyImport(){modal('Reprendre un dossier existant',`<p>Import ponctuel au bureau : le dossier v1/v2 sera repris dans <strong>${esc(selected.name)}</strong>. Aucun import n’est demandé au technicien au quotidien.</p><input id="legacyFile" type="file" accept=".opuschantier,.json"><button id="legacyGo" style="margin-top:15px">Lire le dossier</button><div id="legacyInfo"></div>`);
 bind('legacyGo',async()=>{const f=$('legacyFile').files[0];if(!f)return;const d=JSON.parse(await f.text());if(!['OPUS-CHANTIER-1','OPUS-CHANTIER-2'].includes(d.format)||!d.project)throw Error('Ce fichier n’est pas un dossier OPUS v1/v2.');$('legacyInfo').innerHTML=`<div class="warning">Dossier détecté : ${esc(d.project.name)} · devis ${esc(d.project.devis)}. Les observations héritées sont reprises telles quelles, sans nouvelle validation du rapport source.</div><button id="legacyConfirm">Confirmer la reprise</button>`;
 bind('legacyConfirm',async()=>{const p=d.project;meta={...meta,...p,notes:p.notes||meta.notes};delete meta.attestations;delete meta.documents;await queueSave(selected.id,'fiche',null,meta,metaParents);
 for(const a of p.attestations||[]){if(!modules[a.moduleKey])continue;const id=uid();await queueSave(selected.id,'attestations',id,{...a,authorName:a.technician||user.displayName,context:clone(meta)},[]);}
 for(const doc of d.documents||[]){if(!doc.blobData)continue;const category=doc.category==='Rapport bureau de contrôle'?'02_RAPPORT_CONTROLE':doc.category==='Bon de commande'?'03_COMMANDES':'01_FEUILLE_CHANTIER';const folder=await g.folder(selected.id,category);const blob=await (await fetch(doc.blobData)).blob();await g.upload(folder.id,safeName(doc.fileName||'document.pdf'),blob);}
 await flush();$('modal').close();await openProject(selected.id);toast('Reprise effectuée. Vérifiez les données et les envois en attente.');});});
}
async function showBlob(blob,name,mime=''){
 viewerBlob={blob,name};$('viewer').hidden=false;$('viewerTitle').textContent=name;$('viewerBody').innerHTML='<p>Préparation de l’aperçu…</p>';pdfDoc=null;
 const isPdf=blob.type.includes('pdf')||mime.includes('pdf')||/\.pdf$/i.test(name);
 if(isPdf){try{const lib=await import('./vendor/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;pdfDoc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,standardFontDataUrl:new URL('./vendor/standard_fonts/',location.href).href,cMapUrl:new URL('./vendor/cmaps/',location.href).href,cMapPacked:true,wasmUrl:new URL('./vendor/wasm/',location.href).href}).promise;pdfPage=1;await renderPdf();}
 catch(e){const u=URL.createObjectURL(blob);$('viewerBody').innerHTML='<div class="hint">Le lecteur intégré est indisponible. Le lecteur du navigateur est proposé ci-dessous ; le bouton Télécharger reste disponible.</div>';const frame=document.createElement('iframe');frame.src=u;frame.title=name;$('viewerBody').append(frame);viewerBlob.url=u;}}
 else if(blob.type.startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(name)){const u=URL.createObjectURL(blob),img=document.createElement('img');img.src=u;img.alt=name;$('viewerBody').replaceChildren(img);viewerBlob.url=u;}
 else $('viewerBody').innerHTML='<div class="panel"><p>Ce format n’a pas de lecteur intégré. Utilisez « Télécharger » pour l’ouvrir avec son logiciel.</p></div>';
 $('prevPage').hidden=$('nextPage').hidden=!pdfDoc;if(!pdfDoc)$('pageCounter').textContent='';
}
async function renderPdf(){const page=await pdfDoc.getPage(pdfPage);const w=Math.min(1300,Math.max(350,$('viewerBody').clientWidth-36));const base=page.getViewport({scale:1});const v=page.getViewport({scale:w/base.width});const c=document.createElement('canvas');c.width=v.width;c.height=v.height;await page.render({canvasContext:c.getContext('2d'),viewport:v}).promise;$('viewerBody').replaceChildren(c);$('pageCounter').textContent=pdfPage+' / '+pdfDoc.numPages;$('prevPage').disabled=pdfPage===1;$('nextPage').disabled=pdfPage===pdfDoc.numPages;}
bind('prevPage',async()=>{if(pdfDoc&&pdfPage>1){pdfPage--;await renderPdf();}});bind('nextPage',async()=>{if(pdfDoc&&pdfPage<pdfDoc.numPages){pdfPage++;await renderPdf();}});
$('closeViewer').onclick=()=>{$('viewer').hidden=true;if(viewerBlob?.url)URL.revokeObjectURL(viewerBlob.url);pdfDoc?.destroy();pdfDoc=null;$('viewerBody').innerHTML='';};$('downloadFile').onclick=()=>{if(viewerBlob)download(viewerBlob.blob,viewerBlob.name);};
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),120000);}
function setup(){modal('Connexion Microsoft 365 · configuration unique',`<div class="hint">Ne changez ni les comptes utilisateurs ni les réglages OneDrive. Cette page configure seulement l’application OPUS CHANTIERS.</div><form id="configForm"><div class="formGrid"><div class="wide"><label>ID d’application (client) Microsoft Entra</label><input id="clientId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${esc(config.clientId)}" required></div><div class="wide"><label>Annuaire (tenant ID ou domaine initial)</label><input id="tenant" value="${esc(config.tenant)}" required></div><div class="wide"><label>Site partagé existant</label><input value="https://${esc(config.siteHost)}${esc(config.sitePath)}" readonly></div><div class="wide"><label>Service IA sécurisé (facultatif)</label><input id="aiEndpoint" value="${esc(config.aiEndpoint||'')}" placeholder="https://…/api/opus-ai"><p class="muted">Ne mettez jamais de clé API ici. Seulement l’adresse du service sécurisé OPUS.</p></div></div><p class="muted">Autorisation : <strong>Sites.Selected</strong> déléguée + accès « write » au seul site OPUS CHANTIERS. Aucune clé secrète, aucun mot de passe à saisir ici.</p><div class="actionRow"><button type="submit">Enregistrer sur cet appareil</button><button type="button" id="exportConfig" class="secondary">Exporter config.json</button></div><p class="muted">Pour tous les appareils, le bureau publiera ce fichier de configuration avec l’application. Les deux identifiants ne sont pas des mots de passe.</p></form><details><summary>Adresse de redirection à déclarer dans Entra</summary><pre class="codebox">${esc(new URL('./auth.html',location.href).href)}</pre><p>Type : application monopage (SPA). Le guide de déploiement et d’autorisation du site se trouve dans le ZIP.</p></details>`);
 const read=()=>{const id=$('clientId').value.trim(),tenant=$('tenant').value.trim();if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))throw Error('Saisissez l’ID client fourni par Microsoft Entra.');if(!/^[a-z0-9.-]+$/i.test(tenant)||tenant==='common'||tenant==='consumers')throw Error('Indiquez l’annuaire professionnel OPUS ELEC.');return {...config,clientId:id,tenant,aiEndpoint:$('aiEndpoint')?.value.trim()||''};};
 $('configForm').onsubmit=e=>{e.preventDefault();try{localStorage.setItem('opus-cloud-config-v3',JSON.stringify(read()));location.href=new URL('./',location.href).href;}catch(e){err(e);}};bind('exportConfig',()=>download(new Blob([JSON.stringify(read(),null,2)],{type:'application/json'}),'config.json'));
}
bind('settings',setup);bind('login',login);
async function logoutCurrent(){setRoute();if(DEMO){location.href='./';return;}await msal.logoutRedirect({account:msal.getActiveAccount(),postLogoutRedirectUri:new URL('./',location.href).href});}
bind('userBtn',async()=>{const waiting=(await store.all('draft:')).length;modal('Votre session OPUS CHANTIERS',`<p><strong>${esc(user.displayName)}</strong><br>${esc(user.mail||user.userPrincipalName||'')}</p><p class="muted">Vous pouvez changer de compte sans perdre les brouillons : ils restent conservés sur cet appareil dans l’espace du compte actuel.</p>${waiting?`<div class="warning"><strong>${waiting} envoi(s) en attente.</strong><br>Ils seront repris automatiquement lors de la prochaine connexion de ${esc(user.displayName)}.</div>`:''}<div class="actionRow"><button id="changeAccount">Changer de compte</button><button id="retryBeforeLogout" class="secondary">Réessayer les envois</button><button id="logout" class="secondary">Se déconnecter</button></div>`);bind('retryBeforeLogout',async()=>{await flush();$('modal').close();toast('Tentative d’envoi terminée.');});bind('changeAccount',async()=>{if(DEMO){$('modal').close();return;}setRoute();await msal.loginRedirect({scopes:config.scopes,prompt:'select_account'});});bind('logout',logoutCurrent);});
async function init(){
 config=await(await fetch('./config.json',{cache:'no-store'})).json();try{const local=JSON.parse(localStorage.getItem('opus-cloud-config-v3')||'null');if(local?.clientId)config={...config,...local};}catch{}
 modules=await(await fetch('./lib/modules.json')).json();
 if(DEMO){$('demoBar').hidden=false;const {DemoGraph}=await import('./lib/demo.js');user={id:'demo',displayName:'Technicien · démonstration',mail:'compte de démonstration'};appAccount='demo';store=new LocalStore('demo-ui');g=await new DemoGraph().init();journal=new Journal(g);await activate();return;}
 if(!config.clientId){$('setupHint').textContent='La connexion à Microsoft 365 doit encore être autorisée une fois par le bureau. Le compte Roberto et la bibliothèque existants restent inchangés.';}
 else try{await authInit();}catch(e){$('setupHint').textContent=e.message;err(e);}
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
init().catch(err);

let progressSyncBusy=false;
async function moveProgressStage(p,code){const cat=catalog.categories.find(c=>c.name.trim().startsWith(code));if(!cat)throw Error('Rubrique '+code+' introuvable.');await g.moveProject(await g.item(p.id),cat);p.category=code;p.categoryFolder=cat;}
async function syncProjectStages(){if(!opsUI||progressSyncBusy)return;progressSyncBusy=true;try{for(const p of catalog.projects){const info=progress(opsUI.data,p.id),stage=targetStage(p,info);if(stage!==p.category)await moveProgressStage(p,stage);}renderProjects();if(selected)$('projectCategory').textContent=catLabel(selected.category).toUpperCase();}finally{progressSyncBusy=false;}}
