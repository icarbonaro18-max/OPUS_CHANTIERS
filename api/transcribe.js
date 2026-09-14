export function createTranscribeHandler({env=process.env,fetcher=globalThis.fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');const fail=(n,error)=>res.status(n).json({error});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'Méthode non autorisée.');}
  const allowed=(env.OPUS_AI_ALLOWED_USERS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if(!env.OPENAI_API_KEY||!allowed.length)return fail(503,'Dictée IA non configurée.');
  const auth=req.headers.authorization;if(!auth?.startsWith('Bearer ')||auth.length>16000)return fail(401,'Connectez-vous à Microsoft.');
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return fail(400,'Requête invalide.');}
  const formats={'audio/webm':'webm','audio/mp4':'mp4','audio/wav':'wav','audio/mpeg':'mp3'};
  if(!body||!formats[body.mime]||typeof body.audio!=='string'||!body.audio.length||body.audio.length>3500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio))return fail(400,'Audio invalide ou trop long : dictez moins de deux minutes.');
  const bytes=Buffer.from(body.audio,'base64');if(!bytes.length||bytes.length>2500000)return fail(413,'Audio trop volumineux.');
  try{
   const identity=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName',{headers:{Authorization:auth},signal:AbortSignal.timeout(10000)});
   if(!identity.ok)return fail(401,'Connexion Microsoft expirée.');const user=await identity.json();
   if(![user.id,user.userPrincipalName].some(v=>v&&allowed.includes(v.toLowerCase())))return fail(403,'Votre compte n’est pas autorisé à utiliser la dictée IA.');
   const form=new FormData();form.append('file',new Blob([bytes],{type:body.mime}),'dictee.'+formats[body.mime]);form.append('model',env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe');form.append('response_format','json');
   // Do not set language: one recording may contain both French and Italian.
   form.append('prompt','Notes de terrain en français et italien, parfois mélangés dans une phrase. Transcrire fidèlement les mots prononcés, sans ajouter de constat ni de travaux. Vocabulaire : disjoncteur, magnetotermico, interruttore differenziale, salvavita, tableau électrique, quadro elettrico, prises, prese.');
   const r=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(45000)});
   if(!r.ok)return fail(r.status===429?429:502,[403,404].includes(r.status)?'Modèle audio inaccessible : autorisez gpt-4o-mini-transcribe dans le projet OpenAI utilisé par la clé.':r.status===401?'Clé OpenAI refusée pour la dictée.':'Transcription indisponible. Réessayez.');
   const result=await r.json();if(typeof result.text!=='string'||!result.text.trim())return fail(422,'Aucune parole reconnue.');return res.status(200).json({text:result.text.trim()});
  }catch{return fail(502,'Transcription interrompue ou délai dépassé.');}
 };
}
export default createTranscribeHandler();
