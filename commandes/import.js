// Keep document text and product references; shorten tracking URLs only.
export function compactOrderText(value){
 return String(value||'').replace(/https?:\/\/[^\s<>"']+/gi,raw=>{
  try{let u=new URL(raw);for(let n=0;n<3&&u.hostname.endsWith('.safelinks.protection.outlook.com');n++){const target=u.searchParams.get('url');if(!target)break;const next=new URL(target);if(!['http:','https:'].includes(next.protocol))break;u=next;}
   for(const key of [...u.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key))u.searchParams.delete(key);
   return u.href;
  }catch{return raw;}
 }).replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();
}
export function orderBatches(text,images){
 const clean=compactOrderText(text);
 if(clean.length>180000)throw Error('Le texte dépasse 180 000 caractères après nettoyage. Importez uniquement la commande concernée. Aucune ligne n’a été supprimée.');
 if(images.length>30)throw Error('Maximum 30 pages par commande.');
 const batches=[];let current={text:clean,images:[]};
 const size=b=>new TextEncoder().encode(JSON.stringify(b)).length;
 for(const image of images){
  if(size({text:'',images:[image]})>3000000)throw Error('Une page reste trop lourde. Réduisez cette image ou utilisez le PDF du fournisseur.');
  const next={text:current.text,images:[...current.images,image]};
  if(next.images.length>4||size(next)>3000000){batches.push(current);current={text:'',images:[image]};}else current=next;
 }
 if(current.text.trim()||current.images.length)batches.push(current);
 if(!batches.length)throw Error('Ajoutez un document ou le contenu de l’e-mail.');
 return batches;
}
export function mergeOrderParts(parts){
 const result={items:[],warnings:[]};
 const same=(a,b)=>String(a).trim().toLocaleLowerCase('fr');
 for(const part of parts){
  if(!Array.isArray(part?.items)||!Array.isArray(part?.warnings))throw Error('Lecture incomplète. Le bon précédent est conservé.');
  for(const key of ['supplier','number','date','clientReference','deliveryMode','destination','availability','notes']){
   const value=String(part[key]||'').trim();if(!value||value==='inconnu')continue;
   if(result[key]&&same(result[key])!==same(value)){
    if(key==='number')throw Error('Plusieurs numéros de commande détectés. Importez une seule commande à la fois. Le bon précédent est conservé.');
    result.warnings.push(`À vérifier — ${key} : ${result[key]} / ${value}`);
   }else result[key]=value;
  }
  result.items.push(...part.items);result.warnings.push(...part.warnings.map(String));
 }
 if(result.items.length>300)throw Error('Plus de 300 lignes détectées. Séparez les commandes ; aucune ligne n’a été supprimée.');
 result.deliveryMode||='inconnu';
 if(parts.length>1)result.warnings.unshift(`${parts.length} lectures réunies. Vérifiez les éventuels doublons entre l’e-mail et les pages : aucune ligne n’a été fusionnée ou supprimée.`);
 return result;
}
export async function extractOrder(text,images,request,progress=()=>{}){
 const batches=orderBatches(text,images),parts=[];
 for(let i=0;i<batches.length;i++){
  progress(`Lecture de la commande : ${i+1}/${batches.length}…`);
  try{const {order}=await request(batches[i]);parts.push(order);}catch(error){throw Error(`Lecture ${i+1}/${batches.length} interrompue : ${error.message} Aucun résultat partiel n’a remplacé votre bon ; les sources sont conservées.`);}
 }
 return mergeOrderParts(parts);
}
