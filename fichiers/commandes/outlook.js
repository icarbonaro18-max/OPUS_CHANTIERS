const EXPECTED='opuselec@hotmail.com';
const ROOT='https://graph.microsoft.com/v1.0/';
export const SUPPLIERS=['Rexel','Sonepar','YESSS','Difam','CDO','Sylvania','CLAREO','ElecDirect','Exertis','UGF','ARIC'];

const searchTerm=value=>String(value||'').replace(/[\"\\\r\n()]/g,' ').trim().replace(/\s+/g,' ');
export function buildMessageQuery({supplier='',query='',since='',until=''}={}){
 const date=value=>{if(!value)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Choisissez une date valide.');return value;};
 since=date(since);until=date(until);if(since&&until&&since>until)throw Error('La date de fin doit être après la date de début.');
 const q=searchTerm(query),f=searchTerm(supplier);if(q.length>250||f.length>100)throw Error('La recherche est trop longue.');
 const params=new URLSearchParams({'$select':'id,subject,from,receivedDateTime,bodyPreview,hasAttachments','$top':'50'});
 if(q||f){
  const terms=[];if(f)terms.push(...f.split(' ').map(word=>'from:'+word));if(q)terms.push(q);
  const us=value=>value.slice(5,7)+'/'+value.slice(8,10)+'/'+value.slice(0,4);
  if(since)terms.push('received>='+us(since));if(until)terms.push('received<='+us(until));
  params.set('$search',JSON.stringify(terms.join(' AND ')));
 }else{
  const filters=[];if(since)filters.push('receivedDateTime ge '+since+'T00:00:00Z');
  if(until){const after=new Date(until+'T00:00:00Z');after.setUTCDate(after.getUTCDate()+1);filters.push('receivedDateTime lt '+after.toISOString());}
  params.set('$orderby','receivedDateTime desc');if(filters.length)params.set('$filter',filters.join(' and '));
 }
 return 'me/messages?'+params;
}
export function supplierOf(m){const s=[m.from?.emailAddress?.address,m.from?.emailAddress?.name,m.subject].join(' ').toLowerCase();return SUPPLIERS.find(x=>x==='CDO'?/\bcdo\b/.test(s):s.includes(x.toLowerCase()))||(/yes{2,}/.test(s)?'YESSS':'Autres');}
export function graphUrl(path){const u=new URL(path,ROOT);if(u.origin!=='https://graph.microsoft.com'||!/^\/v1\.0\/me(?:\/|$)/.test(u.pathname))throw Error('Adresse Outlook non autorisée.');return u.href;}
export function createMailbox(getToken,request=fetch){return async path=>{const r=await request(graphUrl(path),{headers:{Authorization:'Bearer '+await getToken(),Prefer:'outlook.body-content-type="text", IdType="ImmutableId"'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(r.status===401?'Reconnectez votre boîte Outlook.':r.status===403?'La lecture des e-mails doit être autorisée dans Microsoft (Mail.Read).':r.status===400?'La recherche Outlook n’a pas abouti. Essayez un nom ou une référence plus simple.':r.status===429?'Outlook reçoit trop de demandes. Réessayez dans quelques instants.':'Lecture Outlook impossible (HTTP '+r.status+').');return r.json();};}
export function messageText(m,doc=document){let text=m.body?.content||m.bodyPreview||'';if(m.body?.contentType?.toLowerCase()==='html'){const d=doc.implementation.createHTMLDocument('');d.body.innerHTML=text;d.querySelectorAll('script,style,iframe,object,img,link').forEach(x=>x.remove());d.querySelectorAll('br,p,div,tr,li').forEach(x=>x.append('\n'));text=d.body.textContent;}return `De : ${m.from?.emailAddress?.address||''}\nObjet : ${m.subject||''}\nDate : ${m.receivedDateTime||''}\n\n${text}`;}
export function mountOutlook({host,onImport,authorize,download,purpose='order',onAttachment,onSelect}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 host.className='card';host.hidden=true;host.innerHTML='<h2>Rechercher dans mes e-mails</h2><p>Boîte : opuselec@hotmail.com. Recherchez un fournisseur, une adresse e-mail ou une référence dans l’expéditeur, l’objet et le contenu des messages.</p><details id="mailSetup"><summary>Activer la connexion Outlook (première utilisation)</summary><p>Suivez le guide ACTIVATION_OUTLOOK_V14.txt, puis collez ici l’identifiant d’application (client). Ce n’est pas une clé secrète.</p><input id="mailClient" aria-label="Identifiant d’application Outlook"><button id="mailConfig">Enregistrer la configuration</button></details><div class="actions"><button id="mailConnect">Connecter ma boîte Outlook</button><button id="mailDisconnect" class="secondary">Déconnecter Outlook</button></div><p id="mailStatus" role="status"></p><div class="grid"><label>Depuis le (facultatif)<input id="mailSince" type="date"></label><label>Jusqu’au (facultatif)<input id="mailUntil" type="date"></label><label>Fournisseur<select id="mailSupplier"><option value="">Tous les expéditeurs</option></select></label><label>Rechercher dans ma boîte mail<input id="mailSearch" type="search" placeholder="Difam, CDO, fournisseur, référence, chantier…"></label></div><button id="mailRefresh">Rechercher les e-mails</button><p id="mailCount"></p><div id="mailList"></div><button id="mailMore" class="secondary" hidden>Charger les messages suivants</button><section id="mailPreview" hidden><h3 id="mailSubject"></h3><pre id="mailBody" style="white-space:pre-wrap;max-height:350px;overflow:auto"></pre><div id="mailAttachments"></div><p>Seul ce message sera repris. Cliquez ensuite sur « Lire la commande » pour transmettre son contenu à l’IA.</p><button id="mailUse">Utiliser cet e-mail pour le bon</button></section>';
 const $=id=>host.querySelector('#'+id);for(const s of SUPPLIERS){const o=el('option',s);o.value=s;$('mailSupplier').append(o);}
 if(purpose==='service'){host.querySelector('h2').textContent='Importer un ordre de service depuis Outlook';$('mailSupplier').closest('label').hidden=true;$('mailSearch').placeholder='Syndic, résidence, ordre de service…';$('mailUse').textContent='Préparer la demande depuis cet e-mail';$('mailPreview').querySelector('p').textContent='Choisissez les pièces jointes utiles, puis préparez la demande. Le contenu sélectionné sera transmis à l’IA pour préremplir une fiche à vérifier.';}
 const key='opus-outlook-client-id';$('mailClient').value=localStorage.getItem(key)||'';
 let client,account,mailbox,next='',rows=[],selected,busy=false;
 const status=t=>$('mailStatus').textContent=t;
 async function run(fn){if(busy)return;busy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status(e.message||'Connexion Outlook impossible.');}finally{busy=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 function clear(){account=null;mailbox=null;rows=[];selected=null;next='';$('mailList').replaceChildren();$('mailPreview').hidden=true;$('mailBody').textContent='';$('mailAttachments').replaceChildren();$('mailMore').hidden=true;$('mailCount').textContent='';}
 async function setup(){const id=$('mailClient').value.trim();if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))throw Error('Renseignez l’identifiant d’application Microsoft en suivant le guide V14.');const M=await import('../vendor/msal.js');client=new M.PublicClientApplication({auth:{clientId:id,authority:'https://login.microsoftonline.com/consumers',redirectUri:new URL('./outlook-auth.html',import.meta.url).href},cache:{cacheLocation:'memoryStorage'}});await client.initialize();localStorage.setItem(key,id);}
 $('mailConfig').onclick=()=>run(async()=>{clear();await setup();status('Configuration enregistrée. Cliquez sur Connecter ma boîte Outlook.');});
 $('mailConnect').onclick=()=>run(async()=>{await authorize();clear();if(!client)await setup();const r=await client.loginPopup({scopes:['User.Read','Mail.Read'],loginHint:EXPECTED,prompt:'select_account'});account=r.account;const api=createMailbox(async()=>{if(!account)throw Error('Connectez votre boîte Outlook.');try{return(await client.acquireTokenSilent({scopes:['User.Read','Mail.Read'],account})).accessToken;}catch{throw Error('Session Outlook expirée. Cliquez sur Connecter ma boîte Outlook.');}});const me=await api('me?$select=mail,userPrincipalName');if(![me.mail,me.userPrincipalName,account?.username].some(v=>String(v||'').toLowerCase()===EXPECTED)){clear();await client.clearCache();throw Error('Choisissez le compte '+EXPECTED+'.');}mailbox=api;status('Boîte connectée. Cliquez sur Rechercher les e-mails.');});
 $('mailDisconnect').onclick=()=>run(async()=>{clear();await client?.clearCache();status('Outlook déconnecté de cette fenêtre.');});
 function render(){
 $('mailList').replaceChildren();
 for(const m of rows){const b=el('button',`${supplierOf(m)} · ${new Date(m.receivedDateTime).toLocaleDateString('fr-FR')} · ${m.subject||'(Sans objet)'} — ${m.from?.emailAddress?.address||''}`);b.className='secondary';b.style.cssText='display:block;width:100%;text-align:left;margin:6px 0';b.onclick=()=>run(()=>open(m));$('mailList').append(b);}
 $('mailCount').textContent=rows.length?`${rows.length} message(s) trouvé(s) et chargé(s).`+(next?' D’autres résultats sont disponibles ci-dessous.':rows.length>=1000?' Affinez les dates ou la recherche pour retrouver d’autres messages.':''):'Aucun message trouvé. Vérifiez le nom du fournisseur et les dates.';
 $('mailMore').hidden=!next;
 }
 async function page(path){if(!mailbox)throw Error('Connectez votre boîte Outlook.');const d=await mailbox(path);const seen=new Set(rows.map(x=>x.id));rows.push(...(d.value||[]).filter(x=>!seen.has(x.id)));next=d['@odata.nextLink']||'';render();status('E-mails chargés. Choisissez un message.');}
 async function search(){
  if(!mailbox)throw Error('Connectez votre boîte Outlook.');
  const path=buildMessageQuery({supplier:$('mailSupplier').value,query:$('mailSearch').value,since:$('mailSince').value,until:$('mailUntil').value});
  rows=[];next='';selected=null;$('mailList').replaceChildren();$('mailCount').textContent='Recherche dans votre boîte mail…';$('mailMore').hidden=true;$('mailPreview').hidden=true;
  status('Recherche Outlook en cours…');await page(path);
 }
 $('mailRefresh').onclick=()=>run(search);
 $('mailMore').onclick=()=>run(()=>page(next));
 $('mailSupplier').onchange=()=>run(search);
 $('mailSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void run(search);}};
 for(const id of ['mailSearch','mailSince','mailUntil'])$(id).oninput=()=>status('Recherche modifiée. Cliquez sur Rechercher les e-mails ou appuyez sur Entrée.');

 async function open(m){onSelect?.();selected=null;$('mailPreview').hidden=true;const full=await mailbox('me/messages/'+encodeURIComponent(m.id)+'?$select=id,subject,from,receivedDateTime,body,hasAttachments');selected=full;$('mailSubject').textContent=full.subject||'(Sans objet)';$('mailBody').textContent=messageText(full);$('mailAttachments').replaceChildren();if(full.hasAttachments){const note=el('p',purpose==='service'?'Ajoutez les ordres de service utiles à l’analyse.':'Pièces jointes : téléchargez le document utile puis ajoutez-le dans « Captures, photos ou PDF » du bon.');$('mailAttachments').append(note);let path='me/messages/'+encodeURIComponent(m.id)+'/attachments?$select=id,name,size,contentType,isInline';do{const d=await mailbox(path);for(const a of d.value||[]){if(a.isInline)continue;const b=el('button',a.name+(purpose==='service'?' — Ajouter à la demande':' — Télécharger'));b.className='secondary';b.onclick=()=>run(async()=>{if(a.size>20000000)throw Error('Pièce jointe supérieure à 20 Mo : ouvrez-la dans Outlook.');const f=await mailbox('me/messages/'+encodeURIComponent(m.id)+'/attachments/'+encodeURIComponent(a.id));if(!f.contentBytes)throw Error('Cette pièce jointe doit être ouverte dans Outlook.');const data=Uint8Array.from(atob(f.contentBytes),c=>c.charCodeAt(0));const blob=new Blob([data],{type:f.contentType||'application/octet-stream'});if(purpose==='service'&&onAttachment){await onAttachment(new File([blob],f.name,{type:blob.type}));status('Pièce ajoutée à la demande : '+f.name);}else download(blob,f.name);});$('mailAttachments').append(b);}path=d['@odata.nextLink']||'';}while(path);}$('mailPreview').hidden=false;}
 $('mailUse').onclick=()=>run(async()=>{if(!selected)throw Error('Sélectionnez un e-mail.');await authorize();if(purpose==='service'||confirm('Reprendre cet e-mail et vider les anciennes sources du bon ?')){await onImport(messageText(selected),selected);host.hidden=true;}});
 return {show(force){host.hidden=typeof force==='boolean'?!force:!host.hidden;},};
}
