import {startMixedDictation} from './audio-dictation.js?v=20260914';
export class OpusAssistant {
  constructor(config={},hooks={}){
    this.config=config||{};
    this.toast=hooks.toast||(()=>{});
    this.getToken=hooks.getToken;
    this.activeRecognition=null;
    this.activeButton=null;
  }
  get endpoint(){return String(this.config.aiEndpoint||this.config.ai?.endpoint||'').trim();}
  get aiReady(){return !!this.endpoint;}
  dictationLang(){return localStorage.getItem('opus-dictation-mode-v2')||'auto';}
  setDictationLang(lang){localStorage.setItem('opus-dictation-mode-v2',lang||'auto');}
  languageSelectHtml(){const lang=this.dictationLang();return `<label class="dictationLang">Dictée <select data-opus-dictation-lang><option value="auto" ${lang==='auto'?'selected':''}>Automatique FR / IT</option><option value="it-IT" ${lang==='it-IT'?'selected':''}>Italiano</option><option value="fr-FR" ${lang==='fr-FR'?'selected':''}>Français</option></select></label><small>Mode automatique : votre dictée audio est transmise à OpenAI pour transcription.</small>`;}
  toolsHtml(targetId,{translate=true,rewrite=true}={}){
    return `<div class="fieldTools" data-tools-for="${targetId}"><button type="button" class="voiceBtn" data-voice-target="${targetId}">🎙 Dicter</button>${rewrite?`<button type="button" class="aiBtn" data-ai-action="rewrite_fr" data-ai-target="${targetId}">✨ Français propre</button>`:''}${translate?`<button type="button" class="aiBtn secondary" data-ai-action="translate_it" data-ai-target="${targetId}">🇮🇹 Italiano</button>`:''}</div>`;
  }
  bind(root=document,contextProvider=()=>({})){
    root.querySelectorAll('[data-opus-dictation-lang]').forEach(sel=>{sel.value=this.dictationLang();sel.onchange=()=>this.setDictationLang(sel.value);});
    root.querySelectorAll('[data-voice-target]').forEach(btn=>btn.onclick=()=>this.toggleDictation(btn.dataset.voiceTarget,btn));
    root.querySelectorAll('[data-ai-action]').forEach(btn=>btn.onclick=()=>this.runAction(btn.dataset.aiAction,btn.dataset.aiTarget,contextProvider(),btn));
  }
  cleanTranscript(text=''){
    const raw=String(text||'').replace(/\s+/g,' ').trim();if(!raw)return '';
    const words=raw.split(' '),out=[];
    for(const w of words){
      if(out.length&&out[out.length-1].toLocaleLowerCase('fr')===w.toLocaleLowerCase('fr'))continue;
      out.push(w);
    }
    // Supprime les répétitions immédiates de petits groupes (ex. "salvavita spento salvavita spento").
    let arr=out;
    for(let size=4;size>=2;size--){
      const next=[];let i=0;
      while(i<arr.length){
        const a=arr.slice(i,i+size).join(' ').toLowerCase(),b=arr.slice(i+size,i+size*2).join(' ').toLowerCase();
        if(a&&a===b){next.push(...arr.slice(i,i+size));i+=size*2;while(arr.slice(i,i+size).join(' ').toLowerCase()===a)i+=size;}
        else{next.push(arr[i]);i++;}
      }
      arr=next;
    }
    return arr.join(' ').replace(/\s+([,.;:!?])/g,'$1').trim();
  }
  toggleDictation(targetId,button){
    if(this.mixedRecorder){if(this.mixedRecorder.state==='recording')this.mixedRecorder.stop();return;}
    if(this.mixedBusy)return;
    if(this.dictationLang()==='auto'){const target=document.getElementById(targetId);if(target)return startMixedDictation(this,target,button);return;}
    if(this.activeRecognition){this.stopDictation();return;}
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){this.toast('Dictée vocale non disponible dans ce navigateur. Utilisez le micro du clavier Android.');return;}
    const target=document.getElementById(targetId);if(!target)return;
    const rec=new Recognition();this.activeRecognition=rec;this.activeButton=button;
    rec.lang=this.dictationLang();
    // Sur Chrome/Samsung, le mode continu peut réémettre le même segment plusieurs fois.
    // Une dictée = une séquence jusqu'au silence, puis l'utilisateur peut relancer le micro.
    rec.continuous=false;rec.interimResults=true;rec.maxAlternatives=1;
    const startText=String(target.value||'').trim();const finalByIndex=new Map();let latestInterim='';
    rec.onstart=()=>{button.textContent='⏹ Arrêter';button.classList.add('recording');this.toast(rec.lang.startsWith('it')?'Dictée italienne active…':'Dictée française active…');};
    rec.onresult=e=>{
      latestInterim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=String(e.results[i][0]?.transcript||'').trim();if(!t)continue;
        if(e.results[i].isFinal)finalByIndex.set(i,t);else latestInterim=t;
      }
      const spoken=this.cleanTranscript([...finalByIndex.values(),latestInterim].filter(Boolean).join(' '));
      target.value=[startText,spoken].filter(Boolean).join(' ');
      target.dispatchEvent(new Event('input',{bubbles:true}));
    };
    rec.onerror=e=>{console.warn('Dictation error',e);if(e.error!=='aborted')this.toast('La dictée vocale a été interrompue. Vous pouvez recommencer ou utiliser le micro du clavier.');this.stopDictation(false);};
    rec.onend=()=>this.stopDictation(false);
    try{rec.start();}catch(e){this.stopDictation(false);this.toast('Impossible de démarrer la dictée. Réessayez ou utilisez le micro du clavier.');}
  }
  stopDictation(stopRecognition=true){
    if(this.mixedRecorder?.state==='recording')this.mixedRecorder.stop();
    const rec=this.activeRecognition,btn=this.activeButton;this.activeRecognition=null;this.activeButton=null;
    if(stopRecognition&&rec){try{rec.stop();}catch{}}
    if(btn){btn.textContent='🎙 Dicter';btn.classList.remove('recording');}
  }
  localFrenchCleanup(text){
    let s=this.cleanTranscript(text);
    const replacements=[
      [/\bnon funziona\b/gi,'ne fonctionne pas'],[/\bda cambiare\b/gi,'à remplacer'],[/\bda sostituire\b/gi,'à remplacer'],
      [/\bsostituire\b/gi,'remplacer'],[/\bcambiare\b/gi,'remplacer'],[/\binterruttore differenziale\b/gi,'interrupteur différentiel'],
      [/\bsalvavita\b/gi,'dispositif différentiel'],[/\binterruttore\b/gi,'interrupteur'],[/\bdifferenziale\b/gi,'différentiel'],
      [/\bspento\b/gi,'éteint'],[/\bacceso\b/gi,'allumé'],[/\bpresa\b/gi,'prise'],[/\bluce\b/gi,'éclairage'],[/\blampada\b/gi,'luminaire'],
      [/\bquadro elettrico\b/gi,'tableau électrique'],[/\bguasto\b/gi,'défaut'],[/\bfoto\b/gi,'photo']
    ];
    for(const [rx,val] of replacements)s=s.replace(rx,val);
    s=s.replace(/\s+/g,' ').trim();if(!s)return s;
    s=s.charAt(0).toUpperCase()+s.slice(1);if(!/[.!?]$/.test(s))s+='.';
    return s;
  }
  localItalianHelp(text){
    let s=this.cleanTranscript(text);
    const replacements=[
      [/\bne fonctionne pas\b/gi,'non funziona'],[/\bà remplacer\b/gi,'da sostituire'],[/\bremplacer\b/gi,'sostituire'],
      [/\bdispositif différentiel\b/gi,'salvavita'],[/\binterrupteur différentiel\b/gi,'interruttore differenziale'],[/\binterrupteur\b/gi,'interruttore'],
      [/\bprise\b/gi,'presa'],[/\béclairage\b/gi,'luce'],[/\bluminaire\b/gi,'lampada'],[/\btableau électrique\b/gi,'quadro elettrico'],
      [/\bdéfaut\b/gi,'guasto'],[/\béteint\b/gi,'spento'],[/\ballumé\b/gi,'acceso']
    ];
    for(const [rx,val] of replacements)s=s.replace(rx,val);return s;
  }
  async runAction(action,targetId,context={},button=null){
    const target=document.getElementById(targetId);if(!target)return;const text=String(target.value||'').trim();if(!text){this.toast('Ajoutez ou dictez d’abord un texte.');return;}
    const old=button?.textContent;if(button){button.disabled=true;button.textContent='…';}
    try{
      if(!this.aiReady){
        if(action==='rewrite_fr'){
          target.dataset.rawText=target.dataset.rawText||text;target.value=this.localFrenchCleanup(text);target.dispatchEvent(new Event('input',{bubbles:true}));
          this.toast('Mise au propre locale appliquée. La rédaction IA complète sera disponible dès que le service sécurisé OPUS sera connecté.');
        }else if(action==='translate_it'){
          this.showTranslation(text,this.localItalianHelp(text));
          this.toast('Traduction locale de secours. La traduction IA complète sera disponible avec le service sécurisé OPUS.');
        }
        return;
      }
      const data=await this.request(action,text,context);
      if(!target.isConnected||target.value.trim()!==text){this.toast('Le texte a changé pendant la rédaction. Relancez la correction.');return;}
      if(action==='translate_it')this.showTranslation(text,data.text);else{target.dataset.rawText=target.dataset.rawText||text;target.value=data.text;target.dispatchEvent(new Event('input',{bubbles:true}));this.toast('Proposition française générée. Vérifiez puis validez.');}
    }catch(e){console.error(e);this.toast(e.name==='AbortError'?'Le service IA met trop de temps à répondre.':(e.message||'Assistant IA indisponible.'));}
    finally{if(button){button.disabled=false;button.textContent=old;}}
  }
  async request(action,text,context={}){
    if(!this.aiReady)throw new Error('Service IA non configuré.');
    if(!this.getToken)throw new Error('Connectez-vous à Microsoft. IA indisponible en démonstration.');
    const endpoint=new URL(this.endpoint,location.href);
    if(endpoint.origin!==location.origin)throw new Error('Le service IA doit être hébergé avec l’application.');
    const token=await this.getToken();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.config.aiTimeoutMs||65000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,text,context}),signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`Service IA indisponible (${response.status}).`);
      if(typeof data.text!=='string'||!data.text.trim())throw new Error('Réponse IA vide.');
      return data;
    }finally{clearTimeout(timer);}
  }
  showTranslation(original,translation){
    let box=document.getElementById('opusTranslationBox');if(!box){box=document.createElement('div');box.id='opusTranslationBox';box.className='translationPopover';document.body.appendChild(box);}box.innerHTML=`<div class="translationHead"><strong>🇮🇹 Traduzione</strong><button type="button" aria-label="Fermer">×</button></div><div class="translationText">${this.escape(translation)}</div><details><summary>Texte français</summary><div>${this.escape(original)}</div></details>`;box.querySelector('button').onclick=()=>box.remove();
  }
  escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
}
