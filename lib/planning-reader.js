// Explicit public projection: never spread personnel records or calendar events.
const str=v=>String(v||'').slice(0,180);
function wall(value){
 const d=new Date(value);if(!Number.isFinite(+d))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
export function readerPlanning(events,people,from,to){
 return events.filter(e=>['project','intervention','visit'].includes(e.kind)&&e.status!=='annulee').flatMap(e=>{
  const a=wall(e.start),b=wall(e.end);if(!a||!b||a.date<from||a.date>to||new Date(e.end)<=new Date(e.start))return [];
  const friday=new Date(a.date+'T12:00:00Z').getUTCDay()===5;
  const weekend=[0,6].includes(new Date(a.date+'T12:00:00Z').getUTCDay());
  const team=[...new Set(e.teamIds||[])].flatMap(id=>{
   const p=people.find(p=>p.id===id);if(!p)return [];
   let start=a.time,end=b.time;
   if(!e.exactHours&&p.type!=='external'&&!weekend&&a.date===b.date){start=start<'08:00'?'08:00':start;const finish=friday?(p.role==='apprenti'||Number(p.weeklyTarget)===35?'11:00':'16:00'):'17:00';end=end>finish?finish:end;if(end<=start)return [];}
   return [{name:str(p.name),start,end}];
  });
  return [{date:a.date,endDate:b.date,start:a.time,end:b.time,title:str(e.title)||({project:'Chantier',intervention:'Intervention',visit:'Visite'})[e.kind],team}];
 }).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
}
