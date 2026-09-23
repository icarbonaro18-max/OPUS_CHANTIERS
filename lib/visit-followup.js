const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const visitStage=v=>v.quoteNumber||v.status==='convertie'?'quoted':v.status==='terminee'?'finished':'active';
export async function setVisitQuote(ui,v,number){
 if(!ui.c.isAdmin())throw Error('Action réservée au bureau.');
 const previous=structuredClone(v),n=String(number).trim();
 if(!n)throw Error('Indiquez le numéro du devis.');
 Object.assign(v,{quoteNumber:n,quoteCreatedAt:new Date().toISOString()});
 try{await ui.save('visits');}catch(e){for(const k of Object.keys(v))delete v[k];Object.assign(v,previous);throw e;}
}
export function mountVisitTabs(ui,root,rows){
 const tabs=document.createElement('div');tabs.className='tabs';tabs.setAttribute('aria-label','Suivi des visites et devis');
 const labels={active:'Visites à réaliser',finished:'Visites terminées',quoted:'Devis effectués'};
 tabs.innerHTML=Object.entries(labels).map(([k,l])=>`<button type="button" data-stage="${k}">${l} (${rows.filter(v=>visitStage(v)===k).length})</button>`).join('');root.querySelector('.projectList').before(tabs);
 const cards=[...root.querySelectorAll('.projectCard')];
 cards.forEach((card,i)=>{const v=rows[i],info=document.createElement('p');info.textContent=(v.quoteNumber?'Devis n° '+v.quoteNumber+' · ':'')+(v.attachments?.length||0)+' document(s)';card.querySelector('h3').after(info);
 if(ui.c.isAdmin()){const b=document.createElement('button');b.type='button';b.textContent=v.quoteNumber?'Modifier le numéro de devis':'Devis effectué';card.querySelector('.actionRow').append(b);b.onclick=async()=>{const n=prompt('Numéro du devis :',v.quoteNumber||'');if(n===null)return;b.disabled=true;try{await setVisitQuote(ui,v,n);ui.visitView='quoted';await ui.renderVisits();}catch(e){ui.c.toast(e.message);b.disabled=false;}};}
 });
 const empty=document.createElement('p');empty.textContent='Aucune visite dans cette rubrique.';root.querySelector('.projectList').append(empty);
 const draw=()=>{const stage=ui.visitView||'active';cards.forEach((c,i)=>c.hidden=visitStage(rows[i])!==stage);empty.hidden=!rows.length||rows.some(v=>visitStage(v)===stage);tabs.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.stage===stage);b.setAttribute('aria-pressed',String(b.dataset.stage===stage));});};
 tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{ui.visitView=b.dataset.stage;draw();});draw();
}
export async function addVisitFiles(ui,v,files){
 if(!ui.canPlan())throw Error('Ajout réservé au bureau et au responsable.');
 for(const file of files)if(!/\.(pdf|png|jpe?g|webp|heic|heif)$/i.test(file.name)||!file.size||file.size>20*1024*1024)throw Error('PDF ou photo uniquement, 20 Mo maximum par fichier.');
 if(!files.length)return;
 const g=ui.c.graph,root=await g.folder('root','VISITES'),visit=await g.folder(root.id,ui.fileSafe(v.number+'_'+v.id)),dir=await g.folder(visit.id,'DOCUMENTS_PREPARATION');
 for(const file of files){
 const item=await g.request(g.base(dir.id)+':/'+encodeURIComponent(crypto.randomUUID()+'_'+ui.fileSafe(file.name))+':/content',{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
 if(!item?.id)throw Error('Transfert non confirmé.');
 const previous=v.attachments;v.attachments=[...(previous||[]),{fileId:item.id,name:file.name,size:file.size,createdAt:new Date().toISOString()}];
 try{await ui.save('visits');}catch(e){v.attachments=previous;throw Error('Fichier transféré mais liaison non enregistrée : '+e.message);}
 }
}
export function mountVisitFiles(ui,v,anchor){
 const box=document.createElement('section');box.className='panel';anchor.before(box);
 const draw=()=>{box.innerHTML=`<h3>Documents de préparation (${v.attachments?.length||0})</h3><div>${(v.attachments||[]).map((f,i)=>`<p><button type="button" data-visit-file="${i}">${esc(f.name)}</button></p>`).join('')||'<p>Aucun document joint.</p>'}</div>${ui.canPlan()?'<label>Ajouter des PDF ou photos<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"></label>':''}<p role="status"></p>`;
 box.querySelectorAll('[data-visit-file]').forEach(b=>b.onclick=async()=>{const f=v.attachments[Number(b.dataset.visitFile)];try{if(ui.c.openAlertDocument)await ui.c.openAlertDocument({id:f.fileId,name:f.name});else ui.c.download(await ui.c.graph.bytes(f.fileId),f.name);}catch(e){ui.c.toast(e.message);}});
 const input=box.querySelector('input');if(input)input.onchange=async()=>{input.disabled=true;const status=box.querySelector('[role=status]');status.textContent='Enregistrement…';try{await addVisitFiles(ui,v,[...input.files]);draw();ui.c.toast('Documents enregistrés dans OPUS.');}catch(e){status.textContent=e.message;input.disabled=false;}};
 };draw();
}
