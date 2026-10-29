import {pendingServiceFiles,restoreServiceFiles} from './service-requests.js';

const identity=['id','number','projectId','clientId','siteId','sourceEmail','sourceDocuments','createdAt','createdBy'];
const packedFiles=files=>files.map(file=>({name:file.name||'document',type:file.type||'',blob:file}));
const unpackedFiles=files=>(files||[]).map(row=>row.blob?Object.assign(new Blob([row.blob],{type:row.type||row.blob.type}),{name:row.name}):row);
const fields=form=>[...form.querySelectorAll('input,select,textarea')].filter(el=>el.type!=='file'&&el.type!=='password').map(el=>({id:el.id,name:el.name,value:el.value,checked:el.checked}));
export function bindSetupRecovery(ui,kind,record,form,recovered=null){
 const notify=()=>{try{void Promise.resolve(ui.c.setupPendingChanged?.()).catch(()=>{});}catch{}};
 const store=ui.c.localStore,key='setup-draft:'+kind+':'+record.id;let chain=Promise.resolve();
 if(recovered){
  restoreServiceFiles(record,unpackedFiles(recovered.serviceFiles));
  for(const row of recovered.fields||[]){const el=row.id?[...form.elements].find(el=>el.id===row.id):[...form.querySelectorAll('input[name]')].find(el=>el.name===row.name&&el.value===row.value);if(!el||el.type==='file')continue;el.value=row.value;if(['checkbox','radio'].includes(el.type))el.checked=row.checked;}
  const mode=form.querySelector('#'+(kind==='interventions'?'i':'v')+'Mode');if(mode)mode.dispatchEvent(new mode.ownerDocument.defaultView.Event('change',{bubbles:true}));
 }
 const checkpoint=async()=>{
  if(!store)return;
  const base=Object.fromEntries(identity.filter(key=>Object.hasOwn(record,key)).map(key=>[key,structuredClone(record[key])]));
  const draft={kind,record:base,fields:fields(form),serviceFiles:packedFiles([...pendingServiceFiles(record)]),formFiles:[...form.querySelectorAll('input[type=file][id]')].map(el=>({id:el.id,files:packedFiles([...el.files,...unpackedFiles(recovered?.formFiles?.find(row=>row.id===el.id)?.files)])})),savedAt:new Date().toISOString()};
  chain=chain.catch(()=>{}).then(()=>store.set(key,draft));await chain;notify();
 };
 return {checkpoint,files:id=>unpackedFiles(recovered?.formFiles?.find(row=>row.id===id)?.files),async saved(){if(!store)return;await chain;try{await store.remove(key);notify();}catch{ui.c.toast('Fiche enregistrée dans Microsoft 365 ; la copie de secours locale reste conservée.');}}};
}
export async function mountSetupRecoveries(ui,root,kind){
 const store=ui.c.localStore;if(!store)return;
 const prefix='setup-draft:'+kind+':',keys=store.keys?await store.keys(prefix):(await store.all(prefix)).map(row=>row.key);
 if(!keys.length||!root.isConnected)return;
 const panel=document.createElement('section');panel.className='panel';const title=document.createElement('h3');title.textContent='Fiches conservées sur cet appareil · envoi non entièrement confirmé';panel.append(title);
 for(const key of keys){const draft=await store.get(key);if(!draft?.record?.id)continue;const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Reprendre '+(draft.record.number||'la fiche');button.onclick=async()=>{button.disabled=true;try{await ui.c.prepareAppointmentWrite?.();if(ui.reload){await ui.reload({background:false});ui.needsRefresh=false;}const existing=ui.data[kind].find(row=>row.id===draft.record.id);return kind==='interventions'?await ui.editIntervention(existing||null,null,draft):await ui.editVisit(existing||null,null,draft);}catch(error){ui.c.toast(error.message);throw error;}finally{button.disabled=false;}};panel.append(button);}
 if(panel.children.length>1&&root.isConnected)root.querySelector('.pageHeading')?.after(panel);
}
