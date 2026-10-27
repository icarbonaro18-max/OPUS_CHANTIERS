/* Adapter for existing OPUS forms. Only same-origin, active-frame, nonce-scoped messages. */
(()=>{
 if(!window.OPUS_EMBEDDED)return;
 document.documentElement.classList.add('opus-hosted');
 const moduleKey=document.currentScript.dataset.module,nonce=new URLSearchParams(location.search).get('session');
 let initialized=false,initializing=false,lastConfirmed='',dirtyTimer,asyncCount=0,payload,captureBusy=null,captureSerial=0,pendingCapture=null,needsSave=true,editGeneration=0;
 const captureRequests=new Set(),canvasPointers=new Map();
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const post=(type,extra={})=>parent.postMessage({type,nonce,moduleKey,...extra},location.origin);
 // Disable independent drafts in the modules. The central app is the only persistence owner.
 for(const n of ['saveState','pmFlush','pmSchedule','pmInit','initProjectSystem']){
  if(typeof window[n]==='function')window[n]=()=>Promise.resolve();
 }
 // Track asynchronous photographs so a capture waits for their insertion.
 for(const n of ['compressImage','processPhoto','imageFileToData','fileToCompressedData']){
  const f=window[n];if(typeof f!=='function')continue;
  window[n]=async function(...args){asyncCount++;try{return await f.apply(this,args);}finally{asyncCount--;schedule();}};
 }
 function blank(){
  for(const n of ['blankProjectState','pmBlankState','pmBlank','blankState'])if(typeof window[n]==='function')return window[n]();
  return typeof collectState==='function'?collectState():{};
 }
 function setField(id,value){if(value==null||value==='')return;const e=document.getElementById(id);if(!e)return;
  if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===value))return;
  e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
 }
 function prefill(ctx,ref){
  const tech=ctx.technician||'',operation=[ctx.chantier||ctx.name,ctx.devis?'Devis n° '+ctx.devis:''].filter(Boolean).join(' — ');
  const f={...ctx.headers,reference:ref,technicien:tech,client:ctx.client,exploitant:ctx.client,adresse:ctx.adresse,operation,site:ctx.name,chantier:ctx.name,installation:ctx.name,ordre:ctx.devis?'Devis n° '+ctx.devis:'',contact:ctx.contact,telephone:ctx.telephone,email:ctx.email,sourceAuteur:ctx.controleur,sourceRef:ctx.rapportRef};
  for(const [k,v]of Object.entries(f))setField(k,v);
  if(!document.getElementById('chargeTravaux')?.value){setField('chargeTravaux',tech);setField('chargeConsignation',tech);setField('sigNomTravaux',tech);setField('sigNomConsignation',tech);}
  // Known quote only sets a material reference, never invents quantities or test results.
  if(moduleKey==='intervention'&&ctx.devis){const e=document.querySelector('input[name="materialMode"][value="devis"]');if(e){e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}setField('materialReference',ctx.devis);}
 }
 async function settle(){
  // Wait again if a new photo/stroke starts during the quiet period. A capture
  // must include the completed insertion, not the earlier empty photograph.
  for(let i=0;i<400;i++){
   if(asyncCount||canvasPointers.size){await pause(100);continue;}
   await pause(80);if(!asyncCount&&!canvasPointers.size)return;
  }
  throw Error('Une photo ou une signature est encore en préparation. Réessayez dans un instant.');
 }
 function snapshot(){
  const serialized=JSON.stringify(collectState()),state=JSON.parse(serialized),requests=[...captureRequests];captureRequests.clear();
  const changed=needsSave||serialized!==lastConfirmed;
  const retryDue=pendingCapture?.serialized===serialized&&Date.now()-pendingCapture.sentAt>=8000;
  if(requests.length||changed&&(!pendingCapture||pendingCapture.serialized!==serialized||retryDue)){
   if(!pendingCapture||pendingCapture.serialized!==serialized)pendingCapture={captureId:++captureSerial,serialized,sentAt:0,generation:editGeneration};
   pendingCapture.sentAt=Date.now();needsSave=true;
   // An ACK can be lost, so retries reuse the same capture ID. The parent must
   // ACK matching hashes too, but only after their local write is durable.
   for(const requestId of requests.length?requests:[null])post('opus-state',{state,requestId,captureId:pendingCapture.captureId});
  }
  return state;
 }
 function capture(requestId=null,immediate=false){
  if(!initialized)return Promise.reject(Error('Le formulaire se prépare encore.'));
  if(requestId)captureRequests.add(requestId);
  if(captureBusy)return captureBusy;
  const work=immediate&&!asyncCount&&!canvasPointers.size?Promise.resolve().then(snapshot):settle().then(snapshot);
  captureBusy=work.catch(error=>{captureRequests.clear();throw error;}).finally(()=>{captureBusy=null;});
  return captureBusy;
 }
 function backgroundCapture(immediate=false){return capture(null,immediate).catch(error=>post('opus-autosave-error',{message:error.message||String(error)}));}
 function schedule(){if(!initialized)return;editGeneration++;needsSave=true;clearTimeout(dirtyTimer);dirtyTimer=setTimeout(()=>backgroundCapture(),800);}
 function acknowledge(message){
  if(!pendingCapture||message.captureId!==pendingCapture.captureId)return;
  if(message.ok===true){lastConfirmed=pendingCapture.serialized;needsSave=editGeneration!==pendingCapture.generation;pendingCapture=null;}
  else if(message.ok===false){pendingCapture=null;needsSave=true;}
 }
 function finishCanvasPointers(){
  // Let each module's own pointerup handler commit its current stroke (some
  // legacy pads listen on window rather than on the canvas).
  // Never restore or clear a canvas while the technician is working.
  for(const [pointerId,canvas]of canvasPointers){
   const event=typeof PointerEvent==='function'?new PointerEvent('pointerup',{pointerId,bubbles:true}):new Event('pointerup',{bubbles:true});
   if(!('pointerId'in event))Object.defineProperty(event,'pointerId',{value:pointerId});
   canvas.dispatchEvent(event);
  }
  canvasPointers.clear();
 }
 function checkpoint(){if(!initialized)return;clearTimeout(dirtyTimer);finishCanvasPointers();void backgroundCapture(true);}
 async function generate(){const state=await capture();let builder;
  if(typeof buildAutonomousPdf==='function')builder=buildAutonomousPdf;
  else if(typeof buildInterventionPdf==='function')builder=buildInterventionPdf;
  else if(typeof buildReservePdf==='function')builder=buildReservePdf;
  else if(typeof buildPdf==='function')builder=buildPdf;
  else throw Error('Générateur PDF indisponible pour ce formulaire.');
  const b=await builder(state);const blob=b instanceof Blob?b:new Blob([b],{type:'application/pdf'});
  if(blob.size<1000)throw Error('Le PDF généré semble incomplet.');return blob;
 }
 window.addEventListener('message',async e=>{
  if(e.source!==parent||e.origin!==location.origin||e.data?.nonce!==nonce)return;
  const m=e.data;
  if(m.moduleKey&&m.moduleKey!==moduleKey)return;
  if(m.type==='opus-state-ack'){acknowledge(m);return;}
  try{
   if(m.type==='opus-init'){
    if(initialized||initializing)return;initializing=true;payload=m.payload;
    // Each iframe is fresh. Clear radios/checkboxes before restoring an existing form.
    await pause(350);let s=payload.state||blank();
    if(!payload.state&&moduleKey==='reserves'&&payload.context?.observations?.length){s.reserves=payload.context.observations.filter(o=>o.scope==='Dans devis').map(o=>({ref:String(o.n||''),location:o.location||'',category:'Électricité',observation:o.text||o.title||'',travaux:'',essais:'',comment:'',date:'',status:'Non levée',before:'',after:''}));}
    if(payload.state)document.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(e=>e.checked=false);
    if(typeof applyState!=='function')throw Error('Ce formulaire ne peut pas être restauré.');
    applyState(s);await pause(200);
    if(!payload.state){prefill(payload.context||{},payload.ref);
     if(moduleKey==='consignation'){
      for(const n of ['sourcesIdentifiees','vatTousConducteurs','vatPhases','vatPhaseNeutre','vatTerre'])document.querySelectorAll('input[name="'+n+'"]').forEach(e=>e.checked=false);
      for(const id of ['habilitationConsignation','condamnationVerifiee','vatLieuTravail','miseTerreMode','dechargeMode','attestationRemise']){const e=document.getElementById(id);if(e&&e.tagName==='SELECT'){if(![...e.options].some(o=>o.value===''))e.add(new Option('À renseigner',''),0);e.value='';}}
     }
    }
    // No signature is copied from the current user or another attestation.
    initialized=true;initializing=false;post('opus-initialized');await capture();
   }else if(m.type==='opus-capture')await capture(m.requestId);
   else if(m.type==='opus-pdf'){const blob=await generate();post('opus-pdf',{requestId:m.requestId,blob,fileName:(payload.ref||'OPUS_ATTESTATION')+'.pdf'});}
  }catch(e){initializing=false;post('opus-error',{requestId:m.requestId,message:e.message||String(e)});}
 });
 document.addEventListener('pointerdown',event=>{if(event.target?.tagName==='CANVAS')canvasPointers.set(event.pointerId,event.target);},true);
 for(const type of ['pointerup','pointercancel','pointerleave'])document.addEventListener(type,event=>{if(canvasPointers.delete(event.pointerId))schedule();},true);
 for(const type of ['input','change','click','pointerup'])document.addEventListener(type,schedule,true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint();else if(initialized)void backgroundCapture(true);});
 window.addEventListener('pagehide',checkpoint);
 window.addEventListener('pageshow',()=>{if(initialized)void backgroundCapture(true);});
 // Catch canvas strokes and async UI changes that emit no input event.
 setInterval(()=>{if(initialized&&!document.hidden&&(needsSave||pendingCapture))void backgroundCapture();},4000);
 const ready=()=>post('opus-ready');if(document.readyState==='complete')ready();else window.addEventListener('load',ready,{once:true});
})();
