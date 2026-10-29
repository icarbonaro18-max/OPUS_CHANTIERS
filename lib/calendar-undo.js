import {applyCalendarRecordPlan} from './calendar-record-plan.js';
import {personUnavailable,isoDate} from './ops.js';
import {personPlan} from './person-planning.js';
import {blockedAssignments} from './workforce.js';

// This is deliberately session memory, never a second copy of reports or a
// persistent queue. Only confirmed calendar writes enter the history.
const histories=new WeakMap(),kinds=['events','visits','interventions'];
const planningFields=['plannedStart','plannedEnd','teamIds','teamSize','vehicle','plannedWeekends','status','appointmentReplanPending'];
const guardFields=['status','actualStart','actualEnd','completedAt','archivedAt','cancelledAt','deletedAt','reportDeletedAt','reportSubmittedAt','reportDraftSavedAt','pdfSavedAt','quoteNumber'];
const clone=value=>value===undefined?undefined:structuredClone(value);
const own=(row,key)=>Object.prototype.hasOwnProperty.call(row||{},key);
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,ordered(value[key])])):value;
const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const withoutUpdated=row=>{if(!row)return row;const copy={...row};delete copy.updatedAt;return copy;};
const sameEvent=(a,b)=>equal(withoutUpdated(a),withoutUpdated(b));
const select=(row,fields)=>Object.fromEntries(fields.filter(key=>own(row,key)).map(key=>[key,clone(row[key])]));
const owner=ui=>String(ui.user?.id||ui.c?.getUser?.()?.id||'');
const admin=ui=>!!(ui.c?.isAdmin?.()||ui.isAdmin?.());
const active=row=>!['annulee','cancelled'].includes(row?.status);
const conflict=message=>Object.assign(Error(message||'Le rendez-vous a changé sur un autre appareil. Actualisez le planning ; aucune donnée récente ne sera remplacée.'),{code:'calendar_undo_conflict',status:409});

function history(ui){
 const id=owner(ui);let state=histories.get(ui);
 if(!state||state.ownerId!==id){state={ownerId:id,entries:[],active:null,busy:false};histories.set(ui,state);}
 return state;
}
function notify(ui){try{const result=ui.onCalendarHistoryChanged?.();result?.catch?.(()=>{});}catch{}}
function assertWritable(ui,id){
 if(!id||owner(ui)!==id)throw Error('Le compte connecté a changé. Reprenez le calendrier avec votre compte.');
 if(!ui.canPlan?.())throw Error('La modification du planning est réservée au bureau et aux responsables.');
 if(ui.cacheMode||globalThis.navigator?.onLine===false)throw Error('Le planning est en consultation hors ligne. Reconnectez-vous avant d’annuler une modification.');
 if(ui.needsRefresh||ui.dataLoadError)throw Error('Actualisez le planning avant d’annuler une modification.');
}
function guards(row){
 // Progress markers protect a linked report without retaining its photographs,
 // notes, signature, or client payload in calendar history.
 return {...select(row,guardFields),reportTimes:(row.reportItems||[]).filter(item=>item.actualStart||item.actualEnd||item.startedAt||item.endedAt).map(item=>select(item,['id','actualStart','actualEnd','startedAt','endedAt']))};
}
function rowsById(rows,kind){
 if(!Array.isArray(rows))throw Error('La liste '+kind+' n’a pas été chargée.');
 const result=new Map();
 for(const row of rows){if(!row||!row.id||result.has(String(row.id)))throw Error('La liste '+kind+' contient un identifiant absent ou en double. Actualisez avant de modifier le planning.');result.set(String(row.id),row);}
 return result;
}
function snapshot(rows,kind){
 return new Map([...rowsById(rows||[],kind)].map(([id,row])=>[id,kind==='events'?clone(row):{fields:select(row,planningFields),guard:guards(row)}]));
}
function capture(ui){return Object.fromEntries(kinds.map(kind=>[kind,snapshot(ui.data?.[kind]||[],kind)]));}
function push(ui,state,entry){state.entries.push(entry);if(state.entries.length>10)state.entries.shift();notify(ui);}
function linkedRecords(row,refs){
 if(!row)return;
 if(row.linkId&&['visit','intervention'].includes(row.kind))refs.set((row.kind==='visit'?'visits':'interventions')+':'+row.linkId,{kind:row.kind==='visit'?'visits':'interventions',id:String(row.linkId)});
 for(const displaced of row.displacedProjects||[])linkedRecords(displaced,refs);
}
function finish(ui,state,transaction){
 if(owner(ui)!==state.ownerId)return;
 const collections=[],refs=new Map();
 for(const kind of kinds){
  const after=transaction.confirmed[kind];if(!after)continue;
  const before=transaction.before[kind],changes=[];
  for(const id of new Set([...before.keys(),...after.keys()])){
   const a=before.get(id),b=after.get(id);
   if(kind==='events'){
    if(sameEvent(a,b))continue;
    changes.push({id,before:a||null,after:b||null});linkedRecords(a,refs);linkedRecords(b,refs);
   }else{
    // Creation/deletion of an entire case is not a calendar undo. Never retain
    // or recreate a partial client/report document from a planning snapshot.
    if(!a||!b)continue;
    const fields=planningFields.filter(key=>!equal(a.fields[key],b.fields[key]));
    if(fields.length){changes.push({id,fields,before:a.fields,after:b.fields});refs.set(kind+':'+id,{kind,id});}
   }
  }
  if(changes.length)collections.push({kind,changes});
 }
 if(!collections.length)return;
 const linked=[...refs.values()].map(ref=>({...ref,guard:(transaction.confirmed[ref.kind]||transaction.before[ref.kind]).get(ref.id)?.guard??null}));
 push(ui,state,{type:'shared',label:transaction.label,collections,linked,done:new Set()});
}

