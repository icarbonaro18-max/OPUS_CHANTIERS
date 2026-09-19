import {eventProjectIds} from './planning-affairs.js';
const day=value=>{const d=new Date(value);return Number.isNaN(+d)?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function reportTeam(record,events,date=record.actualStart||record.plannedStart){
 if(record.teamIds?.length||record.reportTeamVerified)return {ids:[...(record.teamIds||[])],source:'record'};
 const dateKey=day(date);if(!dateKey)return {ids:[],source:'missing'};
 let matches=(events||[]).filter(e=>!['annulee','cancelled'].includes(e.status)&&((record.projectId&&eventProjectIds(e).includes(record.projectId))||(e.kind==='intervention'&&e.linkId===record.id))&&day(e.start)<=dateKey&&day(e.end)>=dateKey);
 const time=+new Date(date),overlap=matches.filter(e=>+new Date(e.start)<=time&&time<+new Date(e.end));if(overlap.length)matches=overlap;
 const teams=[...new Set(matches.map(e=>JSON.stringify([...new Set(e.teamIds||[])].sort())))];
 return teams.length===1?{ids:JSON.parse(teams[0]),source:'calendar'}:{ids:[],source:teams.length?'ambiguous':'missing'};
}
export function mountReportTeam(ui,record){
 if(!record.projectId)return;
 const box=document.createElement('details');box.id='reportTeam';box.className='reportOptional';
 const summary=document.createElement('summary'),hint=document.createElement('p'),list=document.createElement('div');box.append(summary,hint,list);
 const form=document.getElementById('finishInt');form.prepend(box);
 let touched=false;
 const display=()=>{const ids=[...list.querySelectorAll('input:checked')].map(b=>b.value);summary.textContent='Techniciens : '+(ids.length?ui.teamNames(ids):'à vérifier');};
 const fill=()=>{if(touched)return;const result=reportTeam(record,ui.data.events,document.getElementById('aStart')?.value||record.actualStart||record.plannedStart||new Date().toISOString());
  list.replaceChildren();for(const person of ui.data.people||[]){if(person.active===false&&!result.ids.includes(person.id))continue;const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=person.id;input.checked=result.ids.includes(person.id);input.onchange=()=>{touched=true;display();};label.append(input,document.createTextNode(' '+person.name));list.append(label);}
  hint.textContent=result.source==='calendar'?'Équipe reprise du calendrier : vérifiez les personnes réellement présentes.':result.source==='ambiguous'?'Plusieurs équipes possibles ce jour-là : cochez les personnes présentes.':'Vérifiez les personnes présentes. Les horaires réels restent inchangés.';box.open=!result.ids.length;display();
 };fill();document.getElementById('aStart')?.addEventListener('input',fill);
}
export function captureReportTeam(record){const box=document.getElementById('reportTeam');if(box){record.teamIds=[...box.querySelectorAll('input:checked')].map(b=>b.value);record.reportTeamVerified=true;}}
