// Pure scheduling rules. All wall-clock decisions use Europe/Paris, including DST.
export const paris=value=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));
export function day(value){const p=paris(value);return `${p.year}-${p.month}-${p.day}`;}
export const clock=value=>{const p=paris(value);return `${p.hour}:${p.minute}`;};
export const plusDay=(s,n=1)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function atParis(date,time){let ms=Date.parse(date+'T'+time+':00Z');for(let i=0;i<3;i++){const p=paris(ms),wall=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);ms+=Date.parse(date+'T'+time+':00Z')-wall;}return new Date(ms).toISOString();}
export function phone(value){let s=String(value||'').replace(/[\s().-]/g,'');if(/^0[1-9]\d{8}$/.test(s))s='+33'+s.slice(1);if(s.startsWith('00'))s='+'+s.slice(2);return /^\+[1-9]\d{7,14}$/.test(s)?s:'';}
const compact=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,350);
export function personOccurrences(events,people,records={}){
 const out=[];
 for(const e of events){if(!['project','intervention','visit','free'].includes(e.kind)||['annulee','cancelled','terminee','facturee'].includes(e.status))continue;
  const record=(records[e.kind]||[]).find(r=>r.id===e.linkId);
  if(['annulee','terminee','facturee','convertie'].includes(record?.status)||record?.archivedAt)continue;
  if(!Number.isFinite(Date.parse(e.start))||!Number.isFinite(Date.parse(e.end))||e.end<=e.start)continue;
  const first=day(e.start),last=day(e.end);
  for(const id of [...new Set(e.teamIds||[])]){const p=people.find(x=>x.id===id&&x.active!==false);if(!p)continue;
   for(let date=first,n=0;date<=last&&n<367;date=plusDay(date),n++){
    const dow=new Date(date+'T12:00:00Z').getUTCDay();if(first!==last&&[0,6].includes(dow)&&!e.plannedWeekends)continue;
    let start=clock(e.start),end=clock(e.end);
    const owner=/^ignazio@opuselec\.fr$|^ignaziocarbonaro@opuselec\.onmicrosoft\.com$/i.test(p.email||'')||/^(ignazio carbonaro|carbonaro ignazio)$/i.test(p.name||'');
    if(!e.exactHours&&!owner&&p.type!=='external'&&![0,6].includes(dow)){start=start<'08:00'?'08:00':start;const finish=dow===5?((p.role==='apprenti'||Number(p.weeklyTarget)===35)&&!(e.fridayExtendedIds||[]).includes(id)?'11:00':'16:00'):'17:00';end=end>finish?finish:end;}
    if(end<=start)continue;
    out.push({id:e.id,date,start:atParis(date,start),end:atParis(date,end),personId:id,affair:e.kind+':'+(e.linkId||e.id)+':'+(e.additionalProjectIds||[]).join(','),title:compact(e.groupTitle||record?.clientName||e.title||record?.title||'Rendez-vous'),address:compact(record?.siteAddress||(e.notificationAddress??e.address??e.siteAddress)),purpose:compact(e.purpose),private:false});
   }
  }
 }
 return out.sort((a,b)=>a.start.localeCompare(b.start)||a.personId.localeCompare(b.personId));
}
// Only consecutive calendar days (or Friday -> Monday) with one assignment per day are merged.
export function assignmentBlocks(rows){const groups=[];for(const r of [...rows].sort((a,b)=>a.personId.localeCompare(b.personId)||a.start.localeCompare(b.start))){const prev=groups.at(-1),dow=prev&&new Date(prev.to+'T12:00:00Z').getUTCDay(),adjacent=prev&&(r.date===plusDay(prev.to)||(dow===5&&r.date===plusDay(prev.to,3)));
 const single=rows.filter(x=>x.personId===r.personId&&x.date===r.date).length===1&&(!prev||rows.filter(x=>x.personId===r.personId&&x.date===prev.to).length===1);
 if(prev&&adjacent&&single&&prev.personId===r.personId&&prev.affair===r.affair&&prev.address===r.address&&prev.title===r.title&&prev.purpose===r.purpose){prev.to=r.date;prev.rows.push(r);}else groups.push({...r,from:r.date,to:r.date,rows:[r]});}
 return groups;
}
export function signature(block){return JSON.stringify(block.rows.map(r=>[r.date,r.start,r.end,r.affair,r.title,r.address,r.purpose]));}
const fr=d=>d.split('-').reverse().join('/');
export function smsText(b,changed=false){const dates=b.from===b.to?'Le '+fr(b.from):'Du '+fr(b.from)+' au '+fr(b.to);const times=[...new Set(b.rows.map(r=>clock(r.start)+'-'+clock(r.end)))];return `OPUS ${changed?'Planning modifie':'Planning'}\n${dates} : ${b.title}\n${times.length===1?times[0]:'Horaires selon les jours : '+times.join(' / ')+' (voir planning)'}\n${b.address}${b.purpose?'\n'+b.purpose:''}`;}
export function smsCandidates(blocks,previous,now,sendTime='18:00'){
 const today=day(now),due=clock(now)>=sendTime&&clock(now)<'22:00',horizon=plusDay(today,new Date(today+'T12:00:00Z').getUTCDay()===5?3:1);if(!due)return [];
 const candidates=[];
 for(const b of blocks){if(b.to<today||b.from>horizon||Date.parse(b.rows.at(-1).end)<=+now)continue;
  const key=b.personId+':'+b.affair+':'+b.from,old=previous[key];if(old?.signature===signature(b))continue;
  // Continuing periods already announced keep their original start and are not re-sent nightly.
  candidates.push({key,block:b,signature:signature(b),text:smsText(b,!!old),personId:b.personId});
 }
 for(const [key,old] of Object.entries(previous)){if(old.to<today||old.cancelled)continue;if(blocks.some(b=>b.personId===old.personId&&b.affair===old.affair&&b.from===old.from))continue;
  candidates.push({key,signature:'cancelled',cancelled:true,personId:old.personId,text:`OPUS Planning modifie\nAffectation annulee : ${old.title}, du ${fr(old.from)} au ${fr(old.to)}. Consultez le planning ou contactez le bureau.`,block:old});}
 return candidates;
}
export function reminderJobs(rows,now){const jobs=[];for(const r of rows){if(r.allDay)continue;for(const minutes of [60,30,15]){const due=Date.parse(r.start)-minutes*60000;if(+now>=due&&+now<due+5*60000&&+now<Date.parse(r.start))jobs.push({...r,minutes,key:[r.personId||r.ownerId,r.id,r.start,minutes].join(':'),body:`${clock(r.start)} · ${r.title}\n${r.address||'Adresse non renseignée'}`,route:r.address?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(r.address):''});}}return jobs;}
