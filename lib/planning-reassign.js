import {personPlan,plannedTotal} from './person-planning.js';
const active=e=>!['annulee','cancelled'].includes(e.status);
const overlaps=(a,b)=>new Date(a.start)<new Date(b.end)&&new Date(a.end)>new Date(b.start);
export const movableProject=e=>['project','intervention','visit'].includes(e.kind)&&!e.actualStart&&!e.actualEnd&&active(e);
export function planningOriginals(events){
 const originals=new Map();
 const collect=e=>{for(const p of e.displacedProjects||[]){collect(p);originals.set(p.id,p);}};
 for(const e of events)collect(e);
 return [...events.filter(e=>!e.allocationSourceId&&!originals.has(e.id)),...originals.values()].map(e=>{
  const clean={...e};delete clean.displacedProjects;delete clean.allocationSourceId;
  // V50 stored priority implicitly on the intervention carrying the originals.
  if(e.displacedProjects?.length&&clean.allocationPriority==null)clean.allocationPriority=1;
  return clean;
 });
}
export function originalAppointment(events,event){if(!event.allocationSourceId&&!events.some(e=>(e.displacedProjects||[]).some(p=>p.id===event.id)))return event;return planningOriginals(events).find(e=>e.id===(event.allocationSourceId||event.id))||event;}
// Latest explicit booking wins. Rebuild all residual slots from preserved originals
// so later changes and deletion restore the previous planning without duplicate hours.
export function reassignPlanning(events,incoming=[],removed=[],people=[]){
 const storedSources=new Set(events.flatMap(e=>(e.displacedProjects||[]).map(p=>p.id)));
 if(events.some(e=>(e.allocationSourceId||storedSources.has(e.id))&&(e.actualStart||e.actualEnd)))throw Error('Ce rendez-vous contient des horaires réalisés : faites vérifier son planning au bureau.');
 const originals=planningOriginals(events),remove=new Set(removed),updates=new Set(incoming.map(e=>e.id));
 let priority=Math.max(0,...originals.map(e=>Number(e.allocationPriority)||0));
 const rows=[...originals.filter(e=>!remove.has(e.id)&&!updates.has(e.id)),...incoming.map(e=>{
  const clean={...e,allocationPriority:++priority};delete clean.displacedProjects;delete clean.allocationSourceId;return clean;
 })];
 const sources=rows.filter(e=>active(e)),ledger=new Map(rows.map(e=>[e.id,[]])),replacements=new Map();
 for(const source of sources){
  const priorities=sources.filter(e=>e.id!==source.id&&(Number(e.allocationPriority)||0)>(Number(source.allocationPriority)||0));
 const cuts=new Map();
  for(const id of source.teamIds||[]){
   const person=people.find(p=>p.id===id),span=personPlan(source,person);
   const bookings=priorities.filter(e=>(e.teamIds||[]).includes(id)&&overlaps(span,personPlan(e,person)));
   if(bookings.length)cuts.set(id,{span,bookings,person});
  }
  if(!cuts.size)continue;
  if(!movableProject(source)||events.some(e=>e.allocationSourceId===source.id&&(e.actualStart||e.actualEnd)))throw Error('Ce rendez-vous contient des horaires réalisés : faites vérifier son planning au bureau.');
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
 return rows.flatMap(e=>(replacements.get(e.id)||[e]).map(piece=>ledger.get(e.id)?.length?{...piece,displacedProjects:ledger.get(e.id)}:piece));
}
export function calendarEvents(ui){const id=ui.calendarPersonId;return (ui.data.events||[]).filter(e=>!id||(e.teamIds||[]).includes(id)).map(e=>id?{...e,teamIds:[id]}:e);}
