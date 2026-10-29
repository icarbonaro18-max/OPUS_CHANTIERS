import {personPlan} from './person-planning.js';
import {hasInlineImages,hasMediaReferences} from './media-store.js';
import {compactReport} from './project-retention.js';
import {uid,safeName,Journal} from './cloud.js?v=3.4.1';

const FILES={
  clients:'clients.json',
  people:'people.json',
  interventions:'interventions.json',
  visits:'visits.json',
  events:'events.json',closures:'closures.json'
};

async function readLimited(names,read,limit=3){
 const result=new Array(names.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,names.length)},async()=>{for(;;){const i=next++;if(i>=names.length)return;result[i]=await read(names[i]);}}));return result;
}
export class OpsRepository{
  constructor(graph,{assetStore=null}={}){this.g=graph;this.assetStore=assetStore;this.mediaJournal=new Journal(graph,{assetStore});this.mediaKinds=new Set();this.fileSizes=new Map();this.root=null;this.readFailures=new Set();this.knownFiles=new Set();this.versions=new Map();this.readCache=new Map();}
  async init(){if(this.root)return this;if(!this.initializing)this.initializing=this.g.folder('root','_OPUS_SYSTEM').then(root=>{this.root=root;return this;}).finally(()=>{this.initializing=null;});return this.initializing;}
  async load(name,def=[],listing=null){
    try{
      if(!this.root)await this.init();
      const fileName=FILES[name]||safeName(name+'.json');
      const file=listing?listing.get(fileName):await this.g.named(this.root.id,fileName);
      if(!file){
        if(this.knownFiles.has(name))throw Error('Un fichier déjà chargé est maintenant introuvable. Actualisez avant de modifier les données.');
        this.readCache.delete(name);this.versions.delete(name);this.readFailures.delete(name);return structuredClone(def);
      }
      this.knownFiles.add(name);this.fileSizes.set(name,file.size||0);
      const cached=this.readCache.get(name);
      if(file.eTag&&cached?.id===file.id&&cached.tag===file.eTag){this.versions.set(name,file.eTag);this.readFailures.delete(name);return structuredClone(cached.value);}
      const value=await this.g.json(file.id,file);
      if(Array.isArray(def)&&(!Array.isArray(value)||value.some(row=>!row||typeof row!=='object'||Array.isArray(row))))throw Error('Le fichier ne contient pas une liste valide.');
      if(['interventions','visits'].includes(name)){if(hasMediaReferences(value)||!hasInlineImages(value))this.mediaKinds.add(name);else this.mediaKinds.delete(name);}
      if(file.eTag)this.readCache.set(name,{id:file.id,tag:file.eTag,value:structuredClone(value)});else this.readCache.delete(name);
      this.versions.set(name,file.eTag||null);this.readFailures.delete(name);return value;
    }catch(error){this.readFailures.add(name);const label=({visits:'visites avant devis',interventions:'interventions',events:'rendez-vous du calendrier'})[name]||name;throw Error('Chargement des '+label+' impossible : '+error.message,{cause:error});}
  }
  async save(name,value){
    if(['interventions','visits'].includes(name)&&Array.isArray(value))for(const row of value){
      if(row.retentionPurgedAt&&JSON.stringify(row)!==JSON.stringify(compactReport(row,row.retentionPurgedAt)))throw Error('Le contenu d’un chantier supprimé ne peut pas être ajouté à nouveau. Conservez le brouillon et vérifiez les envois en attente.');
    }
    this.readCache.delete(name);
    if(this.readFailures.has(name))throw Error('Enregistrement bloqué : les données '+name+' n’ont pas pu être lues. Actualisez avant de réessayer.');
    if(!this.root)await this.init();
    const fileName=FILES[name]||safeName(name+'.json');
    // Compact stores keep media references on disk. Only the opened report is hydrated.
    const stored=this.mediaKinds.has(name)?await this.mediaJournal.pack(value,this.root.id):value;
    // Compatibilité avec les anciennes ressources éventuellement encore en cache :
    // si writeJson n'existe pas, on écrit directement via l'API Graph.
    if(typeof this.g.writeJson==='function'){
      const etag=this.versions.get(name);
      try{const result=await this.g.writeJson(this.root.id,fileName,stored,etag?{'If-Match':etag}:{});if(result?.eTag)this.versions.set(name,result.eTag);return result;}
      catch(error){if(error.status===412){this.readFailures.add(name);throw Object.assign(Error('Cette liste a changé sur un autre appareil. Votre saisie reste ouverte : actualisez puis reprenez votre brouillon avant de renvoyer.'),{status:412});}throw error;}
    }
    if(typeof this.g.request==='function'&&typeof this.g.base==='function'){
      const blob=new Blob([JSON.stringify(stored,null,2)],{type:'application/json'});
      return this.g.request(this.g.base(this.root.id)+':/'+encodeURIComponent(fileName)+':/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:blob});
    }
    throw new Error('Stockage Microsoft indisponible. Rechargez l’application.');
  }
  async hydrateRecord(record,options={}){return hasMediaReferences(record)?this.mediaJournal.hydrate(record,options):record;}
  async inspectStorage(){
    await this.init();const files=await this.g.children(this.root.id);
    return ['interventions','visits'].map(kind=>{const file=files.find(f=>f.name===FILES[kind]);return {kind,file,name:FILES[kind],size:file?.size||0};});
  }
  async optimizeMedia(kind,{onProgress=()=>{},signal}={}){
    if(!['interventions','visits'].includes(kind))throw Error('Optimisation non autorisée pour ce fichier.');
    const check=()=>{if(signal?.aborted)throw Error('Optimisation arrêtée. Les données d’origine sont conservées.');};
    await this.init();check();onProgress({stage:'Lecture du fichier d’origine'});
    const file=await this.g.named(this.root.id,FILES[kind]);if(!file)return {kind,changed:false,before:0,after:0};
    if(!file.eTag)throw Error('La version du fichier n’a pas été confirmée. Aucune modification effectuée.');
    const rows=await this.g.json(file.id,file);check();
    if(!Array.isArray(rows)||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Le fichier d’origine n’est pas une liste valide. Aucune modification effectuée.');
    if(!hasInlineImages(rows)){this.mediaKinds.add(kind);return {kind,changed:false,before:file.size||0,after:file.size||0};}
    onProgress({stage:'Copie de sécurité complète'});
    const backups=await this.g.folder(this.root.id,'SAUVEGARDES_AVANT_OPTIMISATION'),name=kind+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+uid().slice(0,8)+'.json',blob=new Blob([JSON.stringify(rows)],{type:'application/json'});
    let backup;try{backup=await this.g.upload(backups.id,name,blob,()=>{},true);}catch(error){backup=await this.g.named(backups.id,name);if(!backup)throw error;}
    if(!backup?.id||typeof backup.size!=='number'||backup.size!==blob.size)throw Error('La copie de sécurité n’a pas été confirmée. Le fichier d’origine n’a pas été modifié.');
    check();onProgress({stage:'Séparation des photos'});
    const packed=await this.mediaJournal.pack(rows,this.root.id,{signal,onProgress:progress=>onProgress({stage:'Photos enregistrées séparément',...progress})});check();
    onProgress({stage:'Vérification et enregistrement du fichier allégé'});
    let result;try{result=await this.g.writeJson(this.root.id,FILES[kind],packed,{'If-Match':file.eTag});}
    catch(error){this.readCache.delete(kind);if(error.status===412)throw Error('Une autre tablette a enregistré entre-temps. Sa saisie est conservée : relancez l’optimisation sur la nouvelle version. La copie de sécurité est conservée.');throw error;}
    if(!result?.id)throw Error('Microsoft n’a pas confirmé le fichier allégé. La copie de sécurité reste disponible.');
    this.mediaKinds.add(kind);this.readCache.delete(kind);this.readFailures.delete(kind);if(result.eTag)this.versions.set(kind,result.eTag);
    const after=typeof result.size==='number'?result.size:new Blob([JSON.stringify(packed,null,2)]).size;this.fileSizes.set(kind,after);
    return {kind,changed:true,before:file.size||blob.size,after,backup:backup.name||name};
  }
  async loadAll({shouldApply=()=>true}={}){
    const staged=new OpsRepository(this.g,{assetStore:this.assetStore});await this.init();staged.root=this.root;staged.mediaJournal=this.mediaJournal;staged.mediaKinds=new Set(this.mediaKinds);staged.fileSizes=this.fileSizes;
    staged.readCache=new Map(this.readCache);staged.versions=new Map(this.versions);staged.knownFiles=new Set(this.knownFiles);staged.readFailures=new Set(this.readFailures);
    const names=['clients','people','interventions','visits','events','closures','projectTracking'];
    let listing=null;
    if(typeof this.g.children==='function'){
      try{await this.init();listing=new Map((await this.g.children(this.root.id)).map(file=>[file.name,file]));}
      catch(error){if(!this.hasLoadedAll)for(const name of names)this.readFailures.add(name);throw error;}
    }
    let values;try{values=await readLimited(names,name=>staged.load(name,[],listing));}catch(error){if(!this.hasLoadedAll)for(const name of names)this.readFailures.add(name);throw error;}
    if(!shouldApply())return null;
    this.mediaKinds=staged.mediaKinds;this.readCache=staged.readCache;this.versions=staged.versions;this.knownFiles=staged.knownFiles;this.readFailures=staged.readFailures;this.hasLoadedAll=true;
    return Object.fromEntries(names.map((name,i)=>[name,values[i]]));
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
export function isWithin(date,start,end){const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:isoDate(v);const key=day(date);return (!start||key>=day(start))&&(!end||key<=day(end));}
export function isSchoolDay(person,date){
  const key=typeof date==='string'?date:isoDate(date);
  if((person?.schoolDates||[]).includes(key))return true;
  return (person?.schoolPeriods||[]).some(p=>p.start&&p.end&&isWithin(key,p.start,p.end));
}
export function personUnavailable(person,date){
  if(!person||person.active===false)return {unavailable:true,label:'Inactif'};
  if(person.type==='external'&&!isWithin(date,person.availableFrom,person.availableTo))return {unavailable:true,label:'Hors mission'};
  if((person.schoolDates||[]).includes(typeof date==='string'?date:isoDate(date)))return {unavailable:true,label:'École',school:true};
  for(const p of person.schoolPeriods||[])if(p.start&&p.end&&isWithin(date,p.start,p.end))return {unavailable:true,label:p.label||'École',school:true};
  for(const p of person.absences||[])if(p.start&&p.end&&isWithin(date,p.start,p.end))return {unavailable:true,label:p.label||'Absent'};
  return {unavailable:false,label:'Disponible'};
}
export function eventConflicts(personId,date,start,end,events,excludeId='',people=[]){
  const a=new Date(`${date}T${start||'00:00'}`),b=new Date(`${date}T${end||'23:59'}`);
  return events.some(e=>{if(e.id===excludeId||e.status==='annulee'||!(e.teamIds||[]).includes(personId))return false;const span=personPlan(e,people.find(p=>p.id===personId));return a<new Date(span.end)&&b>new Date(span.start);});
}
export function standardDayHours(person,date){
  const d=new Date(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date+'T12:00:00':date),dow=d.getDay();if(dow===0||dow===6)return 0;
  if(Number(person.weeklyTarget)===35||person.role==='apprenti')return dow===5?3:8;
  return dow===5?7:8;
}
export function eventKindLabel(kind){return ({project:'Chantier',intervention:'Intervention',visit:'Visite / devis',free:'Rendez-vous libre'})[kind]||kind;}
export function makeId(prefix='id'){return `${prefix}_${uid().slice(0,12)}`;}
