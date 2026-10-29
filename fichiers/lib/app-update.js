// Install updates explicitly, while the operator is between forms. Other tabs
// must be closed before the worker changes the shared application shell.
export async function installAppUpdates({navigator,document,location,beforeUpdate,onError=()=>{}}){
 let requested=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requested)location.reload();});
 const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
 const offer=()=>{
  if(!registration.waiting||!navigator.serviceWorker.controller)return;
  let banner=document.getElementById('appUpdate');
  if(!banner){banner=document.createElement('div');banner.id='appUpdate';banner.className='warning';banner.setAttribute('role','status');document.body.prepend(banner);}
  banner.replaceChildren();const text=document.createElement('span'),button=document.createElement('button');text.textContent='Une mise à jour OPUS est prête. ';button.textContent='Appliquer la mise à jour';banner.append(text,button);
  button.onclick=async()=>{
   button.disabled=true;
   try{
    await beforeUpdate();const worker=registration.waiting;if(!worker)throw Error('La mise à jour se prépare. Réessayez.');
    requested=true;
    await new Promise((resolve,reject)=>{
     const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Mise à jour sans réponse. Fermez puis rouvrez les fenêtres OPUS.'));},5000);
     channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();data?.ok?resolve():reject(Error(data?.message||'Fermez les autres fenêtres OPUS puis réessayez.'));};
     worker.postMessage({type:'OPUS_ACTIVATE'},[channel.port2]);
    });
   }catch(e){requested=false;text.textContent=e.message+' ';onError(e);button.disabled=false;}
  };
 };
 offer();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')offer();});});
 await registration.update();return registration;
}
