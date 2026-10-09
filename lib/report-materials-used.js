import {loadOrders} from './project-orders.js';
import {readOrderMaterials,materialCandidates} from './order-materials.js';
import {readOpusOrderPDF} from './order-pdf-items.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parsed=new WeakMap();
export const usageLine=r=>[r.reference,r.description,r.usedQuantity+' '+r.unit,'['+(r.source==='depot'?'Dépôt de Buc':r.supplier||'Fournisseur')+(r.orderNumber?' · BC '+r.orderNumber:'')+']'].filter(Boolean).join(' · ');
export function removeImportedUsage(record,currentText){const lines=new Set((record.materialUsage||[]).map(usageLine));return currentText.split('\n').filter(line=>!lines.has(line)).join('\n');}
export function applyMaterialUsage(record,currentText,selections){
 const existing=record.materialUsage||[],keys=new Set(existing.map(r=>r.key)),added=[];
 for(const row of selections){if(keys.has(row.key))continue;const raw=String(row.usedQuantity).trim().replace(',','.');if(!/^\d+(?:\.\d+)?$/.test(raw)||Number(raw)<=0||Number(raw)>row.remainingQuantity)throw Error('Vérifiez la quantité utilisée : elle doit être positive et ne pas dépasser la quantité encore disponible sur ce bon.');
 added.push({...row,usedQuantity:raw,confirmedAt:new Date().toISOString()});keys.add(row.key);}
 const lines=added.map(usageLine);
 return {usage:[...existing,...added],text:[currentText.trim(),lines.join('\n')].filter(Boolean).join('\n'),added:added.length};
}
export async function mountUsedOrderMaterials(ui,record){
 const field=document.getElementById('aMaterial'),form=document.getElementById('finishInt');if(!field||!form||!ui.c.graph?.named)return;
 const details=field.closest('details');if(details){details.open=true;details.querySelector('summary').textContent='Matériel utilisé · bons de commande et dépôt';}
 const box=document.createElement('section');box.className='usedOrderMaterials';field.before(box);
 let busy=false;
 async function load(){if(busy)return;busy=true;box.innerHTML='<p role="status">Récupération du matériel des bons de commande…</p>';
 try{
  const g=ui.c.graph;let files=(record.materialOrders||[]).map(o=>({...o,id:o.fileId}));
  if(record.projectId){const grouped=await loadOrders(g,record.projectId);files.push(...grouped.supplier.map(f=>({...f,source:'fournisseur'})),...grouped.depot.map(f=>({...f,source:'depot'})));}
  if(!form.isConnected)return;
  const affair={kind:record.projectId?'project':'intervention',id:record.projectId||record.id};
  const data=await readOrderMaterials(g,files,affair,{readPdf:async f=>{let cache=parsed.get(g);if(!cache){cache=new Map();parsed.set(g,cache);}const key=(f.fileId||f.id)+':'+(f.eTag||f.updatedAt||f.lastModifiedDateTime||''),old=cache.get(key);if(old&&Date.now()-old.at<300000)return structuredClone(old.value);const value=await readOpusOrderPDF(await g.bytes(f.fileId||f.id));cache.set(key,{at:Date.now(),value});return value;}});
  if(!form.isConnected)return;
  const rows=materialCandidates(data.orders,ui.data.interventions||[],record).filter(r=>!r.already);
  box.innerHTML='<p><strong>Matériel de cette affaire</strong> · Vérifiez les quantités réellement utilisées pour ce rapport. Les bons commandés ou récupérés ne prouvent pas leur consommation.</p>'+(rows.length?'<div class="materialRequestTable"><table><thead><tr><th>Utilisé</th><th>Matériel / provenance</th><th>Sur le bon</th><th>Déjà déclaré ailleurs</th><th>Utilisé ce jour</th></tr></thead><tbody>'+rows.map((r,i)=>`<tr><td><input type="checkbox" data-use="${i}" aria-label="Utiliser ${esc(r.description)}" ${r.remainingQuantity>0?'checked':'disabled'}></td><td><strong>${esc(r.reference)} ${esc(r.description)}</strong><br><small>${esc(r.source==='depot'?'Dépôt de Buc':r.supplier||'Fournisseur')} · ${esc(r.orderNumber||r.fileName)}</small></td><td>${esc(r.quantity)} ${esc(r.unit)}</td><td>${esc(r.declaredQuantity)} ${esc(r.unit)}</td><td><input data-used-qty="${i}" inputmode="decimal" aria-label="Quantité utilisée : ${esc(r.description)}" value="${r.remainingQuantity}" ${r.remainingQuantity<=0?'disabled':''}> ${esc(r.unit)}</td></tr>`).join('')+'</tbody></table></div><button type="button" class="secondary" data-apply-used>Confirmer le matériel utilisé et l’ajouter au rapport</button>':'<p>Aucune nouvelle ligne disponible. Vous pouvez compléter le matériel utilisé ci-dessous.</p>')+'<p><small>Les quantités déjà déclarées concernent uniquement les lignes confirmées avec cette fonction. La saisie libre ci-dessous reste conservée.</small></p><div data-unread></div><p role="status" data-used-status></p><button type="button" class="secondary" data-refresh-used>Actualiser les bons</button>';
  const unread=box.querySelector('[data-unread]');if(data.unread.length){const p=document.createElement('p');p.textContent=data.unread.length+' bon(s) sans liste exploitable : faites reprendre ces bons dans le module Bons de commande ou complétez le matériel manuellement.';unread.append(p);for(const item of data.unread){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=item.name;button.onclick=async()=>{try{await ui.c.openAlertDocument?.({id:item.file.fileId||item.file.id,name:item.name});}catch(e){ui.c.toast(e.message);}};unread.append(button);}}
  box.querySelector('[data-refresh-used]').onclick=load;
  const apply=box.querySelector('[data-apply-used]');if(apply)apply.onclick=()=>{const status=box.querySelector('[data-used-status]');try{
   const chosen=[...box.querySelectorAll('[data-use]:checked')].map(el=>({...rows[Number(el.dataset.use)],usedQuantity:box.querySelector('[data-used-qty="'+el.dataset.use+'"]').value}));if(!chosen.length)throw Error('Cochez le matériel utilisé pour ce passage.');
   const result=applyMaterialUsage(record,field.value,chosen);record.materialUsage=result.usage;field.value=result.text;field.dispatchEvent(new Event('input',{bubbles:true}));ui.activeReportRecovery?.changed();
   for(const input of box.querySelectorAll('[data-use]:checked')){input.checked=false;input.disabled=true;box.querySelector('[data-used-qty="'+input.dataset.use+'"]').disabled=true;}
   status.textContent=result.added+' ligne(s) ajoutée(s). Enregistrez le rapport pour les transmettre au bureau.';
  }catch(e){status.textContent=e.message;}};
 }catch(e){if(!form.isConnected)return;box.replaceChildren();const p=document.createElement('p');p.setAttribute('role','status');p.textContent='Liste de matériel non chargée : '+e.message;const b=document.createElement('button');b.type='button';b.textContent='Réessayer';b.onclick=load;box.append(p,b);}finally{busy=false;}
 }
 const reset=document.createElement('button');reset.type='button';reset.className='secondary';reset.textContent='Corriger les quantités reprises des bons';field.after(reset);reset.onclick=async()=>{if(!(record.materialUsage||[]).length)return;field.value=removeImportedUsage(record,field.value);record.materialUsage=[];field.dispatchEvent(new Event('input',{bubbles:true}));ui.activeReportRecovery?.changed();await load();};
 await load();
}
