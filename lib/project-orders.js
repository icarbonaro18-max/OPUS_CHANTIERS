import {loadPickupStates,collectOrder,pickupCount,pickupBadge} from './order-pickups.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function orderGroups(rows){const groups=new Map();rows.forEach((f,i)=>{const parts=(f.orderPath||f.name).split(' / ').filter(s=>s!=='FOURNISSEURS');const name=parts.length>1?parts[0]:'Autres documents';if(!groups.has(name))groups.set(name,[]);groups.get(name).push({f,i});});return [...groups].map(([name,files])=>({name,files}));}
const depot=name=>/^(DEPOT_BUC|D[ÉE]P[ÔO]T(?: DE)? BUC)$/i.test(name);
export async function loadOrders(g,projectId){
 const root=(await g.children(projectId)).find(x=>x.folder&&x.name==='03_COMMANDES');if(!root)return {supplier:[],depot:[],root:null};
 const result={supplier:[],depot:[],root};
 async function walk(id,group,path,ancestors=new Set()){
  if(ancestors.has(id))throw Error('Arborescence de commandes invalide.');const next=new Set(ancestors).add(id);
  for(const item of await g.children(id)){const where=path?path+' / '+item.name:item.name,kind=group==='depot'||depot(item.name)?'depot':'supplier';if(item.folder)await walk(item.id,kind,where,next);else if(item.file&&!/^desktop\.ini$/i.test(item.name))result[kind].push({...item,orderPath:where});}
 }
 await walk(root.id,'supplier','');return result;
}
export async function renderOrders(ctx,{group='supplier',data=null,archive=false}={}){
 const {g,project,root,openDocument,isAdmin,toast,onCounts}=ctx;
 root.innerHTML='<section class="panel">Chargement des bons de commande…</section>';
 try{data=data||await loadOrders(g,project.id);}catch(e){if(ctx.isCurrent&&!ctx.isCurrent())return;root.innerHTML='<section class="panel"><h2>Bons de commande</h2><p>Impossible de lire les pièces jointes. Vérifiez la connexion puis réessayez.</p><button id="retryOrders">Réessayer</button></section>';root.querySelector('button').onclick=()=>renderOrders(ctx,{group});return;}
 if(ctx.isCurrent&& !ctx.isCurrent())return;
 let states,trackingError='';try{states=await loadPickupStates(g,[...data.supplier,...data.depot]);}catch(e){states=new Map();trackingError=e.message;}
 if(ctx.isCurrent&&!ctx.isCurrent())return;onCounts?.({...data,pending:trackingError?null:pickupCount([...data.supplier,...data.depot],states)});
 const rows=data[group].filter(f=>trackingError||states.has(f.id)===archive),groups=orderGroups(rows);
 const pending=pickupCount([...data.supplier,...data.depot],states);
 root.innerHTML=`<section class="panel"><h2>Bons de commande / matériel</h2><div class="tabs"><button data-pickup-view="pending" class="${!archive?'selected':''}">À récupérer ${trackingError?'':pickupBadge(pending)}</button><button data-pickup-view="archive" class="${archive?'selected':''}">Archives · récupérées (${states.size})</button><button type="button" id="refreshPickups">Actualiser</button></div>${trackingError?'<p role="alert">Suivi des retraits indisponible. Actualisez avant de confirmer une récupération.</p>':''}<div class="tabs"><button data-orders-group="supplier" class="${group==='supplier'?'selected':''}">Fournisseurs <span class="countBadge">${trackingError?'—':data.supplier.filter(f=>states.has(f.id)===archive).length}</span></button><button data-orders-group="depot" class="${group==='depot'?'selected':''}">Dépôt de Buc <span class="countBadge">${trackingError?'—':data.depot.filter(f=>states.has(f.id)===archive).length}</span></button></div><p>${group==='supplier'?'Bons de commande et pièces fournisseurs : Rexel, YESSS, Sonepar…':'Matériel à récupérer au dépôt de Buc. Consultez les listes préparées par le bureau.'}</p>${isAdmin()?'<button id="addOrderFiles">+ Ajouter des pièces jointes</button>':''}<div>${groups.map(g=>`<details class="supplierGroup" ${groups.length===1?'open':''}><summary>${esc(g.name)} (${g.files.length})</summary>${g.files.map(({f,i})=>`<div class="row"><div><h3><button type="button" class="documentLink" data-order-file="${i}">${esc(f.name)}</button></h3><p>${esc(f.orderPath)}</p>${states.has(f.id)?`<p>✓ Récupérée le ${esc(new Date(states.get(f.id).collectedAt).toLocaleString('fr-FR'))} · ${esc(states.get(f.id).collectedBy)}</p>`:''}</div>${!states.has(f.id)&&!trackingError?`<button type="button" data-collect-order="${i}">Commande récupérée</button>`:''}</div>`).join('')}</details>`).join('')||`<p class="muted">${archive?'Aucune commande récupérée dans cette rubrique.':'Aucune commande à récupérer dans cette rubrique.'}</p>`}</div><p class="muted">Confirmez la récupération uniquement après le retrait du matériel. Les bons restent conservés dans les archives de l’affaire.</p></section>`;
 root.querySelectorAll('[data-orders-group]').forEach(b=>b.onclick=()=>renderOrders(ctx,{group:b.dataset.ordersGroup,data,archive}));
 root.querySelectorAll('[data-order-file]').forEach(b=>b.onclick=async()=>{try{await openDocument(rows[Number(b.dataset.orderFile)]);}catch(e){toast(e.message);}});
 root.querySelectorAll('[data-pickup-view]').forEach(b=>b.onclick=()=>renderOrders(ctx,{group,data,archive:b.dataset.pickupView==='archive'}));
 root.querySelector('#refreshPickups').onclick=()=>renderOrders(ctx,{group,archive});
 root.querySelectorAll('[data-collect-order]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await collectOrder(g,rows[Number(b.dataset.collectOrder)],ctx.user,{id:project.id,kind:'project'});toast('Commande récupérée et classée dans les archives.');await renderOrders(ctx,{group,data,archive});}catch(e){toast('Retrait non confirmé : '+e.message);b.disabled=false;}});
 if(isAdmin())root.querySelector('#addOrderFiles').onclick=()=>uploadOrders(ctx,group);
}
function uploadOrders(ctx,group){
 const {g,project,root,toast,isAdmin}=ctx;if(!isAdmin())return;
 root.innerHTML=`<section class="panel"><h2>Ajouter — ${group==='depot'?'Dépôt de Buc':'Fournisseurs'}</h2><form id="orderUpload">${group==='supplier'?'<label>Fournisseur (facultatif)</label><input id="orderSupplier" placeholder="Rexel, YESSS, Sonepar…" maxlength="80">':''}<label>Pièces jointes : Excel, PDF, photos…</label><input id="orderFiles" type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.webp" required><p id="orderUploadStatus" role="status"></p><div class="actionRow"><button type="submit">Envoyer dans OPUS</button><button type="button" id="cancelOrderUpload" class="secondary">Retour</button></div></form></section>`;
 const form=root.querySelector('form');root.querySelector('#cancelOrderUpload').onclick=()=>renderOrders(ctx,{group});
 form.onsubmit=async e=>{e.preventDefault();if(!isAdmin()||form.dataset.busy)return;const input=form.querySelector('#orderFiles'),files=[...input.files];if(!files.length)return;form.dataset.busy='1';const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);input.disabled=true;const state=form.querySelector('#orderUploadStatus');let sent=0;
  try{const base=await g.folder(project.id,'03_COMMANDES');let dest=await g.folder(base.id,group==='depot'?'DEPOT_BUC':'FOURNISSEURS');const supplier=form.querySelector('#orderSupplier')?.value.trim().replace(/["*:<>?/\\|\x00-\x1f]/g,'-').replace(/[. ]+$/,'');if(group==='supplier'&&supplier)dest=await g.folder(dest.id,supplier);
   for(const file of files){state.textContent=`Envoi ${sent+1}/${files.length} : ${file.name}`;await g.upload(dest.id,file.name,file);sent++;}
   toast(`${sent} pièce(s) enregistrée(s) dans OPUS.`);if(!ctx.isCurrent||ctx.isCurrent())await renderOrders(ctx,{group});
  }catch(e){state.textContent=`${sent}/${files.length} pièce(s) envoyée(s). ${e.message}. Revenez à la liste et sélectionnez uniquement les fichiers manquants.`;}
  finally{delete form.dataset.busy;buttons.forEach(b=>b.disabled=false);input.disabled=false;}
 };
}
