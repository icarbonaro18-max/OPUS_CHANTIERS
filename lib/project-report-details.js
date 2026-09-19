import {materialText} from './material-request.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const REPORT_TYPES={'journee':'Suivi de chantier / journée','intervention':'Fin d’intervention — à contrôler','chantier':'Fin de chantier — à contrôler'};
export function projectReportFields(x){
 if(!x.projectId)return '';
 return `<section class="quickReport projectReportSummary"><h3>Compte rendu au bureau</h3><label>Type de compte rendu</label><select id="prKind">${Object.entries(REPORT_TYPES).map(([k,v])=>`<option value="${k}" ${(x.reportKind||'journee')===k?'selected':''}>${v}</option>`).join('')}</select><p>Un compte rendu par passage ou journée. La fin de journée ne clôture pas le chantier. L’enregistrement d’une fin de chantier fait passer le dossier à contrôler par le bureau.</p><label>Avancement / ce qu’il reste à faire</label><textarea id="prProgress" placeholder="Travaux terminés, essais, réserves, prochaine étape…">${esc(x.progressNotes||'')}</textarea><label>Matériel complémentaire à prévoir</label><textarea id="prMaterial" placeholder="Ex. demain : 4 prises, 20 m de câble 3G2,5 — préciser références et quantités.">${esc(x.materialNeeded||'')}</textarea><label>Matériel nécessaire pour le</label><input id="prNeededOn" type="date" value="${esc(x.materialNeededOn||'')}"><p>Le besoin sera visible dans le compte rendu et les Nouveautés du bureau. Cela ne passe pas automatiquement une commande.</p></section>`;
}
export function captureProjectReport(x,read){
 if(!x.projectId)return;
 const kind=read('prKind');x.reportKind=Object.hasOwn(REPORT_TYPES,kind)?kind:'journee';
 x.progressNotes=read('prProgress').trim();x.materialNeeded=read('prMaterial').trim();x.materialNeededOn=read('prNeededOn');
}
export function projectReportAlerts(rows){
 return rows.filter(x=>x.projectId&&x.reportSubmittedAt&&['terminee','facturee'].includes(x.status)).map(x=>({
  id:'report:'+x.id,reportId:x.id,title:(REPORT_TYPES[x.reportKind]||'Compte rendu chantier')+' · '+(x.projectName||x.number),
  detail:[`Par ${x.reportSubmittedBy||x.createdBy||'l’équipe'}`,x.workDone,x.progressNotes,x.notes,materialText(x.requestMaterials),x.materialNeeded?'MATÉRIEL À PRÉVOIR'+(x.materialNeededOn?' pour le '+x.materialNeededOn:'')+' : '+x.materialNeeded:'',`${(x.photos||[]).length} photo(s) générale(s)`].filter(Boolean).join('\n'),
  modified:x.reportSubmittedAt,date:x.actualEnd||'',dateLabel:'Compte rendu du'
 }));
}
