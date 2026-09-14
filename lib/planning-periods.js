import {plannedTotal} from './person-planning.js';
import {isoDate,makeId,durationHours} from './ops.js';
export function periodDays(from,to,weekends=false){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from)throw Error('Vérifiez les dates de début et de fin de période.');
 const d=new Date(from+'T12:00:00'),end=new Date(to+'T12:00:00'),days=[];if(isoDate(d)!==from||isoDate(end)!==to)throw Error('Date invalide.');
 for(let n=0;d<=end;n++,d.setDate(d.getDate()+1)){if(n>366)throw Error('Limitez chaque période à un an.');if(from===to||weekends||![0,6].includes(d.getDay()))days.push(isoDate(d));}if(!days.length)throw Error('Aucun jour ouvré : cochez les week-ends si nécessaire.');return days;
}
export async function savePeriods(ui,base,periods){
 if(!ui.canPlan())throw Error('Planification non autorisée.');if(base.kind!=='project')throw Error('Les périodes multiples sont réservées aux chantiers.');
 const before=ui.data.events,staged=[],seriesId=makeId('period');
 try{ui.data.events=[...before];for(const p of periods){const days=periodDays(p.from,p.to,p.weekends);if(!p.start||!p.end||p.end<=p.start||!Number.isFinite(p.pause)||p.pause<0)throw Error('Vérifiez les horaires et la pause.');for(const date of days){ui.validateScheduling(date,p.start,p.end,p.teamIds,'',base.exactHours);const start=new Date(date+'T'+p.start).toISOString(),end=new Date(date+'T'+p.end).toISOString();if(p.pause>=durationHours(start,end,0))throw Error('La pause doit être inférieure à la durée de présence.');const e={...base,id:makeId('evt'),seriesId,start,end,teamIds:[...new Set(p.teamIds)],pauseHours:p.pause};e.teamSize=e.teamIds.length||base.teamSize;e.laborHours=e.teamIds.length?plannedTotal(e,ui.data.people):durationHours(start,end,p.pause)*e.teamSize;staged.push(e);ui.data.events.push(e);}}
 await ui.save('events');return staged;
 }catch(e){ui.data.events=before;throw e;}
}