export function calendarUndoState(ui){
 const state=history(ui),entry=state.entries.at(-1),busy=state.busy||!!state.active,partial=!!entry?.done?.size;
 let allowed=true;try{assertWritable(ui,state.ownerId);}catch{allowed=false;}
 if(entry?.type==='private'&&!admin(ui))allowed=false;
 return {available:!!entry&&allowed&&!busy,label:allowed&&entry?(partial?'Terminer : ':'')+entry.label:'',busy,count:allowed?state.entries.length:0,partial};
}
export async function withCalendarHistory(ui,label,work){
 const state=history(ui);
 // Legacy embedded callers may have no account context. Their existing write
 // permission checks still apply; they simply cannot offer session undo.
 if(!state.ownerId)return await work();
 assertWritable(ui,state.ownerId);
 if(state.busy)throw Error('Une annulation du planning est déjà en cours.');
 if(state.active)return await work();
 const transaction={label:String(label||'Modification du calendrier'),before:capture(ui),confirmed:{}};
 state.active=transaction;notify(ui);
 try{return await work();}
 finally{state.active=null;finish(ui,state,transaction);notify(ui);}
}
// Call immediately after repo.save succeeds, before cache/UI notifications.
export function calendarSaved(ui,kind){
 if(!kinds.includes(kind))return;
 const state=histories.get(ui);if(!state?.active||owner(ui)!==state.ownerId)return;
 state.active.confirmed[kind]=snapshot(ui.data?.[kind]||[],kind);
}
export function rememberPrivateChange(ui,change){
 const state=history(ui);
 if(!change||change.type!=='private'||!state.ownerId||change.ownerId!==state.ownerId||!admin(ui)||state.busy)return;
 if(!change.before&&!change.after||equal(change.before?.payload,change.after?.payload))return;
 const label=change.label||(change.before?(change.after?'Modifier un rendez-vous privé':'Supprimer un rendez-vous privé'):'Ajouter un rendez-vous privé');
 push(ui,state,{type:'private',label,change:clone(change),done:new Set()});
}

