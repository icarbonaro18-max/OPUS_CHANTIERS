import {OpsRepository} from './ops.js';
const size=n=>n>=1000000?(n/1000000).toFixed(1)+' Mo':Math.ceil(n/1000)+' ko';
export async function openStorageHealth(ctx){
 if(!ctx.isAdmin())throw Error('Diagnostic du stockage réservé à l’administrateur.');
 ctx.modal('Stockage des rapports','<p role="status" id="storageStatus">Vérification de la connexion et de la taille des fichiers…</p><div id="storageFiles"></div>');
 const status=document.getElementById('storageStatus'),host=document.getElementById('storageFiles');
 try{
  await ctx.verify();const repository=ctx.repository()||new OpsRepository(ctx.graph,{assetStore:ctx.store});const files=await repository.inspectStorage();if(!host.isConnected)return;
  status.textContent='Les photos intégrées aux fichiers généraux ralentissent leur lecture et leur enregistrement.';
  host.innerHTML='<p>Cette opération conserve une copie complète des fichiers d’origine, enregistre les photos séparément, puis allège les listes. Les fiches, coordonnées, notes et photos sont conservées. Une modification faite sur une autre tablette empêche le remplacement de sa version.</p><p>Installez cette mise à jour sur les appareils avant l’opération.</p><ul>'+files.map(f=>'<li>'+(f.kind==='interventions'?'Interventions':'Visites avant devis')+' : '+size(f.size)+'</li>').join('')+'</ul><button type="button" id="optimizeStorage">Sauvegarder et alléger les rapports</button><button type="button" id="stopStorage" class="secondary" hidden>Arrêter après l’étape en cours</button><div id="storageResults"></div>';
  const button=document.getElementById('optimizeStorage'),stop=document.getElementById('stopStorage'),results=document.getElementById('storageResults');
  button.onclick=async()=>{
   if(!ctx.isAdmin())return;button.disabled=true;stop.hidden=false;const controller=new AbortController(),dialog=host.closest('dialog'),cancel=()=>controller.abort();dialog?.addEventListener('close',cancel,{once:true});stop.onclick=()=>{controller.abort();stop.disabled=true;};
   try{
    await ctx.verify();results.replaceChildren();
    for(const file of files){
     const label=file.kind==='interventions'?'Interventions':'Visites';
     const result=await repository.optimizeMedia(file.kind,{signal:controller.signal,onProgress:p=>{status.textContent=label+' · '+p.stage+(p.total?' · '+p.done+'/'+p.total:'');}});
     if(!results.isConnected)return;const line=document.createElement('p');line.textContent=label+' : '+size(result.before)+' → '+size(result.after)+(result.changed?' · copie de sécurité confirmée':' · aucune photo intégrée à déplacer');results.append(line);
    }
    if(controller.signal.aborted)return;await ctx.completed();status.textContent='Optimisation terminée et données relues. Les photos seront chargées uniquement à l’ouverture de la fiche concernée.';button.textContent='Vérifier à nouveau';
   }catch(error){status.textContent=error.message;}
   finally{dialog?.removeEventListener('close',cancel);button.disabled=false;stop.hidden=true;stop.disabled=false;}
  };
 }catch(error){status.textContent='Diagnostic interrompu : '+error.message;}
}
