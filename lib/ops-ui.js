import {OpsRepository,isoDate,weekStart,addDays,frDate,frDateTime,durationHours,nextInterventionNumber,nextVisitNumber,personUnavailable,eventConflicts,standardDayHours,eventKindLabel,makeId,isWithin,isSchoolDay} from './ops.js?v=3.4.1';
import {OpusAssistant} from './assistant.js?v=3.4.1';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const byStart=(a,b)=>String(a.start||a.plannedStart||'9999').localeCompare(String(b.start||b.plannedStart||'9999'));

export class OpsUI{
  constructor(ctx){this.c=ctx;this.repo=new OpsRepository(ctx.graph);this.assistant=new OpusAssistant(ctx.getConfig(),{toast:ctx.toast});this.data={clients:[],people:[],interventions:[],visits:[],events:[]};this.section='projects';this.week=weekStart();this.calendarView=localStorage.getItem('opus-calendar-view')||'week';this.monthCursor=new Date();}
  get user(){return this.c.getUser();}
  get config(){return this.c.getConfig();}
  role(){
    if(this.c.isAdmin())return 'admin';
    const mail=String(this.user?.mail||this.user?.userPrincipalName||'').toLowerCase();
    return (this.config.managerUsers||[]).map(x=>String(x).toLowerCase()).includes(mail)?'manager':'technician';
  }
  canPlan(){return ['admin','manager'].includes(this.role());}
  async init(){
    await this.repo.init();await this.reload();
    // Navigation first: a personnel synchronisation problem must never hide the main app tabs.
    this.bindNav();document.getElementById('mainNav').hidden=false;document.getElementById('officeNav').hidden=this.role()!=='admin';this.updateRoleUI();
    try{
      await this.syncDefaultPeople();
      if(this.role()==='manager'&&!this.data.people.some(p=>String(p.email||'').toLowerCase()===String(this.user?.mail||this.user?.userPrincipalName||'').toLowerCase())){
        this.data.people.push({id:makeId('pers'),name:this.user.displayName,email:this.user.mail||this.user.userPrincipalName,type:'internal',role:'technicien',weeklyTarget:39,vehicle:true,active:true,schoolPeriods:[],absences:[]});
        await this.save('people');
      }
    }catch(e){console.warn('Synchronisation personnel différée',e);this.c.toast('Planning disponible. La synchronisation du personnel sera retentée à la prochaine actualisation.');}
  }
  async reload(){this.data=await this.repo.loadAll();}
  async save(kind){await this.repo.save(kind,this.data[kind]);}
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
    this.section=section;localStorage.setItem('opus-main-section',section);this.setActiveNav();
    const aside=document.getElementById('projectAside');if(aside)aside.hidden=section!=='projects';
    for(const id of ['dashboard','projectPage','interventionsPage','visitsPage','calendarPage','officePage']){const e=document.getElementById(id);if(e)e.hidden=true;}
    if(section==='projects'){this.c.showDashboard();return;}
    if(section==='interventions'){document.getElementById('interventionsPage').hidden=false;await this.renderInterventions();}
    if(section==='visits'){document.getElementById('visitsPage').hidden=false;await this.renderVisits();}
    if(section==='calendar'){document.getElementById('calendarPage').hidden=false;await this.renderCalendar();}
    if(section==='office'&&this.role()==='admin'){document.getElementById('officePage').hidden=false;await this.renderOffice();}
  }
  restoreSection(){const s=localStorage.getItem('opus-main-section');if(s&&['interventions','visits','calendar','office'].includes(s)&&(s!=='office'||this.role()==='admin'))return this.show(s);}
  nextProjectEvent(projectId){return this.data.events.filter(e=>e.kind==='project'&&e.linkId===projectId&&new Date(e.end)>=new Date()).sort(byStart)[0]||null;}
  sortProjects(rows){return [...rows].sort((a,b)=>{const ea=this.nextProjectEvent(a.id),eb=this.nextProjectEvent(b.id);if(ea&&eb)return String(ea.start).localeCompare(String(eb.start));if(ea)return -1;if(eb)return 1;return a.name.localeCompare(b.name);});}
  projectEventChip(projectId){const e=this.nextProjectEvent(projectId);return e?`<span class="chip calendarChip">📅 ${esc(frDateTime(e.start))}</span>`:'';}
  clientById(id){return this.data.clients.find(c=>c.id===id);}
  siteById(client,id){return client?.sites?.find(s=>s.id===id);}
  personById(id){return this.data.people.find(p=>p.id===id);}
  teamNames(ids=[]){return ids.map(id=>this.personById(id)?.name).filter(Boolean).join(', ')||'Équipe à affecter';}
  linkLabel(e){if(e.kind==='project')return this.c.getCatalog().projects.find(p=>p.id===e.linkId)?.name||e.title;if(e.kind==='intervention')return this.data.interventions.find(x=>x.id===e.linkId)?.number||e.title;return this.data.visits.find(x=>x.id===e.linkId)?.number||e.title;}

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
        <div><label>Site / adresse</label><select id="${prefix}Site"></select></div>
      </div></div>
      <div id="${prefix}New" class="wide" hidden><div class="formGrid newClientBox">
        <div><label>Type</label><select id="${prefix}Kind"><option>Madame</option><option>Monsieur</option><option>Société</option><option>Syndic</option><option>Institutionnel</option><option>Autre</option></select></div>
        <div><label>Nom / raison sociale</label><input id="${prefix}Name" placeholder="Nom, société ou syndic"></div>
        <div><label>Prénom (si particulier)</label><input id="${prefix}First" placeholder="Prénom"></div>
        <div><label>Téléphone</label><input id="${prefix}Phone" inputmode="tel"></div>
        <div class="wide"><label>Adresse du site</label><input id="${prefix}Address" placeholder="N°, rue, code postal, ville"></div>
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
    const site={id:makeId('site'),name:display,address,contact:individual?`${first} ${name}`.trim():'',phone,email};
    const c={id:makeId('cli'),name:display,category:kind,lastName:individual?name:'',firstName:individual?first:'',phone,email,billingAddress:'',sites:[site],createdAt:new Date().toISOString()};
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
    const add=async input=>{if(!input.files?.length)return;for(const f of [...input.files]){if(photos.length>=maxPhotos)break;photos.push(await this.compressPhoto(f));}input.value='';this.renderPhotoGrid(photos,previewId);};
    const cam=document.getElementById(captureId),gallery=document.getElementById(galleryId);if(cam)cam.onchange=()=>add(cam);if(gallery)gallery.onchange=()=>add(gallery);this.renderPhotoGrid(photos,previewId);
  }
  interventionStatusLabel(status){return ({a_planifier:'À planifier',planifiee:'Planifiée',terminee:'Terminée',facturee:'Facturée',annulee:'Annulée'})[status]||status||'—';}
  visitStatusLabel(status){return ({a_planifier:'À planifier',planifiee:'Planifiée',terminee:'Terminée',convertie:'Convertie en chantier',annulee:'Annulée'})[status]||status||'—';}
  dimensionLine(task={}){const parts=[];if(task.length)parts.push(`L ${task.length} m`);if(task.width)parts.push(`l ${task.width} m`);if(task.height)parts.push(`H ${task.height} m`);if(task.falseCeiling==='oui')parts.push(task.plenumHeight?`faux plafond · plénum ${task.plenumHeight} m`:'faux plafond');return parts.join(' · ')||'Dimensions non saisies';}
  interventionItemSummary(item={}){const bits=[];if(item.location)bits.push(item.location);if(item.reference)bits.push(item.reference);if(item.needsQuote)bits.push('devis complémentaire');return bits.join(' · ');}
  interventionItemCard(item,index){return `<article class="lineItemCard"><div><div class="chips"><span class="chip">Point ${index+1}</span>${item.needsQuote?'<span class="chip warn">Devis</span>':''}${(item.photos||[]).length?`<span class="chip">${(item.photos||[]).length} photo(s)</span>`:''}</div><h3>${esc(item.title||item.issueType||'Point d’intervention')}</h3><p>${esc(this.interventionItemSummary(item)||item.observation||'Observation à compléter')}</p>${item.action?`<small>${esc(item.action)}</small>`:''}</div></article>`;}
  visitTaskCard(item,index){return `<article class="lineItemCard"><div><div class="chips"><span class="chip">Tâche ${index+1}</span>${(item.photos||[]).length?`<span class="chip">${(item.photos||[]).length} photo(s)</span>`:''}</div><h3>${esc(item.room||item.title||'Pièce / zone')}</h3><p>${esc(this.dimensionLine(item))}</p>${item.need?`<small>${esc(item.need)}</small>`:''}</div></article>`;}
  fileSafe(s=''){return String(s||'Sans titre').replace(/["*:<>?/\\|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,90)||'Sans titre';}
  async interventionPdf(x){
    const {jsPDF}=await import('./vendor/jspdf.js');const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
    const W=210,M=15,contentW=W-M*2;let y=17,page=1;
    const ensure=(h=12)=>{if(y+h>282){pdf.addPage();page++;y=17;}};
    const txt=(value,size=10,bold=false,indent=0)=>{const s=String(value||'').trim();if(!s)return;pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);const lines=pdf.splitTextToSize(s,contentW-indent);ensure(lines.length*(size*.42)+3);pdf.text(lines,M+indent,y);y+=lines.length*(size*.42)+3;};
    const line=()=>{ensure(5);pdf.setDrawColor(210);pdf.line(M,y,W-M,y);y+=5;};
    const addPhoto=(dataUrl,label='Photo')=>{if(!dataUrl)return;try{const prop=pdf.getImageProperties(dataUrl),maxW=82,maxH=55,ratio=Math.min(maxW/prop.width,maxH/prop.height),w=prop.width*ratio,h=prop.height*ratio;ensure(h+10);pdf.setFontSize(8);pdf.setFont('helvetica','bold');pdf.text(label,M,y);y+=4;pdf.addImage(dataUrl,'JPEG',M,y,w,h,undefined,'FAST');y+=h+6;}catch(e){console.warn('Photo PDF ignorée',e);}};
    pdf.setFont('helvetica','bold');pdf.setFontSize(18);pdf.text('OPUS ELEC - RAPPORT D\'INTERVENTION',M,y);y+=9;
    pdf.setFontSize(12);pdf.text(x.number||'Intervention',M,y);y+=7;line();
    txt(`Client : ${x.clientName||'—'}`,11,true);txt(`Adresse : ${x.siteAddress||'—'}`);txt(`Objet : ${x.title||x.request||'—'}`);txt(`Techniciens : ${this.teamNames(x.teamIds)}`);txt(`Date : ${x.actualStart?frDateTime(x.actualStart):(x.plannedStart?frDateTime(x.plannedStart):'—')}`);
    if(x.actualStart&&x.actualEnd)txt(`Horaires réalisés : ${new Date(x.actualStart).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} - ${new Date(x.actualEnd).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}${Number(x.pauseHours)>0?` · pause ${x.pauseHours} h`:''}`);
    line();txt('POINTS DE L\'INTERVENTION',12,true);
    const items=Array.isArray(x.reportItems)?x.reportItems:[];
    if(!items.length)txt('Aucun point détaillé saisi.',9,false);
    items.forEach((it,i)=>{ensure(20);txt(`${i+1}. ${it.title||it.issueType||'Point d’intervention'}`,11,true);if(it.location)txt(`Localisation : ${it.location}`,9);if(it.observation)txt(`Constat : ${it.observation}`,9);if(it.action)txt(`Action / préconisation : ${it.action}`,9);if(it.reference)txt(`Référence / matériel : ${it.reference}`,9);if(it.needsQuote)txt('Devis complémentaire : OUI',9,true);(it.photos||[]).forEach((ph,j)=>addPhoto(ph.dataUrl,`Photo ${i+1}.${j+1}`));line();});
    if(x.workDone){txt('RÉSUMÉ DE L\'INTERVENTION',12,true);txt(x.workDone,10);}if(x.notes){txt('OBSERVATIONS / SUITE À PRÉVOIR',12,true);txt(x.notes,10);}if(x.materials){txt('MATÉRIEL UTILISÉ',12,true);txt(x.materials,10);}txt(`Devis complémentaire : ${x.needsQuote?'Oui':'Non'}`,10,true);
    if((x.photos||[]).length){line();txt('PHOTOS GÉNÉRALES',12,true);(x.photos||[]).forEach((ph,j)=>addPhoto(ph.dataUrl,`Photo générale ${j+1}`));}
    const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(110);pdf.text(`OPUS ELEC · ${x.number||''} · page ${i}/${pages}`,M,292);pdf.setTextColor(0);}
    return new Blob([pdf.output('arraybuffer')],{type:'application/pdf'});
  }
  async saveInterventionPackage(x,{download=false}={}){
    const blob=await this.interventionPdf(x),g=this.c.graph,year=String(new Date(x.actualEnd||x.actualStart||x.plannedStart||Date.now()).getFullYear());
    const root=await g.folder('root','INTERVENTIONS'),yf=await g.folder(root.id,year),folderName=this.fileSafe(`${x.number}_${x.clientName||'CLIENT'}`),dir=await g.folder(yf.id,folderName),pdfName=this.fileSafe(`${x.number}_RAPPORT_INTERVENTION.pdf`);
    await g.request(g.base(dir.id)+':/'+encodeURIComponent(pdfName)+':/content',{method:'PUT',headers:{'Content-Type':'application/pdf'},body:blob});
    const clean=structuredClone(x);await g.writeJson(dir.id,'intervention.json',clean);x.pdfSavedAt=new Date().toISOString();x.pdfFolder=`INTERVENTIONS/${year}/${folderName}`;await this.save('interventions');
    if(download)this.c.download(blob,pdfName);return {blob,pdfName,folder:x.pdfFolder};
  }
  async saveWithFeedback(form,message,work,after){
    const btn=form.querySelector('button[type=submit]');if(form.dataset.saving==='1')return;form.dataset.saving='1';const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='Enregistrement…';}
    try{await work();if(btn){btn.textContent='✓ Enregistré';btn.classList.add('savedBtn');}this.c.toast(message);await new Promise(r=>setTimeout(r,550));document.getElementById('modal')?.close();if(after)await after();}
    catch(err){form.dataset.saving='0';if(btn){btn.disabled=false;btn.textContent=old||'Enregistrer';btn.classList.remove('savedBtn');}this.c.toast(err.message||'Enregistrement impossible.');throw err;}
  }

  /* ---------- INTERVENTIONS ---------- */
  async renderInterventions(){
    const root=document.getElementById('interventionsPage');const rows=[...this.data.interventions].sort((a,b)=>String(a.plannedStart||'9999').localeCompare(String(b.plannedStart||'9999')));
    const visible=rows.filter(x=>x.status!=='annulee');
    root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">PASSAGES PONCTUELS · SAV · DÉPANNAGES</p><h1>Interventions</h1><p class="muted">Chaque intervention reçoit un numéro chronologique et reste liée au client, au planning et à sa fiche terrain.</p></div>${this.canPlan()?'<button id="newIntervention">+ Nouvelle intervention</button>':''}</div>
      <div class="statusTiles"><div><strong>${visible.filter(x=>x.status==='a_planifier').length}</strong><span>À planifier</span></div><div><strong>${visible.filter(x=>x.status==='planifiee').length}</strong><span>Planifiées</span></div><div><strong>${visible.filter(x=>x.status==='terminee').length}</strong><span>Terminées</span></div></div>
      <div class="searchline"><input id="intSearch" type="search" placeholder="Client, adresse, n° intervention…"></div><div id="intList" class="projectList"></div>`;
    const draw=()=>{const q=norm(document.getElementById('intSearch').value);const list=visible.filter(x=>norm([x.number,x.clientName,x.siteAddress,x.title].join(' ')).includes(q));document.getElementById('intList').innerHTML=list.length?list.map(x=>this.interventionCard(x)).join(''):'<div class="panel empty">Aucune intervention.</div>';root.querySelectorAll('[data-int]').forEach(b=>b.onclick=()=>this.openIntervention(b.dataset.int));};
    document.getElementById('intSearch').oninput=draw;draw();if(this.canPlan())document.getElementById('newIntervention').onclick=()=>this.editIntervention();
  }
  interventionCard(x){const st=({a_planifier:'À planifier',planifiee:'Planifiée',terminee:'Terminée',facturee:'Facturée',annulee:'Annulée'})[x.status]||x.status;return `<article class="projectCard"><div><div class="chips"><span class="chip">${esc(x.number)}</span><span class="chip ${x.status==='terminee'?'warn':x.status==='facturee'?'good':''}">${esc(st)}</span></div><h3>${esc(x.clientName||'Client à compléter')} · ${esc(x.title||'Intervention')}</h3><p>${esc(x.siteAddress||'Adresse à compléter')}${x.plannedStart?' · '+esc(frDateTime(x.plannedStart)):''}</p><div class="chips"><span class="chip">${esc(this.teamNames(x.teamIds))}</span></div></div><button data-int="${esc(x.id)}">Ouvrir →</button></article>`;}
  async editIntervention(existing=null){
    const x=existing||{id:makeId('int'),number:nextInterventionNumber(this.data.interventions),status:'a_planifier',clientId:'',siteId:'',title:'',request:'',plannedStart:'',plannedEnd:'',teamIds:[],teamSize:1,vehicle:false,photos:[],createdAt:new Date().toISOString(),createdBy:this.user.displayName};
    this.c.modal(existing?'Modifier l’intervention':'Nouvelle intervention',`<form id="intForm"><div class="languageBar">${this.assistant.languageSelectHtml()}<span>🎙 Dictez la demande sans quitter le client des yeux.</span></div><div class="formGrid">
      <div><label>N° intervention</label><input value="${esc(x.number)}" readonly></div>
      ${this.clientChoiceHtml('i',x.clientId)}
      <div class="wide"><label>Objet de l’intervention</label><input id="iTitle" value="${esc(x.title)}" required placeholder="Ex. luminaire à remplacer, panne, recherche de défaut…"></div>
      <div class="wide"><label>Demande / consignes du client</label><textarea id="iRequest" ${this.textAssist()} placeholder="Quelques mots suffisent.">${esc(x.request||'')}</textarea>${this.assistant.toolsHtml('iRequest',{translate:true,rewrite:true})}</div>
      <div><label>Début prévu</label><input id="iStart" type="datetime-local" value="${this.localDT(x.plannedStart)}"></div>
      <div><label>Fin prévue</label><input id="iEnd" type="datetime-local" value="${this.localDT(x.plannedEnd)}"></div>
      <div><label>Nombre de personnes</label><input id="iSize" type="number" min="1" max="20" value="${Number(x.teamSize)||1}"></div>
      <div><label class="inline"><input id="iVehicle" type="checkbox" ${x.vehicle?'checked':''}> Véhicule nécessaire</label></div>
    </div><div id="teamPicker" class="teamPicker"></div><div class="actionRow"><button type="submit">Enregistrer l’intervention</button>${existing&&this.canPlan()?'<button type="button" id="deleteInt" class="danger">Supprimer</button>':''}</div></form>`);
    this.bindClientChoice('i',x.clientId,x.siteId);this.assistant.bind(document.getElementById('modal'),()=>({kind:'intervention_setup',client:document.getElementById('iClient')?.selectedOptions?.[0]?.textContent||'',title:document.getElementById('iTitle')?.value||''}));
    const fillTeam=()=>{const date=(document.getElementById('iStart').value||'').slice(0,10)||isoDate(new Date());document.getElementById('teamPicker').innerHTML=this.teamPickerHtml(x.teamIds,date,'','','');};
    fillTeam();document.getElementById('iStart').onchange=fillTeam;
    const form=document.getElementById('intForm');
    form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Intervention enregistrée ✓',async()=>{
      const {client:c,site:s}=await this.resolveClientChoice('i');x.clientId=c?.id||'';x.siteId=s?.id||'';x.clientName=c?.name||'';x.siteAddress=s?.address||'';
      x.title=document.getElementById('iTitle').value.trim();x.request=document.getElementById('iRequest').value.trim();x.plannedStart=this.toISO(document.getElementById('iStart').value);x.plannedEnd=this.toISO(document.getElementById('iEnd').value);x.teamSize=Number(document.getElementById('iSize').value)||1;x.vehicle=document.getElementById('iVehicle').checked;x.teamIds=[...document.querySelectorAll('[name=teamPerson]:checked')].map(i=>i.value);x.status=x.plannedStart?'planifiee':'a_planifier';x.updatedAt=new Date().toISOString();
      if(!existing&&!this.data.interventions.some(r=>r.id===x.id))this.data.interventions.push(x);await this.save('interventions');await this.upsertLinkedEvent('intervention',x);
    },async()=>this.renderInterventions());};
    if(existing&&this.canPlan())document.getElementById('deleteInt').onclick=async()=>{if(!confirm(`Supprimer ${x.number} ?`))return;this.data.interventions=this.data.interventions.filter(r=>r.id!==x.id);this.data.events=this.data.events.filter(r=>!(r.kind==='intervention'&&r.linkId===x.id));await Promise.all([this.save('interventions'),this.save('events')]);document.getElementById('modal').close();await this.renderInterventions();this.c.toast('Intervention supprimée.');};
  }
  async openIntervention(id){
    const x=this.data.interventions.find(r=>r.id===id);if(!x)return;const canEdit=this.canPlan()||x.status!=='facturee';
    x.photos=Array.isArray(x.photos)?x.photos:[];x.reportItems=Array.isArray(x.reportItems)?x.reportItems:[];
    this.c.modal(`${x.number} · ${x.clientName||'Intervention'}`,`<div class="detailGrid">
      <div><strong>Adresse</strong><span>${esc(x.siteAddress||'—')}</span></div><div><strong>Planning</strong><span>${esc(x.plannedStart?frDateTime(x.plannedStart):'À planifier')}</span></div>
      <div><strong>Équipe</strong><span>${esc(this.teamNames(x.teamIds))}</span></div><div><strong>Statut</strong><span>${esc(this.interventionStatusLabel(x.status))}</span></div>
      <div><strong>Objet</strong><span>${esc(x.title||x.request||'—')}</span></div><div><strong>Consignes client</strong><span>${esc(x.request||'—')}</span></div>
    </div><hr><div class="languageBar">${this.assistant.languageSelectHtml()}<span>🎙 Parlez en italien ou en français, puis mettez au propre en français.</span></div><form id="finishInt">
      <section class="quickReport"><div class="panelHead"><div><h3>Points de l’intervention</h3><p class="muted">Un point = un sujet traité : prise, éclairage, défaut, matériel à remplacer… Chaque point peut contenir plusieurs photos.</p></div>${canEdit?'<button type="button" id="addIntItem" class="secondary">+ Ajouter un point</button>':''}</div>
        <div id="intItemsList" class="lineItemList">${x.reportItems.length?x.reportItems.map((item,i)=>`<div class="lineItemRow">${this.interventionItemCard(item,i)}${canEdit?`<div class="actionRow"><button type="button" class="secondary" data-edit-int-item="${i}">Modifier</button><button type="button" class="danger" data-delete-int-item="${i}">Supprimer</button></div>`:''}</div>`).join(''):'<p class="muted">Aucun point ajouté pour le moment.</p>'}</div>
      </section>
      <section class="quickReport"><h3>Photos générales</h3><p class="muted">Photos d’ensemble, accès, vue globale ou résultat final. Jusqu’à 6 photos.</p>
        <div class="photoButtons"><label class="fileButton">📷 Prendre une photo<input id="photoCapture" type="file" accept="image/*" capture="environment"></label><label class="fileButton secondaryFile">🖼 Ajouter depuis la galerie<input id="photoGallery" type="file" accept="image/*" multiple></label></div>
        <div id="photoPreview" class="reportPhotos"></div>
      </section>
      <div class="formGrid compactReport">
        <div><label>Arrivée réelle</label><input id="aStart" type="datetime-local" value="${this.localDT(x.actualStart||x.plannedStart)}"></div>
        <div><label>Départ réel</label><input id="aEnd" type="datetime-local" value="${this.localDT(x.actualEnd||x.plannedEnd)}"></div>
        <div><label>Pause (h)</label><input id="aPause" type="number" step="0.25" min="0" value="${x.pauseHours??(x.plannedStart&&x.plannedEnd&&durationHours(x.plannedStart,x.plannedEnd,0)>5?1:0)}"></div>
        <div><label>Devis complémentaire ?</label><select id="aQuote"><option value="non">Non</option><option value="oui">Oui</option></select></div>
        <div class="wide"><label>Résumé de l’intervention</label><textarea id="aWork" ${this.textAssist()} placeholder="Ex. remise en service de l’éclairage, essais effectués, appareil isolé…">${esc(x.workDone||'')}</textarea>${this.assistant.toolsHtml('aWork',{translate:true,rewrite:true})}</div>
        <div class="wide"><label>Observation complémentaire / suite à prévoir</label><textarea id="aNotes" ${this.textAssist()} placeholder="À remplir seulement si nécessaire.">${esc(x.notes||'')}</textarea>${this.assistant.toolsHtml('aNotes',{translate:true,rewrite:true})}</div>
        <div class="wide"><details><summary>Matériel utilisé (facultatif)</summary><textarea id="aMaterial" ${this.textAssist()} placeholder="Références, quantités, matériel fourni…">${esc(x.materials||'')}</textarea></details></div>
      </div>
      <div class="helpCard"><strong>Aide de saisie FR</strong><p>Les zones de texte sont en correction orthographique française pour aider l’équipe. L’assistant IA complet pourra être ajouté plus tard si vous souhaitez le connecter à une API dédiée.</p></div>
      <div class="actionRow">${canEdit?'<button type="submit">Enregistrer le rapport</button>':''}<button type="button" id="downloadIntPdf" class="secondary">Télécharger le PDF</button><button type="button" id="saveIntPdf" class="secondary">Enregistrer PDF dans OPUS</button>${this.canPlan()?'<button type="button" id="editInt" class="secondary">Modifier / planning</button>':''}${this.canPlan()?'<button type="button" id="deleteIntReport" class="danger">Supprimer</button>':''}</div>
    </form>`);
    document.getElementById('aQuote').value=x.needsQuote?'oui':'non';this.bindPhotoInputs(x.photos);this.assistant.bind(document.getElementById('modal'),()=>({kind:'intervention',client:x.clientName,address:x.siteAddress,title:x.title,number:x.number}));
    const dlPdf=document.getElementById('downloadIntPdf');if(dlPdf)dlPdf.onclick=async()=>{dlPdf.disabled=true;try{const blob=await this.interventionPdf(x);this.c.download(blob,this.fileSafe(`${x.number}_RAPPORT_INTERVENTION.pdf`));this.c.toast('PDF téléchargé.');}finally{dlPdf.disabled=false;}};
    const savePdf=document.getElementById('saveIntPdf');if(savePdf)savePdf.onclick=async()=>{savePdf.disabled=true;const old=savePdf.textContent;savePdf.textContent='Enregistrement…';try{const r=await this.saveInterventionPackage(x);this.c.toast(`PDF enregistré dans ${r.folder}`);savePdf.textContent='✓ PDF enregistré';}catch(e){savePdf.textContent=old;throw e;}finally{savePdf.disabled=false;}};
    if(canEdit){
      const addBtn=document.getElementById('addIntItem');if(addBtn)addBtn.onclick=()=>this.editInterventionItem(x.id);
      document.querySelectorAll('[data-edit-int-item]').forEach(b=>b.onclick=()=>this.editInterventionItem(x.id,Number(b.dataset.editIntItem)));
      document.querySelectorAll('[data-delete-int-item]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.deleteIntItem);if(!confirm(`Supprimer le point ${i+1} ?`))return;x.reportItems.splice(i,1);x.updatedAt=new Date().toISOString();await this.save('interventions');this.openIntervention(x.id);});
      const form=document.getElementById('finishInt');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Compte rendu enregistré ✓',async()=>{
        x.actualStart=this.toISO(document.getElementById('aStart').value);x.actualEnd=this.toISO(document.getElementById('aEnd').value);x.pauseHours=Number(document.getElementById('aPause').value)||0;x.workDone=document.getElementById('aWork').value.trim();x.materials=document.getElementById('aMaterial').value.trim();x.notes=document.getElementById('aNotes').value.trim();x.needsQuote=document.getElementById('aQuote').value==='oui'||x.reportItems.some(item=>item.needsQuote);x.status='terminee';x.completedAt=new Date().toISOString();x.updatedAt=new Date().toISOString();await this.save('interventions');try{await this.saveInterventionPackage(x);}catch(e){console.error('PDF auto-save',e);this.c.toast('Rapport enregistré. Le PDF n’a pas pu être archivé automatiquement : utilisez « Enregistrer PDF dans OPUS ».');}
      },async()=>this.renderInterventions());};
    }
    if(this.canPlan())document.getElementById('editInt').onclick=()=>this.editIntervention(x);
    if(this.canPlan())document.getElementById('deleteIntReport').onclick=async()=>{if(!confirm(`Supprimer ${x.number} ?`))return;this.data.interventions=this.data.interventions.filter(r=>r.id!==x.id);this.data.events=this.data.events.filter(r=>!(r.kind==='intervention'&&r.linkId===x.id));await Promise.all([this.save('interventions'),this.save('events')]);document.getElementById('modal').close();await this.renderInterventions();this.c.toast('Intervention supprimée.');};
  }
  async editInterventionItem(interventionId,index=null){
    const x=this.data.interventions.find(r=>r.id===interventionId);if(!x)return;x.reportItems=Array.isArray(x.reportItems)?x.reportItems:[];
    const item=index===null?{id:makeId('ipoint'),issueType:'',location:'',title:'',observation:'',action:'',reference:'',needsQuote:false,photos:[]}:{...x.reportItems[index],photos:Array.isArray(x.reportItems[index]?.photos)?[...x.reportItems[index].photos]:[]};
    this.c.modal(index===null?'Ajouter un point d’intervention':'Modifier le point d’intervention',`<form id="intItemForm"><div class="languageBar">${this.assistant.languageSelectHtml()}<span>Dictée terrain rapide</span></div><div class="formGrid compactReport">
      <div><label>Type</label><select id="iiType"><option value="">— Choisir —</option><option>Éclairage</option><option>Prise de courant</option><option>Tableau électrique</option><option>Recherche de défaut</option><option>VMC</option><option>Portail / accès</option><option>Autre</option></select></div>
      <div><label>Localisation</label><input id="iiLocation" ${this.textAssist()} value="${esc(item.location||'')}" placeholder="Ex. cuisine, couloir, façade, TGBT"></div>
      <div class="wide"><label>Intitulé</label><input id="iiTitle" ${this.textAssist()} value="${esc(item.title||'')}" required placeholder="Ex. éclairage ne fonctionne pas"></div>
      <div class="wide"><label>Constat / observation</label><textarea id="iiObs" ${this.textAssist()} placeholder="Panne constatée, essais, anomalie visible…">${esc(item.observation||'')}</textarea>${this.assistant.toolsHtml('iiObs',{translate:true,rewrite:true})}</div>
      <div class="wide"><label>Action effectuée / à prévoir</label><textarea id="iiAction" ${this.textAssist()} placeholder="Remplacement, remise en conformité, devis à prévoir…">${esc(item.action||'')}</textarea>${this.assistant.toolsHtml('iiAction',{translate:true,rewrite:true})}</div>
      <div class="wide"><label>Référence / matériel</label><input id="iiRef" ${this.textAssist()} value="${esc(item.reference||'')}" placeholder="Référence repérée sur place, matériel proposé, quantités…"></div>
      <div><label>Devis complémentaire ?</label><select id="iiQuote"><option value="non">Non</option><option value="oui">Oui</option></select></div>
    </div>
    <section class="quickReport"><h3>Photos du point</h3><div class="photoButtons"><label class="fileButton">📷 Prendre une photo<input id="itemPhotoCapture" type="file" accept="image/*" capture="environment"></label><label class="fileButton secondaryFile">🖼 Galerie<input id="itemPhotoGallery" type="file" accept="image/*" multiple></label></div><div id="itemPhotoPreview" class="reportPhotos"></div></section>
    <div class="actionRow"><button type="submit">Enregistrer le point</button><button type="button" id="backToInt" class="secondary">Retour à l’intervention</button></div></form>`);
    document.getElementById('iiType').value=item.issueType||'';document.getElementById('iiQuote').value=item.needsQuote?'oui':'non';this.bindPhotoInputs(item.photos,{captureId:'itemPhotoCapture',galleryId:'itemPhotoGallery',previewId:'itemPhotoPreview',maxPhotos:8});this.assistant.bind(document.getElementById('modal'),()=>({kind:'intervention_point',intervention:x.number,client:x.clientName,address:x.siteAddress,issueType:document.getElementById('iiType')?.value||item.issueType,location:document.getElementById('iiLocation')?.value||item.location}));
    document.getElementById('backToInt').onclick=()=>this.openIntervention(interventionId);
    const form=document.getElementById('intItemForm');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Point enregistré ✓',async()=>{
      item.issueType=document.getElementById('iiType').value;item.location=document.getElementById('iiLocation').value.trim();item.title=document.getElementById('iiTitle').value.trim();item.observation=document.getElementById('iiObs').value.trim();item.action=document.getElementById('iiAction').value.trim();item.reference=document.getElementById('iiRef').value.trim();item.needsQuote=document.getElementById('iiQuote').value==='oui';if(index===null)x.reportItems.push(item);else x.reportItems[index]=item;x.updatedAt=new Date().toISOString();await this.save('interventions');
    },async()=>this.openIntervention(interventionId));};
  }

  /* ---------- VISITES / DEVIS ---------- */
  async renderVisits(){
    const root=document.getElementById('visitsPage'),rows=[...this.data.visits].sort((a,b)=>String(a.plannedStart||'9999').localeCompare(String(b.plannedStart||'9999')));
    root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">AVANT DEVIS · DIAGNOSTIC · RELEVÉS</p><h1>Visites / Devis</h1><p class="muted">Client habituel ou nouveau client : la fiche garde les coordonnées, les métrés, les photos et peut ensuite être transformée en chantier.</p></div>${this.canPlan()?'<button id="newVisit">+ Nouvelle visite</button>':''}</div><div class="projectList">${rows.length?rows.map(v=>`<article class="projectCard"><div><div class="chips"><span class="chip">${esc(v.number)}</span><span class="chip">${esc(v.type||'Visite avant devis')}</span><span class="chip ${v.status==='terminee'?'good':''}">${esc(this.visitStatusLabel(v.status))}</span></div><h3>${esc(v.clientName||'Client à compléter')}</h3><p>${esc(v.siteAddress||'Adresse à compléter')}${v.plannedStart?' · '+esc(frDateTime(v.plannedStart)):''}</p><div class="chips">${Array.isArray(v.visitTasks)&&v.visitTasks.length?`<span class="chip">${v.visitTasks.length} tâche(s)</span>`:''}${Array.isArray(v.photos)&&v.photos.length?`<span class="chip">${v.photos.length} photo(s)</span>`:''}</div></div><button data-visit="${esc(v.id)}">Ouvrir →</button></article>`).join(''):'<div class="panel empty">Aucune visite enregistrée.</div>'}</div>`;
    root.querySelectorAll('[data-visit]').forEach(b=>b.onclick=()=>this.openVisit(b.dataset.visit));if(this.canPlan())document.getElementById('newVisit').onclick=()=>this.editVisit();
  }
  async editVisit(existing=null){
    const v=existing||{id:makeId('vis'),number:nextVisitNumber(this.data.visits),type:'Visite avant devis',clientId:'',siteId:'',request:'',phone:'',email:'',plannedStart:'',plannedEnd:'',teamIds:[],status:'a_planifier',visitTasks:[],photos:[],createdAt:new Date().toISOString()};
    this.c.modal(existing?'Modifier la visite':'Nouvelle visite',`<form id="visitForm"><div class="languageBar">${this.assistant.languageSelectHtml()}<span>🎙 Dictée rapide de la demande client.</span></div><div class="formGrid">
      <div><label>N° visite</label><input value="${esc(v.number)}" readonly></div>
      <div><label>Type de visite</label><select id="vType"><option>Visite avant devis</option><option>Dépannage / diagnostic</option><option>Étude technique</option><option>Relevé / métrés</option><option>Visite sur site</option></select></div>
      ${this.clientChoiceHtml('v',v.clientId)}
      <div class="wide"><label>Objet de la demande</label><textarea id="vReq" ${this.textAssist()} placeholder="Ex. création VMC, mise en sécurité, déplacement compteur…">${esc(v.request||'')}</textarea>${this.assistant.toolsHtml('vReq',{translate:true,rewrite:true})}</div>
      <div><label>Début</label><input id="vStart" type="datetime-local" value="${this.localDT(v.plannedStart)}"></div>
      <div><label>Fin</label><input id="vEnd" type="datetime-local" value="${this.localDT(v.plannedEnd)}"></div>
    </div><div class="actionRow"><button type="submit">Enregistrer la visite</button>${existing&&this.canPlan()?'<button type="button" id="deleteVisit" class="danger">Supprimer</button>':''}${existing&&this.c.isAdmin()&&!v.convertedProjectId?'<button type="button" id="convertVisit" class="secondary">Transformer en chantier</button>':''}</div></form>`);
    document.getElementById('vType').value=v.type;this.bindClientChoice('v',v.clientId,v.siteId);this.assistant.bind(document.getElementById('modal'),()=>({kind:'visit_setup',type:document.getElementById('vType')?.value||'',client:document.getElementById('vClient')?.selectedOptions?.[0]?.textContent||''}));
    const form=document.getElementById('visitForm');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Visite enregistrée ✓',async()=>{
      const {client:c,site:s}=await this.resolveClientChoice('v');v.type=document.getElementById('vType').value;v.clientId=c?.id||'';v.siteId=s?.id||'';v.clientName=c?.name||'';v.siteAddress=s?.address||'';v.phone=s?.phone||c?.phone||'';v.email=s?.email||c?.email||'';v.request=document.getElementById('vReq').value.trim();v.plannedStart=this.toISO(document.getElementById('vStart').value);v.plannedEnd=this.toISO(document.getElementById('vEnd').value);v.status=v.plannedStart?'planifiee':'a_planifier';v.updatedAt=new Date().toISOString();if(!existing&&!this.data.visits.some(r=>r.id===v.id))this.data.visits.push(v);await this.save('visits');await this.upsertLinkedEvent('visit',v);
    },async()=>this.renderVisits());};
    if(existing&&this.canPlan())document.getElementById('deleteVisit').onclick=async()=>{if(!confirm(`Supprimer ${v.number} ?`))return;this.data.visits=this.data.visits.filter(r=>r.id!==v.id);this.data.events=this.data.events.filter(r=>!(r.kind==='visit'&&r.linkId===v.id));await Promise.all([this.save('visits'),this.save('events')]);document.getElementById('modal').close();await this.renderVisits();this.c.toast('Visite supprimée.');};
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
        <div><label>Arrivée réelle</label><input id="vActualStart" type="datetime-local" value="${this.localDT(v.actualStart||v.plannedStart)}"></div>
        <div><label>Départ réel</label><input id="vActualEnd" type="datetime-local" value="${this.localDT(v.actualEnd||v.plannedEnd)}"></div>
        <div><label>Pause (h)</label><input id="vPause" type="number" step="0.25" min="0" value="${v.pauseHours??0}"></div>
        <div><label>Devis à établir ?</label><select id="vNeedsQuote"><option value="oui">Oui</option><option value="non">Non</option></select></div>
        <div class="wide"><label>Résumé de la visite</label><textarea id="vSummary" ${this.textAssist()} placeholder="Ex. relevé des pièces, demande du client, contraintes observées…">${esc(v.summary||'')}</textarea>${this.assistant.toolsHtml('vSummary',{translate:true,rewrite:true})}</div>
        <div class="wide"><label>Observations / suites</label><textarea id="vNotes" ${this.textAssist()} placeholder="Informations utiles pour le devis, accès, contraintes, options…">${esc(v.notes||'')}</textarea>${this.assistant.toolsHtml('vNotes',{translate:true,rewrite:true})}</div>
      </div>
      <div class="helpCard"><strong>Aide de saisie FR</strong><p>Correction orthographique française active dans les champs de texte. Si vous voulez, on pourra ajouter ensuite une vraie assistance IA connectée.</p></div>
      <div class="actionRow">${canEdit?'<button type="submit">Enregistrer la fiche visite</button>':''}${this.canPlan()?'<button type="button" id="editVisit" class="secondary">Modifier / planifier</button>':''}${this.canPlan()?'<button type="button" id="deleteVisitReport" class="danger">Supprimer</button>':''}${this.c.isAdmin()&&!v.convertedProjectId?'<button type="button" id="convertVisit" class="secondary">Transformer en chantier</button>':''}</div></form>`);
    document.getElementById('vNeedsQuote').value=v.needsQuote===false?'non':'oui';this.bindPhotoInputs(v.photos,{captureId:'visitPhotoCapture',galleryId:'visitPhotoGallery',previewId:'visitPhotoPreview',maxPhotos:8});this.assistant.bind(document.getElementById('modal'),()=>({kind:'visit',client:v.clientName,address:v.siteAddress,type:v.type,number:v.number}));
    if(canEdit){
      const addTaskBtn=document.getElementById('addVisitTask');if(addTaskBtn)addTaskBtn.onclick=()=>this.editVisitTask(v.id);
      document.querySelectorAll('[data-edit-visit-task]').forEach(b=>b.onclick=()=>this.editVisitTask(v.id,Number(b.dataset.editVisitTask)));
      document.querySelectorAll('[data-delete-visit-task]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.deleteVisitTask);if(!confirm(`Supprimer la tâche ${i+1} ?`))return;v.visitTasks.splice(i,1);v.updatedAt=new Date().toISOString();await this.save('visits');this.openVisit(v.id);});
      const form=document.getElementById('finishVisit');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,'Fiche visite enregistrée ✓',async()=>{
        v.actualStart=this.toISO(document.getElementById('vActualStart').value);v.actualEnd=this.toISO(document.getElementById('vActualEnd').value);v.pauseHours=Number(document.getElementById('vPause').value)||0;v.summary=document.getElementById('vSummary').value.trim();v.notes=document.getElementById('vNotes').value.trim();v.needsQuote=document.getElementById('vNeedsQuote').value==='oui';v.status='terminee';v.completedAt=new Date().toISOString();v.updatedAt=new Date().toISOString();await this.save('visits');
      },async()=>this.renderVisits());};
    }
    if(this.canPlan())document.getElementById('editVisit').onclick=()=>this.editVisit(v);
    if(this.canPlan())document.getElementById('deleteVisitReport').onclick=async()=>{if(!confirm(`Supprimer ${v.number} ?`))return;this.data.visits=this.data.visits.filter(r=>r.id!==v.id);this.data.events=this.data.events.filter(r=>!(r.kind==='visit'&&r.linkId===v.id));await Promise.all([this.save('visits'),this.save('events')]);document.getElementById('modal').close();await this.renderVisits();this.c.toast('Visite supprimée.');};
    if(this.c.isAdmin()&&!v.convertedProjectId)document.getElementById('convertVisit').onclick=async()=>{await this.c.createProjectFromVisit(v);v.convertedProjectId='created';v.status='convertie';await this.save('visits');document.getElementById('modal').close();this.c.toast('Chantier créé dans « À préparer ».');};
  }
  async editVisitTask(visitId,index=null){
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
    const root=document.getElementById('calendarPage'),weekDays=[0,1,2,3,4].map(i=>addDays(this.week,i)),monthLabel=this.monthCursor.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    const weekBody=`<div class="calendarTools"><button id="prevPeriod" class="secondary">←</button><button id="todayPeriod" class="secondary">Cette semaine</button><strong>Semaine du ${frDate(weekDays[0],{day:'2-digit',month:'2-digit',year:'numeric'})}</strong><button id="nextPeriod" class="secondary">→</button></div><div class="weekGrid workWeek">${weekDays.map(d=>this.dayColumn(d)).join('')}</div>`;
    const monthBody=`<div class="calendarTools"><button id="prevPeriod" class="secondary">←</button><button id="todayPeriod" class="secondary">Ce mois</button><strong class="monthTitle">${esc(monthLabel)}</strong><button id="nextPeriod" class="secondary">→</button></div>${this.monthGrid()}`;
    root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">PLANNING PARTAGÉ</p><h1>Calendrier des interventions</h1><p class="muted">Vue calendrier : chantier, intervention ou visite. Les apprentis à l’école et les personnes déjà affectées sont indisponibles automatiquement.</p></div><div class="actionRow">${this.canPlan()?'<button id="planEvent">+ Planifier</button><button id="resourcesBtn" class="secondary">Équipe & ressources</button>':''}</div></div>
      <div class="calendarViewSwitch"><button id="weekView" class="${this.calendarView==='week'?'active':''}">Semaine</button><button id="monthView" class="${this.calendarView==='month'?'active':''}">Mois</button></div>
      ${this.calendarView==='month'?monthBody:weekBody}`;
    document.getElementById('weekView').onclick=()=>{this.calendarView='week';localStorage.setItem('opus-calendar-view','week');this.renderCalendar();};
    document.getElementById('monthView').onclick=()=>{this.calendarView='month';localStorage.setItem('opus-calendar-view','month');this.renderCalendar();};
    document.getElementById('prevPeriod').onclick=()=>{if(this.calendarView==='month')this.monthCursor=new Date(this.monthCursor.getFullYear(),this.monthCursor.getMonth()-1,1);else this.week=addDays(this.week,-7);this.renderCalendar();};
    document.getElementById('nextPeriod').onclick=()=>{if(this.calendarView==='month')this.monthCursor=new Date(this.monthCursor.getFullYear(),this.monthCursor.getMonth()+1,1);else this.week=addDays(this.week,7);this.renderCalendar();};
    document.getElementById('todayPeriod').onclick=()=>{this.week=weekStart();this.monthCursor=new Date();this.renderCalendar();};
    root.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>this.openEvent(b.dataset.event));
    if(this.canPlan()){document.getElementById('planEvent').onclick=()=>this.planEvent();document.getElementById('resourcesBtn').onclick=()=>this.peopleManager();}
  }
  dayColumn(d){
    const date=isoDate(d),events=this.data.events.filter(e=>isoDate(e.start)===date).sort(byStart),avail=this.availability(date);
    return `<section class="dayCol"><header><strong>${esc(frDate(d,{weekday:'long',day:'2-digit',month:'2-digit'}))}</strong><small>${avail.internal} int. · ${avail.external} ext. disponibles</small></header><div class="dayEvents">${events.length?events.map(e=>`<button class="eventCard ${e.kind}" data-event="${esc(e.id)}"><span>${new Date(e.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}–${new Date(e.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span><strong>${esc(this.linkLabel(e)||e.title||eventKindLabel(e.kind))}</strong><small>${esc(this.teamNames(e.teamIds))}</small></button>`).join(''):'<div class="freeSlot">Disponible</div>'}</div></section>`;
  }
  monthGrid(){
    const first=new Date(this.monthCursor.getFullYear(),this.monthCursor.getMonth(),1),start=weekStart(first),days=[...Array(42)].map((_,i)=>addDays(start,i)),current=this.monthCursor.getMonth();
    return `<div class="monthCalendar"><div class="monthWeekdays">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(x=>`<strong>${x}</strong>`).join('')}</div><div class="monthCells">${days.map(d=>{const date=isoDate(d),events=this.data.events.filter(e=>isoDate(e.start)===date).sort(byStart),other=d.getMonth()!==current;return `<section class="monthCell ${other?'otherMonth':''}"><div class="monthDay">${d.getDate()}</div>${events.slice(0,3).map(e=>`<button class="monthEvent ${e.kind}" data-event="${esc(e.id)}" title="${esc(this.linkLabel(e))}"><b>${new Date(e.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</b> ${esc(this.linkLabel(e)||e.title)}</button>`).join('')}${events.length>3?`<small>+ ${events.length-3} autre(s)</small>`:''}</section>`;}).join('')}</div></div>`;
  }
  availability(date){let internal=0,external=0;for(const p of this.data.people){if(personUnavailable(p,date).unavailable)continue;const busy=this.data.events.some(e=>(e.teamIds||[]).includes(p.id)&&isoDate(e.start)===date);if(busy)continue;if(p.type==='external')external++;else internal++;}return {internal,external};}
  teamPickerHtml(selected=[],date=isoDate(new Date()),start='',end='',exclude=''){return `<div class="teamPickerHead"><strong>Composer l’équipe</strong><span>École, absence et personnes déjà affectées sont grisées.</span></div><div class="teamList">${this.data.people.filter(p=>p.active!==false).map(p=>{const u=personUnavailable(p,date),conf=start&&end&&eventConflicts(p.id,date,start,end,this.data.events,exclude);const disabled=u.unavailable||conf;return `<label class="personPick ${disabled?'disabled':''}"><input name="teamPerson" type="checkbox" value="${esc(p.id)}" ${selected.includes(p.id)?'checked':''} ${disabled&&!selected.includes(p.id)?'disabled':''}><span><strong>${esc(p.name)}</strong><small>${p.type==='external'?'Externe':p.role==='apprenti'?'Apprenti':'OPUS'}${p.vehicle?' · véhicule':''}${disabled?' · '+esc(conf?'Déjà affecté':u.label):''}</small></span></label>`;}).join('')}</div>`;}
  async planEvent(existing=null){
    const e=existing||{id:makeId('evt'),kind:'project',linkId:'',title:'',start:'',end:'',teamIds:[],teamSize:2,vehicle:false,pauseHours:1,status:'planifie'};
    let selectedTeamIds=[...(e.teamIds||[])],teamOpen=false;
    const projectOpts=this.c.getCatalog().projects.map(p=>`<option value="project|${esc(p.id)}">Chantier · ${esc(p.name)}</option>`).join(''),intOpts=this.data.interventions.map(x=>`<option value="intervention|${esc(x.id)}">Intervention · ${esc(x.number)} · ${esc(x.clientName)}</option>`).join(''),visOpts=this.data.visits.map(x=>`<option value="visit|${esc(x.id)}">Visite · ${esc(x.number)} · ${esc(x.clientName)}</option>`).join('');
    this.c.modal(existing?'Modifier le planning':'Planifier une intervention',`<form id="eventForm"><div class="formGrid"><div class="wide"><label>Élément à planifier</label><select id="eventLink"><option value="">— Choisir —</option>${projectOpts}${intOpts}${visOpts}</select></div><div><label>Date</label><input id="eventDate" type="date" value="${existing?isoDate(e.start):isoDate(new Date())}"></div><div><label>Personnes nécessaires</label><input id="eventSize" type="number" min="1" max="20" value="${Number(e.teamSize)||2}"></div><div><label>Début</label><input id="eventStart" type="time" value="${existing?new Date(e.start).toTimeString().slice(0,5):'08:00'}"></div><div><label>Fin</label><input id="eventEnd" type="time" value="${existing?new Date(e.end).toTimeString().slice(0,5):'17:00'}"></div><div><label>Pause prévue (h)</label><input id="eventPause" type="number" min="0" step="0.25" value="${Number(e.pauseHours)||0}"></div><div><label class="inline"><input id="eventVehicle" type="checkbox" ${e.vehicle?'checked':''}> Véhicule nécessaire</label></div>${existing?`<div><label>Début réel (facultatif)</label><input id="eventActualStart" type="time" value="${e.actualStart?new Date(e.actualStart).toTimeString().slice(0,5):''}"></div><div><label>Fin réelle (facultatif)</label><input id="eventActualEnd" type="time" value="${e.actualEnd?new Date(e.actualEnd).toTimeString().slice(0,5):''}"></div><div><label>Pause réelle (h)</label><input id="eventActualPause" type="number" min="0" step="0.25" value="${e.actualPauseHours??e.pauseHours??0}"></div>`:''}${this.c.isAdmin()?'<div class="wide"><label class="inline"><input id="projectReady" type="checkbox"> Dossier chantier prêt — passer « À préparer » vers « En cours »</label></div>':''}</div>
      <section class="teamAssignBox"><div><strong>Équipe</strong><p id="teamSummary" class="muted">${esc(this.teamNames(selectedTeamIds))}</p></div><button type="button" id="toggleTeam" class="secondary">${selectedTeamIds.length?'Modifier l’équipe':'Choisir l’équipe'}</button></section>
      <div id="eventTeam" hidden></div>
      <div class="actionRow"><button type="submit">${existing?'Enregistrer les modifications':'Enregistrer au calendrier'}</button>${existing?'<button type="button" id="deleteEvent" class="danger">Supprimer du planning</button>':''}</div></form>`);
    if(existing)document.getElementById('eventLink').value=e.kind+'|'+e.linkId;
    const syncSelected=()=>{selectedTeamIds=[...document.querySelectorAll('#eventTeam [name=teamPerson]:checked')].map(i=>i.value);document.getElementById('teamSummary').textContent=this.teamNames(selectedTeamIds);document.getElementById('toggleTeam').textContent=selectedTeamIds.length?'Modifier l’équipe':'Choisir l’équipe';};
    const redraw=()=>{if(!teamOpen)return;const date=document.getElementById('eventDate').value,start=document.getElementById('eventStart').value,end=document.getElementById('eventEnd').value;const team=document.getElementById('eventTeam');team.innerHTML=this.teamPickerHtml(selectedTeamIds,date,start,end,e.id);team.querySelectorAll('[name=teamPerson]').forEach(cb=>cb.onchange=syncSelected);};
    document.getElementById('toggleTeam').onclick=()=>{teamOpen=!teamOpen;document.getElementById('eventTeam').hidden=!teamOpen;if(teamOpen)redraw();};
    ['eventDate','eventStart','eventEnd'].forEach(id=>document.getElementById(id).onchange=redraw);
    const form=document.getElementById('eventForm');form.onsubmit=async ev=>{ev.preventDefault();await this.saveWithFeedback(form,existing?'Planning modifié ✓':'Planning enregistré ✓',async()=>{
      const [kind,linkId]=(document.getElementById('eventLink').value||'|').split('|');if(!kind||!linkId)throw new Error('Choisissez un chantier, une intervention ou une visite.');
      const date=document.getElementById('eventDate').value,start=document.getElementById('eventStart').value,end=document.getElementById('eventEnd').value;if(!date||!start||!end)throw new Error('Indiquez la date et les horaires.');
      e.kind=kind;e.linkId=linkId;e.start=new Date(`${date}T${start}`).toISOString();e.end=new Date(`${date}T${end}`).toISOString();e.teamSize=Number(document.getElementById('eventSize').value)||1;e.pauseHours=Number(document.getElementById('eventPause').value)||0;e.vehicle=document.getElementById('eventVehicle').checked;e.teamIds=[...selectedTeamIds];
      if(existing){const as=document.getElementById('eventActualStart')?.value,ae=document.getElementById('eventActualEnd')?.value;e.actualStart=as?new Date(`${date}T${as}`).toISOString():'';e.actualEnd=ae?new Date(`${date}T${ae}`).toISOString():'';e.actualPauseHours=Number(document.getElementById('eventActualPause')?.value)||0;}
      e.laborHours=durationHours(e.start,e.end,e.pauseHours)*(Number(e.teamSize)||1);e.title=this.linkLabel(e);if(!existing&&!this.data.events.some(x=>x.id===e.id))this.data.events.push(e);await this.save('events');await this.syncEntityFromEvent(e);if(kind==='project'&&this.c.isAdmin()&&document.getElementById('projectReady')?.checked)await this.c.moveProjectToInProgress(linkId);
    },async()=>{await this.reload();await this.renderCalendar();});};
    if(existing)document.getElementById('deleteEvent').onclick=async()=>{if(!confirm('Retirer cette intervention du planning ?'))return;this.data.events=this.data.events.filter(x=>x.id!==e.id);await this.save('events');document.getElementById('modal').close();await this.renderCalendar();this.c.toast('Intervention retirée du planning.');};
  }
  async openEvent(id){const e=this.data.events.find(x=>x.id===id);if(!e)return;if(this.canPlan())return this.planEvent(e);if(e.kind==='project')return this.c.openProject(e.linkId);if(e.kind==='intervention')return this.openIntervention(e.linkId);return this.openVisit(e.linkId);}
  async upsertLinkedEvent(kind,x){if(!x.plannedStart||!x.plannedEnd)return;let e=this.data.events.find(e=>e.kind===kind&&e.linkId===x.id);if(!e){e={id:makeId('evt'),kind,linkId:x.id,teamIds:x.teamIds||[],teamSize:x.teamSize||1,vehicle:x.vehicle||false,pauseHours:x.pauseHours??(durationHours(x.plannedStart,x.plannedEnd,0)>5?1:0),status:'planifie'};this.data.events.push(e);}e.start=x.plannedStart;e.end=x.plannedEnd;e.teamIds=x.teamIds||e.teamIds||[];e.title=kind==='intervention'?`${x.number} · ${x.clientName}`:`${x.number} · ${x.clientName}`;await this.save('events');}
  async syncEntityFromEvent(e){if(e.kind==='intervention'){const x=this.data.interventions.find(x=>x.id===e.linkId);if(x){x.plannedStart=e.start;x.plannedEnd=e.end;x.teamIds=e.teamIds;x.teamSize=e.teamSize;x.vehicle=e.vehicle;x.status='planifiee';await this.save('interventions');}}if(e.kind==='visit'){const x=this.data.visits.find(x=>x.id===e.linkId);if(x){x.plannedStart=e.start;x.plannedEnd=e.end;x.teamIds=e.teamIds;x.status='planifiee';await this.save('visits');}}}

  /* ---------- BUREAU ADMIN ---------- */
  async renderOffice(){const root=document.getElementById('officePage'),bill=this.data.interventions.filter(x=>x.status==='terminee');root.innerHTML=`<div class="pageHeading"><div><p class="eyebrow">ESPACE GÉRANT · NON VISIBLE DES TECHNICIENS</p><h1>Bureau OPUS</h1><p class="muted">Facturation, clients, personnel et export mensuel des heures.</p></div></div><div class="adminGrid"><section class="panel"><div class="panelHead"><h2>À facturer <span class="countBadge">${bill.length}</span></h2></div><div id="billingList">${bill.length?bill.map(x=>`<div class="row"><div><h3>${esc(x.number)} · ${esc(x.clientName)}</h3><p>${esc(x.workDone||x.title)} · ${esc(durationHours(x.actualStart||x.plannedStart,x.actualEnd||x.plannedEnd,x.pauseHours).toFixed(2))} h</p></div><button data-bill="${esc(x.id)}">Marquer facturé</button></div>`).join(''):'<p class="muted">Aucune intervention terminée en attente de facturation.</p>'}</div></section><section class="panel"><div class="panelHead"><h2>Paie / heures</h2></div><label>Mois</label><input id="payMonth" type="month" value="${new Date().toISOString().slice(0,7)}"><div class="actionRow"><button id="exportPayroll">Exporter le tableau des heures (Excel/CSV)</button></div><p class="muted">Base OPUS : 39 h/semaine — lundi à jeudi 8h–17h avec 1h de pause, vendredi 8h–16h avec 1h de pause. Apprentis : 35 h/semaine, vendredi jusqu’à 11h. Les semaines d’école sont intégrées.</p></section><section class="panel"><div class="panelHead"><h2>Clients & sites</h2><div class="actionRow compactActions"><button id="importClients" class="secondary">Importer la base clients</button><button id="addClient">+ Client</button></div></div><p class="muted"><strong>${this.data.clients.length}</strong> client(s) dans la base privée Microsoft 365.</p><div id="clientList"></div></section><section class="panel"><div class="panelHead"><h2>Personnel & prestataires</h2><button id="managePeople">Gérer</button></div><div id="peopleSummary"></div></section><section class="panel"><h2>Connecteurs</h2><p><strong>Rexel</strong> — à venir : rapprochement des commandes par numéro d’affaire et dépôt automatique du bon de commande dans le chantier.</p><p><strong>ENEDIS / NDIS</strong> — à venir : constitution guidée du dossier complet.</p></section></div>`;root.querySelectorAll('[data-bill]').forEach(b=>b.onclick=()=>this.markBilled(b.dataset.bill));document.getElementById('exportPayroll').onclick=()=>this.exportPayroll(document.getElementById('payMonth').value);document.getElementById('addClient').onclick=()=>this.editClient();document.getElementById('importClients').onclick=()=>this.importClients();document.getElementById('managePeople').onclick=()=>this.peopleManager();this.renderClientList();this.renderPeopleSummary();}
  async markBilled(id){const x=this.data.interventions.find(x=>x.id===id);if(!x)return;const n=prompt('Numéro de facture (facultatif) :','');x.status='facturee';x.invoiceNumber=n||'';x.invoicedAt=new Date().toISOString();await this.save('interventions');await this.renderOffice();}
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
  peopleManager(){const externalOnly=this.role()==='manager';this.c.modal('Équipe & ressources',`<p class="muted">${externalOnly?'Vous pouvez ajouter ou modifier les prestataires externes et composer les équipes. Le personnel OPUS permanent est géré par le bureau.':'Gérez le personnel OPUS, les apprentis, les semaines d’école, les absences et les prestataires externes.'}</p><div class="actionRow"><button id="addExternal">+ Prestataire externe</button>${!externalOnly?'<button id="addInternal" class="secondary">+ Personnel OPUS</button>':''}</div><div id="peopleList"></div>`);const draw=()=>{document.getElementById('peopleList').innerHTML=this.data.people.filter(p=>!externalOnly||p.type==='external').map(p=>`<div class="row"><div><h3>${esc(p.name)}</h3><p>${p.type==='external'?'Prestataire externe':p.role==='apprenti'?'Apprenti · '+p.weeklyTarget+' h'+((p.schoolDates?.length||p.schoolPeriods?.length)?' · calendrier école intégré':''):'Personnel OPUS · '+p.weeklyTarget+' h'}${p.vehicle?' · véhicule':''}${p.type==='external'&&p.availableFrom?' · '+frDate(p.availableFrom)+' → '+frDate(p.availableTo):''}</p></div><button class="secondary" data-person="${esc(p.id)}">Modifier</button></div>`).join('')||'<p class="muted">Aucune personne enregistrée.</p>';document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>this.editPerson(this.personById(b.dataset.person),draw,externalOnly));};draw();document.getElementById('addExternal').onclick=()=>this.editPerson(null,draw,true);if(!externalOnly)document.getElementById('addInternal').onclick=()=>this.editPerson(null,draw,false);}
  editPerson(existing,redraw,forceExternal=false){const p=existing||{id:makeId('pers'),name:'',email:'',type:forceExternal?'external':'internal',role:forceExternal?'prestataire':'technicien',weeklyTarget:forceExternal?0:39,vehicle:false,active:true,availableFrom:'',availableTo:'',reservedProjectId:'',schoolPeriods:[],absences:[]};this.c.modal(existing?'Modifier la ressource':p.type==='external'?'Nouveau prestataire':'Nouveau salarié',`<form id="personForm"><div class="formGrid"><div><label>Nom</label><input id="pName" value="${esc(p.name)}" required></div><div><label>Type</label><select id="pType" ${forceExternal?'disabled':''}><option value="internal">Personnel OPUS</option><option value="external">Prestataire externe</option></select></div><div><label>Fonction</label><select id="pRole"><option value="technicien">Technicien</option><option value="apprenti">Apprenti</option><option value="prestataire">Prestataire</option></select></div><div><label>Base hebdomadaire</label><input id="pHours" type="number" min="0" value="${p.weeklyTarget??39}"></div><div><label class="inline"><input id="pVehicle" type="checkbox" ${p.vehicle?'checked':''}> Dispose d’un véhicule</label></div><div><label class="inline"><input id="pActive" type="checkbox" ${p.active!==false?'checked':''}> Actif</label></div><div><label>Disponible du</label><input id="pFrom" type="date" value="${p.availableFrom||''}"></div><div><label>au</label><input id="pTo" type="date" value="${p.availableTo||''}"></div></div><hr><div class="grid2"><div><div class="panelHead"><h3>École</h3><button type="button" id="addSchool" class="secondary">+ Période</button></div><div id="schoolRows"></div></div><div><div class="panelHead"><h3>Absences / congés</h3><button type="button" id="addAbs" class="secondary">+ Période</button></div><div id="absRows"></div></div></div><button type="submit">Enregistrer</button></form>`);document.getElementById('pType').value=p.type;document.getElementById('pRole').value=p.role;const drawPeriods=()=>{document.getElementById('schoolRows').innerHTML=(p.schoolPeriods||[]).map((x,i)=>`<div class="periodRow"><input type="date" data-school="start" data-i="${i}" value="${x.start||''}"><input type="date" data-school="end" data-i="${i}" value="${x.end||''}"></div>`).join('')||'<p class="muted">Aucune période école.</p>';document.getElementById('absRows').innerHTML=(p.absences||[]).map((x,i)=>`<div class="periodRow"><input type="date" data-abs="start" data-i="${i}" value="${x.start||''}"><input type="date" data-abs="end" data-i="${i}" value="${x.end||''}"></div>`).join('')||'<p class="muted">Aucune absence.</p>';document.querySelectorAll('[data-school]').forEach(i=>i.oninput=()=>p.schoolPeriods[Number(i.dataset.i)][i.dataset.school]=i.value);document.querySelectorAll('[data-abs]').forEach(i=>i.oninput=()=>p.absences[Number(i.dataset.i)][i.dataset.abs]=i.value);};drawPeriods();document.getElementById('addSchool').onclick=()=>{p.schoolPeriods.push({start:'',end:'',label:'École'});drawPeriods();};document.getElementById('addAbs').onclick=()=>{p.absences.push({start:'',end:'',label:'Absent'});drawPeriods();};document.getElementById('personForm').onsubmit=async e=>{e.preventDefault();p.name=document.getElementById('pName').value.trim();p.type=forceExternal?'external':document.getElementById('pType').value;p.role=p.type==='external'?'prestataire':document.getElementById('pRole').value;p.weeklyTarget=Number(document.getElementById('pHours').value)||0;p.vehicle=document.getElementById('pVehicle').checked;p.active=document.getElementById('pActive').checked;p.availableFrom=document.getElementById('pFrom').value;p.availableTo=document.getElementById('pTo').value;if(!existing)this.data.people.push(p);await this.save('people');document.getElementById('modal').close();this.peopleManager();};}
  exportPayroll(month){if(!/^\d{4}-\d{2}$/.test(month))return;const [y,m]=month.split('-').map(Number),start=new Date(y,m-1,1),end=new Date(y,m,0);const rows=[['Technicien','Date','Jour','Type','Référence','Client / chantier','Début','Fin','Pause h','Heures','Source','Semaine','Base hebdo','Heures semaine','Heures sup semaine']];for(const p of this.data.people.filter(p=>p.type==='internal'&&p.active!==false)){const weekTotals=new Map(),detail=[];for(let d=new Date(start);d<=end;d=addDays(d,1)){const date=isoDate(d);const school=isSchoolDay(p,date);if(school){const h=standardDayHours(p,date);if(h)detail.push({date,type:'École',ref:'',label:'Centre de formation',start:'',end:'',pause:0,h,source:'École'});}for(const e of this.data.events.filter(e=>(e.teamIds||[]).includes(p.id)&&isoDate(e.start)===date)){let a=e.actualStart||e.start,b=e.actualEnd||e.end,pause=e.actualStart&&e.actualEnd?(Number(e.actualPauseHours)||0):(Number(e.pauseHours)||0),source=e.actualStart&&e.actualEnd?'Réalisé':'Planifié';if(e.kind==='intervention'){const x=this.data.interventions.find(x=>x.id===e.linkId);if(x?.actualStart&&x?.actualEnd){a=x.actualStart;b=x.actualEnd;pause=Number(x.pauseHours)||0;source='Réalisé';}}detail.push({date,type:eventKindLabel(e.kind),ref:this.linkLabel(e),label:e.title||this.linkLabel(e),start:new Date(a).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),end:new Date(b).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),pause,h:durationHours(a,b,pause),source});}}
      for(const r of detail){const ws=isoDate(weekStart(r.date));weekTotals.set(ws,(weekTotals.get(ws)||0)+r.h);}for(const r of detail){const ws=isoDate(weekStart(r.date)),tot=weekTotals.get(ws)||0,target=Number(p.weeklyTarget)||39,ot=Math.max(0,tot-target);rows.push([p.name,r.date,new Date(r.date).toLocaleDateString('fr-FR',{weekday:'long'}),r.type,r.ref,r.label,r.start,r.end,String(r.pause).replace('.',','),r.h.toFixed(2).replace('.',','),r.source,ws,target,tot.toFixed(2).replace('.',','),ot.toFixed(2).replace('.',',')]);}}
    const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\r\n');this.c.download(new Blob([csv],{type:'text/csv;charset=utf-8'}),`OPUS_HEURES_${month}.csv`);this.c.toast('Tableau des heures exporté. Excel peut l’ouvrir directement.');}

  async moveProjectCategoryIfReady(projectId){return projectId;}
  localDT(v){if(!v)return '';const d=new Date(v),off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);}
  toISO(v){return v?new Date(v).toISOString():'';}
}
