import {safeName,dataBlob,sha,uid} from './cloud.js';
import {hasMediaReferences} from './media-store.js';

export const recordHash=record=>sha(JSON.stringify(record));
const bytesHash=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(byte=>byte.toString(16).padStart(2,'0')).join('');

async function confirmedFile(graph,parent,name,blob,check){
 check();const expected=await bytesHash(blob);let file=await graph.named(parent,name);
 if(!file){try{file=await graph.upload(parent,name,blob,()=>{},true);}catch(error){file=await graph.named(parent,name);if(!file)throw error;}}
 if(!file?.id)throw Error('Archive OneDrive non confirmée.');
 file=await graph.item(file.id);if(!file.file||!file.eTag||file.size!==blob.size)throw Error('Archive OneDrive incomplète.');
 const copied=await graph.bytes(file.id,file);if(await bytesHash(copied)!==expected)throw Error('La vérification de l’archive OneDrive a échoué.');
 return {id:file.id,name:file.name,size:file.size,eTag:file.eTag,sha256:expected};
}
export async function verifyPermanentArchive(graph,archive,{check=()=>{}}={}){
 check();if(!archive?.manifestId||!archive.snapshotId)throw Error('Justificatif d’archive OneDrive absent.');
 const meta=await graph.item(archive.manifestId);if(!meta.file||meta.eTag!==archive.manifestTag)throw Error('Le justificatif d’archive OneDrive a changé.');
 const manifest=await graph.json(meta.id,meta);
 if(manifest.format!=='OPUS-PERMANENT-1'||manifest.sourceHash!==archive.sourceHash||!Array.isArray(manifest.files)||!manifest.files.some(file=>file.id===archive.snapshotId)||archive.pdfId&&!manifest.files.some(file=>file.id===archive.pdfId))throw Error('Archive OneDrive non vérifiable.');
 for(const expected of manifest.files){check();const item=await graph.item(expected.id);if(!item.file||item.size!==expected.size||item.eTag!==expected.eTag)throw Error('Un fichier de l’archive permanente manque ou a changé.');}
 return manifest;
}
export async function preservePermanentRecord(graph,repo,record,{kind='interventions',requirePdf=false,now=new Date(),check=()=>{}}={}){
 check();if(requirePdf&&!record.pdfFileId)throw Error('PDF non confirmé : l’intervention reste visible.');
 const sourceHash=await recordHash(record),sources=new Map();
 if(record.pdfFileId)sources.set(record.pdfFileId,{id:record.pdfFileId,name:record.pdfName||'rapport.pdf',pdf:true});
 for(const file of record.sourceDocuments||[])if(file?.id&&!sources.has(file.id))sources.set(file.id,{id:file.id,name:file.name||'piece-jointe'});
 for(const file of record.reportImports||[])if(file?.fileId&&!sources.has(file.fileId))sources.set(file.fileId,{id:file.fileId,name:file.name||'rapport-importe.pdf'});
 const sourceItems=[];for(const source of sources.values()){check();const item=await graph.item(source.id);if(!item.file||!item.eTag||!item.size)throw Error('Une pièce d’origine ne peut pas être confirmée.');sourceItems.push({...source,item});}
 const revision=await recordHash([sourceHash,...sourceItems.map(source=>[source.id,source.item.eTag])]);
 const root=await graph.folder('root','ARCHIVES_PERMANENTES_OPUS'),reports=await graph.folder(root.id,'RAPPORTS');
 const year=String(new Date(record.completedAt||record.actualEnd||record.createdAt||now).getUTCFullYear());
 const yearly=await graph.folder(reports.id,/^\d{4}$/.test(year)?year:String(now.getUTCFullYear()));
 const recordFolder=await graph.folder(yearly.id,safeName((record.number||kind)+'_'+record.id)),manifestName=revision+'_manifest.json';
 const completedCopies=[recordFolder,...(await graph.children(recordFolder.id)).filter(item=>item.folder&&item.name.startsWith('COPIE_'))];
 for(const previous of completedCopies){check();const existing=await graph.named(previous.id,manifestName);if(!existing)continue;try{const manifest=await graph.json(existing.id,existing),archive={...manifest.archive,manifestId:existing.id,manifestTag:existing.eTag};if(archive.sourceHash!==sourceHash)continue;await verifyPermanentArchive(graph,archive,{check});return archive;}catch(error){if(error.code==='retention_budget'||error.code==='archive_pause')throw error;}}
 // A unique attempt folder avoids overwriting another worker's immutable
 // receipt if a sleeping browser resumes after its maintenance lease expires.
 const folder=await graph.folder(recordFolder.id,'COPIE_'+now.toISOString().replace(/[:.]/g,'-')+'_'+uid());
 const payload=hasMediaReferences(record)?await repo.mediaJournal.hydrate(record):structuredClone(record);
 if(hasMediaReferences(payload))throw Error('Les photos n’ont pas toutes été copiées dans l’archive.');
 const files=[],cacheIds=[];let pdfId=null;
 for(const source of sourceItems){
  check();const blob=await graph.bytes(source.id,source.item);
  if(source.pdf&&await blob.slice(0,5).text()!=='%PDF-')throw Error('Le PDF d’origine ne peut pas être validé.');
  const stored=await confirmedFile(graph,folder.id,revision+'_'+files.length+'_'+safeName(source.name),blob,check);files.push({...stored,sourceId:source.id});cacheIds.push(source.id);if(source.pdf)pdfId=stored.id;
  const current=await graph.item(source.id);if(current.eTag!==source.item.eTag)throw Error('Une pièce a changé pendant la copie ; la fiche reste conservée.');
 }
 const photos=new Set();const findPhotos=value=>{if(typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(value))photos.add(value);else if(value&&typeof value==='object')for(const item of Object.values(value))findPhotos(item);};findPhotos(payload);
 let photoNumber=0;for(const photo of photos){check();const blob=dataBlob(photo),ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';files.push(await confirmedFile(graph,folder.id,'PHOTO_'+String(++photoNumber).padStart(3,'0')+'_'+revision+'.'+ext,blob,check));}
 const snapshot=await confirmedFile(graph,folder.id,revision+'.json',new Blob([JSON.stringify({format:'OPUS-FULL-RECORD-1',sourceHash,kind,record:payload})],{type:'application/json'}),check);files.push(snapshot);
 const archive={folderId:folder.id,snapshotId:snapshot.id,pdfId,sourceHash,confirmedAt:now.toISOString(),webUrl:folder.webUrl||'',cacheIds};
 const manifest={format:'OPUS-PERMANENT-1',sourceHash,archive,files};
 const confirmed=await confirmedFile(graph,folder.id,manifestName,new Blob([JSON.stringify(manifest)],{type:'application/json'}),check);
 const result={...archive,manifestId:confirmed.id,manifestTag:confirmed.eTag};await verifyPermanentArchive(graph,result,{check});return result;
}
