import {planningSpan,planningSummary} from './person-planning.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function hourLayout(events,date){
 const day=new Date(date+'T00:00:00'),next=new Date(day);next.setDate(next.getDate()+1);
 const rows=events.filter(e=>e.status!=='annulee'&&new Date(e.start)<next&&new Date(e.end)>day).map(e=>{const a=new Date(Math.max(+day,+new Date(e.start))),b=new Date(Math.min(+next,+new Date(e.end)));return {e,start:a.getHours()*60+a.getMinutes(),end:+b===+next?1440:b.getHours()*60+b.getMinutes()};}).sort((a,b)=>a.start-b.start);
 let group=[],limit=-1;const finish=()=>{const lanes=[];for(const r of group){let lane=lanes.findIndex(end=>end<=r.start);if(lane<0)lane=lanes.length;lanes[lane]=r.end;r.lane=lane;}for(const r of group)r.columns=lanes.length;group=[];};
 for(const r of rows){if(r.start>=limit){finish();limit=-1;}group.push(r);limit=Math.max(limit,r.end);}finish();return rows;
}
export function hourWeek(ui,days){
 const dates=days.map(d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).toLocaleDateString('en-CA')),layouts=dates.map(d=>hourLayout(ui.data.events.map(e=>planningSpan(e,ui.data.people||[])),d));
 const all=layouts.flat(),begin=Math.min(360,...all.map(r=>Math.floor(r.start/60)*60)),end=Math.max(1200,...all.map(r=>Math.ceil(r.end/60)*60)),height=(end-begin)*1.5;
 const time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 return `<div class="hourScroll"><div class="hourGrid"><div class="hourHead">Heures</div>${days.map((d,i)=>`<div class="hourHead">${esc(d.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'}))}${ui.hourNotice?.(dates[i])||''}</div>`).join('')}<div class="hourAxis" style="height:${height}px">${Array.from({length:(end-begin)/60+1},(_,i)=>`<span style="top:${i*90}px">${time(begin+i*60)}</span>`).join('')}</div>${layouts.map((rows,i)=>`<div class="hourDay" style="height:${height}px">${ui.canPlan()?Array.from({length:(end-begin)/30},(_,n)=>`<button class="hourSlot" data-slot-date="${dates[i]}" data-slot-time="${time(begin+n*30)}" style="top:${n*45}px" aria-label="Planifier le ${dates[i]} à ${time(begin+n*30)}"></button>`).join(''):''}${rows.map(r=>`<button class="hourEvent ${esc(r.e.kind)}" data-event="${esc(r.e.id)}" style="top:${(r.start-begin)*1.5}px;height:${Math.max(24,(r.end-r.start)*1.5)}px;left:${r.lane*100/r.columns}%;width:${100/r.columns}%" title="${esc(ui.linkLabel(r.e)+' · '+ui.teamNames(r.e.teamIds))}"><b>${time(r.start)}–${time(r.end)}</b><strong>${esc(ui.linkLabel(r.e)||r.e.title)}</strong><small>${esc(planningSummary(r.e,ui.data.people||[])||ui.teamNames(r.e.teamIds))}</small></button>`).join('')}</div>`).join('')}</div></div>`;
}