function checkAndReverse(collection,rows,done,stamp){
 const current=rowsById(rows,collection.kind),next=new Map(current);
 for(const change of collection.changes){
  const expected=done?change.before:change.after,row=current.get(change.id);
  if(collection.kind==='events'){
   if(!sameEvent(row||null,expected))throw conflict();
   if(done)continue;
   if(change.before)next.set(change.id,{...clone(change.before),updatedAt:stamp});else next.delete(change.id);
  }else{
   if(!row)throw conflict('La fiche liée au rendez-vous a été supprimée. L’annulation est bloquée.');
   if(change.fields.some(key=>!equal(row[key],expected[key])))throw conflict();
   if(done)continue;
   const restored={...row,updatedAt:stamp};
   for(const key of change.fields){if(own(change.before,key))restored[key]=clone(change.before[key]);else delete restored[key];}
   next.set(change.id,restored);
  }
 }
 return [...next.values()];
}
function checkLinked(entry,fresh){
 for(const link of entry.linked){
  const row=rowsById(fresh[link.kind],link.kind).get(link.id),expected=clone(link.guard);
  // An absent record at capture is allowed only while it remains absent.
  if(!expected){if(row)throw conflict();continue;}
  if(!row)throw conflict('La fiche liée au rendez-vous n’est plus disponible. L’annulation est bloquée.');
  const reverted=entry.done.has(link.kind)&&entry.collections.find(c=>c.kind===link.kind)?.changes.find(c=>c.id===link.id);
  if(reverted?.fields?.includes('status')){if(own(reverted.before,'status'))expected.status=reverted.before.status;else delete expected.status;}
  if(!equal(guards(row),expected))throw conflict('La fiche liée a évolué (rapport, horaires réalisés ou statut). L’annulation ne remplacera pas ce travail.');
 }
}
const schedule=row=>row&&select(row,['start','end','teamIds','exactHours','fridayExtendedIds','status']);
function eachDate(start,end){
 const first=new Date(start),last=new Date(end);if(!Number.isFinite(+first)||!Number.isFinite(+last)||last<=first)throw Error('Le créneau à restaurer contient des horaires invalides.');
 const cursor=new Date(first);cursor.setHours(12,0,0,0);const until=new Date(+last-1),dates=[];
 for(let i=0;isoDate(cursor)<=isoDate(until);i++,cursor.setDate(cursor.getDate()+1)){if(i>366)throw Error('Le créneau à restaurer dépasse une année.');dates.push(isoDate(cursor));}
 return dates;
}
function validateRestoration(entry,fresh,staged){
 const data={...fresh,...staged},events=data.events||[],targets=[];
 for(const collection of entry.collections){
  if(entry.done.has(collection.kind))continue;
  for(const change of collection.changes){
   if(collection.kind==='events'){
    if(change.before&&active(change.before)&&!equal(schedule(change.before),schedule(change.after)))targets.push(change.before);
   }else if(change.before.plannedStart&&change.before.plannedEnd&&change.fields.some(key=>['plannedStart','plannedEnd','teamIds','plannedWeekends','status'].includes(key))){
    const r=data[collection.kind].find(row=>String(row.id)===change.id);if(!active(r))continue;
    const start=new Date(r.plannedStart),end=new Date(r.plannedEnd),dates=eachDate(start,end),kind=collection.kind==='visits'?'visit':'intervention';
    for(const date of dates){
     if(dates.length>1&&!r.plannedWeekends&&[0,6].includes(new Date(date+'T12:00:00').getDay()))continue;
     const a=new Date(date+'T00:00:00'),b=new Date(a);a.setHours(start.getHours(),start.getMinutes(),start.getSeconds());b.setHours(end.getHours(),end.getMinutes(),end.getSeconds());
     targets.push({id:'undo-'+collection.kind+'-'+change.id+'-'+date,kind,linkId:change.id,start:a.toISOString(),end:b.toISOString(),teamIds:r.teamIds||[],ignoreLinked:true});
    }
   }
  }
 }
 for(const target of targets){
  const team=[...new Set(target.teamIds||[])];
  for(const date of eachDate(target.start,target.end)){
   const blocked=blockedAssignments(data,date,team);
   for(const id of team){const person=data.people.find(p=>p.id===id),unavailable=personUnavailable(person,date);if(unavailable.unavailable)blocked.push((person?.name||'Ressource')+' : '+unavailable.label);}
   if(blocked.length)throw conflict('Impossible de restaurer ce créneau : '+[...new Set(blocked)].join(' · ')+'.');
  }
  for(const id of team){
   const person=data.people.find(p=>p.id===id),span=personPlan(target,person);
   if(!span.hours)throw conflict('Le créneau à restaurer est hors des horaires de '+(person?.name||'la ressource')+'.');
   if(events.some(row=>row.id!==target.id&&active(row)&&(row.teamIds||[]).includes(id)&&!(target.ignoreLinked&&row.kind===target.kind&&String(row.linkId)===String(target.linkId))&&(()=>{const other=personPlan(row,person);return new Date(span.start)<new Date(other.end)&&new Date(span.end)>new Date(other.start);})()))throw conflict('Un autre rendez-vous occupe maintenant ce créneau pour '+(person?.name||'la ressource')+'. L’annulation ne déplacera pas ce rendez-vous.');
  }
 }
}
async function afterCommit(ui,kind,rows,notifications){
 try{await ui.c?.cacheSavedKind?.(kind,rows);}catch(error){notifications.push('Copie hors ligne : '+(error.message||error));}
 if(['events','interventions'].includes(kind))try{await ui.c?.syncProjectStages?.();}catch(error){notifications.push('Classement : '+(error.message||error));}
}

