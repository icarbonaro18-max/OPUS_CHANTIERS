import {uid,safeName} from './cloud.js?v=3.2.1';

const FILES={
  clients:'clients.json',
  people:'people.json',
  interventions:'interventions.json',
  visits:'visits.json',
  events:'events.json'
};

export class OpsRepository{
  constructor(graph){this.g=graph;this.root=null;}
  async init(){this.root=await this.g.folder('root','_OPUS_SYSTEM');return this;}
  async load(name,def=[]){
    if(!this.root)await this.init();
    const file=await this.g.named(this.root.id,FILES[name]||safeName(name+'.json'));
    if(!file)return structuredClone(def);
    try{return await this.g.json(file.id);}catch{return structuredClone(def);}
  }
  async save(name,value){
    if(!this.root)await this.init();
    const fileName=FILES[name]||safeName(name+'.json');
    // Compatibilité avec les anciennes ressources éventuellement encore en cache :
    // si writeJson n'existe pas, on écrit directement via l'API Graph.
    if(typeof this.g.writeJson==='function')return this.g.writeJson(this.root.id,fileName,value);
    if(typeof this.g.request==='function'&&typeof this.g.base==='function'){
      const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
      return this.g.request(this.g.base(this.root.id)+':/'+encodeURIComponent(fileName)+':/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:blob});
    }
    throw new Error('Stockage Microsoft indisponible. Rechargez l’application.');
  }
  async loadAll(){
    const [clients,people,interventions,visits,events]=await Promise.all([
      this.load('clients',[]),this.load('people',[]),this.load('interventions',[]),this.load('visits',[]),this.load('events',[])
    ]);
    return {clients,people,interventions,visits,events};
  }
}

export const isoDate=d=>new Date(d).toLocaleDateString('en-CA');
export function weekStart(input=new Date()){
  const d=new Date(input);d.setHours(12,0,0,0);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d;
}
export function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d;}
export function frDate(value,opts={weekday:'short',day:'2-digit',month:'2-digit'}){if(!value)return '—';return new Date(value).toLocaleDateString('fr-FR',opts);}
export function frDateTime(value){if(!value)return '—';return new Date(value).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
export function durationHours(start,end,pause=0){if(!start||!end)return 0;return Math.max(0,(new Date(end)-new Date(start))/3600000-(Number(pause)||0));}
export function nextInterventionNumber(rows,date=new Date()){
  const y=new Date(date).getFullYear();
  const rx=new RegExp(`^INT-${y}-(\\d{4})$`);let max=0;
  for(const r of rows){const m=String(r.number||'').match(rx);if(m)max=Math.max(max,Number(m[1]));}
  return `INT-${y}-${String(max+1).padStart(4,'0')}`;
}
export function nextVisitNumber(rows,date=new Date()){
  const y=new Date(date).getFullYear();const rx=new RegExp(`^VIS-${y}-(\\d{4})$`);let max=0;
  for(const r of rows){const m=String(r.number||'').match(rx);if(m)max=Math.max(max,Number(m[1]));}
  return `VIS-${y}-${String(max+1).padStart(4,'0')}`;
}
export function isWithin(date,start,end){const t=new Date(date).setHours(12,0,0,0);return (!start||t>=new Date(start).setHours(0,0,0,0))&&(!end||t<=new Date(end).setHours(23,59,59,999));}
export function isSchoolDay(person,date){
  const key=typeof date==='string'?date:isoDate(date);
  if((person?.schoolDates||[]).includes(key))return true;
  return (person?.schoolPeriods||[]).some(p=>isWithin(key,p.start,p.end));
}
export function personUnavailable(person,date){
  if(!person?.active)return {unavailable:true,label:'Inactif'};
  if(person.type==='external'&&!isWithin(date,person.availableFrom,person.availableTo))return {unavailable:true,label:'Hors mission'};
  if((person.schoolDates||[]).includes(typeof date==='string'?date:isoDate(date)))return {unavailable:true,label:'École',school:true};
  for(const p of person.schoolPeriods||[])if(isWithin(date,p.start,p.end))return {unavailable:true,label:p.label||'École',school:true};
  for(const p of person.absences||[])if(isWithin(date,p.start,p.end))return {unavailable:true,label:p.label||'Absent'};
  return {unavailable:false,label:'Disponible'};
}
export function eventConflicts(personId,date,start,end,events,excludeId=''){
  const a=new Date(`${date}T${start||'00:00'}`),b=new Date(`${date}T${end||'23:59'}`);
  return events.some(e=>e.id!==excludeId&&(e.teamIds||[]).includes(personId)&&isoDate(e.start)===date&&a<new Date(e.end)&&b>new Date(e.start));
}
export function standardDayHours(person,date){
  const d=new Date(date),dow=d.getDay();if(dow===0||dow===6)return 0;
  if(Number(person.weeklyTarget)===35||person.role==='apprenti')return dow===5?3:8;
  return dow===5?7:8;
}
export function eventKindLabel(kind){return ({project:'Chantier',intervention:'Intervention',visit:'Visite / devis'})[kind]||kind;}
export function makeId(prefix='id'){return `${prefix}_${uid().slice(0,12)}`;}
