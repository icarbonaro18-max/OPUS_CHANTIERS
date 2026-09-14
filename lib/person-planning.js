// Contract hours affect forecasts only. Actual pointings are never shortened.
export function personPlan(event,person){
 const start=new Date(event.start),end=new Date(event.end),fallback=()=>({start:event.start,end:event.end,pause:Math.max(0,Number(event.pauseHours)||0),hours:Math.max(0,(end-start)/3600000-(Number(event.pauseHours)||0))});
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)return {start:event.start,end:event.end,pause:0,hours:0};
 if(!person||person.type==='external'||[0,6].includes(start.getDay())||start.toDateString()!==end.toDateString())return fallback();
 const friday=start.getDay()===5,apprentice=person.role==='apprenti'||Number(person.weeklyTarget)===35;
 const begin=new Date(start),finish=new Date(start);begin.setHours(8,0,0,0);finish.setHours(friday?(apprentice?11:16):17,0,0,0);
 const a=new Date(Math.max(+start,+begin)),b=new Date(Math.min(+end,+finish)),gross=Math.max(0,(b-a)/3600000);
 let pause=friday&&apprentice?0:start<=begin&&end>=finish?1:Math.max(0,Number(event.pauseHours)||0);pause=Math.min(gross,pause);
 return {start:a.toISOString(),end:new Date(Math.max(+a,+b)).toISOString(),pause,hours:Math.max(0,gross-pause)};
}
export function plannedPeople(event,people=[]){return [...new Set(event.teamIds||[])].map(id=>{const person=people.find(p=>p.id===id);return {id,name:person?.name||id,...personPlan(event,person)};});}
export function plannedTotal(event,people=[]){return plannedPeople(event,people).reduce((n,p)=>n+p.hours,0);}
export function planningSummary(event,people=[]){const time=v=>new Date(v).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});return plannedPeople(event,people).map(p=>`${p.name} : ${p.hours?time(p.start)+'–'+time(p.end):'hors horaires'} · ${p.hours.toFixed(1)} h`).join(' ; ');}
export function planningSpan(event,people=[]){const rows=plannedPeople(event,people).filter(p=>p.hours>0);if(!rows.length)return event;return {...event,start:rows.map(p=>p.start).sort()[0],end:rows.map(p=>p.end).sort().at(-1)};}
