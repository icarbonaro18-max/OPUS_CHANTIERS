import {saveClientDraft} from './client-contacts.js';
import {completionDraft} from './client-completion.js';
const clean=value=>String(value??'').trim();
const esc=value=>clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CLIENT_FIELDS={name:'Client / raison sociale',lastName:'Nom',firstName:'Prénom',phone:'Téléphone du client',email:'E-mail du client',billingAddress:'Adresse du client / facturation'};
const CONTACT_FIELDS={siteContact:'Nom du contact sur place',sitePhone:'Téléphone du contact',siteEmail:'E-mail du contact'};
const recordFor=(ui,kind,id)=>ui.data[kind]?.find(row=>row.id===id);
const clientFor=(ui,id)=>ui.data.clients.find(row=>row.id===id);
const recordCoordinates=record=>Object.fromEntries(['clientId',...Object.keys(CONTACT_FIELDS)].map(key=>[key,record[key]]));
const assertRole=ui=>{if(!ui.canPlan?.())throw Error('Modification réservée au bureau et aux chefs de chantier.');};

export function coordinateButton(ui,record,kind){
 return !record.appArchivedAt&&ui.canPlan?.()?`<button type="button" class="secondary" data-coordinate-record="${esc(record.id)}" data-coordinate-kind="${kind}">Modifier les coordonnées</button>`:'';
}
export function bindCoordinateButtons(ui,root){
 root.querySelectorAll('[data-coordinate-record]').forEach(button=>button.onclick=()=>openCoordinateEditor(ui,button.dataset.coordinateRecord,button.dataset.coordinateKind));
 if(ui.canPlan?.())root.querySelectorAll('[data-complete-record]').forEach(button=>button.onclick=()=>openCoordinateEditor(ui,button.dataset.completeRecord,button.dataset.completeKind));
}
function valuesFor(client,record){
 const draft=completionDraft(client,record);
 return {name:client?.name||record.clientName||'',lastName:client?.lastName||'',firstName:client?.firstName||'',phone:draft.phone,email:draft.email,billingAddress:draft.billingAddress,siteContact:record.siteContact||'',sitePhone:record.sitePhone??record.phone??'',siteEmail:record.siteEmail??record.email??''};
}
function changedFields(fields,baseline,values){return Object.keys(fields).filter(key=>clean(values[key])!==clean(baseline[key]));}
function checkConcurrent(current,original,keys,values){
 for(const key of keys)if(clean(current[key])!==clean(original[key])&&clean(current[key])!==clean(values[key]))throw Error('Ces coordonnées ont changé sur un autre appareil. Votre correction reste affichée ; rouvrez la fiche pour vérifier la dernière version.');
}

// Apply only edited coordinates to the refreshed records. Planning, reports,
// hours, media references and completion status never enter this patch.
export async function saveCoordinates(ui,context,values){
 assertRole(ui);
 const clientKeys=changedFields(CLIENT_FIELDS,context.baseline,values),contactKeys=changedFields(CONTACT_FIELDS,context.baseline,values);
 if(!clientKeys.length&&!contactKeys.length)return false;
 await ui.c.prepareAppointmentWrite?.();assertRole(ui);
 const record=recordFor(ui,context.kind,context.recordId);
 if(!record)throw Error('Cette fiche n’est plus disponible. Aucune correction envoyée.');
 if((record.clientId||'')!==(context.originalRecord.clientId||'')&&record.clientId!==context.clientId)throw Error('Le client de cette fiche a changé. Rouvrez les coordonnées avant de réessayer.');
 let client=clientFor(ui,context.clientId);
 if(context.originalClient&&!client)throw Error('La fiche client n’est plus disponible. Actualisez avant de réessayer.');
 if(client)checkConcurrent(client,context.originalClient||{},clientKeys,values);
 checkConcurrent(record,context.originalRecord,contactKeys,values);
 const create=!client;
 if(create){client={id:context.clientId,sites:[],...Object.fromEntries(Object.keys(CLIENT_FIELDS).map(key=>[key,clean(context.baseline[key])]))};}
 if(create||clientKeys.length){
  const draft={...structuredClone(client),...Object.fromEntries(clientKeys.map(key=>[key,clean(values[key])]))};
  await saveClientDraft(ui,draft);client=draft;
  // If the subsequent contact write fails, a retry reuses the confirmed client.
  context.originalClient=structuredClone(client);
 }
 const patch={};
 if(record.clientId!==client.id)patch.clientId=client.id;
 if(create||clientKeys.includes('name'))patch.clientName=client.name;
 if(create||clientKeys.includes('billingAddress'))patch.billingAddress=client.billingAddress;
 for(const key of contactKeys)patch[key]=clean(values[key]);
 if(context.kind==='visits'){
  if(contactKeys.includes('sitePhone'))patch.phone=patch.sitePhone;
  if(contactKeys.includes('siteEmail'))patch.email=patch.siteEmail;
 }
 if(Object.keys(patch).length){
  const keys=[...Object.keys(patch),'updatedAt'],present=new Set(keys.filter(key=>Object.hasOwn(record,key))),before=Object.fromEntries(keys.map(key=>[key,record[key]]));Object.assign(record,patch,{updatedAt:new Date().toISOString()});
  try{await ui.save(context.kind);}
  catch(error){for(const key of keys){if(present.has(key))record[key]=before[key];else delete record[key];}throw Error((create||clientKeys.length?'La fiche client est enregistrée, mais le contact de ce rendez-vous reste à enregistrer. ':'Le contact n’a pas été enregistré. ')+'Votre correction reste affichée. Réessayez : '+error.message);}
 }
 context.baseline={...values};context.originalRecord=recordCoordinates(record);return true;
}

