export async function startMixedDictation(assistant,target,button){
 if(assistant.mixedBusy)return;
 if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){assistant.toast('Ce navigateur ne permet pas la dictée automatique. Utilisez le micro du clavier ou le mode Français / Italiano.');return;}
 assistant.mixedBusy=true;button.disabled=true;const initial=target.value;let stream,rec,timer,watch;const chunks=[];
 const reset=()=>{clearTimeout(timer);clearInterval(watch);stream?.getTracks().forEach(t=>t.stop());assistant.mixedRecorder=null;assistant.mixedBusy=false;button.disabled=false;button.textContent='🎙 Dicter';button.classList.remove('recording');};
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(!target.isConnected){reset();return;}
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime)throw new Error('Format audio incompatible. Utilisez le micro du clavier.');
  rec=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});assistant.mixedRecorder=rec;
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  rec.onerror=()=>{rec.onstop=null;reset();assistant.toast('Enregistrement interrompu. Vos notes écrites sont conservées.');};
  rec.onstop=async()=>{
   clearTimeout(timer);clearInterval(watch);stream.getTracks().forEach(t=>t.stop());assistant.mixedRecorder=null;button.disabled=true;button.textContent='Transcription…';
   const blob=new Blob(chunks,{type:mime.split(';')[0]});
   try{
    if(!blob.size||blob.size>2500000)throw new Error('Enregistrement vide ou trop long.');
    const data=await transcribe(assistant,blob);
    if(target.isConnected&&target.value===initial){target.value=[initial.trim(),data.text].filter(Boolean).join('\n');target.dispatchEvent(new Event('input',{bubbles:true}));assistant.toast('Dictée ajoutée. Relisez puis utilisez « Français propre ».');}
    else showRecovered(assistant,data.text);
   }catch(e){assistant.toast(e.message);showAudioRecovery(assistant,blob);}
   finally{reset();}
  };
  rec.start(1000);button.disabled=false;button.textContent='⏹ Terminer la dictée';button.classList.add('recording');
  assistant.toast('Dictée français / italien active. Appuyez sur Terminer pour transcrire (2 min maximum).');
  timer=setTimeout(()=>{if(rec.state==='recording')rec.stop();},120000);
  watch=setInterval(()=>{if(!target.isConnected&&rec.state==='recording')rec.stop();},500);
 }catch(e){reset();assistant.toast(e.name==='NotAllowedError'?'Autorisez le microphone pour dicter.':e.message||'Impossible de démarrer le microphone.');}
}
async function transcribe(assistant,blob){
 if(!assistant.getToken)throw new Error('Connexion Microsoft nécessaire.');
 const audio=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
 const token=await assistant.getToken();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
 try{const r=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({mime:blob.type,audio}),signal:controller.signal});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Dictée indisponible.');return data;}finally{clearTimeout(timer);}
}
function recoveryBox(){document.getElementById('opusAudioRecovery')?.remove();const box=document.createElement('section');box.id='opusAudioRecovery';box.className='translationPopover';document.body.append(box);return box;}
function showRecovered(assistant,text){const box=recoveryBox();box.innerHTML='<strong>Dictée récupérée</strong><p>Le champ a changé. Copiez ce texte dans vos notes.</p><textarea rows="8" aria-label="Texte dicté"></textarea><button type="button">Fermer</button>';box.querySelector('textarea').value=text;box.querySelector('button').onclick=()=>box.remove();}
function showAudioRecovery(assistant,blob){if(!blob.size)return;const box=recoveryBox(),url=URL.createObjectURL(blob);box.innerHTML='<strong>Audio conservé temporairement</strong><p>Vous pouvez réessayer la transcription ou télécharger votre dictée avant de fermer cette page.</p><button type="button">Réessayer</button> <a>Télécharger l’audio</a> <button type="button">Fermer</button>';const link=box.querySelector('a');link.href=url;link.download=blob.type==='audio/mp4'?'dictee.mp4':'dictee.webm';const [retry,close]=box.querySelectorAll('button');close.onclick=()=>{URL.revokeObjectURL(url);box.remove();};retry.onclick=async()=>{retry.disabled=true;try{const data=await transcribe(assistant,blob);URL.revokeObjectURL(url);showRecovered(assistant,data.text);}catch(e){assistant.toast(e.message);}finally{retry.disabled=false;}};}
