const FORMAT='OPUS-PENDING-BACKUP-1';
const ALLOWED=['draft:','pdfoutbox:','report-recovery:','setup-draft:'];
const allowed=key=>typeof key==='string'&&ALLOWED.some(prefix=>key.startsWith(prefix));
const fileName=name=>typeof name==='string'&&/^entry-\d{5}(?:-\d{5})?\.(json|bin)$/.test(name);
export async function pendingKeys(store){
 const result=[];for(const prefix of ALLOWED){const keys=typeof store.keys==='function'?await store.keys(prefix):(await store.all(prefix)).map(row=>row.key);result.push(...keys);}return result;
}
async function writeChecked(directory,name,blob){
 const handle=await directory.getFileHandle(name,{create:true}),writer=await handle.createWritable();
 try{await writer.write(blob);await writer.close();}catch(error){try{await writer.abort();}catch{}throw error;}
 if((await handle.getFile()).size!==blob.size)throw Error('La copie du fichier n’a pas été confirmée. Les brouillons d’origine sont conservés.');
}
export {writeChecked as writeBackupFile};
export async function backupPending({store,directory,textStorage,reportPrefix='',onProgress=()=>{}}){
 if(!store?.namespace)throw Error('Reconnectez le compte avant de sauvegarder ses brouillons.');
 const name='OPUS_BROUILLONS_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+crypto.randomUUID().slice(0,8),folder=await directory.getDirectoryHandle(name,{create:true}),keys=await pendingKeys(store),entries=[];
 if(keys.length>5000)throw Error('Trop de fiches pour cette sauvegarde : faites d’abord vérifier les envois en attente. Les originaux sont conservés.');
 for(const [i,key]of keys.entries()){
  const value=await store.get(key);if(value===undefined)continue;let binaries=0;const prefix='entry-'+String(i).padStart(5,'0');
  const pack=async input=>{
   if(input instanceof Blob){const file=prefix+'-'+String(binaries++).padStart(5,'0')+'.bin';await writeChecked(folder,file,input);return {$opusBackupBlob:{file,size:input.size,mime:input.type}};}
   if(Array.isArray(input)){const out=[];for(const x of input)out.push(await pack(x));return out;}
   if(input&&typeof input==='object'){const out={};for(const [k,x]of Object.entries(input))Object.defineProperty(out,k,{value:await pack(x),enumerable:true,writable:true,configurable:true});return out;}
   return input;
  };
  const packed=await pack(value),file=prefix+'.json',blob=new Blob([JSON.stringify(packed)],{type:'application/json'});if(blob.size>64*1024*1024)throw Error('Cette fiche dépasse la taille de sauvegarde prise en charge sur tablette. Les originaux restent conservés.');await writeChecked(folder,file,blob);entries.push({key,file,size:blob.size});onProgress({done:i+1,total:keys.length});
 }
 const text=[];if(textStorage&&reportPrefix)for(let i=0;i<textStorage.length;i++){const key=textStorage.key(i);if(key?.startsWith(reportPrefix))text.push({key,value:textStorage.getItem(key)});}
 const manifest={format:FORMAT,namespace:store.namespace,createdAt:new Date().toISOString(),entries,text};
 // A folder is a complete backup only after the final manifest has been closed.
 const manifestBlob=new Blob([JSON.stringify(manifest)],{type:'application/json'});if(manifestBlob.size>2*1024*1024)throw Error('Le manifeste est trop volumineux. Les originaux restent conservés.');await writeChecked(folder,'manifest.json',manifestBlob);return {name,count:entries.length,textCount:text.length};
}
export async function restorePending({store,directory,textStorage,reportPrefix='',onProgress=()=>{}}){
 if(!store?.namespace)throw Error('Reconnectez le compte avant de reprendre ses brouillons.');
 const manifestFile=await(await directory.getFileHandle('manifest.json')).getFile();if(manifestFile.size>2*1024*1024)throw Error('Le dossier choisi ne contient pas une sauvegarde OPUS valide.');
 const manifest=JSON.parse(await manifestFile.text());
 if(manifest.format!==FORMAT||manifest.namespace!==store.namespace)throw Error('Cette sauvegarde appartient à un autre compte ou n’est pas une sauvegarde OPUS.');
 if(!Array.isArray(manifest.entries)||manifest.entries.length>5000||!Array.isArray(manifest.text))throw Error('Le manifeste de sauvegarde n’est pas valide.');
 const seen=new Set();for(const entry of manifest.entries){if(!allowed(entry.key)||!fileName(entry.file)||!entry.file.endsWith('.json')||seen.has(entry.key)||!Number.isSafeInteger(entry.size)||entry.size<0)throw Error('La sauvegarde contient une référence non autorisée.');seen.add(entry.key);}
 const unpack=async input=>{
  if(input?.$opusBackupBlob){const a=input.$opusBackupBlob;if(!fileName(a.file)||!a.file.endsWith('.bin')||!Number.isSafeInteger(a.size)||a.size<0)throw Error('Référence de pièce jointe invalide.');const file=await(await directory.getFileHandle(a.file)).getFile();if(file.size!==a.size)throw Error('Une pièce jointe est incomplète. La sauvegarde est conservée.');return new Blob([file],{type:typeof a.mime==='string'?a.mime:'application/octet-stream'});}
  if(Array.isArray(input)){const out=[];for(const x of input)out.push(await unpack(x));return out;}
  if(input&&typeof input==='object'){const out={};for(const [key,value]of Object.entries(input))Object.defineProperty(out,key,{value:await unpack(value),enumerable:true,writable:true,configurable:true});return out;}
  return input;
 };
 let restored=0,skipped=0;
 try{
  for(const [i,entry]of manifest.entries.entries()){
   if(await store.get(entry.key)!==undefined){skipped++;continue;}
   const file=await(await directory.getFileHandle(entry.file)).getFile();if(file.size!==entry.size||file.size>64*1024*1024)throw Error('Une fiche est incomplète ou trop volumineuse pour être reprise sur cet appareil.');
   const value=await unpack(JSON.parse(await file.text()));
   // The read/write transaction also protects a draft saved in another window
   // while its backup file was being read from the card.
   const inserted=store.setIfAbsent?await store.setIfAbsent(entry.key,value):await store.get(entry.key)===undefined&&(await store.set(entry.key,value),true);
   if(inserted)restored++;else skipped++;onProgress({done:i+1,total:manifest.entries.length});
  }
  if(textStorage&&reportPrefix)for(const row of manifest.text){if(typeof row?.key!=='string'||!row.key.startsWith(reportPrefix)||typeof row.value!=='string')throw Error('Référence de saisie locale invalide.');if(textStorage.getItem(row.key)===null)textStorage.setItem(row.key,row.value);}
 }catch(error){throw Error('Reprise interrompue après '+restored+' fiche(s). Les copies déjà reprises et la sauvegarde sont conservées. '+error.message);}
 return {restored,skipped};
}
const size=value=>Number.isFinite(value)?(value/1024/1024).toFixed(0)+' Mo':'Non communiqué';
export async function deviceStorageInfo(navigator,timeoutMs=1200){
 const storage=navigator?.storage;
 const bounded=async(read,fallback)=>{let timer;try{return await Promise.race([Promise.resolve().then(read),new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),timeoutMs);})]);}catch{return fallback;}finally{clearTimeout(timer);}};
 const [estimate,persistent]=await Promise.all([bounded(()=>storage?.estimate?.(),null),bounded(()=>storage?.persisted?.(),null)]);
 return {usage:estimate?.usage??null,quota:estimate?.quota??null,persistent:persistent??null};
}
export async function openDeviceStorage({store,modal,navigator,window,textStorage,reportPrefix='',onRestored=()=>{}}){
 if(!store)throw Error('Connectez votre compte pour voir le stockage de cet appareil.');
 modal('Stockage de cette tablette','<p role="status" id="deviceStatus">Vérification du stockage local…</p><div id="deviceDetails"></div><div class="actionRow"><button type="button" id="protectDevice">Protéger les brouillons sur cet appareil</button><button type="button" id="backupDevice">Copier les envois vers un dossier / carte SD</button><button type="button" id="restoreDevice" class="secondary">Reprendre une sauvegarde</button></div><p class="muted">Les copies restent dans le dossier choisi. La carte SD ajoute du stockage, pas de mémoire vive. Ne retirez pas la carte pendant une copie. Pour reprendre, sélectionnez le dossier OPUS_BROUILLONS créé par la sauvegarde.</p>');
 const status=document.getElementById('deviceStatus'),details=document.getElementById('deviceDetails'),protect=document.getElementById('protectDevice'),backup=document.getElementById('backupDevice'),restore=document.getElementById('restoreDevice');
 const draw=async()=>{const info=await deviceStorageInfo(navigator);if(!details.isConnected)return;details.replaceChildren();const p=document.createElement('p');p.textContent='Utilisé par l’application : '+size(info.usage)+' · Limite estimée du navigateur : '+size(info.quota)+' · '+(info.persistent===true?'Stockage protégé':info.persistent===false?'Protection non accordée':'Protection non vérifiée');details.append(p);};
 await draw();if(!status.isConnected)return;status.textContent='Les envois restent sur cet appareil jusqu’à confirmation de leur transfert.';
 if(!navigator.storage?.persist){protect.disabled=true;protect.title='Protection non disponible dans ce navigateur.';}
 if(!window.showDirectoryPicker){backup.disabled=restore.disabled=true;status.textContent='Le choix d’un dossier n’est pas disponible dans ce navigateur. La sauvegarde de secours et les téléchargements restent accessibles dans Envois en attente.';}
 let busy=false;const run=async action=>{if(busy)return;busy=true;const state=[protect,backup,restore].map(button=>button.disabled);[protect,backup,restore].forEach(button=>button.disabled=true);try{await action();}catch(error){status.textContent=error.name==='AbortError'?'Choix du dossier annulé.':error.name==='NotFoundError'?'Le dossier ou un fichier de sauvegarde est introuvable. Vérifiez le dossier choisi et la carte.':error.name==='NotAllowedError'?'Accès au dossier non accordé. Sélectionnez à nouveau le dossier.':error.message;}finally{[protect,backup,restore].forEach((button,i)=>button.disabled=state[i]);busy=false;}};
 protect.onclick=()=>run(async()=>{const granted=await navigator.storage.persist();await draw();status.textContent=granted?'Protection du stockage accordée par le navigateur.':'Le navigateur n’a pas accordé la protection. Vos brouillons restent conservés ; copiez les envois importants vers un dossier.';});
 const progress=p=>{status.textContent='Copie locale : '+p.done+'/'+p.total;};
 backup.onclick=()=>run(async()=>{const directory=await window.showDirectoryPicker({mode:'readwrite'});status.textContent='Copie des envois en attente…';const result=await backupPending({store,directory,textStorage,reportPrefix,onProgress:progress});status.textContent=result.count+' fiche(s) copiée(s) dans '+result.name+'. Les originaux restent sur cet appareil.';});
 restore.onclick=()=>run(async()=>{const directory=await window.showDirectoryPicker({mode:'read'});status.textContent='Reprise des envois sauvegardés…';const result=await restorePending({store,directory,textStorage,reportPrefix,onProgress:progress});await onRestored();status.textContent=result.restored+' fiche(s) reprise(s) ; '+result.skipped+' déjà présente(s), laissée(s) intacte(s).';});
}
