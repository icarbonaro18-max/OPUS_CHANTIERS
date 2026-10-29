import {deviceStorageInfo} from './device-storage.js';
import {renderStorageGauge} from './storage-overview.js';
import {archiveModeKey,archiveModeEnabled,runDeviceArchive} from './archive-maintenance.js';
import {OpsRepository} from './ops.js';
const size=n=>n>=1000000?(n/1000000).toFixed(1)+' Mo':Math.ceil(n/1000)+' ko';
export async function openStorageHealth(ctx){
 if(!ctx.isAdmin())throw Error('Diagnostic du stockage réservé à l’administrateur.');
 ctx.modal('Stockage des rapports','<p role="status" id="storageStatus">Vérification de la connexion et de la taille des fichiers…</p><section id="storageGauge" class="panel"></section><div id="storageFiles"></div>');
 const status=document.getElementById('storageStatus'),host=document.getElementById('storageFiles');
 void deviceStorageInfo(globalThis.navigator).then(info=>{const gauge=document.getElementById('storageGauge');if(gauge?.isConnected)renderStorageGauge(gauge,info);});
 try{
  await ctx.verify();const repository=ctx.repository()||new OpsRepository(ctx.graph,{assetStore:ctx.store});const files=await repository.inspectStorage();if(!host.isConnected)return;
  status.textContent='Les photos intégrées aux fichiers généraux ralentissent leur lecture et leur enregistrement.';
  host.innerHTML='<p>Cette opération conserve une copie complète des fichiers d’origine, enregistre les photos séparément, puis allège les listes. Les fiches, coordonnées, notes et photos sont conservées. Une modification faite sur une autre tablette empêche le remplacement de sa version.</p><p>Installez cette mise à jour sur les appareils avant l’opération.</p><ul>'+files.map(f=>'<li>'+(f.kind==='interventions'?'Interventions':'Visites avant devis')+' : '+size(f.size)+'</li>').join('')+'</ul><label>Emplacement de la copie de sécurité<select id="storageBackupWhere"><option value="sharepoint">Bibliothèque Microsoft 365 actuelle</option><option value="external">Choisir un dossier : disque externe, réseau ou cloud synchronisé</option></select></label><p id="storageBackupHelp" class="muted">Le dossier iCloud Drive peut être choisi s’il est déjà configuré sur ce PC. La copie locale sera vérifiée ; la synchronisation vers le cloud reste assurée par son application.</p><button type="button" id="optimizeStorage">Sauvegarder et alléger les rapports</button><button type="button" id="stopStorage" class="secondary" hidden>Arrêter après l’étape en cours</button><div id="storageResults"></div>';
  const where=document.getElementById('storageBackupWhere');if(!globalThis.window?.showDirectoryPicker){where.querySelector('[value=external]').disabled=true;where.value='sharepoint';document.getElementById('storageBackupHelp').textContent='Le choix direct d’un dossier n’est pas disponible dans ce navigateur. La copie de sécurité sera conservée dans Microsoft 365.';}
  const button=document.getElementById('optimizeStorage'),stop=document.getElementById('stopStorage'),results=document.getElementById('storageResults');
  let archiveButton=null,busy=false,lastStage='Vérification de la connexion';
  button.onclick=async()=>{
   if(!ctx.isAdmin()||busy)return;busy=true;if(archiveButton)archiveButton.disabled=true;button.disabled=true;stop.hidden=false;const controller=new AbortController(),dialog=host.closest('dialog'),cancel=()=>controller.abort();dialog?.addEventListener('close',cancel,{once:true});stop.onclick=()=>{controller.abort();stop.disabled=true;};
   try{
    const backupDirectory=where.value==='external'?await window.showDirectoryPicker({mode:'readwrite'}):null;
    await ctx.verify();results.replaceChildren();
    for(const file of files){
     const label=file.kind==='interventions'?'Interventions':'Visites';
     const result=await repository.optimizeMedia(file.kind,{signal:controller.signal,backupDirectory,onProgress:p=>{lastStage=label+' · '+p.stage;status.textContent=lastStage+(p.total?' · '+p.done+'/'+p.total:'');}});
     if(!results.isConnected)return;const line=document.createElement('p');line.textContent=label+' : '+size(result.before)+' → '+size(result.after)+(result.changed?' · copie de sécurité confirmée'+(result.backupLocation==='external'?' dans le dossier choisi':' dans Microsoft 365'):' · aucune photo intégrée à déplacer');results.append(line);
    }
    if(controller.signal.aborted)return;await ctx.completed();status.textContent='Optimisation terminée et données relues. Les photos seront chargées uniquement à l’ouverture de la fiche concernée.';button.textContent='Vérifier à nouveau';
   }catch(error){status.textContent=lastStage+' : '+error.message;}
   finally{dialog?.removeEventListener('close',cancel);button.disabled=false;stop.hidden=true;stop.disabled=false;busy=false;if(archiveButton)archiveButton.disabled=false;}
  };
  const archivePanel=document.createElement('section');archivePanel.className='panel';archivePanel.innerHTML='<h3>Dossiers terminés · 15 jours dans OPUS, puis OneDrive</h3><p>Interventions, visites terminées et chantiers clôturés quittent les listes après 15 jours sans modification et après vérification de leurs documents OneDrive. Les heures et la facturation restent conservées dans des traces légères. Aucun document OneDrive n’est supprimé. Mettez tous les appareils à jour avant l’activation.</p><p data-archive-mode></p><button type="button" data-archive-run>Activer le retrait après 15 jours · conserver dans OneDrive</button><button type="button" class="secondary" data-archive-pause>Suspendre l’archivage automatique sur ce PC</button><p data-archive-status role="status"></p>';host.append(archivePanel);
  const data=ctx.data?.()||{},counts=document.createElement('p');counts.textContent=(data.interventions||[]).filter(row=>!row.projectId&&!row.appArchivedAt&&['terminee','facturee'].includes(row.status)).length+' intervention(s) terminée(s) encore dans OPUS · '+(data.visits||[]).filter(row=>!row.appArchivedAt&&['terminee','convertie'].includes(row.status)).length+' visite(s) terminée(s). Les anciennes fiches sans PDF confirmé restent affichées.';archivePanel.querySelector('h3').after(counts);
  const mode=archivePanel.querySelector('[data-archive-mode]'),archiveStatus=archivePanel.querySelector('[data-archive-status]'),pause=archivePanel.querySelector('[data-archive-pause]');archiveButton=archivePanel.querySelector('[data-archive-run]');
  const drawMode=()=>{const enabled=archiveModeEnabled(ctx.store,ctx.graph,globalThis.localStorage);mode.textContent=enabled?'Automatique sur ce PC, tant que l’application est ouverte et connectée.':'Automatique sur ce PC : non activé.';pause.hidden=!enabled;};drawMode();
  pause.onclick=()=>{localStorage.removeItem(archiveModeKey(ctx.store,ctx.graph));drawMode();};
  archiveButton.onclick=async()=>{
   if(busy||!ctx.isAdmin())return;busy=true;button.disabled=archiveButton.disabled=true;stop.hidden=false;let stopped=false;stop.onclick=()=>{stopped=true;stop.disabled=true;};const dialog=host.closest('dialog');
   try{await ctx.verify();localStorage.setItem(archiveModeKey(ctx.store,ctx.graph),'1');drawMode();archiveStatus.textContent='Vérification et copies dans OneDrive…';
    const result=await runDeviceArchive(ctx.graph,{check:()=>{if(stopped||!archivePanel.isConnected||dialog&&!dialog.open)throw Object.assign(Error('Archivage interrompu.'),{code:'archive_pause'});},onProgress:p=>{archiveStatus.textContent=p.stage+(p.number?' · '+p.number:'');}});
    if(result.busy)archiveStatus.textContent='Un traitement de conservation est déjà en cours. Réessayez après sa fin.';
    else{await ctx.completed();archiveStatus.textContent=(result.archived||0)+' intervention(s) / visite(s) et '+(result.projectsArchived||0)+' chantier(s) retiré(s) après confirmation OneDrive · '+(result.deferred||0)+' différée(s).'+(result.deferred?' Les fiches non confirmées restent affichées.':'')+(stopped?' Traitement interrompu ; les données d’origine restent conservées.':'');}
   }catch(error){archiveStatus.textContent='Archivage non confirmé : '+error.message;}
   finally{busy=false;button.disabled=archiveButton.disabled=false;stop.hidden=true;stop.disabled=false;}
  };
 }catch(error){status.textContent='Diagnostic interrompu : '+error.message;}
}
