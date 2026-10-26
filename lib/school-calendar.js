/* Calendar annotations only: these badges neither create appointments nor add
 * worked hours. Availability remains governed by schoolPeriods/schoolDates. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dayKey(value){
 const d=value instanceof Date?value:new Date(String(value||'').slice(0,10)+'T12:00:00');
 if(Number.isNaN(+d))return '';
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
const inPeriod=(date,p)=>p?.start&&p?.end&&date>=p.start&&date<=p.end;
function schoolState(person,date,individual){
 // Use one label for every apprentice, whether dates come from a school
 // calendar, a training centre or manually entered periods. Company days
 // remain unlabelled; the source calendar and availability stay unchanged.
 if((person.schoolPeriods||[]).some(p=>inPeriod(date,p))||(person.schoolDates||[]).includes(date))return {kind:'school',label:'École'};
 if(!individual)return null;
 const calendar=person.schoolCalendar;
 const weekday=new Date(date+'T12:00:00').getDay();
 if(calendar?.through&&date>calendar.through&&weekday!==0&&weekday!==6)return {kind:'incomplete',label:'Calendrier école à compléter'};
 return null;
}
export function schoolCalendarBadges(ui,date){
 if(typeof ui?.canPlan!=='function'||!ui.canPlan()||ui.calendarPersonId==='__private__')return '';
 const key=dayKey(date);if(!key)return '';
 const selected=ui.calendarPersonId||'',people=(ui.data?.people||[]).filter(p=>selected?String(p.id)===String(selected):p.active!==false);
 const badges=people.flatMap(person=>{
  const state=schoolState(person,key,!!selected);if(!state)return [];
  const name=String(person.name||'Apprenti'),label=selected?state.label:name+' · '+state.label;
  const title=name+' · '+state.label;
  return [`<span class="schoolCalendarBadge schoolCalendar-${state.kind}" data-school-person="${esc(person.id)}" data-school-status="${state.kind}" title="${esc(title)}">${esc(label)}</span>`];
 });
 return badges.length?`<div class="schoolCalendarBadges" aria-label="Calendrier école">${badges.join('')}</div>`:'';
}
