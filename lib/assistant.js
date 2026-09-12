export class OpusAssistant {
  constructor(config={},hooks={}){
    this.config=config||{};
    this.toast=hooks.toast||(()=>{});
    this.activeRecognition=null;
    this.activeButton=null;
  }
  get endpoint(){return String(this.config.aiEndpoint||this.config.ai?.endpoint||'').trim();}
  get aiReady(){return !!this.endpoint;}
  dictationLang(){return localStorage.getItem('opus-dictation-lang')||'it-IT';}
  setDictationLang(lang){localStorage.setItem('opus-dictation-lang',lang||'it-IT');}
  languageSelectHtml(){const lang=this.dictationLang();return `<label class="dictationLang">Dictée <select data-opus-dictation-lang><option value="it-IT" ${lang==='it-IT'?'selected':''}>Italiano</option><option value="fr-FR" ${lang==='fr-FR'?'selected':''}>Français</option></select></label>`;}
  toolsHtml(targetId,{translate=true,rewrite=true}={}){
    return `<div class="fieldTools" data-tools-for="${targetId}"><button type="button" class="voiceBtn" data-voice-target="${targetId}">🎙 Dicter</button>${rewrite?`<button type="button" class="aiBtn" data-ai-action="rewrite_fr" data-ai-target="${targetId}">✨ Français propre</button>`:''}${translate?`<button type="button" class="aiBtn secondary" data-ai-action="translate_it" data-ai-target="${targetId}">🇮🇹 Italiano</button>`:''}</div>`;
  }
  bind(root=document,contextProvider=()=>({})){
    root.querySelectorAll('[data-opus-dictation-lang]').forEach(sel=>{sel.value=this.dictationLang();sel.onchange=()=>this.setDictationLang(sel.value);});
    root.querySelectorAll('[data-voice-target]').forEach(btn=>btn.onclick=()=>this.toggleDictation(btn.dataset.voiceTarget,btn));
    root.querySelectorAll('[data-ai-action]').forEach(btn=>btn.onclick=()=>this.runAction(btn.dataset.aiAction,btn.dataset.aiTarget,contextProvider(),btn));
  }
  toggleDictation(targetId,button){
    if(this.activeRecognition){this.stopDictation();return;}
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){this.toast('Dictée vocale non disponible dans ce navigateur. Utilisez le micro du clavier Android.');return;}
    const target=document.getElementById(targetId);if(!target)return;
    const rec=new Recognition();this.activeRecognition=rec;this.activeButton=button;
    rec.lang=this.dictationLang();rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
    const startText=target.value.trim();let finalText='';
    rec.onstart=()=>{button.textContent='⏹ Arrêter';button.classList.add('recording');this.toast(rec.lang.startsWith('it')?'Dictée italienne active…':'Dictée française active…');};
    rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=(finalText?' ':'')+t.trim();else interim+=t;}target.value=[startText,finalText,interim].filter(Boolean).join(startText||finalText?' ':'').trim();target.dispatchEvent(new Event('input',{bubbles:true}));};
    rec.onerror=e=>{console.warn('Dictation error',e);if(e.error!=='aborted')this.toast('La dictée vocale a été interrompue. Vous pouvez utiliser le micro du clavier.');this.stopDictation(false);};
    rec.onend=()=>this.stopDictation(false);
    try{rec.start();}catch(e){this.stopDictation(false);this.toast('Impossible de démarrer la dictée. Réessayez ou utilisez le micro du clavier.');}
  }
  stopDictation(stopRecognition=true){
    const rec=this.activeRecognition,btn=this.activeButton;this.activeRecognition=null;this.activeButton=null;
    if(stopRecognition&&rec){try{rec.stop();}catch{}}
    if(btn){btn.textContent='🎙 Dicter';btn.classList.remove('recording');}
  }
  async runAction(action,targetId,context={},button=null){
    const target=document.getElementById(targetId);if(!target)return;const text=String(target.value||'').trim();if(!text){this.toast('Ajoutez ou dictez d’abord un texte.');return;}
    if(!this.aiReady){this.toast('Assistant IA prêt dans OPUS, mais le service sécurisé n’est pas encore activé. Le texte brut reste conservé.');return;}
    const old=button?.textContent;if(button){button.disabled=true;button.textContent='…';}
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Number(this.config.aiTimeoutMs||this.config.ai?.timeoutMs||30000));
      const response=await fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,text,context,outputLanguage:action==='translate_it'?'it':'fr'}),signal:controller.signal});clearTimeout(timer);
      if(!response.ok)throw new Error(`Service IA indisponible (${response.status})`);const data=await response.json();if(!data?.text)throw new Error('Réponse IA vide.');
      if(action==='translate_it')this.showTranslation(text,data.text);else{target.dataset.rawText=target.dataset.rawText||text;target.value=data.text;target.dispatchEvent(new Event('input',{bubbles:true}));this.toast('Proposition française générée. Vérifiez puis validez.');}
    }catch(e){console.error(e);this.toast(e.name==='AbortError'?'Le service IA met trop de temps à répondre.':(e.message||'Assistant IA indisponible.'));}
    finally{if(button){button.disabled=false;button.textContent=old;}}
  }
  showTranslation(original,translation){
    let box=document.getElementById('opusTranslationBox');if(!box){box=document.createElement('div');box.id='opusTranslationBox';box.className='translationPopover';document.body.appendChild(box);}box.innerHTML=`<div class="translationHead"><strong>🇮🇹 Traduzione</strong><button type="button" aria-label="Fermer">×</button></div><div class="translationText">${this.escape(translation)}</div><details><summary>Texte français</summary><div>${this.escape(original)}</div></details>`;box.querySelector('button').onclick=()=>box.remove();
  }
  escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
}
