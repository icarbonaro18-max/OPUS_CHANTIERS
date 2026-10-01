import {loadPickupStates,collectOrder,pickupCount,pickupBadge} from './order-pickups.js';
export function mountInterventionPickups(ui,x,panel){
 panel.querySelector('.pickupViews')?.remove();
 const toolbar=document.createElement('div');toolbar.className='pickupViews tabs';
 toolbar.innerHTML='<button type="button" data-pickup-mode="pending">À récupérer</button><button type="button" data-pickup-mode="archive">Archives · récupérées</button><button type="button" data-pickup-refresh>Actualiser les retraits</button><p role="status"></p>';
 panel.querySelector('#intMaterialList').before(toolbar);
 const rows=x.materialOrders||[],tab=document.getElementById('intMaterialTab'),status=toolbar.querySelector('[role=status]');
 let states=new Map(),known=false,archive=false;
 const current=()=>toolbar.isConnected;
 const display=()=>{
  if(!current())return;
  const n=pickupCount(rows,states);tab.innerHTML='Bons de commande '+(known?pickupBadge(n):'· à actualiser');
  toolbar.querySelector('[data-pickup-mode=pending]').innerHTML='À récupérer '+(known?pickupBadge(n):'');
  toolbar.querySelector('[data-pickup-mode=archive]').textContent='Archives · récupérées'+(known?' ('+states.size+')':'');
  toolbar.querySelectorAll('[data-pickup-mode]').forEach(b=>b.classList.toggle('selected',(b.dataset.pickupMode==='archive')===archive));
  panel.querySelectorAll('[data-material]').forEach(b=>{
   const row=rows[Number(b.dataset.material)],article=b.closest('article'),receipt=states.get(row.fileId);
   article.hidden=known&&Boolean(receipt)!==archive;
   article.querySelector('.pickupReceipt')?.remove();article.querySelector('[data-collect-material]')?.remove();
   if(receipt){const text=document.createElement('p');text.className='pickupReceipt';text.textContent='✓ Récupérée le '+new Date(receipt.collectedAt).toLocaleString('fr-FR')+' · '+receipt.collectedBy;article.append(text);}
   else if(known){const button=document.createElement('button');button.type='button';button.dataset.collectMaterial=row.fileId;button.textContent='Commande récupérée';article.append(button);button.onclick=async()=>{button.disabled=true;try{const saved=await collectOrder(ui.c.graph,row,ui.user,{id:x.id,kind:'intervention'});states.set(row.fileId,saved);status.textContent='Commande récupérée et classée dans les archives.';display();ui.refreshPickupBadges?.();}catch(e){status.textContent='Retrait non confirmé : '+e.message;button.disabled=false;}};}
  });
 };
 const refresh=async()=>{known=false;display();status.textContent='Chargement du suivi…';try{states=await loadPickupStates(ui.c.graph,rows);known=true;status.textContent=rows.length?'':'Aucun bon joint.';}catch(e){status.textContent='Suivi indisponible : '+e.message;}display();};
 toolbar.querySelectorAll('[data-pickup-mode]').forEach(b=>b.onclick=()=>{archive=b.dataset.pickupMode==='archive';display();});toolbar.querySelector('[data-pickup-refresh]').onclick=refresh;
 refresh();
}
export async function refreshInterventionPickupBadges(ui,root){
 const buttons=[...root.querySelectorAll('[data-int-orders]')];if(!buttons.length)return;
 try{const rows=ui.data.interventions.flatMap(x=>x.materialOrders||[]),states=await loadPickupStates(ui.c.graph,rows);
  for(const b of buttons){if(!b.isConnected)continue;const x=ui.data.interventions.find(x=>x.id===b.dataset.intOrders);b.innerHTML='Bons de commande '+pickupBadge(pickupCount(x?.materialOrders||[],states));}
 }catch{for(const b of buttons)if(b.isConnected)b.textContent='Bons de commande · à actualiser';}
}