export async function undoCalendarChange(ui){
 const state=history(ui);assertWritable(ui,state.ownerId);
 if(state.busy||state.active)throw Error('Une modification du planning est déjà en cours.');
 const entry=state.entries.at(-1);if(!entry)throw Error('Aucune modification du calendrier à annuler dans cette session.');
 state.busy=true;notify(ui);const notifications=[],versions=new Map(),ownedVersions=new Map(),published=new Set();
 const versionsBefore=ui.repo?.versions instanceof Map?new Map(ui.repo.versions):null;
 try{
  if(entry.type==='private'){
   const calendar=ui.privateCalendar;
   const assertCurrent=()=>{assertWritable(ui,state.ownerId);if(!admin(ui)||entry.change.ownerId!==state.ownerId||calendar?.ownerId!==state.ownerId||ui.privateCalendar!==calendar)throw Error('Cette modification appartient à un autre calendrier privé.');};
   assertCurrent();
   const result=await calendar.undo(entry.change,{assertCurrent});
   if(!result?.committed)throw Error('L’annulation du rendez-vous privé n’a pas été confirmée.');
   state.entries.pop();if(result.notificationError)notifications.push(result.notificationError);
  }else{
   const names=new Set(['events','people','closures',...entry.collections.map(c=>c.kind),...entry.linked.map(link=>link.kind)]),fresh={};
   for(const kind of names){
    fresh[kind]=await ui.repo.load(kind);
    if(ui.repo.versions instanceof Map){versions.set(kind,ui.repo.versions.get(kind));ownedVersions.set(kind,ui.repo.versions.get(kind));}
    if(kind==='closures'){if(!Array.isArray(fresh[kind]))throw Error('Les fermetures n’ont pas été chargées.');}else rowsById(fresh[kind],kind);
    assertWritable(ui,state.ownerId);
   }
   checkLinked(entry,fresh);
   const stamp=new Date().toISOString(),staged={};
   for(const collection of entry.collections)staged[collection.kind]=checkAndReverse(collection,fresh[collection.kind],entry.done.has(collection.kind),stamp);
   validateRestoration(entry,fresh,staged);
   // All comparisons and occupancy checks finish before the first write. ETags
   // protect subsequent races; confirmed collections are never sent twice.
   for(const collection of entry.collections){
    const {kind}=collection;if(entry.done.has(kind))continue;
    assertWritable(ui,state.ownerId);
    if(ui.repo.versions instanceof Map&&(!versions.get(kind)||ui.repo.versions.get(kind)!==versions.get(kind)))throw conflict('La version du planning a changé pendant la vérification. Actualisez avant de reprendre l’annulation.');
    await ui.repo.save(kind,staged[kind]);entry.done.add(kind);
    if(ui.repo.versions instanceof Map)ownedVersions.set(kind,ui.repo.versions.get(kind));
    assertWritable(ui,state.ownerId);ui.data[kind]=staged[kind];published.add(kind);
    await afterCommit(ui,kind,staged[kind],notifications);
   }
   applyCalendarRecordPlan(ui.data,{baseline:{...fresh,...staged}});state.entries.pop();
  }
  return {committed:true,label:entry.label,...(notifications.length?{notificationError:notifications.join(' · ')}:{})};
 }catch(error){
  if(error.status===412)ui.needsRefresh=true;
  if(entry.done.size){const partial=Error('Annulation partielle : '+error.message+' Les étapes déjà enregistrées sont conservées. Réessayez pour terminer.');partial.cause=error;partial.code='calendar_undo_partial';partial.partial=true;throw partial;}
  throw error;
 }finally{
  // A preflight read must not pair a fresh ETag with the old UI array: that
  // could let the next ordinary save erase another device's unrelated edits.
  // Only arrays actually published after a confirmed write keep their new tag.
  if(versionsBefore)for(const [kind,tag] of ownedVersions){
   if(published.has(kind)||ui.repo.versions.get(kind)!==tag)continue;
   if(versionsBefore.has(kind))ui.repo.versions.set(kind,versionsBefore.get(kind));else ui.repo.versions.delete(kind);
  }
  state.busy=false;notify(ui);
 }
}
