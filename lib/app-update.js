// The persistent header control checks for a published build and explicitly
// activates a fully installed shell. No customer data or local draft is cleared.
export async function installAppUpdates({navigator,document,location,beforeUpdate=async()=>{},onError=()=>{}}){
 let requested=false,busy=false,registration=null;
 let button=document.getElementById('appUpdateButton');
 if(!button){button=document.createElement('button');button.id='appUpdateButton';button.type='button';button.className='secondary';button.textContent='Mise à jour';const toolbar=document.querySelector('header .topright');if(toolbar)toolbar.prepend(button);else document.body.prepend(button);}
 let notice=document.getElementById('appUpdate');
 if(!notice){notice=document.createElement('div');notice.id='appUpdate';notice.className='warning';notice.hidden=true;notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');const header=document.querySelector('header');if(header)header.after(notice);else button.after(notice);}
 const say=text=>{notice.hidden=false;notice.textContent=text;};
 const ready=()=>!!(registration?.waiting&&navigator.serviceWorker.controller);
 const paint=({announce=false}={})=>{if(busy)return;button.disabled=false;button.textContent=ready()?'Appliquer la mise à jour':'Mise à jour';button.title=ready()?'Installer la nouvelle version et recharger OPUS':'Vérifier si une nouvelle version OPUS est disponible';if(ready()&&announce)say('Une nouvelle version OPUS est prête.');};
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requested){requested=false;location.reload();}});
 const connect=async()=>{
  if(registration)return registration;
  registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(!worker)return;if(!busy){button.textContent='Préparation de la mise à jour…';button.disabled=true;}worker.addEventListener('statechange',()=>{if(['installed','redundant'].includes(worker.state)){paint({announce:true});if(worker.state==='redundant')say('Téléchargement interrompu. Réessayez « Mise à jour ».');}});});
  return registration;
 };
 const activate=async()=>{
  await beforeUpdate();const worker=registration.waiting;if(!worker)throw Error('La mise à jour se prépare. Réessayez dans quelques instants.');
  requested=true;button.textContent='Application de la mise à jour…';
  await new Promise((resolve,reject)=>{
   const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Mise à jour sans réponse. Réessayez « Mise à jour ». Votre saisie est conservée.'));},5000);
   channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();data?.ok?resolve():reject(Error(data?.message||'Fermez les autres fenêtres OPUS puis réessayez.'));};
   try{worker.postMessage({type:'OPUS_ACTIVATE'},[channel.port2]);}catch(e){clearTimeout(timer);channel.port1.close();reject(e);}
  });
 };
 button.onclick=async()=>{
  if(busy)return;busy=true;button.disabled=true;
  try{
   await connect();
   if(!ready()){button.textContent='Recherche de mise à jour…';await registration.update();}
   if(ready()){await activate();return;}
   if(registration.installing)say('La nouvelle version se télécharge. Le bouton permettra de l’appliquer dès qu’elle sera prête.');
   else say('OPUS est à jour. Aucune nouvelle version publiée n’est disponible.');
  }catch(e){requested=false;say(e.message||'Vérification indisponible. Réessayez lorsque le réseau est disponible.');onError(e);}
  finally{busy=false;paint();}
 };
 try{await connect();paint({announce:true});await registration.update();paint({announce:true});}
 catch(e){say('Vérification des mises à jour indisponible. Réessayez avec le bouton « Mise à jour ».');paint();onError(e);}
 // Recheck when the installed app returns to the foreground, without reloading it.
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!busy&&registration)void registration.update().then(()=>paint({announce:true})).catch(()=>{});});
 return registration;
}
