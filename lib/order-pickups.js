// Shared receipts are separate from reports and order PDFs, one file per order.
const filename=id=>Array.from(new TextEncoder().encode(id),b=>b.toString(16).padStart(2,'0')).join('')+'.json';
let reading=0;const queue=[];
export function queuePickupRead(work){return new Promise((resolve,reject)=>{queue.push({work,resolve,reject});drain();});}
function drain(){while(reading<3&&queue.length){const job=queue.shift();reading++;Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{reading--;drain();});}}
export async function loadPickupStates(g,files){
 const states=new Map();if(!files.length)return states;
 const system=await g.named('root','_OPUS_SYSTEM');if(!system)return states;
 const folder=await g.named(system.id,'RETRAITS_COMMANDES');if(!folder)return states;
 const entries=await g.children(folder.id),byName=new Map(entries.map(x=>[x.name,x]));
 for(const id of new Set(files.map(f=>f.fileId||f.id).filter(Boolean))){const item=byName.get(filename(id));if(!item)continue;const row=await g.json(item.id);if(row?.fileId!==id||!row.collectedAt)throw Error('Suivi de retrait invalide. Actualisez avant de continuer.');states.set(id,row);}
 return states;
}
export async function collectOrder(g,file,user,affair){
 const fileId=file.fileId||file.id;if(!fileId)throw Error('Bon de commande introuvable.');
 const actor=user?.displayName||user?.mail||user?.userPrincipalName;if(!actor)throw Error('Reconnectez-vous pour confirmer le retrait.');
 const system=await g.folder('root','_OPUS_SYSTEM'),folder=await g.folder(system.id,'RETRAITS_COMMANDES'),name=filename(fileId);
 const existing=await g.named(folder.id,name);if(existing){const row=await g.json(existing.id);if(row.fileId===fileId&&row.collectedAt)return row;throw Error('Suivi de retrait invalide.');}
 const receipt={fileId,fileName:file.name||'',affairId:affair.id,affairKind:affair.kind,collectedAt:new Date().toISOString(),collectedBy:actor,collectedById:user.id||''};
 await g.writeJson(folder.id,name,receipt);return receipt;
}
export const pickupCount=(files,states)=>files.filter(f=>!states.has(f.fileId||f.id)).length;
export function pickupBadge(count){return count?'<span class="orderPickupBadge" aria-label="'+count+' commande(s) à récupérer">'+count+'</span>':'';}
