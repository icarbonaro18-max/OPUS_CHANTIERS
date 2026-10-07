import {saveClientDraft} from './client-contacts.js';
const clean=v=>String(v??'').trim();
const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const same=(a,b)=>clean(a).toLocaleLowerCase()===clean(b).toLocaleLowerCase();
export function completionDraft(client={},record={}){
 client=client||{};
 const company=['Société','Syndic','Institutionnel'].includes(client.category);
 const contact=record.siteContact||'';
 const different=record.differentContact??Boolean(contact&&!same(contact,client.name)&&!same(contact,[client.firstName,client.lastName].filter(Boolean).join(' ')));
 return {company,lastName:client.lastName||client.name||record.clientName||'',firstName:client.firstName||'',billingAddress:client.billingAddress||record.billingAddress||record.siteAddress||'',phone:client.phone||(!different?(record.sitePhone||record.phone):'')||'',email:client.email||(!different?(record.siteEmail||record.email):'')||'',differentContact:different,siteContact:contact,siteAddress:record.siteAddress||'',sitePhone:record.sitePhone||record.phone||'',siteEmail:record.siteEmail||record.email||''};
}
export function missingCoordinates(d){
 const fields=['lastName',...(!d.company?['firstName']:[]),'billingAddress','phone','email',...(d.differentContact?['siteContact','siteAddress','sitePhone','siteEmail']:[])];
 return fields.filter(k=>!clean(d[k])||(/email/i.test(k)&&! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(d[k]))));
}
export function completionBadge(ui,record,kind){
 if(record.type==='Réception de chantier / intervention'||record.status==='annulee')return '';
 return missingCoordinates(completionDraft(ui.clientById?.(record.clientId)||ui.data?.clients?.find(c=>c.id===record.clientId),record)).length?`<button type="button" class="completeClientAlert" data-complete-record="${esc(record.id)}" data-complete-kind="${kind}">Compléter fiche</button>`:'';
}
export function bindCompletionBadges(ui,root){
 root.querySelectorAll('[data-complete-record]').forEach(b=>b.onclick=()=>b.dataset.completeKind==='visits'?ui.openVisit(b.dataset.completeRecord):ui.openIntervention(b.dataset.completeRecord));
}
export async function persistCoordinates(ui,record,kind,d){
 const old=ui.clientById(record.clientId),client=structuredClone(old||{id:'cli_'+crypto.randomUUID(),sites:[]});
 Object.assign(client,{lastName:clean(d.lastName),firstName:clean(d.firstName),billingAddress:clean(d.billingAddress),phone:clean(d.phone),email:clean(d.email)});
 // Preserve existing display names and all unrelated client/site metadata.
 if(!client.name)client.name=[d.firstName,d.lastName].filter(Boolean).join(' ');
 await saveClientDraft(ui,client);
 const before=structuredClone(record);
 Object.assign(record,{clientId:client.id,clientName:client.name,billingAddress:client.billingAddress,differentContact:d.differentContact,updatedAt:new Date().toISOString()});
 if(d.differentContact)Object.assign(record,{siteContact:clean(d.siteContact),siteAddress:clean(d.siteAddress),sitePhone:clean(d.sitePhone),siteEmail:clean(d.siteEmail)});
 if(kind==='visits'&&d.differentContact)Object.assign(record,{phone:record.sitePhone,email:record.siteEmail});
 try{await ui.save(kind);}catch(e){for(const key of Object.keys(record))delete record[key];Object.assign(record,before);throw Error('Les coordonnées client sont enregistrées, mais la fiche de visite/intervention reste à enregistrer. Réessayez : '+e.message);}
}
export function mountClientCompletion(ui,record,kind){
 const form=document.getElementById(kind==='visits'?'finishVisit':'finishInt');if(!form)return;
 let d=completionDraft(ui.clientById(record.clientId),record);
 const box=document.createElement('section');box.className='clientCompletion';form.before(box);
 const labels={lastName:d.company?'Raison sociale':'Nom',firstName:'Prénom',billingAddress:'Adresse du client',phone:'Téléphone du client',email:'E-mail du client',siteContact:'Nom du contact sur place',siteAddress:'Adresse du contact / rendez-vous',sitePhone:'Téléphone du contact',siteEmail:'E-mail du contact'};
 const draw=()=>{
 const missing=missingCoordinates(d);
 box.innerHTML=`<details ${missing.length?'open':''}><summary class="${missing.length?'completeClientAlert':''}">${missing.length?'Compléter fiche — coordonnées manquantes':'Coordonnées complètes · Modifier'}</summary><form class="completionForm" novalidate><p>Les champs en rouge sont nécessaires au devis. Vous pouvez enregistrer une fiche encore incomplète et la compléter plus tard.</p><div class="formGrid">${Object.entries(labels).filter(([key])=>key!=='firstName'||!d.company).map(([key,label])=>`<div data-field="${key}" ${key.startsWith('site')&&!d.differentContact?'hidden':''}><label for="cc-${key}">${label}<span class="missingLabel"></span></label><input id="cc-${key}" name="${key}" type="${/email/i.test(key)?'email':/phone/i.test(key)?'tel':'text'}" value="${esc(d[key])}"></div>`).join('')}</div><label><input type="checkbox" name="differentContact" ${d.differentContact?'checked':''}> Le contact sur place est différent du client</label><p role="status"></p><button type="submit">Enregistrer les coordonnées</button></form></details>`;
 const editor=box.querySelector('form');
 const mark=()=>{const absent=missingCoordinates(d);editor.querySelectorAll('[data-field]').forEach(el=>{const key=el.dataset.field,bad=absent.includes(key);el.hidden=key.startsWith('site')&&!d.differentContact;el.classList.toggle('missingCoordinate',bad);el.querySelector('.missingLabel').textContent=bad?' — À compléter':'';el.querySelector('input').setAttribute('aria-invalid',String(bad));});};
 editor.oninput=ev=>{const input=ev.target;if(!input.name)return;d[input.name]=input.type==='checkbox'?input.checked:input.value;mark();};mark();
 editor.onsubmit=async ev=>{ev.preventDefault();const button=editor.querySelector('[type=submit]'),status=editor.querySelector('[role=status]');button.disabled=true;status.textContent='Enregistrement…';try{await persistCoordinates(ui,record,kind,d);draw();box.querySelector('[role=status]').textContent='Coordonnées enregistrées.';const identity=form.parentElement.querySelector('.clientContactDetails');if(identity){const {clientContactHtml}=await import('./client-contacts.js');identity.outerHTML=clientContactHtml(ui.clientById(record.clientId));}if(kind==='visits')await ui.renderVisits();else await ui.renderInterventions();}catch(e){status.textContent=e.message;button.disabled=false;}};
 };draw();
}
