import {openImportReports,setInterventionArchived} from './import-intervention-reports.js';
import {reportOfficeReturn} from './office-reports.js';
import {setReportDeleted} from './report-trash.js';
import {confirmPlanning,mountPlanningNotice} from './planning-confirmation.js';
import {isIndependentIntervention} from './work-records.js';
import {mountOfficeWork} from './office-work.js';
import {simplifyReport} from './simple-report.js';
import {mountReportTeam,captureReportTeam} from './report-team.js';
import {mountPlanningAffairs,readPlanningAffairs,projectEventLabel} from './planning-affairs.js';
import {fitCalendar} from './calendar-fit.js';
import {previewEvent,calendarLabel} from './calendar-preview.js';
import {mountMaterials,readMaterials,materialText,drawMaterialTable} from './material-request.js';
import {mountTeamAlerts} from './team-alerts.js';
import {projectReportFields,captureProjectReport,REPORT_TYPES} from './project-report-details.js';
import {validateInterventionDays,saveInterventionDays} from './intervention-days.js';
import {mountMaterialOrders} from './intervention-material.js';
import {hourWeek} from './hour-calendar.js';
import {personPlan,planningSummary,planningSpan,plannedTotal} from './person-planning.js';
import {savePeriods} from './planning-periods.js';
import {progress} from './project-progress.js';
import {feedback,finishAndExport,recordArrival,suggestPlannedEnd} from './intervention-flow.js';
import {projectPriority,projectReports,equipmentFields,bindEquipment,readEquipment,equipmentPhotos,equipmentText,addEquipmentBatch} from './project-field.js';
import {closureAt,blockedAssignments} from './workforce.js?v=20260914';
import {manageClosures,editResource,absenceBadges,exportPayroll as workforceExport} from './workforce-ui.js?v=20260914';
import {OpsRepository,isoDate,weekStart,addDays,frDate,frDateTime,durationHours,nextInterventionNumber,nextVisitNumber,personUnavailable,eventConflicts,standardDayHours,eventKindLabel,makeId,isWithin,isSchoolDay} from './ops.js?v=3.4.2';
import {OpusAssistant} from './assistant.js?v=3.4.2';
import {bindReportAI,reportSource,savedVisitReportSource} from './report-ai.js?v=3.4.2';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const byStart=(a,b)=>String(a.start||a.plannedStart||'9999').localeCompare(String(b.start||b.plannedStart||'9999'));

export class OpsUI{
  constructor(ctx){this.c=ctx;this.repo=new OpsRepository(ctx.graph);this.assistant=new OpusAssistant(ctx.getConfig(),{toast:ctx.toast,getToken:ctx.graph?.token});this.data={clients:[],people:[],interventions:[],visits:[],events:[]};this.section='projects';this.week=weekStart();this.calendarView=localStorage.getItem('opus-calendar-view')||'week';this.monthCursor=new Date();}
  get user(){return this.c.getUser();}
  get config(){return this.c.getConfig();}
  role(){
    if(this.c.isAdmin())return 'admin';
    const mail=String(this.user?.mail||this.user?.userPrincipalName||'').toLowerCase();
    return (this.config.managerUsers||[]).map(x=>String(x).toLowerCase()).includes(mail)?'manager':'technician';
  }
  canPlan(){return ['admin','manager'].includes(this.role());}
  async init(){
    // Navigation first: a personnel synchronisation problem must never hide the main app tabs.
    this.bindNav();document.getElementById('mainNav').hidden=false;
    document.getElementById('officeNav').hidden=this.role()!=='admin';this.updateRoleUI();
    try{await this.repo.init();await this.reload();}catch(error){this.dataLoadError=error;throw error;}
    if(this.canPlan()){try{const {EnedisUI}=await import('./enedis-ui.js?v=1');this.enedis=new EnedisUI(this.c);this.enedis.init();}catch(e){console.error('Module Enedis',e);this.c.toast('Le module Enedis nécessite de recharger l’application.');}}
    document.getElementById('officeNav').hidden=this.role()!=='admin';const ordersNav=document.getElementById('ordersAdminNav');if(ordersNav){ordersNav.hidden=this.role()!=='admin';ordersNav.onclick=()=>{if(this.role()==='admin')window.open(new URL('./commandes/',location.href).href,'opus-commandes');};}this.updateRoleUI();this.teamAlerts=mountTeamAlerts(this);
    try{
      await this.syncDefaultPeople();
      if(this.role()==='manager'&&!this.data.people.some(p=>String(p.email||'').toLowerCase()===String(this.user?.mail||this.user?.userPrincipalName||'').toLowerCase())){
        this.data.people.push({id:makeId('pers'),name:this.user.displayName,email:this.user.mail||this.user.userPrincipalName,type:'internal',role:'technicien',weeklyTarget:39,vehicle:true,active:true,schoolPeriods:[],absences:[]});
        await this.save('people');
      }
    }catch(e){console.warn('Synchronisation personnel différée',e);this.c.toast('Planning disponible. La synchronisation du personnel sera retentée à la prochaine actualisation.');}
  }
  async reload(){
    try{const loaded=await this.repo.loadAll();this.data=loaded;this.dataLoadError=null;}
    catch(error){this.dataLoadError=error;throw error;}
  }
  showDataLoadError(root,retrySection){
    root.replaceChildren();const panel=document.createElement('section');panel.className='panel';
    const title=document.createElement('h2');title.textContent='Données non chargées';
    const text=document.createElement('p');text.setAttribute('role','alert');text.textContent='La lecture Microsoft a échoué. Une liste vide ne signifie pas que vos fiches ont été supprimées. Les modifications sont bloquées jusqu’au rechargement.';
    const detail=document.createElement('p');detail.textContent=this.dataLoadError?.message||'Chargement indisponible.';
    const retry=document.createElement('button');retry.type='button';retry.textContent='Réessayer le chargement';retry.onclick=async()=>{retry.disabled=true;try{await this.init();await this.show(retrySection);}catch(error){this.dataLoadError=error;this.showDataLoadError(root,retrySection);}};
    panel.append(title,text,detail,retry);root.append(panel);
  }
  async save(kind){if(this.dataLoadError)throw Error('Enregistrement bloqué : rechargez d’abord les données Microsoft.');await this.repo.save(kind,this.data[kind]);if(['events','interventions','projectTracking'].includes(kind)&&this.c.syncProjectStages)try{await this.c.syncProjectStages();}catch(e){this.c.toast('Données enregistrées, classement non synchronisé : '+e.message);}}
  async syncDefaultPeople(){
    const defaults=Array.isArray(this.config.defaultPeople)?this.config.defaultPeople:[];
    if(!defaults.length)return;
    let changed=false;
    for(const d of defaults){
      const email=String(d.email||'').trim().toLowerCase();
      const code=String(d.employeeCode||'').trim();
      let p=this.data.people.find(x=>code&&String(x.employeeCode||'').trim()===code);
      if(!p&&email)p=this.data.people.find(x=>String(x.email||'').trim().toLowerCase()===email);
      if(!p)p=this.data.people.find(x=>norm(x.name)===norm(d.name));
      if(p?.officeManaged)continue;
      if(!p){
        this.data.people.push({id:makeId('pers'),employeeCode:code,name:d.name,email:d.email||'',type:d.type||'internal',role:d.role||'technicien',weeklyTarget:Number(d.weeklyTarget)||0,vehicle:!!d.vehicle,active:d.active!==false,availableFrom:'',availableTo:'',reservedProjectId:'',schoolPeriods:Array.isArray(d.schoolPeriods)?structuredClone(d.schoolPeriods):[],schoolDates:Array.isArray(d.schoolDates)?[...d.schoolDates]:[],absences:[]});
        changed=true;continue;
      }
      const managed={employeeCode:code,name:d.name,email:d.email||p.email||'',type:d.type||'internal',role:d.role||'technicien',weeklyTarget:Number(d.weeklyTarget)||0,vehicle:!!d.vehicle,schoolDates:Array.isArray(d.schoolDates)?d.schoolDates:[]};
      for(const [k,v] of Object.entries(managed))if(p[k]!==v){p[k]=v;changed=true;}
      if(!Array.isArray(p.schoolPeriods)){p.schoolPeriods=[];changed=true;}
      if(Array.isArray(d.schoolPeriods)&&d.schoolPeriods.length&&!p.schoolPeriods.length){p.schoolPeriods=structuredClone(d.schoolPeriods);changed=true;}
      if(!Array.isArray(p.schoolDates)){p.schoolDates=[];changed=true;}
      if(Array.isArray(d.schoolDates)&&JSON.stringify(p.schoolDates)!==JSON.stringify(d.schoolDates)){p.schoolDates=[...d.schoolDates];changed=true;}
      if(!Array.isArray(p.absences)){p.absences=[];changed=true;}
      if(p.active===undefined){p.active=d.active!==false;changed=true;}
    }
    if(changed)await this.save('people');
  }
  bindNav(){document.querySelectorAll('[data-main]').forEach(b=>b.onclick=()=>this.show(b.dataset.main));}
  updateRoleUI(){
    const badge=document.getElementById('roleBadge');if(badge)badge.textContent=this.role()==='admin'?'Administrateur':this.role()==='manager'?'Responsable terrain':'Technicien';
  }
  setActiveNav(){document.querySelectorAll('[data-main]').forEach(b=>b.classList.toggle('active',b.dataset.main===this.section));}
  async show(section){
    if(section==='office'&&this.role()!=='admin')return;
    document.body.classList.toggle('calendarScreen',section==='calendar');
    if(section!=='calendar')this.calendarFitCleanup?.();
    if(section==='calendar'&&this.role()!=='admin'){this.calendarView='day';this.dayCursor=new Date();}
    this.section=section;localStorage.setItem('opus-main-section',section);this.setActiveNav();
    const aside=document.getElementById('projectAside');if(aside)aside.hidden=section!=='projects';
    for(const id of ['dashboard','projectPage','interventionsPage','visitsPage','calendarPage','officePage']){const e=document.getElementById(id);if(e)e.hidden=true;}
    if(section==='projects'){this.c.showDashboard();return;}
    if(this.dataLoadError&&section!=='projects'){const root=document.getElementById(({interventions:'interventionsPage',visits:'visitsPage',calendar:'calendarPage',office:'officePage'})[section]);if(root){root.hidden=false;this.showDataLoadError(root,section);}return;}
    if(section==='interventions'){document.getElementById('interventionsPage').hidden=false;await this.renderInterventions();}
    if(section==='visits'){document.getElementById('visitsPage').hidden=false;await this.renderVisits();}
    if(section==='calendar'){document.getElementById('calendarPage').hidden=false;await this.renderCalendar();}
    if(section==='office'&&this.role()==='admin'){document.getElementById('officePage').hidden=false;await this.renderOffice();}
  }
  restoreSection(){const s=localStorage.getItem('opus-main-section');if(s&&['interventions','visits','calendar','office'].includes(s)&&(s!=='office'||this.role()==='admin'))return this.show(s);}
  projectIsToday(id){return projectPriority(this.data.events,id).today;}
  nextProjectEvent(id){return projectPriority(this.data.events,id).event;}
  sortProjects(rows){return [...rows].sort((a,b)=>{const ua=!['04','99'].includes(a.category)&&progress(this.data,a.id).urgent,ub=!['04','99'].includes(b.category)&&progress(this.data,b.id).urgent;if(ua!==ub)return ua?-1:1;const pa=['04','99'].includes(a.category)?{today:false,event:null}:projectPriority(this.data.events,a.id),pb=['04','99'].includes(b.category)?{today:false,event:null}:projectPriority(this.data.events,b.id);if(pa.today!==pb.today)return pa.today?-1:1;if(pa.event&&pb.event)return pa.event.start.localeCompare(pb.event.start);if(pa.event)return -1;if(pb.event)return 1;return 0;});}
  projectEventChip(id){const p=projectPriority(this.data.events,id);return p.event?`<span class="chip calendarChip">${p.today?'Aujourd’hui · ':''}${esc(frDateTime(p.event.start))}</span>`:'<span class="chip">À planifier</span>';}
  openProjectReports(p,meta,opts){if(this.dataLoadError)throw Error('Rechargez les données Microsoft avant d’ouvrir les rapports.');return projectReports(this,p,meta,opts);}
  clientById(id){return this.data.clients.find(c=>c.id===id);}
  siteById(client,id){return client?.sites?.find(s=>s.id===id);}
  personById(id){return this.data.people.find(p=>p.id===id);}
  teamNames(ids=[]){return ids.map(id=>this.personById(id)?.name).filter(Boolean).join(', ')||'Équipe à affecter';}
  linkLabel(e){if(e.kind==='project')return projectEventLabel(e,this.c.getCatalog().projects);if(e.kind==='intervention')return this.data.interventions.find(x=>x.id===e.linkId)?.number||e.title;return this.data.visits.find(x=>x.id===e.linkId)?.number||e.title;}

