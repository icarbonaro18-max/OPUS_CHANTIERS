import {isIndependentIntervention} from './work-records.js';
import {safeName} from './cloud.js';

export function reportTarget(rows,number){
 const matches=rows.filter(x=>x.number===number);
 if(matches.length!==1)throw Error(number+' : '+(matches.length?'plusieurs fiches portent ce numéro.':'intervention introuvable. Aucune fiche ne sera créée automatiquement.'));
 if(!isIndependentIntervention(matches[0]))throw Error(number+' : cette fiche est un rapport de chantier ou une intervention annulée.');
 return matches[0];
}

export async function inspectReport(file,readFirstPage){
 if(!/\.pdf$/i.test(file.name))throw Error('Sélectionnez uniquement des PDF.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error(file.name+' : PDF non valide.');
 if(!readFirstPage)readFirstPage=async data=>{
  const pdfjs=await import('../vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;
  const doc=await pdfjs.getDocument({data:data.slice(),isEvalSupported:false}).promise;
  try{return (await (await doc.getPage(1)).getTextContent()).items.map(x=>x.str).join(' ');}finally{await doc.destroy();}
 };
 const text=await readFirstPage(bytes);
 const numbers=[...new Set(text.match(/\bINT-\d{4}-\d{4}\b/g)||[])];
 if(numbers.length!==1)throw Error(file.name+' : le numéro d’intervention est absent ou ambigu dans le PDF.');
 const number=numbers[0],filenameNumber=file.name.match(/INT-\d{4}-\d{4}/)?.[0];
 if(filenameNumber&&filenameNumber!==number)throw Error(file.name+' : le numéro du PDF ne correspond pas au nom du fichier.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {number,name:file.name,hash,blob:new Blob([bytes],{type:'application/pdf'})};
}

async function currentInterventions(g){
 const root=await g.named('root','_OPUS_SYSTEM');
 const file=root&&await g.named(root.id,'interventions.json');
 if(!file)throw Error('Le fichier des interventions est introuvable. Import arrêté pour préserver les données.');
 const meta=await g.item(file.id),rows=await g.json(file.id);
 if(!meta.eTag||!Array.isArray(rows)||rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('La liste Microsoft des interventions ne peut pas être vérifiée.');
 return {meta,rows};
}

export async function importAndArchive(ui,entries){
 if(!ui.c.isAdmin())throw Error('Import réservé à l’administrateur.');
 if(ui.dataLoadError)throw Error('Rechargez les données Microsoft avant l’import.');
 if(!entries.length||new Set(entries.map(e=>e.number)).size!==entries.length)throw Error('Choisissez un seul rapport par intervention.');
 const g=ui.c.graph,{meta,rows}=await currentInterventions(g);
 // Validate every target before uploading any file. Never replace the list with
 // local data: a conditional write preserves intervening edits by colleagues.
 const targets=entries.map(e=>reportTarget(rows,e.number));
 const now=new Date().toISOString(),updates=[];
 for(let i=0;i<entries.length;i++){
  const entry=entries[i],record=targets[i],root=await g.folder('root','INTERVENTIONS');
  const year=await g.folder(root.id,entry.number.slice(4,8));
  const dir=await g.folder(year.id,safeName(entry.number+'_'+(record.clientName||'CLIENT')));
  // Content-specific name keeps existing reports intact and makes retries
  // idempotent, including when an upload succeeds but the list save fails.
  const pdfName=entry.number+'_RAPPORT_IMPORTE_'+entry.hash+'.pdf';
  const uploaded=await g.request(g.base(dir.id)+':/'+encodeURIComponent(pdfName)+':/content',{method:'PUT',headers:{'Content-Type':'application/pdf'},body:entry.blob});
  if(!uploaded?.id)throw Error(entry.number+' : transfert du PDF non confirmé. Aucun archivage confirmé.');
  const imports=[...(record.reportImports||[])];
  if(!imports.some(r=>r.sha256===entry.hash))imports.push({sha256:entry.hash,fileId:uploaded.id,name:pdfName,originalName:entry.name,importedAt:now,importedBy:ui.user?.displayName||'',previousPdf:record.pdfFileId?{id:record.pdfFileId,name:record.pdfName}:null});
  Object.assign(record,{reportImports:imports,pdfFileId:uploaded.id,pdfName,pdfSavedAt:now,pdfFolder:'INTERVENTIONS/'+entry.number.slice(4,8)+'/'+dir.name,reportSubmittedAt:record.reportSubmittedAt||now,reportDeletedAt:null,reportDeletedBy:null,status:record.status==='facturee'?'facturee':'terminee',archivedAt:record.archivedAt||now,archivedBy:record.archivedBy||ui.user?.displayName||'',updatedAt:now});
  updates.push({id:record.id,number:record.number,pdfFileId:uploaded.id});
 }
 try{
  await g.request(g.base(meta.id)+'/content',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':meta.eTag},body:new Blob([JSON.stringify(rows)],{type:'application/json'})});
 }catch(error){throw Error('PDF transférés, mais archivage non confirmé. Rechargez puis réessayez ; les mêmes PDF ne seront pas dupliqués. '+error.message);}
 const confirmed=await g.json(meta.id);
 if(!Array.isArray(confirmed)||updates.some(u=>!confirmed.some(r=>r.id===u.id&&r.pdfFileId===u.pdfFileId&&r.archivedAt&&['terminee','facturee'].includes(r.status))))throw Error('La relecture Microsoft ne confirme pas tous les archivages. Actualisez avant de réessayer.');
 ui.data.interventions=confirmed;
 return updates;
}

export function openImportReports(ui){
 if(!ui.c.isAdmin())return;
 ui.c.modal('Importer et archiver des rapports',`<p>Choisissez les PDF existants. Leur numéro doit correspondre à une intervention indépendante déjà enregistrée.</p><label>Rapports PDF<input type="file" id="importReportFiles" accept="application/pdf,.pdf" multiple></label><ul id="importReportPreview"></ul><p id="importReportNotice" role="status" aria-live="polite"></p><p>Les photos et le PDF original sont conservés. L’archivage ne marque pas l’intervention comme facturée et conserve ses rendez-vous.</p><button type="button" id="archiveImportedReports" disabled>Enregistrer dans OPUS et archiver</button><button type="button" id="showImportedArchives" hidden>Voir les interventions archivées</button>`);
 const input=document.getElementById('importReportFiles'),preview=document.getElementById('importReportPreview'),notice=document.getElementById('importReportNotice'),button=document.getElementById('archiveImportedReports');
 let entries=[],generation=0;
 input.onchange=async()=>{
  const ticket=++generation;entries=[];preview.replaceChildren();button.disabled=true;notice.textContent='Vérification des PDF…';
  try{
   const selected=[];
   for(const file of input.files){const entry=await inspectReport(file);reportTarget(ui.data.interventions,entry.number);selected.push(entry);}
   if(ticket!==generation)return;
   if(new Set(selected.map(e=>e.number)).size!==selected.length)throw Error('Choisissez un seul rapport par intervention.');
   entries=selected;
   for(const entry of entries){const r=reportTarget(ui.data.interventions,entry.number),li=document.createElement('li');li.textContent=entry.number+' — '+r.clientName+' — '+(r.title||'Intervention');preview.append(li);}
   notice.textContent=entries.length+' rapport(s) prêt(s). Vérifiez les interventions ci-dessus.';button.disabled=!entries.length;
  }catch(error){if(ticket===generation)notice.textContent=error.message;}
 };
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;input.disabled=true;notice.textContent='Enregistrement des PDF puis vérification de l’archivage…';
  try{
   const saved=await importAndArchive(ui,entries);notice.textContent=saved.length+' rapport(s) enregistré(s) et intervention(s) archivée(s).';button.textContent='Archivage confirmé';
   const see=document.getElementById('showImportedArchives');see.hidden=false;see.onclick=async()=>{document.getElementById('modal')?.close?.();ui.interventionView='archived';await ui.show('interventions');};
   if(ui.section==='office')await ui.renderOffice();else await ui.renderInterventions();
  }catch(error){notice.textContent=error.message;button.disabled=false;input.disabled=false;}
 };
}
