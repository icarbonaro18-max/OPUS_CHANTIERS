import test from 'node:test';
import assert from 'node:assert/strict';
import {personPlan,isOwnerSchedule} from '../lib/person-planning.js';
import {blockedAssignments} from '../lib/workforce.js';
import {hourWeek} from '../lib/hour-calendar.js';
const owner={id:'owner',name:'CARBONARO Ignazio',type:'internal',active:true,weeklyTarget:39};
const worker={id:'worker',name:'CARBONARO Roberto',type:'internal',active:true,weeklyTarget:39};
const event={id:'late',title:'Visite du soir',kind:'visit',start:'2026-10-02T19:30:00',end:'2026-10-02T20:00:00',teamIds:['owner'],pauseHours:0};
test('Le gérant conserve son rendez-vous de 19 h 30 à 20 h sans case exceptionnelle',()=>{
 assert.equal(personPlan(event,owner).hours,.5);assert.equal(personPlan(event,owner).start,event.start);
 assert.equal(personPlan(event,worker).hours,0);assert.equal(isOwnerSchedule(worker),false);
});
test('Les horaires matinaux et traversant la limite salariée restent entiers',()=>{
 for(const [start,end,h] of [['05:00','06:00',1],['15:30','20:00',4.5]])assert.equal(personPlan({...event,start:'2026-10-02T'+start,end:'2026-10-02T'+end},owner).hours,h);
});
test('Fermeture : gérant autorisé, salariés bloqués, absence explicite conservée',()=>{
 const data={people:[owner,worker],closures:[{start:'2026-10-02',end:'2026-10-02',label:'Fermeture'}]};
 assert.deepEqual(blockedAssignments(data,'2026-10-02',['owner']),[]);
 assert.equal(blockedAssignments(data,'2026-10-02',['worker']).length,1);
 assert.equal(blockedAssignments({...data,people:[{...owner,absences:[{start:'2026-10-02',end:'2026-10-02',type:'conge'}]}]},'2026-10-02',['owner']).length,1);
});
test('La grille adapte automatiquement sa fin au rendez-vous du soir',()=>{
 const ui={data:{events:[],people:[owner],visits:[]},c:{isAdmin:()=>false},canPlan:()=>true,linkLabel:e=>e.title,teamNames:()=>''};
 const day=[new Date('2026-10-02T12:00:00')];
 assert.match(hourWeek(ui,day),/>18:00<\/span>/);
 ui.data.events=[event];const html=hourWeek(ui,day);
 assert.match(html,/>20:00<\/span>/);assert.match(html,/19:30–20:00/);assert.match(html,/Visite du soir/);
});
