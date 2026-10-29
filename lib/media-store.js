export function hasInlineImages(value){
 if(typeof value==='string')return /^data:image\/(png|jpeg|webp);base64,/.test(value);
 if(Array.isArray(value))return value.some(hasInlineImages);
 return !!value&&typeof value==='object'&&Object.values(value).some(hasInlineImages);
}
export function hasMediaReferences(value){
 if(!value||typeof value!=='object')return false;if(value.$opusAsset)return true;
 return Object.values(value).some(hasMediaReferences);
}
const leaves=(value,test,out=new Set())=>{if(test(value))out.add(typeof value==='string'?value:value.$opusAsset.id);else if(value&&typeof value==='object')for(const item of Object.values(value))leaves(item,test,out);return out;};
const aborted=signal=>{if(signal?.aborted)throw Error('Opération arrêtée. Les fichiers d’origine restent conservés.');};
export class MediaStore{
 constructor(graph,{store=null,digest,decode,encode,concurrency=4,memoryBudget=24*1024*1024}={}){this.g=graph;this.store=store;this.digest=digest;this.decode=decode;this.encode=encode;this.limit=concurrency;this.running=0;this.waiters=[];this.uploads=new Map();this.downloads=new Map();this.memory=new Map();this.memoryBytes=0;this.memoryBudget=memoryBudget;this.directories=new Map();}
 remember(id,data){
  if(this.memory.has(id)){this.memoryBytes-=this.memory.get(id).length*2;this.memory.delete(id);}
  const bytes=data.length*2;if(bytes>this.memoryBudget)return;
  this.memory.set(id,data);this.memoryBytes+=bytes;
  while(this.memoryBytes>this.memoryBudget&&this.memory.size){const [old,value]=this.memory.entries().next().value;this.memory.delete(old);this.memoryBytes-=value.length*2;}
 }
 async slot(work){if(this.running>=this.limit)await new Promise(resolve=>this.waiters.push(resolve));else this.running++;try{return await work();}finally{const next=this.waiters.shift();if(next)next();else this.running--;}}
 async walk(value,leaf){
  if(typeof value==='string'||value?.$opusAsset)return leaf(value);
  if(Array.isArray(value))return Promise.all(value.map(item=>this.walk(item,leaf)));
  if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,item])=>[key,await this.walk(item,leaf)])));
  return value;
 }
 progress(total,callback){let done=0;return()=>{done++;try{callback?.({done,total});}catch{}};}
 imageDirectory(parent){if(!this.directories.has(parent)){const task=(async()=>{const root=await this.g.folder(parent,'06_PHOTOS');return this.g.folder(root.id,'Attestations');})();this.directories.set(parent,task);task.catch(()=>{if(this.directories.get(parent)===task)this.directories.delete(parent);});}return this.directories.get(parent);}
 async pack(value,parent,{onProgress,signal}={}){
  const complete=this.progress(leaves(value,x=>typeof x==='string'&&hasInlineImages(x)).size,onProgress),seen=new Set();
  return this.walk(value,async item=>{
   if(typeof item!=='string'||!hasInlineImages(item))return item;aborted(signal);
   const hash=await this.slot(()=>this.digest(item)),key=parent+':'+hash;
   if(!this.uploads.has(key)){
    const task=this.slot(async()=>{aborted(signal);const dir=await this.imageDirectory(parent),mime=item.split(';')[0].slice(5),name=hash+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg');let file=await this.g.named(dir.id,name);
     const blob=this.decode(item);if(!file){try{file=await this.g.upload(dir.id,name,blob,()=>{},true);}catch(error){file=await this.g.named(dir.id,name);if(!file)throw error;}}
     if(!file?.id)throw Error('Une photo n’a pas été confirmée dans le stockage.');try{await this.store?.set('asset:'+file.id,blob);}catch{}return {$opusAsset:{id:file.id,mime,name}};
    });this.uploads.set(key,task);task.catch(()=>{if(this.uploads.get(key)===task)this.uploads.delete(key);});
   }
   const ref=await this.uploads.get(key);if(!seen.has(key)){seen.add(key);complete();}return ref;
  });
 }
 async image(asset){
  if(this.memory.has(asset.id)){const value=this.memory.get(asset.id);this.memory.delete(asset.id);this.memory.set(asset.id,value);return value;}
  if(!this.downloads.has(asset.id)){
   const task=this.slot(async()=>{
    let blob;try{blob=await this.store?.get('asset:'+asset.id);}catch{}
    if(!(blob instanceof Blob)||!blob.size){blob=await this.g.bytes(asset.id);try{await this.store?.set('asset:'+asset.id,blob);}catch{/* A full device cache must not prevent reading a remote photo. */}}
    if(!blob?.size)throw Error('Une photo téléchargée est vide. Sa référence d’origine est conservée.');if(asset.mime&&blob.type!==asset.mime)blob=new Blob([blob],{type:asset.mime});const data=await this.encode(blob);this.remember(asset.id,data);return data;
   });this.downloads.set(asset.id,task);task.finally(()=>{if(this.downloads.get(asset.id)===task)this.downloads.delete(asset.id);}).catch(()=>{});
  }
  return this.downloads.get(asset.id);
 }
 async hydrate(value,{onProgress}={}){
  const complete=this.progress(leaves(value,x=>!!x?.$opusAsset).size,onProgress),seen=new Set();
  return this.walk(value,async item=>{if(!item?.$opusAsset)return item;const data=await this.image(item.$opusAsset);if(!seen.has(item.$opusAsset.id)){seen.add(item.$opusAsset.id);complete();}return data;});
 }
}
