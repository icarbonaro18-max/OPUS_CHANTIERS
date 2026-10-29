import {planningOriginals} from './planning-reassign.js';
const fields=['plannedStart','plannedEnd','teamIds','teamSize','vehicle','status'];
const terminal=new Set(['terminee','facturee','convertie','annulee','cancelled']);
const usable=event=>!['annulee','cancelled'].includes(event.status)&&Number.isFinite(Date.parse(event.start))&&Number.isFinite(Date.parse(event.end))&&Date.parse(event.end)>Date.parse(event.start);
// The confirmed calendar is already shared in events.json. Derive its display
// fields locally instead of rewriting every report/photo to mirror one booking.
export function applyCalendarRecordPlan(data,{baseline=null}={}){
 const groups=new Map();
 for(const event of planningOriginals(data.events||[])){
  if(!['intervention','visit'].includes(event.kind)||!event.linkId||!usable(event))continue;
  const key=event.kind+':'+event.linkId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(event);
 }
 for(const [collection,kind] of [['interventions','intervention'],['visits','visit']])for(const record of data[collection]||[]){
  if(record.appArchivedAt||record.retentionPurgedAt||record.appointmentReplanPending||terminal.has(record.status))continue;
  if(baseline){const raw=baseline[collection]?.find(row=>row.id===record.id);if(raw)for(const key of fields){if(Object.hasOwn(raw,key))record[key]=structuredClone(raw[key]);else delete record[key];}}
  const events=groups.get(kind+':'+record.id);if(!events?.length)continue;
  const sorted=[...events].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));record.plannedStart=sorted[0].start;record.plannedEnd=events.reduce((end,event)=>Date.parse(event.end)>Date.parse(end)?event.end:end,events[0].end);
  // Once actual work is being reported, the report's verified team is history.
  if(!record.actualStart&&!record.reportTeamVerified){record.teamIds=[...new Set(sorted.flatMap(event=>event.teamIds||[]))];record.teamSize=Math.max(1,record.teamIds.length,...events.map(event=>Number(event.teamSize)||1));}
  record.vehicle=events.some(event=>event.vehicle);
  if(['a_planifier','planifiee'].includes(record.status))record.status='planifiee';
 }
 return data;
}
