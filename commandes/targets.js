import {safeName} from '../lib/cloud.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function readInterventions(g){
 const root=await g.folder('root','_OPUS_SYSTEM'),file=await g.named(root.id,'interventions.json');
 if(!file)return {rows:[],file:null};
 const meta=await g.item(file.id),rows=await g.json(file.id);
 if(!Array.isArray(rows))throw Error('Liste des interventions illisible.');
 return {rows,file:meta};
}
export function interventionTargets(rows){
 return rows.filter(x=>x.status!=='annulee').sort((a,b)=>String(a.plannedStart||'9999').localeCompare(String(b.plannedStart||'9999'))).map(x=>({
 id:'intervention:'+x.id,kind:'intervention',linkId:x.id,number:x.number,
 name:[x.number,x.title,x.clientName,x.plannedStart?new Date(x.plannedStart).toLocaleDateString('fr-FR'):'À programmer'].filter(Boolean).join(' · ')
 }));
}
export function mountTargetPicker(select,targets){
 let kind=targets.find(p=>p.id===select.value)?.kind||'project',selected=select.value;
 const tabs=document.createElement('div');tabs.className='actions';tabs.setAttribute('aria-label','Destination du matériel');
 tabs.innerHTML='<button type="button" data-target-kind="project">Chantiers</button><button type="button" data-target-kind="intervention">Interventions</button>';
 select.before(tabs);
 function draw(){select.innerHTML='<option value="">Choisir '+(kind==='intervention'?'une intervention':'un chantier')+'</option>'+targets.filter(p=>(p.kind||'project')===kind).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');select.value=selected;tabs.querySelectorAll('button').forEach(b=>{b.className=b.dataset.targetKind===kind?'':'secondary';b.setAttribute('aria-pressed',String(b.dataset.targetKind===kind));});}
 tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(kind!==b.dataset.targetKind){kind=b.dataset.targetKind;selected='';draw();select.dispatchEvent(new select.ownerDocument.defaultView.Event('input',{bubbles:true}));}});
 draw();
}
export async function orderFolder(g,target,group,supplier=''){
 if(target.kind==='intervention'){
 const {rows}=await readInterventions(g),x=rows.find(x=>x.id===target.linkId&&x.status!=='annulee');
 if(!x)throw Error('Cette intervention n’est plus disponible. Actualisez la liste.');
 const root=await g.folder('root','INTERVENTIONS'),dir=await g.folder(root.id,safeName(x.number+'_'+x.id).slice(0,90));
 return g.folder(dir.id,'BONS_COMMANDE');
 }
 const root=await g.folder(target.id,'03_COMMANDES');let dest=await g.folder(root.id,group);
 if(group==='FOURNISSEURS')dest=await g.folder(dest.id,safeName(supplier));
 return dest;
}
export async function linkOrder(g,target,item,details){
 if(target.kind!=='intervention')return;
 const {rows,file}=await readInterventions(g),x=rows.find(x=>x.id===target.linkId&&x.status!=='annulee');
 if(!x||!file?.eTag)throw Error('PDF transféré, mais intervention non liée. Actualisez et réessayez.');
 const old=(x.materialOrders||[]).find(o=>details.recordId&&o.orderRecordId===details.recordId);
 const row={...old,id:old?.id||crypto.randomUUID(),orderRecordId:details.recordId||'',fileId:item.id,name:item.name,title:details.title||'',supplier:details.supplier||'',source:details.source||'fournisseur',pickup:details.pickup||'',notes:details.notes||'',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),history:old?[...(old.history||[]),{...old,history:undefined}]:[]};
 x.materialOrders=old?x.materialOrders.map(o=>o.id===old.id?row:o):[...(x.materialOrders||[]),row];
 try{await g.request(g.base(file.id)+'/content',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':file.eTag},body:new Blob([JSON.stringify(rows)],{type:'application/json'})});}
 catch(e){throw Error('PDF transféré, mais liaison à l’intervention non enregistrée. Actualisez avant de réessayer : '+e.message);}
}
