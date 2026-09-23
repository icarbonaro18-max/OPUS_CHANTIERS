import {reassignPlanning,planningOriginals} from './planning-reassign.js';
import {periodDays} from './planning-periods.js';
import {makeId} from './ops.js';
export function interventionDays(start,end,weekends=false){
 if(!start&&!end)return [];
 if(!start||!end||end<=start)throw Error('Renseignez une fin postérieure au début.');
 const a=start.slice(11,16),b=end.slice(11,16);
 if(b<=a)throw Error('L’heure de fin quotidienne doit être après l’heure de début.');
 return periodDays(start.slice(0,10),end.slice(0,10),weekends).map(date=>({date,start:a,end:b}));
}
export function validateInterventionDays(ui,x,start,end,team,weekends=false){
 const rows=interventionDays(start,end,weekends),before=ui.data.events;
 try{
 ui.data.events=before.filter(e=>!(e.kind==='intervention'&&e.linkId===x.id));
 for(const row of rows){try{ui.validateScheduling(row.date,row.start,row.end,team,'',false,true);}catch(e){throw Error(row.date+' : '+e.message);}}
 }finally{ui.data.events=before;}
 return rows;
}
export async function saveInterventionDays(ui,x){
 const rows=interventionDays(ui.localDT(x.plannedStart),ui.localDT(x.plannedEnd),x.plannedWeekends),before=ui.data.events;
 const linked=planningOriginals(before).filter(e=>e.kind==='intervention'&&e.linkId===x.id);
 const events=rows.map(r=>{
 const old=linked.find(e=>ui.localDT(e.start).slice(0,10)===r.date);
 return {...old,id:old?.id||makeId('evt'),kind:'intervention',linkId:x.id,start:ui.toISO(r.date+'T'+r.start),end:ui.toISO(r.date+'T'+r.end),teamIds:x.teamIds||[],teamSize:x.teamSize||1,vehicle:x.vehicle||false,pauseHours:x.pauseHours??((new Date(r.date+'T'+r.end)-new Date(r.date+'T'+r.start))/3600000>5?1:0),status:old?.status||'planifie',title:x.number+' · '+x.clientName};
 });
 ui.data.events=reassignPlanning(before,events,linked.map(e=>e.id),ui.data.people||[]);
 try{await ui.save('events');}catch(e){ui.data.events=before;throw e;}
 return events;
}