export function openCoordinateEditor(ui,id,kind,{onReturn}={}){
 try{
  assertRole(ui);if(!['interventions','visits'].includes(kind))throw Error('Type de fiche inconnu.');
  const record=recordFor(ui,kind,id);if(!record)throw Error('Cette fiche n’est plus disponible.');
  const client=clientFor(ui,record.clientId);
  if(record.clientId&&!client)throw Error('La fiche client n’est pas chargée. Actualisez la connexion avant de modifier ses coordonnées.');
  const baseline=valuesFor(client,record),context={kind,recordId:id,clientId:client?.id||'cli_'+crypto.randomUUID(),baseline:{...baseline},originalClient:client?structuredClone(client):null,originalRecord:recordCoordinates(record)};
  const input=(key,label)=>`<div><label for="coords-${key}">${label}</label><input id="coords-${key}" name="${key}" type="${/email/i.test(key)?'email':/phone/i.test(key)?'tel':'text'}" value="${esc(baseline[key])}"></div>`;
  ui.c.modal('Modifier les coordonnées',`<p><strong>${esc(record.number||'')} · ${esc(record.clientName||'Client à compléter')}</strong></p><form id="coordinateForm" novalidate data-record-edit="1"><h3>Fiche client</h3><p class="muted">Les coordonnées du client sont partagées avec ses autres dossiers.</p><div class="formGrid">${Object.entries(CLIENT_FIELDS).map(([key,label])=>input(key,label)).join('')}</div><h3>Contact pour ${kind==='visits'?'cette visite / devis':'cette intervention'}</h3><p class="muted">Ce contact concerne cette fiche. Il peut être différent du client.</p><div class="formGrid">${Object.entries(CONTACT_FIELDS).map(([key,label])=>input(key,label)).join('')}</div><p role="status" aria-live="polite"></p><div class="actionRow"><button type="submit">Enregistrer les coordonnées</button><button type="button" id="cancelCoordinates" class="secondary">Annuler</button></div></form>`);
  const form=document.getElementById('coordinateForm');
  const independent=completionDraft(client,record).differentContact;
  const links={phone:!independent&&(!clean(baseline.sitePhone)||clean(baseline.sitePhone)===clean(baseline.phone)),email:!independent&&(!clean(baseline.siteEmail)||clean(baseline.siteEmail)===clean(baseline.email))};
  form.addEventListener('input',event=>{
   const key=event.target.name;
   for(const [source,target]of [['phone','sitePhone'],['email','siteEmail']]){
    if(key===target)links[source]=false;
    if(key===source&&links[source])form.elements.namedItem(target).value=event.target.value;
   }
  });
  const back=async()=>{document.getElementById('modal').close();if(onReturn)await onReturn();};
  document.getElementById('cancelCoordinates').onclick=()=>back().catch(error=>ui.c.toast(error.message));
  form.onsubmit=async event=>{
   event.preventDefault();if(form.dataset.saving)return;
   const button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]'),cancel=document.getElementById('cancelCoordinates');
   const values=Object.fromEntries(Object.keys({...CLIENT_FIELDS,...CONTACT_FIELDS}).map(key=>[key,form.elements.namedItem(key).value]));
   for(const key of [...changedFields(CLIENT_FIELDS,context.baseline,values),...changedFields(CONTACT_FIELDS,context.baseline,values)])if(!form.elements.namedItem(key).checkValidity()){status.textContent='Vérifiez le champ « '+(CLIENT_FIELDS[key]||CONTACT_FIELDS[key])+' ».';form.elements.namedItem(key).focus();return;}
   form.dataset.saving='1';button.disabled=true;cancel.disabled=true;status.textContent='Enregistrement des coordonnées…';
   try{
    const saved=await saveCoordinates(ui,context,values);status.textContent=saved?'Coordonnées enregistrées.':'Aucune modification.';
    await back();ui.c.toast(saved?'Coordonnées enregistrées.':'Aucune modification.');
    if(!onReturn)try{if(ui.section==='calendar')await ui.renderCalendar();else if(kind==='visits')await ui.renderVisits();else await ui.renderInterventions();}catch{ui.c.toast('Coordonnées enregistrées. Actualisez la liste pour les afficher.');}
   }catch(error){status.textContent=error.message;}
   finally{delete form.dataset.saving;button.disabled=false;cancel.disabled=false;}
  };
 }catch(error){ui.c.toast(error.message);}
}
