const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function clientContactHtml(c){
 const phone=String(c.phone||'').trim(),email=String(c.email||'').trim();
 return '<div class="clientContactDetails"><p><strong>Coordonnées du client</strong></p><p>Téléphone : '+(phone?'<a href="tel:'+esc(phone.replace(/[^+\d]/g,''))+'">'+esc(phone)+'</a>':'Non renseigné')+'</p><p>E-mail : '+(email?'<a href="mailto:'+esc(encodeURIComponent(email))+'">'+esc(email)+'</a>':'Non renseigné')+'</p></div>';
}
export async function saveClientDraft(ui,draft){
 const previous=ui.data.clients;
 ui.data.clients=previous.some(c=>c.id===draft.id)?previous.map(c=>c.id===draft.id?draft:c):[...previous,draft];
 try{await ui.save('clients');}catch(e){ui.data.clients=previous;throw e;}
}
