import {isoDate,addDays,isWithin,standardDayHours,durationHours,isSchoolDay,eventKindLabel} from './ops.js?v=3.4.2';
export const ABSENCE_TYPES={conge:'Congés payés',maladie:'Maladie',sans_solde:'Congé sans solde',autre:'Autre absence'};
export const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&new Date(s+'T12:00:00').toISOString().slice(0,10)===s;
export function validatePeriods(periods){for(const p of periods)if(!validDate(p.start)||!validDate(p.end)||p.end<p.start)throw new Error('Chaque période doit avoir une date de début et de fin valides, dans cet ordre.');}
export function closureAt(closures,date){return (closures||[]).find(p=>p.start&&p.end&&isWithin(date,p.start,p.end));}
export function absenceAt(person,date){return (person.absences||[]).filter(p=>p.start&&p.end&&isWithin(date,p.start,p.end));}
export function absenceLabel(a){return ABSENCE_TYPES[a.type]||a.label||'Absence à qualifier';}
export function blockedAssignments(data,date,teamIds=[]){const closure=closureAt(data.closures,date);if(closure)return ['Entreprise fermée : '+(closure.label||'Fermeture')];return teamIds.flatMap(id=>{const p=data.people.find(p=>p.id===id);if(!p)return ['Ressource inconnue'];if(p.active===false)return [p.name+' : inactif'];const a=absenceAt(p,date);if(a.length)return [p.name+' : '+a.map(absenceLabel).join(', ')];if(isSchoolDay(p,date))return [p.name+' : école'];return [];});}
export function payrollRows(data,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choisissez un mois valide.');
 const [y,m]=month.split('-').map(Number),last=new Date(y,m,0,23,59,59),rows=[],seenActual=new Set();
 // Calendar facts only. Leave payroll treatment, leave-day counting and overtime to payroll.
 for(const p of data.people.filter(p=>p.type!=='external'))for(let d=new Date(y,m-1,1,12);d<=last;d=addDays(d,1)){
  const date=isoDate(d),dayHours=standardDayHours(p,date),absences=absenceAt(p,date),closed=closureAt(data.closures,date),school=isSchoolDay(p,date);
  const push=(values)=>rows.push({person:p.name,employeeCode:p.employeeCode||'',date,actual:0,planned:0,absenceHours:0,type:'',ref:'',label:'',alert:'',...values});
  const events=data.events.filter(e=>e.status!=='annulee'&&(e.teamIds||[]).includes(p.id)&&isoDate(e.start)===date);
  const linked=new Set(events.map(e=>e.kind+'|'+e.linkId));
  const extra=[];for(const [kind,list] of [['intervention',data.interventions],['visit',data.visits]])for(const x of list||[])if((x.teamIds||[]).includes(p.id)&&x.actualStart&&x.actualEnd&&isoDate(x.actualStart)===date&&!linked.has(kind+'|'+x.id))extra.push({kind,linkId:x.id,title:x.number,start:x.actualStart,end:x.actualEnd});
  let actual=0;
  for(const e of [...events,...extra]){
   const x=(e.kind==='intervention'?data.interventions:e.kind==='visit'?data.visits:[])?.find(x=>x.id===e.linkId);
   if(x?.status==='annulee')continue;
   const actualKey=p.id+'|'+e.kind+'|'+e.linkId+'|'+date;const entityActual=x?.actualStart&&x?.actualEnd&&isoDate(x.actualStart)===date&&!seenActual.has(actualKey);const actualPair=entityActual?[x.actualStart,x.actualEnd,x.pauseHours]:!x?.actualStart&&e.actualStart&&e.actualEnd&&isoDate(e.actualStart)===date?[e.actualStart,e.actualEnd,e.actualPauseHours]:null;if(entityActual)seenActual.add(actualKey);
   const h=actualPair?durationHours(...actualPair):0;actual+=h;
   push({type:eventKindLabel(e.kind),ref:x?.number||e.linkId,label:x?.clientName||e.title||'',actual:h,planned:durationHours(e.start,e.end,e.pauseHours),alert:absences.length||closed||school?'Chevauchement avec indisponibilité : à vérifier':actualPair?'':'Horaires réels non renseignés'});
  }
  if(absences.length)push({type:absences.map(absenceLabel).join(' / '),absenceHours:dayHours,label:absences.map(a=>a.start+' → '+a.end).join(' ; '),alert:absences.length>1?'Absences superposées : à vérifier':closed?'Pendant fermeture : ne pas compter deux fois':''});
  if(closed&&(p.active!==false||absences.length||events.length))push({type:'Fermeture entreprise',label:closed.label||'Fermeture',alert:'Motif de paie individuel à confirmer ; aucune imputation automatique en congés'});
  if(school&&!absences.length&&!closed)push({type:'École',planned:dayHours,label:'Centre de formation',alert:'Présence à confirmer'});
  if(p.active!==false&&dayHours&&!actual&&!absences.length&&!closed&&!school&&!events.length&&!extra.length)push({type:'À compléter',alert:'Aucun horaire réel ni absence renseignée'});
 }
 return rows;
}
export function payrollCsv(data,month){const cols=[['person','Salarié'],['employeeCode','Matricule'],['date','Date'],['type','Nature'],['ref','Référence'],['label','Client / détail'],['actual','Heures réalisées déclarées'],['planned','Heures planifiées (non validées)'],['absenceHours','Horaire théorique concerné par absence (h)'],['alert','Contrôle bureau / paie']];const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';return '\ufeff'+[cols.map(c=>c[1]),...payrollRows(data,month).map(r=>cols.map(([k])=>typeof r[k]==='number'?r[k].toFixed(2).replace('.',','):r[k]))].map(r=>r.map(cell).join(';')).join('\r\n');}
