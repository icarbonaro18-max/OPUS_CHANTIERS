import {createHash,timingSafeEqual} from 'node:crypto';
import {readerPlanning} from '../lib/planning-reader.js';
const digest=s=>createHash('sha256').update(s).digest();
export function createHandler({env=process.env,fetcher=fetch,now=()=>new Date()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,error)=>res.status(status).json({error});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,'Lecture du planning uniquement.');}
  const code=env.PLANNING_ACCESS_CODE||'';
  if(!/^[a-zA-Z0-9_-]{32,128}$/.test(code)||!['PLANNING_TENANT_ID','PLANNING_CLIENT_ID','PLANNING_CLIENT_SECRET','PLANNING_DRIVE_ID'].every(k=>env[k]))return reply(503,'Le bureau doit activer l’accès au planning.');
  let body=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return reply(400,'Demande invalide.');}
  if(typeof body?.code!=='string'||body.code.length>128||!timingSafeEqual(digest(body.code),digest(code)))return reply(401,'Code incorrect ou remplacé. Demandez le nouveau lien au bureau.');
  const today=now().toISOString().slice(0,10),from=body.from||today;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!Number.isFinite(Date.parse(from))||new Date(from).toISOString().slice(0,10)!==from)return reply(400,'Date invalide.');
  const delta=(Date.parse(from)-Date.parse(today))/86400000;if(delta < -31||delta>180)return reply(400,'Choisissez une période entre le mois précédent et les six prochains mois.');
  const to=new Date(Date.parse(from)+6*86400000).toISOString().slice(0,10);
  try{
   const r=await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(env.PLANNING_TENANT_ID)}/oauth2/v2.0/token`,{method:'POST',body:new URLSearchParams({client_id:env.PLANNING_CLIENT_ID,client_secret:env.PLANNING_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('token');const token=(await r.json()).access_token;if(!token)throw Error('token');
   async function read(name){
    const meta=await fetcher(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(env.PLANNING_DRIVE_ID)}/root:/_OPUS_SYSTEM/${name}.json`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
    if(!meta.ok)throw Error('file');const item=await meta.json(),url=new URL(item['@microsoft.graph.downloadUrl']);
    if(url.protocol!=='https:'||!url.hostname.endsWith('.sharepoint.com')||Number(item.size)>5000000)throw Error('file');
    const data=await fetcher(url.href,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});if(!data.ok)throw Error('file');
    const text=await data.text();if(text.length>5000000)throw Error('file');const json=JSON.parse(text);if(!Array.isArray(json))throw Error('file');return json;
   }
   const [events,people]=await Promise.all([read('events'),read('people')]);
   return res.status(200).json({checkedAt:now().toISOString(),from,to,events:readerPlanning(events,people,from,to)});
  }catch{return reply(502,'Planning indisponible. Réessayez ou contactez le bureau.');}
 };
}
export default createHandler();
