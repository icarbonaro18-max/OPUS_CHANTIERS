import {officeReports,completedRecord} from './work-records.js';
import {setReportDeleted} from './report-trash.js';
import {REPORT_TYPES} from './project-report-details.js';
import {frDateTime} from './ops.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const labels={project:'Chantier',intervention:'Intervention indépendante',visit:'Visite / devis'};
const pageSize=10;

export function openOfficeReports(ui){
 if(!ui.c.isAdmin())return;
 const state=ui.officeReportState||={query:'',kind:'',status:'',trash:false,page:0};
 ui.c.modal('Comptes rendus',`<div class="officeReportBrowser"><div class="formGrid"><label>Rechercher<input type="search" id="officeReportSearch" placeholder="Affaire, client, numéro…"></label><label>Type<select id="officeReportType"><option value="">Tous</option><option value="project">Chantiers</option><option value="intervention">Interventions indépendantes</option><option value="visit">Visites / devis</option></select></label><label>État<select id="officeReportState"><option value="">Tous</option><option value="saved">Enregistrés</option><option value="draft">Brouillons</option></select></label></div><div class="actionRow"><button type="button" id="officeReportTrash"></button><button type="button" id="closeOfficeReports">Retour au Bureau</button></div><p id="officeReportNotice" role="status" aria-live="polite"></p><p id="officeReportCount" role="status"></p><div id="officeReportList"></div><div class="actionRow"><button type="button" id="officeReportsPrev">Précédents</button><span id="officeReportsPage"></span><button type="button" id="officeReportsNext">Suivants</button></div></div>`);
 const root=document.querySelector('.officeReportBrowser');
 const run=async action=>{try{await action();}catch(e){const notice=root.querySelector('#officeReportNotice');notice.textContent='Action non terminée : '+e.message;ui.c.toast(notice.textContent);}};
 const draw=()=>{
  const all=officeReports(ui.data,{trash:state.trash});
  const rows=all.filter(({kind,record:r})=>(!state.kind||state.kind===kind)&&(!state.status||(!!r.pdfSavedAt||completedRecord(r))===(state.status==='saved'))&&norm([r.projectName,r.number,r.devis,r.clientName,r.title,r.siteAddress].join(' ')).includes(norm(state.query)));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));state.page=Math.max(0,Math.min(state.page,pages-1));const visible=rows.slice(state.page*pageSize,(state.page+1)*pageSize);
  root.querySelector('#officeReportCount').textContent=rows.length+' compte(s) rendu(s)'+(state.trash?' dans la corbeille':'');
  root.querySelector('#officeReportTrash').textContent=state.trash?'Rapports actifs':'Corbeille';
  root.querySelector('#officeReportsPage').textContent=(state.page+1)+' / '+pages;
  root.querySelector('#officeReportsPrev').disabled=state.page===0;root.querySelector('#officeReportsNext').disabled=state.page+1>=pages;
  const list=root.querySelector('#officeReportList');list.innerHTML=visible.map(({kind,record:r},i)=>`<article class="row officeReportRow"><div><button type="button" class="documentLink" data-open-report="${i}">${esc(r.projectName||r.clientName||r.title||'Compte rendu')} · ${esc(r.number)}</button><p>${labels[kind]}${kind==='project'?' · '+esc(REPORT_TYPES[r.reportKind]||'Compte rendu'):''} · ${r.pdfSavedAt?'PDF enregistré':completedRecord(r)?'Enregistré · PDF à vérifier':'Brouillon'}</p><p>${esc(frDateTime(r.actualStart||r.plannedStart||r.createdAt))}</p></div><div class="actionRow">${r.pdfFileId?`<button type="button" data-open-report-pdf="${i}">Consulter</button>`:''}${!state.trash?`<button type="button" data-edit-report="${i}">Modifier</button>`:''}<button type="button" class="${state.trash?'secondary':'danger'}" data-delete-report="${i}">${state.trash?'Restaurer':'Supprimer'}</button></div></article>`).join('')||'<p>Aucun compte rendu correspondant.</p>';
  const edit=({kind,record:r})=>kind==='visit'?ui.openVisit(r.id):ui.openIntervention(r.id);
  const view=entry=>entry.record.pdfFileId?ui.c.openAlertDocument({id:entry.record.pdfFileId,name:entry.record.pdfName||entry.record.number+'.pdf'}):edit(entry);
  list.querySelectorAll('[data-open-report]').forEach(b=>b.onclick=()=>run(()=>view(visible[+b.dataset.openReport])));
  list.querySelectorAll('[data-open-report-pdf]').forEach(b=>b.onclick=()=>run(()=>view(visible[+b.dataset.openReportPdf])));
  list.querySelectorAll('[data-edit-report]').forEach(b=>b.onclick=()=>run(()=>edit(visible[+b.dataset.editReport])));
  list.querySelectorAll('[data-delete-report]').forEach(b=>b.onclick=async()=>{
   if(b.disabled)return;const {kind,record:r}=visible[+b.dataset.deleteReport];
   if(!state.trash&&!confirm('Mettre le compte rendu '+(r.number||'')+' dans la corbeille ? Vous pourrez le restaurer.'))return;
   b.disabled=true;await run(async()=>{await setReportDeleted(ui,r,!state.trash,kind==='visit'?'visits':'interventions');root.querySelector('#officeReportNotice').textContent=state.trash?'Compte rendu restauré.':'Compte rendu placé dans la corbeille.';draw();await ui.renderOffice();});b.disabled=false;
  });
 };
 for(const [id,key,event] of [['officeReportSearch','query','oninput'],['officeReportType','kind','onchange'],['officeReportState','status','onchange']]){const field=root.querySelector('#'+id);field.value=state[key];field[event]=()=>{state[key]=field.value;state.page=0;draw();};}
 root.querySelector('#officeReportTrash').onclick=()=>{state.trash=!state.trash;state.page=0;draw();};
 root.querySelector('#officeReportsPrev').onclick=()=>{state.page--;draw();};root.querySelector('#officeReportsNext').onclick=()=>{state.page++;draw();};
 root.querySelector('#closeOfficeReports').onclick=()=>document.getElementById('modal')?.close?.();draw();
}

export function reportOfficeReturn(ui,form){
 if(ui.section!=='office'||!ui.c.isAdmin()||!form)return;
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='← Tous les comptes rendus';button.id='backOfficeReports';button.onclick=()=>openOfficeReports(ui);form.before(button);
}
