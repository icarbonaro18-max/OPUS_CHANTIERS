const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bindVisitLocation(ui){
 const el=id=>document.getElementById(id),site=()=>ui.siteById(ui.clientById(el('vClient').value),el('vSite').value);
 const fill=s=>{for(const [id,key] of [['vMeetingAddress','address'],['vContact','contact'],['vContactPhone','phone'],['vContactEmail','email']])el(id).value=s?.[key]||'';};
 // Client selection alone never overwrites the appointment's own location.
 el('vSite').addEventListener('change',()=>{const s=site();if(s)fill(s);});
 el('vCopySiteAddress').onclick=()=>{if(el('vMode').value==='new'){fill({address:el('vAddress').value,phone:el('vPhone').value,email:el('vEmail').value});return;}const c=ui.clientById(el('vClient').value);fill(site()||{address:c?.billingAddress,phone:c?.phone,email:c?.email});};
 // Stack client and site choices so the reading order is clear on tablets too.
 for(const id of ['vClient','vSite'])el(id).parentElement.classList.add('wide');
}
export function visitContactHtml(v){
 const phone=v.sitePhone??v.phone??'',dial=String(phone).replace(/[^+\d]/g,'');
 return `<div><strong>Contact sur place</strong><span>${esc(v.siteContact||'—')}</span></div><div><strong>Téléphone / SMS</strong><span>${esc(phone||'—')}</span>${/\d/.test(dial)?`<div class="actionRow"><a href="tel:${esc(dial)}">Appeler</a><a href="sms:${esc(dial)}">Envoyer un SMS</a></div>`:''}</div><div><strong>Accès / consignes</strong><span>${esc(v.siteAccess||'—')}</span></div>`;
}
