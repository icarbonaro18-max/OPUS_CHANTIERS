// Structured, price-free order lines. One metadata file per attached order PDF.
const filename=id=>Array.from(new TextEncoder().encode(id),b=>b.toString(16).padStart(2,'0')).join('')+'.json';
const text=v=>String(v??'').trim();
export function cleanOrderItems(items){
 if(!Array.isArray(items)||items.length>500)throw Error('Liste de matériel invalide.');
 return items.map(i=>{const quantity=text(i.quantity).replace(',','.');if(!text(i.description)||!/^\d+(?:\.\d+)?$/.test(quantity)||Number(quantity)<=0)throw Error('Matériel : désignation ou quantité invalide.');return {reference:text(i.reference),description:text(i.description),quantity,unit:text(i.unit)};});
}
export async function saveOrderMaterials(g,target,file,details){
 const items=cleanOrderItems(details.items),kind=target.kind==='intervention'?'intervention':'project',affairId=kind==='intervention'?target.linkId:target.id;
 if(!file.id||!affairId)throw Error('Bon non rattaché à une affaire.');
 const system=await g.folder('root','_OPUS_SYSTEM'),folder=await g.folder(system.id,'MATERIEL_COMMANDES');
 const row={version:1,fileId:file.id,fileName:file.name,affairId,affairKind:kind,number:text(details.title),supplier:text(details.supplier),source:details.source==='depot'?'depot':'fournisseur',recordId:text(details.recordId),items,updatedAt:new Date().toISOString()};
 await g.writeJson(folder.id,filename(file.id),row);return row;
}
export function orderIdentity(row){return row.number&&row.supplier?'order:'+row.source+':'+row.supplier.toLowerCase()+':'+row.number.toLowerCase():row.recordId?'record:'+row.recordId:'file:'+row.fileId;}
export function materialCandidates(orders,reports,current){
 const latest=new Map();for(const o of orders){const key=orderIdentity(o),old=latest.get(key);if(!old||String(o.updatedAt||'')>String(old.updatedAt||''))latest.set(key,o);}
 const other=reports.filter(r=>r.id!==current.id&&!r.deletedAt&&!r.reportDeletedAt&&!['annulee','cancelled'].includes(r.status)&&(current.projectId?r.projectId===current.projectId:r.id===current.id));
 const used=new Map();for(const r of other)for(const item of r.materialUsage||[])used.set(item.key,(used.get(item.key)||0)+Number(item.usedQuantity||0));
 const already=new Set((current.materialUsage||[]).map(i=>i.key)),out=[];
 for(const [identity,o]of latest){const occurrences=new Map();for(const item of cleanOrderItems(o.items)){
  const signature=JSON.stringify([item.reference,item.description,item.unit]),n=occurrences.get(signature)||0;occurrences.set(signature,n+1);const key=JSON.stringify([identity,signature,n]);
  const declared=used.get(key)||0;out.push({...item,key,fileId:o.fileId,fileName:o.fileName,orderNumber:o.number,supplier:o.supplier,source:o.source,declaredQuantity:declared,remainingQuantity:Math.max(0,Math.round((Number(item.quantity)-declared)*1000000)/1000000),already:already.has(key)});
 }}return out;
}
export async function readOrderMaterials(g,files,affair,{readPdf}={}){
 const unique=[...new Map(files.map(f=>[f.fileId||f.id,f])).values()],orders=[],unread=[];
 const system=await g.named('root','_OPUS_SYSTEM'),folder=system?await g.named(system.id,'MATERIEL_COMMANDES'):null;
 const entries=folder?await g.children(folder.id):[],byName=new Map(entries.map(f=>[f.name,f]));
 // Sequential fallback parsing avoids loading many large PDFs at once on tablets.
 for(const file of unique){const id=file.fileId||file.id,meta=byName.get(filename(id));try{
  let row;if(meta){row=await g.json(meta.id,meta);if(row.fileId!==id||row.affairId!==affair.id||row.affairKind!==affair.kind)throw Error('Liaison du bon invalide.');row.items=cleanOrderItems(row.items);}
  else if(Array.isArray(file.items)){row={fileId:id,fileName:file.name,number:file.title,supplier:file.supplier,source:file.source,recordId:file.orderRecordId,items:cleanOrderItems(file.items)};}
  else{if(!readPdf||! /\.pdf$/i.test(file.name||'')||file.size>20*1024*1024)throw Error('Document sans liste exploitable.');const extracted=await readPdf(file);row={...extracted,fileId:id,fileName:file.name,source:file.source||'fournisseur',updatedAt:file.lastModifiedDateTime||''};}
  orders.push(row);
 }catch(e){unread.push({file,name:file.name,error:e.message});}}
 return {orders,unread};
}
