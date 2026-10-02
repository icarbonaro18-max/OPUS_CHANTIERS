import test from 'node:test';
import assert from 'node:assert/strict';
import {hourWeek,hourLayout} from '../lib/hour-calendar.js';
const date=new Date('2026-10-02T12:00:00');
const ui={data:{events:[],people:[]},c:{isAdmin:()=>true},user:{id:'admin'},canPlan:()=>true,linkLabel:e=>e.title,teamNames:()=>'',privateCalendar:{ready:true,rows:[]}};
test('Les créneaux 19 h et 20 h sont disponibles même sans rendez-vous',()=>{
 const html=hourWeek(ui,[date]);
 assert.match(html,/data-slot-time="19:00"/);assert.match(html,/data-slot-time="20:00"/);assert.match(html,/>22:00<\/span>/);
});
test('Le mode 24 h expose les créneaux de nuit',()=>{
 const html=hourWeek({...ui,calendarFullDay:true},[date]);
 assert.match(html,/data-slot-time="00:00"/);assert.match(html,/data-slot-time="23:30"/);assert.match(html,/>24:00<\/span>/);
});
test('Un rendez-vous privé tardif reste visible et étend la grille normale',()=>{
 const e={id:'late',ownerId:'admin',kind:'private',title:'Rendez-vous du soir',start:'2026-10-02T23:00:00',end:'2026-10-03T00:30:00',exactHours:true,teamIds:[]};
 const html=hourWeek({...ui,privateCalendar:{ready:true,rows:[e]}},[date]);
 assert.match(html,/Rendez-vous du soir/);assert.match(html,/23:00–24:00/);
 assert.equal(hourLayout([e],'2026-10-03')[0].end,30);
});
