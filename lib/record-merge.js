// Merge only records actually changed on this device. Never resolve two
// different edits to the same record by silently choosing a winner.
export function equalData(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equalData(a[key],b[key]));
}
function byId(rows){
 if(!Array.isArray(rows)||rows.some(row=>!row?.id)||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('La liste ne permet pas une fusion sûre par fiche.');
 return new Map(rows.map(row=>[row.id,row]));
}
export function mergeRecords(base,local,remote){
 const before=byId(base),after=byId(local),latest=byId(remote),merged=new Map(latest);
 for(const id of new Set([...before.keys(),...after.keys()])){
  const old=before.get(id),wanted=after.get(id),current=latest.get(id);
  if(equalData(old,wanted))continue;
  if(!equalData(current,old)&&!equalData(current,wanted))throw Object.assign(Error('Cette fiche a été modifiée sur un autre appareil. Votre brouillon est conservé ; actualisez avant de reprendre.'),{status:412,recordId:id});
  if(wanted)merged.set(id,wanted);else merged.delete(id);
 }
 const numbers=new Map();
 for(const row of merged.values())if(row.number){const other=numbers.get(row.number);if(other&&other!==row.id)throw Object.assign(Error('Ce numéro a été attribué sur un autre appareil. Votre brouillon reste conservé.'),{status:412});numbers.set(row.number,row.id);}
 return [...merged.values()];
}
