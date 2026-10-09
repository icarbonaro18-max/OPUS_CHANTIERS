const hashes=new WeakMap();
function signature(photo){const old=hashes.get(photo);if(old?.data===photo.dataUrl)return old.hash;let h=2166136261;for(let i=0;i<photo.dataUrl.length;i++)h=Math.imul(h^photo.dataUrl.charCodeAt(i),16777619);const hash=(h>>>0).toString(16)+':'+photo.dataUrl.length;hashes.set(photo,{data:photo.dataUrl,hash});return hash;}
export function reportPhotos(record,visit=false){
 const out=[];const add=(photos,where)=>{for(const photo of photos||[])if(photo&&typeof photo.dataUrl==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl))out.push({photo,label:'Photo '+(out.length+1)+' — '+where});};
 add(record.photos,'vue générale');for(const [i,item]of (visit?record.visitTasks||[]:record.reportItems||[]).entries()){
  const title=item.room||item.location||item.title||'Point '+(i+1);add(item.photos,title);
  if(!visit)for(const [key,label]of [['before','avant'],['during','pendant'],['after','après']])add(item.phasePhotos?.[key],title+' — '+label);
 }return out;
}
export function photoEvidence(record,visit=false){const photos=reportPhotos(record,visit);return photos.length?{photoEvidence:photos.map(({photo,label})=>({label,signature:signature(photo)}))}:{};}
export async function compactReportPhoto({photo}){
 const blob=await(await fetch(photo.dataUrl)).blob(),bitmap=await createImageBitmap(blob);
 try{const canvas=document.createElement('canvas');let size=1400,quality=.8;
 for(let attempt=0;attempt<5;attempt++){const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',quality);if(data.length<450000)return data;size*=.8;quality-=.08;}
 throw Error('Une photo est trop volumineuse pour l’analyse. Réduisez-la puis réessayez.');
 }finally{bitmap.close();}
}
export async function generateExplainedReport(assistant,source,photos,{visit=false,onProgress=()=>{},isCurrent=()=>true,compress=compactReportPhoto}={}){
 const observations=[];for(let i=0;i<photos.length;i+=6){if(!isCurrent())throw Error('Les notes ou les photos ont changé. Relancez la rédaction.');const batch=photos.slice(i,i+6),images=[];onProgress('Analyse des photos '+(i+1)+' à '+Math.min(i+6,photos.length)+' sur '+photos.length+'…');
  for(const photo of batch)images.push(await compress(photo));
  if(!isCurrent())throw Error('Les notes ou les photos ont changé. Relancez la rédaction.');
  const result=await assistant.request('report_photo_observations',JSON.stringify({labels:batch.map(p=>p.label),purpose:'Décrire uniquement les éléments visibles utiles au compte rendu électrique. Ne pas déduire de travaux ou essais réalisés.'}),{},images);
  observations.push(result.text);
 }
 if(!isCurrent())throw Error('Les notes ou les photos ont changé. Relancez la rédaction.');onProgress('Rédaction du compte rendu explicatif pour le client…');
 return assistant.request(visit?'visit_report_fr':'report_fr',JSON.stringify({...source,audience:'client non spécialiste en électricité',style:'explicatif et structuré, proportionné aux faits disponibles',photoObservations:observations}));
}
