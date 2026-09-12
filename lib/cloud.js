/* OPUS CHANTIERS · Microsoft Graph / SharePoint.
 * No passwords, no app secret. Files are read/written with the signed-in user's rights.
 * Immutable revisions form a DAG: concurrent saves are retained, never last-writer-wins.
 */
export const GRAPH='https://graph.microsoft.com/v1.0';
export const uid=()=>crypto.randomUUID().replaceAll('-','');
export const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const safeName=s=>String(s||'Sans titre').replace(/["*:<>?/\\|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,110)||'Sans titre';
export const CATEGORIES=[['01','À préparer'],['02','En cours'],['03','À contrôler'],['04','Terminés'],['99','Archives']];
export class CloudError extends Error {constructor(message,status=0,code=''){super(message);this.status=status;this.code=code;}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export class Graph {
 constructor(token,fetcher=fetch){this.token=token;this.fetcher=fetcher;this.drive=null;this.site=null;}
 async request(path,opts={}){
  const url=path.startsWith('https:')?path:GRAPH+path;
  if(!url.startsWith(GRAPH+'/'))throw new CloudError('Adresse Graph non autorisée.');
  let last;
  for(let n=0;n<3;n++){
   try{
    const token=await this.token();
    const headers={Authorization:`Bearer ${token}`,Accept:'application/json',...opts.headers};
    const o={...opts,headers,cache:'no-store',signal:AbortSignal.timeout(35000)};
    if(o.body && !(o.body instanceof Blob) && typeof o.body!=='string'){o.body=JSON.stringify(o.body);headers['Content-Type']='application/json';}
    const r=await this.fetcher(url,o);
    if(r.ok)return r.status===204?null:await r.json();
    let detail;try{detail=await r.json();}catch{detail={};}
    if((r.status===429||r.status>=500)&&n<2){await wait(Math.min(15000,(parseInt(r.headers.get('Retry-After'))||2**n)*1000));continue;}
    const msg=r.status===403?'Accès refusé : vérifier les droits de votre compte ET l’autorisation de l’application sur le site OPUS CHANTIERS.':r.status===401?'Votre connexion Microsoft doit être renouvelée.':r.status===507?'Le stockage Microsoft est plein.':detail?.error?.message||`Erreur Microsoft (${r.status}).`;
    throw new CloudError(msg,r.status,detail?.error?.code||'');
   }catch(e){last=e;if(e instanceof CloudError || n===2)throw e;await wait(800*2**n);}
  }throw last;
 }
 async all(path){let out=[];while(path){const r=await this.request(path);out.push(...(r.value||[]));path=r['@odata.nextLink']||null;}return out;}
 base(id='root'){if(!this.drive)throw new CloudError('Bibliothèque non connectée.');return `/drives/${encodeURIComponent(this.drive.id)}/${id==='root'?'root':'items/'+encodeURIComponent(id)}`;}
 async connect(config){
  this.site=await this.request(`/sites/${config.siteHost}:${config.sitePath}`);
  this.drive=config.driveId?await this.request(`/drives/${encodeURIComponent(config.driveId)}`):await this.request(`/sites/${this.site.id}/drive`);
  // A configured library ID is checked against the selected site's libraries.
  if(config.driveId){const drives=await this.all(`/sites/${this.site.id}/drives`);if(!drives.some(d=>d.id===this.drive.id))throw new CloudError('Cette bibliothèque n’appartient pas au site OPUS CHANTIERS.');}
  return {site:this.site,drive:this.drive};
 }
 children(id='root'){return this.all(this.base(id)+'/children?$top=200');}
 item(id){return this.request(this.base(id));}
 async named(parent,name){try{return await this.request(this.base(parent)+':/'+encodeURIComponent(name));}catch(e){if(e.status===404)return null;throw e;}}
 async folder(parent,name){const old=await this.named(parent,name);if(old){if(!old.folder)throw new CloudError(`${name} est un fichier et non un dossier.`);return old;}
  try{return await this.request(this.base(parent)+'/children',{method:'POST',body:{name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}});}
  catch(e){if(e.status===409){const found=await this.named(parent,name);if(found?.folder)return found;}throw e;}
 }
 async bytes(id){
  // /content redirects break browser CORS. Use a fresh preauthenticated download URL.
  const item=await this.item(id),url=item['@microsoft.graph.downloadUrl'];
  if(!url || !url.startsWith('https://'))throw new CloudError('Ce fichier ne peut pas être téléchargé.');
  const r=await this.fetcher(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw new CloudError(`Lecture du document impossible (${r.status}).`,r.status);
  return await r.blob();
 }
 async json(id){const b=await this.bytes(id);return JSON.parse(await b.text());}
 async upload(parent,name,blob,onProgress=()=>{},immutable=false){
  if(!blob.size)throw new CloudError('Le fichier est vide.');
  // Never replace user documents. Collision renames (or fails for immutable revisions).
  const session=await this.request(this.base(parent)+':/'+encodeURIComponent(name)+':/createUploadSession',{method:'POST',body:{item:{name,'@microsoft.graph.conflictBehavior':immutable?'fail':'rename'}}});
  const url=session.uploadUrl;if(!url?.startsWith('https://'))throw new CloudError('Session de transfert invalide.');
  const chunk=10*327680;let offset=0;
  while(offset<blob.size){let result;let next=offset;
   for(let n=0;n<3;n++){
    const end=Math.min(offset+chunk,blob.size);
    try{
     // The upload URL is preauthorized: NO Authorization header here.
     const r=await this.fetcher(url,{method:'PUT',body:blob.slice(offset,end),headers:{'Content-Range':`bytes ${offset}-${end-1}/${blob.size}`},credentials:'omit',signal:AbortSignal.timeout(90000)});
     if(r.status===200||r.status===201){result=await r.json();next=blob.size;break;}
     if(r.status===202){const d=await r.json();next=parseInt(d.nextExpectedRanges?.[0]||String(end));break;}
     if(r.status===409)throw new CloudError('Un fichier de même nom existe déjà.',409);
     if(r.status===401||r.status===403||r.status===507)throw new CloudError(`Transfert refusé (${r.status}).`,r.status);
     throw new Error('Transfert interrompu');
    }catch(e){if(e instanceof CloudError||n===2)throw e;await wait(1000*2**n);
     // Resume from server state; a lost final response is resolved by the caller's idempotent filename.
     const r=await this.fetcher(url,{credentials:'omit',signal:AbortSignal.timeout(15000)});
     if(r.ok){const d=await r.json();next=parseInt(d.nextExpectedRanges?.[0]||String(offset));offset=next;}
    }
   }
   offset=next;onProgress(Math.min(100,Math.round(offset/blob.size*100)));if(result)return result;
  }
  throw new CloudError('La confirmation du transfert est absente. Réessayez sans supprimer le brouillon.');
 }
 async projects(){
  const root=await this.children(),categories=root.filter(d=>d.folder && CATEGORIES.some(([code])=>d.name.trim().startsWith(code)));
  const projects=[],loose=[];
  for(const cat of categories){const code=CATEGORIES.find(([c])=>cat.name.trim().startsWith(c))[0];
   for(const item of await this.children(cat.id)){
    if(item.folder && !item.name.startsWith('_') && item.name!=='Forms')projects.push({...item,category:code,categoryFolder:cat});
    else if(item.file && !/desktop\.ini$/i.test(item.name))loose.push({...item,category:code,categoryFolder:cat});
   }
  }
  return {categories,projects,loose};
 }
 async moveProject(project,category){return this.request(this.base(project.id),{method:'PATCH',headers:project.eTag?{'If-Match':project.eTag}:{},body:{parentReference:{id:category.id}}});}
}
// Names expose ancestry so branches can be detected without downloading all revisions.
export function revisionName(id,parents=[]){return `r_${id}__p_${parents.length?parents.join('+'):'root'}.json`;}
export function parseRevision(file){const m=/^r_([a-f0-9]{32})__p_(root|[a-f0-9+]+)\.json$/.exec(file.name);if(!m)return null;return {...file,revision:m[1],parents:m[2]==='root'?[]:m[2].split('+')};}
export function revisionHeads(files){const records=files.map(parseRevision).filter(Boolean);const cited=new Set(records.flatMap(r=>r.parents));return records.filter(r=>!cited.has(r.revision)).sort((a,b)=>(b.createdDateTime||'').localeCompare(a.createdDateTime||''));}
export class Journal {
 constructor(graph){this.g=graph;this.assetCache=new Map();}
 async directory(projectId,kind,id,create=false){
  const step=async(p,n)=>create?await this.g.folder(p,n):await this.g.named(p,n);
  let d=await step(projectId,'_OPUS');if(!d)return null;
  d=await step(d.id,kind);if(!d)return null;
  return id?await step(d.id,id):d;
 }
 async load(projectId,kind,id,revisionId=null){
  const dir=await this.directory(projectId,kind,id);if(!dir)return {data:null,heads:[],files:[],dir:null};
  const files=(await this.g.children(dir.id)).filter(f=>parseRevision(f));const heads=revisionHeads(files);
  const target=revisionId?files.map(parseRevision).find(f=>f.revision===revisionId):heads[0];
  if(!target)return {data:null,heads,files,dir};
  const doc=await this.g.json(target.id);
  return {data:await this.hydrate(doc.payload),heads,files,dir,doc,selected:parseRevision(target)};
 }
 async pack(value,projectId){
  if(typeof value==='string' && /^data:image\/(png|jpeg|webp);base64,/.test(value)){
   const key=await sha(value),cacheKey=projectId+':'+key;if(this.assetCache.has(cacheKey))return this.assetCache.get(cacheKey);
   const photos=await this.g.folder(projectId,'06_PHOTOS');const dir=await this.g.folder(photos.id,'Attestations');
   const mime=value.split(';')[0].slice(5),blob=dataBlob(value),name=key+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg');
   let item=await this.g.named(dir.id,name);
   if(!item){try{item=await this.g.upload(dir.id,name,blob,()=>{},true);}catch(e){item=await this.g.named(dir.id,name);if(!item)throw e;}}
   const ref={$opusAsset:{id:item.id,mime,name}};this.assetCache.set(cacheKey,ref);return ref;
  }
  if(Array.isArray(value)){const a=[];for(const x of value)a.push(await this.pack(x,projectId));return a;}
  if(value&&typeof value==='object'){const obj={};for(const [k,v]of Object.entries(value))obj[k]=await this.pack(v,projectId);return obj;}
  return value;
 }
 async hydrate(value){
  if(value?.$opusAsset){const a=value.$opusAsset;return await blobData(await this.g.bytes(a.id));}
  if(Array.isArray(value)){const a=[];for(const x of value)a.push(await this.hydrate(x));return a;}
  if(value&&typeof value==='object'){const obj={};for(const[k,v]of Object.entries(value))obj[k]=await this.hydrate(v);return obj;}
  return value;
 }
 async save(draft,user){
  const dir=await this.directory(draft.projectId,draft.kind,draft.recordId,true),name=revisionName(draft.revision,draft.parents);
  // Retrying the same local draft after lost response does not create another revision.
  let file=await this.g.named(dir.id,name);
  if(!file){const payload=await this.pack(draft.payload,draft.projectId);
   const body={format:'OPUS-CLOUD-3',revision:draft.revision,parents:draft.parents,createdAt:draft.createdAt,author:{id:user.id,name:user.displayName,email:user.mail||user.userPrincipalName},payload};
   const blob=new Blob([JSON.stringify(body)],{type:'application/json'});
   try{file=await this.g.upload(dir.id,name,blob,()=>{},true);}catch(e){file=await this.g.named(dir.id,name);if(!file)throw e;}
  }
  const heads=revisionHeads(await this.g.children(dir.id));return {file,heads};
 }
}
export async function sha(s){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function dataBlob(url){const [meta,b64]=url.split(',');const b=atob(b64);return new Blob([Uint8Array.from(b,c=>c.charCodeAt(0))],{type:meta.split(':')[1].split(';')[0]});}
export function blobData(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob);});}
export class LocalStore {
 constructor(namespace){this.namespace=namespace;}
 async db(){return new Promise((res,rej)=>{const q=indexedDB.open('opus-chantiers-cloud-3',1);q.onupgradeneeded=()=>q.result.createObjectStore('records',{keyPath:'key'});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
 async action(mode,fn){const db=await this.db();return new Promise((res,rej)=>{const tx=db.transaction('records',mode);let value;const req=fn(tx.objectStore('records'));if(req)req.onsuccess=()=>value=req.result;tx.oncomplete=()=>{db.close();res(value);};tx.onerror=()=>{db.close();rej(tx.error);};tx.onabort=()=>{db.close();rej(tx.error||Error('Stockage local interrompu'));};});}
 async set(key,value){return this.action('readwrite',s=>s.put({key:this.namespace+'|'+key,value}));}
 async get(key){return (await this.action('readonly',s=>s.get(this.namespace+'|'+key)))?.value;}
 async remove(key){return this.action('readwrite',s=>s.delete(this.namespace+'|'+key));}
 async all(prefix=''){return (await this.action('readonly',s=>s.getAll())).filter(r=>r.key.startsWith(this.namespace+'|'+prefix)).map(r=>({key:r.key.slice(this.namespace.length+1),value:r.value}));}
}