  clientChoiceHtml(prefix,currentClientId=''){
    const opts=this.data.clients.map(c=>{
      const addr=(c.sites||[])[0]?.address||c.billingAddress||'';
      return `<option value="${esc(c.id)}" data-search="${esc(norm(c.name+' '+addr))}" ${currentClientId===c.id?'selected':''}>${esc(c.name)}${addr?' — '+esc(addr):''}</option>`;
    }).join('');
    const defaultMode=currentClientId||this.data.clients.length?'existing':'new';
    return `<div><label>Client</label><select id="${prefix}Mode"><option value="existing" ${defaultMode==='existing'?'selected':''}>Client habituel</option><option value="new" ${defaultMode==='new'?'selected':''}>Nouveau client / nouveau site</option></select></div>
      <div id="${prefix}Existing" class="wide"><div class="formGrid">
        <div class="wide"><label>Rechercher un client habituel</label><input id="${prefix}ClientSearch" type="search" placeholder="Nom, société, adresse…" autocomplete="off"></div>
        <div><label>Choisir le client</label><select id="${prefix}Client"><option value="">— Choisir —</option>${opts}</select></div>
        <div><label>${prefix==='i'?'Site connu (facultatif)':'Site / adresse'}</label><select id="${prefix}Site"></select></div>
      </div></div>
      <div id="${prefix}New" class="wide" hidden><div class="formGrid newClientBox">
        <div><label>Type</label><select id="${prefix}Kind"><option>Madame</option><option>Monsieur</option><option>Société</option><option>Syndic</option><option>Institutionnel</option><option>Autre</option></select></div>
        <div><label>Nom / raison sociale</label><input id="${prefix}Name" placeholder="Nom, société ou syndic"></div>
        <div><label>Prénom (si particulier)</label><input id="${prefix}First" placeholder="Prénom"></div>
        <div><label>Téléphone</label><input id="${prefix}Phone" inputmode="tel"></div>
        <div class="wide"><label>${prefix==='i'?'Adresse du client / agence':'Adresse du site'}</label><input id="${prefix}Address" placeholder="N°, rue, code postal, ville"></div>
        <div class="wide"><label>E-mail</label><input id="${prefix}Email" type="email"></div>
      </div></div>`;
  }
  bindClientChoice(prefix,currentClientId='',currentSiteId=''){
    const mode=document.getElementById(prefix+'Mode'),existing=document.getElementById(prefix+'Existing'),fresh=document.getElementById(prefix+'New'),client=document.getElementById(prefix+'Client'),site=document.getElementById(prefix+'Site'),search=document.getElementById(prefix+'ClientSearch');
    const all=[...client.options].slice(1).map(o=>({value:o.value,text:o.textContent,search:o.dataset.search||norm(o.textContent)}));
    const fillSites=()=>{const c=this.clientById(client.value);site.innerHTML='<option value="">— Choisir —</option>'+((c?.sites||[]).map(s=>`<option value="${esc(s.id)}" ${currentSiteId===s.id?'selected':''}>${esc(s.name||s.address||'Site')} — ${esc(s.address||'')}</option>`).join(''));};
    const filterClients=()=>{const q=norm(search?.value||'');const current=client.value;client.innerHTML='<option value="">— Choisir —</option>'+all.filter(o=>!q||o.search.includes(q)||norm(o.text).includes(q)).slice(0,250).map(o=>`<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('');if([...client.options].some(o=>o.value===current))client.value=current;fillSites();};
    const toggle=()=>{const isNew=mode.value==='new';existing.hidden=isNew;fresh.hidden=!isNew;if(!isNew){filterClients();fillSites();}};
    if(search)search.oninput=filterClients;if(currentClientId)client.value=currentClientId;client.onchange=fillSites;mode.onchange=toggle;filterClients();if(currentClientId)client.value=currentClientId;fillSites();toggle();
  }
  async resolveClientChoice(prefix){
    if(document.getElementById(prefix+'Mode').value==='existing'){
      const c=this.clientById(document.getElementById(prefix+'Client').value),s=this.siteById(c,document.getElementById(prefix+'Site').value);
      if(!c)throw new Error('Choisissez un client habituel ou sélectionnez « Nouveau client ».');
      return {client:c,site:s||null};
    }
    const kind=document.getElementById(prefix+'Kind').value,name=document.getElementById(prefix+'Name').value.trim(),first=document.getElementById(prefix+'First').value.trim(),address=document.getElementById(prefix+'Address').value.trim(),phone=document.getElementById(prefix+'Phone').value.trim(),email=document.getElementById(prefix+'Email').value.trim();
    if(!name)throw new Error('Indiquez le nom du nouveau client, de la société ou du syndic.');
    if(!address)throw new Error('Indiquez l’adresse du site.');
    const individual=kind==='Madame'||kind==='Monsieur';
    const display=individual?`${kind==='Madame'?'Mme':'M.'} ${first?first+' ':''}${name}`.trim():name;
    const site=prefix==='i'?{id:makeId('site'),name:display,address:document.getElementById('iSiteAddress').value.trim(),contact:document.getElementById('iSiteContact').value.trim(),phone:document.getElementById('iSitePhone').value.trim(),email:document.getElementById('iSiteEmail').value.trim()}:{id:makeId('site'),name:display,address,contact:individual?`${first} ${name}`.trim():'',phone,email};
    const c={id:makeId('cli'),name:display,category:kind,lastName:individual?name:'',firstName:individual?first:'',phone,email,billingAddress:prefix==='i'?address:'',sites:[site],createdAt:new Date().toISOString()};
    this.data.clients.push(c);await this.save('clients');return {client:c,site};
  }
  async compressPhoto(file){
    if(!file?.type?.startsWith('image/'))throw new Error('Sélectionnez une photo.');
    const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
    const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);
    return {id:makeId('photo'),name:file.name||'photo.jpg',dataUrl:canvas.toDataURL('image/jpeg',.74),createdAt:new Date().toISOString()};
  }
  textAssist(){return 'lang="fr" spellcheck="true" autocapitalize="sentences" autocomplete="off"';}
  renderPhotoGrid(photos=[],previewId='photoPreview'){
    const root=document.getElementById(previewId);if(!root)return;
    root.innerHTML=photos.length?photos.map((p,i)=>`<figure class="reportPhoto"><img src="${p.dataUrl}" alt="Photo ${i+1}"><figcaption>Photo ${i+1}<button type="button" class="quiet" data-remove-photo="${i}">Supprimer</button></figcaption></figure>`).join(''):'<p class="muted">Aucune photo. Sur tablette, utilisez « Prendre une photo ».</p>';
    root.querySelectorAll('[data-remove-photo]').forEach(b=>b.onclick=()=>{photos.splice(Number(b.dataset.removePhoto),1);this.renderPhotoGrid(photos,previewId);});
  }
  bindPhotoInputs(photos=[],opts={}){
    const {captureId='photoCapture',galleryId='photoGallery',previewId='photoPreview',maxPhotos=6}=opts;
    const add=input=>{const files=[...(input.files||[])];if(!files.length)return;input.value='';this.pendingPhotos=(this.pendingPhotos||Promise.resolve()).then(async()=>{for(const f of files){if(photos.length>=maxPhotos){this.c.toast('Limite de photos atteinte pour cette rubrique.');break;}photos.push(await this.compressPhoto(f));}this.renderPhotoGrid(photos,previewId);}).catch(e=>{this.renderPhotoGrid(photos,previewId);this.c.toast('Photo non ajoutée : '+e.message+'. Réessayez cette photo.');});return this.pendingPhotos;};
    const cam=document.getElementById(captureId),gallery=document.getElementById(galleryId);if(cam)cam.onchange=()=>add(cam);if(gallery)gallery.onchange=()=>add(gallery);this.renderPhotoGrid(photos,previewId);
  }
  interventionStatusLabel(status){return ({a_planifier:'À planifier',planifiee:'Planifiée',en_cours:'En cours',terminee:'Terminée',facturee:'Facturée',annulee:'Annulée'})[status]||status||'—';}
  visitStatusLabel(status){return ({a_planifier:'À planifier',planifiee:'Planifiée',terminee:'Terminée',convertie:'Convertie en chantier',annulee:'Annulée'})[status]||status||'—';}
  dimensionLine(task={}){const parts=[];if(task.length)parts.push(`L ${task.length} m`);if(task.width)parts.push(`l ${task.width} m`);if(task.height)parts.push(`H ${task.height} m`);if(task.falseCeiling==='oui')parts.push(task.plenumHeight?`faux plafond · plénum ${task.plenumHeight} m`:'faux plafond');return parts.join(' · ')||'Dimensions non saisies';}
  interventionItemSummary(item={}){const bits=[];if(item.location)bits.push(item.location);if(item.reference)bits.push(item.reference);if(item.needsQuote)bits.push('devis complémentaire');return bits.join(' · ');}
  interventionItemCard(item,index){return `<article class="lineItemCard"><div><div class="chips"><span class="chip">Point ${index+1}</span>${item.needsQuote?'<span class="chip warn">Devis</span>':''}${(item.photos||[]).length?`<span class="chip">${(item.photos||[]).length} photo(s)</span>`:''}</div><h3>${esc(item.title||item.issueType||'Point d’intervention')}</h3><p>${esc(this.interventionItemSummary(item)||item.observation||'Observation à compléter')}</p>${item.action?`<small>${esc(item.action)}</small>`:''}<p>${esc(equipmentText(item))}</p><small>${equipmentPhotos(item).length} photo(s) avant / pendant / après</small></div></article>`;}
  visitTaskCard(item,index){return `<article class="lineItemCard"><div><div class="chips"><span class="chip">Tâche ${index+1}</span>${(item.photos||[]).length?`<span class="chip">${(item.photos||[]).length} photo(s)</span>`:''}</div><h3>${esc(item.room||item.title||'Pièce / zone')}</h3><p>${esc(this.dimensionLine(item))}</p>${item.need?`<small>${esc(item.need)}</small>`:''}</div></article>`;}
  fileSafe(s=''){return String(s||'Sans titre').replace(/["*:<>?/\\|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,90)||'Sans titre';}
  async interventionPdf(x,{visit=false}={}){
    const {jsPDF}=await import('../vendor/jspdf.js');const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
    const {installPdfFonts}=await import('./pdf-fonts.js');await installPdfFonts(pdf);
    const W=210,M=16,contentW=W-M*2;let y=52;
    const navy=[12,64,105],muted=[91,110,124];
    const logoResponse=await fetch(new URL('../assets/logo.png',import.meta.url));
    if(!logoResponse.ok)throw new Error('Logo OPUS ELEC indisponible : réessayez le téléchargement du PDF.');
    const logo=new Uint8Array(await logoResponse.arrayBuffer());
    const logoProps=pdf.getImageProperties(logo);
    const header=()=>{
      pdf.setFillColor(...navy);pdf.rect(0,0,W,3,'F');
      pdf.addImage(logo,'PNG',M,13,53,53*logoProps.height/logoProps.width);
      pdf.setFont('OpusSans','bold');pdf.setFontSize(12);pdf.setTextColor(...navy);
      pdf.text(visit?"VISITE AVANT DEVIS":x.projectId?'COMPTE RENDU CHANTIER':"RAPPORT D’INTERVENTION",W-M,18,{align:'right'});
      pdf.setFontSize(9);pdf.text(String(x.number||'Intervention'),W-M,25,{align:'right'});
      pdf.setFont('OpusSans','normal');pdf.setFontSize(8);pdf.setTextColor(...muted);
      pdf.text(x.projectId&&!visit?'SUIVI TERRAIN / BUREAU':'COMPTE RENDU CLIENT',W-M,31,{align:'right'});
      pdf.setDrawColor(207,220,229);pdf.line(M,39,W-M,39);pdf.setTextColor(35,48,59);
    };
    header();
    const ensure=(h=12)=>{if(y+h>276){pdf.addPage();header();y=49;}};
    const txt=(value,size=10,bold=false,indent=0)=>{const s=String(value||'').trim();if(!s)return;pdf.setFont('OpusSans',bold?'bold':'normal');pdf.setFontSize(size);const lines=pdf.splitTextToSize(s,contentW-indent);for(const row of lines){ensure(size*.48+1);pdf.setFont('OpusSans',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(35,48,59);pdf.text(row,M+indent,y);y+=size*.48;}y+=3;};
    const section=(value)=>{pdf.setFont('OpusSans','bold');pdf.setFontSize(10);const rows=pdf.splitTextToSize(String(value).replace(/:$/,'').trim(),contentW-6),h=Math.max(9,rows.length*5+4);ensure(h+13);pdf.setFont('OpusSans','bold');pdf.setFontSize(10);pdf.setFillColor(235,243,248);pdf.roundedRect(M,y-4,contentW,h,1,1,'F');pdf.setTextColor(...navy);rows.forEach((row,i)=>pdf.text(row,M+3,y+2+i*5));y+=h+4;};
    const line=()=>{ensure(7);pdf.setDrawColor(215,225,232);pdf.line(M,y,W-M,y);y+=7;};
    const addPhoto=(dataUrl,label='Photo')=>{if(!dataUrl)return;try{const prop=pdf.getImageProperties(dataUrl),maxW=contentW,maxH=82,ratio=Math.min(maxW/prop.width,maxH/prop.height),w=prop.width*ratio,h=prop.height*ratio;pdf.setFontSize(8);pdf.setFont('OpusSans','bold');const labels=pdf.splitTextToSize(label,contentW);ensure(h+labels.length*4+10);pdf.setFont('OpusSans','bold');pdf.setFontSize(8);pdf.setTextColor(...muted);labels.forEach(row=>{pdf.text(row,M,y);y+=4;});y+=1;pdf.addImage(dataUrl,prop.fileType||'JPEG',M,y,w,h,undefined,'FAST');y+=h+8;}catch(e){console.warn('Photo PDF ignorée',e);}};
    const savedReadForHeader=id=>({aWork:x.workDone||'',aNotes:x.notes||'',aMaterial:x.materials||'',aQuote:x.needsQuote?'oui':'non'})[id];
    const hasApproved=x.clientReportApproved&&x.clientReport&&x.clientReportSource===JSON.stringify(visit?savedVisitReportSource(x):reportSource(x,savedReadForHeader));
    section(visit?'CLIENT ET VISITE':'CLIENT ET INTERVENTION');
    txt(x.clientName||'Client non renseigné',11,true);
    if(!visit&&x.projectName)txt('Chantier : '+x.projectName,10,true);
    if(!visit&&x.billingAddress)txt('Adresse client : '+x.billingAddress,9);txt('Lieu d’intervention : '+(x.siteAddress||'Adresse non renseignée'),9);if(!visit&&x.siteContact)txt('Contact sur place : '+x.siteContact,9);if(!visit&&x.sitePhone)txt('Téléphone sur place : '+x.sitePhone,9);if(x.devis)txt(`Devis : ${x.devis}`,9,true);
    if(!hasApproved)txt(`Objet : ${x.title||x.request||'Non renseigné'}`,10);
    txt(`Techniciens : ${(x.teamIds||[]).length?this.teamNames(x.teamIds):'Non renseignés'}`,9);
    txt(`${visit?'Date de visite':'Date d’intervention'} : ${x.actualStart?frDateTime(x.actualStart):(x.plannedStart?frDateTime(x.plannedStart)+' (prévue)':'Non renseignée')}`,9);
    if(x.actualStart&&x.actualEnd)txt(`Horaires réalisés : ${new Date(x.actualStart).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} - ${new Date(x.actualEnd).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}${Number(x.pauseHours)>0?` · pause ${x.pauseHours} h`:''}`,9);
    y+=4;
    const savedRead=id=>({aWork:x.workDone||'',aNotes:x.notes||'',aMaterial:x.materials||'',aQuote:x.needsQuote?'oui':'non'})[id];
    const approved=x.clientReportApproved&&x.clientReport&&x.clientReportSource===JSON.stringify(visit?savedVisitReportSource(x):reportSource(x,savedRead));
    if(visit){
      if(approved){section('COMPTE RENDU DE VISITE');txt(x.clientReport);if((x.visitTasks||[]).some(t=>t.photos?.length))section('ANNEXE PHOTOS');(x.visitTasks||[]).forEach((t,i)=>(t.photos||[]).forEach((ph,j)=>addPhoto(ph.dataUrl,`Photo - pièce ${i+1}.${j+1}`)));}
      else{
      if(x.phone)txt(`Téléphone : ${x.phone}`,9);
      if(x.email)txt(`E-mail : ${x.email}`,9);
      if(x.type)txt(`Type de visite : ${x.type}`,9);
      section('PIÈCES ET PRESTATIONS À CHIFFRER');
      const tasks=Array.isArray(x.visitTasks)?x.visitTasks:[];
      if(!tasks.length)txt('Aucune pièce ou prestation renseignée.');
      tasks.forEach((t,i)=>{
        ensure(24);txt(`${i+1}. ${t.room||t.title||'Zone non renseignée'}`,11,true);
        const dimensions=[];
        if(t.length)dimensions.push(`Longueur : ${t.length} m`);
        if(t.width)dimensions.push(`Largeur : ${t.width} m`);
        if(t.height)dimensions.push(`Hauteur : ${t.height} m`);
        if(dimensions.length)txt(dimensions.join(' · '),9);
        if(t.falseCeiling)txt(`Faux plafond : ${t.falseCeiling==='oui'?'Oui':'Non'}${t.falseCeiling==='oui'&&t.plenumHeight?' · Plénum : '+t.plenumHeight+' m':''}`,9);
        if(t.need)txt(`Besoin / prestation à prévoir : ${t.need}`);
        if(t.observation)txt(`Observations : ${t.observation}`);
        (t.photos||[]).forEach((ph,j)=>addPhoto(ph.dataUrl,`Photo - pièce ${i+1}.${j+1}`));y+=3;
      });
      if(x.summary){section('SYNTHÈSE DE LA VISITE');txt(x.summary);}
      if(x.notes){section('OBSERVATIONS ET SUITES');txt(x.notes);}
      txt(`Devis à établir : ${x.needsQuote===false?'Non':'Oui'}`,10,true);
      }
    }
    else if(approved){section('COMPTE RENDU');
      for(const paragraph of String(x.clientReport).split(/\r?\n/)){
        const value=paragraph.trim();if(!value){y+=2;continue;}
        if(value.length<75&&/^(objet|constats?|travaux réalisés|essais.*|résultats.*|notes|matériel.*|réserves.*|suites.*|observations.*|points à confirmer)\s*:?$/i.test(value))section(value);
        else txt(value,10);
      }
      (x.reportItems||[]).forEach((it,i)=>(it.photos||[]).forEach((ph,j)=>addPhoto(ph.dataUrl,`Photo du point ${i+1}.${j+1}`)));}
    else {
    section('POINTS DE L’INTERVENTION');
    const items=Array.isArray(x.reportItems)?x.reportItems:[];
    if(!items.length)txt('Aucun point détaillé saisi.',9,false);
    items.forEach((it,i)=>{ensure(20);txt(`${i+1}. ${it.title||it.issueType||'Point d’intervention'}`,11,true);if(it.location)txt(`Localisation : ${it.location}`,9);if(it.observation)txt(`Constat : ${it.observation}`,9);if(it.action)txt(`Action / préconisation : ${it.action}`,9);if(it.reference)txt(`Référence / matériel : ${it.reference}`,9);if(it.needsQuote)txt('Devis complémentaire : OUI',9,true);(it.photos||[]).forEach((ph,j)=>addPhoto(ph.dataUrl,`Photo ${i+1}.${j+1}`));line();});
    if(x.workDone){section('RÉSUMÉ DE L’INTERVENTION');txt(x.workDone,10);}if(x.notes){section('OBSERVATIONS / SUITE À PRÉVOIR');txt(x.notes,10);}if(x.materials){section('MATÉRIEL UTILISÉ');txt(x.materials,10);}txt(`Devis complémentaire : ${x.needsQuote?'Oui':'Non'}`,10,true);
    }
    if(!visit&&x.projectId){section(REPORT_TYPES[x.reportKind]||'SUIVI DU CHANTIER');txt('Auteur : '+(x.reportSubmittedBy||x.createdBy||'Non renseigné'),9);if(x.progressNotes)txt(x.progressNotes);if(x.materialNeeded||x.requestMaterials?.length){section('MATÉRIEL COMPLÉMENTAIRE À PRÉVOIR');if(x.materialNeededOn)txt('Nécessaire pour le : '+x.materialNeededOn,10,true);txt(x.materialNeeded);if(x.requestMaterials?.length)drawMaterialTable(pdf,x.requestMaterials,{ensure,getY:()=>y,setY:v=>y=v});}if(x.reportKind==='chantier')txt('Fin de chantier signalée par l’équipe — contrôle du bureau à effectuer.',9,true);}
    if(!visit)(x.reportItems||[]).forEach((it,i)=>{if(!equipmentPhotos(it).length&&!it.startedAt&&!it.endedAt)return;section(`SUIVI ${i+1} — ${it.title||'Équipement'}`);if(equipmentText(it))txt(equipmentText(it),9);equipmentPhotos(it).forEach((ph,j)=>addPhoto(ph.dataUrl,`${it.title||'Équipement'} — ${ph.phase} ${j+1}`));});
    if((x.photos||[]).length){ensure(110);section('PHOTOS GÉNÉRALES');(x.photos||[]).forEach((ph,j)=>addPhoto(ph.dataUrl,`Photo générale ${j+1}`));}
    const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setFont('OpusSans','normal');pdf.setFontSize(8);pdf.setTextColor(110);pdf.setDrawColor(207,220,229);pdf.line(M,284,W-M,284);pdf.text(`OPUS ELEC · ${x.number||''}`,M,290);pdf.text(`Page ${i} / ${pages}`,W-M,290,{align:'right'});pdf.setTextColor(0);}
    return new Blob([pdf.output('arraybuffer')],{type:'application/pdf'});
  }
  async visitPdf(v){return this.interventionPdf(v,{visit:true});}
  visitExportSnapshot(v){
    const read=(id,fallback)=>document.getElementById(id)?.value??fallback;
    const actual=(id,value)=>{const field=read(id,this.localDT(value));return field===this.localDT(value)?value:this.toISO(field);};
    return {...structuredClone(v),actualStart:actual('vActualStart',v.actualStart),actualEnd:actual('vActualEnd',v.actualEnd),pauseHours:Number(read('vPause',v.pauseHours||0))||0,summary:read('vSummary',v.summary||'').trim(),notes:read('vNotes',v.notes||'').trim(),needsQuote:read('vNeedsQuote',v.needsQuote===false?'non':'oui')==='oui'};
  }
  async saveVisitPackage(v){
    const blob=await this.visitPdf(v),g=this.c.graph,date=new Date(v.actualStart||v.plannedStart||Date.now());
    const year=String(Number.isNaN(date.getTime())?new Date().getFullYear():date.getFullYear());
    const root=await g.folder('root','VISITES_AVANT_DEVIS'),yf=await g.folder(root.id,year);
    const folderName=this.fileSafe(`${v.number}_${v.clientName||'CLIENT'}_${v.id||''}`),dir=await g.folder(yf.id,folderName),pdfName=this.fileSafe(`${v.number}_VISITE_AVANT_DEVIS.pdf`);
    const uploaded=await g.request(g.base(dir.id)+':/'+encodeURIComponent(pdfName)+':/content',{method:'PUT',headers:{'Content-Type':'application/pdf'},body:blob});
    await g.writeJson(dir.id,'visite.json',v);
    const saved={...v,pdfFileId:uploaded?.id||v.pdfFileId,pdfName,pdfSavedAt:new Date().toISOString(),pdfFolder:`VISITES_AVANT_DEVIS/${year}/${folderName}`};
    const current=this.data.visits.find(row=>row.id===v.id);if(current){Object.assign(current,saved);await this.save('visits');}
    return {blob,pdfName,folder:saved.pdfFolder};
  }
  async saveInterventionPackage(x,{download=false,complete=false}={}){
    const blob=await this.interventionPdf(x),g=this.c.graph,year=String(new Date(x.actualEnd||x.actualStart||x.plannedStart||Date.now()).getFullYear());
    const root=x.projectId?await g.folder(x.projectId,'05_PDF_GENERES'):await g.folder('root','INTERVENTIONS'),yf=await g.folder(root.id,x.projectId?'COMPTES_RENDUS':year),folderName=this.fileSafe(`${x.number}_${x.clientName||'CLIENT'}`),dir=await g.folder(yf.id,folderName),pdfName=this.fileSafe(`${x.number}_RAPPORT_INTERVENTION.pdf`);
    const uploaded=await g.request(g.base(dir.id)+':/'+encodeURIComponent(pdfName)+':/content',{method:'PUT',headers:{'Content-Type':'application/pdf'},body:blob});
    if(!uploaded?.id)throw Error('Microsoft n’a pas confirmé le PDF. Réessayez.');x.pdfFileId=uploaded.id;x.pdfName=pdfName;
    const clean=structuredClone(x);if(complete){if(clean.status!=='facturee')clean.status='terminee';clean.completedAt=clean.actualEnd;}await g.writeJson(dir.id,'intervention.json',clean);x.pdfSavedAt=new Date().toISOString();x.pdfFolder=x.projectId?`${x.projectName}/05_PDF_GENERES/COMPTES_RENDUS/${folderName}`:`INTERVENTIONS/${year}/${folderName}`;await this.save('interventions');
    if(download)this.c.download(blob,pdfName);return {blob,pdfName,folder:x.pdfFolder};
  }
  async saveWithFeedback(form,message,work,after){
    const btn=form.querySelector('button[type=submit]');if(form.dataset.saving==='1')return;form.dataset.saving='1';const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='Enregistrement…';}
    try{await work();if(btn){btn.textContent='✓ Enregistré';btn.classList.add('savedBtn');}this.c.toast(message);await new Promise(r=>setTimeout(r,550));if(form.isConnected){document.getElementById('modal')?.close();if(after)await after();}}
    catch(err){form.dataset.saving='0';if(btn){btn.disabled=false;btn.textContent=old||'Enregistrer';btn.classList.remove('savedBtn');}this.c.toast(err.message||'Enregistrement impossible.');throw err;}
  }

  /* ---------- INTERVENTIONS ---------- */
  async renderInterventions(){
    const root=document.getElementById('interventionsPage');const rows=this.data.interventions.filter(isIndependentIntervention).sort((a,b)=>String(a.plannedStart||'9999').localeCompare(String(b.plannedStart||'9999')));
    const visible=rows.filter(x=>x.status!=='annulee');
    root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">PASSAGES PONCTUELS · SAV · DÉPANNAGES</p><h1>Interventions</h1><p class="muted">Chaque intervention reçoit un numéro chronologique et reste liée au client, au planning et à sa fiche terrain.</p></div><div class="actionRow">${this.c.isAdmin()?'<button id="importInterventionReports" class="secondary">Importer des rapports PDF</button>':''}${this.canPlan()?'<button id="newIntervention">+ Nouvelle intervention</button>':''}</div></div>
      <div class="tabs" aria-label="Classement des interventions"><button type="button" id="intCurrent">Interventions en cours (${visible.filter(x=>!x.archivedAt&&!['terminee','facturee'].includes(x.status)).length})</button><button type="button" id="intCompleted">Interventions achevées (${visible.filter(x=>!x.archivedAt&&['terminee','facturee'].includes(x.status)).length})</button><button type="button" id="intArchived">Interventions archivées (${visible.filter(x=>x.archivedAt).length})</button></div>
      <div class="searchline"><input id="intSearch" type="search" placeholder="Client, adresse, n° intervention…"></div><div id="intList" class="projectList"></div>`;
    const draw=()=>{const q=norm(document.getElementById('intSearch').value);const completed=this.interventionView==='completed',archived=this.interventionView==='archived';for(const [id,active] of [['intCurrent',!completed&&!archived],['intCompleted',completed],['intArchived',archived]]){const b=document.getElementById(id);b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));}const list=visible.filter(x=>(archived?!!x.archivedAt:!x.archivedAt&&['terminee','facturee'].includes(x.status)===completed)&&norm([x.number,x.clientName,x.siteAddress,x.title].join(' ')).includes(q));document.getElementById('intList').innerHTML=list.length?list.map(x=>this.interventionCard(x)).join(''):'<div class="panel empty">Aucune intervention.</div>';root.querySelectorAll('[data-int]').forEach(b=>b.onclick=()=>this.openIntervention(b.dataset.int));root.querySelectorAll('[data-archive-int]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await setInterventionArchived(this,b.dataset.archiveInt,b.dataset.restore!=='true');this.c.toast(b.dataset.restore==='true'?'Intervention remise dans les achevées.':'Intervention validée et archivée.');await this.renderInterventions();}catch(e){this.c.toast(e.message);b.disabled=false;}});};
    document.getElementById('intCurrent').onclick=()=>{this.interventionView='current';draw();};document.getElementById('intCompleted').onclick=()=>{this.interventionView='completed';draw();};document.getElementById('intArchived').onclick=()=>{this.interventionView='archived';draw();};document.getElementById('intSearch').oninput=draw;draw();if(this.c.isAdmin())document.getElementById('importInterventionReports').onclick=()=>openImportReports(this);if(this.canPlan())document.getElementById('newIntervention').onclick=()=>this.editIntervention();
  }
  interventionCard(x){const st=({a_planifier:'À planifier',planifiee:'Planifiée',en_cours:'En cours',terminee:'Achevée',facturee:'Facturée',annulee:'Annulée'})[x.status]||x.status;return `<article class="projectCard"><div><div class="chips"><span class="chip">${esc(x.number)}</span><span class="chip ${x.status==='terminee'?'warn':x.status==='facturee'?'good':''}">${x.archivedAt?'Archivée':esc(st)}</span></div><h3>${esc(x.clientName||'Client à compléter')} · ${esc(x.title||'Intervention')}</h3><p>${esc(x.siteAddress||'Adresse à compléter')}${x.plannedStart?' · '+esc(frDateTime(x.plannedStart)):''}</p><div class="chips"><span class="chip">${esc(this.teamNames(x.teamIds))}</span></div></div><div class="actionRow"><button data-int="${esc(x.id)}">Ouvrir →</button>${this.c.isAdmin()&&['terminee','facturee'].includes(x.status)?`<button type="button" class="secondary" data-archive-int="${esc(x.id)}" data-restore="${!!x.archivedAt}">${x.archivedAt?'Remettre dans les achevées':'Valider et archiver'}</button>`:''}</div></article>`;}
  async editIntervention(existing=null){
    if(existing?!this.c.isAdmin():!this.canPlan())return;
    const x=existing||{id:makeId('int'),number:nextInterventionNumber(this.data.interventions),status:'a_planifier',clientId:'',siteId:'',title:'',request:'',plannedStart:'',plannedEnd:'',teamIds:[],teamSize:1,vehicle:false,photos:[],createdAt:new Date().toISOString(),createdBy:this.user.displayName};
    this.c.modal(existing?'Modifier l’intervention':'Nouvelle intervention',`<form id="intForm"><div class="languageBar">${this.assistant.languageSelectHtml()}<span>🎙 Dictez la demande sans quitter le client des yeux.</span></div><div class="formGrid">
      <div><label>N° intervention</label><input value="${esc(x.number)}" readonly></div>
      ${this.clientChoiceHtml('i',x.clientId)}
      <div class="wide" id="iBillingRow"><label>Adresse du client / agence (distincte du lieu d’intervention)</label><input id="iBilling" value="${esc(x.billingAddress??this.clientById(x.clientId)?.billingAddress??'')}"></div>
      <div class="wide"><h3>Lieu d’intervention et contact sur place</h3><p>Ces coordonnées concernent ce passage. Elles ne modifient pas la fiche de votre client.</p></div>
      <div class="wide"><label>Adresse d’intervention</label><input id="iSiteAddress" value="${esc(x.siteAddress||'')}" placeholder="N°, rue, code postal, ville" required><button type="button" id="iCopyClientAddress" class="secondary">Même adresse que le client</button></div>
      <div><label>Contact sur place</label><input id="iSiteContact" value="${esc(x.siteContact??this.siteById(this.clientById(x.clientId),x.siteId)?.contact??'')}"></div>
      <div><label>Téléphone sur place</label><input id="iSitePhone" type="tel" value="${esc(x.sitePhone??this.siteById(this.clientById(x.clientId),x.siteId)?.phone??'')}"></div>
      <div><label>E-mail sur place</label><input id="iSiteEmail" type="email" value="${esc(x.siteEmail??this.siteById(this.clientById(x.clientId),x.siteId)?.email??'')}"></div>
      <div class="wide"><label>Accès / bâtiment / étage / rendez-vous</label><textarea id="iAccess">${esc(x.siteAccess||'')}</textarea></div>
      <div class="wide"><label>Objet de l’intervention</label><input id="iTitle" value="${esc(x.title)}" required placeholder="Ex. luminaire à remplacer, panne, recherche de défaut…"></div>
      <div class="wide"><label>Demande / consignes du client</label><textarea id="iRequest" ${this.textAssist()} placeholder="Quelques mots suffisent.">${esc(x.request||'')}</textarea>${this.assistant.toolsHtml('iRequest',{translate:true,rewrite:true})}</div>
      <div><label>Type de mission</label><select id="iMission"><option value="diagnostic">Dépannage / diagnostic, facturation après intervention</option><option value="devis">Intervention sur devis accepté</option><option value="sav">SAV / retour sur intervention</option></select></div><div class="wide"><label>Accord / référence pour le bureau (facultatif)</label><input id="iAgreement" value="${esc(x.billingAgreement||'')}" placeholder="Référence devis ou accord tarifaire communiqué au client"></div><div><label>Début prévu</label><input id="iStart" type="datetime-local" value="${this.localDT(x.plannedStart)}"></div>
      <div><label>Fin prévue (estimée, modifiable)</label><input id="iEnd" type="datetime-local" value="${this.localDT(x.plannedEnd)}"></div>
      <div class="wide"><p class="hint">Une seule fiche pour toute la période. Les heures de début et de fin sont répétées chaque jour ouvré, avec une heure de pause pour une journée complète. Exemple : du 16 à 8 h au 17 à 17 h = deux journées de 8 h par personne. Les horaires du vendredi sont adaptés à chaque salarié. Une durée d’une heure est proposée si la fin est vide ; ajustez-la pour réserver le bon créneau. Les horaires réels seront renseignés sur place.</p></div><div><label>Nombre de personnes</label><input id="iSize" type="number" min="1" max="20" value="${Number(x.teamSize)||1}"></div>
      <div><label class="inline"><input id="iVehicle" type="checkbox" ${x.vehicle?'checked':''}> Véhicule nécessaire</label></div>
    </div><label class="inline"><input id="iWeekends" type="checkbox" ${x.plannedWeekends?'checked':''}> Inclure les samedis et dimanches de la période</label><div id="teamPicker" class="teamPicker"></div><div class="actionRow"><button type="submit">Enregistrer l’intervention</button>${existing&&this.canPlan()?'<button type="button" id="deleteInt" class="danger">Supprimer</button>':''}</div></form>`);
    document.getElementById('iMission').value=x.missionType||'diagnostic';this.bindClientChoice('i',x.clientId,x.siteId);const fillSite=()=>{const c=this.clientById(document.getElementById('iClient').value),site=this.siteById(c,document.getElementById('iSite').value);if(site){for(const [field,key] of [['iSiteAddress','address'],['iSiteContact','contact'],['iSitePhone','phone'],['iSiteEmail','email']])document.getElementById(field).value=site[key]||'';}};document.getElementById('iSite').addEventListener('change',fillSite);document.getElementById('iClient').addEventListener('change',()=>{document.getElementById('iBilling').value=this.clientById(document.getElementById('iClient').value)?.billingAddress||'';});const billingVisibility=()=>{document.getElementById('iBillingRow').hidden=document.getElementById('iMode').value==='new';};document.getElementById('iMode').addEventListener('change',billingVisibility);billingVisibility();document.getElementById('iCopyClientAddress').onclick=()=>{document.getElementById('iSiteAddress').value=document.getElementById(document.getElementById('iMode').value==='new'?'iAddress':'iBilling').value;};this.assistant.bind(document.getElementById('modal'),()=>({kind:'intervention_setup',client:document.getElementById('iClient')?.selectedOptions?.[0]?.textContent||'',title:document.getElementById('iTitle')?.value||''}));
    let formTeam=[...(x.teamIds||[])];const fillTeam=()=>{const root=document.getElementById('teamPicker');if(root.querySelector('[name=teamPerson]'))formTeam=[...root.querySelectorAll('[name=teamPerson]:checked')].map(el=>el.value);const a=document.getElementById('iStart').value||'',b=document.getElementById('iEnd').value||'',date=a.slice(0,10)||isoDate(new Date()),linked=this.data.events.find(e=>e.kind==='intervention'&&e.linkId===x.id);root.innerHTML=this.teamPickerHtml(formTeam,date,a.slice(11),b.slice(11),linked?.id||'');};
    suggestPlannedEnd(this);fillTeam();document.getElementById('iStart').onchange=()=>{suggestPlannedEnd(this);fillTeam();};document.getElementById('iEnd').onchange=fillTeam;
    const form=document.getElementById('intForm');
    form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Intervention enregistrée ✓',async()=>{
      suggestPlannedEnd(this);if(!document.getElementById('iSiteAddress').value.trim())throw Error('Indiquez l’adresse réelle d’intervention.');this.validateFormScheduling('i',x);const {client:c,site:s}=await this.resolveClientChoice('i');x.clientId=c?.id||'';x.siteId=s?.id||'';x.clientName=c?.name||'';x.billingAddress=document.getElementById('iMode').value==='new'?c.billingAddress:document.getElementById('iBilling').value.trim();x.siteAddress=document.getElementById('iSiteAddress').value.trim();x.siteContact=document.getElementById('iSiteContact').value.trim();x.sitePhone=document.getElementById('iSitePhone').value.trim();x.siteEmail=document.getElementById('iSiteEmail').value.trim();x.siteAccess=document.getElementById('iAccess').value.trim();
      x.plannedWeekends=document.getElementById('iWeekends').checked;x.missionType=document.getElementById('iMission').value;x.billingAgreement=document.getElementById('iAgreement').value.trim();x.title=document.getElementById('iTitle').value.trim();x.request=document.getElementById('iRequest').value.trim();x.plannedStart=this.toISO(document.getElementById('iStart').value);x.plannedEnd=this.toISO(document.getElementById('iEnd').value);x.teamSize=Number(document.getElementById('iSize').value)||1;x.vehicle=document.getElementById('iVehicle').checked;x.teamIds=[...document.querySelectorAll('[name=teamPerson]:checked')].map(i=>i.value);if(!['terminee','facturee','en_cours'].includes(x.status))x.status=x.plannedStart?'planifiee':'a_planifier';x.updatedAt=new Date().toISOString();
      if(!existing&&!this.data.interventions.some(r=>r.id===x.id))this.data.interventions.push(x);await this.save('interventions');await this.upsertLinkedEvent('intervention',x);
    },async()=>{await this.renderInterventions();await this.openIntervention(x.id);});};
    if(existing&&this.canPlan())document.getElementById('deleteInt').onclick=async()=>{if(!confirm(`Supprimer ${x.number} ?`))return;this.data.interventions=this.data.interventions.filter(r=>r.id!==x.id);this.data.events=this.data.events.filter(r=>!(r.kind==='intervention'&&r.linkId===x.id));await Promise.all([this.save('interventions'),this.save('events')]);document.getElementById('modal').close();await this.renderInterventions();this.c.toast('Intervention supprimée.');};
  }
  async openIntervention(id){
    const x=this.data.interventions.find(r=>r.id===id);if(!x)return;const canEdit=this.canPlan()||x.status!=='facturee';
    const recovery=await this.c.loadReportDraft?.(id);if(recovery&&confirm('Un rapport non confirmé est conservé sur cet appareil. Reprendre ce brouillon ?')){const status=x.status;Object.assign(x,recovery);x.status=status;}
    x.photos=Array.isArray(x.photos)?x.photos:[];x.reportItems=Array.isArray(x.reportItems)?x.reportItems:[];
    this.c.modal(`${x.number} · ${x.clientName||'Intervention'}`,`<div class="detailGrid">
      <div><strong>Client donneur d’ordre</strong><span>${esc(x.clientName||'—')}</span></div><div><strong>Adresse client / agence</strong><span>${esc(x.billingAddress||'—')}</span></div><div><strong>Contact sur place</strong><span>${esc([x.siteContact,x.sitePhone,x.siteEmail].filter(Boolean).join(' · ')||'—')}</span></div><div><strong>Accès</strong><span>${esc(x.siteAccess||'—')}</span></div><div><strong>Adresse d’intervention</strong><span>${esc(x.siteAddress||'—')}</span></div><div><strong>Planning</strong><span>${esc(x.plannedStart?frDateTime(x.plannedStart):'À planifier')}</span></div>
      <div><strong>Équipe</strong><span>${esc(this.teamNames(x.teamIds))}</span></div><div><strong>Statut</strong><span>${esc(this.interventionStatusLabel(x.status))}</span></div>
      <div><strong>Objet</strong><span>${esc(x.title||x.request||'—')}</span></div><div><strong>Consignes client</strong><span>${esc(x.request||'—')}</span></div>
    </div><hr><div class="languageBar">${this.assistant.languageSelectHtml()}<span>🎙 Parlez en italien ou en français, puis mettez au propre en français.</span></div><form id="finishInt">
      ${projectReportFields(x)}
      <section class="quickReport"><div class="panelHead"><div><h3>Points / équipements de l’intervention</h3><p class="muted">Un point par équipement : armoire, tableau, prise… Suivez les horaires, les travaux et les photos avant / pendant / après.</p></div>${canEdit?'<button type="button" id="addIntItem" class="secondary">+ Ajouter un équipement / point</button><button type="button" id="batchEquipment" class="secondary">Préparer une série d’équipements</button>':''}</div>
        <div id="intItemsList" class="lineItemList">${x.reportItems.length?x.reportItems.map((item,i)=>`<div class="lineItemRow">${this.interventionItemCard(item,i)}${canEdit?`<div class="actionRow"><button type="button" class="secondary" data-edit-int-item="${i}">Modifier</button><button type="button" class="danger" data-delete-int-item="${i}">Supprimer</button></div>`:''}</div>`).join(''):'<p class="muted">Aucun point ajouté pour le moment.</p>'}</div>
      </section>
      <section class="quickReport"><h3>Photos générales</h3><p class="muted">Photos d’ensemble, accès, vue globale ou résultat final. ${x.projectId?'Sélection multiple, sans limite de nombre fixée. Photos optimisées pour le transfert ; ajoutez-les par petits lots sur tablette.':'Jusqu’à 6 photos.'}</p>
        <div class="photoButtons"><label class="fileButton">📷 Prendre une photo<input id="photoCapture" type="file" accept="image/*" capture="environment"></label><label class="fileButton secondaryFile">🖼 Ajouter depuis la galerie<input id="photoGallery" type="file" accept="image/*" multiple></label></div>
        <div id="photoPreview" class="reportPhotos"></div>
      </section>
      <div class="formGrid compactReport">
        <div><label>Arrivée réelle</label><input id="aStart" type="datetime-local" value="${this.localDT(x.actualStart)}">${canEdit?'<button type="button" id="recordArrival" class="secondary">Je commence maintenant</button>':''}</div>
        <div><label>Départ réel</label><input id="aEnd" type="datetime-local" value="${this.localDT(x.actualEnd)}"></div>
        <div><label>Pause (h)</label><input id="aPause" type="number" step="0.25" min="0" value="${x.pauseHours??0}"></div>
        <div><label>Devis complémentaire ?</label><select id="aQuote"><option value="non">Non</option><option value="oui">Oui</option></select></div>
        <div class="wide"><label>Résumé de l’intervention</label><textarea id="aWork" ${this.textAssist()} placeholder="Ex. remise en service de l’éclairage, essais effectués, appareil isolé…">${esc(x.workDone||'')}</textarea>${this.assistant.toolsHtml('aWork',{translate:true,rewrite:true})}</div>
        <div class="wide"><label>Observation complémentaire / suite à prévoir</label><textarea id="aNotes" ${this.textAssist()} placeholder="À remplir seulement si nécessaire.">${esc(x.notes||'')}</textarea>${this.assistant.toolsHtml('aNotes',{translate:true,rewrite:true})}</div>
        <div class="wide"><details><summary>Matériel utilisé (facultatif)</summary><textarea id="aMaterial" ${this.textAssist()} placeholder="Références, quantités, matériel fourni…">${esc(x.materials||'')}</textarea></details></div>
      </div>
      <div class="helpCard"><strong>Aide de saisie FR</strong><p>Les zones de texte sont en correction orthographique française pour aider l’équipe. Les boutons IA nécessitent Internet et une connexion Microsoft autorisée. Vérifiez chaque proposition.</p></div>
      <div class="actionRow">${canEdit?'<button type="submit" id="finishInterventionButton">Enregistrer dans OPUS et terminer</button>':''}<button type="button" id="downloadIntPdf" class="secondary">Télécharger le PDF</button><button type="button" id="saveIntPdf" class="secondary">Enregistrer PDF dans OPUS</button>${this.c.isAdmin()?'<button type="button" id="editInt" class="secondary">Modifier la fiche</button>':''}${this.c.isAdmin()?'<button type="button" id="deleteIntReport" class="danger">Supprimer</button>':''}</div>
    </form>`);
    if(x.pdfFileId){const view=document.createElement('button');view.type='button';view.className='secondary';view.textContent='Consulter le rapport enregistré';view.onclick=async()=>{try{await this.c.openAlertDocument({id:x.pdfFileId,name:x.pdfName||x.number+'.pdf'});}catch(e){this.c.toast(e.message);}};document.getElementById('finishInt').before(view);}
    mountMaterials(this,x);mountMaterialOrders(this,x);const editTop=document.getElementById('editInt');if(editTop)document.getElementById('finishInt').before(editTop);document.getElementById('aQuote').value=x.needsQuote?'oui':'non';this.bindPhotoInputs(x.photos,{maxPhotos:x.projectId?Infinity:6});this.assistant.bind(document.getElementById('modal'),()=>({kind:'intervention',client:x.clientName,address:x.siteAddress,title:x.title,number:x.number}));
    if(x.projectId&&canEdit)document.getElementById('finishInterventionButton').textContent='Enregistrer dans OPUS et envoyer au bureau';
    bindReportAI(this,x,canEdit);if(canEdit)this.addDraftButton(x,false);simplifyReport(x);mountReportTeam(this,x);
    if(canEdit){const hint=document.createElement('p');hint.className='reportOutcome';hint.textContent=x.projectId?'Le rapport sera enregistré et envoyé au bureau selon le type choisi.':'Le rapport sera enregistré puis l’intervention passera dans « Interventions achevées ».';document.getElementById('finishInterventionButton').before(hint);}
    const dlPdf=document.getElementById('downloadIntPdf'),savePdf=document.getElementById('saveIntPdf');
    if(canEdit){dlPdf.onclick=()=>finishAndExport(this,x,{download:true});savePdf.onclick=()=>finishAndExport(this,x);document.getElementById('recordArrival').onclick=()=>recordArrival(this,x);}
    else {dlPdf.onclick=async()=>this.c.download(await this.interventionPdf(x),this.fileSafe(`${x.number}_RAPPORT_INTERVENTION.pdf`));savePdf.onclick=async()=>{await this.saveInterventionPackage(x);this.c.toast('PDF enregistré dans OPUS.');};}
    if(canEdit){
      document.getElementById('batchEquipment').onclick=()=>addEquipmentBatch(this,x);const addBtn=document.getElementById('addIntItem');if(addBtn)addBtn.onclick=()=>this.editInterventionItem(x.id);
      document.querySelectorAll('[data-edit-int-item]').forEach(b=>b.onclick=()=>this.editInterventionItem(x.id,Number(b.dataset.editIntItem)));
      document.querySelectorAll('[data-delete-int-item]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.deleteIntItem);if(!confirm(`Supprimer le point ${i+1} ?`))return;x.reportItems.splice(i,1);x.updatedAt=new Date().toISOString();await this.save('interventions');this.openIntervention(x.id);});
      const form=document.getElementById('finishInt');form.addEventListener('invalid',ev=>{feedback(this,'Envoi bloqué : vérifiez le champ « '+(ev.target.closest('div')?.querySelector('label')?.textContent||ev.target.getAttribute('aria-label')||'à compléter')+' ».');},true);form.onsubmit=async ev=>{ev.preventDefault();await finishAndExport(this,x);};
    }
    if(this.c.isAdmin())document.getElementById('editInt').onclick=()=>this.editIntervention(x);
    reportOfficeReturn(this,document.getElementById('finishInt'));
    if(this.c.isAdmin())document.getElementById('deleteIntReport').onclick=async()=>{
      if(!confirm('Mettre ce compte rendu dans la corbeille ? Vous pourrez le restaurer depuis le Bureau.'))return;
      const button=document.getElementById('deleteIntReport');button.disabled=true;
      try{await setReportDeleted(this,x,true);document.getElementById('modal')?.close?.();if(this.section==='office')await this.renderOffice();else if(document.getElementById('interventionsPage'))await this.renderInterventions();this.c.toast('Compte rendu placé dans la corbeille.');}catch(e){this.c.toast('Suppression non enregistrée : '+e.message);button.disabled=false;}
    };
  }
  async editInterventionItem(interventionId,index=null){
    this.captureReportDraft(this.data.interventions.find(x=>x.id===interventionId));
    const x=this.data.interventions.find(r=>r.id===interventionId);if(!x)return;x.reportItems=Array.isArray(x.reportItems)?x.reportItems:[];
    const item=index===null?{id:makeId('ipoint'),issueType:'',location:'',title:'',observation:'',action:'',reference:'',needsQuote:false,photos:[]}:{...x.reportItems[index],photos:Array.isArray(x.reportItems[index]?.photos)?[...x.reportItems[index].photos]:[]};
    item.phasePhotos=structuredClone(item.phasePhotos||{before:[],during:[],after:[]});for(const k of ['before','during','after'])item.phasePhotos[k]??=[];
    this.c.modal(index===null?'Ajouter un point d’intervention':'Modifier le point d’intervention',`<form id="intItemForm"><div class="languageBar">${this.assistant.languageSelectHtml()}<span>Dictée terrain rapide</span></div><div class="formGrid compactReport">
      <div><label>Type</label><select id="iiType"><option value="">— Choisir —</option><option>Éclairage</option><option>Prise de courant</option><option>Tableau électrique</option><option>Recherche de défaut</option><option>VMC</option><option>Portail / accès</option><option>Autre</option></select></div>
      <div><label>Localisation</label><input id="iiLocation" ${this.textAssist()} value="${esc(item.location||'')}" placeholder="Ex. cuisine, couloir, façade, TGBT"></div>
      <div class="wide"><label>Intitulé</label><input id="iiTitle" ${this.textAssist()} value="${esc(item.title||'')}" required placeholder="Ex. éclairage ne fonctionne pas"></div>
      <div class="wide"><label>Constat / observation</label><textarea id="iiObs" ${this.textAssist()} placeholder="Panne constatée, essais, anomalie visible…">${esc(item.observation||'')}</textarea>${this.assistant.toolsHtml('iiObs',{translate:true,rewrite:true})}</div>
      <div class="wide"><label>Action effectuée / à prévoir</label><textarea id="iiAction" ${this.textAssist()} placeholder="Remplacement, remise en conformité, devis à prévoir…">${esc(item.action||'')}</textarea>${this.assistant.toolsHtml('iiAction',{translate:true,rewrite:true})}</div>
      <div class="wide"><label>Référence / matériel</label><input id="iiRef" ${this.textAssist()} value="${esc(item.reference||'')}" placeholder="Référence repérée sur place, matériel proposé, quantités…"></div>
      <div><label>Devis complémentaire ?</label><select id="iiQuote"><option value="non">Non</option><option value="oui">Oui</option></select></div>
    </div>
    <section class="quickReport"><h3>Autres photos du point</h3><div class="photoButtons"><label class="fileButton">📷 Prendre une photo<input id="itemPhotoCapture" type="file" accept="image/*" capture="environment"></label><label class="fileButton secondaryFile">🖼 Galerie<input id="itemPhotoGallery" type="file" accept="image/*" multiple></label></div><div id="itemPhotoPreview" class="reportPhotos"></div></section>
    ${equipmentFields(this,item)}<div class="actionRow"><button type="submit">Enregistrer le point</button><button type="button" id="backToInt" class="secondary">Retour à l’intervention</button></div></form>`);
    bindEquipment(this,item);document.getElementById('iiType').value=item.issueType||'';document.getElementById('iiQuote').value=item.needsQuote?'oui':'non';this.bindPhotoInputs(item.photos,{captureId:'itemPhotoCapture',galleryId:'itemPhotoGallery',previewId:'itemPhotoPreview',maxPhotos:8});this.assistant.bind(document.getElementById('modal'),()=>({kind:'intervention_point',intervention:x.number,client:x.clientName,address:x.siteAddress,issueType:document.getElementById('iiType')?.value||item.issueType,location:document.getElementById('iiLocation')?.value||item.location}));
    document.getElementById('backToInt').onclick=()=>this.openIntervention(interventionId);
    const form=document.getElementById('intItemForm');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Point enregistré ✓',async()=>{
      readEquipment(this,item);x.clientReportApproved=false;item.issueType=document.getElementById('iiType').value;item.location=document.getElementById('iiLocation').value.trim();item.title=document.getElementById('iiTitle').value.trim();item.observation=document.getElementById('iiObs').value.trim();item.action=document.getElementById('iiAction').value.trim();item.reference=document.getElementById('iiRef').value.trim();item.needsQuote=document.getElementById('iiQuote').value==='oui';const previousItems=x.reportItems;x.reportItems=[...previousItems];if(index===null)x.reportItems.push(item);else x.reportItems[index]=item;x.updatedAt=new Date().toISOString();try{await this.save('interventions');}catch(e){x.reportItems=previousItems;throw e;}
    },async()=>this.openIntervention(interventionId));};
  }

  /* ---------- VISITES / DEVIS ---------- */
  async deleteVisit(id,button){
    if(!this.c.isAdmin()){this.c.toast('La suppression des visites est réservée à l’administrateur.');return;}
    if(this.deletingVisit)return;
    const visit=this.data.visits.find(v=>v.id===id);if(!visit)return;
    if(!confirm(`Supprimer la visite ${visit.number||''} — ${visit.clientName||'Client'} et ses rendez-vous du planning ? Les PDF déjà archivés et les chantiers créés sont conservés.`))return;
    this.deletingVisit=true;if(button)button.disabled=true;
    const previous=this.data.visits;
    try{
      this.data.visits=previous.filter(v=>v.id!==id);
      try{await this.save('visits');}catch(e){this.data.visits=previous;throw e;}
      const events=this.data.events;
      this.data.events=events.filter(e=>!(e.kind==='visit'&&e.linkId===id));
      let planningSaved=true;
      try{await this.save('events');}catch(e){this.data.events=events;planningSaved=false;}
      document.getElementById('modal')?.close?.();await this.renderVisits();
      if(document.getElementById('calendarPage'))await this.renderCalendar();
      this.c.toast(planningSaved?'Visite supprimée.':'Visite supprimée, mais le planning n’a pas pu être enregistré. Supprimez le rendez-vous restant dans le calendrier.');
    }catch(e){this.c.toast('Suppression impossible : '+(e.message||'réessayez.'));}
    finally{this.deletingVisit=false;if(button)button.disabled=false;}
  }
  async renderVisits(){
    const root=document.getElementById('visitsPage'),rows=[...this.data.visits].sort((a,b)=>String(a.plannedStart||'9999').localeCompare(String(b.plannedStart||'9999')));
    root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">AVANT DEVIS · DIAGNOSTIC · RELEVÉS</p><h1>Visites / Devis</h1><p class="muted">Client habituel ou nouveau client : la fiche garde les coordonnées, les métrés, les photos et peut ensuite être transformée en chantier.</p></div>${this.canPlan()?'<button id="newVisit">+ Nouvelle visite</button>':''}</div><div class="projectList">${rows.length?rows.map(v=>`<article class="projectCard"><div><div class="chips"><span class="chip">${esc(v.number)}</span><span class="chip">${esc(v.type||'Visite avant devis')}</span><span class="chip ${v.status==='terminee'?'good':''}">${esc(this.visitStatusLabel(v.status))}</span></div><h3>${esc(v.clientName||'Client à compléter')}</h3><p>${esc(v.siteAddress||'Adresse à compléter')}${v.plannedStart?' · '+esc(frDateTime(v.plannedStart)):''}</p><div class="chips">${Array.isArray(v.visitTasks)&&v.visitTasks.length?`<span class="chip">${v.visitTasks.length} tâche(s)</span>`:''}${Array.isArray(v.photos)&&v.photos.length?`<span class="chip">${v.photos.length} photo(s)</span>`:''}</div></div><div class="actionRow"><button data-visit="${esc(v.id)}">Ouvrir →</button>${this.c.isAdmin()?`<button type="button" class="danger" data-delete-visit="${esc(v.id)}">Supprimer la visite</button>`:''}</div></article>`).join(''):'<div class="panel empty">Aucune visite enregistrée.</div>'}</div>`;
    root.querySelectorAll('[data-visit]').forEach(b=>b.onclick=()=>this.openVisit(b.dataset.visit));root.querySelectorAll('[data-delete-visit]').forEach(b=>b.onclick=()=>this.deleteVisit(b.dataset.deleteVisit,b));if(this.canPlan())document.getElementById('newVisit').onclick=()=>this.editVisit();
  }
  async editVisit(existing=null){
    if(existing?!this.c.isAdmin():!this.canPlan())return;
    const v=existing||{id:makeId('vis'),number:nextVisitNumber(this.data.visits),type:'Visite avant devis',clientId:'',siteId:'',request:'',phone:'',email:'',plannedStart:'',plannedEnd:'',teamIds:[],status:'a_planifier',visitTasks:[],photos:[],createdAt:new Date().toISOString()};
    this.c.modal(existing?'Modifier la visite':'Nouvelle visite',`<form id="visitForm"><div class="languageBar">${this.assistant.languageSelectHtml()}<span>🎙 Dictée rapide de la demande client.</span></div><div class="formGrid">
      <div><label>N° visite</label><input value="${esc(v.number)}" readonly></div>
      <div><label>Type de visite</label><select id="vType"><option>Visite avant devis</option><option>Dépannage / diagnostic</option><option>Étude technique</option><option>Relevé / métrés</option><option>Visite sur site</option></select></div>
      ${this.clientChoiceHtml('v',v.clientId)}
      <div class="wide"><label>Objet de la demande</label><textarea id="vReq" ${this.textAssist()} placeholder="Ex. création VMC, mise en sécurité, déplacement compteur…">${esc(v.request||'')}</textarea>${this.assistant.toolsHtml('vReq',{translate:true,rewrite:true})}</div>
      <div><label>Début</label><input id="vStart" type="datetime-local" value="${this.localDT(v.plannedStart)}"></div>
      <div><label>Fin</label><input id="vEnd" type="datetime-local" value="${this.localDT(v.plannedEnd)}"></div>
    </div><div class="actionRow"><button type="submit">Enregistrer la visite</button>${existing&&this.c.isAdmin()?'<button type="button" id="deleteVisit" class="danger">Supprimer</button>':''}${existing&&this.c.isAdmin()&&!v.convertedProjectId?'<button type="button" id="convertVisit" class="secondary">Transformer en chantier</button>':''}</div></form>`);
    document.getElementById('vType').value=v.type;this.bindClientChoice('v',v.clientId,v.siteId);this.assistant.bind(document.getElementById('modal'),()=>({kind:'visit_setup',type:document.getElementById('vType')?.value||'',client:document.getElementById('vClient')?.selectedOptions?.[0]?.textContent||''}));
    const form=document.getElementById('visitForm');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Visite enregistrée ✓',async()=>{
      this.validateFormScheduling('v',v);const {client:c,site:s}=await this.resolveClientChoice('v');v.type=document.getElementById('vType').value;v.clientId=c?.id||'';v.siteId=s?.id||'';v.clientName=c?.name||'';v.siteAddress=s?.address||'';v.phone=s?.phone||c?.phone||'';v.email=s?.email||c?.email||'';v.request=document.getElementById('vReq').value.trim();v.plannedStart=this.toISO(document.getElementById('vStart').value);v.plannedEnd=this.toISO(document.getElementById('vEnd').value);if(!['terminee','convertie'].includes(v.status))v.status=v.plannedStart?'planifiee':'a_planifier';v.updatedAt=new Date().toISOString();if(!existing&&!this.data.visits.some(r=>r.id===v.id))this.data.visits.push(v);await this.save('visits');await this.upsertLinkedEvent('visit',v);
    },async()=>this.renderVisits());};
    if(existing&&this.c.isAdmin())document.getElementById('deleteVisit').onclick=ev=>this.deleteVisit(v.id,ev.currentTarget);
    if(existing&&this.c.isAdmin()&&!v.convertedProjectId)document.getElementById('convertVisit').onclick=async()=>{await this.c.createProjectFromVisit(v);v.convertedProjectId='created';await this.save('visits');document.getElementById('modal').close();this.c.toast('Chantier créé dans « À préparer ».');};
  }
  async openVisit(id){
    const v=this.data.visits.find(x=>x.id===id);if(!v)return;const canEdit=this.canPlan()||v.status!=='convertie';
    v.visitTasks=Array.isArray(v.visitTasks)?v.visitTasks:[];v.photos=Array.isArray(v.photos)?v.photos:[];
    this.c.modal(`${v.number} · ${v.type}`,`<div class="detailGrid"><div><strong>Client</strong><span>${esc(v.clientName||'—')}</span></div><div><strong>Adresse</strong><span>${esc(v.siteAddress||'—')}</span></div><div><strong>Téléphone</strong><span>${esc(v.phone||'—')}</span></div><div><strong>E-mail</strong><span>${esc(v.email||'—')}</span></div><div><strong>Date</strong><span>${esc(v.plannedStart?frDateTime(v.plannedStart):'À planifier')}</span></div><div><strong>Demande</strong><span>${esc(v.request||'—')}</span></div></div><hr><div class="languageBar">${this.assistant.languageSelectHtml()}<span>🎙 Dictez pendant la visite, puis générez une formulation française propre.</span></div><form id="finishVisit">
      <section class="quickReport"><div class="panelHead"><div><h3>Tâches / pièces relevées</h3><p class="muted">Ajoutez une tâche par pièce ou par sujet. Vous pouvez saisir les métrés, le faux plafond et joindre plusieurs photos.</p></div>${canEdit?'<button type="button" id="addVisitTask" class="secondary">+ Ajouter une tâche</button>':''}</div>
      <div class="lineItemList">${v.visitTasks.length?v.visitTasks.map((item,i)=>`<div class="lineItemRow">${this.visitTaskCard(item,i)}${canEdit?`<div class="actionRow"><button type="button" class="secondary" data-edit-visit-task="${i}">Modifier</button><button type="button" class="danger" data-delete-visit-task="${i}">Supprimer</button></div>`:''}</div>`).join(''):'<p class="muted">Aucune tâche ajoutée pour le moment.</p>'}</div></section>
      <section class="quickReport"><h3>Photos générales</h3><p class="muted">Entrée du site, façade, tableau électrique, vue d’ensemble…</p><div class="photoButtons"><label class="fileButton">📷 Prendre une photo<input id="visitPhotoCapture" type="file" accept="image/*" capture="environment"></label><label class="fileButton secondaryFile">🖼 Galerie<input id="visitPhotoGallery" type="file" accept="image/*" multiple></label></div><div id="visitPhotoPreview" class="reportPhotos"></div></section>
      <div class="formGrid compactReport">
        <div><label>Arrivée réelle</label><input id="vActualStart" type="datetime-local" value="${this.localDT(v.actualStart)}"></div>
        <div><label>Départ réel</label><input id="vActualEnd" type="datetime-local" value="${this.localDT(v.actualEnd)}"></div>
        <div><label>Pause (h)</label><input id="vPause" type="number" step="0.25" min="0" value="${v.pauseHours??0}"></div>
        <div><label>Devis à établir ?</label><select id="vNeedsQuote"><option value="oui">Oui</option><option value="non">Non</option></select></div>
        <div class="wide"><label>Résumé de la visite</label><textarea id="vSummary" ${this.textAssist()} placeholder="Ex. relevé des pièces, demande du client, contraintes observées…">${esc(v.summary||'')}</textarea>${this.assistant.toolsHtml('vSummary',{translate:true,rewrite:true})}</div>
        <div class="wide"><label>Observations / suites</label><textarea id="vNotes" ${this.textAssist()} placeholder="Informations utiles pour le devis, accès, contraintes, options…">${esc(v.notes||'')}</textarea>${this.assistant.toolsHtml('vNotes',{translate:true,rewrite:true})}</div>
      </div>
      <div class="helpCard"><strong>Aide de saisie FR</strong><p>Dictez ou saisissez vos notes en français et italien. Générez le compte rendu complet, relisez, validez et enregistrez : le PDF reprend le compte rendu validé avec les photos. Le bouton « Enregistrer PDF dans OPUS » archive la fiche et le PDF dans VISITES_AVANT_DEVIS.</p></div>
      <div class="actionRow">${canEdit?'<button type="submit">Terminer et enregistrer la visite</button>':''}<button type="button" id="downloadVisitPdf" class="secondary">Télécharger le PDF</button><button type="button" id="saveVisitPdf" class="secondary">Enregistrer PDF dans OPUS</button>${this.c.isAdmin()?'<button type="button" id="editVisit" class="secondary">Modifier la fiche</button>':''}${this.c.isAdmin()?'<button type="button" id="deleteVisitReport" class="danger">Supprimer</button>':''}${this.c.isAdmin()&&!v.convertedProjectId?'<button type="button" id="convertVisit" class="secondary">Transformer en chantier</button>':''}</div></form>`);
    document.getElementById('vNeedsQuote').value=v.needsQuote===false?'non':'oui';bindReportAI(this,v,canEdit,true);if(canEdit)this.addDraftButton(v,true);simplifyReport(v,true);this.bindPhotoInputs(v.photos,{captureId:'visitPhotoCapture',galleryId:'visitPhotoGallery',previewId:'visitPhotoPreview',maxPhotos:8});this.assistant.bind(document.getElementById('modal'),()=>({kind:'visit',client:v.clientName,address:v.siteAddress,type:v.type,number:v.number}));
    if(canEdit){
      const addTaskBtn=document.getElementById('addVisitTask');if(addTaskBtn)addTaskBtn.onclick=()=>this.editVisitTask(v.id);
      document.querySelectorAll('[data-edit-visit-task]').forEach(b=>b.onclick=()=>this.editVisitTask(v.id,Number(b.dataset.editVisitTask)));
      document.querySelectorAll('[data-delete-visit-task]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.deleteVisitTask);if(!confirm(`Supprimer la tâche ${i+1} ?`))return;v.visitTasks.splice(i,1);v.updatedAt=new Date().toISOString();await this.save('visits');this.openVisit(v.id);});
      const form=document.getElementById('finishVisit');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Fiche visite enregistrée ✓',async()=>{
        this.validateActualHours('vActualStart','vActualEnd','vPause');v.actualStart=this.toISO(document.getElementById('vActualStart').value);v.actualEnd=this.toISO(document.getElementById('vActualEnd').value);v.pauseHours=Number(document.getElementById('vPause').value)||0;v.summary=document.getElementById('vSummary').value.trim();v.notes=document.getElementById('vNotes').value.trim();v.needsQuote=document.getElementById('vNeedsQuote').value==='oui';v.status='terminee';v.completedAt=new Date().toISOString();v.updatedAt=new Date().toISOString();await this.save('visits');
      },async()=>this.renderVisits());};
    }
    reportOfficeReturn(this,document.getElementById('finishVisit'));
    for(const [id,archive] of [['downloadVisitPdf',false],['saveVisitPdf',true]]){
      const button=document.getElementById(id);button.onclick=async()=>{
        const buttons=['downloadVisitPdf','saveVisitPdf'].map(key=>document.getElementById(key));buttons.forEach(b=>{if(b)b.disabled=true;});
        const original=button.textContent;button.textContent=archive?'Enregistrement…':'Création du PDF…';
        try{const snapshot=this.visitExportSnapshot(v);
          if(archive){const saved=await this.saveVisitPackage(snapshot);this.c.toast(`PDF enregistré dans ${saved.folder}`);}
          else{const blob=await this.visitPdf(snapshot);this.c.download(blob,this.fileSafe(`${v.number}_VISITE_AVANT_DEVIS.pdf`));this.c.toast('PDF de visite téléchargé.');}
        }catch(error){this.c.toast(error.message||'Impossible de créer ou enregistrer le PDF. Réessayez.');}
        finally{buttons.forEach(b=>{if(b)b.disabled=false;});button.textContent=original;}
      };
    }
    if(this.c.isAdmin()){const editTop=document.getElementById('editVisit');editTop.onclick=()=>this.editVisit(v);document.getElementById('modal').querySelector('form').before(editTop);}
    if(this.c.isAdmin())document.getElementById('deleteVisitReport').onclick=ev=>this.deleteVisit(v.id,ev.currentTarget);
    if(this.c.isAdmin()&&!v.convertedProjectId)document.getElementById('convertVisit').onclick=async()=>{await this.c.createProjectFromVisit(v);v.convertedProjectId='created';v.status='convertie';await this.save('visits');document.getElementById('modal').close();this.c.toast('Chantier créé dans « À préparer ».');};
  }
  async editVisitTask(visitId,index=null){
    this.captureReportDraft(this.data.visits.find(x=>x.id===visitId),true);
    const v=this.data.visits.find(x=>x.id===visitId);if(!v)return;v.visitTasks=Array.isArray(v.visitTasks)?v.visitTasks:[];
    const item=index===null?{id:makeId('vtask'),room:'',need:'',observation:'',length:'',width:'',height:'',falseCeiling:'non',plenumHeight:'',photos:[]}:{...v.visitTasks[index],photos:Array.isArray(v.visitTasks[index]?.photos)?[...v.visitTasks[index].photos]:[]};
    this.c.modal(index===null?'Ajouter une tâche / pièce':'Modifier la tâche / pièce',`<form id="visitTaskForm"><div class="languageBar">${this.assistant.languageSelectHtml()}<span>Dictée pièce par pièce</span></div><div class="formGrid compactReport">
      <div><label>Pièce / zone</label><input id="vtRoom" ${this.textAssist()} value="${esc(item.room||'')}" required placeholder="Ex. salon, chambre 1, cuisine, local technique"></div>
      <div><label>Faux plafond ?</label><select id="vtFalse"><option value="non">Non</option><option value="oui">Oui</option></select></div>
      <div><label>Longueur (m)</label><input id="vtLength" inputmode="decimal" value="${esc(item.length||'')}" placeholder="Ex. 4,20"></div>
      <div><label>Largeur (m)</label><input id="vtWidth" inputmode="decimal" value="${esc(item.width||'')}" placeholder="Ex. 3,15"></div>
      <div><label>Hauteur (m)</label><input id="vtHeight" inputmode="decimal" value="${esc(item.height||'')}" placeholder="Ex. 2,50"></div>
      <div><label>Hauteur plénum / entre plafond et faux plafond (m)</label><input id="vtPlenum" inputmode="decimal" value="${esc(item.plenumHeight||'')}" placeholder="À remplir si faux plafond"></div>
      <div class="wide"><label>Besoin / demande client</label><textarea id="vtNeed" ${this.textAssist()} placeholder="Ex. rénovation sous goulotte, remplacement prises, création VMC…">${esc(item.need||'')}</textarea>${this.assistant.toolsHtml('vtNeed',{translate:true,rewrite:true})}</div>
      <div class="wide"><label>Observations / relevés</label><textarea id="vtObs" ${this.textAssist()} placeholder="Laser mètre, contraintes, type de support, appareillage existant, fenêtres, accès…">${esc(item.observation||'')}</textarea>${this.assistant.toolsHtml('vtObs',{translate:true,rewrite:true})}</div>
    </div><section class="quickReport"><h3>Photos de la tâche</h3><div class="photoButtons"><label class="fileButton">📷 Prendre une photo<input id="taskPhotoCapture" type="file" accept="image/*" capture="environment"></label><label class="fileButton secondaryFile">🖼 Galerie<input id="taskPhotoGallery" type="file" accept="image/*" multiple></label></div><div id="taskPhotoPreview" class="reportPhotos"></div></section><div class="actionRow"><button type="submit">Enregistrer la tâche</button><button type="button" id="backToVisit" class="secondary">Retour à la visite</button></div></form>`);
    document.getElementById('vtFalse').value=item.falseCeiling||'non';this.bindPhotoInputs(item.photos,{captureId:'taskPhotoCapture',galleryId:'taskPhotoGallery',previewId:'taskPhotoPreview',maxPhotos:8});this.assistant.bind(document.getElementById('modal'),()=>({kind:'visit_task',visit:v.number,client:v.clientName,address:v.siteAddress,room:document.getElementById('vtRoom')?.value||item.room}));document.getElementById('backToVisit').onclick=()=>this.openVisit(visitId);
    const form=document.getElementById('visitTaskForm');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Tâche enregistrée ✓',async()=>{
      item.room=document.getElementById('vtRoom').value.trim();item.falseCeiling=document.getElementById('vtFalse').value;item.length=document.getElementById('vtLength').value.trim();item.width=document.getElementById('vtWidth').value.trim();item.height=document.getElementById('vtHeight').value.trim();item.plenumHeight=document.getElementById('vtPlenum').value.trim();item.need=document.getElementById('vtNeed').value.trim();item.observation=document.getElementById('vtObs').value.trim();if(index===null)v.visitTasks.push(item);else v.visitTasks[index]=item;v.updatedAt=new Date().toISOString();await this.save('visits');
    },async()=>this.openVisit(visitId));};
  }

  /* ---------- CALENDRIER / RESSOURCES ---------- */
  async renderCalendar(){
    this.dayCursor ||= new Date();
    const root=document.getElementById('calendarPage'),weekDays=[0,1,2,3,4].map(i=>addDays(this.week,i)),monthLabel=this.monthCursor.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    const weekBody=`<div class="calendarTools"><button id="prevPeriod" class="secondary">←</button><button id="todayPeriod" class="secondary">Cette semaine</button><strong>Semaine du ${frDate(weekDays[0],{day:'2-digit',month:'2-digit',year:'numeric'})}</strong><button id="nextPeriod" class="secondary">→</button></div>${hourWeek(this,weekDays)}`;
    const monthBody=`<div class="calendarTools"><button id="prevPeriod" class="secondary">←</button><button id="todayPeriod" class="secondary">Ce mois</button><strong class="monthTitle">${esc(monthLabel)}</strong><button id="nextPeriod" class="secondary">→</button></div>${this.monthGrid()}`;
    root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">PLANNING PARTAGÉ</p><h1>Calendrier des interventions</h1><p class="muted">Vue calendrier : chantier, intervention ou visite. Les apprentis à l’école et les personnes déjà affectées sont indisponibles automatiquement.</p></div><div class="actionRow">${this.canPlan()?'<button id="planEvent">+ Planifier</button><button id="resourcesBtn" class="secondary">Équipe & ressources</button>':''}</div></div>
      <div class="calendarViewSwitch"><button id="dayView" class="${this.calendarView==='day'?'active':''}">Jour</button><button id="weekView" class="${this.calendarView==='week'?'active':''}">Semaine</button><button id="monthView" class="${this.calendarView==='month'?'active':''}">Mois</button></div>
      ${this.calendarView==='month'?monthBody:this.calendarView==='day'?`<div class="calendarTools"><button id="prevPeriod" class="secondary">←</button><button id="todayPeriod" class="secondary">Aujourd’hui</button><strong>${esc(this.dayCursor.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}))}</strong><button id="nextPeriod" class="secondary">→</button></div>${hourWeek(this,[this.dayCursor])}`:weekBody}`;
    mountPlanningNotice(this,root);
    document.getElementById('dayView').onclick=()=>{this.calendarView='day';localStorage.setItem('opus-calendar-view','day');this.renderCalendar();};
    document.getElementById('weekView').onclick=()=>{this.calendarView='week';localStorage.setItem('opus-calendar-view','week');this.renderCalendar();};
    document.getElementById('monthView').onclick=()=>{this.calendarView='month';localStorage.setItem('opus-calendar-view','month');this.renderCalendar();};
    document.getElementById('prevPeriod').onclick=()=>{if(this.calendarView==='month')this.monthCursor=new Date(this.monthCursor.getFullYear(),this.monthCursor.getMonth()-1,1);else if(this.calendarView==='day')this.dayCursor=addDays(this.dayCursor,-1);else this.week=addDays(this.week,-7);this.renderCalendar();};
    document.getElementById('nextPeriod').onclick=()=>{if(this.calendarView==='month')this.monthCursor=new Date(this.monthCursor.getFullYear(),this.monthCursor.getMonth()+1,1);else if(this.calendarView==='day')this.dayCursor=addDays(this.dayCursor,1);else this.week=addDays(this.week,7);this.renderCalendar();};
    document.getElementById('todayPeriod').onclick=()=>{this.week=weekStart();this.monthCursor=new Date();this.dayCursor=new Date();this.renderCalendar();};
    root.querySelectorAll('[data-slot-date]').forEach(b=>b.onclick=()=>this.planEvent(null,{date:b.dataset.slotDate,start:b.dataset.slotTime}));
    root.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>this.openEvent(b.dataset.event));
    root.querySelectorAll('[data-day-detail]').forEach(b=>b.onclick=()=>{const date=b.dataset.dayDetail,day=new Date(date+'T00:00:00'),next=addDays(day,1),events=this.data.events.filter(e=>!['annulee','cancelled'].includes(e.status)&&new Date(e.start)<next&&new Date(e.end)>day).sort(byStart);this.c.modal('Rendez-vous du '+frDate(day),this.hourNotice(date)+'<p>Touchez un rendez-vous pour son adresse et son équipe.</p>'+events.map(e=>'<button class="dayAppointment" data-preview-id="'+esc(e.id)+'">'+esc(calendarLabel(this,e))+' · '+esc(new Date(e.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))+'</button>').join('')+(events.length?'':'<p>Aucun rendez-vous.</p>'));document.querySelectorAll('[data-preview-id]').forEach(btn=>btn.onclick=()=>this.openEvent(btn.dataset.previewId));});
    if(this.role()==='admin'){const b=document.createElement('button');b.className='secondary';b.textContent='Fermetures entreprise';b.onclick=()=>manageClosures(this);root.querySelector('.pageHeading .actionRow').append(b);}
    if(this.role()==='admin'){const b=document.createElement('button');b.className='secondary';b.textContent='Accès apprentis';b.onclick=()=>this.readerSetup();root.querySelector('.pageHeading .actionRow').append(b);}
    if(this.canPlan()){document.getElementById('planEvent').onclick=()=>this.planEvent();document.getElementById('resourcesBtn').onclick=()=>this.peopleManager();}
    fitCalendar(this,root);
  }
  readerSetup(){
    if(this.role()!=='admin')return;
    this.c.modal('Accès apprentis — planning uniquement',`<p>Ruben et Christian consultent les chantiers et le planning depuis leur compte habituel. La composition des équipes est réservée à Roberto et à l’administrateur.</p><p>Pour les apprentis : une page indépendante, sans compte e-mail, avec un code commun. Aucun document ni motif d’absence n’y est affiché.</p><p>La première activation nécessite les réglages Microsoft et Vercel du fichier ACTIVATION_PLANNING_V15.txt inclus dans le ZIP.</p><label>Identifiant de la bibliothèque (PLANNING_DRIVE_ID)<input readonly value="${esc(this.c.graph.drive?.id||'')}"></label><label>Identifiant du site Microsoft<input readonly value="${esc(this.c.graph.site?.id||'')}"></label><label>Code d’accès commun<input id="readerKey" type="password" autocomplete="off"></label><button id="generateReaderKey" class="secondary">Générer un nouveau code</button><p>Un nouveau code ne devient actif qu’après son enregistrement dans PLANNING_ACCESS_CODE sur Vercel et un redéploiement. L’ancien lien sera alors refusé.</p><button id="copyReaderLink">Copier le lien avec ce code</button><p id="readerStatus" role="status"></p>`);
    document.getElementById('generateReaderKey').onclick=()=>{document.getElementById('readerKey').value=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');document.getElementById('readerKey').type='text';};
    document.getElementById('copyReaderLink').onclick=async()=>{const key=document.getElementById('readerKey').value.trim(),status=document.getElementById('readerStatus');if(!/^[a-zA-Z0-9_-]{32,128}$/.test(key)){status.textContent='Générez un code ou collez le code actif défini dans Vercel.';return;}try{await navigator.clipboard.writeText(new URL('/planning/',location.origin).href+'#code='+encodeURIComponent(key));status.textContent='Lien copié. Testez-le avant de le transmettre aux apprentis.';}catch{status.textContent='Copie indisponible : ouvrez /planning/ et saisissez le code.';}};
  }
  hourNotice(date){const closed=closureAt(this.data.closures,date);return (closed?'<div class="opusClosure">Entreprise fermée</div>':'')+absenceBadges(this,date);}
  dayColumn(d){
    const date=isoDate(d),events=this.data.events.filter(e=>isoDate(e.start)===date).sort(byStart),avail=this.availability(date);
    const closed=closureAt(this.data.closures,date);return `<section class="dayCol ${closed?'opusClosed':''}"><header><strong>${esc(frDate(d,{weekday:'long',day:'2-digit',month:'2-digit'}))}</strong>${this.role()==='admin'?`<small>${avail.internal} int. · ${avail.external} ext. disponibles</small>`:''}</header>${closed?`<div class="opusClosure">Fermeture · ${esc(closed.label)}</div>`:''}${absenceBadges(this,date)}<div class="dayEvents">${events.length?events.map(e=>`<button class="eventCard ${e.kind}" data-event="${esc(e.id)}"><span>${new Date(planningSpan(e,this.data.people).start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}–${new Date(planningSpan(e,this.data.people).end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span><strong>${esc(this.linkLabel(e)||e.title||eventKindLabel(e.kind))}</strong><small>${esc(planningSummary(e,this.data.people))}</small>${blockedAssignments(this.data,date,e.teamIds).length?'<small class="opusConflict">À replanifier : indisponibilité</small>':''}</button>`).join(''):`<div class="freeSlot">${closed?'Entreprise fermée':'Aucun rendez-vous'}</div>`}</div></section>`;
  }
  monthGrid(){
    const first=new Date(this.monthCursor.getFullYear(),this.monthCursor.getMonth(),1),start=weekStart(first),days=[...Array(42)].map((_,i)=>addDays(start,i)),current=this.monthCursor.getMonth();
    return `<div class="monthCalendar"><div class="monthWeekdays">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(x=>`<strong>${x}</strong>`).join('')}</div><div class="monthCells">${days.map(d=>{const date=isoDate(d),events=this.data.events.filter(e=>isoDate(e.start)===date).sort(byStart),other=d.getMonth()!==current,closed=closureAt(this.data.closures,date);return `<section class="monthCell ${closed?'opusClosed':''} ${other?'otherMonth':''}"><div class="monthDay">${d.getDate()}</div>${closed?`<div class="opusClosure">Fermeture · ${esc(closed.label)}</div>`:''}${absenceBadges(this,date)}${events.slice(0,3).map(e=>`<button class="monthEvent ${e.kind}" data-event="${esc(e.id)}" title="${esc(this.linkLabel(e)+' · '+planningSummary(e,this.data.people))}"><b>${new Date(e.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</b> ${esc(this.linkLabel(e)||e.title)}${blockedAssignments(this.data,date,e.teamIds).length?' · À replanifier':''}</button>`).join('')}${events.length>3?`<small>+ ${events.length-3} autre(s)</small>`:''}</section>`;}).join('')}</div></div>`;
  }
  availability(date){let internal=0,external=0;if(closureAt(this.data.closures,date))return {internal,external};for(const p of this.data.people){if(personUnavailable(p,date).unavailable)continue;const busy=this.data.events.some(e=>(e.teamIds||[]).includes(p.id)&&isoDate(e.start)===date);if(busy)continue;if(p.type==='external')external++;else internal++;}return {internal,external};}
  teamPickerHtml(selected=[],date=isoDate(new Date()),start='',end='',exclude=''){return `<div class="teamPickerHead"><strong>Composer l’équipe</strong><span>École, absence et personnes déjà affectées sont grisées.</span></div><div class="teamList">${this.data.people.filter(p=>p.active!==false).map(p=>{const u=personUnavailable(p,date),conf=start&&end&&eventConflicts(p.id,date,start,end,this.data.events,exclude,this.data.people);const closed=closureAt(this.data.closures,date);const outside=start&&end&&personPlan({start:date+'T'+start,end:date+'T'+end,pauseHours:0},p).hours===0;const disabled=u.unavailable||conf||closed||(outside&&!document.getElementById('eventExactHours')?.checked);return `<label class="personPick ${disabled?'disabled':''}"><input name="teamPerson" type="checkbox" value="${esc(p.id)}" ${selected.includes(p.id)?'checked':''} ${disabled&&!selected.includes(p.id)?'disabled':''}><span><strong>${esc(p.name)}</strong><small>${p.type==='external'?'Externe':p.role==='apprenti'?'Apprenti':'OPUS'}${p.vehicle?' · véhicule':''}${disabled?' · '+esc(closed?'Entreprise fermée':outside?'Hors horaires contractuels':conf?'Déjà affecté':this.role()==='admin'?u.label:'Indisponible'):''}</small></span></label>`;}).join('')}</div>`;}
  async planEvent(existing=null,slot=null){
    if(!this.canPlan())return;
    const e=existing?structuredClone(existing):{id:makeId('evt'),kind:'project',linkId:'',title:'',start:'',end:'',teamIds:[],teamSize:2,vehicle:false,pauseHours:1,status:'planifie'};
    let selectedTeamIds=[...(e.teamIds||[])],teamOpen=false;
    const previousReport=existing?.kind==='intervention'?this.data.interventions.find(x=>x.id===existing.linkId&&x.projectId):null;
    const previousReportOption=previousReport?`<option value="intervention|${esc(previousReport.id)}">Chantier · ${esc(previousReport.projectName||previousReport.number)} · rendez-vous existant</option>`:'';
    const projectOpts=this.c.getCatalog().projects.map(p=>`<option value="project|${esc(p.id)}">Chantier · ${esc(p.name)}</option>`).join(''),intOpts=this.data.interventions.filter(isIndependentIntervention).map(x=>`<option value="intervention|${esc(x.id)}">Intervention · ${esc(x.number)} · ${esc(x.clientName)}</option>`).join(''),visOpts=this.data.visits.map(x=>`<option value="visit|${esc(x.id)}">Visite · ${esc(x.number)} · ${esc(x.clientName)}</option>`).join('');
    this.c.modal(existing?'Modifier le planning':'Planifier une intervention',`<form id="eventForm"><div class="formGrid"><div class="wide"><label>Élément à planifier</label><select id="eventLink"><option value="">— Choisir —</option>${projectOpts}${intOpts}${previousReportOption}${visOpts}</select></div><div><label>Date</label><input id="eventDate" type="date" value="${existing?isoDate(e.start):isoDate(new Date())}"></div>${!existing?'<div><label>Jusqu’au (inclus, chantier)</label><input id="eventUntil" type="date"><label><input id="eventWeekends" type="checkbox"> Inclure samedi et dimanche</label></div>':''}<div><label>Personnes nécessaires</label><input id="eventSize" type="number" min="1" max="20" value="${Number(e.teamSize)||2}"></div><div><label>Début</label><input id="eventStart" type="time" value="${existing?new Date(e.start).toTimeString().slice(0,5):'08:00'}"></div><div><label>Fin</label><input id="eventEnd" type="time" value="${existing?new Date(e.end).toTimeString().slice(0,5):'17:00'}"></div><div><label>Pause prévue (h)</label><input id="eventPause" type="number" min="0" step="0.25" value="${Number(e.pauseHours)||0}"></div><div><label class="inline"><input id="eventVehicle" type="checkbox" ${e.vehicle?'checked':''}> Véhicule nécessaire</label></div>${existing?`<div><label>Début réel (facultatif)</label><input id="eventActualStart" type="time" value="${e.actualStart?new Date(e.actualStart).toTimeString().slice(0,5):''}"></div><div><label>Fin réelle (facultatif)</label><input id="eventActualEnd" type="time" value="${e.actualEnd?new Date(e.actualEnd).toTimeString().slice(0,5):''}"></div><div><label>Pause réelle (h)</label><input id="eventActualPause" type="number" min="0" step="0.25" value="${e.actualPauseHours??e.pauseHours??0}"></div>`:''}</div>
      <p class="muted">Horaires OPUS appliqués par salarié : lun.–jeu. 8h–17h, pause 1h ; vendredi 8h–16h, pause 1h (39h), ou 8h–11h sans pause (apprentis 35h). Les créneaux déjà saisis sont recalculés dans le suivi.</p><section class="teamAssignBox"><div><strong>Équipe</strong><p id="teamSummary" class="muted">${esc(this.teamNames(selectedTeamIds))}</p></div><button type="button" id="toggleTeam" class="secondary">${selectedTeamIds.length?'Modifier l’équipe':'Choisir l’équipe'}</button></section>
      <div id="eventTeam" hidden></div>${!existing?'<section id="extraPeriods"></section><button type="button" id="addPeriod" class="secondary">+ Autre période / autre équipe (chantier)</button><p class="muted">Chaque période utilise ses horaires quotidiens et son équipe. Les week-ends sont exclus sauf choix explicite ; une date unique reste possible. Chaque journée pourra ensuite être modifiée séparément.</p>':''}
      <div class="actionRow"><button type="submit">${existing?'Enregistrer les modifications':'Enregistrer au calendrier'}</button>${existing?'<button type="button" id="deleteEvent" class="danger">Supprimer du planning</button>':''}</div></form>`);
    if(existing){document.getElementById('eventLink').value=e.kind+'|'+e.linkId;const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Ouvrir la fiche / rapport';b.onclick=()=>e.kind==='intervention'?this.openIntervention(e.linkId):e.kind==='visit'?this.openVisit(e.linkId):this.c.openProject(e.linkId);document.querySelector('#eventForm .actionRow').prepend(b);}
    mountPlanningAffairs(this,e);
    if(!existing)document.getElementById('addPeriod').onclick=()=>{const row=document.createElement('fieldset');row.className='extraPeriod';row.innerHTML=`<legend>Autre période / équipe</legend><label>Du<input data-p="from" type="date" required></label><label>Au inclus<input data-p="to" type="date" required></label><label>Début quotidien<input data-p="start" type="time" value="08:00" required></label><label>Fin quotidienne<input data-p="end" type="time" value="17:00" required></label><label>Pause quotidienne (h)<input data-p="pause" type="number" min="0" step="0.25" value="1"></label><label><input data-p="weekends" type="checkbox"> Inclure les week-ends</label><p>Techniciens affectés à cette période :</p>${this.data.people.filter(p=>p.active!==false).map(p=>`<label><input type="checkbox" data-extra-person value="${esc(p.id)}"> ${esc(p.name)}</label>`).join('')}<button type="button" class="danger">Retirer cette période</button>`;row.querySelector('button').onclick=()=>row.remove();document.getElementById('extraPeriods').append(row);};
    const exact=document.createElement('label');exact.className='inline';exact.innerHTML='<input type="checkbox" id="eventExactHours"> Horaires exceptionnels : conserver les heures saisies, y compris hors horaires habituels';document.getElementById('eventForm').prepend(exact);document.getElementById('eventExactHours').checked=!!e.exactHours;
    if(slot){document.getElementById('eventDate').value=slot.date;document.getElementById('eventStart').value=slot.start;document.getElementById('eventEnd').value=String(Math.min(23,Number(slot.start.slice(0,2))+1)).padStart(2,'0')+slot.start.slice(2);document.getElementById('eventPause').value=0;}
    const syncSelected=()=>{selectedTeamIds=[...document.querySelectorAll('#eventTeam [name=teamPerson]:checked')].map(i=>i.value);document.getElementById('teamSummary').textContent=this.teamNames(selectedTeamIds);document.getElementById('toggleTeam').textContent=selectedTeamIds.length?'Modifier l’équipe':'Choisir l’équipe';};
    const redraw=()=>{if(!teamOpen)return;const date=document.getElementById('eventDate').value,start=document.getElementById('eventStart').value,end=document.getElementById('eventEnd').value;const team=document.getElementById('eventTeam');team.innerHTML=this.teamPickerHtml(selectedTeamIds,date,start,end,e.id);team.querySelectorAll('[name=teamPerson]').forEach(cb=>cb.onchange=syncSelected);};
    document.getElementById('toggleTeam').onclick=()=>{teamOpen=!teamOpen;document.getElementById('eventTeam').hidden=!teamOpen;if(teamOpen)redraw();};
    let pauseEdited=!!existing;document.getElementById('eventPause').oninput=()=>{pauseEdited=true;};
    ['eventDate','eventStart','eventEnd','eventExactHours'].forEach(id=>document.getElementById(id).onchange=()=>{if(!pauseEdited&&['eventStart','eventEnd'].includes(id)){const a=document.getElementById('eventStart').value,b=document.getElementById('eventEnd').value;document.getElementById('eventPause').value=durationHours('2000-01-01T'+a,'2000-01-01T'+b,0)>5?1:0;}redraw();});
    const form=document.getElementById('eventForm');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,existing?'Planning modifié ✓':'Planning enregistré ✓',async()=>{
      const [kind,linkId]=(document.getElementById('eventLink').value||'|').split('|');if(!kind||!linkId)throw new Error('Choisissez un chantier, une intervention ou une visite.');
      const date=document.getElementById('eventDate').value,start=document.getElementById('eventStart').value,end=document.getElementById('eventEnd').value;if(!date||!start||!end)throw new Error('Indiquez la date et les horaires.');
      if(!existing&&(kind==='project'||document.getElementById('eventUntil')?.value||document.querySelector('.extraPeriod'))){
        const base={...e,...readPlanningAffairs(kind,linkId),exactHours:document.getElementById('eventExactHours').checked,kind,linkId,teamSize:Number(document.getElementById('eventSize').value)||1,vehicle:document.getElementById('eventVehicle').checked};base.title=this.linkLabel(base);
        const periods=[{from:date,to:document.getElementById('eventUntil').value||date,start,end,pause:Number(document.getElementById('eventPause').value),teamIds:selectedTeamIds,weekends:document.getElementById('eventWeekends').checked}];
        document.querySelectorAll('.extraPeriod').forEach(row=>{const v=k=>row.querySelector('[data-p="'+k+'"]').value;periods.push({from:v('from'),to:v('to'),start:v('start'),end:v('end'),pause:Number(v('pause')),weekends:row.querySelector('[data-p="weekends"]').checked,teamIds:[...row.querySelectorAll('[data-extra-person]:checked')].map(i=>i.value)});});
        const saved=await savePeriods(this,base,periods);await confirmPlanning(this,saved);return;
      }
      const exactHours=document.getElementById('eventExactHours').checked;this.validateScheduling(date,start,end,selectedTeamIds,e.id,exactHours);e.exactHours=exactHours;
      Object.assign(e,readPlanningAffairs(kind,linkId));e.kind=kind;e.linkId=linkId;e.start=new Date(`${date}T${start}`).toISOString();e.end=new Date(`${date}T${end}`).toISOString();e.teamSize=Number(document.getElementById('eventSize').value)||1;e.pauseHours=Number(document.getElementById('eventPause').value)||0;e.vehicle=document.getElementById('eventVehicle').checked;e.teamIds=[...selectedTeamIds];
      if(existing){const as=document.getElementById('eventActualStart')?.value,ae=document.getElementById('eventActualEnd')?.value;e.actualStart=as?new Date(`${date}T${as}`).toISOString():'';e.actualEnd=ae?new Date(`${date}T${ae}`).toISOString():'';e.actualPauseHours=Number(document.getElementById('eventActualPause')?.value)||0;}
      e.laborHours=e.teamIds.length?plannedTotal(e,this.data.people):durationHours(e.start,e.end,e.pauseHours)*(Number(e.teamSize)||1);e.title=this.linkLabel(e);const previousEvents=this.data.events;this.data.events=previousEvents.some(x=>x.id===e.id)?previousEvents.map(x=>x.id===e.id?e:x):[...previousEvents,e];try{await this.save('events');}catch(error){this.data.events=previousEvents;throw error;}if(existing){Object.assign(existing,e);this.data.events=this.data.events.map(row=>row.id===e.id?existing:row);}await this.syncEntityFromEvent(e);await confirmPlanning(this,[e]);
    },async()=>{await this.renderCalendar();if(this.planningNotice)this.c.toast(this.planningNotice.message);});};
    if(existing)document.getElementById('deleteEvent').onclick=async()=>{if(!confirm('Retirer cette intervention du planning ?'))return;this.data.events=this.data.events.filter(x=>x.id!==e.id);await this.save('events');document.getElementById('modal').close();await this.renderCalendar();this.c.toast('Intervention retirée du planning.');};
  }
  async openEvent(id){return previewEvent(this,id);}
  async upsertLinkedEvent(kind,x){if(kind==='intervention')return saveInterventionDays(this,x);if(!x.plannedStart&&!x.plannedEnd){const previous=this.data.events;this.data.events=previous.filter(e=>!(e.kind===kind&&e.linkId===x.id));if(this.data.events.length!==previous.length){try{await this.save('events');}catch(e){this.data.events=previous;throw e;}}return;}if(!x.plannedStart||!x.plannedEnd)throw Error('Renseignez le début et la fin prévus pour le calendrier.');let e=this.data.events.find(e=>e.kind===kind&&e.linkId===x.id);if(!e){e={id:makeId('evt'),kind,linkId:x.id,teamIds:x.teamIds||[],teamSize:x.teamSize||1,vehicle:x.vehicle||false,pauseHours:x.pauseHours??(durationHours(x.plannedStart,x.plannedEnd,0)>5?1:0),status:'planifie'};this.data.events.push(e);}e.start=x.plannedStart;e.end=x.plannedEnd;e.teamIds=x.teamIds||e.teamIds||[];e.title=kind==='intervention'?`${x.number} · ${x.clientName}`:`${x.number} · ${x.clientName}`;await this.save('events');}
  async syncEntityFromEvent(e){if(e.kind==='intervention'){const x=this.data.interventions.find(x=>x.id===e.linkId);if(x){x.plannedStart=e.start;x.plannedEnd=e.end;x.teamIds=e.teamIds;x.teamSize=e.teamSize;x.vehicle=e.vehicle;if(!['terminee','facturee','en_cours'].includes(x.status))x.status='planifiee';await this.save('interventions');}}if(e.kind==='visit'){const x=this.data.visits.find(x=>x.id===e.linkId);if(x){x.plannedStart=e.start;x.plannedEnd=e.end;x.teamIds=e.teamIds;if(!['terminee','convertie'].includes(x.status))x.status='planifiee';await this.save('visits');}}}

  /* ---------- BUREAU ADMIN ---------- */
  async renderOffice(){
    const root=document.getElementById('officePage');if(!this.c.isAdmin()){root.replaceChildren();return;}
    root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">ESPACE GÉRANT · NON VISIBLE DES TECHNICIENS</p><h1>Bureau OPUS</h1><p class="muted">Chantiers à facturer, interventions achevées et tous les comptes rendus.</p></div></div><div id="officeWork"></div><div class="adminGrid"><section class="panel"><div class="panelHead"><h2>Paie / heures</h2></div><label>Mois</label><input id="payMonth" type="month" value="${new Date().toISOString().slice(0,7)}"><div class="actionRow"><button id="exportPayroll">Consulter / modifier les fiches et exporter en PDF</button></div><p class="muted">Récapitulatif préparatoire : horaires réalisés et planifiés séparés, congés, maladie, école et fermetures. Vérifiez les lignes à compléter. Les congés à décompter, majorations et retenues sont à valider par la paie.</p></section><section class="panel"><div class="panelHead"><h2>Clients & sites</h2><div class="actionRow compactActions"><button id="importClients" class="secondary">Importer la base clients</button><button id="addClient">+ Client</button></div></div><p class="muted"><strong>${this.data.clients.length}</strong> client(s) dans la base privée Microsoft 365.</p><details class="officeClientDetails"><summary>Consulter / modifier les clients (${this.data.clients.length})</summary><div id="clientList"></div></details></section><section class="panel"><div class="panelHead"><h2>Personnel & prestataires</h2><button id="managePeople">Gérer</button></div><div id="peopleSummary"></div></section><section class="panel"><h2>Connecteurs</h2><p><strong>Rexel</strong> — à venir : rapprochement des commandes par numéro d’affaire et dépôt automatique du bon de commande dans le chantier.</p><p><strong>ENEDIS / NDIS</strong> — à venir : constitution guidée du dossier complet.</p></section></div>`;
    mountOfficeWork(this,document.getElementById('officeWork'));
    document.getElementById('exportPayroll').onclick=()=>this.exportPayroll(document.getElementById('payMonth').value);
    document.getElementById('addClient').onclick=()=>this.editClient();document.getElementById('importClients').onclick=()=>this.importClients();
    document.getElementById('managePeople').onclick=()=>this.peopleManager();this.renderClientList();this.renderPeopleSummary();
  }
  async markBilled(id){
    if(!this.c.isAdmin())throw Error('Facturation réservée à l’administrateur.');
    const x=this.data.interventions.find(x=>x.id===id&&!x.projectId&&x.status==='terminee');if(!x)return;
    const n=prompt('Numéro de facture (facultatif) :','');if(n===null)return;
    const previous=structuredClone(x);x.status='facturee';x.invoiceNumber=n||'';x.invoicedAt=new Date().toISOString();
    try{await this.save('interventions');}catch(e){for(const key of Object.keys(x))if(!Object.hasOwn(previous,key))delete x[key];Object.assign(x,previous);throw e;}
    await this.renderOffice();
  }
  importClients(){
    this.c.modal('Importer la base clients',`<div class="hint"><strong>Données privées.</strong> Importez ici le fichier OPUS_CLIENTS… fourni par le bureau. Il sera enregistré dans Microsoft 365, jamais dans le dépôt GitHub public.</div><form id="clientImportForm"><label>Fichier JSON clients</label><input id="clientImportFile" type="file" accept=".json,application/json" required><div class="actionRow"><button type="submit">Importer dans OPUS CHANTIERS</button></div><p id="clientImportInfo" class="muted"></p></form>`);
    const form=document.getElementById('clientImportForm');form.onsubmit=async e=>{e.preventDefault();await this.saveWithFeedback(form,'Base clients importée ✓',async()=>{
      const file=document.getElementById('clientImportFile').files?.[0];if(!file)throw new Error('Choisissez le fichier clients.');
      let payload;try{payload=JSON.parse(await file.text());}catch{throw new Error('Le fichier clients n’est pas un JSON valide.');}
      const incoming=Array.isArray(payload)?payload:Array.isArray(payload?.clients)?payload.clients:null;if(!incoming)throw new Error('Format clients non reconnu.');
      const clean=incoming.filter(c=>c&&c.name).map(c=>({...c,sites:Array.isArray(c.sites)?c.sites:[]}));
      const byId=new Map(this.data.clients.map(c=>[c.id,c]));for(const c of clean)byId.set(c.id||makeId('cli'),c);this.data.clients=[...byId.values()];
      await this.save('clients');
    },async()=>{await this.reload();if(this.section==='office')await this.renderOffice();});};
  }
  renderClientList(){const e=document.getElementById('clientList');if(!e)return;e.innerHTML=this.data.clients.length?this.data.clients.map(c=>`<div class="row"><div><h3>${esc(c.name)}</h3><p>${esc((c.sites||[]).map(s=>s.address).filter(Boolean).join(' · ')||'Aucun site')}</p></div><button class="secondary" data-client="${esc(c.id)}">Modifier</button></div>`).join(''):'<p class="muted">La base clients sera alimentée avec votre fichier.</p>';e.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>this.editClient(this.clientById(b.dataset.client)));}
  async editClient(existing=null){const c=existing||{id:makeId('cli'),name:'',billingAddress:'',sites:[]};this.c.modal(existing?'Modifier le client':'Nouveau client',`<form id="clientForm"><div class="formGrid"><div class="wide"><label>Client / raison sociale</label><input id="cName" value="${esc(c.name)}" required></div><div class="wide"><label>Adresse de facturation</label><input id="cBilling" value="${esc(c.billingAddress||'')}"></div></div><hr><div class="panelHead"><h3>Sites</h3><button id="addSite" type="button" class="secondary">+ Site / adresse</button></div><div id="siteEditor"></div><button type="submit">Enregistrer le client</button></form>`);const draw=()=>{document.getElementById('siteEditor').innerHTML=(c.sites||[]).map((s,i)=>`<div class="siteEdit"><input data-s="name" data-i="${i}" placeholder="Nom du site" value="${esc(s.name||'')}"><input data-s="address" data-i="${i}" placeholder="Adresse" value="${esc(s.address||'')}"><input data-s="contact" data-i="${i}" placeholder="Contact" value="${esc(s.contact||'')}"><input data-s="phone" data-i="${i}" placeholder="Téléphone" value="${esc(s.phone||'')}"><input data-s="email" data-i="${i}" placeholder="E-mail" value="${esc(s.email||'')}"></div>`).join('')||'<p class="muted">Ajoutez au moins un site si le client vous appelle régulièrement.</p>';document.querySelectorAll('#siteEditor input').forEach(i=>i.oninput=()=>{c.sites[Number(i.dataset.i)][i.dataset.s]=i.value;});};draw();document.getElementById('addSite').onclick=()=>{c.sites.push({id:makeId('site'),name:'',address:'',contact:'',phone:'',email:''});draw();};document.getElementById('clientForm').onsubmit=async e=>{e.preventDefault();c.name=document.getElementById('cName').value.trim();c.billingAddress=document.getElementById('cBilling').value.trim();if(!existing)this.data.clients.push(c);await this.save('clients');document.getElementById('modal').close();if(this.section==='office')await this.renderOffice();};}
  renderPeopleSummary(){const e=document.getElementById('peopleSummary');if(!e)return;const a=this.data.people.filter(p=>p.active!==false);e.innerHTML=`<p><strong>${a.filter(p=>p.type!=='external').length}</strong> interne(s) actif(s) · <strong>${a.filter(p=>p.type==='external').length}</strong> prestataire(s) externe(s) actif(s).</p>`;}
  peopleManager(){if(!this.canPlan())return;const externalOnly=this.role()==='manager';this.c.modal('Équipe & ressources',`<p class="muted">${externalOnly?'Vous pouvez ajouter ou modifier les prestataires externes et composer les équipes. Le personnel OPUS permanent est géré par le bureau.':'Gérez le personnel OPUS, les apprentis, les semaines d’école, les absences et les prestataires externes.'}</p><div class="actionRow"><button id="addExternal">+ Prestataire externe</button>${!externalOnly?'<button id="addInternal" class="secondary">+ Personnel OPUS</button>':''}</div><div id="peopleList"></div>`);const draw=()=>{document.getElementById('peopleList').innerHTML=this.data.people.filter(p=>!externalOnly||p.type==='external').map(p=>`<div class="row"><div><h3>${esc(p.name)}</h3><p>${p.type==='external'?'Prestataire externe':p.role==='apprenti'?'Apprenti · '+p.weeklyTarget+' h'+((p.schoolDates?.length||p.schoolPeriods?.length)?' · calendrier école intégré':''):'Personnel OPUS · '+p.weeklyTarget+' h'}${p.vehicle?' · véhicule':''}${p.type==='external'&&p.availableFrom?' · '+frDate(p.availableFrom)+' → '+frDate(p.availableTo):''}</p></div><button class="secondary" data-person="${esc(p.id)}">Modifier</button></div>`).join('')||'<p class="muted">Aucune personne enregistrée.</p>';document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>this.editPerson(this.personById(b.dataset.person),draw,externalOnly));};draw();document.getElementById('addExternal').onclick=()=>this.editPerson(null,draw,true);if(!externalOnly)document.getElementById('addInternal').onclick=()=>this.editPerson(null,draw,false);}
  editPerson(existing,redraw,forceExternal=false){return editResource(this,existing,forceExternal);}
  exportPayroll(month){return workforceExport(this,month);}

  captureReportDraft(x,visit=false){
    if(!x)return;const form=document.getElementById(visit?'finishVisit':'finishInt');if(!form)return;if(!visit)captureReportTeam(x);
    const read=id=>document.getElementById(id)?.value||'';
    if(!visit){captureProjectReport(x,read);const rows=readMaterials();if(rows)x.requestMaterials=rows;}
    if(visit){Object.assign(x,this.visitExportSnapshot(x));}else{x.workDone=read('aWork').trim();x.notes=read('aNotes').trim();x.materials=read('aMaterial').trim();x.needsQuote=read('aQuote')==='oui'||(x.reportItems||[]).some(p=>p.needsQuote);x.actualStart=this.toISO(read('aStart'));x.actualEnd=this.toISO(read('aEnd'));x.pauseHours=Number(read('aPause'))||0;}
    const draft=form.querySelector('#clientReportDraft'),section=draft?.closest('section');if(draft){x.clientReport=draft.value.trim();x.clientReportSource=section.dataset.source||'';x.clientReportApproved=!!form.querySelector('#approveClientReport')?.checked&&x.clientReportSource===JSON.stringify(visit?savedVisitReportSource(x):reportSource(x,read));}
  }
  addDraftButton(x,visit){
    const form=document.getElementById(visit?'finishVisit':'finishInt'),b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Enregistrer le brouillon';Array.from(form.children).find(el=>el.classList.contains('actionRow'))?.prepend(b);
    b.onclick=async()=>{b.disabled=true;try{await this.pendingPhotos;this.captureReportDraft(x,visit);x.updatedAt=new Date().toISOString();x.reportDraftSavedAt=x.updatedAt;await this.save(visit?'visits':'interventions');this.c.toast('Brouillon enregistré. Le statut du rendez-vous est conservé.');}catch(e){this.c.toast('Brouillon non synchronisé : '+e.message);}finally{b.disabled=false;}};
  }
  validateActualHours(startId,endId,pauseId){const a=document.getElementById(startId)?.value,b=document.getElementById(endId)?.value,pause=Number(document.getElementById(pauseId)?.value)||0;if(a||b){if(!a||!b||b<=a||a.slice(0,10)!==b.slice(0,10)||pause<0||pause>durationHours(a,b,0))throw new Error('Vérifiez les horaires réels et la pause : début et fin le même jour, fin après début.');}}
  validateScheduling(date,start,end,team,exclude='',exactHours=false){
    if(!date||!start||!end||end<=start)throw new Error('La fin doit être après le début, sur la même journée.');
    const blocked=blockedAssignments(this.data,date,team);
    for(const id of team){const p=this.personById(id);if(!exactHours&&personPlan({start:date+'T'+start,end:date+'T'+end,pauseHours:0},p).hours===0)blocked.push((p?.name||'Ressource')+' : hors horaires contractuels');if(personUnavailable(p,date).unavailable&&!blocked.length)blocked.push((p?.name||'Ressource')+' : indisponible');if(eventConflicts(id,date,start,end,this.data.events,exclude,this.data.people))blocked.push((p?.name||'Ressource')+' : déjà affecté');}
    if(blocked.length)throw new Error(blocked.join(' · ')+'. Modifiez les horaires ou l’équipe.');
  }
  validateFormScheduling(prefix,x){
    const start=document.getElementById(prefix+'Start')?.value,end=document.getElementById(prefix+'End')?.value;
    if(prefix==='i'){validateInterventionDays(this,x,start,end,[...document.querySelectorAll('[name=teamPerson]:checked')].map(el=>el.value),document.getElementById('iWeekends')?.checked);return;}
    if(!start&&!end)return;if(!start||!end||start.slice(0,10)!==end.slice(0,10))throw new Error('Renseignez un début et une fin le même jour. Pour plusieurs jours, créez plusieurs créneaux au calendrier.');
    const linked=this.data.events.find(e=>e.linkId===x.id);
    this.validateScheduling(start.slice(0,10),start.slice(11),end.slice(11),prefix==='v'?(x.teamIds||[]):[...document.querySelectorAll('[name=teamPerson]:checked')].map(el=>el.value),linked?.id||'');
  }
  async moveProjectCategoryIfReady(projectId){return projectId;}
  localDT(v){if(!v)return '';const d=new Date(v),off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);}
  toISO(v){return v?new Date(v).toISOString():'';}
}
