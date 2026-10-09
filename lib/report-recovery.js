// Local, account-scoped recovery. Never sends an offline report automatically.
const fields=['materialUsage','workDone','summary','notes','materials','needsQuote','actualStart','actualEnd','pauseHours','photos','reportItems','visitTasks','clientReport','clientReportSource','clientReportApproved','reportKind','progressNotes','materialNeeded','requestMaterials','teamActuals','materialNeededOn'];
export function applyRecoveredReport(record,draft){if(record.projectId&&draft.reportTeamVerified){record.teamIds=structuredClone(draft.teamIds||[]);record.reportTeamVerified=true;}for(const key of fields)if(Object.hasOwn(draft,key))record[key]=structuredClone(draft[key]);}
export class ReportRecovery {
 constructor(store,storage,namespace){this.store=store;this.storage=storage;this.prefix='opus-report:'+namespace+':';this.chain=Promise.resolve();}
 text(id){try{return JSON.parse(this.storage.getItem(this.prefix+id)||'null');}catch{return null;}}
 remember(id,kind,values,target=null){const row={id,kind,values,savedAt:new Date().toISOString()};this.storage.setItem(this.prefix+id,JSON.stringify(row));this.storage.setItem(this.prefix+'last',JSON.stringify(target||{id,kind}));return row;}
 last(){try{return JSON.parse(this.storage.getItem(this.prefix+'last')||'null');}catch{return null;}}
 save(record){const copy=structuredClone(record);this.chain=this.chain.catch(()=>{}).then(()=>this.store.set('report-recovery:'+copy.id,copy));return this.chain;}
 load(id){return this.store.get('report-recovery:'+id);}
 async clear(id){await this.chain;await this.store.remove('report-recovery:'+id);this.storage.removeItem(this.prefix+id);if((this.last()?.storageId||this.last()?.id)===id)this.storage.removeItem(this.prefix+'last');}
}
const values=form=>Array.from(form.querySelectorAll('input[id],textarea[id],select[id]')).filter(e=>!['file','password','hidden'].includes(e.type)).map(e=>({id:e.id,value:e.value,checked:e.checked}));
export async function restoreReport(ui,record,visit){
 const draft=await ui.c.loadReportDraft?.(record.id),text=ui.c.reportRecovery?.text(record.id);
 if(!draft&&!text)return null;
 if(!confirm('Un brouillon non envoyé est conservé sur cet appareil. Reprendre cette saisie ? Les dates du planning et le statut actuel seront conservés.'))return null;
 if(draft)applyRecoveredReport(record,draft);
 return text;
}
export function bindReportRecovery(ui,record,visit,text=null,options={}){
 const form=options.form||document.getElementById(visit?'finishVisit':'finishInt');if(!form||!ui.c.reportRecovery)return;
 const recovery=ui.c.reportRecovery,kind=visit?'visits':'interventions',storageId=options.storageId||record.id;
 if(text?.values)for(const row of text.values){const el=document.getElementById(row.id);if(el&&form.contains(el)&&el.type!=='file'){el.value=row.value;if(['checkbox','radio'].includes(el.type))el.checked=row.checked;}}
 const notice=document.createElement('div');notice.className='reportLocalNotice';notice.innerHTML='<p role="status"></p><button type="button" class="secondary">Actualiser / reconnecter sans perdre ma saisie</button>';form.prepend(notice);
 const status=notice.querySelector('p');status.textContent=text?'Brouillon repris · non envoyé au bureau.':'La saisie sera conservée sur cet appareil avant son envoi.';
 let revision=0,saveRevision=null;let dirty=!!text,timer=null,stopped=false,baseline=JSON.stringify(values(form));const flights=new Set();
 const textSave=()=>{try{recovery.remember(storageId,kind,values(form),options.target);return true;}catch(e){status.textContent='Copie locale indisponible : '+e.message+'. Gardez cette fenêtre ouverte.';throw e;}};
 const persist=async()=>{clearTimeout(timer);if(stopped||!dirty)return;const snapshot=structuredClone(record);if(form.isConnected&&!options.form)ui.captureReportDraft(snapshot,visit);snapshot.id=storageId;textSave();await ui.pendingPhotos; // photos may finish processing after the input event
 snapshot.photos=structuredClone(record.photos||[]);if(record.phasePhotos)snapshot.phasePhotos=structuredClone(record.phasePhotos);await recovery.save(snapshot);status.textContent='Brouillon conservé sur cet appareil · non envoyé au bureau.';};
 const flush=(force=false)=>{if(force&&JSON.stringify(values(form))!==baseline)dirty=true;const pending=persist();flights.add(pending);pending.then(()=>flights.delete(pending),()=>flights.delete(pending));return pending;};
 const changed=()=>{revision++;dirty=true;try{textSave();}catch{return;}clearTimeout(timer);timer=setTimeout(()=>flush().catch(e=>{status.textContent='Brouillon non confirmé sur cet appareil : '+e.message;}),700);};
 form.addEventListener('input',changed);form.addEventListener('change',changed);
 const checkpoint=()=>{if(form.isConnected&&dirty){try{textSave();}catch{}void flush().catch(e=>{status.textContent='Copie locale incomplète : '+e.message;});}};
 const visibility=()=>{if(document.hidden)checkpoint();};window.addEventListener('pagehide',checkpoint);document.addEventListener('visibilitychange',visibility);
 const controller={id:storageId,form,flush,changed,beginSave(){saveRevision=revision;},async saved(){if(saveRevision!==null&&revision!==saveRevision){await flush();status.textContent='Version précédente envoyée. Vos nouvelles saisies sont conservées sur cet appareil : enregistrez-les à leur tour.';saveRevision=null;return;}saveRevision=null;dirty=false;baseline=JSON.stringify(values(form));clearTimeout(timer);await Promise.all([...flights]);await recovery.clear(storageId);status.textContent='Rapport enregistré dans Microsoft 365.';},stop(){stopped=true;clearTimeout(timer);window.removeEventListener('pagehide',checkpoint);document.removeEventListener('visibilitychange',visibility);form.removeEventListener('input',changed);form.removeEventListener('change',changed);}};
 ui.activeReportRecovery?.stop();ui.activeReportRecovery=controller;
 notice.querySelector('button').onclick=async()=>{try{dirty=true;await flush();await ui.c.reconnectReport?.();}catch(e){status.textContent='Reconnexion interrompue : '+e.message;}};
}

export async function prepareDetailRecovery(ui,parent,item,visit,index){
 const storageId=parent.id+':'+(visit?'task':'point')+':'+(index??'new');
 const text=ui.c.reportRecovery?.text(storageId),saved=await ui.c.reportRecovery?.load(storageId);
 if((text||saved)&&confirm('Reprendre le détail non envoyé conservé sur cet appareil ?')){if(saved){const originalId=item.id;Object.assign(item,saved);item.id=originalId;}return {storageId,text};}
 return {storageId,text:null};
}
export function bindDetailRecovery(ui,parent,item,visit,index,prepared){
 const form=document.getElementById(visit?'visitTaskForm':'intItemForm');
 bindReportRecovery(ui,item,visit,prepared.text,{form,storageId:prepared.storageId,target:{id:parent.id,kind:visit?'visits':'interventions',detail:true,index,storageId:prepared.storageId}});
}
