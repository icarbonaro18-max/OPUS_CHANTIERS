import {personPlan,plannedTotal} from './person-planning.js';
const active=e=>!['annulee','cancelled'].includes(e.status);
const overlaps=(a,b)=>new Date(a.start)<new Date(b.end)&&new Date(a.end)>new Date(b.start);
export const movableProject=e=>e.kind==='project'&&!e.actualStart&&!e.actualEnd&&active(e);
export function originalAppointment(events,event){const id=event.allocationSourceId||event.id;return events.flatMap(e=>e.displacedProjects||[]).find(e=>e.id===id)||event;}
// Rebuild from saved originals, so moving/deleting an intervention restores its old slot.
// Originals live with the intervention in the same events.json write, including full-day diversions.
export function reassignPlanning(events,incoming=[],removed=[] ,people=[]){
 const originals=new Map();for(const e of events)for(const p of e.displacedProjects||[])originals.set(p.id,p);
 const remove=new Set(removed),updates=new Map(incoming.map(e=>[e.id,e]));
 for(const e of incoming)if(e.kind==='project'&&originals.has(e.id))originals.set(e.id,e);
 let rows=events.filter(e=>!e.allocationSourceId&&!originals.has(e.id)&&!remove.has(e.id)&&!updates.has(e.id));
 rows.push(...[...originals.values()].filter(e=>!remove.has(e.id)&&!updates.has(e.id)),...incoming);
 const priorities=rows.filter(e=>e.kind==='intervention'&&active(e)&&(e.displacedProjects?.length||updates.has(e.id)));
 const sources=rows.filter(e=>e.kind==='project'&&active(e));
 const ledger=new Map(priorities.map(e=>[e.id,[]])),replacements=new Map();
 for(const source of sources){
  const cuts=new Map();
  for(const id of source.teamIds||[]){
   const person=people.find(p=>p.id===id),span=personPlan(source,person);
   const bookings=priorities.filter(e=>(e.teamIds||[]).includes(id)&&overlaps(span,personPlan(e,person)));
   if(bookings.length)cuts.set(id,{span,bookings,person});
  }
  if(!cuts.size)continue;
  if(!movableProject(source)||events.some(e=>e.allocationSourceId===source.id&&(e.actualStart||e.actualEnd)))throw Error('Ce chantier contient des horaires réalisés : faites vérifier son planning au bureau.');
  const clean={...source};delete clean.displacedProjects;delete clean.allocationSourceId;
  const used=new Set();for(const {bookings} of cuts.values())for(const b of bookings)used.add(b.id);
  for(const id of used)ledger.get(id).push(clean);
  const pieces=[],untouched=(source.teamIds||[]).filter(id=>!cuts.has(id));
  if(untouched.length)pieces.push({...clean,teamIds:untouched,teamSize:untouched.length});
  for(const [id,{span,bookings,person}] of cuts){
   let segments=[[+new Date(span.start),+new Date(span.end)]];
   for(const b of bookings){const s=personPlan(b,person),a=+new Date(s.start),z=+new Date(s.end);segments=segments.flatMap(([l,r])=>a>=r||z<=l?[[l,r]]:[[l,Math.min(r,a)],[Math.max(l,z),r]].filter(([x,y])=>y>x));}
   // The remaining project keeps its original break, less breaks already assigned to the intervention.
   let pause=Math.max(0,span.pause-bookings.reduce((n,b)=>n+personPlan(b,person).pause,0));
   const generated=segments.map(([a,b])=>({...clean,id:source.id+'~'+id+'~'+a,allocationSourceId:source.id,teamIds:[id],teamSize:1,start:new Date(a).toISOString(),end:new Date(b).toISOString(),exactHours:true,pauseHours:0}));
   for(const p of [...generated].reverse()){p.pauseHours=Math.min(pause,(new Date(p.end)-new Date(p.start))/3600000);pause-=p.pauseHours;}
   pieces.push(...generated);
  }
  for(const p of pieces)p.laborHours=plannedTotal(p,people);
  replacements.set(source.id,pieces);
 }
 return rows.flatMap(e=>replacements.get(e.id)||[{...e,...(e.displacedProjects||ledger.has(e.id)?{displacedProjects:ledger.get(e.id)||[]}:{})}]);
}
export function calendarEvents(ui){const id=ui.calendarPersonId;return (ui.data.events||[]).filter(e=>!id||(e.teamIds||[]).includes(id)).map(e=>id?{...e,teamIds:[id]}:e);}
