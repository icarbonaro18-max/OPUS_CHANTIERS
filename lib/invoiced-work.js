const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function invoicedWork(ui){
 const projects=ui.c.getCatalog?.().projects||[];
 return [
 ...(ui.data.projectTracking||[]).filter(r=>r.invoicedAt).map(r=>({kind:'project',record:r,label:projects.find(p=>p.id===r.id)?.name||r.projectName||r.id})),
 ...(ui.data.interventions||[]).filter(r=>!r.projectId&&r.status==='facturee').map(r=>({kind:'intervention',record:r,label:[r.number,r.clientName,r.title].filter(Boolean).join(' · ')}))
 ].sort((a,b)=>String(b.record.invoicedAt||'').localeCompare(String(a.record.invoicedAt||'')));
}
export async function undoInvoice(ui,kind,id){
 if(!ui.c.isAdmin())throw Error('Action réservée à l’administrateur.');
 if(ui.dataLoadError)throw Error('Actualisez les données Microsoft avant de continuer.');
 if(!['project','intervention'].includes(kind))throw Error('Type de dossier inconnu.');
 const key=kind==='project'?'projectTracking':'interventions',g=ui.c.graph;
 const root=await g.named('root','_OPUS_SYSTEM'),file=root&&await g.named(root.id,key+'.json');
 if(!file)throw Error('Données Microsoft introuvables.');
 const meta=await g.item(file.id),rows=await g.json(file.id);
 if(!meta.eTag||!Array.isArray(rows))throw Error('Données Microsoft non vérifiables.');
 const matches=rows.filter(r=>r.id===id),r=matches[0];
 if(matches.length!==1||(kind==='project'?!r.invoicedAt:(r.projectId||r.status!=='facturee')))throw Error('Ce dossier n’est plus marqué facturé. Actualisez.');
 const now=new Date().toISOString();
 r.history=[...(r.history||[]),{at:now,by:ui.user?.displayName||'',action:'Marquage facturé annulé',invoiceNumber:r.invoiceNumber||'',invoicedAt:r.invoicedAt||null}];
 r.invoiceNumber='';r.invoicedAt=null;r.updatedAt=now;
 if(kind==='intervention')r.status='terminee';
 await g.request(g.base(meta.id)+'/content',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':meta.eTag},body:new Blob([JSON.stringify(rows)],{type:'application/json'})});
 const confirmed=await g.json(meta.id),saved=Array.isArray(confirmed)&&confirmed.find(x=>x.id===id);
 if(!saved||saved.invoicedAt||saved.invoiceNumber||saved.updatedAt!==now||(kind==='intervention'&&saved.status!=='terminee'))throw Error('Modification non confirmée. Actualisez.');
 ui.data[key]=confirmed;
}
export function mountInvoicedWork(ui,root){
 if(!ui.c.isAdmin())return;
 const rows=invoicedWork(ui),box=document.createElement('details');box.className='panel';
 box.innerHTML=`<summary>Facturés <span class="countBadge">${rows.length}</span></summary><p>Chantiers et interventions déjà marqués facturés.</p><input type="search" aria-label="Rechercher un dossier facturé" placeholder="Client, chantier, intervention ou numéro de facture…"><div class="invoicedList"></div>`;
 root.append(box);const list=box.querySelector('.invoicedList');
 const draw=()=>{const q=box.querySelector('input').value.toLocaleLowerCase('fr');list.innerHTML=rows.map((x,i)=>({x,i})).filter(({x})=>(x.label+' '+(x.record.invoiceNumber||'')).toLocaleLowerCase('fr').includes(q)).map(({x,i})=>`<div class="row"><div><button type="button" class="documentLink" data-billed-open="${i}">${esc(x.label)}</button><p>${x.kind==='project'?'Chantier':'Intervention'} · Facture : ${esc(x.record.invoiceNumber||'Non renseignée')}${x.record.invoicedAt?' · '+esc(new Date(x.record.invoicedAt).toLocaleDateString('fr-FR')):''}</p></div><button type="button" data-billed-undo="${i}">Remettre à facturer</button></div>`).join('')||'<p>Aucun dossier facturé correspondant.</p>';
 list.querySelectorAll('[data-billed-open]').forEach(b=>b.onclick=async()=>{const x=rows[Number(b.dataset.billedOpen)];try{if(x.kind==='project'){await ui.show('projects');await ui.c.openProject(x.record.id);}else await ui.openIntervention(x.record.id);}catch(e){ui.c.toast(e.message);}});
 list.querySelectorAll('[data-billed-undo]').forEach(b=>b.onclick=async()=>{const x=rows[Number(b.dataset.billedUndo)];if(!confirm(`Remettre « ${x.label} » à facturer ? Cette action corrige uniquement le classement dans OPUS et n’annule pas la facture émise.`))return;b.disabled=true;try{await undoInvoice(ui,x.kind,x.record.id);ui.c.toast('Dossier remis à facturer.');await ui.renderOffice();}catch(e){b.disabled=false;ui.c.toast(e.message);}});
 };box.querySelector('input').oninput=draw;draw();
}
